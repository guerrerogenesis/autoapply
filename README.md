# Sabi – Job Forms Helper 🐸

**Less typing. More opportunities.**

Sabi is a browser extension for **Chrome and Firefox** that fills job application forms with your profile, after you review them, and helps you track every application.

I was tired of typing the same information from my CV in every job form. Sabi saves your data once and uses it on Greenhouse, Lever, Workable and custom forms, in English and Spanish.

| Popup | Profile and roles | Filled form |
|---|---|---|
| ![Popup](docs/popup.png) | ![Profile and roles](docs/options.png) | ![Filled form](docs/demo-filled.png) |

Project case study: [English](docs/portfolio/en.md) · [Español](docs/portfolio/es.md)

## Features

**Your profile**
- **Import from your CV** (PDF, DOCX or TXT): Sabi finds your name, email, phone, links, title, location, English level, years of experience and summary. It runs in the browser, with no upload, and you review every field before it is saved.
- **Roles**: one base profile (name, email, links…) plus your own versions for each kind of job, for example *Frontend Developer* or *Data Analyst*. A role changes the title, summary, years, salary and portfolio. New users start with no roles and create their own from 12 generic templates or from scratch.
- **Saved answers** for open questions ("Why do you want to work here?"), for all roles or only for one role. Save the long answers you write on a page with one click.

**Filling forms**
- **Review & fill**: the popup shows the list of fields it will fill, and you confirm. Saved answers are suggested, not ticked.
- **Picks the role from the job title**: "Senior React Developer" → *Frontend Developer*. You can change it before filling.
- **Smart field detection** with `autocomplete`, input type, `<label>`, `aria-label`, placeholder, `name` and `id`, in English and Spanish.
- **Works with React, Vue and Angular forms** (native value setter + real `input`, `change` and `blur` events) and inside job-platform iframes (for example, embedded Greenhouse forms).

**Tracking your applications**
- **Application history** with status (applied, interview, offer, rejected, ghosted), notes, the role you applied as, and export to Excel or CSV.
- **Integrations (Adapter pattern)**: save each application in **Google Sheets** (recommended: one row per application, you track the status there), **ClickUp**, an **Excel file** or any **webhook**, at the same time. Turn them on with a switch. See [docs/integrations.md](docs/integrations.md).

**Private and safe**
- Your data lives in the browser (`chrome.storage.local`). No server, no tracking, no account.
- The script only runs when you click the button (`activeTab`). External sites (like ClickUp) are only allowed when you turn on an integration.
- **Backup**: export and import everything as JSON (secrets are not exported).
- Read the full [Privacy Policy](PRIVACY.md) ([en español](PRIVACY.es.md)).

## Security

Sabi was audited with a trap job page (hidden fields, third-party iframes, formula injection). All findings are fixed and covered by tests. See [SECURITY.md](SECURITY.md).

- Fills **only visible fields**, and only after you review the list.
- Never sends your data to third-party iframes (ads, widgets).
- Saved answers are never filled without your tick.
- Text that looks like a formula is neutralized before it reaches Google Sheets, Excel or CSV.
- PDFs are read in a safe mode (no code from the file can run). Backup files are validated before import.

## Brand

Sabi is a wise, friendly sage-green frog. *A little wisdom for your job search.*

| Token | HEX | Usage |
|---|---|---|
| `--sabi-primary` | `#667D59` | Primary brand, buttons, active states |
| `--sabi-background` | `#F7F6F0` | Main background |
| `--sabi-surface` | `#FFFFFF` | Cards, forms, surfaces |
| `--sabi-secondary` | `#EAE9E1` | Borders, dividers |
| `--sabi-text` | `#34382F` | Headings and text |
| `--sabi-muted` | `#77796F` | Secondary text |
| `--sabi-accent` | `#B5A3C9` | Small details only |

Font: Inter (bundled, no request to Google Fonts). Light and dark mode. Tokens: `public/styles.css`. Icon sources: `assets/`.

## Tech stack

TypeScript · WebExtensions Manifest V3 (Chrome and Firefox) · esbuild · Vitest + jsdom · web-ext · pdf.js · fflate

## Getting started

```bash
npm install
npm run build      # Chrome, Edge, Brave -> dist/
npm test           # 114 tests
```

**Chrome, Edge or Brave**

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the `dist` folder.
3. Pin Sabi, open **Profile** and add your info (or **Import from your CV**).
4. Open a job form and click **Review & fill this form** (or press `Alt+Shift+F`).

**Firefox (140+)**

Run `npm run build:firefox`, open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `dist-firefox/manifest.json`. Details: [docs/firefox.md](docs/firefox.md).

**Try it with the demo form:** run `npx serve demo`, open the page and click the extension.

### Scripts

