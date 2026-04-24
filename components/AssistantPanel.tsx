import { useEffect, useMemo, useRef, useState, KeyboardEvent } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAssistantConversation, DbMessage, PendingAction } from '../lib/assistantConversation';
import VoiceRecorder from './voice/VoiceRecorder';
import ReactMarkdown from 'react-markdown';
import type {
  AnyPreview,
  LogSessionPreview,
  PolishNotesPreview,
  CreateStudentPreview,
  UpdateStudentPreview,
  ArchiveStudentPreview,
  CreateInvoicePreview,
  MarkInvoicePaidPreview,
  SendParentUpdatePreview,
  SendMessagePreview,
  MarkNotificationsReadPreview,
  AddStudentToHouseholdPreview,
  CreateTestAccountPreview,
  CreateBatchInvoicesPreview,
  AssignStudentToTutorPreview,
  ToolName,
} from '../lib/assistantTools';
import { isHighRiskTool } from '../lib/assistantTools';
import AssistantConversationDropdown from './AssistantConversationDropdown';
import { useMembership } from '../lib/membershipContext';
import { getChipsForPath, WELCOME_CHIPS } from './assistantChipsByPage';
import AssistantCapabilityModal from './AssistantCapabilityModal';
import { activeLocale } from '../lib/utils';

const WELCOME_DISMISS_KEY = 'crestio.assistant.welcomeDismissed';

// Spec Part 8: three voice-command templates shown when input is empty.
const VOICE_PRESETS = [
  "Log today's session with ",
  'Who owes me money?',
  "What's on tomorrow?",
];

// Markdown renderer for assistant-authored text. Scoped to the design system.
// No raw HTML — react-markdown only parses syntax by default, and we don't
// add rehype-raw. Links open in a new tab with safe rel attributes.
const MARKDOWN_COMPONENTS = {
  p: ({ children }: any) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }: any) => <span className="font-semibold">{children}</span>,
  em: ({ children }: any) => <span className="italic">{children}</span>,
  code: ({ children }: any) => (
    <code className="px-1 py-0.5 bg-ink/5 rounded text-xs font-mono">{children}</code>
  ),
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="text-forest underline underline-offset-2 hover:text-forest-ink">
      {children}
    </a>
  ),
  h1: ({ children }: any) => <h3 className="font-display text-lg tracking-tightest mb-2 mt-3 first:mt-0">{children}</h3>,
  h2: ({ children }: any) => <h4 className="font-display text-base tracking-tightest mb-2 mt-3 first:mt-0">{children}</h4>,
  h3: ({ children }: any) => <h4 className="font-display text-base tracking-tightest mb-2 mt-3 first:mt-0">{children}</h4>,
  hr: () => <hr className="my-3 border-rule" />,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-rule pl-3 my-3 text-ink-muted italic">{children}</blockquote>
  ),
};

function AssistantMarkdown({ text }: { text: string }) {
  return <ReactMarkdown components={MARKDOWN_COMPONENTS}>{text}</ReactMarkdown>;
}

export function AssistantPanel() {
  const { isOpen, closePanel } = useAssistantConversation();

  return (
    <>
      <aside
        className={[
          'hidden lg:flex flex-col shrink-0 overflow-hidden border-l border-rule bg-cream',
          'sticky top-0 self-start h-screen',
          'transition-[width] duration-200 ease-out',
          isOpen ? 'w-[380px]' : 'w-0',
        ].join(' ')}
        aria-hidden={!isOpen}
      >
        <div className="w-[380px] shrink-0 flex flex-col h-full min-h-0">
          <PanelContent onClose={closePanel} />
        </div>
      </aside>

      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/20" onClick={closePanel} aria-hidden="true" />
          <aside
            role="dialog"
            aria-label="Assistant"
            className="absolute right-0 top-0 bottom-0 w-full md:w-[400px] bg-cream border-l border-rule shadow-xl flex flex-col pb-safe"
          >
            <PanelContent onClose={closePanel} />
          </aside>
        </div>
      )}
    </>
  );
}

