<script lang="ts">
  import { resolve } from '$app/paths';
</script>

<div class="sync-safe-px mx-auto max-w-2xl py-8">
  <h1 class="mb-6 text-2xl font-bold">Terms of Service</h1>

  <p class="mb-4">
    Hi. Miwake Reader is a small, free, open-source web app made by one person in their spare time.
    This page exists because OAuth providers want a link to one.
  </p>

  <p class="mb-4">
    The actual "terms": use the app, enjoy the app, don't do anything illegal with it, and please
    don't sue me if it breaks. It probably will break occasionally. Keep your own backups of
    anything you care about.
  </p>

  <p class="mb-4">
    For the boring details about what data the app touches and where it goes, see the <a
      class="underline"
      href={resolve('/privacy')}>Privacy Policy</a
    >. That one is written a bit more carefully.
  </p>

  <p>That's it. Happy reading.</p>
</div>
