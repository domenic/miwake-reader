/**
 * How to combine fresh data (e.g. just-pulled remote stats) with the
 * existing local data when persisting:
 *
 *   - 'merge'   — union by key, keep both sides' rows.
 *   - 'replace' — wipe existing and write only the new data.
 *
 * The string values are persisted in localStorage (see
 * statisticsMergeMode$ / readingGoalsMergeMode$ in store.ts), so don't
 * change them without a migration.
 */
export type MergeMode = 'merge' | 'replace';
