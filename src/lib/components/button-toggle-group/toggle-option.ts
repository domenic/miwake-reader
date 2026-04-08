export interface ToggleOption<T> {
  id: T;
  text: string;
  style?: Record<string, string>;
  thickBorders?: boolean;
  showIcons?: boolean;
}

export const optionsForToggle: ToggleOption<boolean>[] = [
  {
    id: false,
    text: 'Off'
  },
  {
    id: true,
    text: 'On'
  }
];
