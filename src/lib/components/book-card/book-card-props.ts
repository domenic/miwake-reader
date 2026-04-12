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
}
