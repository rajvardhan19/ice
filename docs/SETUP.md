# Setup

Start to finish, about 20 minutes. Ten of those are Google's OAuth consent screen.

**You need:** a Google account, and an agent that can search the web and create
files in Drive. The reference runner is a [Claude cloud routine](https://claude.ai/code/routines);
[alternatives are listed here](../routine/README.md#running-it-somewhere-else).

---

## 1. Build the Drive layout

In Google Drive, create:

```
Job Applications/            ← the sync scans this folder
├── Cover Letters/           ← one subfolder per application, created by the agent
Resumes/
├── Software Engineering/
├── ML Research/
└── …one folder per variant
```

Upload one resume per career track. Keep the folder names meaningful — they
become the `Resume Used` values in your tracker and the labels on your dashboard
breakdown.

**Collect the folder IDs.** Open each folder and copy the long string from the
URL:

```
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345
                                       └──────────── this ─────────────┘
```

You need IDs for: `Job Applications`, `Cover Letters`, `Resumes`, and each
individual resume file. Park them in a scratch note.

## 2. Create the tracker sheet

A new, empty Google Sheet. Name it whatever you like. Copy its ID from the URL
the same way — `docs.google.com/spreadsheets/d/<ID>/edit`.

## 3. Install the Apps Script

1. In the tracker: **Extensions › Apps Script**.
2. Delete the stub `myFunction` and paste in all of
   [`apps-script/JobTrackerSync.gs`](../apps-script/JobTrackerSync.gs).
3. **Save** (⌘S / Ctrl+S).
4. Pick `setup` from the function dropdown and click **Run**.

### The OAuth prompt

Google will ask for authorisation, then warn you that the app is unverified.
That warning is correct and expected: the "app" is the copy of the script sitting
in your own spreadsheet, which Google has no reason to have reviewed.

**Advanced › Go to \<your project\> (unsafe) › Allow.**

You are granting the script — running as you, in your account — access to:

| Scope | Why |
| --- | --- |
| Sheets | Write rows into the tracker |
| Drive | Read inbox sheets, rename them once consumed |
| Docs (read-only) | Pull outreach text out of the Docs the agent wrote |
| Gmail (send + compose) | Digest emails and outreach drafts |
| Calendar | Interview, deadline, and follow-up events |
| Script | Install its own triggers |

Nothing leaves your account. If you'd rather not grant Gmail or Calendar, see
[running with fewer scopes](#running-with-fewer-scopes) below.

When `setup` finishes you'll have three tabs — `Tracker`, `Config`, `Dashboard` —
a **Job Finder** menu, and three installed triggers.

## 4. Fill in the Config tab

Two keys are load-bearing:

| Key | Value |
| --- | --- |
| `Your name` | How outreach is signed |
| `Job Applications folder ID` | The folder from step 1 |

The rest have working defaults, but the search brief is worth ten minutes now —
`Role keywords`, `Locations`, and especially `Exclusions`, which is what stops
the agent handing you Staff Engineer roles. [Full reference →](CONFIGURATION.md)

Then run **Job Finder › Check setup**. Every line should read `OK`. If any says
`MISSING` or `ERROR`, fix it before continuing — [Troubleshooting](TROUBLESHOOTING.md)
covers each one.

## 5. Schedule the discovery agent

1. Open [`routine/PROMPT.md`](../routine/PROMPT.md) and replace every
   `<<PLACEHOLDER>>` with the IDs from steps 1 and 2.
2. Connect the Google Drive connector at
   [claude.ai/settings/connectors](https://claude.ai/settings/connectors), using
   **the same Google account that owns the folders**. A mismatch here is the most
   common setup failure — the agent authenticates fine and then can't see
   anything.
3. Create the routine at [claude.ai/code/routines](https://claude.ai/code/routines)
   with your filled-in prompt.

Schedules are UTC. `13 12,23 * * *` is 08:13 and 19:13 US Eastern — before and
after the workday, so results are waiting when you sit down. Re-check the
conversion after a daylight-saving shift.

## 6. First run

Trigger the routine by hand rather than waiting for the schedule.

Expected, in order:

1. `Cover Letters/<Company> - <Role>/` subfolders appear, each with a resume
   copy, a cover letter, and an outreach doc.
2. A `Job Inbox - YYYY-MM-DD-HHmm` sheet appears in `Job Applications`.
3. You run **Job Finder › Sync now** (or wait up to an hour for the trigger).
4. Rows land in `Tracker`, the inbox sheet is renamed `[synced] Job Inbox - …`,
   the `Dashboard` counts move.
5. A digest email arrives, and Gmail drafts appear for each job.

If step 2 didn't happen, the agent's write access is wrong — check the connector
account. If step 2 worked but step 4 didn't, run **Check setup**; it's almost
always the folder ID.

## 7. Make it yours

- Leave `Recruiter auto-send` at `FALSE` for at least a week. Read the drafts.
  They tell you a lot about whether your search brief is right.
- Watch which rows go red at 5 days — that's `Stale days` telling you the agent
  is finding things you don't actually want to apply to. Tighten `Exclusions`.
- Check the `By Resume Used` breakdown on the dashboard. If one variant never
  gets picked, either the label is wrong in the prompt or the variant is
  redundant.

---

## Running with fewer scopes

You can drop capabilities if the OAuth grant is more than you want:

| Don't want | Do this | Lose |
| --- | --- | --- |
| Gmail | Set `Digest enabled` to `FALSE` and leave `Recruiter auto-send` `FALSE`; delete `sendDigest_` and `processOutreach_` and their call sites in `syncFromBot` | Digests, outreach drafts |
| Calendar | Delete `dailyMaintenance`, `addEventOnce_`, and the interview branch of `handleEdit` | Deadline, follow-up, interview events |

Remove the matching entries from
[`apps-script/appsscript.json`](../apps-script/appsscript.json) too, then re-run
`setup`. Google re-prompts whenever the scope set changes.

## Updating to a new version

Paste the new file over the old one, save, and run `setup` again. It is
idempotent: it rewrites headers, reapplies formatting, rebuilds the dashboard,
and adds any missing trigger — and it **never** overwrites an existing `Config`
tab, so your settings survive.

If a release adds a scope, Google will prompt for re-authorisation on that first
run. [CHANGELOG.md](../CHANGELOG.md) flags those releases.
