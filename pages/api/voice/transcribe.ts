import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import {
  MAX_CLIP_SECONDS, MAX_CLIP_BYTES,
  capsForPlan, getUsageForToday, recordUsage,
  transcribeWithWhisper, costCentsForSeconds,
} from '../../../lib/voice';

// POST /api/voice/transcribe
// Body: raw audio bytes. Content-Type should be the recording's MIME (webm/mp4/etc).
// Headers:
//   - Authorization: Bearer <supabase-token>
//   - X-Voice-Context: 'session_note' | 'assistant_command'
//   - X-Audio-Seconds: integer (client-measured duration, server re-checks against Whisper)
// Returns: { transcript, audio_seconds, usage: {count_today, max_count, seconds_today, max_seconds} }

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '30mb', // Whisper hard cap is 25MB; leave headroom
  },
};

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (c: Buffer) => {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      total += c.length;
      if (total > MAX_CLIP_BYTES) {
        reject(new Error('Audio too large (max 25MB).'));
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey || openaiKey.trim().length === 0) {
    return res.status(503).json({ error: 'voice_not_configured' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  const context = String(req.headers['x-voice-context'] ?? '').toLowerCase();
  if (context !== 'session_note' && context !== 'assistant_command') {
    return res.status(400).json({ error: 'Invalid X-Voice-Context header.' });
  }

  const clientSeconds = Number(req.headers['x-audio-seconds'] ?? 0);
  if (!Number.isFinite(clientSeconds) || clientSeconds <= 0) {
    return res.status(400).json({ error: 'X-Audio-Seconds header required.' });
  }
  if (clientSeconds > MAX_CLIP_SECONDS) {
    return res.status(400).json({ error: `Clip too long (max ${MAX_CLIP_SECONDS / 60} minutes).` });
  }

  const mimeType = String(req.headers['content-type'] ?? 'audio/webm');

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Fetch plan for caps.
  const { data: org } = await admin
    .from('organizations').select('plan_tier').eq('id', membership.organization_id).maybeSingle();
  const caps = capsForPlan(org?.plan_tier ?? 'solo');

  // Cap check BEFORE calling Whisper (no point paying if we'll reject).
  const usage = await getUsageForToday(admin, userId);
  if (usage.transcription_count >= caps.dailyTranscriptions) {
    return res.status(429).json({
      error: 'voice_limit_exceeded',
      reason: 'daily_count',
      retry_after: 'midnight_sydney',
      current_count: usage.transcription_count,
      max_count: caps.dailyTranscriptions,
      current_seconds: usage.audio_seconds_total,
      max_seconds: caps.dailyAudioSeconds,
    });
  }
  if (usage.audio_seconds_total + clientSeconds > caps.dailyAudioSeconds) {
    return res.status(429).json({
      error: 'voice_limit_exceeded',
      reason: 'daily_seconds',
      retry_after: 'midnight_sydney',
      current_count: usage.transcription_count,
      max_count: caps.dailyTranscriptions,
      current_seconds: usage.audio_seconds_total,
      max_seconds: caps.dailyAudioSeconds,
    });
  }

  // Read the audio bytes.
  let audioBytes: Buffer;
  try {
    audioBytes = await readRawBody(req);
  } catch (e: any) {
    return res.status(413).json({ error: e?.message ?? 'Audio too large.' });
  }
  if (audioBytes.length === 0) return res.status(400).json({ error: 'Empty audio body.' });

  // Pick a filename from the MIME to help Whisper's format detection.
  const ext = mimeType.includes('mp4') ? 'm4a'
    : mimeType.includes('mp3') || mimeType.includes('mpeg') ? 'mp3'
    : mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('wav') ? 'wav'
    : 'webm';
  const audio = new Blob([audioBytes], { type: mimeType });

  const result = await transcribeWithWhisper({
    apiKey: openaiKey,
    audio,
    filename: `clip.${ext}`,
    mimeType,
    language: 'en',
  });
  if (!result.ok) {
    // Log the real error server-side, return a code-only response to the client.
    console.error('[voice/transcribe] whisper failed', result);
    const upstream = result.status ?? 0;
    let code: 'voice_not_configured' | 'voice_rate_limited' | 'voice_unavailable';
    if (upstream === 401 || upstream === 403) code = 'voice_not_configured';
    else if (upstream === 429) code = 'voice_rate_limited';
    else code = 'voice_unavailable';
    return res.status(503).json({ error: code });
  }

  const authoritativeSeconds = result.durationSeconds ?? clientSeconds;
  const costCents = costCentsForSeconds(authoritativeSeconds);

  // Log + record usage. Non-fatal — don't reject the transcript on a ledger hiccup.
  try {
    await admin.from('voice_transcriptions').insert({
      user_id: userId,
      organization_id: membership.organization_id,
      context,
      audio_seconds: authoritativeSeconds,
      transcript: result.text,
    });
    await recordUsage(admin, { userId, audioSeconds: authoritativeSeconds, costCents });
  } catch (e) {
    console.error('[voice/transcribe] usage-ledger write failed', e);
  }

  return res.status(200).json({
    transcript: result.text,
    audio_seconds: authoritativeSeconds,
    usage: {
      count_today: usage.transcription_count + 1,
      max_count: caps.dailyTranscriptions,
      seconds_today: usage.audio_seconds_total + authoritativeSeconds,
      max_seconds: caps.dailyAudioSeconds,
    },
  });
}
