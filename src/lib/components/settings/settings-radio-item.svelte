<script lang="ts" generics="T">
  import SettingsItem from '$lib/components/settings/settings-item.svelte';
  import SettingsRadioGroup from '$lib/components/settings/settings-radio-group.svelte';
  import type { SettingsRadioGroupProps } from '$lib/components/settings/settings-radio-group.svelte';

  let {
    legend,
    labelledBy,
    id,
    description,
    options,
    value = $bindable(),
    applicability,
    disabled = false,
    optionControl
  }: SettingsRadioGroupProps<T> = $props();
</script>

<SettingsItem {disabled}>
  <SettingsRadioGroup
    {legend}
    {labelledBy}
    {id}
    {description}
    {options}
    {applicability}
    bind:value
    {disabled}
    {optionControl}
  />
</SettingsItem>
