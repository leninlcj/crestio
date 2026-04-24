import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from './supabase';
import type { AnyPreview, ToolName } from './assistantTools';
import { useBilling } from './billingContext';

function rateLimitMessage(retryAfterSeconds: number): string {
  if (retryAfterSeconds > 60) {
    const min = Math.ceil(retryAfterSeconds / 60);
    return `You've hit the hourly limit for the assistant. Try again in ${min} minute${min === 1 ? '' : 's'}.`;
  }
  return "You've hit the hourly limit for the assistant. Try again in a minute.";
}

export type DbMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content: any;
  created_at: string;
};

export type PendingAction = {
  tool_use_id: string;
  tool_name: ToolName;
  input: any;
  preview: AnyPreview;
  requires_typed_confirmation: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  created_at: string;
  last_message_at: string;
  message_count: number;
};

type ContextValue = {
  isOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  conversations: Conversation[];
  activeConversationId: string | null;
  isLoadingConversations: boolean;
  switchConversation: (id: string) => Promise<void>;
  createConversation: (opts?: { title?: string }) => Promise<Conversation | null>;
  renameConversation: (id: string, title: string) => Promise<boolean>;
  deleteConversation: (id: string) => Promise<void>;

  messages: DbMessage[];
  pendingAction: PendingAction | null;
  isLoading: boolean;
  error: string | null;
  systemNote: string | null;
  sendMessage: (text: string) => Promise<void>;
  confirmPendingAction: (opts?: { user_typed_confirmation?: boolean }) => Promise<void>;
  cancelPendingAction: () => Promise<void>;
  retryLastRequest: () => Promise<void>;
};

const AssistantConversationContext = createContext<ContextValue | null>(null);

const PANEL_OPEN_KEY = 'crestio.assistant.isOpen';

