# Facebook Groups Exporter

This browser extension allows users to export all of their Facebook groups into a JSON file, including each group's link and name.

## Features

- Fetches the user's Facebook groups.
- Reliably handles **very large lists (1,000+ groups)** by harvesting groups incrementally while scrolling, before Facebook removes off-screen cards from the page.
- **Fast**: scrolls at machine speed and waits only as long as Facebook takes to render — a 1,200-group export finishes in well under a minute, and the page stays responsive throughout.
- Automatically de-duplicates groups.
- **Split mode**: files of **150 groups each download while the scan runs** — the first part arrives within seconds, and if anything interrupts the export you keep every part already saved. Every group appears in exactly one file (`facebook_groups_part_01.json`, `_02`, …), and together the files cover *all* of your groups (deduped).
- Live progress feedback while scrolling, including part files downloaded so far.
- Exports group data in a structured JSON format.
- User-friendly popup interface for initiating the export process.

## Installation
Option A: Download and install from the official Chrome Web Store.

Option B:

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/facebook-groups-exporter.git
   ```
2. Navigate to the project directory:
   ```
   cd facebook-groups-exporter
   ```
3. Open your browser and go to the extensions page (e.g., `chrome://extensions` for Chrome).
4. Enable "Developer mode" (usually a toggle in the top right corner).
5. Click on "Load unpacked" and select the `facebook-groups-exporter` directory.

## Usage

1. Click on the extension icon in your browser toolbar.
2. (Optional) Toggle **Split mode** if you want multiple files of 150 groups each instead of one large file.
3. Click the **Export Groups** button. The extension will auto-scroll your Facebook Groups page to find every group.
4. In split mode, part files download as they fill up during the scan; otherwise a single JSON file downloads when the scan completes.

> ℹ️ Keep the tab in the foreground until the export finishes — Chrome throttles background tabs, which pauses the scan.

## Permissions

- `activeTab`, `tabs`, `scripting` — to run the exporter on your Facebook Groups tab.
- `downloads` — to save the export files reliably; without it, Chrome's "multiple downloads" prompt can silently block split-mode part files.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project should be used for personal use only.
