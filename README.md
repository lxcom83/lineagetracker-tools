# LT tools (tools.lineagetracker.org)

Bigger tools that sit beside the Lineage Tracker app, for website members (free account). Plain HTML, CSS and
JavaScript modules: there is no build step, so what is in this folder is exactly what is served.

- `index.html`: the tools home page.
- `signin.html`: sign in with a Lineage Tracker account. It uses the same Supabase Auth as lineagetracker.org, including the two-step code.
- `print/`: **LT-Print**, the label and sticker designer.
- `planner/`: **LT-Planner**, the garden and farm planner (first slice, staff preview: the 2D plan; see below).
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
  - You can also rename and reorder, and **Merge into group** / **Demerge group** (buttons above the tree, or Ctrl+G and Ctrl+Shift+G) to move or hide several items as one.
- **Edit all text** (top of the palette): one window listing every text box, barcode and QR code, so a packing document or order label can be filled in by typing down the list. Changes show on the label as you type, and one undo reverses them all.
- **More on the label:** Code 128 barcodes (made on the device and checked by an independent decoder in the tests); QR codes; automatic numbering with `{number}` (prefix, start, digits, step, carrying on from the last print); dates with a sum, such as `{today+3y}` or `{date+90d}`; and your own fields, made by typing `{Customer}` or using **New field…**.
- **Records.** Open an app backup, read your synced copy on Drive or Dropbox (passphrase-protected copies work too), open a spreadsheet (CSV or pasted), or use an example. Or **type your own** into a grid whose columns are the design's fields; these rows are saved inside the design file. With no records, a fill-in form prints one-off labels. Then tick what to print and how many of each.
- **Print.** Choose A4 or Letter sheets (the app's sticker sheets, as many as fit, or your own sheet from the box's measurements), or one label per page for label printers. A printer nudge moves everything a few millimetres for printers that print slightly off. Pick where to start on a part-used sheet and whether to draw cutting outlines, then print or save a PDF.
- **Designs.** They are `.ltprint` files (JSON, documented at the top of `print/model.js`). Save them on this device, in Google Drive ("LT-Print designs" folder) or Dropbox (the LT-Print folder), or download them. Opened files are always checked and cleaned first, because designs get shared.

## LT-Planner, first slice (built 2026-10-16)

The 2D plan, with the same kit as LT-Print (top bar, Plans menu, undo, tools left, feature tree and properties right).

- **Draw:** beds, areas, paths, fences, plants, water tanks, drip lines, seed benches and notes, in metres with snapping. Drag to move, corner squares to resize or reshape, arrows to nudge. On a tablet: drag with one finger, pinch to zoom.
- **Blocks (like AutoCAD):** select items and press Make block (Ctrl+B). Copy the block (Ctrl+D) and move it around. Edit block changes every copy. Explode turns one copy back into loose items, and Make unique splits one copy off. Keep saves a block to your block library on this device, for other plans.
- **Feature tree:** fixed folders (Ground, Buildings and models, Structures, Beds and areas, Planting, Water, Animals), each with Hide, Lock and Disable. You can also rename, drag to reorder, and drop into another folder.
- **Through the season:** a date slider above the plan. Plants fade when they aren't in the ground and grow from seedling to full size.
- **Sun path:** the compass shows north and the sun's path for the day, worked out on the device from the latitude.
- **Files:** saved on this device as you work. Download as a `.ltplan` (documented at the top of `planner/model.js`) to keep or share in groups, and open one back in. Opened files are always checked and cleaned. **Plan for the app** downloads the beds and planned sowings for the app to import later.
- **Seasons and the calendar:**
  - **Plant next here** sets up a follow-on planting: plant 1 until its harvest, then plant 2 in the same spot from the next day.
  - The **Job** tool puts jobs on the plan, once or repeating weekly, monthly or yearly.
  - **Coming up** lists sowings, swaps, harvests and jobs. Click one to jump the plan to that day.
  - **Add to my calendar** downloads an `.ics` file with a reminder before each event. **Plan for the app** carries the same reminders to the app.
- **The app's Places and plants:** read them from an app backup. App plants can be placed in their linked bed at a free spot, with their variety, sowing date and record link (cross seedlings take their crop from their parents). This is the first step to planning from a cross.
- **Linking places:** read your places from an app backup. Beds, benches, areas, tanks and block copies link to a Place and use the app's name for it. Beds with the same name link automatically, and **Add as bed** adds a place that isn't in the plan yet. The plan for the app sends the Place id, so the app updates that Place instead of making a new one.
- **Planting guides** (`planner/guides.js`): 35 common crops with spacing, row spacing, sun, days to harvest, and companions to grow near or keep apart. Each location has its own pack. Australia has five zones written out as month lists. The United States (about 100 states and regions), Canada (provinces and territories), the United Kingdom (nations and regions), Ireland (provinces), Germany (states), France (regions), the Netherlands (regions), Spain (regions) and New Zealand (regions) are worked out in `planner/frost.js` from each place's typical last spring frost and frost-free days (data in `planner/frost-regions.js`), with a short rule per crop in weeks from those dates; each country also keeps a few broad climate bands as a fallback. US and Canadian dates come from frost-date tables for a representative town per state or province; the other countries' regional dates (including Spain's) are estimates. owner to review the zone dates and any month that looks wrong for your area.
  - **No default location (owner decision).** Until the plan has a country and zone with a guide pack, guide features say "This function can not be used without a location". The plan for the app carries the location, so the app uses the same pack.
  - **Fill this bed** plants a bed at the guide spacing.
  - Plants warn when they're out of season, and plants too close to a bad neighbour get a red ring.
  - Icons grow on an S-shaped curve from seedling to full size.
  - This is a general guide: the app says to check a local guide.
- **Seed saving:** tick "Saving seed from this plant". The planner then warns when a variety that can cross is closer than the isolation distance while both are in the ground, for example two pumpkin lines, or broccoli and kale (one species). Distances and cross groups are in `ISOLATION` in `guides.js`.
- **Crop rotation:** a plant warns when its family grew in the same bed within 3 years, and the bed lists everything grown in it over time.
- **Plants from the app:** the same backup read also brings in the app's plants. **Put N in their beds** places each one in the bed linked to its app Place, at a free spot, with its variety, sowing date and record link.
- **One demo plan:** a backyard veg patch.
- **Not yet:** Google Drive and Dropbox, the 3D view, ground shaping, model import, reading plants from the app (only Places for now), and the app's import screen for the plan for the app, including its reminders.

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
- `planner.py`: 61 checks of LT-Planner (drawing, blocks, editing every copy, undo, season slider, hide, files, a hostile plan, phone size).
- `planner_model_test.mjs`: 81 checks of the plan model (`node planner_model_test.mjs`): cleaning, blocks, growth, sun position, the app hand-over.

Serve this folder with `python3 -m http.server 8800` and run them with Playwright.
