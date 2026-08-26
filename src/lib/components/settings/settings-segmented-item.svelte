<script lang="ts" generics="T">
  import type { SettingsApplicabilityDetails } from '$lib/components/settings/settings-applicability.svelte';
  import SettingsItem from '$lib/components/settings/settings-item.svelte';
  import SettingsSegmentedControl from '$lib/components/settings/settings-segmented-control.svelte';
  import type { SettingsSegmentedControlProps } from '$lib/components/settings/settings-segmented-control.svelte';

  interface Props extends SettingsSegmentedControlProps<T> {
    description?: string;
    applicability?: SettingsApplicabilityDetails;
    inset?: boolean;
  }

  let {
    label,
    description,
    options,
    value = $bindable(),
    applicability,
    disabled = false,
    inset = false
  }: Props = $props();
</script>

<SettingsItem {label} {description} {applicability} {disabled} {inset}>
  {#snippet control({ labelledBy, describedBy })}
    <SettingsSegmentedControl {label} {options} bind:value {disabled} {labelledBy} {describedBy} />
  {/snippet}
</SettingsItem>
