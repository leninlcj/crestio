// Single source of truth for entity-type → table mapping and which lifecycle
// model each entity uses.  The archive / soft-delete / purge APIs all consult
// this map so we don't have to hard-code per-entity behaviour at every call
// site.
//
// Lifecycle models:
//   - 'archive'       — set archived_at, hide from default views, restore forever.
//   - 'soft-delete'   — set deleted_at, hide everywhere, auto-purge after 30 days.
//   - 'void'          — invoices: status='void' + void_reason; never hard-delete.

export type LifecycleModel = 'archive' | 'soft-delete' | 'void';

export type EntityType =
  | 'student'
  | 'household'
  | 'parent'
  | 'tutor'
  | 'session'
  | 'invoice'
  | 'file'
  | 'lesson_plan'
  | 'session_template'
  | 'message_thread'
  | 'message';

export type EntitySpec = {
  /** Postgres table name. */
  table: string;
  /** Where the org id lives — almost always organization_id. */
  orgColumn: string;
  /** Lifecycle model(s) supported. First entry = default. */
  lifecycle: LifecycleModel[];
  /** Display label (singular). */
  label: string;
  /** Display label (plural). */
  labelPlural: string;
  /** Column used to display the row in trash/audit logs. */
  displayColumn: string;
  /** Soft-delete column name (deleted_at) if this entity supports it. */
  softDeleteCol?: 'deleted_at';
  /** Archive column name (archived_at) if this entity supports it. */
  archiveCol?: 'archived_at';
};

export const ENTITY_SPECS: Record<EntityType, EntitySpec> = {
  student: {
    table: 'students',
    orgColumn: 'organization_id',
    lifecycle: ['archive'],
    label: 'student',
    labelPlural: 'students',
    displayColumn: 'name',
    archiveCol: 'archived_at',
  },
  household: {
    table: 'households',
    orgColumn: 'organization_id',
    lifecycle: ['archive'],
    label: 'household',
    labelPlural: 'households',
    displayColumn: 'display_name',
    archiveCol: 'archived_at',
  },
  parent: {
    table: 'parents',
    orgColumn: 'organization_id',
    lifecycle: ['archive'],
    label: 'parent',
    labelPlural: 'parents',
    displayColumn: 'name',
    archiveCol: 'archived_at',
  },
  tutor: {
    table: 'tutors',
    orgColumn: 'organization_id',
    lifecycle: ['archive'],
    label: 'tutor',
    labelPlural: 'tutors',
    displayColumn: 'name',
    archiveCol: 'archived_at',
  },
  session: {
    table: 'sessions',
    orgColumn: 'organization_id',
    lifecycle: ['soft-delete'],
    label: 'session',
    labelPlural: 'sessions',
    displayColumn: 'subject',
    softDeleteCol: 'deleted_at',
  },
  invoice: {
    table: 'invoices',
    orgColumn: 'organization_id',
    // Invoices use the void model — but we also support soft-delete for drafts.
    lifecycle: ['void', 'soft-delete'],
    label: 'invoice',
    labelPlural: 'invoices',
    displayColumn: 'number',
    softDeleteCol: 'deleted_at',
  },
  file: {
    table: 'files',
    orgColumn: 'organization_id',
    lifecycle: ['soft-delete', 'archive'],
    label: 'file',
    labelPlural: 'files',
    displayColumn: 'display_name',
    softDeleteCol: 'deleted_at',
    archiveCol: 'archived_at',
  },
  lesson_plan: {
    table: 'lesson_plans',
    orgColumn: 'organization_id',
    lifecycle: ['archive', 'soft-delete'],
    label: 'lesson plan',
    labelPlural: 'lesson plans',
    displayColumn: 'topic',
    softDeleteCol: 'deleted_at',
    archiveCol: 'archived_at',
  },
  session_template: {
    table: 'session_templates',
    orgColumn: 'organization_id',
    lifecycle: ['archive'],
    label: 'template',
    labelPlural: 'templates',
    displayColumn: 'subject',
    archiveCol: 'archived_at',
  },
  message_thread: {
    table: 'message_threads',
    orgColumn: 'organization_id',
    lifecycle: ['archive'],
    label: 'thread',
    labelPlural: 'threads',
    displayColumn: 'last_message_preview',
    archiveCol: 'archived_at',
  },
  message: {
    table: 'messages',
    orgColumn: 'organization_id', // not actually on messages — handled via thread join
    lifecycle: ['soft-delete'],
    label: 'message',
    labelPlural: 'messages',
    displayColumn: 'body',
    softDeleteCol: 'deleted_at',
  },
};

export function getEntitySpec(type: EntityType): EntitySpec {
  return ENTITY_SPECS[type];
}

export function isValidEntityType(t: string): t is EntityType {
  return t in ENTITY_SPECS;
}
