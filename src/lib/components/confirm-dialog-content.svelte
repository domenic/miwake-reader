<script lang="ts">
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses, dialogActionsClasses, dialogTitleClasses } from '$lib/css-classes';

  interface Props {
    title: string;
    message: string;
  }

  let { title, message }: Props = $props();
</script>

<h2 class={dialogTitleClasses}>{title}</h2>
<p class="max-h-[60vh] overflow-auto whitespace-pre-line">{message}</p>
<form method="dialog" class={dialogActionsClasses}>
  <button use:ripple class={buttonClasses} value="cancel" type="submit">Cancel</button>
  <button use:ripple class={buttonClasses} value="confirm" type="submit">Confirm</button>
</form>
