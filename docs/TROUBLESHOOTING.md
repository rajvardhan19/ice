# Troubleshooting

Start with **Job Finder › Check setup**. It reports every tab, the folder, the
config, and all three triggers in one dialog, and most problems announce
themselves there.

For anything else, **Extensions › Apps Script › Executions** is the log. Every
trigger run is listed with its status and any thrown error.

---

## Nothing is syncing

### `Check setup` says `MISSING "Job Applications folder ID" in Config`

Put the folder ID in the `Config` tab. Copy it from the folder's URL:
`drive.google.com/drive/folders/<THIS>`. The full URL won't work — ID only.

### `Check setup` says `ERROR Cannot open folder …`

The ID is wrong, or the folder belongs to an account the script can't reach.
Confirm you're signed into the same Google account that owns the folder, and
that the ID isn't a *file* ID (a Sheet's ID, say) rather than a folder's.

### `Check setup` says `MISSING trigger syncFromBot`

Run `setup` again. If triggers still don't appear, check
**Apps Script › Triggers** for a failing installation, and confirm you completed
the OAuth grant — trigger creation needs the `script.scriptapp` scope.

### Everything reads `OK`, but no rows appear

Walk the chain:

1. **Is there an inbox sheet?** Look in the folder for
   `Job Inbox - <timestamp>`. If not, the problem is the agent, not the script —
   jump to [the discovery section](#the-agent-isnt-producing-anything).
2. **Is it already `[synced]`?** Then it was consumed. Either its rows were all
   duplicates, or they landed and you're looking at the wrong tab.
3. **Is the name right?** It must *start with* `Job Inbox`. `job inbox - …` and
   `Inbox - Jobs` are both invisible to the scan.
4. **Is it a real Google Sheet?** An uploaded `.csv` or `.xlsx` is not — the scan
   filters on `MimeType.GOOGLE_SHEETS`. Convert with **File › Save as Google
   Sheets**.
5. **Is `Link to Job Req` populated?** Rows with a blank URL are skipped
   silently, by design.
6. **Is it a duplicate?** A URL already in `Tracker` — including in a row you
   deleted the *contents* of but not the row itself — will never re-import.

### Rows imported into the wrong columns

The inbox sheet's header order doesn't match. The script reads **positionally**,
not by header name. Compare row 1 against [SCHEMA.md](SCHEMA.md); the usual cause
is an agent prompt that was edited without updating the header list.

---

## The agent isn't producing anything

### No files appear in Drive at all

Almost always the connector account. The Drive connector must be authorised with
**the same Google account that owns the folders**. A mismatch authenticates
cleanly and then sees an empty Drive.

Check that the routine actually ran, too — a scheduled run that errored still
shows in the routine's history with its output.

### It creates cover letters but no inbox sheet

The run died between steps. Read the routine's output: usually it ran out of
verified jobs, or hit a search/fetch failure late. The Apps Script is unaffected;
the orphaned cover-letter folders make those jobs look "already processed" on the
next run, so delete them if you want the jobs retried.

### It finds nothing, run after run

Your brief is too narrow. In order of impact: clear `Target companies`, widen
`Locations`, loosen `Exclusions`, broaden `Role keywords`. Also remember the
agent only looks at postings from the last 7 days and discards unverifiable
URLs — a genuinely quiet week is possible.

### The same job appears twice

Two different URLs for one posting (a company page and an aggregator). Dedup is
by exact URL — see [the trade-off](ARCHITECTURE.md#idempotency). Delete the row;
the URL stays in the tracker's history only if the row stays, so the duplicate
may recur. Adding the aggregator to `Exclusions` is the practical fix.

---

## Email

### No digest arrives

Check `Digest enabled` is `TRUE`, and note that **a sync that adds zero rows
never emails** — that's intentional, not a bug. Then check `Digest recipient`
(blank = the account running the script) and your spam folder. Gmail sometimes
files self-addressed HTML mail as promotional.

### Gmail quota exceeded

Consumer accounts get ~100 recipients/day, Workspace ~1,500. If you hit it,
lower `Max sends per run` and turn `Digest enabled` off temporarily. The sync
itself keeps working; only the mail fails.

### Outreach drafts aren't appearing

The row must have `Outreach Status` = `Pending` exactly — a trailing space or a
different value is skipped. Rows without a recruiter address still draft, to you,
with `[DRAFT - add recruiter]` in the subject.

If drafts *stopped* appearing, check the Executions log for a Gmail error; the
script leaves those rows `Pending` and retries next hour, so they aren't lost.

### It emailed a recruiter I didn't approve

`Recruiter auto-send` is `TRUE`. Set it to `FALSE` immediately — the next sync
picks that up. Only rows still at `Pending` can send; anything already `Sent`
won't repeat.

---

## Calendar

### No events at all

`dailyMaintenance` runs at 07:00 and only creates events for future `Deadline`
values and `Applied` rows past `Follow-up days`. If neither condition holds,
there's nothing to create. Run it by hand from the Apps Script editor to test.

### An event I deleted won't come back

By design. Created events are recorded as `evt_<kind>_<key>` in Document
Properties so they're only ever created once. To force a re-create, delete that
property under **Apps Script › Project Settings**, or change the row's URL.

### Interview event didn't appear

The `handleEdit` trigger must be *installable* — a simple `onEdit` can't call
Calendar. Confirm it's listed under **Triggers**, and note it only fires on a
genuine human edit: pasting a block of rows or a script write won't trigger it.

---

## Authorisation

### "This app is blocked" / "unverified app"

Expected. The app is your own copy of the script, which Google has no reason to
have reviewed. **Advanced › Go to \<project\> (unsafe) › Allow.**

If your account is managed by an organisation, an admin may have blocked
unverified scripts outright — you'll need a personal account or an admin
exception.

### It suddenly wants authorisation again

You pulled a version that added a scope. Re-authorise; [CHANGELOG.md](../CHANGELOG.md)
flags releases that do this.

### "You do not have permission to call GmailApp.sendEmail"

The grant is incomplete — you approved some scopes but not all. Run `setup` from
the editor and complete the prompt fully.

---

## Data

### `setup` deleted my extra columns

It does: anything past column 21 is dropped, so the schema stays canonical. Keep
custom fields in `Notes`, or [extend the schema properly](SCHEMA.md#changing-the-schema).

### Formatting keeps getting reset

`applyFormats_` runs on every sync and rebuilds dropdowns, conditional formats,
and the filter. Manual formatting in those specific ranges won't survive.
Everything else — column widths, fonts, extra tabs — is untouched.

### The dashboard shows `#REF!` or wrong numbers

Usually a schema edit that moved a column without updating `buildDashboard_`'s
hardcoded letters. See [SCHEMA.md](SCHEMA.md#changing-the-schema). **Job Finder ›
Rebuild dashboard** re-creates the tab from scratch.

### I want to start over

Delete the `Tracker` rows (keep row 1), delete the `Dashboard` tab, rename any
`[synced]` files back, and run `setup`. To also re-import everything, clear the
`evt_*` Document Properties so calendar events regenerate.

---

## Still stuck

[Open an issue](https://github.com/rajvardhan19/malik-finder/issues) with the
`Check setup` output, the relevant Executions log entry, and what you expected.

**Redact first** — logs can contain recruiter emails, your own address, and Drive
IDs.
