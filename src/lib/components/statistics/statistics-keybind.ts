import { finishAppKeydown, shouldIgnoreAppKeydown } from '$lib/functions/keybind';

enum StatisticsKeybindAction {
  RANGE_TEMPLATE_TOGGLE = 'templateRangeToggle',
  AGGREGATION_TOGGLE = 'aggregationToggle'
}

type StatisticsKeybindMap = Readonly<Record<string, StatisticsKeybindAction>>;

interface StatisticsKeybindOptions {
  shortcutsDisabled: boolean;
  toggleAggregationMode: () => void;
  toggleStatisticsRangeTemplate: () => void;
}

const statisticsKeybindMap: StatisticsKeybindMap = {
  t: StatisticsKeybindAction.RANGE_TEMPLATE_TOGGLE,
  a: StatisticsKeybindAction.AGGREGATION_TOGGLE
};

// Use `KeyboardEvent.key` so shortcuts are semantic/layout-aware; `code` is physical-key based.
export function handleStatisticsKeydown(ev: KeyboardEvent, options: StatisticsKeybindOptions) {
  if (shouldIgnoreAppKeydown(ev, { shortcutsDisabled: options.shortcutsDisabled })) {
    return;
  }

  const action = statisticsKeybindMap[ev.key];
  if (!action || ev.repeat) {
    return;
  }

  switch (action) {
    case StatisticsKeybindAction.RANGE_TEMPLATE_TOGGLE:
      options.toggleStatisticsRangeTemplate();
      break;
    case StatisticsKeybindAction.AGGREGATION_TOGGLE:
      options.toggleAggregationMode();
      break;
  }

  finishAppKeydown(ev);
}
