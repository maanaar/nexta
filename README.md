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
rmdir /s /q .next
npm run build
npm start
```

Then open <http://localhost:3000> and log in. On first start Nexta creates
two logins, **`admin@nexta.com` / `admin123`** (admin) and
**`user@nexta.com` / `user123`** (staff). Add real accounts under
**user menu → Users**, then delete these two. Next, open **user menu → Server
settings**:

1. Enter the **ETIAM database** path, the **PDF folder** and the **HL7 folder**.
2. Choose what each **PDF is found by**: accession number, ETIAM job ID,
   patient name, or a custom pattern.
3. Press **Test**. Each path is checked, and the PDF naming is tried on the
   last 50 jobs ("7 of the last 50 jobs have a matching PDF"), so you can see
   which naming this server uses.
4. Press **Save and apply.** It takes effect immediately, with no restart.

When ETIAM can't be read, the dashboard banner links straight to this page.

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

Each server is set up on the **Server settings** page (`/settings`, in the user
menu). Values are saved in Nexta's database (the `settings` table) and applied
immediately: the watchers move to the new folders, every job's expected PDF
name is recalculated, and a full sync runs.

**Where each value comes from, in order:** saved on the Settings page →
`.env` / `.env.local` → built-in default. The page shows which one applies,
and **Reset** removes the saved value.

| Setting | `.env` name | Default | What it is |
|---|---|---|---|
| ETIAM database | `ETIAM_DB_PATH` | `C:\ProgramData\Etiam\DcmPRI\StorePrint\sqlite.db` | ETIAM's print database (opened read-only) |
| PDF folder before compression | `PDF_IN_DIR` | *(none)* | Optional. Where the PDFs are first written; each is compressed into the PDF folder below. Empty = no compression step; see [section 5.2](#52-pdf-compression) |
| Ghostscript path | `GS_PATH` | *(find it)* | Path to `gswin64c.exe`; empty looks on PATH and in `C:\Program Files\gs` |
| Compress files larger than | `COMPRESS_MIN_MB` | 2 | Smaller PDFs are copied unchanged |
| PDF folder | `PDF_DIR` | `E:\pdf` | Folder the PDFs land in (after compression, when that is used). **Empty / unticked** = only use PDFs stored inside ETIAM |
| PDF found by | `PDF_NAME` | `{accession}` | File name pattern; see [section 6](#6-matching-rules-pdfs-and-phone-numbers) |
| File name must | `PDF_MATCH` | `contains` | `contains` (the name holds the accession, e.g. `112344_330930.pdf`) or `exact` (the name is exactly the accession). Patient ID is always `contains` |
| HL7 folder | `HL7_DIR` | `E:\pdfsend\hl7` | Folder with incoming HL7 messages (phone numbers) |
| Send reports automatically | `AUTO_SEND` | off | The background sender sends ready reports itself; see [section 5.1](#51-sending-over-whatsapp) |
| Start sending from | `SEND_FROM_DATE` | *(none)* | `YYYY-MM-DD`. Reports with an earlier study date are never sent. Required for `AUTO_SEND` |
| Wait before sending | `SEND_DELAY_SECONDS` | 120 | Seconds a report must be unchanged before it is sent automatically (0 = at once) |
| WhatsApp phone number ID | `WHATSAPP_PHONE_NUMBER_ID` | *(none)* | Meta WhatsApp Business phone number ID |
| WhatsApp access token | `WHATSAPP_TOKEN` | *(none)* | Meta access token. Write-only on the Settings page: never shown again |
| WhatsApp template / language | `WHATSAPP_TEMPLATE` / `WHATSAPP_LANG` | *(none)* / `ar` | Approved template with a document header |
| Test mode | `WHATSAPP_DRY_RUN` | off | Log what would be sent, call nothing |
| Log sync details | `NEXTA_DEBUG` | off | Logs what triggered each sync and how long it took |
| *(.env only)* | `NEXTA_DB_PATH` | `./data/nexta.db` | Nexta's own database, so it can't be stored inside itself. The merged-PDF cache lives next to it, in `merged/` |

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
| `no_number` | Invalid number | PDF found, but the WhatsApp number is missing or not valid for its country |
| `send` | Ready to send | PDF and a valid number present, waiting for the sender |
| `sending` | Ready to send (while sending) | Claimed by the sender: the upload to WhatsApp is in progress. Set and cleared by the sender only |
| `done` | Sent | Accepted by WhatsApp (or marked sent by hand; `sent_at` is stamped) |
| `failed` | Failed | Sending failed; the reason is on the patient page |
| `no_whatsapp` | No WhatsApp | The number has no WhatsApp account |
| `signed_out` | WhatsApp signed out | The sending WhatsApp account is logged out |

**Automatic transitions** (`deriveState` in [`lib/nexta-db.ts`](lib/nexta-db.ts)):

```
no PDF ─────────────────────────► waiting
PDF, no valid phone ────────────► no_number   (shown as "Invalid number")
PDF + valid phone ──────────────► send
done / failed / no_whatsapp / signed_out are final: the sync never changes them
```

A phone is *valid* when it normalizes for its country (see
[`lib/phone.ts`](lib/phone.ts)). For Egypt (+20) that is `01` followed by 9
digits; a leading `0` after the country code is dropped, so `+20 01012345678`
and `01012345678` both become `+201012345678`. Other countries need 8 to 15
digits including the country code. Numbers are stored as `+<digits>`.

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

### 5.1 Sending over WhatsApp

Reports are sent with Meta's WhatsApp Cloud API: the PDF is read **into memory**
(several prints are merged first), uploaded to Meta as media, then sent with an
approved *template* whose header is that document. Nothing is written to disk.
The code is in [`lib/whatsapp.ts`](lib/whatsapp.ts) (`startSend`),
[`lib/sender.ts`](lib/sender.ts) (the background sender) and
[`lib/send-rules.ts`](lib/send-rules.ts) (when a report may be sent).

**Two ways to send, one function.**

- **Send button** (patient page and each row on the dashboard): sends that
  report now. The job is checked and claimed, the page answers at once, and
  the live update shows *Sent* or *Failed* when the upload ends. It can also
  retry a failed send or send a sent report again.
- **Automatic** (`AUTO_SEND`, off by default): the sender picks up every report
  in `send` once it has been quiet for `SEND_DELAY_SECONDS` (default 120),
  counted from its last change (a new or changed PDF, a new number).

Both go through `startSend`, which claims the job with
`UPDATE … SET state='sending' WHERE state='send'`, so the same report can never
be sent twice at once.

**Rules** (`sendBlockedReason`): the report needs a PDF and a valid number, its
**study date must be on or after "Start sending from"** (`SEND_FROM_DATE`,
required to turn on automatic sending; older reports are never sent), and the
WhatsApp account must be set up (or test mode on).

**A changed report is sent again.** Each job keeps a fingerprint of its PDF
content (`pdf_sig`) and of what was last sent (`sent_sig`). If they differ
(the file was replaced, or a `_2` print arrived), the dashboard shows *Changed
after sent*, and with automatic sending on the report goes out again.
Not possible for PDFs stored inside ETIAM's database (no fingerprint).

**Failures.** A temporary problem (network, rate limit, a PDF still being
written) is retried by the automatic sender after 1, 5 and 15 minutes, then the
job is marked *Failed*. A number not on WhatsApp becomes *No WhatsApp*. If Meta
refuses the token, automatic sending pauses for 5 minutes. A job found
mid-send after a server restart is marked *Failed* for a person to check,
because the message may already have gone out. Every attempt is in the
`send_log` table and shown on the patient page.

**Test mode** (`WHATSAPP_DRY_RUN`): automatic sending does everything except
call Meta and logs what it would send. Use it to check a new server first. It
never affects the Send button, which always sends for real.

### 5.2 PDF compression

Optional. With **PDF folder before compression** (`PDF_IN_DIR`) set, the PDFs
are written there first and Nexta compresses them with Ghostscript into the
**PDF folder** (`PDF_DIR`), under the same file name. The watcher on `PDF_DIR`
then runs the normal flow (match, ready to send, send), so nothing downstream
changed. Code: [`lib/pdf-compress.ts`](lib/pdf-compress.ts).

```
PDF producer ──► PDF_IN_DIR ──(watcher 1 + Ghostscript)──► PDF_DIR ──(watcher 2)──► match → send
```

- **Originals stay** in `PDF_IN_DIR`; clean it up on your own schedule.
- Ghostscript runs with its `/ebook` preset (150 dpi), the same settings as
  `compress_pdf.py`. Files under `COMPRESS_MIN_MB` are copied unchanged.
- **Never holds a report up:** if Ghostscript is missing, fails, takes over 5
  minutes or doesn't make the file smaller, the original is copied instead.
  Every file logs one `[compress]` line with the sizes and the outcome.
- Every write into `PDF_DIR` is to a temporary name, then renamed, so the other
  watcher never sees a half-written PDF. A source file is only taken once its
  size has stopped changing.
- **Replaced file:** a new version of a PDF with the same name is compressed
  again and replaces the old one; Nexta then sees the content change (see
  *A changed report is sent again* above).
- **Catch-up:** at startup and every minute the folder is scanned for PDFs with
  no compressed copy yet (or an older one), so files that arrived while the
  server was down are not missed.
- Up to 2 files are compressed at once. The producer must be pointed at
  `PDF_IN_DIR`; PDFs still written straight to `PDF_DIR` are used as they are.

---

## 6. Matching rules: PDFs and phone numbers

### PDFs

A job's PDF is looked for in this order:

1. **Inside ETIAM's `PrintJob` row:** a BLOB column holding a PDF, or a
   column with a path to an existing `.pdf` file.
2. **In the PDF folder, by the chosen naming.** For accession and patient ID
   the file name only has to *contain* the number (see below); the other
   choices need the exact name: `<name>.pdf`, then `<name>_2.pdf`, `_3` … in
   print order, stopping at the first gap.

**What a PDF is found by** is chosen on the Settings page:

| Choice | Pattern | Example file |
|---|---|---|
| Accession number (default) | `{accession}` | `330930.pdf`, `112344_330930.pdf`, `4544_330930_45456.pdf` |
| Patient ID | `{patientid}` | `102440_report.pdf` (see the exam rule below) |
| ETIAM job ID | `@{jobuid}` | `@1-2-250-1-59-847-…-81998.pdf` (dots become dashes, like PDFCreator) |
| Patient name | `{name}` | `AHMED SAMY FOUAD.pdf` |
| Custom | any mix of `{accession}` `{jobuid}` `{jobuid_raw}` `{patientid}` `{name}` | `AHMED SAMY FOUAD_330930.pdf` |

Each job stores the value it is found by (`pdf_key`, indexed). Changing the
naming recalculates every job and re-matches the folder.

**Names that contain the number** (`PDF_MATCH=contains`, the default for
accession; always on for patient ID; `exact` keeps the old exact-name rule for
accession). Code: [`lib/pdf-match.ts`](lib/pdf-match.ts).

- The number must be a **whole piece** of the name: neighbours must be
  something other than a letter or digit (`_`, `-`, space, `.`, or the start /
  end). `330930` is found in `4544_330930_45456`, never in `1330930` or
  `3309301`. Letters and dashes in the number work too (`AB-123`). Matching
  ignores case.
- **A name that points at several jobs is not used for any of them.** If
  `4544_330930_45456.pdf` holds two known accessions, it isn't matched, and the
  patient page says why.
- A number shorter than 4 characters is never matched (too easy to meet by
  accident, e.g. a print counter like `_2`).
- **Several files for one job** are joined in print order: oldest file
  first (by modified time).
- **Patient ID and several exams:** the ID is shared by all of a patient's
  exams. A file already given to an exam stays with it. A new file goes to an
  exam only when it is the *only* one of that patient still waiting for a PDF;
  otherwise it is held and the patient page says why. (Accession avoids this.)
- Implementation: the folder's file names are indexed by their pieces, kept up
  to date from the watcher's events and rebuilt in the safety sync, so a lookup
  doesn't go through every file.

All of a name's files belong to every job with that name. The
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

- **Placeholder values are never matched**, for PDFs or for phones:
  `XXXX`, `N/A`, `UNKNOWN`, empty, all zeros. Your PDF folder contains files
  like `XXXX_2.pdf` that belong to unknown patients.
- **A file name that would belong to two different patient IDs** is not
  matched: a shared accession, or two patients with the **same name** when
  matching by name.
- **Only plain file names are built** (letters in any script, digits, space,
  `_`, `-`, `.`, `@`), so a value can't point outside the PDF folder.
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
| `pdf_key` | The PDF file name this job expects, from the naming setting (without `_2` / `.pdf`) |
| `pdf_ref` | JSON list of PDF sources: `"etiam:<column>"` or `"file:<path>"` |
| `whatsapp_num`, `phone_source` | Phone, and where it came from (`hl7` / `manual`) |
| `state` | See [section 5](#5-job-states) |
| `first_seen` | When Nexta first saw the job |
| `sent_at` | When it was sent / marked sent |

It's indexed on `patient_id`, `accession`, `study_date`, `first_seen` and `pdf_key`.

**`settings`**: values saved on the Settings page (`key`, `value`), plus the
generated session-signing secret.

**`users`**: `email` (unique, case-insensitive), `name`, `role` (`admin` /
`staff`), `password_hash` (scrypt), `created_at`.

**`hl7_phones`**: `key` (`acc:<accession>` / `pid:<patient ID>`), `phone`,
`source_file`, `seen_at`.

**`hl7_files`**: HL7 files already parsed (`name`, `mtime`).

**To start fresh:** stop the server and delete `data/nexta.db*` and
`data/merged/`. Everything ETIAM still holds is re-imported on the next start;
jobs ETIAM has already cleared are lost.

---

## 9. HTTP API

All `/api/admin/*` routes require a login (401 otherwise). Users and server
settings also require the **admin** role (403 otherwise).

| Method & path | Does |
|---|---|
| `POST /api/auth/login` | `{email, password}` → sets the signed `session_token` cookie (and `user_email`, for display) |
| `POST /api/auth/logout` | Clears the cookies |
| `GET /api/auth/me` | The logged-in user (name, email, role) |
| `GET /api/admin/users` · `POST` | *(admins)* List users · create one `{name, email, password, role}` |
| `PATCH /api/admin/users/:id` · `DELETE` | *(admins)* Change role / set a new password · delete (not yourself, not the last admin) |
| `GET /api/admin/patients?from=YYYY-MM-DD&to=YYYY-MM-DD` | Jobs in the study-date range, newest first (max 2,000) → `{data, total, sync}`. Add `sync` to force an immediate sync (the Refresh button) |
| `GET /api/admin/patients?ids=1,2,3&from=…&to=…` | Only these jobs, still limited to the range (used after a live push) |
| `GET /api/admin/patients/:id` | One job |
| `PATCH /api/admin/patients/:id` | `{whatsappNum, countryCode?}` saves a phone (validated and normalized for the country, default Egypt; 400 with the reason if invalid); `{state}` moves the job (rules in [section 5](#5-job-states)). Returns 409 with a message if the move isn't allowed |
| `POST /api/admin/patients/:id/send` | The Send button: checks and claims the report, answers 202 at once, uploads in the background. 409 with the reason if it can't be sent |
| `GET /api/admin/patients/:id/sends` | The report's send history (every attempt, newest first) |
| `GET /api/admin/patients/:id/pdf?n=all` | All of the job's PDFs merged (cached) |
| `GET /api/admin/patients/:id/pdf?n=0` | A single file (0 = first). Add `&download` to download instead of display |
| `GET /api/admin/events` | The live update stream (Server-Sent Events) |
| `GET /api/admin/settings` | Current settings, where each comes from, and the defaults |
| `POST /api/admin/settings/test` | Checks paths and PDF naming **without saving** |
| `PUT /api/admin/settings` | Saves settings and applies them (`null` for a value = back to `.env` / default) |

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
| `/settings` | [`app/settings/page.tsx`](app/settings/page.tsx) | *(admins)* Server settings: paths, PDF naming, Test, Save and apply |
| `/users` | [`app/users/page.tsx`](app/users/page.tsx) | *(admins)* Add users, change roles, set passwords, delete |

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
middleware.ts                 redirects /admin and /settings to /login without a session cookie
app/
  layout.tsx                  fonts, providers, app shell
  page.tsx                    / → /admin
  login/  admin/  organizer/  patient/[id]/      pages
  api/auth/login|logout       session cookies
  api/admin/patients/…        jobs, single job, PATCH, PDFs
  api/admin/events            live updates (SSE)
  api/admin/settings          server settings (+ /test)
  settings/                   Server settings page
components/                   navbar, dashboard table, patient view, PDF viewer, UI pieces
context/SearchContext.tsx     search text + date filter
lib/
  users.ts                    users, password hashing, signed sessions
  auth.ts                     who's logged in (getSession / getAdmin)
  config.ts                   server settings: saved → .env → default
  config-checks.ts            the Settings page's Test checks
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
| Yellow "Can't read the ETIAM database" banner | Server settings → ETIAM database → Test. Nexta must run on the ETIAM machine |
| Jobs stay "Waiting for PDF" | Server settings → Test: does the PDF naming find files ("N of the last 50 jobs")? The patient page shows the exact file name it expects, or why it can't match |
| Nothing updates live | Run with `NEXTA_DEBUG=1` and confirm `[sync] change in …` lines appear when ETIAM prints. Folders on network drives may not report changes; the 60 s safety sync still catches up |
| Turbopack crash on Windows | Use the scripts as they are (`--webpack`) |
| Login works on the server but not from other PCs | See the cookie limitation below |

---

## 13. Known limitations

- **WhatsApp sending isn't implemented.** "Ready to send" is the end of the
  automatic flow.
- **Logins:**
  - **Users are managed under Users** (admins only). Passwords are stored as
    scrypt hashes, and sessions are signed with a server secret (`NEXTA_SECRET`,
    or one generated once and kept in `nexta.db`).
  - **A session ends** when it expires (7 days), when the user is deleted, or
    when they're given a new password.
  - **Replace the default logins** created on first start (`admin@nexta.com` /
    `admin123`, `user@nexta.com` / `user123`).
  - **There's no self-service password reset;** an admin sets a new password.
  - [`middleware.ts`](middleware.ts) only checks that a session cookie is
    present (for redirects); the API verifies the signature and the role on
    every request.
- **HTTPS is recommended** when Nexta is opened from other PCs: logins and
  patient data otherwise cross the network unencrypted. The session cookie is
  marked secure automatically when the request is HTTPS (directly or via
  `X-Forwarded-Proto` from a proxy such as Caddy).
- **ETIAM's schema is only partly known:** Nexta relies on seven `pjb_*`
  columns. The startup log line shows the full table on the real server.
- **`_2`, `_3` file order is assumed** to be print order.
- **Drag and drop needs a mouse;** it doesn't work on touchscreens.
- **"All" shows at most the newest 2,000 jobs;** use a date range for older
  ones.
- **Old print history isn't imported:** PDFs from before Nexta was installed
  have no ETIAM job, so they can't be linked to patients.
