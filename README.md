# Nexta

Nexta tracks radiology reports from the moment a scanner prints them to the
moment they're delivered to the patient on WhatsApp.

It reads print jobs from the **ETIAM DcmPRI** print server, finds each job's
**PDF report**, picks up the patient's **phone number** from incoming **HL7**
messages, and shows everything on a live dashboard. No polling and no Odoo:
the server reacts to file changes the moment they happen and pushes updates to
every open screen.

> **Status:** tracking, PDFs, phone numbers and the dashboard work. Actually
> **sending on WhatsApp is not built yet**. Jobs stop at "Ready to send", and
> staff can mark them Sent / Failed by hand on the organizer board.

---

## Contents

1. [How it fits together](#1-how-it-fits-together)
2. [Running it](#2-running-it)
3. [Configuration](#3-configuration)
4. [How it works](#4-how-it-works)
5. [Job states](#5-job-states)
6. [Matching rules: PDFs and phone numbers](#6-matching-rules-pdfs-and-phone-numbers)
7. [Live updates](#7-live-updates)
8. [Nexta's database](#8-nextas-database)
9. [HTTP API](#9-http-api)
10. [Front end](#10-front-end)
11. [Project structure](#11-project-structure)
12. [Operations and troubleshooting](#12-operations-and-troubleshooting)
13. [Known limitations](#13-known-limitations)

---

## 1. How it fits together

```
 CT / MR / X-ray scanner
        │  DICOM print job
        ▼
 ETIAM DcmPRI (print server) ──► writes the job to  C:\ProgramData\Etiam\DcmPRI\StorePrint\sqlite.db
        │  prints to "PDFCreator Server"
        ▼
 PDF lands in  E:\pdf\<accession>.pdf  (later prints: <accession>_2.pdf, _3.pdf …)

 RIS / HIS ──► HL7 message with the patient's phone ──► HL7 folder

┌──────────────────────── Nexta (one Node.js process, on the ETIAM machine) ───────────────────────┐
│  watches the ETIAM database, the PDF folder and the HL7 folder (Windows file-change events)      │
│  → syncs into its own database  data/nexta.db                                                    │
│  → serves the dashboard and API, and pushes "changed" to every open browser tab                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Key points:**

- Nexta **only reads** ETIAM's database, never writes to it. There's no ETIAM
  API: Nexta opens ETIAM's SQLite file directly, read-only, the same file
  ETIAM's own "Print Jobs" window reads.
- Because of that, **Nexta must run on the ETIAM machine**, or a machine that
  can see that file and the PDF/HL7 folders.
- Nexta keeps its **own database** (`data/nexta.db`), for three reasons:
  - ETIAM clears old jobs, but Nexta keeps the history.
  - ETIAM doesn't store phone numbers or delivery state.
  - Nexta needs to remember where each job's PDF is.

**Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript,
`better-sqlite3` (SQLite), `pdf-lib` (PDF merging), `lucide-react` (icons).

---

## 2. Running it

### On the ETIAM server (production)

```bat
git pull
npm install
copy .env.example .env
notepad .env                 :: check the paths, see Configuration
rmdir /s /q .next
npm run build
npm start
```

Then open <http://localhost:3000> and log in (see [Known limitations](#13-known-limitations)
for the built-in users).

- **Use `npm run build` + `npm start`, not `npm run dev`.** The production
  build is much faster, and it's what should stay running.
- **Builds use webpack** (`--webpack` in `package.json`), because Next's
  default bundler, Turbopack, crashed on the Windows server.
- **To keep it running after reboots,** register `npm start` as a Windows
  service, for example with NSSM or pm2.

### On a development machine

Without ETIAM, point Nexta at a demo setup: a small SQLite file with a
`PrintJob` table, a folder of PDFs and a folder of HL7 files. Put the paths in
`.env.local` (git-ignored):

```env
ETIAM_DB_PATH=/path/to/nexta/data/etiam-demo/sqlite.db
HL7_DIR=/path/to/nexta/data/etiam-demo/hl7
PDF_DIR=/path/to/nexta/data/etiam-demo/pdf
```

A minimal demo ETIAM database, with the columns Nexta reads:

```bash
mkdir -p data/etiam-demo/hl7 data/etiam-demo/pdf
node -e "
const db = new (require('better-sqlite3'))('data/etiam-demo/sqlite.db');
db.exec('CREATE TABLE IF NOT EXISTS PrintJob (pjb_StudyDate TEXT, pjb_PatientsName TEXT, pjb_AccessionNumber TEXT, pjb_PatientID TEXT, pjb_Modality TEXT, pjb_StudyDescription TEXT, pjb_JobUID TEXT)');
db.prepare('INSERT INTO PrintJob VALUES (?,?,?,?,?,?,?)').run('20260924','TEST^PATIENT','ACC1000','P1000','CT','CT Head','1.2.3.1000');
"
npm run dev
```

**To simulate activity while it runs:**

- **ETIAM prints a job:** insert a row into `PrintJob`.
- **A PDF arrives:** copy any PDF to `data/etiam-demo/pdf/ACC1000.pdf`.
- **An HL7 message arrives** with that patient's phone number:
  ```bash
  printf 'MSH|^~\\&|RIS|H|N|H|2026||ORM^O01|1|P|2.3\rPID|1||P1000||TEST^PATIENT|||||||||01012345678\rORC|NW|ACC1000\r' > data/etiam-demo/hl7/test.hl7
  ```

**Never** write to the real ETIAM database.

---

## 3. Configuration

All settings are environment variables, read from `.env` / `.env.local`.

| Variable | Default | What it is |
|---|---|---|
| `ETIAM_DB_PATH` | `C:\ProgramData\Etiam\DcmPRI\StorePrint\sqlite.db` | ETIAM's print database (opened read-only) |
| `PDF_DIR` | `E:\pdf` | Folder the PDFs land in, named by accession. **Empty** = only use PDFs stored inside ETIAM |
| `HL7_DIR` | `E:\pdfsend\hl7` | Folder with incoming HL7 messages (phone numbers) |
| `NEXTA_DB_PATH` | `./data/nexta.db` | Nexta's own database. The merged-PDF cache lives next to it, in `merged/` |
| `NEXTA_DEBUG` | off | `1` logs what triggered each sync and how long it took |

Tuning constants at the top of [`lib/etiam-sync.ts`](lib/etiam-sync.ts):

| Constant | Value | Meaning |
|---|---|---|
| `DEBOUNCE_MS` | 500 ms | Wait this long after the last file change before syncing (ETIAM writes in bursts) |
| `FULL_SYNC_MS` | 60 s | Safety-net sync if nothing triggered one in this long |
| `ACTIVE_DAYS` | 30 | The general re-check only revisits jobs this recent (new files still attach to jobs of any age) |
| `PDF_RECHECK_DAYS` | 7 | Jobs this recent get their PDF list re-checked, so a later `_2` print joins |

---

## 4. How it works

### 4.1 Startup

[`instrumentation.ts`](instrumentation.ts) runs once when the Next.js server
boots and calls `startEtiamWatcher()` ([`lib/etiam-sync.ts`](lib/etiam-sync.ts)),
which does three things:

1. **Runs a first full sync,** reading all HL7 files not seen before and
   matching the PDF folder against every job still missing a PDF.
2. **Attaches file watchers** to three places:
   - ETIAM's folder, because SQLite also writes `sqlite.db-wal` / `-journal`
     next to the database,
   - the HL7 folder,
   - the PDF folder.
3. **Starts the 60-second safety timer.** If no sync ran in the last minute,
   it runs a full one; it also re-attaches any watcher that failed, for
   example a folder that didn't exist at boot.

The sync state lives on `globalThis`, because Next.js bundles
`instrumentation.ts` and the API routes separately and they must share one
watcher, one event emitter and one status.

### 4.2 What triggers a sync

Nothing polls. Windows reports file changes through `fs.watch`, and Nexta
reacts to them:

| Change | Remembered for the sync |
|---|---|
| ETIAM's `sqlite.db*` changes | nothing extra; ETIAM is always read in full (it holds few rows) |
| A file in the HL7 folder | its file name, so only that file is parsed |
| A `.pdf` in the PDF folder | its file name, so its accession's jobs are updated |

Every event restarts a **0.5 s debounce**, and the sync runs once the writes
stop. Only one sync runs at a time; a request for another one joins the
running sync.

### 4.3 The sync, step by step

`runSync()` collects the IDs of every job that actually changed:

1. **HL7 → phone numbers** (`importHl7Phones`)
   - Parses only the reported files, or the whole folder on a full scan,
     skipping files already read and unchanged (the `hl7_files` table).
   - Takes the patient ID from **PID-3** and the phone from **PID-13**, then
     **PID-14**. Both `01001234567` and the split form `^PRN^PH^^20^112^2223334`
     are understood.
   - Takes accession candidates from **ORC-2/3** and **OBR-2/3/18**.
   - Stores each phone under `pid:<patient ID>` and `acc:<accession>` in
     `hl7_phones`.
2. **ETIAM → jobs** (`importEtiamJobs`)
   - Opens ETIAM's database **read-only**. It waits up to 5 s if ETIAM is
     mid-write, rather than failing.
   - Reads every `PrintJob` column, but **binary (BLOB) values are never loaded
     into memory**: SQL only checks "does it start with `%PDF`?".
   - Cleans values (`AHMED^SAMY` → `AHMED SAMY`, `20260924` → `2026-09-24`).
   - **Upserts** each job into `jobs` by `pjb_JobUID`. New jobs start as
     *Waiting for PDF*; existing jobs are only written if a value really
     changed, so no-op syncs report nothing.
   - On the first sync it logs `ETIAM PrintJob columns: …`, ETIAM's real
     table layout.
3. **PDFs** (`applyPdfFiles`): see [section 6](#6-matching-rules-pdfs-and-phone-numbers).
4. **Phones and states** (`applyPhonesAndStates`)
   - Covers unfinished jobs that are recent, **or** of any age if a new HL7
     message named them or their PDF just changed.
   - Attaches the HL7 phone and works out the state (see
     [section 5](#5-job-states)). **A number typed in by hand is never
     overwritten by HL7.**
5. If any job changed, it **pushes their IDs** to every open screen.

Errors are recorded in the sync status (`etiamError` / `hl7Error`). They're
shown as banners on the dashboard and logged once when they appear and once
when they're fixed.

### 4.4 Data retrieval

The dashboard and organizer ask the server for **one date range only**
(`?from=…&to=…`, using an index on the study date). "Today" therefore transfers
only today's jobs. "All" is capped at the newest 2,000 and says so on screen.
The patient page loads **one patient** by ID.

---

## 5. Job states

| Stored value | Shown as | Meaning |
|---|---|---|
| `waiting` | Waiting for PDF | Print job received, no PDF found yet |
| `no_number` | No number | PDF found, no WhatsApp number yet |
| `send` | Ready to send | PDF and number present, waiting for the sender |
| `done` | Sent | Delivered (or marked sent by hand; `sent_at` is stamped) |
| `failed` | Failed | Sending failed |
| `no_whatsapp` | No WhatsApp | The number has no WhatsApp account |
| `signed_out` | WhatsApp signed out | The sending WhatsApp account is logged out |

**Automatic transitions** (`deriveState` in [`lib/nexta-db.ts`](lib/nexta-db.ts)):

```
no PDF ─────────────────────────► waiting
PDF, no phone ──────────────────► no_number
PDF + phone ────────────────────► send
done / failed / no_whatsapp / signed_out are final: the sync never changes them
```

**Manual changes:**

- **Saving a phone number** on the patient page re-queues the job (to `send`
  if it has a PDF, even after a failed send) and marks the number as typed in
  by hand.
- **Dragging a card** on the organizer board (`setManualState`):
  - *Waiting for PDF* can't be chosen by hand.
  - *No number* / *Ready to send* need the PDF, and must agree with whether
    there's a phone.
  - The outcome states (*Sent*, *Failed*, *No WhatsApp*, *Signed out*) can
    always be set.

  The server enforces these rules; the board shows them while dragging.

---

## 6. Matching rules: PDFs and phone numbers

### PDFs

A job's PDF is looked for in this order:

1. **Inside ETIAM's `PrintJob` row:** a BLOB column holding a PDF, or a
   column with a path to an existing `.pdf` file.
2. **In `PDF_DIR`, by accession number:** `<accession>.pdf`, then
   `<accession>_2.pdf`, `_3` … in print order. Numbering stops at the first
   gap.

All of an accession's files belong to every job with that accession. The
patient page shows them **merged into one PDF** ("All pages"), with a tab per
original file.

- **Merging** uses `pdf-lib`.
- **The result is cached** in `merged/` next to `nexta.db`, under a
  fingerprint of the source files' sizes and modification times. A new `_3`
  print produces a fresh merge automatically.
- **Damaged files** are skipped rather than failing the whole report.
- **The originals are never modified.**

**When files are matched:**

- **A new PDF in the folder:** its accession's jobs, **of any age**.
- **On every sync:** jobs from the last 30 days still missing a PDF, and jobs
  from the last 7 days (to pick up a later `_2`).
- **At startup and in the safety sync:** the folder's file names are matched
  against **every** job still missing a PDF. Names only, so tens of thousands
  of files is still quick.

### Phone numbers

Matched from `hl7_phones`: **by accession first, then by patient ID**. A new
HL7 message updates every unfinished job with its accession or patient ID,
**of any age**.

### Safety rules (avoiding the wrong patient)

- **Placeholder accessions are never matched**, for PDFs or for phones:
  `XXXX`, `N/A`, empty, all zeros. Your PDF folder contains files like
  `XXXX_2.pdf` that belong to unknown patients.
- **An accession used by two different patient IDs** is not matched to a PDF.
- **Only plain accessions become file names** (letters, digits, `_`, `-`,
  `.`), so a value can't point outside the PDF folder.
- **Exact names only:** `330930` never matches `3309301.pdf`.
- **The patient page explains** why a PDF can't be matched, instead of
  showing "waiting" forever.

---

## 7. Live updates

```
file change ─► fs.watch ─► 0.5 s debounce ─► sync ─► changed job IDs
                                                         │
phone save / card move (PATCH) ──────────────────────────┤
                                                         ▼
                                     EventEmitter "changed" (lib/etiam-sync.ts)
                                                         │
                         GET /api/admin/events (Server-Sent Events, one per tab)
                                                         │
                                  event: changed   data: {"ids":[12]}
                                                         ▼
          dashboard / organizer: fetch ?ids=12 for the current date range, merge into the list
          patient page: reload only if its own ID is in the list
```

- **The transport is Server-Sent Events:** one long-lived HTTP response per
  open tab, server → browser only, with automatic reconnect built into
  browsers. A `: ping` comment every 25 s keeps it open.
- **With more than 200 changed jobs,** or after a reconnect, tabs reload their
  whole date range instead of fetching by ID.
- **An idle dashboard makes no requests.**

---

## 8. Nexta's database

`data/nexta.db` (SQLite, WAL mode) is created automatically. Columns added in
later versions are added on startup.

**`jobs`**: one row per ETIAM print job.

| Column | |
|---|---|
| `id` | Nexta's ID (used in URLs) |
| `job_uid` | ETIAM's `pjb_JobUID` (unique) |
| `patient_name`, `patient_id`, `accession`, `modality`, `study_desc`, `study_date` | From ETIAM |
| `pdf_ref` | JSON list of PDF sources: `"etiam:<column>"` or `"file:<path>"` |
| `whatsapp_num`, `phone_source` | Phone, and where it came from (`hl7` / `manual`) |
| `state` | See [section 5](#5-job-states) |
| `first_seen` | When Nexta first saw the job |
| `sent_at` | When it was sent / marked sent |

It's indexed on `patient_id`, `accession`, `study_date` and `first_seen`.

**`hl7_phones`**: `key` (`acc:<accession>` / `pid:<patient ID>`), `phone`,
`source_file`, `seen_at`.

**`hl7_files`**: HL7 files already parsed (`name`, `mtime`).

**To start fresh:** stop the server and delete `data/nexta.db*` and
`data/merged/`. Everything ETIAM still holds is re-imported on the next start;
jobs ETIAM has already cleared are lost.

---

## 9. HTTP API

All `/api/admin/*` routes require a login (they return 401 otherwise).

| Method & path | Does |
|---|---|
| `POST /api/auth/login` | `{email, password}` → sets the `session_token` and `user_email` cookies |
| `POST /api/auth/logout` | Clears the cookies |
| `GET /api/admin/patients?from=YYYY-MM-DD&to=YYYY-MM-DD` | Jobs in the study-date range, newest first (max 2,000) → `{data, total, sync}`. Add `sync` to force an immediate sync (the Refresh button) |
| `GET /api/admin/patients?ids=1,2,3&from=…&to=…` | Only these jobs, still limited to the range (used after a live push) |
| `GET /api/admin/patients/:id` | One job |
| `PATCH /api/admin/patients/:id` | `{whatsappNum}` saves a phone; `{state}` moves the job (rules in [section 5](#5-job-states)). Returns 409 with a message if the move isn't allowed |
| `GET /api/admin/patients/:id/pdf?n=all` | All of the job's PDFs merged (cached) |
| `GET /api/admin/patients/:id/pdf?n=0` | A single file (0 = first). Add `&download` to download instead of display |
| `GET /api/admin/events` | The live update stream (Server-Sent Events) |

Each job is returned as a `PatientRecord` ([`lib/patient-data.ts`](lib/patient-data.ts)):
- names, IDs, dates and the waiting timer, already formatted,
- `pdfs` (a label and URL per file, plus "All pages" when there are several),
- `pdfBlockedReason` (why no PDF can be matched, if any).

---

## 10. Front end

| Page | File | Shows |
|---|---|---|
| `/login` | [`app/login/page.tsx`](app/login/page.tsx) | Login form |
| `/admin` | [`components/AdminTable.tsx`](components/AdminTable.tsx) | Date filter, summary cards (which also filter), table grouped by modality |
| `/organizer` | [`app/organizer/page.tsx`](app/organizer/page.tsx) | One column per state; drag and drop changes the state |
| `/patient/:id` | [`components/PatientDetailView.tsx`](components/PatientDetailView.tsx) | Delivery progress, WhatsApp number, study details, PDF viewer |

**Supporting pieces:**

- **[`lib/use-patients.ts`](lib/use-patients.ts):** `usePatients(dateFilter)` and
  `usePatient(id)` load data and apply live updates (`useLiveChanges`).
- **[`context/SearchContext.tsx`](context/SearchContext.tsx):** the navbar
  search and the date filter, shared across pages.
- **[`lib/date-filter.ts`](lib/date-filter.ts),
  [`components/DateFilterBar.tsx`](components/DateFilterBar.tsx):** the Today /
  Yesterday / Last 7 days / All / Custom presets. Today is the default.
- **[`lib/patient-states.ts`](lib/patient-states.ts):** labels, colors and
  column order for each state.
- **[`components/ui.tsx`](components/ui.tsx):** shared building blocks: the
  header band, cards, badges, avatars and banners.
- **[`app/globals.css`](app/globals.css):** the color palette (navy, brand
  blue, logo teal) as Tailwind theme tokens.

---

## 11. Project structure

```
instrumentation.ts            starts the ETIAM watcher when the server boots
middleware.ts                 redirects /admin to /login without a session cookie
app/
  layout.tsx                  fonts, providers, app shell
  page.tsx                    / → /admin
  login/  admin/  organizer/  patient/[id]/      pages
  api/auth/login|logout       session cookies
  api/admin/patients/…        jobs, single job, PATCH, PDFs
  api/admin/events            live updates (SSE)
components/                   navbar, dashboard table, patient view, PDF viewer, UI pieces
context/SearchContext.tsx     search text + date filter
lib/
  etiam-sync.ts               watchers, sync, ETIAM/HL7/PDF matching, change events
  nexta-db.ts                 Nexta's database: schema, queries, state rules, safety checks
  pdf-merge.ts                merged-PDF building and cache
  patient-data.ts             database row → what the UI shows
  patient-states.ts           state labels and colors
  use-patients.ts             data hooks + live updates (browser)
  date-filter.ts              date presets and ranges
  auth.ts                     session check
static/                       logo and background image
data/                         nexta.db, merged-PDF cache, local demo (git-ignored)
```

---

## 12. Operations and troubleshooting

**Console messages:**

| Message | Meaning |
|---|---|
| `Watching <folder> for changes` | A watcher is attached |
| `Can't watch <folder> (will keep retrying)` | The folder doesn't exist or isn't reachable; retried every minute |
| `ETIAM PrintJob columns: …` | ETIAM's real table layout (printed once at startup) |
| `ETIAM import failed: …` / `… working again` | ETIAM's database couldn't be read; the dashboard shows the last synced data |
| `HL7 import failed: …` / `… working again` | The HL7 folder is missing or unreadable; numbers can still be typed in |
| `[sync] …` | Only with `NEXTA_DEBUG=1`: the trigger, duration and how many jobs changed |

**Common problems:**

| Symptom | Check |
|---|---|
| Yellow "Can't read the ETIAM database" banner | `ETIAM_DB_PATH`; Nexta must run on the ETIAM machine |
| Jobs stay "Waiting for PDF" | `PDF_DIR`; does `<accession>.pdf` exist there? The patient page shows the exact name it expects, or why it can't match |
| Nothing updates live | Run with `NEXTA_DEBUG=1` and confirm `[sync] change in …` lines appear when ETIAM prints. Folders on network drives may not report changes; the 60 s safety sync still catches up |
| Turbopack crash on Windows | Use the scripts as they are (`--webpack`) |
| Login works on the server but not from other PCs | See the cookie limitation below |

---

## 13. Known limitations

- **WhatsApp sending isn't implemented.** "Ready to send" is the end of the
  automatic flow.
- **Authentication is a placeholder:**
  - There are two hard-coded users in
    [`app/api/auth/login/route.ts`](app/api/auth/login/route.ts):
    `admin@nexta.com` / `admin123` and `user@nexta.com` / `user123`.
  - The session check only verifies that the cookie **exists**, not its
    value. Anyone can set a `session_token` cookie and get in. Sessions need
    signing (an HMAC with a server secret) before real use.
  - [`middleware.ts`](middleware.ts) only guards `/admin`. `/organizer` and
    `/patient` pages load without a login, but their data API refuses.
- **The login cookie is `secure` in production,** so over plain HTTP from
  another PC (`http://192.168.x.x:3000`) the browser drops it and login fails
  silently. Serve over HTTPS (for example behind Caddy with `tls internal`),
  or make the flag follow the actual protocol.
- **ETIAM's schema is only partly known:** Nexta relies on seven `pjb_*`
  columns. The startup log line shows the full table on the real server.
- **`_2`, `_3` file order is assumed** to be print order.
- **Drag and drop needs a mouse;** it doesn't work on touchscreens.
- **"All" shows at most the newest 2,000 jobs;** use a date range for older
  ones.
- **Old print history isn't imported:** PDFs from before Nexta was installed
  have no ETIAM job, so they can't be linked to patients.
