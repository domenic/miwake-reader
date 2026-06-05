<script module lang="ts">
  import SettingsReadingGoalsMerge from '$lib/components/settings/settings-reading-goals-merge.svelte';
  import { showDialog } from '$lib/components/simple-dialogs';
  import type { ReadingGoal, ReadingGoalSaveResult } from '$lib/data/reading-goal';

  export function showSettingsReadingGoalsMergeDialog(params: {
    currentReadingGoal: ReadingGoal;
    newReadingGoal: ReadingGoal;
    startDayHoursForTracker: number;
  }): Promise<ReadingGoalSaveResult> {
    let result = emptyReadingGoalSaveResult();

    return showDialog<ReadingGoalSaveResult>(
      SettingsReadingGoalsMerge,
      {
        ...params,
        captureResult: (nextResult: ReadingGoalSaveResult) => {
          result = nextResult;
        }
      },
      {
        closedBy: 'closerequest',
        resolveResult: (returnValue) =>
          returnValue === 'confirm' || returnValue === 'error'
            ? result
            : emptyReadingGoalSaveResult()
      }
    );
  }

  function emptyReadingGoalSaveResult(error = ''): ReadingGoalSaveResult {
    return {
      readingGoalsToDelete: [],
      readingGoalsToInsert: [],
      error
    };
  }
</script>

