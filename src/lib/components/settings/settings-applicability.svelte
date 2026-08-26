<script module lang="ts">
  export interface SettingsApplicabilityDetails {
    label: string;
    description: string;
  }
</script>

<script lang="ts">
  interface Props extends SettingsApplicabilityDetails {
    id?: string;
    hiddenFromLabel?: boolean;
  }

  let { id, label, description, hiddenFromLabel = false }: Props = $props();
</script>

<span
  {id}
  class="shrink-0 cursor-help rounded-full bg-gray-400/15 px-2 py-0.5 text-xs/tight font-normal text-gray-600"
  title={description}
  aria-label={description}
  aria-hidden={hiddenFromLabel}
>
  {label}
</span>
