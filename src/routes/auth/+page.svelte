<script lang="ts">
  import { browser } from '$app/environment';
  import { faSpinner } from '@fortawesome/free-solid-svg-icons';
  import { convertAuthErrorResponse } from '$lib/functions/replication/error-handler';
  import Fa from 'svelte-fa';

  const AUTH_CHANNEL = 'miwake-auth';
  const AUTH_STORAGE_KEY = 'miwake-auth-data';

  $effect(() => {
    if (browser) {
      handleAuthRequest();
    }
  });

  async function handleAuthRequest() {
    const url = new URL(window.location.href);
    const redirectUri = `${url.origin}${url.pathname}`;

    if (url.searchParams.has('error')) {
      sendMessage({
        type: 'failure',
        payload: {
          message: 'Authorization failed',
          detail: `Authorization failed\n${url.searchParams.get('error_description') || url.searchParams.get('error') || 'Unknown error'}`
        }
      });
    } else if (url.searchParams.has('code')) {
      const stored = sessionStorage.getItem(AUTH_STORAGE_KEY);

      if (!stored) {
        sendMessage({
          type: 'failure',
          payload: {
            message: 'Auth session data not found',
            detail: 'Auth session data was not found in sessionStorage after redirect'
          }
        });
        return;
      }

      const { clientId, clientSecret, sendSecret, tokenEndpoint, codeVerifier, needsRefreshToken } =
        JSON.parse(stored);

      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('redirect_uri', redirectUri);
      params.append('client_id', clientId);

      if (sendSecret && clientSecret) {
        params.append('client_secret', clientSecret);
      }

      params.append('code', url.searchParams.get('code') || '');
      params.append('code_verifier', codeVerifier);

      fetch(tokenEndpoint, {
        method: 'POST',
        body: params.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await convertAuthErrorResponse(response));
          }

          return response.json();
        })
        .then((tokenData) => {
          const {
            access_token: accessToken,
            expires_in: expiration,
            scope,
            refresh_token: refreshToken
          } = tokenData;

          if (!accessToken || !expiration || !scope || (needsRefreshToken && !refreshToken)) {
            sendMessage({
              type: 'failure',
              payload: {
                message: 'A required authentication property was not found',
                detail: `Had Token: ${!!accessToken}\nHad Expiration: ${!!expiration}\nHad Scope: ${!!scope}\nNeeded Refresh Token: ${needsRefreshToken}\nHad Refresh Token: ${!!refreshToken}`
              }
            });
            return;
          }

          sendMessage({
            type: 'auth',
            payload: {
              accessToken,
              scope,
              expiration: Date.now() + (Number.parseInt(expiration, 10) - 600) * 1000,
              refreshToken
            }
          });
        })
        .catch((error) => {
          sendMessage({
            type: 'failure',
            payload: {
              message: 'Code authorization request failed',
              detail: `Code authorization request failed\n${error.message}`
            }
          });
        })
        .finally(() => {
          sessionStorage.removeItem(AUTH_STORAGE_KEY);
        });
    } else if (url.searchParams.has('miwake-init-auth')) {
      const stored = sessionStorage.getItem(AUTH_STORAGE_KEY);

      if (!stored) {
        sendMessage({
          type: 'failure',
          payload: {
            message: 'Auth session data not found',
            detail: 'Auth session data was not found in sessionStorage during init'
          }
        });
        return;
      }

      const { clientId, authEndpoint, scope, codeChallenge, needsRefreshToken } =
        JSON.parse(stored);

      if (!clientId || !scope || !authEndpoint) {
        sendMessage({
          type: 'failure',
          payload: {
            message: 'A required authentication input was not found',
            detail: `ClientId: ${!!clientId}\nScope: ${!!scope}\nAuthEndpoint: ${!!authEndpoint}`
          }
        });
        return;
      }

      const params = new URLSearchParams();
      params.append('client_id', clientId);
      params.append('redirect_uri', redirectUri);
      params.append('scope', scope);
      params.append('response_type', 'code');
      params.append('code_challenge_method', 'S256');
      params.append('code_challenge', codeChallenge);

      if (needsRefreshToken) {
        params.append('access_type', 'offline');
        params.append('prompt', 'consent');
      }

      window.location.assign(`${authEndpoint}?${params.toString()}`);
    } else if (url.searchParams.has('miwake-init-wait')) {
      // idle until location reassign for iOS workaround of blocking popups in async context
    } else {
      sendMessage({
        type: 'failure',
        payload: {
          message: 'Unexpected authentication context',
          detail: `Unexpected authentication context\nUrl: ${url.href}\nHash: ${url.hash || '-'}`
        }
      });
    }
  }

  function sendMessage(data: any) {
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.postMessage(data);
    channel.close();
    window.close();
  }
</script>

<div class="fixed inset-0 flex h-full w-full items-center justify-center text-7xl">
  <Fa icon={faSpinner} spin />
</div>
