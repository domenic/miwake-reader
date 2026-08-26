<script lang="ts">
  import SettingsItem from '$lib/components/settings/settings-item.svelte';
  import type { SettingsApplicabilityDetails } from '$lib/components/settings/settings-applicability.svelte';
  import ToggleSwitch from '$lib/components/toggle-switch.svelte';

  interface Props {
    label: string;
    description?: string;
    checked: boolean;
    applicability?: SettingsApplicabilityDetails;
    disabled?: boolean;
    inset?: boolean;
  }

  let {
    label,
    description,
    checked = $bindable(),
    applicability,
    disabled = false,
    inset = false
  }: Props = $props();

  const componentId = $props.id();
  const controlId = `${componentId}-control`;
</script>

<SettingsItem {label} {description} {controlId} {applicability} {disabled} {inset}>
  {#snippet control({ labelledBy, describedBy })}
    <ToggleSwitch id={controlId} bind:checked {disabled} {labelledBy} {describedBy} />
  {/snippet}
</SettingsItem>
