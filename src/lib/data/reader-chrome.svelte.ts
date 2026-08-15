/**
 * Whether the reader page is currently hiding its chrome. Owned by `routes/b/+page.svelte`;
 * read by layout-level chrome (the mobile bottom navigation) so it hides and shows in sync
 * with the reader's header. Only meaningful while the reader route is active — consumers must
 * gate on the route themselves.
 */
export const readerChrome = $state({ hidden: false });
