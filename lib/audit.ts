import type { SupabaseClient } from '@supabase/supabase-js';

// Append-only writes to public.audit_log.  Failures are non-fatal — we always
// prefer the action to succeed even if the log write fails (logged to stderr).
//
// Action names follow "<entity>.<verb>", e.g. "student.archived",
// "session.deleted", "bulk.invoices.sent".  Keep them stable — the audit log
// page surfaces them in plain language.

export type AuditEntry = {
  organizationId: string;
  actorUserId: string | null;
  actorRole?: 'owner' | 'tutor' | 'parent' | 'student' | 'system';
  action: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
};

export async function writeAudit(
  client: SupabaseClient,
  entry: AuditEntry,
): Promise<void> {
  try {
    await client.from('audit_log').insert({
      organization_id: entry.organizationId,
      actor_user_id: entry.actorUserId,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      payload: entry.payload ?? {},
    });
  } catch (err) {
    console.error('[audit] write failed:', err);
  }
}

export async function writeAuditBatch(
  client: SupabaseClient,
  entries: AuditEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  try {
    await client.from('audit_log').insert(
      entries.map((e) => ({
        organization_id: e.organizationId,
        actor_user_id: e.actorUserId,
        actor_role: e.actorRole ?? null,
        action: e.action,
        entity_type: e.entityType ?? null,
        entity_id: e.entityId ?? null,
        payload: e.payload ?? {},
      })),
    );
  } catch (err) {
    console.error('[audit] batch write failed:', err);
  }
}

// Friendly action → English helpers.  Used by the audit log UI when rendering
// rows.  Falls back to the raw action when no template matches.
export function describeAction(
  action: string,
  payload: Record<string, unknown> = {},
): string {
  const name = (payload.entity_name ?? payload.name ?? payload.label ?? '') as string;
  const count = (payload.count ?? null) as number | null;
  switch (action) {
    case 'student.archived':       return `Archived student${name ? ` "${name}"` : ''}`;
    case 'student.restored':       return `Restored student${name ? ` "${name}"` : ''}`;
    case 'student.created':        return `Created student${name ? ` "${name}"` : ''}`;
    case 'household.archived':     return `Archived household${name ? ` "${name}"` : ''}`;
    case 'household.restored':     return `Restored household${name ? ` "${name}"` : ''}`;
    case 'parent.archived':        return `Archived parent${name ? ` "${name}"` : ''}`;
    case 'parent.restored':        return `Restored parent${name ? ` "${name}"` : ''}`;
    case 'tutor.archived':         return `Removed tutor${name ? ` "${name}"` : ''}`;
    case 'tutor.restored':         return `Reinstated tutor${name ? ` "${name}"` : ''}`;
    case 'session.deleted':        return `Deleted session${name ? ` "${name}"` : ''}`;
    case 'session.restored':       return `Restored session${name ? ` "${name}"` : ''}`;
    case 'session.created':        return `Created session${name ? ` for ${name}` : ''}`;
    case 'invoice.deleted':        return `Deleted invoice${name ? ` ${name}` : ''}`;
    case 'invoice.voided':         return `Voided invoice${name ? ` ${name}` : ''}`;
    case 'invoice.restored':       return `Restored invoice${name ? ` ${name}` : ''}`;
    case 'invoice.sent':           return `Sent invoice${name ? ` ${name}` : ''}`;
    case 'file.deleted':           return `Deleted file${name ? ` "${name}"` : ''}`;
    case 'file.archived':          return `Archived file${name ? ` "${name}"` : ''}`;
    case 'file.restored':          return `Restored file${name ? ` "${name}"` : ''}`;
    case 'lesson_plan.deleted':    return `Deleted lesson plan${name ? ` "${name}"` : ''}`;
    case 'lesson_plan.archived':   return `Archived lesson plan${name ? ` "${name}"` : ''}`;
    case 'session_template.archived': return `Paused template${name ? ` "${name}"` : ''}`;
    case 'message_thread.archived': return `Archived thread${name ? ` "${name}"` : ''}`;
    case 'message.deleted':        return `Deleted message`;
    case 'pin.created':            return `Pinned ${name || 'item'}`;
    case 'pin.removed':            return `Unpinned ${name || 'item'}`;
    case 'student.moved':          return `Moved ${name || 'student'} to another tutor`;
    case 'session.moved':          return `Reassigned session to another tutor`;
    case 'purge.completed':        return `Permanently deleted ${count ?? 'items'}`;
    case 'bulk.sessions.polished': return `Polished ${count ?? 'multiple'} sessions`;
    case 'bulk.invoices.sent':     return `Sent ${count ?? 'multiple'} invoices`;
    default: {
      // "student.archived" → "Student archived"
      const [type, verb] = action.split('.');
      if (!type || !verb) return action;
      const cap = type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
      return `${cap} ${verb}`;
    }
  }
}
