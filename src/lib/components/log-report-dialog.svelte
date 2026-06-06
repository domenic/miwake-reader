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
    hideSpoilerImage$,
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
    keepLocalStatisticsOnDeletion$,
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
    isOnline$,
    multiplier$,
    showCharacterCounter$,
    showPercentage$,
    showFooterChapterCharacterCounter$,
    showFooterChapterPercentage$,
    enableReaderWakeLock$
  } from '$lib/data/store';

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
          theme: theme$.getValue(),
          viewMode: viewMode$.getValue(),
          fontFamilyGroupOne: fontFamilyGroupOne$.getValue(),
          fontFamilyGroupTwo: fontFamilyGroupTwo$.getValue(),
          fontSize: fontSize$.getValue(),
          lineHeight: lineHeight$.getValue(),
          textIndentation: textIndentation$.getValue(),
          textMarginMode: textMarginMode$.getValue(),
          textMarginValue: textMarginValue$.getValue(),
          firstDimensionMargin: firstDimensionMargin$.getValue(),
          secondDimensionMaxValue: secondDimensionMaxValue$.getValue(),
          swipeThreshold: swipeThreshold$.getValue(),
          disableWheelNavigation: disableWheelNavigation$.getValue(),
          writingMode: writingMode$.getValue(),
          enableVerticalFontKerning: enableVerticalFontKerning$.getValue(),
          enableFontVPAL: enableFontVPAL$.getValue(),
          verticalTextOrientation: verticalTextOrientation$.getValue(),
          prioritizeReaderStyles: prioritizeReaderStyles$.getValue(),
          enableTextJustification: enableTextJustification$.getValue(),
          enableTextWrapPretty: enableTextWrapPretty$.getValue(),
          enableReaderWakeLock: enableReaderWakeLock$.getValue(),
          showCharacterCounter$: showCharacterCounter$.getValue(),
          showPercentage$: showPercentage$.getValue(),
          showFooterChapterCharacterCounter: showFooterChapterCharacterCounter$.getValue(),
          showFooterChapterPercentage: showFooterChapterPercentage$.getValue(),
          confirmClose: confirmClose$.getValue(),
          autoBookmark: autoBookmark$.getValue(),
          autoBookmarkTime: autoBookmarkTime$.getValue(),
          hideSpoilerImage: hideSpoilerImage$.getValue(),
          furiganaStyle: furiganaStyle$.getValue(),
          avoidPageBreak: avoidPageBreak$.getValue(),
          pauseTrackerOnCustomPointChange: pauseTrackerOnCustomPointChange$.getValue(),
          customReadingPointEnabled: customReadingPointEnabled$.getValue(),
          selectionToBookmarkEnabled: selectionToBookmarkEnabled$.getValue(),
          enableTapEdgeToFlip: enableTapEdgeToFlip$.getValue(),
          pageColumns: pageColumns$.getValue(),
          autoPositionOnResize: autoPositionOnResize$.getValue(),
          importHTMLFixMode: importHTMLFixMode$.getValue(),
          restrictImportFixToAnchor: restrictImportFixToAnchor$.getValue(),
          cacheStorageData: cacheStorageData$.getValue(),
          autoReplication: autoReplication$.getValue(),
          keepLocalStatisticsOnDeletion: keepLocalStatisticsOnDeletion$.getValue(),
          overwriteBookCompletion: overwriteBookCompletion$.getValue(),
          startDayHoursForTracker: startDayHoursForTracker$.getValue(),
          statisticsMergeMode: statisticsMergeMode$.getValue(),
          readingGoalsMergeMode: readingGoalsMergeMode$.getValue(),
          statisticsEnabled: statisticsEnabled$.getValue(),
          trackerAutoPause: trackerAutoPause$.getValue(),
          openTrackerOnCompletion: openTrackerOnCompletion$.getValue(),
          addCharactersOnCompletion: addCharactersOnCompletion$.getValue(),
          trackerAutostartTime: trackerAutostartTime$.getValue(),
          trackerIdleTime: trackerIdleTime$.getValue(),
          trackerForwardSkipThreshold: trackerForwardSkipThreshold$.getValue(),
          trackerBackwardSkipThreshold: trackerBackwardSkipThreshold$.getValue(),
          trackerSkipThresholdAction: trackerSkipThresholdAction$.getValue(),
          trackerPopupDetection: trackerPopupDetection$.getValue(),
          adjustStatisticsAfterIdleTime: adjustStatisticsAfterIdleTime$.getValue(),
          readingGoal: readingGoal$.getValue(),
          lastReadingGoalsModified: lastReadingGoalsModified$.getValue(),
          isOnline: isOnline$.getValue(),
          multiplier: multiplier$.getValue()
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
