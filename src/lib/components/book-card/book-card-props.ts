export interface BookCardProps {
  imagePath: string | Blob;
  title: string;
  author?: string;
  /**
   * Insertion order of the local `data` row (its internal autoincrement
   * key) — powers the "Added" sort. Every card in the /manage grid has it,
   * placeholders included, since they all come from local rows; only the
   * cards the storage handlers assemble for sync listings lack it.
   */
  addedOrder?: number;
  characters: number;
  lastBookModified: number;
  lastBookOpen: number;
  progress: number;
  completed: boolean;
  lastBookmarkModified: number;
  isPlaceholder: boolean;
}
