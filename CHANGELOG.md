# Changelog

All notable changes to the Facebook Groups Exporter will be documented in this file.

## [1.4] - 2025-12-03

### Fixed
- **Large lists now export reliably.** Facebook renders the groups list as a *virtualized* list — cards that scroll off-screen are removed from the page. Previous versions scrolled to the bottom and only collected at the end, so most groups were already gone from the page and never exported. The extension now **harvests groups incrementally while scrolling** (and does an upward sweep), so accounts with **1,000+ groups** export completely.

### Added
- **Split mode** — export your groups across multiple JSON files of **150 groups each**. Every group appears in exactly one file, and together the files cover all of your groups (deduplicated). Files are named `facebook_groups_part_01_of_NN.json`.
- Live progress feedback in the popup ("Found N groups so far…").
- The split-mode preference is remembered between sessions.

### Changed
- Exported group lists are de-duplicated by group ID.
- Added the `storage` permission (used only to remember the split-mode toggle locally).

## [1.3] - Earlier release
- Initial public functionality for exporting Facebook groups to a single JSON file.
