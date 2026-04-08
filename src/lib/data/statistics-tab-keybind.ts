export enum StatisticsTabAvailableKeybind {
  RANGE_TEMPLATE_TOGGLE = 'templateRangeToggle',
  AGGREGRATION_TOGGLE = 'aggregationToggle'
}

export type StatisticsTabKeybindMap = Record<string, StatisticsTabAvailableKeybind>;
