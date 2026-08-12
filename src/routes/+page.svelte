<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { database } from '$lib/data/store';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import { getBookURL } from '$lib/functions/book-url';

  $effect(() => {
    if (!database.lastItemLoaded) return;

    void goto(
      resolve(database.lastItemTitle === undefined ? '/manage' : getBookURL(database.lastItemTitle))
    );
  });
</script>

<svelte:head>
  <title>{formatPageTitle('Home')}</title>
</svelte:head>
