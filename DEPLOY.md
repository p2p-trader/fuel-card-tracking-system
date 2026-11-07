# Deploy Guide — Fuel Card Tracking System

The system is a Google Apps Script web app. The database is a Google Sheet the
system creates itself on first run. Staff never open the Sheet directly.

## One-time setup (owner)

1. Go to https://script.google.com and create a **New project**. Name it
   `Fuel Card Tracking System`.
2. Copy every file from this repository into the project, keeping the same
   names:
   - `Code.gs`, `Util.gs`, `Auth.gs`, `Data.gs`, `Calc.gs`,
     `Masters.gs`, `Entries.gs`, `Trips.gs`, `Reports.gs`, `Api.gs`
   - `Index.html`, `Styles.html`, `App.html`
   - `appsscript.json` — in the Apps Script editor, open **Project Settings**
     and tick *"Show appsscript.json manifest file"*, then paste this file's
     contents over the default manifest.
   (Or use `clasp`: `clasp clone`/`clasp push` with this folder as the root.)
3. Click **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone** (the app has its own username/password login;
     this setting only controls who can open the page)
4. Open the web app URL. The **Startup Wizard** appears (company details →
   admin account → defaults → finish). After the wizard, the normal login
   screen starts and the wizard never appears again.
5. The system creates its database Sheet automatically in your Google Drive
   (named `Fuel Card System DB`). Keep that file — it holds all data.

## Updating later

Edit/paste the changed files in the Apps Script editor, then
**Deploy → Manage deployments → Edit → New version → Deploy**. The Sheet and
all data are untouched by code updates.

## API (read-only)

Other applications can read data with an API key created in
**Settings → API Keys** inside the app:

```
GET <web app URL>?api=vehicles&key=<API KEY>
GET <web app URL>?api=cards&key=<API KEY>
GET <web app URL>?api=entries&from=2026-11-01&to=2026-11-30&key=<API KEY>
GET <web app URL>?api=dashboard&key=<API KEY>
GET <web app URL>?api=report&name=monthly-cards&month=2026-11&key=<API KEY>
```

PINs and passwords are never returned by the API. Every call is logged.
