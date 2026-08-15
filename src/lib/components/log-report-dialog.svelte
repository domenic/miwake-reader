<script module lang="ts">
  import LogReportDialog from '$lib/components/log-report-dialog.svelte';
  import { showDialog, type DialogClosedBy } from '$lib/components/dialog/show-dialog';
  import { logger as errorDialogLogger } from '$lib/data/logger';

  export function showErrorDialog({ title, error }: { title: string; error: unknown }) {
    const thrown = error as { message?: unknown; name?: unknown };

    if (thrown?.name === 'AbortError') {
      return Promise.resolve();
    }

    const message = String(thrown?.message || error);

    errorDialogLogger.error(error instanceof Error ? error : message);

    return showLogReportDialog({
      title,
      message,
      showErrorGuidance: true,
      closedBy: 'closerequest'
    });
  }

  export function showBugReportDialog() {
    return showLogReportDialog({
      title: 'Bug report',
      message: 'Please include the attached log file with your report.',
      showErrorGuidance: false,
      closedBy: 'any'
    });
  }

  function showLogReportDialog({
    title,
    message,
    showErrorGuidance,
    closedBy
  }: {
    title?: string;
    message: string;
    showErrorGuidance: boolean;
    closedBy: DialogClosedBy;
  }) {
    return showDialog(
      LogReportDialog,
      { title, message, showErrorGuidance },
      {
        closedBy,
        resolveResult: () => undefined
      }
    );
  }
</script>

