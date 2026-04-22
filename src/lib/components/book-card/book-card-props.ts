export interface BookCardProps {
  id: number;
  imagePath: string | Blob;
  title: string;
  characters: number;
  lastBookModified: number;
  lastBookOpen: number;
  progress: number;
  completed: boolean;
  lastBookmarkModified: number;
  isPlaceholder: boolean;
  /**
   * For placeholder books, the name of the storage-source record they
   * were originally imported from. Used by /manage's onBookClick to
   * route download-on-demand through the correct handler.
   */
  storageSource?: string;
}
