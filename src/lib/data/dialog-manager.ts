import type { Component } from 'svelte';
import { writableSubject } from '$lib/functions/svelte/store';

export interface Dialog {
  component: Component<any> | string;
  props?: Record<string, any>;
  disableCloseOnClick?: boolean;
  zIndex?: string;
}

const dialogs$ = writableSubject<Dialog[]>([]);

export const dialogManager = {
  dialogs$
};
