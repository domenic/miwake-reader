/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { StorageKey } from './storage/storage-types';
import type { Component } from 'svelte';
import { writableSubject } from '$lib/functions/svelte/store';

export interface SyncSelection {
  id: string;
  label: string;
  type: StorageKey;
}

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
