# Changelog

All notable changes to the Facebook Groups Exporter will be documented in this file.

## [1.6] - 2026-08-12

### Fixed
- **Exports no longer stop early on large accounts.** v1.5 waited only ~4.5 seconds at the bottom of the loaded list before concluding the list was finished — but Facebook's pagination fetches can take far longer than that (and get slower when pages are requested in quick succession), so exports could end at a few hundred groups. End-of-list detection now waits through pagination stalls: escalating growth-aware waits (~22s total), extended further while Facebook's loading spinner is visible (up to ~45s more). Mid-scan speed is unchanged; the patience is paid once, at the true end of the list. Verified against a throttled-pagination simulation (3–6s page fetches) where v1.5 stopped at 488 of 1,200 groups and v1.6 exports all 1,200.

## [1.5] - 2026-08-12

### Fixed
- **No more freezing.** The scanner used to re-classify every visible group card twice per second, walking far up the page and serializing huge chunks of it each time — on large accounts this locked up the browser. Each card is now classified once, with the walk stopped at the card's own boundary, so the page stays responsive throughout the export (worst main-thread pause in testing: ~34ms).
- **Much faster exports.** All artificial "human-like" random delays and smooth-scroll animation were removed. The scanner now scrolls in instant steps and waits only as long as Facebook actually takes to render the next cards (adaptive, typically ~100–200ms per step). A 1,200-group export that previously took many minutes completes in about half a minute in testing.
- **Classification no longer leaks between neighboring cards**, which could previously let a "suggested" group slip into the export.

### Changed
- **Split mode is now truly incremental.** Part files of 150 groups download *while the scan runs* — the first file typically arrives seconds in, and if anything interrupts the export you keep every part already downloaded. Files are named `facebook_groups_part_01.json`, `_02`, … (the total isn't known mid-scan, so names no longer include "of NN"). Every group still appears in exactly one file.
- **Downloads now go through the browser's downloads API** (new `downloads` permission). This prevents Chrome's "this site is trying to download multiple files" prompt from silently swallowing part files mid-scan.
- Popup progress now shows part files as they download, and export completion is reported reliably even if the extension's background worker restarts mid-scan.
- Removed dead code (`src/utils/groupParser.js`).

### Notes
- Correction to the 1.4 notes below: the split-mode preference is remembered using the popup's local storage; no `storage` permission was ever added or needed.

## [1.4] - 2025-12-03

### Fixed
- **Large lists now export reliably.** Facebook renders the groups list as a *virtualized* list — cards that scroll off-screen are removed from the page. Previous versions scrolled to the bottom and only collected at the end, so most groups were already gone from the page and never exported. The extension now **harvests groups incrementally while scrolling** (and does an upward sweep), so accounts with **1,000+ groups** export completely.

### Added
- **Split mode** — export your groups across multiple JSON files of **150 groups each**. Every group appears in exactly one file, and together the files cover all of your groups (deduplicated). Files are named `facebook_groups_part_01_of_NN.json`.
- Live progress feedback in the popup ("Found N groups so far…").
- The split-mode preference is remembered between sessions.

### Changed
- Exported group lists are de-duplicated by group ID.

## [1.3] - Earlier release
- Initial public functionality for exporting Facebook groups to a single JSON file.
