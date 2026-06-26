<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { appName, basePath, clearConsoleOnReload } from '$lib/data/env';
  import BottomLeftCluster from '$lib/components/bottom-left-cluster.svelte';
  import { userFontsCacheName, type UserFont } from '$lib/data/fonts';
  import { reconcileUserFontCache } from '$lib/functions/reconcile-user-font-cache';
  import { loadConnectionsFromDb } from '$lib/data/sync/source-manager';
  import { syncEngineHandleOnline, syncEngineStart } from '$lib/data/sync/sync-engine';
  import { fontFamilyGroupOne$, userFonts$ } from '$lib/data/store';
  import { MetaTags } from 'svelte-meta-tags';
  import '../app.css';

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  let path = $derived(page.url.pathname);

  $effect(() => {
    if (browser) {
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
</script>

<svelte:window ononline={syncEngineHandleOnline} />

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

<span style={`font-family: ${$fontFamilyGroupOne$ || 'Noto Serif JP'}`}></span>
