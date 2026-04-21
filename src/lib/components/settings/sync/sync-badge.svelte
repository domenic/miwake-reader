<script lang="ts">
  interface Props {
    variant: 'success' | 'warning' | 'danger' | 'info';
    children?: import('svelte').Snippet;
  }

  let { variant, children }: Props = $props();

  const variantClasses = {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800'
  };
</script>

<span
  class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium {variantClasses[
    variant
  ]}"
>
  {@render children?.()}
</span>
