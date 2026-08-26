<script lang="ts">
  import SettingsSegmentedControl from '$lib/components/settings/settings-segmented-control.svelte';
  import { viewMode$, writingMode$ } from '$lib/data/store';
  import { ViewMode } from '$lib/data/view-mode';

  const writingDirectionOptions = [
    { id: 'vertical-rl' as const, label: 'Vertical' },
    { id: 'horizontal-tb' as const, label: 'Horizontal' }
  ];

  const readingFlowOptions = [
    { id: ViewMode.Paginated, label: 'Pages' },
    { id: ViewMode.Continuous, label: 'Scroll' }
  ];

  const modeSettingClasses =
    'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 max-[30rem]:grid-cols-1';
</script>

<div
  class="grid min-w-0 divide-y divide-gray-400/40 border-y border-gray-400/40 md:sticky md:top-(--header-height) md:z-5 md:grid-cols-2 md:divide-x md:divide-y-0 md:bg-background-color"
  data-reader-mode-settings
>
  <div class={[modeSettingClasses, 'md:pe-6']}>
    <div class="font-medium">Text direction</div>
    <SettingsSegmentedControl
      label="Text direction"
      options={writingDirectionOptions}
      bind:value={$writingMode$}
    />
  </div>
  <div class={[modeSettingClasses, 'md:ps-6']}>
    <div class="font-medium">Reading flow</div>
    <SettingsSegmentedControl
      label="Reading flow"
      options={readingFlowOptions}
      bind:value={$viewMode$}
    />
  </div>
</div>
