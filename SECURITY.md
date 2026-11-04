# Security

AutoApply handles personal data (name, email, phone, salary, private answers) and secrets (ClickUp token, Sheets and webhook secrets). This file explains the security audit of v0.1, what was fixed, and the risks that remain.

## Threat model

The main attacker is **a web page you open**: a fake or compromised job post, an ad inside a job page, or a widget in an iframe. It can control the HTML, the CSS, the page title and its iframes. It cannot read the extension's isolated world directly.

## Audit results (v0.1) and fixes

A trap job page (`tests/fixtures/trap-job.html`) was used to attack the real extension in Chrome.

**Before the fixes**, the page showed only 2 fields, but it received the phone number, the salary, a private saved answer, and the GitHub profile (inside a third-party iframe). It could also read the ClickUp token from the content-script context.

**After the fixes**, the page received only the 2 visible fields (first name and email). 10 hidden fields were ignored, the third-party iframe got nothing, and reading storage from the content script fails with *"Access to storage is not allowed from this context"*.

| # | Severity | Finding | Fix | Where |
|---|---|---|---|---|
| 1 | High | Hidden fields were filled (`display:none` parent, `opacity:0`, off-screen, 1×1 px, clipped) | Real visibility check on the field and all parents: CSS, `checkVisibility()`, size, position, clipping. Checked again just before filling. | `src/content/visibility.ts` |
| 2 | High | Data was sent to third-party iframes (ads, widgets) | Only the top page, same-origin iframes and known job platforms (Greenhouse, Lever, Workable…) get data. Third-party frames are listed in the popup. | `src/core/frames.ts`, `popup.ts` |
| 3 | High | Private saved answers were filled into any matching textarea | Two steps: the popup shows a preview, and you confirm. Saved answers are **not ticked** by default. Threshold raised from 0.3 to 0.4. Planted text is not saved as an answer. | `dom.ts` (`planFill` / `applyFill`) |
| 4 | Medium | The ClickUp token was readable from the content script in web pages | The content script never reads storage: the popup sends only the profile, and only to trusted frames. `chrome.storage.local` is restricted to `TRUSTED_CONTEXTS`. | `content.ts`, `background.ts` |
| 5 | Medium | Formula injection in Google Sheets / CSV through the page title | Values that start with `= + - @`, tab or carriage return get a leading `'`, in the extension **and** in the Apps Script. Page-based prefill drops formula-like starts. | `src/core/sanitize.ts`, `sheets-sink.ts` |
| 6 | Medium | Fake text near a field could choose what was filled | Explicit labels, `aria-label`, placeholder, `name` and `id` go first. Nearby text is the last option. | `dom.ts`, `matcher.ts` |
| 7 | Low | The Apps Script asked for access to all your spreadsheets | `@OnlyCurrentDoc`: access to this spreadsheet only | `sheets-sink.ts` |
| 8 | Low | Webhooks were not signed | `X-AutoApply-Signature: sha256=HMAC(secret, timestamp + "." + body)` and `X-AutoApply-Timestamp` | `webhook-sink.ts` |
| 9 | Low | The backup import trusted any JSON | Schema validation: known fields only, strings with a max length, `http(s)` URLs only, max sizes. Links are rendered only if `http(s)`. | `src/core/backup.ts` |
| 10 | Low | `optional_host_permissions: https://*/*` is broad | Accepted (see below) | `manifest.json` |
| 11 | Info | Secrets stay in clipboard history after copying | **New secret** buttons for Sheets and the webhook | Integrations tab |

Regression tests: `tests/security.test.ts` (one block per finding). Run them with `npm test`.

## Accepted risks

- **Broad optional permission (#10).** It is needed so you can use any webhook URL (self-hosted n8n, Power Automate…). It is optional, it is only asked when you turn on the webhook, and only for that exact origin. HTTPS is required.
- **Secrets at rest.** The ClickUp token and the secrets are stored unencrypted in the Chrome profile, like most extensions. Malware with access to your user folder could read them. Use a ClickUp account or workspace with only the access you need, and regenerate the token if your computer is compromised.
- **Visible but deceptive forms.** A page can still show a real, visible field that asks for your phone number. The preview shows exactly what will be filled: read it before you confirm.
- **Fields covered by other elements.** A field hidden behind another element (z-index) is not detected. The preview step is the protection.
- **The Apps Script URL is public.** Requests without the secret are rejected, and the secret has 128 bits. Regenerate it if you think it leaked.

## Good practices already in place

- `activeTab` instead of `<all_urls>`: the extension never reads pages you don't use it on.
- Manifest V3 default CSP. No `eval`. User data is never rendered with `innerHTML`.
- Integration permissions are optional and asked at the moment you turn the integration on.
- Tokens and secrets are not included in the JSON backup.
- `npm audit`: 0 known vulnerabilities (the runtime dependency is `fflate` only).

## Report a problem

If you find a vulnerability, please open a private security advisory on GitHub instead of a public issue.
