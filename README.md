# LT tools (tools.lineagetracker.org)

Bigger tools that sit beside the Lineage Tracker app, for website members (free account). Plain HTML, CSS and
JavaScript modules: there is no build step, so what is in this folder is exactly what is served.

- `index.html`: the tools home page.
- `signin.html`: sign in with a Lineage Tracker account. It uses the same Supabase Auth as lineagetracker.org, including the two-step code.
- `print/`: **LT-Print**, the label and sticker designer.
- `planner/`: LT-Planner (garden and farm planner), which is a placeholder ("coming later").
- `kit/`: the shared kit every tool uses:
  - `core.js`: settings, sign-in and the membership gate.
  - `bar.js`: the top bar and tool switcher.
  - `files.js`: saving to this device, Google Drive or Dropbox, plus reading the app's backups and synced copy.
  - `tree.js`: the SolidWorks-style feature tree.
  - `history.js`: undo.
  - `qr.js`: the app's QR encoder.
  - `kit.css`: the LT look.
- `fonts/`: Atkinson Hyperlegible and Barlow Condensed (SIL Open Font Licence, see the OFL files). Bundled so nothing loads from elsewhere.
- `examples/`: the app's three examples, with records only.
- `sw.js`: works offline after the first visit. Bump `CACHE` in sw.js on every release.
- `config.json` (you create it from `config.example.json`): the Google client ID and Dropbox app key, the same as the app's.

## LT-Print in one paragraph

Three steps: **Design → Records → Print**.

- **Design.** Drag fields from your records (or text, QR codes, shapes, the tree logo, your own pictures) onto a label sized in millimetres. Arrange them with snapping, handles, alignment and a feature tree:
  - **Hide**: hidden while you design, but still prints.
  - **Lock**: cannot be moved.
  - **Disable**: left out of the print.
  - You can also rename, reorder and group.
- **More on the label:** Code 128 barcodes (made on the device and checked by an independent decoder in the tests); QR codes; automatic numbering with `{number}` (prefix, start, digits, step, carrying on from the last print); dates with a sum, such as `{today+3y}` or `{date+90d}`; and your own fields, made by typing `{Customer}` or using **New field…**.
- **Records.** Open an app backup, read your synced copy on Drive or Dropbox (passphrase-protected copies work too), open a spreadsheet (CSV or pasted), or use an example. Or **type your own** into a grid whose columns are the design's fields; these rows are saved inside the design file. With no records, a fill-in form prints one-off labels. Then tick what to print and how many of each.
- **Print.** Choose A4 or Letter sheets (the app's sticker sheets, as many as fit, or your own sheet from the box's measurements), or one label per page for label printers. A printer nudge moves everything a few millimetres for printers that print slightly off. Pick where to start on a part-used sheet and whether to draw cutting outlines, then print or save a PDF.
- **Designs.** They are `.ltprint` files (JSON, documented at the top of `print/model.js`). Save them on this device, in Google Drive ("LT-Print designs" folder) or Dropbox (the LT-Print folder), or download them. Opened files are always checked and cleaned first, because designs get shared.

## The account (owner decision 2026-10-16)

The tools need a free website account; the app never does.

- **The check.** When a tool opens it asks the server `member_tool_open` (sql `13_tools.sql`). The answer is remembered on the device for 30 days, so the tool also opens with no signal.
- **What it records.** Which tool, when first and last opened, and roughly how often. Designs and records never reach our server.
- **Not a lock.** The check is a door, not a lock: the code is public and the tools work on the device.

## Testing

The test scripts are in the handover's `qa-tools/tools/`:

- `flows.py`: 62 checks of the designer.
- `features.py`: 33 checks: barcodes decoded back, date sums, numbering, typed records, fill-in form, own sheet, nudge.
- `bcdecode.py`: independent Code 128 decoder, checked on 3,000 random codes.
- `cloud.py`: Drive and Dropbox, using stand-in services.
- `a11y.py`: checks every control has a name.
- `smoke.py`: quick check of the sign-in gate and that the designer opens.

Serve this folder with `python3 -m http.server 8800` and run them with Playwright.