<script lang="ts">
  import DialogButton from '$lib/components/dialog/dialog-button.svelte';
  import DialogContentShell from '$lib/components/dialog/dialog-content-shell.svelte';
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses } from '$lib/css-classes';
  import { logger } from '$lib/data/logger';
  import {
    theme$,
    viewMode$,
    fontFamilyGroupOne$,
    fontFamilyGroupTwo$,
    fontSize$,
    lineHeight$,
    textIndentation$,
    textMarginMode$,
    textMarginValue$,
    firstDimensionMargin$,
    secondDimensionMaxValue$,
    swipeThreshold$,
    disableWheelNavigation$,
    writingMode$,
    enableVerticalFontKerning$,
    enableFontVPAL$,
    verticalTextOrientation$,
    prioritizeReaderStyles$,
    enableTextJustification$,
    enableTextWrapPretty$,
    confirmClose$,
    autoBookmark$,
    autoBookmarkTime$,
    blurImageMode$,
    furiganaStyle$,
    avoidPageBreak$,
    pauseTrackerOnCustomPointChange$,
    customReadingPointEnabled$,
    selectionToBookmarkEnabled$,
    enableTapEdgeToFlip$,
    pageColumns$,
    autoPositionOnResize$,
    importHTMLFixMode$,
    restrictImportFixToAnchor$,
    cacheStorageData$,
    autoReplication$,
    keepLocalReadingDataOnDeletion$,
    overwriteBookCompletion$,
    startDayHoursForTracker$,
    statisticsMergeMode$,
    readingGoalsMergeMode$,
    statisticsEnabled$,
    trackerAutoPause$,
    openTrackerOnCompletion$,
    addCharactersOnCompletion$,
    trackerAutostartTime$,
    trackerIdleTime$,
    trackerForwardSkipThreshold$,
    trackerBackwardSkipThreshold$,
    trackerSkipThresholdAction$,
    trackerPopupDetection$,
    adjustStatisticsAfterIdleTime$,
    readingGoal$,
    lastReadingGoalsModified$,
    multiplier$,
    showCharacterCounter$,
    showPercentage$,
    showFooterChapterCharacterCounter$,
    showFooterChapterPercentage$,
    enableReaderWakeLock$
  } from '$lib/data/store';
  import { online } from 'svelte/reactivity/window';

  interface Props {
    title: string;
    message: string;
    showErrorGuidance: boolean;
  }

  let { title, message, showErrorGuidance }: Props = $props();

  const encodedLog = encodeURIComponent(
    JSON.stringify(
      {
        userAgent: navigator.userAgent,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
        languages: navigator.languages,
        viewport: {
          visualViewport: !!window.visualViewport,
          width: window.visualViewport?.width ?? window.innerWidth,
          height: window.visualViewport?.height ?? window.innerHeight
        },
        settings: {
          theme: $theme$,
          viewMode: $viewMode$,
          fontFamilyGroupOne: $fontFamilyGroupOne$,
          fontFamilyGroupTwo: $fontFamilyGroupTwo$,
          fontSize: $fontSize$,
          lineHeight: $lineHeight$,
          textIndentation: $textIndentation$,
          textMarginMode: $textMarginMode$,
          textMarginValue: $textMarginValue$,
          firstDimensionMargin: $firstDimensionMargin$,
          secondDimensionMaxValue: $secondDimensionMaxValue$,
          swipeThreshold: $swipeThreshold$,
          disableWheelNavigation: $disableWheelNavigation$,
          writingMode: $writingMode$,
          enableVerticalFontKerning: $enableVerticalFontKerning$,
          enableFontVPAL: $enableFontVPAL$,
          verticalTextOrientation: $verticalTextOrientation$,
          prioritizeReaderStyles: $prioritizeReaderStyles$,
          enableTextJustification: $enableTextJustification$,
          enableTextWrapPretty: $enableTextWrapPretty$,
          enableReaderWakeLock: $enableReaderWakeLock$,
          showCharacterCounter: $showCharacterCounter$,
          showPercentage: $showPercentage$,
          showFooterChapterCharacterCounter: $showFooterChapterCharacterCounter$,
          showFooterChapterPercentage: $showFooterChapterPercentage$,
          confirmClose: $confirmClose$,
          autoBookmark: $autoBookmark$,
          autoBookmarkTime: $autoBookmarkTime$,
          blurImageMode: $blurImageMode$,
          furiganaStyle: $furiganaStyle$,
          avoidPageBreak: $avoidPageBreak$,
          pauseTrackerOnCustomPointChange: $pauseTrackerOnCustomPointChange$,
          customReadingPointEnabled: $customReadingPointEnabled$,
          selectionToBookmarkEnabled: $selectionToBookmarkEnabled$,
          enableTapEdgeToFlip: $enableTapEdgeToFlip$,
          pageColumns: $pageColumns$,
          autoPositionOnResize: $autoPositionOnResize$,
          importHTMLFixMode: $importHTMLFixMode$,
          restrictImportFixToAnchor: $restrictImportFixToAnchor$,
          cacheStorageData: $cacheStorageData$,
          autoReplication: $autoReplication$,
          keepLocalReadingDataOnDeletion: $keepLocalReadingDataOnDeletion$,
          overwriteBookCompletion: $overwriteBookCompletion$,
          startDayHoursForTracker: $startDayHoursForTracker$,
          statisticsMergeMode: $statisticsMergeMode$,
          readingGoalsMergeMode: $readingGoalsMergeMode$,
          statisticsEnabled: $statisticsEnabled$,
          trackerAutoPause: $trackerAutoPause$,
          openTrackerOnCompletion: $openTrackerOnCompletion$,
          addCharactersOnCompletion: $addCharactersOnCompletion$,
          trackerAutostartTime: $trackerAutostartTime$,
          trackerIdleTime: $trackerIdleTime$,
          trackerForwardSkipThreshold: $trackerForwardSkipThreshold$,
          trackerBackwardSkipThreshold: $trackerBackwardSkipThreshold$,
          trackerSkipThresholdAction: $trackerSkipThresholdAction$,
          trackerPopupDetection: $trackerPopupDetection$,
          adjustStatisticsAfterIdleTime: $adjustStatisticsAfterIdleTime$,
          readingGoal: $readingGoal$,
          lastReadingGoalsModified: $lastReadingGoalsModified$,
          isOnline: online.current !== false,
          multiplier: $multiplier$
        },
        log: logger.history
      },
      undefined,
      2
    )
  );
  const downloadableLog = `data:text/json;charset=utf-8,${encodedLog}`;
</script>

<DialogContentShell {title}>
  <p>{message}</p>
  {#if showErrorGuidance}
    <p class="mt-3">
      Consider filing a bug report. If you do so, please include the attached log file with your
      report.
    </p>
  {/if}

  {#snippet actions()}
    <a
      use:ripple
      class={buttonClasses}
      href="https://github.com/domenic/miwake-reader/issues"
      target="_blank"
      rel="noreferrer">Open Issue Tracker</a
    >
    <a use:ripple class={buttonClasses} href={downloadableLog} download="log.json">Download Logs</a>
    <DialogButton value="close">Close</DialogButton>
  {/snippet}
</DialogContentShell>
