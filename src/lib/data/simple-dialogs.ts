import { writable } from 'svelte/store';

export interface ConfirmDialogRequest {
  title: string;
  message: string;
  resolve: (wasCanceled: boolean) => void;
}

export const confirmDialogRequest$ = writable<ConfirmDialogRequest | undefined>(undefined);

export function confirmDialog({ title, message }: Omit<ConfirmDialogRequest, 'resolve'>) {
  return new Promise<boolean>((resolve) => {
    confirmDialogRequest$.set({
      title,
      message,
      resolve
    });
  });
}

export interface MessageDialogRequest {
  title: string;
  message: string;
}

export const messageDialogRequest$ = writable<MessageDialogRequest | undefined>(undefined);

export function messageDialog(request: MessageDialogRequest) {
  messageDialogRequest$.set(request);
}
