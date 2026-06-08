# Facebook Groups Exporter

This browser extension allows users to export all of their Facebook groups into a JSON file, including each group's link and name.

## Features

- Fetches the user's Facebook groups.
- Reliably handles **very large lists (1,000+ groups)** by harvesting groups incrementally while scrolling, before Facebook removes off-screen cards from the page.
- Automatically de-duplicates groups.
- **Split mode**: save your groups across multiple files of **150 groups each**. Every group appears in exactly one file, and together the files cover *all* of your groups (deduped).
- Live progress feedback while scrolling.
- Exports group data in a structured JSON format.
- User-friendly popup interface for initiating the export process.

## Installation
Option A: Download and install from official the chrome webstore.

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
4. When complete, a JSON file (or several, in split mode) will download containing your group data.

> ?? For accounts with 1,000+ groups the scroll-and-harvest process can take a few minutes — leave the tab in the foreground until it finishes.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project should be used for personal use only.
