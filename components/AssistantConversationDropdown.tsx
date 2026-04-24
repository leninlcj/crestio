import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useAssistantConversation, Conversation } from '../lib/assistantConversation';
import { activeLocale } from '../lib/utils';

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' });
}

export default function AssistantConversationDropdown() {
  const {
    conversations,
    activeConversationId,
    switchConversation,
    createConversation,
    renameConversation,
    deleteConversation,
  } = useAssistantConversation();

  const active = conversations.find((c) => c.id === activeConversationId) ?? null;

  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // Close menus on click-outside & Escape
  useEffect(() => {
    if (!menuOpen && !moreOpen && !renaming) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (menuOpen && dropdownRef.current && !dropdownRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (moreOpen && moreRef.current && !moreRef.current.contains(target)) {
        setMoreOpen(false);
      }
      if (
        renaming &&
        renameInputRef.current &&
        !renameInputRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        commitRename();
      }
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        if (menuOpen || moreOpen || renaming) {
          e.stopPropagation();
          setMenuOpen(false);
          setMoreOpen(false);
          if (renaming) setRenaming(false);
        }
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menuOpen, moreOpen, renaming]);

  useEffect(() => {
    if (renaming) setTimeout(() => renameInputRef.current?.focus(), 0);
  }, [renaming]);

  async function commitRename() {
    if (!active) {
      setRenaming(false);
      return;
    }
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== active.title) {
      await renameConversation(active.id, trimmed);
    }
    setRenaming(false);
  }

  function onRenameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setRenaming(false);
    }
  }

  async function onDelete() {
    if (!active) return;
    setMoreOpen(false);
    const ok = typeof window !== 'undefined' ? window.confirm('Delete this conversation? This cannot be undone.') : true;
    if (!ok) return;
    await deleteConversation(active.id);
  }

  async function onNewConversation() {
    setMenuOpen(false);
    await createConversation({ title: 'New conversation' });
  }

  async function onSelect(c: Conversation) {
    setMenuOpen(false);
    await switchConversation(c.id);
  }

  return (
    <div className="flex-1 flex items-center gap-2 min-w-0">
      {renaming ? (
        <input
          ref={renameInputRef}
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={onRenameKey}
          maxLength={80}
          className="flex-1 text-sm font-display tracking-tightest bg-transparent border border-rule rounded px-2 py-1 focus:outline-none focus:border-ink"
        />
      ) : (
        <div ref={dropdownRef} className="flex-1 relative min-w-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="w-full flex items-center gap-1 text-left px-2 py-1 rounded hover:bg-ruleSoft transition-colors min-w-0"
            aria-label="Switch conversation"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="font-display text-lg tracking-tightest truncate">
              {active?.title ?? 'Assistant'}
            </span>
            <span className="text-ink-soft text-xs">▾</span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full mt-1 w-72 max-w-[95vw] bg-surface border border-rule rounded shadow-lift z-10 py-1 max-h-80 overflow-y-auto"
            >
              {conversations.map((c) => {
                const isActive = c.id === activeConversationId;
                return (
                  <button
                    key={c.id}
                    role="menuitem"
                    type="button"
                    onClick={() => onSelect(c)}
                    className={[
                      'w-full text-left px-3 py-2 flex items-baseline justify-between gap-3 hover:bg-ruleSoft transition-colors',
                      isActive ? 'bg-ruleSoft' : '',
                    ].join(' ')}
                  >
                    <span className="text-sm text-ink truncate">{c.title}</span>
                    <span className="text-2xs text-ink-soft shrink-0">
                      {formatRelative(c.last_message_at)}
                    </span>
                  </button>
                );
              })}
              <div className="border-t border-rule my-1" />
              <button
                role="menuitem"
                type="button"
                onClick={onNewConversation}
                className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-ruleSoft transition-colors"
              >
                + New conversation
              </button>
            </div>
          )}
        </div>
      )}

      <div ref={moreRef} className="relative">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          disabled={!active || renaming}
          className="px-2 py-1 rounded text-ink-soft hover:text-ink hover:bg-ruleSoft transition-colors disabled:opacity-40"
          aria-label="Conversation actions"
        >
          ⋯
        </button>
        {moreOpen && active && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-44 bg-surface border border-rule rounded shadow-lift z-10 py-1"
          >
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setMoreOpen(false);
                setRenameValue(active.title);
                setRenaming(true);
              }}
              className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-ruleSoft"
            >
              Rename
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={onDelete}
              className="w-full text-left px-3 py-2 text-sm text-claret hover:bg-claret/5"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
