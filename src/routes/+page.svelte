<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { database } from '$lib/data/store';
  import { formatPageTitle } from '$lib/functions/format-page-title';

  $effect(() => {
    if (!database.lastItemLoaded) return;

    void goto(
      resolve(database.lastItemId === undefined ? '/manage' : `/b?id=${database.lastItemId}`)
    );
  });
</script>

<svelte:head>
  <title>{formatPageTitle('Home')}</title>
</svelte:head>
