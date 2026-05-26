<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { appName, basePath, clearConsoleOnReload } from '$lib/data/env';
  import { dialogManager, type Dialog } from '$lib/data/dialog-manager';
  import BottomLeftCluster from '$lib/components/bottom-left-cluster.svelte';
  import { userFontsCacheName, type UserFont } from '$lib/data/fonts';
  import { reconcileUserFontCache } from '$lib/functions/reconcile-user-font-cache';
  import { loadConnectionsFromDb } from '$lib/data/sync/source-manager';
  import { syncEngineStart } from '$lib/data/sync/sync-engine';
  import { fontFamilyGroupOne$, isOnline$, userFonts$ } from '$lib/data/store';
  import { dummyFn, isMobile, isMobile$ } from '$lib/functions/utils';
  import { MetaTags } from 'svelte-meta-tags';
  import '../app.css';

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  let path = $state('');
  let dialogs: Dialog[] = $state([]);
  let clickOnCloseDisabled = $state(false);
  let zIndex = $state('');

  $effect(() => {
    if (browser) {
      isMobile$.next(isMobile(window));
      addUserFonts($userFonts$);
    }
  });

  if (browser) {
    reconcileUserFontCache();
    loadConnectionsFromDb()
      .then(() => syncEngineStart())
      .catch(() => {
        // Ignore boot errors; the sync UI still works off whatever the
        // stores happen to hold.
      });
  }

  if (clearConsoleOnReload && import.meta.hot) {
    // eslint-disable-next-line no-console
    import.meta.hot.on('vite:beforeUpdate', () => console.clear());
  }

  onMount(() => {
    void tick().then(() => {
      // `src/app.html` marks the SSR shell inert because it may be visible before Svelte has
      // attached handlers. Remove that guard only after mount + `tick()`, so both real users and
      // Playwright see controls become actionable when client-side behavior is actually installed.
      document.getElementById('app-shell')?.removeAttribute('inert');
    });
  });

  function addUserFonts(userFonts: UserFont[]) {
    let styleContent = '';

    for (let index = 0, { length } = userFonts; index < length; index += 1) {
      const userFont = userFonts[index];
      styleContent += `@font-face{font-family: '${userFont.name}';font-style: normal;font-weight: 400;font-display: swap;src: url('${userFont.path}')}\n`;
    }

    let styleElement = document.getElementById(userFontsCacheName);

    if (!styleContent) {
      styleElement?.remove();
      return;
    }

    const textNode = document.createTextNode(styleContent);

    if (styleElement) {
      styleElement.replaceChild(textNode, styleElement.childNodes[0]);
    } else {
      styleElement = document.createElement('style');
      styleElement.id = userFontsCacheName;

      styleElement.appendChild(textNode);
      document.head.append(styleElement);
    }
  }

  function closeAllDialogs() {
    dialogManager.dialogs$.next([]);
    clickOnCloseDisabled = false;
    zIndex = '';
  }

  dialogManager.dialogs$.subscribe((d) => {
    clickOnCloseDisabled = d[0]?.disableCloseOnClick ?? false;
    zIndex = d[0]?.zIndex ?? '';
    dialogs = d;
  });

  $effect(() => {
    path = page.url.pathname;
  });
</script>

<svelte:window bind:online={$isOnline$} />

<MetaTags
  title={appName}
  description="Online e-book reader that supports dictionary extensions like Yomitan"
  canonical="{basePath}{path !== '/' ? path : ''}"
  openGraph={{
    type: 'website',
    images: [
      {
        url: `${basePath}/icon-512x512.png`,
        width: 512,
        height: 512
      }
    ]
  }}
/>

{@render children?.()}

<BottomLeftCluster />

{#if dialogs.length > 0}
  <div class="writing-horizontal-tb fixed inset-0 z-50 h-full w-full" style:z-index={zIndex}>
    <div
      tabindex="0"
      role="button"
      class="tap-highlight-transparent absolute inset-0 bg-black/32"
      onclick={() => {
        if (!clickOnCloseDisabled) {
          closeAllDialogs();
        }
      }}
      onkeyup={dummyFn}
    ></div>

    <div
      class="relative top-1/2 left-1/2 inline-block max-w-[80vw] -translate-x-1/2 -translate-y-1/2"
    >
      {#each dialogs as dialog}
        {#if typeof dialog.component === 'string'}
          {@html dialog.component}
        {:else}
          <dialog.component {...dialog.props} onclose={closeAllDialogs} />
        {/if}
      {/each}
    </div>
  </div>
{/if}

<span style={`font-family: ${$fontFamilyGroupOne$ || 'Noto Serif JP'}`}></span>
