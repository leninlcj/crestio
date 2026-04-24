import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { UrgencyPill } from './UrgencyPill';
import type { Message, ThreadDetail, Viewer } from './types';

// Thread detail view — scroll-to-bottom on initial load, composer docks at
// the bottom, Enter sends + Shift+Enter newline.

const DRAFT_KEY_PREFIX = 'crestio.message.draft.';
const MAX_CHARS = 5000;
const URGENT_SUBJECT_HIGHLIGHT = 4500;

type Props = {
  threadId: string;
  backHref: string;
  studentHref?: string; // tutor: /app/students/[id], parent: /parent/student/[id]
};

export function ThreadView({ threadId, backHref, studentHref }: Props) {
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState('');
  const [urgency, setUrgency] = useState<'urgent' | 'normal' | 'info'>('normal');
  const [sending, setSending] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const draftKey = `${DRAFT_KEY_PREFIX}${threadId}`;

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Not signed in.'); return; }
      const res = await fetch(`/api/messages/threads/${threadId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { setError('Could not load thread.'); return; }
      const payload = await res.json();
      setThread(payload.thread);
      setMessages(payload.messages);
      setViewer(payload.viewer);
      setError(null);
    } finally { setLoading(false); }
  }, [threadId]);

  useEffect(() => { load(); }, [load]);

  // Poll for new messages every 20s while the tab is focused.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    function start() {
      if (interval) return;
      interval = setInterval(() => { load(); }, 20_000);
    }
    function stop() {
      if (interval) { clearInterval(interval); interval = null; }
    }
    function onVis() {
      if (document.visibilityState === 'visible') start();
      else stop();
    }
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', start);
    window.addEventListener('blur', stop);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', start);
      window.removeEventListener('blur', stop);
    };
  }, [load]);

  // Scroll to bottom when messages change.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  // Restore composer draft.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setComposerValue(raw);
    } catch { /* ignore */ }
  }, [draftKey]);

  // Persist draft (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (composerValue) localStorage.setItem(draftKey, composerValue);
        else localStorage.removeItem(draftKey);
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [composerValue, draftKey]);

  async function send() {
    const text = composerValue.trim();
    if (!text || sending || !thread) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Not signed in.'); return; }
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          student_id: thread.student_id,
          parent_id: thread.parent_id,
          body: text,
          urgency: viewer === 'tutor' && urgency !== 'normal' ? urgency : null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error ?? 'Could not send.');
        return;
      }
      setComposerValue('');
      setUrgency('normal');
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      // Optimistically append, then reload to get the authoritative state.
      if (payload?.message) setMessages((prev) => [...prev, payload.message as Message]);
      setTimeout(() => { load(); }, 150);
    } finally { setSending(false); }
  }

  async function archive(makeArchived: boolean) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(`/api/messages/threads/${threadId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ archived: makeArchived }),
      });
      setShowArchiveConfirm(false);
      await load();
    } catch { /* ignore */ }
  }

  async function softDelete(messageId: string) {
    if (!window.confirm('Delete this message? Only you can delete within 5 minutes of sending.')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ delete: true }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        alert(p?.error ?? 'Could not delete.');
        return;
      }
      await load();
    } catch { /* ignore */ }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  }

  if (loading) return <div className="card p-6 text-sm text-ink-muted">Loading…</div>;
  if (error || !thread) return <div className="card p-6 text-sm text-claret">{error ?? 'Thread not found.'}</div>;

  const otherName = viewer === 'tutor'
    ? (thread.parent_name ?? 'Parent')
    : (thread.tutor_name ?? 'Your tutor');

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] md:h-[calc(100vh-200px)] max-w-3xl">
      {/* Header */}
      <div className="shrink-0 border border-rule rounded-t bg-surface px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xs uppercase tracking-widest text-ink-soft">
            {viewer === 'tutor' ? 'Messages about' : 'Your messages about'}
          </div>
          <div className="text-sm font-medium text-ink truncate">
            {studentHref ? (
              <Link href={studentHref} className="hover:text-forest underline-offset-2 hover:underline">
                {thread.student_name}
              </Link>
            ) : thread.student_name}
            <span className="text-ink-muted"> · with {otherName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={backHref} className="btn-ghost text-xs">← Back</Link>
          {viewer === 'tutor' && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowArchiveConfirm((v) => !v)}
                className="btn-ghost text-xs"
                aria-label="Thread options"
              >⋯</button>
              {showArchiveConfirm && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-rule rounded shadow-lift py-1 z-10">
                  {thread.archived ? (
                    <button type="button" onClick={() => archive(false)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-ruleSoft">
                      Unarchive
                    </button>
                  ) : (
                    <button type="button" onClick={() => archive(true)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-ruleSoft">
                      Archive thread
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto border-l border-r border-rule bg-cream px-4 py-4 space-y-3 min-h-0"
      >
        {messages.length === 0 ? (
          <div className="text-sm text-ink-muted text-center py-8">
            No messages yet. Send the first one below.
          </div>
        ) : messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            viewer={viewer!}
            onDelete={() => softDelete(m.id)}
          />
        ))}
      </div>

      {/* Composer */}
      <div className="shrink-0 border border-rule rounded-b bg-surface px-3 py-3">
        <textarea
          ref={composerRef}
          rows={Math.min(6, Math.max(2, composerValue.split('\n').length))}
          value={composerValue}
          onChange={(e) => setComposerValue(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={onKeyDown}
          placeholder="Write a message…"
          className="input w-full text-sm resize-none"
          disabled={sending}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
          <div className="flex items-center gap-2">
            {viewer === 'tutor' && (
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as any)}
                className="input text-xs py-1.5 px-2 min-h-0 h-auto w-auto"
                aria-label="Urgency"
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
                <option value="info">Info</option>
              </select>
            )}
            <span
              className={[
                'text-2xs',
                composerValue.length >= URGENT_SUBJECT_HIGHLIGHT ? 'text-amber-ink' : 'text-ink-soft',
              ].join(' ')}
            >
              {composerValue.length}/{MAX_CHARS}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xs text-ink-soft hidden sm:inline">
              Enter to send · Shift+Enter = newline
            </span>
            <button
              type="button"
              onClick={send}
              disabled={sending || !composerValue.trim()}
              className="btn-primary text-sm"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message, viewer, onDelete,
}: { message: Message; viewer: Viewer; onDelete: () => void }) {
  const isMine = message.sender_type === viewer;
  const now = Date.now();
  const age = now - new Date(message.created_at).getTime();
  const editable = isMine && age < 5 * 60 * 1000 && !message.deleted;
  const time = new Date(message.created_at).toLocaleTimeString('en-AU', {
    hour: 'numeric', minute: '2-digit',
  });

  return (
    <div className={isMine ? 'flex justify-end' : 'flex justify-start'}>
      <div className={[
        'max-w-[85%] rounded-lg px-3 py-2 text-sm',
        isMine ? 'bg-forest text-cream' : 'bg-surface border border-rule text-ink',
      ].join(' ')}>
        {message.sender_type === 'tutor' && <UrgencyPill urgency={message.urgency} />}
        {message.deleted ? (
          <span className="italic text-ink-muted">{message.body}</span>
        ) : (
          <span className="whitespace-pre-wrap break-words">{message.body}</span>
        )}
        <div className={[
          'text-[10px] mt-1',
          isMine ? 'text-cream/70' : 'text-ink-soft',
        ].join(' ')}>
          {time}{message.edited_at ? ' · edited' : ''}
          {editable && (
            <>
              <span className="mx-1">·</span>
              <button type="button" onClick={onDelete} className="underline underline-offset-2 hover:opacity-80">
                delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ThreadView;
