<script lang="ts">
  import Fa from 'svelte-fa';
  import { faCircleExclamation, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

  interface Props {
    variant: 'warning' | 'danger';
    summary: string;
    detail?: string;
    technicalDetail?: string;
  }

  let { variant, summary, detail, technicalDetail }: Props = $props();

  let showTechnical = $state(false);

  const wrapperClasses = {
    warning: 'bg-amber-50 text-amber-900',
    danger: 'bg-red-50 text-red-900'
  };
</script>

<div class="mt-2 flex items-start gap-2 rounded-md px-3 py-2 text-sm {wrapperClasses[variant]}">
  <Fa
    icon={variant === 'warning' ? faTriangleExclamation : faCircleExclamation}
    class="mt-0.5 shrink-0"
  />
  <div class="flex-1">
    <div class="font-medium">{summary}</div>
    {#if detail}
      <div class="mt-0.5 text-sm opacity-90">{detail}</div>
    {/if}
    {#if technicalDetail}
      <button
        type="button"
        class="mt-1 cursor-pointer text-xs underline hover:no-underline"
        onclick={() => (showTechnical = !showTechnical)}
      >
        {showTechnical ? 'Hide' : 'Show'} technical details
      </button>
      {#if showTechnical}
        <pre
          class="mt-1 overflow-auto rounded bg-black/5 px-2 py-1 font-mono text-xs whitespace-pre-wrap">{technicalDetail}</pre>
      {/if}
    {/if}
  </div>
</div>
