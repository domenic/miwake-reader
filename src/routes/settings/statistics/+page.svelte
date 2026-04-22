<script lang="ts">
  import { faSpinner } from '@fortawesome/free-solid-svg-icons';
  import {
    TrackerAutoPause,
    TrackerSkipThresholdAction
  } from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
  import ButtonToggleGroup from '$lib/components/button-toggle-group/button-toggle-group.svelte';
  import {
    optionsForToggle,
    type ToggleOption
  } from '$lib/components/button-toggle-group/toggle-option';
  import SettingsItemGroup from '$lib/components/settings/settings-item-group.svelte';
  import SettingsReadingGoals from '$lib/components/settings/settings-reading-goals.svelte';
  import { inputClasses } from '$lib/css-classes';
  import {
    addCharactersOnCompletion$,
    adjustStatisticsAfterIdleTime$,
    database,
    keepLocalStatisticsOnDeletion$,
    openTrackerOnCompletion$,
    overwriteBookCompletion$,
    startDayHoursForTracker$,
    statisticsEnabled$,
    trackerAutoPause$,
    trackerAutostartTime$,
    trackerBackwardSkipThreshold$,
    trackerForwardSkipThreshold$,
    trackerIdleTime$,
    trackerPopupDetection$,
    trackerSkipThresholdAction$
  } from '$lib/data/store';
  import { messageDialog } from '$lib/data/simple-dialogs';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import { secondsToMinutes } from '$lib/functions/statistic-util';
  import Fa from 'svelte-fa';

  const optionsForTrackerAutoPause: ToggleOption<TrackerAutoPause>[] = [
    { id: TrackerAutoPause.OFF, text: 'Off' },
    { id: TrackerAutoPause.MODERATE, text: 'Moderate' },
    { id: TrackerAutoPause.STRICT, text: 'Strict' }
  ];

  const optionsForTrackerSkipThresholdAction: ToggleOption<TrackerSkipThresholdAction>[] = [
    { id: TrackerSkipThresholdAction.IGNORE, text: 'Ignore' },
    { id: TrackerSkipThresholdAction.PAUSE, text: 'Pause Tracker' }
  ];

  let showSpinner = $state(false);
  let startOfDayHours = $derived(`${`${$startDayHoursForTracker$}`.padStart(2, '0')}:00`);
  let trackerIdleTimeInMin = $state(secondsToMinutes($trackerIdleTime$));

  $effect(() => {
    trackerIdleTimeInMin = secondsToMinutes($trackerIdleTime$);
  });

  let trackerAutoPauseTooltip = $derived.by(() => {
    switch ($trackerAutoPause$) {
      case TrackerAutoPause.OFF:
        return 'Tracker does not auto pause except for certain reader events';
      case TrackerAutoPause.STRICT:
        return 'Tracker will auto pause on certain reader events and any kind of site focus loss (e. g. dictionary popup)';
      default:
        return 'Tracker will auto pause on certain reader events and when the reader tab loses focus';
    }
  });
</script>

<svelte:head>
  <title>{formatPageTitle('Statistics Settings')}</title>
</svelte:head>

