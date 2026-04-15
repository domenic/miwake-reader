export enum LocalFont {
  KZUDGOTHIC = 'KZ UDGothic',
  KZUDMINCHO = 'KZ UDMincho',
  GENEI = 'Genei Koburi Mincho v5',
  KLEEONE = 'Klee One',
  KLEEONESEMIBOLD = 'Klee One SemiBold',
  NOTOSANSJP = 'Noto Sans JP',
  NOTOSERIFJP = 'Noto Serif JP',
  SHIPPORIMINCHO = 'Shippori Mincho',
  SERIF = 'Serif',
  SANSSERIF = 'Sans-Serif'
}

export interface UserFont {
  name: string;
  path: string;
  fileName: string;
}

export const userFontsCacheName = 'miwake-userfonts';

export const reservedFontNames: Set<string> = new Set(Object.values(LocalFont));

export function isStoredFont(fontName: string, userFonts: UserFont[]) {
  return (
    reservedFontNames.has(fontName) || !!userFonts.find((userFont) => userFont.name === fontName)
  );
}

export const fontDisplayNames: Partial<Record<string, string>> = {
  [LocalFont.SERIF]: 'Browser default serif',
  [LocalFont.SANSSERIF]: 'Browser default sans-serif'
};

const genericFamilyCss: Record<string, string> = {
  [LocalFont.SERIF]: 'serif',
  [LocalFont.SANSSERIF]: 'sans-serif'
};

export function fontFamilyCss(name: string): string {
  return genericFamilyCss[name] ?? `'${name}'`;
}

export type FontGroup = 'serif' | 'sans-serif';

export const fontGroupLabels: Record<FontGroup, string> = {
  serif: 'Serif font',
  'sans-serif': 'Sans-serif font'
};

export const defaultFonts: Record<FontGroup, LocalFont> = {
  serif: LocalFont.NOTOSERIFJP,
  'sans-serif': LocalFont.NOTOSANSJP
};

export const bundledFonts: Record<FontGroup, LocalFont[]> = {
  serif: [
    LocalFont.NOTOSERIFJP,
    LocalFont.KZUDMINCHO,
    LocalFont.GENEI,
    LocalFont.SHIPPORIMINCHO,
    LocalFont.KLEEONE,
    LocalFont.KLEEONESEMIBOLD,
    LocalFont.SERIF
  ],
  'sans-serif': [LocalFont.NOTOSANSJP, LocalFont.KZUDGOTHIC, LocalFont.SANSSERIF]
};