function PanelContent({ onClose }: { onClose: () => void }) {
  const {
    messages,
    pendingAction,
    isLoading,
    error,
    sendMessage,
    confirmPendingAction,
    cancelPendingAction,
    retryLastRequest,
    systemNote,
    isOpen,
    activeConversationId,
    isLoadingConversations,
  } = useAssistantConversation();
  const router = useRouter();
  const { membership } = useMembership();
  const isOwner = membership?.role === 'owner';

  const [input, setInput] = useState('');
  const [slowThinking, setSlowThinking] = useState(false);
  const [capabilityOpen, setCapabilityOpen] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen, activeConversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pendingAction, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      setSlowThinking(false);
      return;
    }
    const t = setTimeout(() => setSlowThinking(true), 8000);
    return () => clearTimeout(t);
  }, [isLoading]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(WELCOME_DISMISS_KEY);
      setWelcomeDismissed(raw === 'true');
    } catch { /* ignore */ }
  }, []);

  function dismissWelcome() {
    setWelcomeDismissed(true);
    try { window.localStorage.setItem(WELCOME_DISMISS_KEY, 'true'); } catch { /* ignore */ }
  }

  async function submit(text: string) {
    const t = text.trim();
    if (!t || isLoading || pendingAction) return;
    // "What else can you do?" clicks open the capability modal instead of submitting.
    if (/^what (else )?can (i|you) do\??$/i.test(t)) {
      setCapabilityOpen(true);
      return;
    }
    setInput('');
    await sendMessage(t);
  }

  function insertChip(text: string) {
    // Placeholders like [student] prompt the user to fill in — drop them into the input.
    if (text.includes('[')) {
      setInput(text);
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    submit(text);
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  const hasMessages = messages.length > 0;
  const pageChips = useMemo(() => getChipsForPath(router.pathname), [router.pathname]);

  // Daily usage counter — fetched from /api/assistant/usage. Refreshes when
  // the panel opens and whenever a user message is sent.
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        // Local import of supabase session helper (panel already imports above elsewhere).
        const mod = await import('../lib/supabase');
        const { data: { session } } = await mod.supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/assistant/usage', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setUsage(await res.json());
      } catch { /* ignore */ }
    })();
  }, [isOpen, messages.length]);

  const remaining = usage ? usage.limit - usage.used : null;
  const atLimit = usage ? usage.used >= usage.limit : false;
  const nearLimit = remaining !== null && remaining > 0 && remaining <= 10;

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-rule gap-2">
        <AssistantConversationDropdown />
        <div className="flex items-center gap-2">
          {usage && (
            <span className="text-2xs text-ink-soft hidden md:inline" title="Resets at midnight Sydney time">
              {usage.used} / {usage.limit} today
            </span>
          )}
          <button
            onClick={onClose}
            className="btn-ghost text-xs shrink-0 min-h-[44px] min-w-[44px]"
            aria-label="Close"
          >
            Close
          </button>
        </div>
      </div>

      {nearLimit && (
        <div className="px-4 py-2 text-2xs bg-amber-soft/40 text-amber-ink border-b border-amber/30">
          You have {remaining} message{remaining === 1 ? '' : 's'} left today. Resets at midnight.
        </div>
      )}
      {atLimit && (
        <div className="px-4 py-2 text-2xs bg-amber-soft/60 text-amber-ink border-b border-amber/40">
          You've used all your assistant messages for today. Resets at midnight Sydney time.
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {isLoadingConversations && !hasMessages && (
          <div className="text-2xs text-ink-soft">Loading conversations…</div>
        )}

        {!hasMessages && !isLoading && !isLoadingConversations && (
          <WelcomeBlock
            chips={WELCOME_CHIPS}
            onChip={insertChip}
            onOpenCapabilities={() => setCapabilityOpen(true)}
          />
        )}

        {hasMessages && !welcomeDismissed && (
          <DismissibleBanner onDismiss={dismissWelcome} onOpenCapabilities={() => setCapabilityOpen(true)} />
        )}

        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}

        {isLoading && <ThinkingBubble slow={slowThinking} />}
        {error && !isLoading && (
          <ErrorBubble message={error} onRetry={retryLastRequest} />
        )}
        {systemNote && !isLoading && (
          <div className="text-2xs uppercase tracking-widest text-ink-soft">
            {systemNote}
          </div>
        )}
      </div>

      {pendingAction && (
        <div className={[
          'border-t p-4',
          pendingAction.requires_typed_confirmation ? 'border-amber/60 bg-amber/5' : 'border-rule bg-rule-soft/40',
        ].join(' ')}>
          <PreviewCard
            pending={pendingAction}
            onConfirm={confirmPendingAction}
            onCancel={cancelPendingAction}
            busy={isLoading}
          />
        </div>
      )}

      {hasMessages && !pendingAction && (
        <div className="border-t border-rule px-4 pt-2 pb-0">
          <div className="flex flex-wrap gap-1.5 pb-2">
            {pageChips.slice(0, 3).map((t) => (
              <InlineChip key={t} text={t} onClick={() => insertChip(t)} />
            ))}
            <InlineChip text="What can you do?" onClick={() => setCapabilityOpen(true)} />
          </div>
        </div>
      )}

      <div className="border-t border-rule p-3">
        <textarea
          ref={inputRef}
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
          disabled={isLoading || !!pendingAction || !activeConversationId || atLimit}
          placeholder={
            !activeConversationId
              ? 'Loading…'
              : pendingAction
              ? 'Waiting for your confirmation above…'
              : atLimit
              ? 'Daily limit reached — resets at midnight.'
              : 'Type a message. Enter to send.'
          }
          className="input w-full text-sm"
        />
        <div className="flex items-center justify-between mt-2 gap-2">
          <span className="text-2xs text-ink-soft hidden md:inline">Shift+Enter = newline</span>
          <div className="flex items-center gap-2 ml-auto">
            <VoiceRecorder
              context="assistant_command"
              size="sm"
              label="Dictate"
              disabled={isLoading || !!pendingAction || !activeConversationId || atLimit}
              onTranscript={(text) => {
                setInput((prev) => prev ? `${prev.trim()} ${text}` : text);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
            />
            <VoiceRecorder
              context="assistant_command"
              size="sm"
              label="Send"
              disabled={isLoading || !!pendingAction || !activeConversationId || atLimit}
              onTranscript={(text) => { submit(text); }}
            />
            <button
              type="button"
              onClick={() => submit(input)}
              disabled={isLoading || !!pendingAction || !input.trim() || !activeConversationId || atLimit}
              className="btn-primary text-xs"
            >
              {isLoading ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>

        {!input.trim() && !pendingAction && !isLoading && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {VOICE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setInput(preset);
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
                className="text-2xs text-ink-muted bg-rule-soft/40 border border-rule rounded-full px-2.5 py-1 hover:bg-ruleSoft hover:text-ink transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>
        )}
      </div>

      <AssistantCapabilityModal
        open={capabilityOpen}
        onClose={() => setCapabilityOpen(false)}
        isOwner={isOwner}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Welcome / chips / banner
// ---------------------------------------------------------------------------

function WelcomeBlock({
  chips,
  onChip,
  onOpenCapabilities,
}: {
  chips: string[];
  onChip: (t: string) => void;
  onOpenCapabilities: () => void;
}) {
  return (
    <>
      <div className="text-sm text-ink space-y-2">
        <p>Hi, I'm your Crestio assistant. I can log sessions, polish notes, create invoices, answer questions about students, send parent updates, and more.</p>
        <p className="text-ink-muted">Try one of these to start:</p>
      </div>
      <div className="flex flex-col gap-2 pt-2">
        {chips.map((t) => (
          <ChipButton
            key={t}
            text={t}
            onClick={() => {
              if (/what (else )?can (i|you) do/i.test(t)) onOpenCapabilities();
              else onChip(t);
            }}
          />
        ))}
      </div>
    </>
  );
}

function DismissibleBanner({
  onDismiss,
  onOpenCapabilities,
}: {
  onDismiss: () => void;
  onOpenCapabilities: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-2xs text-ink-muted bg-rule-soft/40 border border-rule rounded px-3 py-2">
      <div>
        Tip:{' '}
        <button onClick={onOpenCapabilities} className="underline hover:text-ink">
          see all assistant capabilities
        </button>
        .
      </div>
      <button onClick={onDismiss} className="text-ink-soft hover:text-ink" aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

function ChipButton({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left text-xs text-ink bg-cream border border-rule rounded px-3 py-2 hover:bg-ruleSoft transition-colors"
    >
      {text}
    </button>
  );
}

function InlineChip({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-2xs text-ink-muted bg-rule-soft/40 border border-rule rounded-full px-2.5 py-1 hover:bg-ruleSoft hover:text-ink transition-colors"
    >
      {text}
    </button>
  );
}

function ThinkingBubble({ slow }: { slow: boolean }) {
  return (
    <div className="flex justify-start">
      <div
        className="bg-cream border border-rule rounded-lg px-3 py-2 text-ink-soft"
        role="status"
        aria-live="polite"
      >
        <span className="inline-flex items-center">
          <span className="assistant-dot" />
          <span className="assistant-dot" />
          <span className="assistant-dot" />
        </span>
        {slow && <div className="text-2xs text-ink-soft mt-1">Still thinking…</div>}
      </div>
    </div>
  );
}

function ErrorBubble({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex justify-start">
      <div className="bg-cream border border-claret/30 rounded-lg px-3 py-2 text-sm text-ink">
        {message}{' '}
        <button type="button" onClick={onRetry} className="text-claret hover:text-claret/80 underline">
          Try again?
        </button>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: DbMessage }) {
  if (message.role === 'user') {
    const text: string = message.content?.text ?? '';
    if (!text) return null;
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-ink text-cream rounded-lg px-3 py-2 text-sm">{text}</div>
      </div>
    );
  }

  if (message.role === 'assistant') {
    const text: string = message.content?.text ?? '';
    if (!text) return null;
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] bg-cream border border-rule rounded-lg px-3 py-2 text-sm text-ink">
          <AssistantMarkdown text={text} />
        </div>
      </div>
    );
  }

  if (message.role === 'tool_use') {
    return null;
  }

  const c = message.content ?? {};
  if (c.cancelled) {
    return <div className="text-2xs text-ink-soft uppercase tracking-widest">Cancelled</div>;
  }
  if (c.ok === false || c.error) {
    return <div className="text-2xs text-claret">Error: {c.error ?? 'Action failed.'}</div>;
  }
  // Successful execute result (read_result rows are narrated by Claude, no UI).
  if (c.read_result) return null;
  return (
    <div className="text-2xs text-ink-soft uppercase tracking-widest">
      ✓ {c.summary ?? 'Action completed'}
      {c.session_id && (
        <>{' '}· <Link href={`/app/sessions/${c.session_id}`} className="underline">View session</Link></>
      )}
      {c.invoice_id && (
        <>{' '}· <Link href={`/app/invoices/${c.invoice_id}`} className="underline">View invoice</Link></>
      )}
      {c.student_id && !c.session_id && !c.invoice_id && (
        <>{' '}· <Link href={`/app/students/${c.student_id}`} className="underline">View student</Link></>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview card — dispatches to per-tool sub-renderers.
// ---------------------------------------------------------------------------

function PreviewCard({
  pending,
  onConfirm,
  onCancel,
  busy,
}: {
  pending: PendingAction;
  onConfirm: (opts?: { user_typed_confirmation?: boolean }) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const { preview, requires_typed_confirmation, tool_name } = pending;

  const body = renderPreviewBody(preview);
  const heading = previewHeading(preview);

  if (requires_typed_confirmation) {
    return (
      <TypedConfirmShell
        heading={heading}
        toolName={tool_name}
        preview={preview}
        onConfirm={() => onConfirm({ user_typed_confirmation: true })}
        onCancel={onCancel}
        busy={busy}
      >
        {body}
      </TypedConfirmShell>
    );
  }

  return (
    <OneClickShell
      heading={heading}
      onConfirm={() => onConfirm()}
      onCancel={onCancel}
      busy={busy}
    >
      {body}
    </OneClickShell>
  );
}

function OneClickShell({
  heading,
  children,
  onConfirm,
  onCancel,
  busy,
}: {
  heading: string;
  children: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="border border-forest/30 bg-forest-soft/30 rounded p-4 space-y-3">
      <div className="text-2xs uppercase tracking-widest text-forest-ink/80">{heading}</div>
      {children}
      <div className="flex gap-2">
        <button onClick={onConfirm} disabled={busy} className="btn-primary text-xs">
          {busy ? 'Working…' : 'Confirm'}
        </button>
        <button onClick={onCancel} disabled={busy} className="btn-ghost text-xs">Cancel</button>
      </div>
    </div>
  );
}

function TypedConfirmShell({
  heading,
  toolName,
  preview,
  children,
  onConfirm,
  onCancel,
  busy,
}: {
  heading: string;
  toolName: ToolName;
  preview: AnyPreview;
  children: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [text, setText] = useState('');
  const ready = text.trim().toLowerCase() === 'confirm';
  const helper = typedConfirmHelper(toolName, preview);

  return (
    <div className="border border-amber/60 bg-amber-soft/20 rounded p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full bg-amber"
        />
        <div className="text-2xs uppercase tracking-widest text-amber-ink">
          {heading} · Requires typed confirmation
        </div>
      </div>
      {children}
      <div className="space-y-1.5 pt-1">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Type "confirm" to proceed'}
          className="input w-full text-sm"
          autoFocus
          disabled={busy}
        />
        <div className="text-2xs text-ink-soft">{helper}</div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={!ready || busy}
          className="btn-primary text-xs"
        >
          {busy ? 'Working…' : 'Execute'}
        </button>
        <button onClick={onCancel} disabled={busy} className="btn-ghost text-xs">Cancel</button>
      </div>
    </div>
  );
}

function typedConfirmHelper(toolName: ToolName, preview: AnyPreview): string {
  switch (preview.tool_name) {
    case 'create_invoice': {
      const p = preview as CreateInvoicePreview;
      return `This will create a new invoice for ${p.student_name} totalling ${formatCents(p.total_cents, p.currency)}. Typing 'confirm' is the final step.`;
    }
    case 'mark_invoice_paid': {
      const p = preview as MarkInvoicePaidPreview;
      return `This will mark ${p.invoice_number} as paid. This can't be undone from the assistant. Typing 'confirm' is the final step.`;
    }
    case 'send_parent_update': {
      const p = preview as SendParentUpdatePreview;
      const target = p.parent_name ? `${p.parent_name}'s portal` : `the portal for ${p.student_name}`;
      return `This will post an update to ${target}. The parent will see it next time they sign in. Typing 'confirm' is the final step.`;
    }
    case 'send_message': {
      const p = preview as SendMessagePreview;
      const target = p.parent_name ? p.parent_name : 'the parent';
      const urgencyLine = p.urgency ? ` (${p.urgency})` : '';
      return `This will send a message to ${target} about ${p.student_name}${urgencyLine}. Typing 'confirm' is the final step.`;
    }
    default:
      return `Typing 'confirm' is the final step.`;
  }
}

function previewHeading(preview: AnyPreview): string {
  switch (preview.tool_name) {
    case 'log_session': return 'Log session';
    case 'polish_notes': return `Polish notes for ${(preview as PolishNotesPreview).student_name}`;
    case 'create_student': return 'Add student';
    case 'update_student': return `Update ${(preview as UpdateStudentPreview).student_name}`;
    case 'archive_student': return `Archive ${(preview as ArchiveStudentPreview).student_name}`;
    case 'create_invoice': return `New invoice for ${(preview as CreateInvoicePreview).student_name}`;
    case 'mark_invoice_paid': return `Mark ${(preview as MarkInvoicePaidPreview).invoice_number} paid`;
    case 'send_parent_update': return `Update for ${(preview as SendParentUpdatePreview).student_name}`;
    case 'send_message': return `Message ${(preview as SendMessagePreview).parent_name ?? 'parent'} about ${(preview as SendMessagePreview).student_name}`;
    case 'mark_notifications_read': {
      const p = preview as MarkNotificationsReadPreview;
      return p.target === 'all' ? `Mark ${p.count} notification${p.count === 1 ? '' : 's'} read` : `Mark ${p.count} notification${p.count === 1 ? '' : 's'} read`;
    }
    case 'assign_student_to_tutor': return `Assign ${(preview as AssignStudentToTutorPreview).student_name}`;
    case 'add_student_to_household': {
      const p = preview as AddStudentToHouseholdPreview;
      return `Add ${p.student_name} to ${p.household_display_name}`;
    }
    case 'create_test_account': {
      const p = preview as CreateTestAccountPreview;
      return `Create test ${p.role}: ${p.full_name}`;
    }
    case 'create_batch_invoices': {
      const p = preview as CreateBatchInvoicesPreview;
      return `Invoice ${p.households.length} household${p.households.length === 1 ? '' : 's'} — ${p.period_label}`;
    }
  }
}

function renderPreviewBody(preview: AnyPreview): React.ReactNode {
  switch (preview.tool_name) {
    case 'log_session':
      return <LogSessionBody p={preview as LogSessionPreview} />;
    case 'polish_notes':
      return <PolishNotesBody p={preview as PolishNotesPreview} />;
    case 'create_student':
      return <CreateStudentBody p={preview as CreateStudentPreview} />;
    case 'update_student':
      return <UpdateStudentBody p={preview as UpdateStudentPreview} />;
    case 'archive_student':
      return <ArchiveStudentBody p={preview as ArchiveStudentPreview} />;
    case 'create_invoice':
      return <CreateInvoiceBody p={preview as CreateInvoicePreview} />;
    case 'mark_invoice_paid':
      return <MarkInvoicePaidBody p={preview as MarkInvoicePaidPreview} />;
    case 'send_parent_update':
      return <SendParentUpdateBody p={preview as SendParentUpdatePreview} />;
    case 'send_message':
      return <SendMessageBody p={preview as SendMessagePreview} />;
    case 'mark_notifications_read':
      return <MarkNotificationsReadBody p={preview as MarkNotificationsReadPreview} />;
    case 'assign_student_to_tutor':
      return <AssignStudentToTutorBody p={preview as AssignStudentToTutorPreview} />;
    case 'add_student_to_household':
      return <AddStudentToHouseholdBody p={preview as AddStudentToHouseholdPreview} />;
    case 'create_test_account':
      return <CreateTestAccountBody p={preview as CreateTestAccountPreview} />;
    case 'create_batch_invoices':
      return <CreateBatchInvoicesBody p={preview as CreateBatchInvoicesPreview} />;
  }
}

function CreateBatchInvoicesBody({ p }: { p: CreateBatchInvoicesPreview }) {
  const fmt = (c: number) => new Intl.NumberFormat(activeLocale(), {
    style: 'currency', currency: p.currency || 'AUD',
    maximumFractionDigits: c % 100 === 0 ? 0 : 2,
  }).format(c / 100);
  return (
    <div className="space-y-2">
      <Field label="Period" value={p.period_label} />
      <div className="text-sm text-ink">
        <div className="text-ink-muted mb-1">Households:</div>
        <ul className="space-y-1">
          {p.households.map((h) => (
            <li key={h.household_id} className="flex items-center justify-between gap-3">
              <span>{h.display_name} <span className="text-2xs text-ink-soft">· {h.session_count} session{h.session_count === 1 ? '' : 's'}</span></span>
              <span className="font-mono num">{fmt(h.total_cents)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="text-sm text-ink pt-2 border-t border-rule">
        <span className="text-ink-muted">Total:</span>{' '}
        <span className="font-mono num font-medium">{fmt(p.total_cents)}</span>
      </div>
      <div className="text-2xs text-ink-soft">
        Primary parents will get an email as soon as you confirm.
      </div>
    </div>
  );
}

function CreateTestAccountBody({ p }: { p: CreateTestAccountPreview }) {
  return (
    <div className="space-y-1">
      <Field label="Role" value={p.role} />
      <Field label="Name" value={p.full_name} />
      <Field label="Email" value={p.email.includes('pending') ? 'auto-generated on create' : p.email} />
    </div>
  );
}

function AddStudentToHouseholdBody({ p }: { p: AddStudentToHouseholdPreview }) {
  return (
    <div className="space-y-1">
      <Field label="Student" value={p.student_name} />
      <Field label="Household" value={p.household_display_name} />
      {p.moving_from_household_name && (
        <Field label="Moving from" value={p.moving_from_household_name} />
      )}
    </div>
  );
}

// ---- Preview bodies -------------------------------------------------------

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="text-sm text-ink">
      <span className="text-ink-muted">{label}:</span> {value}
    </div>
  );
}

function LogSessionBody({ p }: { p: LogSessionPreview }) {
  const notesSnippet = (p.notes_internal ?? '').length > 120
    ? (p.notes_internal ?? '').slice(0, 120) + '…'
    : p.notes_internal ?? '';
  return (
    <div className="space-y-1">
      <Field label="Student" value={p.student_name} />
      <Field label="When" value={p.session_date_display} />
      <Field label="Duration" value={`${p.duration_minutes} min`} />
      <Field label="Subject" value={p.subject} />
      <Field label="Topic" value={p.topic} />
      <Field
        label="Homework"
        value={p.homework ? `${p.homework}${p.homework_due_date ? ` (due ${p.homework_due_date})` : ''}` : null}
      />
      <Field label="Next focus" value={p.next_session_focus} />
      <Field label="Notes" value={notesSnippet || null} />
    </div>
  );
}

function PolishNotesBody({ p }: { p: PolishNotesPreview }) {
  return (
    <div className="grid grid-cols-1 gap-3 text-xs text-ink">
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Original</div>
        <div className="whitespace-pre-wrap text-ink-muted">{p.original_notes}</div>
      </div>
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Polished</div>
        <div className="whitespace-pre-wrap bg-cream border border-rule rounded p-2">
          {p.polished_notes}
        </div>
      </div>
    </div>
  );
}

function CreateStudentBody({ p }: { p: CreateStudentPreview }) {
  const rateDisplay = p.charge_rate_cents != null ? `${formatCents(p.charge_rate_cents, p.currency)}/hr` : null;
  return (
    <div className="space-y-1">
      <Field label="Name" value={p.name} />
      <Field label="Year" value={p.year_level} />
      <Field label="Subject" value={p.subject} />
      <Field label="Rate" value={rateDisplay} />
      <Field label="Parent" value={p.parent_name} />
      <Field label="Parent email" value={p.parent_email} />
      <Field label="Tutor" value={p.primary_tutor_name} />
      {p.will_send_parent_invitation && (
        <div className="text-2xs text-ink-muted italic pt-1">
          A parent invitation will be sent to {p.parent_email} after you confirm.
        </div>
      )}
    </div>
  );
}

function UpdateStudentBody({ p }: { p: UpdateStudentPreview }) {
  return (
    <div className="space-y-1.5 text-sm">
      {p.changes.map((c) => (
        <div key={c.field} className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
          <span className="text-ink-muted">{c.field_label}:</span>
          <span>
            <span className="text-ink-muted line-through">{c.from ?? '—'}</span>
            <span className="mx-1 text-ink-soft">→</span>
            <span className="text-ink">{c.to ?? '—'}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ArchiveStudentBody({ p }: { p: ArchiveStudentPreview }) {
  return (
    <div className="space-y-1 text-sm text-ink">
      <Field label="Student" value={p.student_name} />
      <Field label="Past sessions" value={`${p.past_sessions_count} (preserved)`} />
      <Field label="Parent links" value={`${p.parent_links_count}`} />
      <div className="text-2xs text-ink-muted italic pt-1">
        This will hide the student from your main list but keep all historical data.
      </div>
    </div>
  );
}

function CreateInvoiceBody({ p }: { p: CreateInvoicePreview }) {
  return (
    <div className="space-y-2">
      <Field label="Student" value={p.student_name} />
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Line items</div>
        <ul className="space-y-1 text-xs">
          {p.line_items.map((li) => (
            <li key={li.session_id} className="flex justify-between gap-3">
              <span className={li.already_on_invoice ? 'text-claret' : 'text-ink'}>
                {li.session_date_display} · {li.duration_minutes} min
                {li.already_on_invoice && ' · already invoiced'}
              </span>
              <span className="font-mono text-ink">{formatCents(li.amount_cents, p.currency)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-between text-sm text-ink pt-1 border-t border-rule">
        <span>Total</span>
        <span className="font-mono">{formatCents(p.total_cents, p.currency)}</span>
      </div>
      <Field label="Due" value={p.due_date_display} />
      {p.warning && (
        <div className="text-2xs text-claret bg-claret/5 border border-claret/30 rounded p-2">
          ⚠ {p.warning}
        </div>
      )}
    </div>
  );
}

function MarkInvoicePaidBody({ p }: { p: MarkInvoicePaidPreview }) {
  return (
    <div className="space-y-1 text-sm text-ink">
      <Field label="Invoice" value={p.invoice_number} />
      <Field label="Student" value={p.student_name} />
      <Field label="Amount" value={formatCents(p.total_cents, p.currency)} />
      <div className="text-sm text-ink">
        <span className="text-ink-muted">Status:</span>{' '}
        <span className="text-ink-muted line-through">{p.current_status}</span>
        <span className="mx-1 text-ink-soft">→</span>
        <span className="text-ink font-medium">paid</span>
      </div>
    </div>
  );
}

function SendParentUpdateBody({ p }: { p: SendParentUpdatePreview }) {
  return (
    <div className="space-y-2 text-sm">
      <Field label="Student" value={p.student_name} />
      <Field label="Parent" value={p.parent_name} />
      <Field label="References" value={`${p.referenced_session_ids.length} session${p.referenced_session_ids.length === 1 ? '' : 's'}`} />
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Draft</div>
        <div className="whitespace-pre-wrap bg-cream border border-rule rounded p-2 text-xs text-ink">
          {p.draft_content}
        </div>
      </div>
      <div className="text-2xs text-ink-muted italic">
        {p.parent_has_portal_access
          ? `This will appear in the parent portal next time ${p.parent_name ?? 'the parent'} logs in. No email will be sent.`
          : `This will be saved, but the parent has no portal access yet — they won't see it until they're invited.`}
      </div>
    </div>
  );
}

function SendMessageBody({ p }: { p: SendMessagePreview }) {
  return (
    <div className="space-y-2 text-sm">
      <Field label="To" value={p.parent_name ?? 'Parent'} />
      <Field label="About" value={p.student_name} />
      {p.urgency && (
        <Field label="Urgency" value={p.urgency.charAt(0).toUpperCase() + p.urgency.slice(1)} />
      )}
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Message</div>
        <div className="whitespace-pre-wrap bg-cream border border-rule rounded p-2 text-xs text-ink">
          {p.body}
        </div>
      </div>
      <div className="text-2xs text-ink-muted italic">
        This will send the message in Crestio and email the parent (unless they've opted out).
      </div>
    </div>
  );
}

function MarkNotificationsReadBody({ p }: { p: MarkNotificationsReadPreview }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="text-ink-muted">
        This will mark <strong>{p.count}</strong> notification{p.count === 1 ? '' : 's'} as read.
      </div>
      {p.titles.length > 0 && (
        <ul className="text-2xs text-ink-soft list-disc pl-4 mt-2 space-y-0.5">
          {p.titles.map((t, i) => <li key={i} className="truncate">{t}</li>)}
          {p.count > p.titles.length && (
            <li className="italic">and {p.count - p.titles.length} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

function AssignStudentToTutorBody({ p }: { p: AssignStudentToTutorPreview }) {
  return (
    <div className="space-y-1 text-sm text-ink">
      <Field label="Student" value={p.student_name} />
      <Field label="Current tutor" value={p.current_tutor_name ?? 'None'} />
      <div className="text-sm text-ink">
        <span className="text-ink-muted">New tutor:</span>{' '}
        <span className="text-ink font-medium">{p.new_tutor_name}</span>
      </div>
      <div className="text-2xs text-ink-muted italic pt-1">Effective immediately.</div>
    </div>
  );
}

function formatCents(cents: number, currency = 'AUD'): string {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency,
    maximumFractionDigits: (cents % 100 === 0) ? 0 : 2,
  }).format(cents / 100);
}

export default AssistantPanel;
