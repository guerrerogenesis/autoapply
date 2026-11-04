# AutoApply

A Chrome extension that fills job application forms with your profile in one click.

I was tired of typing the same information from my CV in every job form. AutoApply saves your data once and uses it on Greenhouse, Lever, Workable and custom forms, in English and Spanish.

| Filled form | Profile page |
|---|---|
| ![Filled form](docs/demo-filled.png) | ![Profile](docs/options.png) |

## Features

- **One-click fill** for name, email, phone, links, city, country, salary, English level and more.
- **Smart field detection** using `autocomplete`, input type, `<label>`, `aria-label`, placeholder, `name` and `id`. Works with labels in English and Spanish.
- **Saved answers** for open questions ("Why do you want to work here?"). The extension picks the most similar saved question (Jaccard similarity).
- **Learns from you**: save the long answers you write on a page with one click.
- **Application history** with status (applied, interview, offer, rejected, ghosted), notes and CSV export.
- **Works with React, Vue and Angular forms**: it uses the native value setter and fires `input`, `change` and `blur` events.
- **Works inside iframes** (for example, embedded Greenhouse forms).
- **Private by design**: data lives in `chrome.storage.local`. No server, no tracking. The script only runs when you click the button (`activeTab`).

## Tech stack

TypeScript · Chrome Extension Manifest V3 · esbuild · Vitest + jsdom

## Project structure

```
src/
  core/        Pure logic, easy to test (no browser APIs except storage.ts)
    types.ts       Profile, SavedAnswer, Application
    normalize.ts   Text cleanup: lowercase, no accents, tokens
    rules.ts       Detection rules (EN + ES)
    matcher.ts     Field matching, answer similarity, select options, company guess
    storage.ts     Typed wrapper for chrome.storage.local
  content/     Runs in the job page
    dom.ts         Read labels, fill fields, collect answers
    content.ts     Exposes the API to the popup
  popup/       Popup UI (fill, log application, save answers)
  options/     Profile, saved answers, history, backup
public/        manifest.json, HTML and CSS
demo/          Demo form to try the extension
tests/         Unit tests + DOM tests on the demo form
```

## Getting started

```bash
npm install
npm run build      # creates dist/
npm test           # runs the tests
```

Load it in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the `dist` folder.
4. Pin AutoApply, open **Profile** and add your info.
5. Open a job form and click **Fill this form** (or press `Alt+Shift+F`).

To try it with the demo form, run `npx serve demo` (or any static server), open the page and click the extension.

## How matching works

1. Skip fields we should never touch (file, password, checkbox, hidden…).
2. Strong signals first: `type="email"`, `type="tel"` and the `autocomplete` attribute.
3. Then text signals, in this order: visible label, `aria-label`, placeholder, `name`, `id`.
   Text is normalized (`"Correo electrónico*"` → `"correo electronico"`) and checked with ordered regex rules.
4. Empty textareas get the most similar saved answer if the similarity is ≥ 0.3.
5. Fields that already have text are not changed, unless you choose "Replace".

## Roadmap

- [ ] Rules for Ashby and Workday
- [ ] Badge with the number of fields that can be filled
- [ ] Optional AI suggestions for new open questions
- [ ] Optional backend (Laravel API) to sync history between devices