export function AssistantConversationProvider({ children }: { children: ReactNode }) {
  const { openPaywall } = useBilling();
  const [isOpen, setIsOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemNote, setSystemNote] = useState<string | null>(null);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeConversationId;
  const isLoadingRef = useRef(false);
  isLoadingRef.current = isLoading;
  const lastUserTextRef = useRef<string | null>(null);

  // -- Auth / keyboard / panel-open persistence --------------------------
  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);
  const togglePanel = useCallback(() => setIsOpen((v) => !v), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Cmd+K now belongs to global search (Session 13C). Assistant uses
      // the floating launcher; Esc still closes the panel.
      if (e.key === 'Escape') {
        setIsOpen((v) => (v ? false : v));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Restore isOpen from localStorage (NOT messages — those come from DB).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(PANEL_OPEN_KEY);
      if (raw === 'true') setIsOpen(true);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(PANEL_OPEN_KEY, isOpen ? 'true' : 'false');
    } catch {
      // ignore
    }
  }, [isOpen]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setUserId(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUid = session?.user?.id ?? null;
      if (event === 'SIGNED_OUT') {
        setIsOpen(false);
        setConversations([]);
        setActiveConversationId(null);
        setMessages([]);
        setPendingAction(null);
        setError(null);
        setUserId(null);
        return;
      }
      if (nextUid !== userIdRefCurrent()) {
        setConversations([]);
        setActiveConversationId(null);
        setMessages([]);
        setPendingAction(null);
        setError(null);
        setUserId(nextUid);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;
  function userIdRefCurrent() {
    return userIdRef.current;
  }

  // -- Auth helper --------------------------------------------------------
  async function authHeader(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : null;
  }

  // -- Conversation list + initial bootstrap ------------------------------
  const loadConversations = useCallback(async (): Promise<Conversation[]> => {
    const auth = await authHeader();
    if (!auth) return [];
    const res = await fetch('/api/assistant/conversations', { headers: { Authorization: auth } });
    if (!res.ok) return [];
    const payload = await res.json().catch(() => ({}));
    return (payload.conversations ?? []) as Conversation[];
  }, []);

  const loadMessages = useCallback(async (conversationId: string): Promise<DbMessage[]> => {
    const auth = await authHeader();
    if (!auth) return [];
    const res = await fetch(`/api/assistant/conversations/${conversationId}/messages`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) return [];
    const payload = await res.json().catch(() => ({}));
    return (payload.messages ?? []) as DbMessage[];
  }, []);

  const bootstrapRanRef = useRef(false);
  useEffect(() => {
    if (!userId) {
      bootstrapRanRef.current = false;
      return;
    }
    if (bootstrapRanRef.current) return;
    bootstrapRanRef.current = true;

    (async () => {
      setIsLoadingConversations(true);
      try {
        let list = await loadConversations();
        if (list.length === 0) {
          const auth = await authHeader();
          if (!auth) return;
          const res = await fetch('/api/assistant/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: auth },
            body: JSON.stringify({ title: 'General' }),
          });
          const payload = await res.json().catch(() => ({}));
          if (res.ok && payload.conversation) {
            list = [payload.conversation];
          }
        }
        setConversations(list);
        const firstId = list[0]?.id ?? null;
        if (firstId) {
          setActiveConversationId(firstId);
          const msgs = await loadMessages(firstId);
          setMessages(msgs);
        }
      } finally {
        setIsLoadingConversations(false);
      }
    })();
  }, [userId, loadConversations, loadMessages]);

  // -- Switch / create / rename / delete ----------------------------------
  const switchConversation = useCallback(
    async (id: string) => {
      if (id === activeIdRef.current) return;
      setActiveConversationId(id);
      setMessages([]);
      setPendingAction(null);
      setError(null);
      const msgs = await loadMessages(id);
      if (activeIdRef.current === id) {
        setMessages(msgs);
      }
    },
    [loadMessages],
  );

  const createConversation = useCallback(
    async (opts?: { title?: string }): Promise<Conversation | null> => {
      const auth = await authHeader();
      if (!auth) return null;
      const res = await fetch('/api/assistant/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ title: opts?.title }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.conversation) return null;
      const c: Conversation = payload.conversation;
      setConversations((prev) => [c, ...prev]);
      setActiveConversationId(c.id);
      setMessages([]);
      setPendingAction(null);
      setError(null);
      return c;
    },
    [],
  );

  const renameConversation = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      const trimmed = title.trim().slice(0, 80);
      if (!trimmed) return false;
      const prev = conversations;
      setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
      const auth = await authHeader();
      if (!auth) return false;
      const res = await fetch(`/api/assistant/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) {
        setConversations(prev);
        return false;
      }
      return true;
    },
    [conversations],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      const auth = await authHeader();
      if (!auth) return;
      const res = await fetch(`/api/assistant/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: auth },
      });
      if (!res.ok) return;
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (activeIdRef.current === id) {
        if (remaining.length > 0) {
          const nextId = remaining[0].id;
          setActiveConversationId(nextId);
          setMessages([]);
          const msgs = await loadMessages(nextId);
          if (activeIdRef.current === nextId) setMessages(msgs);
        } else {
          const created = await createConversation({ title: 'General' });
          if (!created) {
            setActiveConversationId(null);
            setMessages([]);
          }
        }
      }
    },
    [conversations, loadMessages, createConversation],
  );

  // -- Turn-taking --------------------------------------------------------
  const applyServerReply = useCallback(
    (payload: any) => {
      const added: DbMessage[] = payload.new_messages ?? [];
      if (added.length) setMessages((prev) => [...prev, ...added]);
      if (payload.pending) {
        setPendingAction(payload.pending);
      } else {
        setPendingAction(null);
      }
      // Bubble this conversation to the top of the list.
      if (activeIdRef.current) {
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === activeIdRef.current);
          if (idx === -1) return prev;
          const copy = [...prev];
          const entry = { ...copy[idx], last_message_at: new Date().toISOString(), message_count: (copy[idx].message_count ?? 0) + added.length };
          copy.splice(idx, 1);
          copy.unshift(entry);
          return copy;
        });
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoadingRef.current) return;
      const convoId = activeIdRef.current;
      if (!convoId) return;
      lastUserTextRef.current = trimmed;
      setIsLoading(true);
      setError(null);
      setSystemNote(null);
      try {
        const auth = await authHeader();
        if (!auth) {
          setError('Not signed in.');
          return;
        }
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth },
          body: JSON.stringify({ conversation_id: convoId, message: trimmed }),
        });
        const payload = await res.json().catch(() => ({}));
        if (res.status === 401 && typeof window !== 'undefined') {
          if (!window.location.pathname.startsWith('/auth/signin')) {
            window.location.href = '/auth/signin?reason=session_expired';
          }
          return;
        }
        if (res.status === 429) {
          const ra = typeof payload?.retry_after_seconds === 'number' ? payload.retry_after_seconds : 0;
          setError(rateLimitMessage(ra));
          return;
        }
        if (res.status === 402) {
          openPaywall(payload?.reason);
          setSystemNote('Subscription required to use the assistant.');
          // Roll back the optimistic user turn — the server didn't persist it.
          return;
        }
        if (!res.ok) {
          setError(payload?.error || `Assistant error (${res.status})`);
          return;
        }
        if (payload.error) setError(payload.error);
        applyServerReply(payload);
      } catch (e: any) {
        setError(e?.message ?? 'Something went wrong.');
      } finally {
        setIsLoading(false);
      }
    },
    [applyServerReply],
  );

  const confirmPendingAction = useCallback(async (opts?: { user_typed_confirmation?: boolean }) => {
    const pending = pendingAction;
    const convoId = activeIdRef.current;
    if (!pending || !convoId || isLoadingRef.current) return;
    setIsLoading(true);
    try {
      const auth = await authHeader();
      if (!auth) {
        setError('Not signed in.');
        return;
      }
      const res = await fetch('/api/assistant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          conversation_id: convoId,
          tool_use_id: pending.tool_use_id,
          tool_name: pending.tool_name,
          preview: pending.preview,
          user_typed_confirmation: opts?.user_typed_confirmation === true,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 402) {
        openPaywall(payload?.reason);
        setPendingAction(null);
        setSystemNote('Subscription required to use the assistant.');
        return;
      }
      if (!res.ok || payload?.ok === false) {
        setError(payload?.error ?? `Execute failed (${res.status}).`);
        if (Array.isArray(payload?.new_messages)) {
          setMessages((prev) => [...prev, ...payload.new_messages]);
        }
        setPendingAction(null);
        return;
      }
      applyServerReply(payload);
    } catch (e: any) {
      setError(e?.message ?? 'Execute failed.');
    } finally {
      setIsLoading(false);
    }
  }, [pendingAction, applyServerReply]);

  const cancelPendingAction = useCallback(async () => {
    const pending = pendingAction;
    const convoId = activeIdRef.current;
    if (!pending || !convoId || isLoadingRef.current) return;
    setIsLoading(true);
    try {
      const auth = await authHeader();
      if (!auth) return;
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({
          conversation_id: convoId,
          cancel_tool_use_id: pending.tool_use_id,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 402) {
        openPaywall(payload?.reason);
        setPendingAction(null);
        setSystemNote('Subscription required to use the assistant.');
        return;
      }
      if (!res.ok) {
        setError(payload?.error ?? `Cancel failed (${res.status}).`);
        return;
      }
      applyServerReply(payload);
    } catch (e: any) {
      setError(e?.message ?? 'Cancel failed.');
    } finally {
      setIsLoading(false);
    }
  }, [pendingAction, applyServerReply]);

  const retryLastRequest = useCallback(async () => {
    const last = lastUserTextRef.current;
    if (!last || isLoadingRef.current) return;
    setError(null);
    await sendMessage(last);
  }, [sendMessage]);

  const value = useMemo<ContextValue>(
    () => ({
      isOpen,
      openPanel,
      closePanel,
      togglePanel,
      conversations,
      activeConversationId,
      isLoadingConversations,
      switchConversation,
      createConversation,
      renameConversation,
      deleteConversation,
      messages,
      pendingAction,
      isLoading,
      error,
      systemNote,
      sendMessage,
      confirmPendingAction,
      cancelPendingAction,
      retryLastRequest,
    }),
    [
      isOpen,
      openPanel,
      closePanel,
      togglePanel,
      conversations,
      activeConversationId,
      isLoadingConversations,
      switchConversation,
      createConversation,
      renameConversation,
      deleteConversation,
      messages,
      pendingAction,
      isLoading,
      error,
      systemNote,
      sendMessage,
      confirmPendingAction,
      cancelPendingAction,
      retryLastRequest,
    ],
  );

  return (
    <AssistantConversationContext.Provider value={value}>
      {children}
    </AssistantConversationContext.Provider>
  );
}

export function useAssistantConversation() {
  const ctx = useContext(AssistantConversationContext);
  if (!ctx) {
    throw new Error('useAssistantConversation must be used within AssistantConversationProvider');
  }
  return ctx;
}
