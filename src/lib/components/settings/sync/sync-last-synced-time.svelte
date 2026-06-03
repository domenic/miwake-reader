<script lang="ts">
  import {
    formatExactTime,
    formatRelativeTimeLive
  } from '$lib/components/settings/sync/sync-utils';

  interface Props {
    timestamp: number;
  }

  let { timestamp }: Props = $props();

  let dateTime = $derived(new Date(timestamp).toISOString());
  let title = $derived(formatExactTime(timestamp));
</script>

<!--
  Keep the exact timestamp product-visible instead of hiding a test hook somewhere else:
  users get an exact hover value, and automation can wait for `datetime` to advance after
  a requested sync even when the relative text remains "just now".
-->
<time datetime={dateTime} {title}>{formatRelativeTimeLive(timestamp)}</time>