<script lang="ts">
  import { faSpinner } from '@fortawesome/free-solid-svg-icons';
  import SyncButton from '$lib/components/settings/sync/sync-button.svelte';
  import { inputClasses } from '$lib/css-classes';
  import type { BooksDbReadingGoal } from '$lib/data/database/books-db/versions/books-db';
  import {
    getDateRangeLabel,
    getReadingGoalWindow,
    type ReadingGoalArchivalOption
  } from '$lib/data/reading-goal';
  import { database } from '$lib/data/store';
  import {
    advanceDateDays,
    getDate,
    getDateKey,
    getPreviousDayKey,
    secondsToMinutes
  } from '$lib/functions/statistic-util';
  import { onMount, tick, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import Fa from 'svelte-fa';

  interface ArchiveOption extends ReadingGoalArchivalOption {
    id: string;
    description?: string;
  }

  interface Props {
    currentReadingGoal: ReadingGoal;
    newReadingGoal: ReadingGoal;
    startDayHoursForTracker: number;
    captureResult: (result: ReadingGoalSaveResult) => void;
  }

  let { currentReadingGoal, newReadingGoal, startDayHoursForTracker, captureResult }: Props =
    $props();

  const initial = untrack(() => ({
    currentReadingGoal,
    newReadingGoal,
    startDayHoursForTracker
  }));

  let rootElement = $state<HTMLDivElement>();
  let isLoading = $state(true);
  let newStartDate = $state(initial.newReadingGoal.goalStartDate);
  let archiveReadingGoal = $state(false);
  let archivalOptions: ArchiveOption[] = $state([]);
  let selectedArchiveOptionId = $state('');
  let archivalMaxDate = $state('');
  let archivalStartDate = $state('');
  let archivalEndDate = $state('');
  let archivalOriginalEndDate = $state('');
  let error = $state('');
  let existingReadingGoals: BooksDbReadingGoal[] = $state([]);

  let selectedArchiveOption = $derived(
    archivalOptions.find((option) => option.id === selectedArchiveOptionId)
  );

  let archiveDateEditable = $derived(selectedArchiveOption?.editable ?? false);

  let readingGoalsToReplace = $derived(
    existingReadingGoals.filter(
      (readingGoal) => readingGoal.goalStartDate !== initial.currentReadingGoal.goalStartDate
    )
  );

  let readingGoalToReplaceMessage = $derived(
    readingGoalsToReplace.length
      ? `${getHistoryEntryCountLabel(readingGoalsToReplace.length)} will be replaced`
      : ''
  );

  onMount(init);

  async function init() {
    try {
      const todayKey = getDateKey(initial.startDayHoursForTracker);

      if (
        initial.currentReadingGoal.goalStartDate &&
        todayKey >= initial.currentReadingGoal.goalStartDate
      ) {
        const yesterdayKey = getPreviousDayKey(initial.startDayHoursForTracker);
        const [readingGoalStart, readingGoalEnd] = getReadingGoalWindow(
          todayKey,
          initial.startDayHoursForTracker,
          initial.currentReadingGoal
        );
        const previousReadingGoalEnd = getPreviousDayKey(
          initial.startDayHoursForTracker,
          getDate(readingGoalStart, initial.startDayHoursForTracker)
        );

        archivalMaxDate = readingGoalEnd;
        archivalOriginalEndDate = readingGoalEnd;
        archiveReadingGoal = true;

        const options: ArchiveOption[] = [
          {
            id: 'today',
            label: 'Today',
            archivalStartDate: initial.currentReadingGoal.goalStartDate,
            archivalEndDate: todayKey,
            editable: false
          }
        ];

        if (yesterdayKey >= initial.currentReadingGoal.goalStartDate) {
          options.push({
            id: 'yesterday',
            label: 'Yesterday',
            description: getArchiveRangeDescription(
              initial.currentReadingGoal.goalStartDate,
              yesterdayKey
            ),
            archivalStartDate: initial.currentReadingGoal.goalStartDate,
            archivalEndDate: yesterdayKey,
            editable: false
          });
        }

        if (readingGoalEnd !== todayKey) {
          options.push({
            id: 'current-period-end',
            label: 'Current goal period',
            description: getArchiveRangeDescription(
              initial.currentReadingGoal.goalStartDate,
              readingGoalEnd
            ),
            archivalStartDate: initial.currentReadingGoal.goalStartDate,
            archivalEndDate: readingGoalEnd,
            editable: false
          });
        }

        if (
          previousReadingGoalEnd > initial.currentReadingGoal.goalStartDate &&
          yesterdayKey !== previousReadingGoalEnd &&
          todayKey !== previousReadingGoalEnd
        ) {
          options.push({
            id: 'previous-period-end',
            label: 'Previous goal period',
            description: getArchiveRangeDescription(
              initial.currentReadingGoal.goalStartDate,
              previousReadingGoalEnd
            ),
            archivalStartDate: initial.currentReadingGoal.goalStartDate,
            archivalEndDate: previousReadingGoalEnd,
            editable: false
          });
        }

        options.push({
          id: 'custom',
          label: 'Custom',
          archivalStartDate: initial.currentReadingGoal.goalStartDate,
          archivalEndDate: readingGoalEnd,
          editable: true
        });

        archivalOptions = options;
        applyArchiveOption(options[0]);
      }

      await updateExistingReadingGoals();
      isLoading = false;
    } catch (err) {
      await closeWithError(`Failed to prepare reading goals: ${getErrorMessage(err)}`);
    }
  }

  async function checkDates() {
    try {
      isLoading = true;
      normalizeArchiveDates();
      await updateExistingReadingGoals();
      isLoading = false;
    } catch (err) {
      await closeWithError(`Failed to refresh reading goals: ${getErrorMessage(err)}`);
    }
  }

  function normalizeArchiveDates() {
    if (!archiveReadingGoal) {
      return;
    }

    if (!archivalStartDate || !archivalEndDate) {
      archivalStartDate = initial.currentReadingGoal.goalStartDate;
      archivalEndDate = archivalMaxDate;
    } else if (archivalEndDate < archivalStartDate) {
      const previousStartDate = archivalStartDate;
      archivalStartDate = archivalEndDate;
      archivalEndDate = previousStartDate;
    }
  }

  async function updateExistingReadingGoals() {
    updateNextReadingGoalStartDate();

    if (archiveReadingGoal) {
      existingReadingGoals = await database.getReadingGoalsForDateWindow(
        archivalStartDate,
        newStartDate,
        archivalEndDate
      );
    } else if (initial.newReadingGoal.goalStartDate) {
      existingReadingGoals = await database.getReadingGoalsForDateWindow(
        initial.newReadingGoal.goalStartDate,
        newStartDate
      );
    } else {
      existingReadingGoals = [];
    }
  }

  function updateNextReadingGoalStartDate() {
    if (!initial.newReadingGoal.goalStartDate) {
      return;
    }

    if (!archiveReadingGoal || initial.newReadingGoal.goalStartDate > archivalEndDate) {
      newStartDate = initial.newReadingGoal.goalStartDate;
      return;
    }

    ({ dateString: newStartDate } = advanceDateDays(
      getDate(archivalEndDate, initial.startDayHoursForTracker)
    ));
  }

  async function handleArchiveToggle(event: Event) {
    archiveReadingGoal = (event.currentTarget as HTMLInputElement).checked;
    await checkDates();
  }

  async function selectArchiveOption(option: ArchiveOption) {
    applyArchiveOption(option);
    await checkDates();
  }

  function applyArchiveOption(option: ArchiveOption) {
    selectedArchiveOptionId = option.id;
    archivalStartDate = option.archivalStartDate;
    archivalEndDate = option.archivalEndDate;
    updateNextReadingGoalStartDate();
  }

  function getArchiveRangeDescription(startDate: string, endDate: string) {
    return startDate === endDate ? startDate : `${startDate} through ${endDate}`;
  }

  function getHistoryEntryDateRange(startDate: string, endDate: string) {
    return startDate === endDate ? `for ${startDate}` : `from ${startDate} through ${endDate}`;
  }

  function getHistoryEntryCountLabel(count: number) {
    return `${count} history ${count === 1 ? 'entry' : 'entries'}`;
  }

  function buildResult(): ReadingGoalSaveResult {
    const readingGoalsToDelete = new SvelteSet<string>();
    const readingGoalsToInsert: BooksDbReadingGoal[] = [];

    for (const readingGoal of readingGoalsToReplace) {
      readingGoalsToDelete.add(readingGoal.goalStartDate);
    }

    if (initial.currentReadingGoal.goalStartDate) {
      readingGoalsToDelete.add(initial.currentReadingGoal.goalStartDate);
    }

    if (archiveReadingGoal && initial.currentReadingGoal.goalStartDate) {
      readingGoalsToInsert.push({
        ...initial.currentReadingGoal,
        goalStartDate: archivalStartDate,
        goalEndDate: archivalEndDate,
        goalOriginalEndDate: archivalOriginalEndDate
      });
    }

    if (initial.newReadingGoal.goalStartDate) {
      readingGoalsToInsert.push({
        ...initial.newReadingGoal,
        goalStartDate: newStartDate,
        goalEndDate: '',
        goalOriginalEndDate: ''
      });
    }

    return {
      readingGoalsToDelete: [...readingGoalsToDelete],
      readingGoalsToInsert,
      error: ''
    };
  }

  function handleSubmit(event: SubmitEvent) {
    const submitter = event.submitter as HTMLButtonElement | null;

    if (submitter?.value === 'confirm') {
      captureResult(buildResult());
    }
  }

  async function closeWithError(message: string) {
    error = message;
    isLoading = false;
    captureResult(emptyReadingGoalSaveResult(error));

    await tick();
    rootElement?.closest('dialog')?.close('error');
  }

  function getErrorMessage(err: unknown) {
    if (err instanceof Error) {
      return err.message;
    }

    if (err && typeof err === 'object' && 'message' in err) {
      return String(err.message);
    }

    return String(err);
  }
</script>

<div bind:this={rootElement} class="w-[560px] max-w-full">
  <header class="border-b border-black/10 pb-4">
    <h2 class="text-xl font-medium">Save reading goal</h2>
    <p class="mt-1 text-sm text-gray-600">
      Review how this save will update your reading goal history.
    </p>
  </header>

  <div class="py-4">
    {#if isLoading}
      <div class="flex items-center justify-center gap-3 py-8 text-sm text-gray-600">
        <Fa icon={faSpinner} spin />
        <span>Checking reading goals...</span>
      </div>
    {:else if error}
      <div class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
        {error}
      </div>
    {:else}
      <div class="space-y-4 text-sm text-gray-700">
        {#if archivalOptions.length}
          <label class="flex items-start gap-3 rounded p-2 hover:bg-gray-400/15">
            <input
              type="checkbox"
              class="mt-1"
              checked={archiveReadingGoal}
              onchange={(event) => void handleArchiveToggle(event)}
            />
            <span>Archive current goal in history</span>
          </label>

          {#if archiveReadingGoal}
            <fieldset>
              <legend class="mb-1 text-base font-medium">End current goal</legend>
              <div class="space-y-1">
                {#each archivalOptions as archivalOption (archivalOption.id)}
                  <label class="flex items-start gap-3 rounded p-2 hover:bg-gray-400/15">
                    <input
                      type="radio"
                      name="reading-goal-archive-option"
                      class="mt-1"
                      value={archivalOption.id}
                      checked={selectedArchiveOptionId === archivalOption.id}
                      onchange={() => void selectArchiveOption(archivalOption)}
                    />
                    <span>
                      <span class="block">{archivalOption.label}</span>
                      {#if archivalOption.description}
                        <span class="block text-xs text-gray-600">
                          {archivalOption.description}
                        </span>
                      {/if}
                    </span>
                  </label>
                {/each}
              </div>
            </fieldset>

            {#if archiveDateEditable}
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label for="reading-goal-archive-start" class="block text-sm text-gray-600">
                    From
                  </label>
                  <input
                    id="reading-goal-archive-start"
                    type="date"
                    class={inputClasses}
                    bind:value={archivalStartDate}
                    onchange={() => void checkDates()}
                  />
                </div>
                <div>
                  <label for="reading-goal-archive-end" class="block text-sm text-gray-600">
                    Through
                  </label>
                  <input
                    id="reading-goal-archive-end"
                    type="date"
                    class={inputClasses}
                    bind:value={archivalEndDate}
                    onchange={() => void checkDates()}
                  />
                </div>
              </div>
            {/if}
          {/if}
        {/if}

        <section class="px-2">
          <div class="font-medium">After saving</div>
          <ul class="mt-1 space-y-1 text-gray-700">
            {#if archiveReadingGoal && initial.currentReadingGoal.goalStartDate}
              <li class="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>
                  Current goal will become a history entry {getHistoryEntryDateRange(
                    archivalStartDate,
                    archivalEndDate
                  )}.
                </span>
              </li>
            {:else if initial.currentReadingGoal.goalStartDate}
              <li class="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>Current goal will be discarded instead of becoming a history entry.</span>
              </li>
            {/if}
            {#if initial.newReadingGoal.goalStartDate}
              <li class="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>New goal will start {newStartDate}.</span>
              </li>
            {:else}
              <li class="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>No new current goal will be created.</span>
              </li>
            {/if}
            {#if readingGoalToReplaceMessage}
              <li class="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{readingGoalToReplaceMessage}.</span>
              </li>
            {/if}
          </ul>
        </section>

        {#if readingGoalToReplaceMessage}
          <details class="max-h-40 overflow-auto px-2">
            <summary class="cursor-pointer font-medium">
              Show {getHistoryEntryCountLabel(readingGoalsToReplace.length)} affected by this save
            </summary>
            <ul class="mt-2 space-y-2">
              {#each readingGoalsToReplace as goalToReplace (goalToReplace.goalStartDate)}
                <li>
                  {getDateRangeLabel(goalToReplace.goalStartDate, goalToReplace.goalEndDate)} /
                  {secondsToMinutes(goalToReplace.timeGoal)} min /
                  {goalToReplace.characterGoal} characters / {goalToReplace.goalFrequency}
                </li>
              {/each}
            </ul>
          </details>
        {/if}
      </div>
    {/if}
  </div>

  <footer class="flex items-center justify-end gap-2 border-t border-black/10 pt-4">
    <form method="dialog" class="m-0 flex gap-2" onsubmit={handleSubmit}>
      <SyncButton type="submit" value="cancel" disabled={isLoading}>Cancel</SyncButton>
      <SyncButton type="submit" value="confirm" variant="primary" disabled={isLoading || !!error}>
        Confirm
      </SyncButton>
    </form>
  </footer>
</div>
