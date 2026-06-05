<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { getValidStatisticsRoute } from '$lib/components/statistics/statistics-route';
  import { lastStatisticsRoute$ } from '$lib/data/store';
  import { formatPageTitle } from '$lib/functions/format-page-title';

  onMount(() => {
    goto(resolve(getValidStatisticsRoute($lastStatisticsRoute$)), {
      replaceState: true,
      noScroll: true,
      keepFocus: true
    });
  });
</script>

<svelte:head>
  <title>{formatPageTitle('Statistics')}</title>
</svelte:head>
