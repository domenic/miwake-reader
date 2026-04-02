/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { appName } from '$lib/data/env';

export function formatPageTitle(title: string) {
  if (!title) return appName;
  return `${title} | ${appName}`;
}