<div class="grid grid-cols-1 items-center sm:grid-cols-2 sm:gap-6 lg:gap-8 lg:grid-cols-3">
  <SettingsItemGroup
    title="Keep Local Data on Deletion"
    tooltip={'Determines if local statistics will be deleted or not when removing a local book copy'}
  >
    <div class="flex items-center">
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={$keepLocalStatisticsOnDeletion$}
      />
      <button
        type="button"
        class="ml-4 hover:underline"
        onclick={() => {
          showSpinner = true;
          database
            .clearZombieStatistics()
            .catch(({ message }) =>
              messageDialog({
                title: 'Error',
                message: `Error clearing zombie statistics: ${message}`
              })
            )
            .finally(() => (showSpinner = false));
        }}
      >
        Clear Zombie Statistics
      </button>
    </div>
  </SettingsItemGroup>
  <SettingsItemGroup
    title="Overwrite Book Completion"
    tooltip={`Determines if only the first Book Completion will be tracked or if it always updates to the latest one`}
  >
    <ButtonToggleGroup
      options={optionsForToggle}
      bind:selectedOptionId={$overwriteBookCompletion$}
    />
  </SettingsItemGroup>
  <SettingsItemGroup
    title={`Start Day Hours: ${startOfDayHours}`}
    tooltip={'Determines at which time a new day starts.\nData before this point will be counted towards the previous day'}
  >
    <input
      type="range"
      step="1"
      min="0"
      max="23"
      class={inputClasses}
      bind:value={$startDayHoursForTracker$}
    />
  </SettingsItemGroup>
  <SettingsItemGroup
    title="Enable Statistics"
    tooltip="Enables the tracker icon in the bottom left corner of the reader which you need to use to start tracking your reading session"
  >
    <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={$statisticsEnabled$} />
  </SettingsItemGroup>
  {#if $statisticsEnabled$}
    <SettingsItemGroup title="Tracker Auto Pause" tooltip={trackerAutoPauseTooltip}>
      <ButtonToggleGroup
        options={optionsForTrackerAutoPause}
        bind:selectedOptionId={$trackerAutoPause$}
      />
    </SettingsItemGroup>
    <SettingsItemGroup title="Open Tracker on Completion">
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={$openTrackerOnCompletion$}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Update on Completion"
      tooltip={`Determines if the missing amount of characters between the current position and the book total will be added to the statistics or not`}
    >
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={$addCharactersOnCompletion$}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Autostart tracker (sec)"
      tooltip={'Time in seconds without a change to the character count after which the tracker will initially auto start (0 = disabled, higher value recommended to avoid race conditions)'}
    >
      <input
        type="number"
        class={inputClasses}
        step="1"
        min="0"
        bind:value={$trackerAutostartTime$}
        onblur={() => {
          const newValue = Number.parseFloat(`${$trackerAutostartTime$ ?? 0}`);

          if (isNaN(newValue) || newValue < 1) {
            $trackerAutostartTime$ = 0;
          }
        }}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Idle Time (min)"
      tooltip={'Time in minutes after which the tracker will auto pause without page interaction (0 = disabled, max 12h)'}
    >
      <input
        type="number"
        class={inputClasses}
        step="0.5"
        min="0"
        bind:value={trackerIdleTimeInMin}
        onblur={() => {
          if (!trackerIdleTimeInMin || trackerIdleTimeInMin < 0) {
            $trackerIdleTime$ = 0;
          } else if (trackerIdleTimeInMin > 43200) {
            $trackerIdleTime$ = 900;
          } else {
            $trackerIdleTime$ = Math.floor(trackerIdleTimeInMin * 60);
          }
        }}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Forward Skip Threshold"
      tooltip={'Amount of positive characters passed between a tick after which a threshold action is triggered (0 = disabled)'}
    >
      <input
        type="number"
        class={inputClasses}
        step="1"
        min="0"
        bind:value={$trackerForwardSkipThreshold$}
        onblur={() => {
          if ($trackerForwardSkipThreshold$ === 0) {
            $trackerForwardSkipThreshold$ = 0;
          } else if (!$trackerForwardSkipThreshold$ || $trackerForwardSkipThreshold$ < 0) {
            $trackerForwardSkipThreshold$ = 2700;
          }
        }}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Backward Skip Threshold"
      tooltip={'Amount of negative characters passed between a tick after which a threshold action is triggered (0 = disabled)'}
    >
      <input
        type="number"
        class={inputClasses}
        step="1"
        bind:value={$trackerBackwardSkipThreshold$}
        onblur={() => {
          if ($trackerBackwardSkipThreshold$ < 0) {
            $trackerBackwardSkipThreshold$ = Math.abs($trackerBackwardSkipThreshold$);
          } else if ($trackerBackwardSkipThreshold$ === 0) {
            $trackerBackwardSkipThreshold$ = 0;
          } else if (!$trackerBackwardSkipThreshold$) {
            $trackerBackwardSkipThreshold$ = 2700;
          }
        }}
      />
    </SettingsItemGroup>
    {#if $trackerForwardSkipThreshold$ || $trackerBackwardSkipThreshold$}
      <SettingsItemGroup
        title="Threshold Action"
        tooltip={`Determines what action will be executed in case a skip threshold was triggered`}
      >
        <ButtonToggleGroup
          options={optionsForTrackerSkipThresholdAction}
          bind:selectedOptionId={$trackerSkipThresholdAction$}
        />
      </SettingsItemGroup>
    {/if}
    {#if $trackerAutoPause$ !== TrackerAutoPause.OFF}
      <SettingsItemGroup
        title="Dictionary Detection"
        tooltip={`If enabled auto pause is skipped if open yomitan/jpdb-browser-reader was detected - yomitan requires disabled 'Secure Container' settings`}
      >
        <ButtonToggleGroup
          options={optionsForToggle}
          bind:selectedOptionId={$trackerPopupDetection$}
        />
      </SettingsItemGroup>
    {/if}
    {#if $trackerIdleTime$ > 0}
      <SettingsItemGroup
        title="Rollback Statistics on Idle"
        tooltip={`If enabled attempts to rollback statistics by subtracting the idled time value back from the session`}
      >
        <ButtonToggleGroup
          options={optionsForToggle}
          bind:selectedOptionId={$adjustStatisticsAfterIdleTime$}
        />
      </SettingsItemGroup>
    {/if}
    <SettingsReadingGoals onspinner={(value) => (showSpinner = value)} />
  {/if}
  {#if showSpinner}
    <div class="tap-highlight-transparent fixed inset-0 bg-black/20"></div>
    <div class="fixed inset-0 flex h-full w-full items-center justify-center text-7xl">
      <Fa icon={faSpinner} spin />
    </div>
  {/if}
</div>
