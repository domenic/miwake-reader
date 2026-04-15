# Miwake Reader

An online ebook reader aimed at Japanese language learners, since reading ebooks in a web browser allows the use of extensions like [Yomitan](https://yomitan.wiki/).

This project is a revival fork of the original [ッツ Ebook Reader](https://github.com/ttu-ttu/ebook-reader/), which has been largely abandoned. Improvements include a refreshed UI, bug fixes, and behind-the-scenes dependency updates.

Hosted on <https://reader.miwake.app/>.

## Improvements over ッツ Ebook Reader

### Refreshed interface

- All top-bar menus have been redesigned to no longer just be cryptic icons, but instead be labeled and grouped.
- Dialogs, menus, and sidebars throughout the app have been rebuilt using native browser primitives, making them more consistent and behaviorally reasonable. For example, the <kbd>Esc</kbd> key always closes them. (This work is still ongoing; track progress in [issue #11](https://github.com/domenic/miwake-reader/issues/11).)
- The "Export" functionality has been split into separate "Back Up" and "Sync" actions.
- A new theme editor makes it easier to customize your reading colors, with live preview.
- The statistics title filter sidebar has been redesigned for clarity.
- A welcome screen introduces new users to the app.

_Note: the refreshed interface, especially the top bars, has not yet been adapted for mobile: track progress in [issue #15](https://github.com/domenic/miwake-reader/issues/15)._

### Book content presentation fixes

- Section-break margins in EPUBs are now preserved correctly in vertical writing mode.
- Furigana on the rightmost line of text is no longer clipped in vertical paginated mode.

### Cloud storage

- OneDrive now uses an app-specific folder instead of requiring broad file access.
- Cloud storage connections stay logged in more reliably: you should see fewer popups.

### Other improvements

- Books in the book manager show improved progress bars.
- Furigana display settings have been simplified and combined.
- Settings and statistics sub-pages now have their own individual URLs.

### Bug fixes

- Books are now reliably marked as completed, even when auto-bookmark is turned on.
- The "Import Folder" button now appears on all capable browsers, not just desktops. (It was previously hidden on mobile devices and on touch-screen desktop devices.)

### Under the hood

- Upgraded to Svelte 5, Tailwind CSS v4, TypeScript v6, and other modern tooling.
- Removed unfinished audiobook and subtitle features that were never completed upstream.
- Added a [privacy policy](https://reader.miwake.app/privacy).

## Migrating from ッツ Ebook Reader

### Transferring your books and reading data

1. In ッツ Ebook Reader, open the book manager and enter selection mode (the double-checkbox icon), select all books (the double-checkmark icon), then press the export icon (cloud with an up arrow). Choose "Zip File" and press Start.
2. In Miwake Reader, press "Restore Backup" and choose the zip file you exported.

This transfers your books, reading progress, statistics, and reading goals.

### Re-configuring your settings

Your appearance and display settings are not included in the backup and will need to be set up again in Miwake Reader. A few areas deserve particular attention:

- **Custom themes** need to be recreated using the new theme editor.
- **Furigana display**: The old separate "Hide Furigana" and "Hide Furigana Style" toggles have been combined into a single setting with four options.
- **Cloud storage**: You'll need to re-authenticate with Google Drive and/or OneDrive, and re-sync your files there into the new Miwake Reader app folder.

## Development

1. Have [Node.js](https://nodejs.org/) installed.

2. Run `npm install`.

3. Run `npm run dev` for a development server, or `npm run build` to write the production code in the `build/` directory (which you can then use any static server to view).
