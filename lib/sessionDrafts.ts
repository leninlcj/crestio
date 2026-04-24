export type SessionDraft = {
  studentId: string | null;
  tutorId: string | null;
  subject: string;
  topic: string;
  sessionDate: string | null;
  sessionTime: string | null;
  durationMinutes: number | null;
  chargeRate: number | null;
  payRate: number | null;
  status: string | null;
  notesInternal: string;
  notesParentFacing: string;
  homework: string;
  homeworkDescription: string;
  homeworkDueDate: string;
  nextSessionFocus: string;
  polishedNotesDraft: string | null;
  lastEditedAt: string;
};

export type DraftIndexEntry = {
  key: string;
  type: 'new' | 'existing';
  lastEditedAt: string;
  label: string;
  studentName: string | null;
  sessionDate: string | null;
};

export function newSessionDraftKey(userId: string): string {
  return `crestio-draft-new-${userId}`;
}

export function existingSessionDraftKey(sessionId: string): string {
  return `crestio-draft-session-${sessionId}`;
}

export function draftsIndexKey(userId: string): string {
  return `crestio-drafts-index-${userId}`;
}

function hasStorage(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const t = '__crestio_draft_probe__';
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
    return true;
  } catch {
    return false;
  }
}

function emptyDraft(): SessionDraft {
  return {
    studentId: null,
    tutorId: null,
    subject: '',
    topic: '',
    sessionDate: null,
    sessionTime: null,
    durationMinutes: null,
    chargeRate: null,
    payRate: null,
    status: null,
    notesInternal: '',
    notesParentFacing: '',
    homework: '',
    homeworkDescription: '',
    homeworkDueDate: '',
    nextSessionFocus: '',
    polishedNotesDraft: null,
    lastEditedAt: new Date().toISOString(),
  };
}

function parseDraft(raw: string): SessionDraft | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    // New shape: has lastEditedAt
    if (typeof parsed.lastEditedAt === 'string') {
      return {
        studentId: typeof parsed.studentId === 'string' ? parsed.studentId : null,
        tutorId: typeof parsed.tutorId === 'string' ? parsed.tutorId : null,
        subject: typeof parsed.subject === 'string' ? parsed.subject : '',
        topic: typeof parsed.topic === 'string' ? parsed.topic : '',
        sessionDate: typeof parsed.sessionDate === 'string' ? parsed.sessionDate : null,
        sessionTime: typeof parsed.sessionTime === 'string' ? parsed.sessionTime : null,
        durationMinutes: typeof parsed.durationMinutes === 'number' ? parsed.durationMinutes : null,
        chargeRate: typeof parsed.chargeRate === 'number' ? parsed.chargeRate : null,
        payRate: typeof parsed.payRate === 'number' ? parsed.payRate : null,
        status: typeof parsed.status === 'string' ? parsed.status : null,
        notesInternal: typeof parsed.notesInternal === 'string' ? parsed.notesInternal : '',
        notesParentFacing: typeof parsed.notesParentFacing === 'string' ? parsed.notesParentFacing : '',
        homework: typeof parsed.homework === 'string' ? parsed.homework : '',
        homeworkDescription: typeof parsed.homeworkDescription === 'string' ? parsed.homeworkDescription : '',
        homeworkDueDate: typeof parsed.homeworkDueDate === 'string' ? parsed.homeworkDueDate : '',
        nextSessionFocus: typeof parsed.nextSessionFocus === 'string' ? parsed.nextSessionFocus : '',
        polishedNotesDraft: typeof parsed.polishedNotesDraft === 'string' ? parsed.polishedNotesDraft : null,
        lastEditedAt: parsed.lastEditedAt,
      };
    }

    // Old shape: notes-only. Upgrade.
    if (
      typeof parsed.notesInternal === 'string' &&
      typeof parsed.notesParentFacing === 'string' &&
      typeof parsed.homework === 'string'
    ) {
      return {
        ...emptyDraft(),
        notesInternal: parsed.notesInternal,
        notesParentFacing: parsed.notesParentFacing,
        homework: parsed.homework,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function saveDraft(
  key: string,
  data: Omit<SessionDraft, 'lastEditedAt'>,
  indexMeta?: { userId: string; type: 'new' | 'existing'; label: string; studentName: string | null; sessionDate: string | null }
): void {
  if (!hasStorage()) return;
  try {
    const lastEditedAt = new Date().toISOString();
    const toStore: SessionDraft = { ...data, lastEditedAt };
    window.localStorage.setItem(key, JSON.stringify(toStore));
    if (indexMeta) {
      upsertIndex(indexMeta.userId, {
        key,
        type: indexMeta.type,
        lastEditedAt,
        label: indexMeta.label,
        studentName: indexMeta.studentName,
        sessionDate: indexMeta.sessionDate,
      });
    }
  } catch {
    // ignore quota / write failures
  }
}

export function loadDraft(key: string): SessionDraft | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return parseDraft(raw);
  } catch {
    return null;
  }
}

export function clearDraft(key: string, userId?: string): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(key);
    if (userId) removeFromIndex(userId, key);
  } catch {
    // ignore
  }
}

function readIndex(userId: string): DraftIndexEntry[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(draftsIndexKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      // Corrupted — reset.
      window.localStorage.removeItem(draftsIndexKey(userId));
      return [];
    }
    return parsed.filter((e): e is DraftIndexEntry =>
      e &&
      typeof e === 'object' &&
      typeof e.key === 'string' &&
      (e.type === 'new' || e.type === 'existing') &&
      typeof e.lastEditedAt === 'string' &&
      typeof e.label === 'string'
    );
  } catch {
    try { window.localStorage.removeItem(draftsIndexKey(userId)); } catch {}
    return [];
  }
}

function writeIndex(userId: string, entries: DraftIndexEntry[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(draftsIndexKey(userId), JSON.stringify(entries));
  } catch {
    // ignore
  }
}

function upsertIndex(userId: string, entry: DraftIndexEntry): void {
  const entries = readIndex(userId);
  const filtered = entries.filter((e) => e.key !== entry.key);
  filtered.push(entry);
  writeIndex(userId, filtered);
}

function removeFromIndex(userId: string, key: string): void {
  const entries = readIndex(userId);
  const filtered = entries.filter((e) => e.key !== key);
  writeIndex(userId, filtered);
}

export function listDrafts(userId: string): DraftIndexEntry[] {
  const entries = readIndex(userId);
  // Also drop any entries whose underlying draft no longer exists.
  const alive = entries.filter((e) => loadDraft(e.key) !== null);
  if (alive.length !== entries.length) writeIndex(userId, alive);
  return alive.sort((a, b) => (a.lastEditedAt < b.lastEditedAt ? 1 : -1));
}

export function mostRecentDraft(userId: string, maxAgeDays = 7): DraftIndexEntry | null {
  const drafts = listDrafts(userId);
  if (drafts.length === 0) return null;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const recent = drafts.filter((d) => new Date(d.lastEditedAt).getTime() >= cutoff);
  return recent[0] ?? null;
}
