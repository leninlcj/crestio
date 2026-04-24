import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

// Shared voice-capture button. Handles MediaRecorder lifecycle, the timer,
// the 5-minute auto-stop, and the upload to /api/voice/transcribe.
//
// Caller passes a callback to receive the transcript. Context determines
// per-clip cap (session_note: 5 min, assistant_command: 60 s).

type Context = 'session_note' | 'assistant_command';

type Props = {
  context: Context;
  maxSeconds?: number;                     // default 300 for notes, 60 for commands
  onTranscript: (text: string, seconds: number) => void;
  onError?: (message: string) => void;
  onUsageUpdate?: (usage: UsageSnapshot) => void;
  size?: 'sm' | 'md' | 'lg';               // 40/48/64 px
  label?: string;
  className?: string;
  disabled?: boolean;
};

export type UsageSnapshot = {
  count_today: number;
  max_count: number;
  seconds_today: number;
  max_seconds: number;
};

const SIZE_PX: Record<NonNullable<Props['size']>, number> = { sm: 40, md: 48, lg: 64 };

export function VoiceRecorder({
  context,
  maxSeconds,
  onTranscript,
  onError,
  onUsageUpdate,
  size = 'md',
  label,
  className,
  disabled,
}: Props) {
  const cap = maxSeconds ?? (context === 'assistant_command' ? 60 : 300);
  const [state, setState] = useState<'idle' | 'requesting' | 'recording' | 'uploading' | 'cooldown'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [errorFlash, setErrorFlash] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount.
      stopStreamTracks();
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  function stopStreamTracks() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function flashError(msg: string) {
    setErrorFlash(msg);
    onError?.(msg);
    setTimeout(() => setErrorFlash(null), 4000);
  }

  async function start() {
    if (disabled || state !== 'idle') return;
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mime = pickSupportedMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => { void handleStop(); };
      rec.start();
      startedAtRef.current = Date.now();
      setElapsed(0);
      setState('recording');
      tickRef.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsed(seconds);
        if (seconds >= cap) {
          flashError(`Max clip length reached (${Math.round(cap / 60 * 10) / 10} min).`);
          stop();
        }
      }, 250);
    } catch (e: any) {
      stopStreamTracks();
      setState('idle');
      flashError(
        e?.name === 'NotAllowedError'
          ? 'Microphone access denied. Enable it in your browser settings.'
          : 'Could not access the microphone.',
      );
    }
  }

  function stop() {
    if (state !== 'recording') return;
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
  }

  async function handleStop() {
    stopStreamTracks();
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'audio/webm' });
    chunksRef.current = [];
    const durationSeconds = Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000));
    if (blob.size === 0) {
      setState('idle');
      flashError('Nothing recorded.');
      return;
    }
    setState('uploading');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { flashError('Not signed in.'); setState('idle'); return; }
      const res = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': blob.type,
          'X-Voice-Context': context,
          'X-Audio-Seconds': String(durationSeconds),
          Authorization: `Bearer ${session.access_token}`,
        },
        body: blob,
      });
      const payload = await res.json().catch(() => ({} as any));
      if (res.status === 429) {
        const resetAt = 'midnight Sydney time';
        flashError(`You've reached today's voice limit. Resets at ${resetAt}.`);
        setState('cooldown');
        setTimeout(() => setState('idle'), 1500);
        return;
      }
      // Server-side voice outages: 503 with a voice_* code. Mask the code
      // and show one friendly message for any of the three variants.
      if (res.status === 503 && typeof payload?.error === 'string' && payload.error.startsWith('voice_')) {
        flashError("Voice isn't available right now. Try again in a moment, or type your notes.");
        setState('idle');
        return;
      }
      if (!res.ok) {
        // Input errors (400/413/401) — show a shorter generic fallback.
        flashError(typeof payload?.error === 'string' && !payload.error.startsWith('voice_')
          ? payload.error
          : 'Transcription failed. Try again.');
        setState('idle');
        return;
      }
      if (payload?.usage) onUsageUpdate?.(payload.usage);
      if (typeof payload?.transcript === 'string' && payload.transcript.trim()) {
        onTranscript(payload.transcript.trim(), payload.audio_seconds ?? durationSeconds);
      } else {
        flashError('Empty transcript.');
      }
    } catch (e: any) {
      flashError(e?.message ?? 'Upload failed.');
    } finally {
      setState('idle');
    }
  }

  const diameter = SIZE_PX[size];
  const busy = state === 'uploading' || state === 'requesting';
  const recording = state === 'recording';

  return (
    <div className={['inline-flex flex-col items-center gap-1', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={disabled || busy}
        aria-label={recording ? 'Stop recording' : 'Start voice recording'}
        aria-pressed={recording}
        className={[
          'rounded-full grid place-items-center transition-colors shadow-card',
          recording ? 'bg-claret text-cream voice-pulse' : 'bg-forest text-cream hover:bg-forest-ink',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
        style={{ width: diameter, height: diameter }}
      >
        {busy ? (
          <svg className="animate-spin" width={diameter * 0.4} height={diameter * 0.4} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : recording ? (
          <svg width={diameter * 0.34} height={diameter * 0.34} viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
          </svg>
        ) : (
          <svg width={diameter * 0.44} height={diameter * 0.44} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <path d="M12 18v3" />
          </svg>
        )}
      </button>
      <div className="text-2xs text-ink-soft min-h-[14px]">
        {recording ? formatTimer(elapsed) :
         state === 'uploading' ? 'Transcribing…' :
         state === 'requesting' ? 'Asking mic…' :
         label ? label :
         'Tap to record'}
      </div>
      {errorFlash && (
        <div className="text-2xs text-claret text-center max-w-[180px]">{errorFlash}</div>
      )}

      <style jsx>{`
        @keyframes voice-pulse-kf {
          0%, 100% { box-shadow: 0 0 0 0 rgba(122, 34, 51, 0.55); }
          50%      { box-shadow: 0 0 0 10px rgba(122, 34, 51, 0); }
        }
        .voice-pulse { animation: voice-pulse-kf 1.2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Pick the first MediaRecorder-supported MIME from a preference list.
// Chrome/Firefox: audio/webm;codecs=opus works. Safari: audio/mp4.
function pickSupportedMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/mpeg',
  ];
  for (const mime of candidates) {
    try { if (MediaRecorder.isTypeSupported(mime)) return mime; } catch { /* ignore */ }
  }
  return null;
}

export default VoiceRecorder;
