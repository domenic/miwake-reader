<script lang="ts">
  import {
    faCancel,
    faChevronLeft,
    faChevronRight,
    faEdit,
    faSave,
    faTrash
  } from '@fortawesome/free-solid-svg-icons';
  import { showReadingGoalsMergeDialog } from '$lib/components/statistics/reading-goals/reading-goals-merge-dialog.svelte';
  import { buttonClasses } from '$lib/css-classes';
  import { showConfirmDialog } from '$lib/components/confirm-dialog.svelte';
  import { showErrorDialog } from '$lib/components/log-report-dialog.svelte';
  import type { BooksDbReadingGoal } from '$lib/data/database/books-db/versions/books-db';
  import {
    getCurrentReadingGoal,
    getDateRangeLabel,
    type ReadingGoal
  } from '$lib/data/reading-goal';
  import { database, dayBoundaryTime$, readingGoal$ } from '$lib/data/store';
  import { ReadingGoalFrequency } from '$lib/data/tracker-domain';
  import { userSaveReadingGoals, userDeleteReadingGoal } from '$lib/data/library';
  import { pluralize } from '$lib/functions/utils';
  import { getDateKey, secondsToMinutes } from '$lib/functions/statistic-util';
  import { onMount } from 'svelte';
  import Fa from 'svelte-fa';

  interface Props {
    readingGoals: BooksDbReadingGoal[];
    onspinner?: (value: boolean) => void;
    ongoalschange?: (readingGoals: BooksDbReadingGoal[]) => void;
  }

  let { readingGoals, onspinner, ongoalschange }: Props = $props();

  const readingGoalFrequencies = [
    {
      id: ReadingGoalFrequency.DAILY,
      label: 'Daily'
    },
    {
      id: ReadingGoalFrequency.WEEKLY,
      label: '7-day window'
    },
    { id: ReadingGoalFrequency.MONTHLY, label: '30-day window' }
  ];
  const readingGoalFrequencyLabels = new Map(
    readingGoalFrequencies.map(({ id, label }) => [id, label])
  );

  let currentTimeGoal = $state(0);
  let currentCharacterGoal = $state(0);
  let currentReadingGoalFrequency = $state(ReadingGoalFrequency.DAILY);
  let currentReadingGoalStartDate = $state('');
  let isInEditMode = $state(false);
  let sortedReadingGoals = $derived(
    [...readingGoals].sort((a, b) => (a.goalStartDate > b.goalStartDate ? -1 : 1))
  );
  let historyIndex = $state(0);
  const itemsPerPage = 5;

  let saveDisabled = $derived(
    !!((currentTimeGoal || currentCharacterGoal) && !currentReadingGoalStartDate)
  );

  let currentTimeGoalInMin = $derived(secondsToMinutes(currentTimeGoal));

  let currentHistoryIndex = $derived(Math.max(0, historyIndex * itemsPerPage));

  let historyReadingGoals = $derived(
    sortedReadingGoals.slice(currentHistoryIndex, currentHistoryIndex + itemsPerPage)
  );

  let hasNextHistoryPage = $derived(sortedReadingGoals.length > currentHistoryIndex + itemsPerPage);

  // Sync form fields from store, but only when not editing
  $effect(() => {
    if ($readingGoal$ && !isInEditMode) {
      currentTimeGoal = $readingGoal$.timeGoal;
      currentCharacterGoal = $readingGoal$.characterGoal;
      currentReadingGoalFrequency = $readingGoal$.goalFrequency;
      currentReadingGoalStartDate = $readingGoal$.goalStartDate;
    }
  });

  onMount(async () => {
    $readingGoal$ = await getCurrentReadingGoal(readingGoals);
  });

  function handleReadingGoalChange(event: Event, isTimeGoal: boolean) {
    const { value } = event.target as HTMLInputElement;

    const mod = isTimeGoal ? 60 : 1;
    const val = Math.floor((Number.parseFloat(value) || 0) * mod);

    if (isTimeGoal) {
      currentTimeGoal = val < 0 ? 0 : val;
    } else {
      currentCharacterGoal = val < 0 ? 0 : val;
    }
  }

  async function saveReadingGoal() {
    if (!currentTimeGoal && !currentCharacterGoal) {
      currentReadingGoalStartDate = '';
      currentReadingGoalFrequency = ReadingGoalFrequency.DAILY;
    }

    if (
      currentTimeGoal === $readingGoal$.timeGoal &&
      currentCharacterGoal === $readingGoal$.characterGoal &&
      currentReadingGoalFrequency === $readingGoal$.goalFrequency &&
      currentReadingGoalStartDate === $readingGoal$.goalStartDate
    ) {
      isInEditMode = false;
      return;
    }

    try {
      const todayKey = getDateKey($dayBoundaryTime$);
      const initialExistingReadingGoals = await database.getReadingGoalsForDateWindow(
        currentReadingGoalStartDate < $readingGoal$.goalStartDate
          ? currentReadingGoalStartDate || $readingGoal$.goalStartDate
          : $readingGoal$.goalStartDate || currentReadingGoalStartDate
      );
      const existingReadingGoals = currentReadingGoalStartDate
        ? initialExistingReadingGoals.filter(
            (item) => item.goalStartDate !== $readingGoal$.goalStartDate
          )
        : [];
      const isFutureWithoutReadingGoalConflicts =
        $readingGoal$.goalStartDate &&
        todayKey < $readingGoal$.goalStartDate &&
        !existingReadingGoals.length;

      const newReadingGoal = {
        timeGoal: currentTimeGoal,
        characterGoal: currentCharacterGoal,
        goalFrequency: currentReadingGoalFrequency,
        goalStartDate: currentReadingGoalStartDate,
        lastGoalModified: Date.now()
      };
      let readingGoalsToDelete: string[] = [];
      let readingGoalsToInsert: BooksDbReadingGoal[] = [];
      let error = '';

      if (isFutureWithoutReadingGoalConflicts && currentReadingGoalStartDate) {
        readingGoalsToDelete.push($readingGoal$.goalStartDate);
        readingGoalsToInsert.push({ ...newReadingGoal, goalEndDate: '', goalOriginalEndDate: '' });
      } else if (isFutureWithoutReadingGoalConflicts) {
        readingGoalsToDelete.push($readingGoal$.goalStartDate);
      } else if (initialExistingReadingGoals.length) {
        ({ readingGoalsToDelete, readingGoalsToInsert, error } = await showReadingGoalsMergeDialog({
          currentReadingGoal: $readingGoal$,
          newReadingGoal,
          dayBoundaryTime: $dayBoundaryTime$
        }));
      } else {
        readingGoalsToInsert.push({ ...newReadingGoal, goalEndDate: '', goalOriginalEndDate: '' });
      }

      if (error) {
        throw new Error(error);
      }

      onspinner?.(true);

      await userSaveReadingGoals(readingGoalsToDelete, readingGoalsToInsert);
    } catch (error) {
      showErrorDialog({ title: 'Error updating reading goals', error });
    } finally {
      onspinner?.(false);
      isInEditMode = false;
      await updateReadingGoalsData().catch(() => {
        // no-op
      });
    }
  }

  async function deleteReadingGoals(readingGoalToDelete?: ReadingGoal, dateRangeLabel?: string) {
    let dialogMessage: string;

    if (readingGoalToDelete) {
      const isCurrentReadingGoal =
        $readingGoal$.goalStartDate &&
        $readingGoal$.goalStartDate === readingGoalToDelete.goalStartDate;
      const term =
        getDateKey($dayBoundaryTime$) >= readingGoalToDelete.goalStartDate ? 'started' : 'starting';
      dialogMessage = `The${
        isCurrentReadingGoal ? ` current reading goal ${term} on` : ' archived reading goal for '
      } ${dateRangeLabel} will be deleted${isCurrentReadingGoal ? ' without archiving.' : ''}`;
    } else if (readingGoals.length > 1) {
      dialogMessage = `All archived reading goals will be deleted${
        $readingGoal$.goalStartDate ? ' (including the current one).' : ''
      }`;
    } else {
      dialogMessage = $readingGoal$.goalStartDate
        ? 'Your current reading goal will be deleted without archiving.'
        : 'Your archived reading goal will be deleted.';
    }

    const confirmed = await showConfirmDialog({
      title: 'Data deletion',
      message: dialogMessage,
      confirmLabel: 'Delete',
      danger: true
    });

    if (!confirmed) {
      return;
    }

    onspinner?.(true);

    try {
      await userDeleteReadingGoal(readingGoalToDelete?.goalStartDate);
      await updateReadingGoalsData();
    } catch (error) {
      showErrorDialog({ title: 'Error deleting reading goals', error });
    } finally {
      onspinner?.(false);
    }
  }

  async function updateReadingGoalsData() {
    const nextReadingGoals = await database.getReadingGoals();
    historyIndex = 0;

    $readingGoal$ = await getCurrentReadingGoal(nextReadingGoals);
    ongoalschange?.(nextReadingGoals);
  }
