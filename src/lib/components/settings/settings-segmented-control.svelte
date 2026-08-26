<script module lang="ts">
  export interface SettingsSegmentedControlOption<T> {
    id: T;
    label: string;
  }

  export interface SettingsSegmentedControlProps<T> {
    label: string;
    options: SettingsSegmentedControlOption<T>[];
    value: T;
    disabled?: boolean;
    labelledBy?: string;
    describedBy?: string;
  }
</script>

<script lang="ts" generics="T">
  let {
    label,
    options,
    value = $bindable(),
    disabled = false,
    labelledBy,
    describedBy
  }: SettingsSegmentedControlProps<T> = $props();

  const componentId = $props.id();
</script>

<fieldset class="min-w-0" {disabled} aria-labelledby={labelledBy} aria-describedby={describedBy}>
  <legend class="sr-only">{label}</legend>
  <div class="inline-flex max-w-full overflow-x-auto rounded-md border border-gray-400 bg-white">
    {#each options as option, index (option.id)}
      <label class={['shrink-0', index > 0 && 'border-s border-gray-400']}>
        <input
          type="radio"
          class="peer sr-only"
          name={componentId}
          value={option.id}
          bind:group={value}
        />
        <span
          class="block whitespace-nowrap px-3 py-2 leading-tight text-gray-900 transition-colors peer-checked:bg-accent-color peer-checked:text-white peer-focus-visible:relative peer-focus-visible:z-10 peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-accent-color"
          >{option.label}</span
        >
      </label>
    {/each}
  </div>
</fieldset>
