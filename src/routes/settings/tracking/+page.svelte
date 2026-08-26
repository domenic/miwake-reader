<script lang="ts">
  import { TrackerAutoPause, TrackerSkipThresholdAction } from '$lib/data/tracker-domain';
  import { showConfirmDialog } from '$lib/components/confirm-dialog.svelte';
  import { showErrorDialog } from '$lib/components/log-report-dialog.svelte';
  import SettingsItem from '$lib/components/settings/settings-item.svelte';
  import SettingsNumberItem from '$lib/components/settings/settings-number-item.svelte';
  import { createOptionalNumberSetting } from '$lib/components/settings/settings-optional-number.svelte';
  import SettingsRadioItem from '$lib/components/settings/settings-radio-item.svelte';
  import SettingsRestoreDefaults from '$lib/components/settings/settings-restore-defaults.svelte';
  import SettingsSection from '$lib/components/settings/settings-section.svelte';
  import SettingsSwitchItem from '$lib/components/settings/settings-switch-item.svelte';
  import SettingsButton from '$lib/components/settings/settings-button.svelte';
  import { trackingSettingsDefaults, trackingSettingsLimits } from '$lib/data/settings-defaults';
  import {
    addCharactersOnCompletion$,
    adjustStatisticsAfterIdleTime$,
    database,
    keepLocalReadingDataOnDeletion$,
    openTrackerOnCompletion$,
    overwriteBookCompletion$,
    dayBoundaryTime$,
    statisticsEnabled$,
    trackerAutoPause$,
    trackerAutostartTime$,
    trackerBackwardSkipThreshold$,
    trackerForwardSkipThreshold$,
    trackerIdleTime$,
    trackerPopupDetection$,
    trackerSkipThresholdAction$
  } from '$lib/data/store';
  import { formatPageTitle } from '$lib/functions/format-page-title';

  const trackerStartOptions = [
    {
      id: false,
      label: 'Manually',
      description: 'Tracking starts only when you use the tracker in the reader.',
      isDefault: true
    },
    {
      id: true,
      label: 'Automatically',
      description: 'Tracking starts after your reading position has settled for a short delay.'
    }
  ];
  const trackerAutoPauseOptions = [
    {
      id: TrackerAutoPause.OFF,
      label: 'Only for reader events',
      description: 'Pauses only when the reader itself knows that reading has stopped.'
    },
    {
      id: TrackerAutoPause.MODERATE,
      label: 'When the reader tab loses focus',
      description: 'Pauses when you switch tabs, windows, or apps.',
      isDefault: true
    },
    {
      id: TrackerAutoPause.STRICT,
      label: 'Whenever the site loses focus',
      description: 'Also pauses for popups and other focus changes within the browser.'
    }
  ];
  const completionDateOptions = [
    {
      id: false,
      label: 'Keep the first completion date',
      description: 'Finishing the book again does not replace its original completion date.',
      isDefault: true
    },
    {
      id: true,
      label: 'Use the latest completion date',
      description: 'Each completion replaces the previously recorded date.'
    }
  ];
  const retentionOptions = [
    {
      id: true,
      label: 'Keep reading data',
      description: 'Preserves bookmarks and statistics in case you add the book again.',
      isDefault: true
    },
    {
      id: false,
      label: 'Delete reading data',
      description: 'Removes bookmarks and statistics along with the local book copy.'
    }
  ];
  const thresholdActionOptions = [
    {
      id: TrackerSkipThresholdAction.IGNORE,
      label: 'Ignore the jump',
      description: 'Does not count the jumped-over characters, then continues tracking.',
      isDefault: true
    },
    {
      id: TrackerSkipThresholdAction.PAUSE,
      label: 'Pause tracking',
      description: 'Stops the session so you can check the new position before continuing.'
    }
  ];
  const trackerStartSetting = createOptionalNumberSetting(trackerAutostartTime$, {
    activeDefault: trackingSettingsLimits.autostartTime.rememberedDefault
  });
  const idlePauseSetting = createOptionalNumberSetting(trackerIdleTime$, {
    activeDefault: trackingSettingsLimits.idleTime.rememberedDefault,
    toInputValue: (seconds) => seconds / 60,
    fromInputValue: (minutes) => Math.round(minutes * 60)
  });
  const forwardThresholdSetting = createOptionalNumberSetting(trackerForwardSkipThreshold$, {
    activeDefault: trackingSettingsDefaults.trackerForwardSkipThreshold
  });
  const backwardThresholdSetting = createOptionalNumberSetting(trackerBackwardSkipThreshold$, {
    activeDefault: trackingSettingsDefaults.trackerBackwardSkipThreshold
  });
  let cleanupInProgress = $state(false);
  let cleanupStatus = $state('');

  async function deleteOrphanedReadingData() {
    const confirmed = await showConfirmDialog({
      title: 'Delete reading data for removed books?',
      message:
        'This permanently deletes bookmarks and statistics for books that are no longer in your library. Reading data for books still in your library is not affected.',
      confirmLabel: 'Delete reading data',
      danger: true
    });
    if (!confirmed) return;

    cleanupInProgress = true;
    cleanupStatus = '';
    try {
      await database.deleteOrphanedReadingData();
      cleanupStatus = 'Reading data for removed books has been deleted.';
    } catch (error) {
      await showErrorDialog({ title: 'Error deleting reading data', error });
    } finally {
      cleanupInProgress = false;
    }
  }

  function restoreDefaults() {
    $statisticsEnabled$ = trackingSettingsDefaults.statisticsEnabled;

    trackerStartSetting.reset(trackingSettingsDefaults.trackerAutostartTime);
    $trackerAutoPause$ = trackingSettingsDefaults.trackerAutoPause;
    $trackerPopupDetection$ = trackingSettingsDefaults.trackerPopupDetection;
    idlePauseSetting.reset(trackingSettingsDefaults.trackerIdleTime);
    $adjustStatisticsAfterIdleTime$ = trackingSettingsDefaults.adjustStatisticsAfterIdleTime;

    $openTrackerOnCompletion$ = trackingSettingsDefaults.openTrackerOnCompletion;
    $addCharactersOnCompletion$ = trackingSettingsDefaults.addCharactersOnCompletion;
    $overwriteBookCompletion$ = trackingSettingsDefaults.overwriteBookCompletion;
    $dayBoundaryTime$ = trackingSettingsDefaults.dayBoundaryTime;
    $keepLocalReadingDataOnDeletion$ = trackingSettingsDefaults.keepLocalReadingDataOnDeletion;

    forwardThresholdSetting.reset(trackingSettingsDefaults.trackerForwardSkipThreshold);
    backwardThresholdSetting.reset(trackingSettingsDefaults.trackerBackwardSkipThreshold);
    $trackerSkipThresholdAction$ = trackingSettingsDefaults.trackerSkipThresholdAction;
  }
