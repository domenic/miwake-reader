const japaneseScriptRegex = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

export function japaneseLangIfNeeded(text: string | undefined) {
  if (text === undefined) {
    return undefined;
  }

  return japaneseScriptRegex.test(text) ? 'ja' : undefined;
}
