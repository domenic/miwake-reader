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

export interface NumberDialogRequest {
  title: string;
  minValue: number;
  maxValue: number;
  resolve: (value: number | undefined) => void;
}

export const numberDialogRequest$ = writable<NumberDialogRequest | undefined>(undefined);

export function numberDialog({ title, minValue, maxValue }: Omit<NumberDialogRequest, 'resolve'>) {
  return new Promise<number | undefined>((resolve) => {
    numberDialogRequest$.set({
      title,
      minValue,
      maxValue,
      resolve
    });
  });
}
