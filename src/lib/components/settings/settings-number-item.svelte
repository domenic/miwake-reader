<script lang="ts">
  import SettingsItem from '$lib/components/settings/settings-item.svelte';
  import SettingsNumberInput from '$lib/components/settings/settings-number-input.svelte';
  import type { SettingsApplicabilityDetails } from '$lib/components/settings/settings-applicability.svelte';

  interface Props {
    label: string;
    description?: string;
    value: number;
    unit: string;
    min?: number;
    max?: number;
    step?: number;
    applicability?: SettingsApplicabilityDetails;
    disabled?: boolean;
    inset?: boolean;
  }

  let {
    label,
    description,
    value = $bindable(),
    unit,
    min,
    max,
    step,
    applicability,
    disabled = false,
    inset = false
  }: Props = $props();

  const componentId = $props.id();
  const controlId = `${componentId}-control`;
</script>

<SettingsItem {label} {description} {controlId} {applicability} {disabled} {inset}>
  {#snippet control({ labelledBy, describedBy })}
    <SettingsNumberInput
      id={controlId}
      bind:value
      {unit}
      {min}
      {max}
      {step}
      {disabled}
      {labelledBy}
      {describedBy}
    />
  {/snippet}
</SettingsItem>
