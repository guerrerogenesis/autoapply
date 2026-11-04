# Integrations (Adapter pattern)

Turn apps on and off in **Profile → Integrations** (or **Change** in the popup). Each app has a switch and a badge:

- **Off**: not used.
- **Not saved** / **Needs setup**: turned on, but the fields are missing or not saved yet.
- **On**: every new application is saved there.

The popup shows where it will save: `Saves to: This browser · Google Sheets · ClickUp`.

When you click **Save application**, AutoApply can save the job in several places at the same time: this browser, ClickUp, an Excel file, Google Sheets, etc.

## Design

```
                 popup.ts
                    │  save(application)
                    ▼
        ┌──────────────────────────┐
        │  saveApplication()        │  dispatcher
        │  (registry.ts)            │
        └───────────┬──────────────┘
                    │ uses the interface only
                    ▼
          «interface» ApplicationSink
          id · label · phase? · save() · update?() · remove?() · testConnection?()
       ┌──────────┬──────────┼──────────────┐
       ▼          ▼          ▼              ▼              ▼
   LocalSink  ClickUpSink  WebhookSink  GoogleSheetsSink  ExcelSink
       │          │          │              │              │
 chrome.storage ClickUp API  any URL     your Sheet     .xlsx in Downloads
   (phase 1)    (phase 2, in parallel)   (phase 3: "final", after ClickUp)
```

- **`ApplicationSink`** (`src/core/sinks/types.ts`) is the common interface.
- Each **adapter** translates our `Application` to the format of one service. For example, `ClickUpSink.toTask()` turns an application into a ClickUp task.
- **`createSinks()`** is a small factory: it reads the settings and returns the active adapters.
- **`saveApplication()`** is the dispatcher:
  1. Saves locally first. If it is a duplicate, it stops (no duplicate ClickUp tasks).
  2. Calls the external adapters in parallel. If one fails, the others still save.
  3. Saves the external ids and links (for example the ClickUp task URL) in the local record.
  4. Calls the `phase: 'final'` adapters (Excel). They run last, so the file already has the ClickUp link.

The popup never imports `ClickUpSink`. It only knows the interface.

## Add a new destination (example: Notion)

1. Create `src/core/sinks/notion-sink.ts` with a class that `implements ApplicationSink`.
2. Add `'notion'` to `SinkId` and a `NotionSettings` type to `Settings` (+ defaults).
3. Add one line in `createSinks()`.
4. Add a form in the Integrations tab.
5. Write tests with a fake `fetch` (see `tests/sinks.test.ts`).

The popup, the dispatcher and the other adapters do not change (Open/Closed principle).

## ClickUp

1. In ClickUp: **Settings → Apps → API Token → Generate**. The token starts with `pk_`.
2. Open the list where you want the tasks. Copy the URL from the browser (or only the number after `/li/`).
3. In AutoApply: **Profile → Integrations → ClickUp**. Turn it on, paste the token and the list URL, click **Save** and accept the Chrome permission for `api.clickup.com`.
4. Click **Test connection**. You should see the list name.

Each application creates a task named `Company — Role`, with the link, date and notes in the description and the tag `autoapply`. The optional **Status** must be a status that exists in that list (for example `to do`).

> The token is saved only in `chrome.storage.local` and is not included in the JSON backup.

## Google Sheets (GoogleSheetsSink) · recommended

Your sheet is the place to track your applications. AutoApply adds one row per application:

| Date | Company | Role | Status | URL | Notes | ClickUp | Id |
|---|---|---|---|---|---|---|---|

- **New application** → appends one row. Company can be empty if the page does not show it.
- **Status** is a dropdown (applied, interview, offer, rejected, ghosted). Edit it in the sheet.
- AutoApply **never overwrites what you edit in the sheet**. If you change a field in the extension (for example notes), only that cell is updated.
- Deleted in the extension → the row is deleted.
- `Id` is used to find the row. Do not edit it (you can hide the column).

Setup (5 minutes, no Google Cloud project):

1. Create a Google Sheet. Open **Extensions → Apps Script**.
2. In AutoApply: **Integrations → Google Sheets → Copy script**. Paste it in Apps Script (replace everything) and save.
3. **Deploy → New deployment → Web app**. Execute as: *Me*. Who has access: *Anyone*. Authorize it with your Google account.
4. Copy the Web app URL (`https://script.google.com/macros/s/…/exec`), paste it in AutoApply, turn it on and click **Save**. It tests the connection.

Security: the URL is public, so the script has a **secret** that only your extension knows. Requests without it are rejected. The script uses `@OnlyCurrentDoc`, so Google only gives it access to this spreadsheet. Text that looks like a formula (`=`, `+`, `-`, `@`) is saved as plain text. If the secret leaks, click **New secret**, copy the script again and use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

## Excel file (ExcelSink)

> For tracking, prefer Google Sheets. This file is **rebuilt from the extension history each time**, so changes you make inside the file (for example Status) are lost on the next save. Change the status in the **Applications** tab instead.

1. In AutoApply: **Integrations → Excel file**. Turn it on, keep the name `AutoApply/applications.xlsx` (or change it) and click **Save**.
2. Chrome asks for the **downloads** permission. Accept it.
3. The file is created in `Downloads\AutoApply\applications.xlsx`.

How it works:

- A browser cannot add one row to an existing file. So `ExcelSink` rebuilds the **whole** workbook from the local history and overwrites the file (`chrome.downloads`, `conflictAction: 'overwrite'`). The local history is the source of truth.
- The file is also updated when you change a status, edit notes or delete a row in the **Applications** tab.
- Columns: Date, Company, Role, Status, URL, Notes, ClickUp link. The header is bold and frozen, and filters are on.
- **Close the file in Excel before saving**. Windows locks open files, so the update fails, and the popup shows the error. Click **Update Excel now** when the file is closed.
- Chrome only allows paths inside your Downloads folder.
- The `.xlsx` is written by `src/core/xlsx.ts` (~100 lines, with `fflate` for the zip), not by a big library.

You can also download a copy at any time with **Applications → Export Excel**.

**Excel Online / OneDrive** (optional): create a Power Automate flow with the trigger *When an HTTP request is received* and the action *Add a row into a table*. Use its URL in the Webhook adapter.

## Webhook payload and signature

Each request has two headers, so your receiver can check that it really comes from your AutoApply (copy the secret with **Copy signing secret**):

```
X-AutoApply-Timestamp: 1793750000
X-AutoApply-Signature: sha256=<hex HMAC-SHA256 of "timestamp.body" with your secret>
```

Example check in Node.js:

```js
import crypto from 'node:crypto';

function isFromAutoApply(req, rawBody, secret) {
  const ts = req.headers['x-autoapply-timestamp'];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // older than 5 minutes: replay
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const given = String(req.headers['x-autoapply-signature'] ?? '');
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
```

Payload:

```json
{
  "event": "application.created",
  "version": 1,
  "application": {
    "id": "…", "company": "Acme", "role": "Full Stack Developer",
    "url": "https://…", "appliedAt": "2026-11-03T18:00:00.000Z",
    "status": "applied", "notes": ""
  }
}
```

## Ideas for later

- `update()` for ClickUp, to move the task when you change the status.
- Retry queue: if ClickUp is down, save the failed result and try again later.

## How much does the browser store?

`chrome.storage.local` allows 10 MB. One application is about 400 bytes, so the history fits **more than 20,000 applications**. The local copy is small and is used to avoid duplicates and to show your history offline. The sheet is where you track.
