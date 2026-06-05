export type SimpleDialogContent = { title: string } & (
  | { message: string; messageHTML?: never }
  | { message?: never; messageHTML: string }
);
