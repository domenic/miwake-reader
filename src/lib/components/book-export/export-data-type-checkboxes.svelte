<script lang="ts">
  import { StorageDataType } from '$lib/data/storage/storage-types';

  interface Props {
    dataToReplicate: StorageDataType[];
  }

  let { dataToReplicate = $bindable() }: Props = $props();
</script>

<div class="flex flex-col gap-2">
  <label>
    <input type="checkbox" name="data" value="data" bind:group={dataToReplicate} />
    Books
  </label>
  <label>
    <input type="checkbox" name="bookmark" value="bookmark" bind:group={dataToReplicate} />
    Bookmarks
  </label>
  <label>
    <input type="checkbox" name="statistic" value="statistic" bind:group={dataToReplicate} />
    Statistics
  </label>
</div>