</script>

<div class="mb-8 sm:col-span-2 lg:col-span-3">
  <div class="flex grow">
    <h1 class="mb-2 w-full text-xl font-medium">Reading goals</h1>
    {#if isInEditMode}
      <button class={`${buttonClasses} mr-4`} disabled={saveDisabled} onclick={saveReadingGoal}>
        <div
          class="flex items-center justify-center hover:opacity-50"
          class:cursor-not-allowed={saveDisabled}
        >
          <span class="mr-2">Save</span>
          <Fa icon={faSave} />
        </div>
      </button>
      <button
        class={buttonClasses}
        onclick={() => {
          currentTimeGoal = $readingGoal$.timeGoal;
          currentCharacterGoal = $readingGoal$.characterGoal;
          currentReadingGoalFrequency = $readingGoal$.goalFrequency;
          currentReadingGoalStartDate = $readingGoal$.goalStartDate;

          isInEditMode = false;
        }}
      >
        <div class="flex items-center justify-center hover:opacity-50">
          <span class="mr-2">Cancel</span>
          <Fa icon={faCancel} />
        </div>
      </button>
    {:else}
      <button class={buttonClasses} onclick={() => (isInEditMode = true)}>
        <div class="flex items-center justify-center hover:opacity-50">
          <span class="mr-2">Edit</span>
          <Fa icon={faEdit} />
        </div>
      </button>
      <button
        class={buttonClasses}
        disabled={!readingGoals.length}
        onclick={() => deleteReadingGoals()}
      >
        <div
          title="Delete all reading goals"
          class="flex items-center justify-center hover:opacity-50"
          class:cursor-not-allowed={!readingGoals.length}
        >
          <span class="mr-2">Delete goals</span>
          <Fa icon={faTrash} />
        </div>
      </button>
    {/if}
  </div>
  <hr class="border border-black" />
  <div class="grid grid-cols-1 gap-4 justify-between items-end mt-4 md:grid-cols-4">
    <label class="flex flex-col">
      Reading time goal (minutes)
      <input
        type="number"
        min="0"
        class:cursor-not-allowed={!isInEditMode}
        disabled={!isInEditMode}
        bind:value={currentTimeGoalInMin}
        onblur={(event) => handleReadingGoalChange(event, true)}
      />
    </label>
    <label class="flex flex-col">
      Character goal
      <input
        type="number"
        min="0"
        class:cursor-not-allowed={!isInEditMode}
        disabled={!isInEditMode}
        bind:value={currentCharacterGoal}
        onblur={(event) => handleReadingGoalChange(event, false)}
      />
    </label>
    <label class="flex flex-col">
      Goal window
      <select
        class:cursor-not-allowed={!isInEditMode}
        disabled={!isInEditMode}
        bind:value={currentReadingGoalFrequency}
      >
        {#each readingGoalFrequencies as readingGoalFrequency (readingGoalFrequency.id)}
          <option value={readingGoalFrequency.id}>
            {readingGoalFrequency.label}
          </option>
        {/each}
      </select>
    </label>
    <label class="flex flex-col">
      Start date
      <input
        type="date"
        class:cursor-not-allowed={!isInEditMode}
        disabled={!isInEditMode}
        bind:value={currentReadingGoalStartDate}
      />
    </label>
  </div>
  <details class="mt-6 cursor-pointer">
    <summary>Reading goal history ({pluralize(readingGoals.length, 'item')})</summary>
    {#if readingGoals.length}
      <div class="grid-cols-[repeat(4,1fr)_0.1fr] hidden sm:grid">
        {#each historyReadingGoals as historyGoal (historyGoal.goalStartDate)}
          {@const dateRangeLabel = getDateRangeLabel(
            historyGoal.goalStartDate,
            historyGoal.goalEndDate
          )}
          <div>{dateRangeLabel}</div>
          <div>{secondsToMinutes(historyGoal.timeGoal)} min</div>
          <div>{historyGoal.characterGoal} characters</div>
          <div>{readingGoalFrequencyLabels.get(historyGoal.goalFrequency)}</div>
          <button
            onclick={() => deleteReadingGoals(historyGoal, dateRangeLabel)}
            title="Delete reading goal"
          >
            <Fa icon={faTrash} />
          </button>
        {/each}
      </div>
      <div class="sm:hidden">
        {#each historyReadingGoals as historyGoal (historyGoal.goalStartDate)}
          {@const dateRangeLabel = getDateRangeLabel(
            historyGoal.goalStartDate,
            historyGoal.goalEndDate
          )}
          <div class="my-2">
            {dateRangeLabel} / {secondsToMinutes(historyGoal.timeGoal)} min / {historyGoal.characterGoal}
            characters / {readingGoalFrequencyLabels.get(historyGoal.goalFrequency)}
            <button
              onclick={() => deleteReadingGoals(historyGoal, dateRangeLabel)}
              title="Delete reading goal"
            >
              <Fa icon={faTrash} />
            </button>
          </div>
        {/each}
      </div>
      <div class="mt-3 flex justify-between">
        <button
          title={currentHistoryIndex === 0 ? '' : 'Previous Page'}
          disabled={currentHistoryIndex === 0}
          class:opacity-50={currentHistoryIndex === 0}
          class:cursor-not-allowed={currentHistoryIndex === 0}
          onclick={() => (historyIndex -= 1)}
        >
          <Fa icon={faChevronLeft} />
        </button>
        <button
          title={hasNextHistoryPage ? 'Next Page' : ''}
          disabled={!hasNextHistoryPage}
          class:opacity-50={!hasNextHistoryPage}
          class:cursor-not-allowed={!hasNextHistoryPage}
          onclick={() => (historyIndex += 1)}
        >
          <Fa icon={faChevronRight} />
        </button>
      </div>
    {:else}
      <div>You have no archived reading goals yet.</div>
    {/if}
  </details>
</div>