</script>

<svelte:head>
  <title>{formatPageTitle('Tracking Settings')}</title>
</svelte:head>

<SettingsSection title="Reading activity">
  <SettingsSwitchItem
    label="Track reading activity"
    description="Shows the tracker in the reader and records reading time, characters, and speed."
    bind:checked={$statisticsEnabled$}
  />
</SettingsSection>

<SettingsSection
  title="Starting and pausing"
  description="These options apply when reading activity tracking is on."
>
  <SettingsRadioItem
    legend="Start tracking"
    options={trackerStartOptions}
    bind:value={trackerStartSetting.enabled}
    disabled={!$statisticsEnabled$}
  />
  {#if trackerStartSetting.enabled}
    <SettingsNumberItem
      label="Start after"
      description="A short delay avoids counting position changes while a book is still opening."
      bind:value={trackerStartSetting.inputValue}
      unit="seconds"
      min={trackingSettingsLimits.autostartTime.minimum}
      max={trackingSettingsLimits.autostartTime.maximum}
      step={trackingSettingsLimits.autostartTime.step}
      disabled={!$statisticsEnabled$}
      inset
    />
  {/if}

  <SettingsRadioItem
    legend="Pause tracking"
    description="Controls how readily focus changes pause an active session."
    options={trackerAutoPauseOptions}
    bind:value={$trackerAutoPause$}
    disabled={!$statisticsEnabled$}
  />
  {#if $trackerAutoPause$ !== TrackerAutoPause.OFF}
    <SettingsSwitchItem
      label="Keep tracking during supported dictionary lookups"
      description="Prevents supported Yomitan or jpdb Browser Reader lookups from pausing the session. Yomitan requires Secure Container to be off."
      bind:checked={$trackerPopupDetection$}
      disabled={!$statisticsEnabled$}
      inset
    />
  {/if}

  <SettingsSwitchItem
    label="Pause after no page activity"
    description="Automatically pauses a session when you stop turning pages or scrolling."
    bind:checked={idlePauseSetting.enabled}
    disabled={!$statisticsEnabled$}
  />
  {#if idlePauseSetting.enabled}
    <SettingsNumberItem
      label="Idle time"
      description="From 30 seconds to 12 hours."
      bind:value={idlePauseSetting.inputValue}
      unit="minutes"
      min={trackingSettingsLimits.idleTime.minimum / 60}
      max={trackingSettingsLimits.idleTime.maximum / 60}
      step={trackingSettingsLimits.idleTime.step / 60}
      disabled={!$statisticsEnabled$}
      inset
    />
    <SettingsSwitchItem
      label="Remove idle time from the session"
      description="Subtracts the idle period when the tracker pauses automatically."
      bind:checked={$adjustStatisticsAfterIdleTime$}
      disabled={!$statisticsEnabled$}
      inset
    />
  {/if}
</SettingsSection>

<SettingsSection title="Completing a book">
  <SettingsSwitchItem
    label="Open the tracker on completion"
    description="Shows the current session when you mark a book complete."
    bind:checked={$openTrackerOnCompletion$}
    disabled={!$statisticsEnabled$}
  />
  <SettingsSwitchItem
    label="Count unread characters on completion"
    description="Adds the characters between your current position and the end of the book."
    bind:checked={$addCharactersOnCompletion$}
    disabled={!$statisticsEnabled$}
  />
  <SettingsRadioItem
    legend="Completion date"
    options={completionDateOptions}
    bind:value={$overwriteBookCompletion$}
  />
</SettingsSection>

<SettingsSection
  title="Day boundary"
  description="Reading before this time counts toward the previous day."
>
  <SettingsItem
    label="A new reading day starts at"
    description="This affects daily statistics and reading goals."
    controlId="tracking-day-boundary"
  >
    {#snippet control({ labelledBy, describedBy })}
      <input
        id="tracking-day-boundary"
        type="time"
        class="rounded border border-gray-400 bg-white px-3 py-2"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        bind:value={$dayBoundaryTime$}
        onchange={(event) => {
          if (!(event.currentTarget as HTMLInputElement).value) {
            $dayBoundaryTime$ = trackingSettingsDefaults.dayBoundaryTime;
          }
        }}
      />
    {/snippet}
  </SettingsItem>
</SettingsSection>

<SettingsSection
  title="Reading data when removing books"
  description="Choose what happens to local bookmarks and statistics when you delete a book copy."
>
  <SettingsRadioItem
    legend="After removing a book"
    options={retentionOptions}
    bind:value={$keepLocalReadingDataOnDeletion$}
  />
  <SettingsItem
    label="Delete data left by books already removed"
    description="Permanently removes orphaned bookmarks and statistics without affecting books still in your library."
  >
    {#snippet control()}
      <SettingsButton
        variant="danger"
        disabled={cleanupInProgress}
        onclick={deleteOrphanedReadingData}
      >
        {cleanupInProgress ? 'Deleting…' : 'Delete old data…'}
      </SettingsButton>
    {/snippet}
    {#if cleanupStatus}
      <p class="text-sm text-gray-600" role="status">{cleanupStatus}</p>
    {/if}
  </SettingsItem>
</SettingsSection>

<SettingsSection title="Advanced" description="Fine-tune less common tracking options." collapsible>
  <SettingsSwitchItem
    label="Detect large forward jumps"
    description="Treats moving forward by more than a set number of characters as a skip."
    bind:checked={forwardThresholdSetting.enabled}
    disabled={!$statisticsEnabled$}
  />
  {#if forwardThresholdSetting.enabled}
    <SettingsNumberItem
      label="Forward jump threshold"
      bind:value={forwardThresholdSetting.inputValue}
      unit="characters"
      min={trackingSettingsLimits.skipThreshold.minimum}
      step={trackingSettingsLimits.skipThreshold.step}
      disabled={!$statisticsEnabled$}
      inset
    />
  {/if}
  <SettingsSwitchItem
    label="Detect large backward jumps"
    description="Treats moving backward by more than a set number of characters as a skip."
    bind:checked={backwardThresholdSetting.enabled}
    disabled={!$statisticsEnabled$}
  />
  {#if backwardThresholdSetting.enabled}
    <SettingsNumberItem
      label="Backward jump threshold"
      bind:value={backwardThresholdSetting.inputValue}
      unit="characters"
      min={trackingSettingsLimits.skipThreshold.minimum}
      step={trackingSettingsLimits.skipThreshold.step}
      disabled={!$statisticsEnabled$}
      inset
    />
  {/if}
  {#if forwardThresholdSetting.enabled || backwardThresholdSetting.enabled}
    <SettingsRadioItem
      legend="When a large jump is detected"
      options={thresholdActionOptions}
      bind:value={$trackerSkipThresholdAction$}
      disabled={!$statisticsEnabled$}
    />
  {/if}
</SettingsSection>

<SettingsRestoreDefaults
  pageName="Tracking"
  description="Returns the settings on this page to their original values without deleting recorded reading data or reading goals."
  message="This restores the settings shown on this page to their original values. Recorded reading data and reading goals will not be deleted."
  onrestore={restoreDefaults}
/>
