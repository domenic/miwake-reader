import { afterEach, describe, expect, it } from 'vitest';
import { compareBookTitles, displayTitle } from '../../src/lib/functions/book-title.ts';
import { simplifyBookTitles$ } from '../../src/lib/data/book-title-settings.ts';

afterEach(() => {
  simplifyBookTitles$.set(true);
});

describe('displayTitle', () => {
  const simplifiedTitles = [
    ['コンビニ人間 (文春文庫)', 'コンビニ人間'],
    ['わたし、定時で帰ります。（新潮文庫）', 'わたし、定時で帰ります。'],
    [
      'ソードアート・オンライン2 アインクラッド (電撃文庫)',
      'ソードアート・オンライン2 アインクラッド'
    ],
    ['52ヘルツのクジラたち【特典付き】 (中公文庫)', '52ヘルツのクジラたち'],
    ['作品名【電子限定イラスト付き】', '作品名'],
    ['作品名（完全版）（文春文庫）', '作品名'],
    ['作品名 (MF文庫J)', '作品名'],
    ['作品名（中公新書ラクレ）', '作品名'],
    ['山田くんとLv999の恋をする（１） (MFC)', '山田くんとLv999の恋をする（１）']
  ] as const;

  for (const [title, expectedTitle] of simplifiedTitles) {
    it(`simplifies ${title}`, () => {
      expect(displayTitle(title)).toBe(expectedTitle);
    });
  }

  const unchangedTitles = [
    '世界から猫が消えたなら',
    '山田くんとLv999の恋をする（１）',
    '山田くんとLv999の恋をする（第1巻）',
    'ノルウェイの森（上）',
    '【推しの子】',
    '文庫という名前の本（仮）',
    '出版をめぐる物語（文庫について）'
  ];

  for (const title of unchangedTitles) {
    it(`preserves ${title}`, () => {
      expect(displayTitle(title)).toBe(title);
    });
  }

  it('does not simplify a title to an empty string', () => {
    expect(displayTitle('（文庫版）')).toBe('（文庫版）');
  });

  it('returns the stored title when the setting is off', () => {
    simplifyBookTitles$.set(false);

    expect(displayTitle('コンビニ人間 (文春文庫)')).toBe('コンビニ人間 (文春文庫)');
  });
});

describe('compareBookTitles', () => {
  it('breaks display-title ties using the stored title', () => {
    expect(compareBookTitles('コンビニ人間', 'コンビニ人間 (文春文庫)')).toBeLessThan(0);
    expect(compareBookTitles('コンビニ人間 (文春文庫)', 'コンビニ人間')).toBeGreaterThan(0);
    expect(compareBookTitles('コンビニ人間 (文春文庫)', 'コンビニ人間 (文春文庫)')).toBe(0);
  });

  it('compares numbered volumes numerically', () => {
    expect(compareBookTitles('作品名 2巻 (文春文庫)', '作品名 10巻 (文春文庫)')).toBeLessThan(0);
  });
});
