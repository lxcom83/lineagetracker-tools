# LT tools (tools.lineagetracker.org)

Bigger tools that sit beside the Lineage Tracker app, for website members (free account). Plain HTML, CSS and
JavaScript modules: there is no build step, so what is in this folder is exactly what is served.

- `index.html`: the tools home page.
- `signin.html`: sign in with a Lineage Tracker account. It uses the same Supabase Auth as lineagetracker.org, including the two-step code.
- `print/`: **LT-Print**, the label and sticker designer.
- `catalogue/`: **LT-Catalogue**, turns a catalogue file from the app into a branded, interactive page the seller hosts anywhere (see below).
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

## Side panels (all tools)
- Every panel is grouped into expandable sections (`kit/fold.js`): LT-Print (palette, feature tree, item and label settings), LT-Planner (tools, plant tool, blocks, coming up, from the app; feature tree, plan and item settings) and LT-Catalogue (brand, controls, catalogues). Open or closed is remembered on the device per tool. Rarely used sections (numbering, fold-over and grid, arrange, from the app) start closed. Tests that need a closed section preset it with `lt_fold_*` in localStorage (see `qa-tools/tools/probe.py`).

## LT-Catalogue (built 2026-10-19)
- **What it does:** reads the app's Share, Catalogue file (`*.lineage-list.json`) and makes one self-contained page: search, filters, in-stock only, quantity steppers and an order dialog. Orders go by the buyer's own email program (mailto) or Copy order. Nothing is sent to us or stored by us. The page carries a small "Made with Lineage Tracker" credit.
- **Several catalogues:** a panel on the right lists every catalogue on the device (switch, new, rename, duplicate, delete). Each keeps its own choices and page link; the brand is shared. Saved on the device only (an older single catalogue is moved in automatically). On a phone the panel sits above the steps and can be folded.
- **Controls step:** the seller chooses what buyers see (pictures, prices, species names, descriptions, notes, pack sizes, stock wording, offer labels), how they find things (search, sort, offer filter, category buttons, in-stock tickbox), quick links, ordering, order total, price note, "how to pay" text (display only) and which items appear. Stock wording defaults to "Limited supply" (a threshold you set, default 5); exact counts never go into the page unless the seller picks "Exact numbers", and sold-out always shows. Everything else defaults to on, choices are remembered, and the preview updates live. The "Powered by Lineage Tracker" line cannot be turned off.
- **Brand kit** (`kit/brand.js`): name, tagline, logo, colours and contact, kept on the device (`lt_brand`) and savable as a `.lt-brand.json`. LT-Print offers the logo, name and contact as palette pieces, and "Print labels in LT-Print" hands the items over as label rows with a branded starter (one-off hand-over in `lt_handoff`, valid 10 minutes).
- **Share:** forum post (plain or BBCode), A5 flyer with QR, QR stickers in LT-Print. The seller hosts the downloaded page themselves, so there is no hosting cost.
- **Safety:** the page is built with textContent only and the data is embedded with `< > &` escaped; hostile text is tested. The live preview runs in a sandboxed frame.
- **Switch:** `tools_catalogue` (sql `22_tool_catalogue.sql`), off until staff turn it on.
- **Goods as well as seeds (19 Oct):** the catalogue file's per-item `kind` may be `product` (the app's "Other things"). Goods show their own group (Products if none), no species line, no offer ribbon, and the Controls step hides the species option when no item has a species. Second invented seller for demos: Bramble Hill Homestead (candles, honey, soap, tools): `catalogue/bramble-hill-homestead.*` and `demo/bramble-hill-homestead.html` (rebuild both demo pages with `node demo/build.mjs`). The "Try" buttons are on the Catalogue step.
- **Stock wording:** Controls, "Stock wording": Limited supply (default, shows at N or fewer, N default 5), Exact numbers, or Sold out only. Unless Exact is chosen the exact counts are not in the page source (`c.stock` is `out`/`low`/empty) and the quantity steppers cap at 99. Sold out always shows.
- **Addresses, labels, slips and AI reading (19 Oct, tools cache `lt-tools-v1.4.1`):** orders now have name, email, phone, street, suburb, state, postcode, country, an auto order number (`ref`) and an Edit button. "Print address labels" (all orders shown, or one) hands orders to LT-Print as a table (`kind:'address'`; columns Name, Street, Place, Country, Phone, Order, Items, From, From address) and `addressStarter()` in `print/starters.js` builds a 99.1 x 67.7 label on the 8-per-sheet layout with the seller's return address (Brand step, `post`) small at the top. "Print packing slips" opens one A5 page per order (seller brand only) and prints it. **AI reading** (`catalogue/ai.js`): optional, the seller pastes their own Anthropic key (kept in localStorage `lt_ai_key`, removable); text and/or a photo go straight from the browser to api.anthropic.com (CSP connect-src widened for it). Only item codes and names are sent; the reply is treated as data, codes are checked against the catalogue, nothing is saved until the seller presses Save. Test: `qa-tools/tools/catalogue9.py`.
- **Picture size and page size:** Controls, "Picture size": As shared, Medium (320 px) or Small (200 px). Pictures are re-encoded as JPEG in the browser (`prepPhotos` in `app.js`), only when that makes them smaller; the catalogue file is not changed. A live meter on Controls and Page shows the page size and warns above about 3 MB.
- **Orders step (private order book, `orders.js`):** new order by hand, or paste an order email made by the page (read back into items, customer, email, delivery details and note). A status for each order, private notes, a history of changes, Take off stock / Put back on stock (changes the stock numbers in this catalogue copy only, so download the page again), packing list (orders before Packed), and a spreadsheet (CSV). **Statuses are editable** (rename, add, reorder, remove when unused); the list is kept in `opts.statuses` and orders keep the key. Orders live with the catalogue on the device (`ltcat_p_<id>.orders`).
- **Backup file (`*.lt-catalogue.json`):** "Save a backup file" / "Open a backup file" in the catalogues panel. It holds the catalogue, choices (including statuses and picture size), page link and orders, and is kept by the seller in their own Drive or Dropbox. We store none of it. Opening a backup adds it as a new catalogue and cleans every field (statuses, quantities and photos are re-checked).
- **LT-Print labels from goods:** `csvRows` leaves out the Species column when no item has one and the Offer column when every offer is "Products", so label lines pick up the pack and price.

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
- `catalogue.py`, `catalogue2.py`, `catalogue3.py`: LT-Catalogue (page, search, hostile data, hand-over to LT-Print with and without a brand).
- `planner.py`: 61 checks of LT-Planner (drawing, blocks, editing every copy, undo, season slider, hide, files, a hostile plan, phone size).
- `planner_model_test.mjs`: 81 checks of the plan model (`node planner_model_test.mjs`): cleaning, blocks, growth, sun position, the app hand-over.

Serve this folder with `python3 -m http.server 8800` and run them with Playwright.
