/**
 * Reader URL for a book, keyed by its canonical title: `/b?t=<title>`.
 * `URLSearchParams` handles the percent-encoding — titles routinely contain
 * spaces, parentheses, and non-ASCII.
 */
export function getBookURL(title: string): `/b?${string}` {
  return `/b?${new URLSearchParams({ t: title })}`;
}
