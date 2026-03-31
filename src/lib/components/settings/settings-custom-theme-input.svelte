<script lang="ts">
  import type { CustomThemeValue, ThemeOption } from '$lib/data/theme-option';

  interface Props {
    label: string;
    attribute: keyof ThemeOption;
    values: CustomThemeValue;
    oncolor?: (data: { attribute: keyof ThemeOption; value: string }) => void;
    onalpha?: (data: { attribute: keyof ThemeOption; value: number }) => void;
  }

  let { label, attribute, values, oncolor, onalpha }: Props = $props();

  function handleColorChange(event: Event) {
    const target = event.target as HTMLInputElement;

    oncolor?.({ attribute, value: target.value });
  }

  function handleAlphaChange(event: Event) {
    const target = event.target as HTMLInputElement;

    let value = target.value ? parseFloat(target.value) : undefined;

    if (value === undefined || value < 0 || value > 1) {
      value = 1;
      target.value = '1';
    }

    onalpha?.({ attribute, value });
  }
</script>

<span>{label}</span>
<input
  type="color"
  class="border border-black"
  value={values.hexExpression}
  onchange={handleColorChange}
/>
<input
  type="number"
  step="0.1"
  min="0"
  max="1"
  value={values.alphaValue}
  onchange={handleAlphaChange}
/>
