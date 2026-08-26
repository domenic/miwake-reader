<script module lang="ts">
  export interface SettingsItemControlDetails {
    labelledBy?: string;
    describedBy?: string;
  }
</script>

<script lang="ts">
  import SettingsApplicability, {
    type SettingsApplicabilityDetails
  } from '$lib/components/settings/settings-applicability.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    class?: string;
    label?: string;
    description?: string;
    controlId?: string;
    control?: Snippet<[SettingsItemControlDetails]>;
    children?: Snippet;
    applicability?: SettingsApplicabilityDetails;
    disabled?: boolean;
    inset?: boolean;
    tone?: 'default' | 'danger';
  }

  let {
    class: className,
    label,
    description,
    controlId,
    control,
    children,
    applicability,
    disabled = false,
    inset = false,
    tone = 'default'
  }: Props = $props();

  const componentId = $props.id();
  let labelClass = $derived(['font-medium', tone === 'danger' && 'text-red-800']);
  let labelledBy = $derived(label ? `${componentId}-label` : undefined);
  let descriptionId = $derived(description ? `${componentId}-description` : undefined);
  let applicabilityId = $derived(applicability ? `${componentId}-applicability` : undefined);
  let describedBy = $derived(
    [descriptionId, applicabilityId]
      .filter((descriptionId) => descriptionId !== undefined)
      .join(' ') || undefined
  );
</script>

<div
  class={[
    'min-w-0 py-3.5',
    (label || control) &&
      'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 max-[30rem]:grid-cols-[minmax(0,1fr)]',
    disabled && 'opacity-[0.55]',
    inset && 'ms-7 border-s border-gray-400/40 ps-4',
    className
  ]}
  aria-disabled={disabled}
>
  {#if label || control}
    {#if controlId}
      <label
        for={controlId}
        class={['block min-w-0', disabled ? 'cursor-not-allowed' : 'cursor-pointer']}
      >
        <span class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span id={labelledBy} class={labelClass}>{label}</span>
          {#if applicability}
            <SettingsApplicability id={applicabilityId} {...applicability} />
          {/if}
        </span>
        {#if description}
          <span id={descriptionId} class="mt-0.5 block text-sm text-gray-600">
            {description}
          </span>
        {/if}
      </label>
    {:else}
      <div class="min-w-0">
        <div class={['flex flex-wrap items-baseline gap-x-2 gap-y-0.5', labelClass]}>
          <span id={labelledBy}>{label}</span>
          {#if applicability}
            <SettingsApplicability id={applicabilityId} {...applicability} />
          {/if}
        </div>
        {#if description}
          <p id={descriptionId} class="mt-0.5 text-sm text-gray-600">{description}</p>
        {/if}
      </div>
    {/if}

    {#if control}
      <div class="min-w-0 justify-self-end max-[30rem]:justify-self-start">
        {@render control({ labelledBy, describedBy })}
      </div>
    {/if}

    {#if children}
      <div class="col-span-full min-w-0 empty:hidden">
        {@render children()}
      </div>
    {/if}
  {:else if children}
    {@render children()}
  {/if}
</div>
