<script lang="ts">
  import { showConfirmDialog } from '$lib/components/confirm-dialog.svelte';
  import SettingsButton from '$lib/components/settings/settings-button.svelte';
  import SettingsItem from '$lib/components/settings/settings-item.svelte';

  interface Props {
    pageName: string;
    description: string;
    message: string;
    onrestore: () => void;
  }

  let { pageName, description, message, onrestore }: Props = $props();

  async function confirmRestore() {
    const confirmed = await showConfirmDialog({
      title: `Restore ${pageName.toLowerCase()} defaults?`,
      message,
      confirmLabel: 'Restore defaults'
    });
    if (confirmed) onrestore();
  }
</script>

<footer class="border-t border-gray-400/40" aria-label={`${pageName} settings actions`}>
  <SettingsItem label={`Restore ${pageName.toLowerCase()} defaults`} {description}>
    {#snippet control()}
      <SettingsButton onclick={confirmRestore}>Restore defaults…</SettingsButton>
    {/snippet}
  </SettingsItem>
</footer>
