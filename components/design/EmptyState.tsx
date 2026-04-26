// Re-export the canonical EmptyState. Both `components/EmptyState` (default
// import) and `@/components/design/EmptyState` (named import) resolve to the
// same implementation so call sites stay consistent regardless of where they
// reach for it.
import EmptyStateDefault from '../EmptyState';

export { default as EmptyState } from '../EmptyState';
export default EmptyStateDefault;