| Command | What it does |
|---|---|
| `npm run build` | Build for Chrome, Edge and Brave (`dist/`) |
| `npm run build:firefox` | Build for Firefox (`dist-firefox/`) |
| `npm run watch` | Rebuild on every change (Chrome) |
| `npm test` | Run all tests |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint:firefox` | Mozilla's official checks (`web-ext lint`) |
| `npm run zip` / `npm run zip:firefox` | Create the files to upload to the Chrome Web Store / Firefox Add-ons |

## How it works

### Matching fields

1. Skip fields that must never be touched (file, password, checkbox, hidden…).
2. Skip fields a person cannot see (hidden parent, `opacity: 0`, off-screen, 1×1 px, clipped). This protects you from pages that hide fields to steal data.
3. Strong signals first: `type="email"`, `type="tel"` and the `autocomplete` attribute.
4. Then text, in this order: explicit label, `aria-label`, placeholder, `name`, `id`, and last the text near the field (it is easy to fake, so it goes last). Text is normalized (`"Correo electrónico*"` → `"correo electronico"`) and checked with ordered rules.
5. Empty textareas get the most similar saved answer (similarity ≥ 0.4), as a suggestion you can tick.
6. Fields that already have text are not changed, unless you choose "Replace".

### Roles

- The role is picked by its **keywords**: the keyword that appears **first** in the job title wins ("Full Stack Developer (React/Laravel)" → *Full Stack*, not *Frontend*). With no match, Sabi uses your default role, or only the base profile.
- The profile used to fill = **base profile + the role's fields**. Empty role fields use the base profile.
- The role is saved with the application (the **Profile** column in Google Sheets, Excel and CSV), so you can see which role gets more interviews.

## Project structure

```
src/
  background.ts          Service worker / event page (restricts storage access)
  background-helpers.ts
  core/                  Pure logic, easy to test
    types.ts               Profile, SavedAnswer, Application, fill plan
    normalize.ts           Text cleanup: lowercase, no accents, tokens
    rules.ts               Detection rules (EN + ES)
    matcher.ts             Field matching, answer similarity, select options, company guess
    roles.ts               Role templates, pick a role from the job title, merge with the base profile
    frames.ts              Which frames can get your data (top page, same origin, known job platforms)
    sanitize.ts            Formula neutralization, safe links, HMAC, secrets
    backup.ts              Backup validation (profile, roles, answers, applications)
    cv-parser.ts           Finds profile data in a CV (EN/ES rules, no AI)
    cv-docx.ts             Reads text from .docx files
    xlsx.ts                Small .xlsx writer (no big library)
    downloads-writer.ts    Writes files with the downloads API (Chrome and Firefox)
    storage.ts             Typed wrapper for chrome.storage.local
    sinks/                 Adapter pattern: where an application is saved
      types.ts               ApplicationSink interface + settings
      local-sink.ts          This browser (always on)
      sheets-sink.ts         Google Sheets via Apps Script
      clickup-sink.ts        ClickUp API
      excel-sink.ts          .xlsx file in the Downloads folder
      webhook-sink.ts        Signed JSON POST (Zapier, Make, n8n, Power Automate…)
      registry.ts            Factory, dispatcher and status of each integration
  content/               Runs in the job page (only when you click)
    content.ts             API for the popup + frame check
    dom.ts                 Read labels, plan and fill fields, collect answers
    visibility.ts          Is this field really visible to a person?
  popup/                 Popup: role selector, review & fill, save application
  options/               Settings page
    options.ts             Profile, saved answers, applications, integrations, backup
    roles-ui.ts            Role sub-tabs inside Profile
    cv-text.ts             Reads PDF / DOCX / TXT (pdf.js in safe mode)
public/                  manifest.json, HTML, CSS, icons, fonts
scripts/build.mjs        Build for Chrome or Firefox
assets/                  Icon sources (SVG)
demo/                    Demo form to try the extension
docs/                    Integrations and Firefox guides, screenshots
tests/                   Unit, DOM, security and Firefox tests + a trap job page
```

## License

Copyright © 2026 Génesis Guerrero.

Sabi is **source-available** under the [PolyForm Strict License 1.0.0](LICENSE.md). You may read the code and use Sabi for **noncommercial** purposes. You may **not** distribute it (including publishing it in the Chrome Web Store, Firefox Add-ons or any other store), sell it, or make changes or new works based on it.

The name "Sabi" and the frog logo are not licensed: see [TRADEMARKS.md](TRADEMARKS.md). Third-party components keep their own licenses: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Roadmap

- [ ] Rules for Ashby and Workday forms
- [ ] Badge on the icon with the number of fields that can be filled
- [ ] `update()` for ClickUp (move the task when the status changes)
- [ ] CI with GitHub Actions (typecheck, tests, both builds)
- [ ] Publish on the Chrome Web Store and Firefox Add-ons
- [ ] Optional backend (Laravel API) to sync the history between devices
