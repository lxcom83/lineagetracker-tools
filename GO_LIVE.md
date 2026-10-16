# Putting the LT tools live (tools.lineagetracker.org)

Do these in order. Nothing here touches the app. Until step 7, members who visit see "not open to members yet",
but you (staff) can already try LT-Print. Accounts (ACCOUNTS_GO_LIVE.md) must be set up first.

## 1. Database (Supabase, about 1 minute)

1. Supabase, SQL Editor, New query: paste **`13_tools.sql`** (from the accounts backend zip) and Run. It is safe to run twice.
2. This adds:
   - the switches `tools_print` and `tools_garden` (both off);
   - the `tool_use` table;
   - `member_tool_open`, `member_tools_export`, `adm_tools_stats` and `adm_member_tools`;
   - a `public_settings` that also says which tools are open.
3. If you ever re-run `10_accounts.sql`, run `12_blog.sql` and `13_tools.sql` again afterwards, because 10 resets `public_settings`.
4. Re-deploy the **admin** function from `paste-these/admin-function.txt`, so the staff page shows LT-Print totals and each member's tool use. It works before step 1 too; it just shows no tool numbers.

## 2. A new GitHub repository

1. Make a new public repository, for example `lxcom83/lineagetracker-tools`.
2. Upload everything in `lineagetracker-tools.zip` to it. It already has a `CNAME` file with `tools.lineagetracker.org`.
3. In the repository's Settings, Pages, choose Deploy from a branch, `main`, `/ (root)`, then Save.

## 3. DNS (Porkbun)

1. Add a **CNAME** record: host `tools`, answer `lxcom83.github.io`.
2. Back in GitHub Pages, wait for the green tick, then turn on **Enforce HTTPS**. This can take up to an hour the first time.

## 4. Spam check on the tools' sign-in page (Cloudflare Turnstile)

1. In Cloudflare, open Turnstile and choose the widget the website uses.
2. Under Hostname management, add `tools.lineagetracker.org` and save.
3. Without this, the spam check on the tools' sign-in page fails and nobody can sign in there.

## 5. Google Drive and Dropbox (only if you want saving to them)

1. **Google Cloud Console**: APIs and Services, Credentials, open the app's OAuth client ID. Add `https://tools.lineagetracker.org` to **Authorized JavaScript origins** and save. Use the same client ID as the app.
2. **Dropbox App Console**: open the app's Dropbox app. Add `https://tools.lineagetracker.org/print/` to **Redirect URIs**.
3. In the tools repository, create **`config.json`** from `config.example.json` and paste in the same `googleClientId` and `dropboxAppKey` as the app's `config.json`.
4. If you skip this step, LT-Print still works: designs save on the device and as downloaded files, and records come from backup files and spreadsheets.

## 6. Try it as staff

1. Open https://tools.lineagetracker.org, then Sign in. Use your own account; you will be asked for your two-step code.
2. Open LT-Print. It opens for staff even while the switch is off, and says so. Check that:
   - **Records → Try it with an example** loads records;
   - **Print** opens the print window;
   - saving to Drive or Dropbox works, if you did step 5.

## 7. Open it to members

1. On the staff page, Settings, switch on **tools_print**.
2. The account page then shows an "LT tools" box linking to LT-Print.
3. The roadmap on What's next already lists LT-Print as Under development. Change it to Just added when you open it.

## What members agree to

The website terms (section 8, "The LT tools") and the privacy page ("LT tools (LT-Print)") already cover the tools. The terms version did not change, because accounts are not open yet.

## Releasing a new version later

Bump `CACHE` in `sw.js` (for example `lt-tools-v1.0.1`), so devices pick up the new files.
