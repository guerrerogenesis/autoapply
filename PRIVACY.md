# Sabi – Privacy Policy

*Effective date: November 12, 2026*

Sabi – Job Forms Helper ("Sabi") is a browser extension that fills job application forms with your profile and helps you track your applications. This policy explains what data Sabi handles, where it is stored, and when it leaves your browser.

**In short: the developer of Sabi does not collect, receive, sell or share any of your data. Everything stays in your browser, unless you turn on an integration.**

## 1. Data Sabi stores in your browser

Sabi saves this data **only on your device**, in your browser's extension storage (`chrome.storage.local`):

- **Profile:** name, email, phone, city, country, links (LinkedIn, GitHub, portfolio), job title, company, years of experience, salary expectation, availability, English level and summary.
- **Roles:** the versions of your profile that you create (title, summary, years, salary, portfolio and keywords).
- **Saved answers** to open questions.
- **Application history:** company, role, job page URL, date, status, notes and the role you applied as.
- **Settings and secrets for integrations** you turn on (for example a ClickUp token or a Google Sheets script URL and secret).

This data is not sent to the developer or to any server owned by the developer. Sabi has no account system, no analytics and no tracking.

## 2. Your CV

When you use **Import from your CV**, the file (PDF, DOCX or TXT) is read **inside your browser**. It is not uploaded anywhere and it is not stored: Sabi only keeps the fields you choose to save in your profile.

## 3. Job pages

Sabi only runs on a page when **you click it** (the `activeTab` permission). Then it:

- reads the form fields of that page to know what to fill;
- reads the page title and URL to suggest the company, the role and which of your roles to use;
- fills the fields you confirm, with your profile.

When you submit a job application, the data you put in the form goes to that company or job platform, as with any form you fill by hand. Sabi never fills fields that are hidden, and never sends your data to third-party frames such as ads or widgets.

## 4. Integrations (only if you turn them on)

All integrations are **off by default**. When you turn one on, Sabi sends **the data of each application you save** (not your profile) to the service you chose:

| Integration | What is sent | Sent to |
|---|---|---|
| Google Sheets | Date, company, role, profile (role you applied as), status, job URL, notes, ClickUp link and an internal id | The Google Apps Script in **your own** Google account |
| ClickUp | A task with company, role, role you applied as, date, job URL and notes | **Your** ClickUp workspace (`api.clickup.com`) |
| Webhook | The application data in JSON, signed with your secret | The URL **you** enter |
| Excel file | Your application history | A file in **your** Downloads folder (nothing is sent online) |

These services are operated by third parties (for example Google and ClickUp), and their own privacy policies apply to the data you send them. You can turn any integration off at any time.

## 5. Permissions

- **storage:** to save your data in your browser.
- **activeTab** and **scripting:** to read and fill the form on the page you are on, only when you click Sabi.
- **downloads** (optional): to save the Excel file, only if you turn on the Excel integration.
- **Access to specific websites** (optional): only for the integration you turn on, for example `api.clickup.com`, `script.google.com` or your webhook URL.

## 6. Your control and deletion

- You can edit or delete your profile, roles, answers and applications at any time in Sabi's settings.
- **Backup** exports your data as a JSON file (secrets are not included).
- **Removing the extension** deletes all the data Sabi stored in your browser.
- Data you sent to an integration (for example rows in your Google Sheet) stays in that service until you delete it there.

## 7. Security

Sabi was designed and audited to protect your data: it only fills visible fields, only works in trusted frames, neutralizes spreadsheet formulas, signs webhooks and validates imported files. Details: [SECURITY.md](SECURITY.md).

## 8. Children

Sabi is a tool for job seekers and is not intended for children under 13.

## 9. Changes to this policy

If this policy changes, the new version will be published in this file with a new effective date.

## 10. Contact

Questions about privacy: **sabi@geneg.com.mx** · [geneg.com.mx](https://geneg.com.mx)
