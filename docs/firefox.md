# Sabi in Firefox

Sabi uses the same code in Chrome and Firefox. Only the manifest changes, and the build creates it for you.

## Build and load

```bash
npm install
npm run build:firefox     # creates dist-firefox/
npm run lint:firefox      # Mozilla's official checks (web-ext lint)
```

1. Open `about:debugging#/runtime/this-firefox` in Firefox (version 140 or newer).
2. Click **Load Temporary Add-on…** and choose `dist-firefox/manifest.json`.
3. Pin Sabi: click the puzzle icon in the toolbar → ⚙ → **Pin to Toolbar**.

A temporary add-on is removed when you close Firefox. To keep it, publish it on [addons.mozilla.org](https://addons.mozilla.org) (free): `npm run zip:firefox` creates the file to upload.

## What is different in Firefox

| Topic | Chrome | Firefox | What Sabi does |
|---|---|---|---|
| Background | Service worker | Event page (`background.scripts`) | The Firefox build changes the manifest |
| Add-on ID | Not needed | Required | `sabi@geneg.com.mx` in `browser_specific_settings` |
| Data declaration | – | `data_collection_permissions` | `none`: Sabi collects nothing for the developer |
| `storage.setAccessLevel` | Yes | No | Skipped. The content script never reads storage, so tokens stay protected |
| `location.ancestorOrigins` | Yes | Firefox 148+ | Same-origin parents are read directly; unknown parents are treated as third-party (safe) |
| Excel download from a `data:` URL | Yes | No | Falls back to a `blob:` URL |

## Manual test checklist

Automated tests cover the logic, but these steps need a real Firefox:

- [ ] Sabi loads with no errors in `about:debugging` (click **Inspect** to see the console).
- [ ] The popup opens and shows the frog icon and the tagline.
- [ ] **Profile**: save the base info, create a role from a template, import a CV (PDF and DOCX), also into a role.
- [ ] On `demo/demo-form.html` (open it with `npx serve demo`): **Review & fill** shows the list and fills the fields.
- [ ] With roles: the popup shows **Applying as** with the role picked from the job title, and you can change it.
- [ ] **Save application** appears in **Applications** with the role.
- [ ] **Integrations**: turn on Google Sheets and click **Test connection** (Firefox asks for permission).
- [ ] **Integrations → Excel file → Update Excel now** saves `Downloads/Sabi/applications.xlsx`.
- [ ] **Backup**: export and import the JSON.

## Before publishing on AMO

- The two `UNSAFE_VAR_ASSIGNMENT` warnings come from pdf.js (Mozilla's own PDF library, unmodified). Reviewers can check it against the official release.
- Review the data declaration: integrations send job data (URL, company, role) to the services the user turns on (Google Sheets, ClickUp, a webhook). Check Mozilla's current rules to confirm if this needs an *optional* data permission.
