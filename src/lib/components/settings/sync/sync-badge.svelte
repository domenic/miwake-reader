<script lang="ts">
  interface Props {
    variant: 'success' | 'warning' | 'danger' | 'info';
    children?: import('svelte').Snippet;
  }

  let { variant, children }: Props = $props();

  const variantClasses = {
    success: 'bg-green-50 text-green-800 border-green-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    danger: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200'
  };
</script>

<span
  class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium {variantClasses[
    variant
  ]}"
>
  {@render children?.()}
</span>
