# Configuration

Every setting lives on the `Config` tab of your tracker sheet — a two-column
`Key` / `Value` table seeded by `setup`. Nothing here is in source control, so
you never edit code to change behaviour, and pulling a new version never clobbers
your settings.

Changes take effect on the **next** run. Both halves read Config fresh each time:
the Apps Script on every sync, the agent at the start of every scheduled run.

A filled-in example: [`examples/config.sample.csv`](../examples/config.sample.csv).

## Reading the table

- **Read by** — `script` = the Apps Script, `agent` = the discovery routine.
  Agent-side keys only work if your prompt actually reads them; the shipped
  prompt does.
- Booleans accept `TRUE`, `yes`, `1`, or `on`, case-insensitively. Anything else
  is false. Blank falls back to the default.
- Lists are comma-separated. Whitespace around items is fine.
- An unrecognised key is ignored, so you can leave notes for yourself in the
  table.

---

## Identity

### `Your name`
**Default:** blank · **Read by:** script

Signs recruiter outreach — the `Best,\n<name>` in the fallback body, the
`from` display name, and the `<Role> — Application from <name>` subject.

Leave it blank and outreach still works, just unsigned, with a plainer subject.
`Check setup` warns about this. Set it.

### `Job Applications folder ID`
**Default:** blank · **Read by:** script (and you, when filling in the prompt)

**Required.** The Drive folder the sync scans for `Job Inbox - …` sheets. Grab it
from the folder's URL. Without it `syncFromBot` toasts an error and does nothing.

You can also set it as a Script Property named `JOB_APPLICATIONS_FOLDER_ID`
(**Project Settings › Script Properties**). Config wins if both are present. The
property is only worth using if you're sharing the sheet with someone who
shouldn't see the folder ID.

---

## The search brief

These shape what the agent looks for. All are read agent-side.

### `Target companies`
**Default:** blank

Comma-separated names to prioritise. Blank means search anywhere, which is
usually right early on — a narrow list plus tight `Exclusions` can easily yield
zero jobs per run.

### `Role keywords`
**Default:** `Software Engineer, Machine Learning, Data`

The titles and specialisms to search for. Broad terms work better than clever
ones; the agent expands them. Two or three tracks is the sweet spot — much more
and each run spreads thin across them.

### `Locations`
**Default:** `Remote`

Cities, regions, or `Remote`. Mix freely: `New York, Boston, Remote`. Be explicit
about hybrid if you care — `New York (hybrid ok)` reads fine to the agent.

### `Exclusions`
**Default:** `Senior, Staff, Principal, Lead, 5+ years, 7+ years, Director`

The most valuable key on the tab. Anything matching an entry — in the title *or*
the requirements — is dropped before it reaches you.

This is your precision dial. If rows keep going stale (red `Date Found` cells),
you're being handed jobs you don't want: add the pattern that would have caught
them. Common additions: `Manager`, `Architect`, `Security Clearance`, `PhD
required`, `On-site only`, `Contract`.

### `Jobs per run`
**Default:** `10` · **Read by:** agent

Cap on new jobs per scheduled run. Ten twice a day is ~140 a week, which is
already more than most people can apply to properly.

Raising it doesn't linearly raise quality — the agent works down a relevance
ranking, so job 30 is meaningfully worse than job 5. Past ~25 you'll also feel
the run time and cost, since each job means fetching pages and writing three
documents. If you want *more*, widen `Role keywords` before raising this.

---

## Outreach

### `Recruiter auto-send`
**Default:** `FALSE` · **Read by:** script

The kill-switch. `FALSE` means every outreach message becomes a **Gmail draft**
you review and send by hand. `TRUE` lets the script send directly.

Leave it off until you've read a week of drafts. Even on, three guardrails still
apply: the address must have been *published* by the company (the agent is
forbidden from guessing), `Max sends per run` caps volume, and a row's status
flips to `Sent` so it can never be emailed twice.

Rows with no recruiter address always become drafts addressed to you, subject
prefixed `[DRAFT - add recruiter]`, regardless of this setting.

### `Max sends per run`
**Default:** `5` · **Read by:** script

Hard cap on real sends per hourly sync. Only applies when auto-send is `TRUE`.
Rows over the cap stay `Pending` and are retried next hour, so nothing is lost —
it just spreads out. Keeps a runaway sync from mailing forty recruiters at 3am.

### `Email guessing enabled`
**Default:** `FALSE` · **Read by:** script

Opt-in, off by default. When `TRUE`, a row with a published recruiter *name*
but no published *email* gets exactly one candidate address built as
`first.last@<Company Domain>`, kept only if that domain resolves an MX record.

Be clear-eyed about what this is: a domain-level sanity check, **not** mailbox
verification. There is no cross-check that this specific person's mailbox
exists — the pattern is just the most common corporate convention. Expect some
bounces and some wrong-recipient sends; that trade-off (free but unverified,
instead of a paid finder API) was a deliberate choice. `Recruiter Email Source`
records `Guessed` on every row this touches, so you can always see which
addresses in your tracker are less trustworthy than a published one.

This does **not** change whether anything gets sent — `Recruiter auto-send` and
`Max sends per run` still gate every send, guessed or published, exactly as
before. Turning this on without `Recruiter auto-send` just means more drafts
land with a filled-in (guessed) `To:` instead of a `[DRAFT - add recruiter]`
one addressed to you.

---

## Auto-apply

Opt-in, off by default, and the least-tested capability in this project.
Automates the plain public application form on a Greenhouse or Lever posting —
no login, no account, no API key involved (there is no keyless "apply API";
see [SECURITY.md](../SECURITY.md#guardrails-on-auto-apply)). Other job boards
are untouched — `Auto-Apply Status` becomes `Not Applicable` for anything that
isn't `boards.greenhouse.io` / `job-boards.greenhouse.io` / `jobs.lever.co`.

### `Auto-apply enabled`
**Default:** `FALSE` · **Read by:** script

The kill-switch. Leave it off until you've verified the form-filling logic
against at least one real posting — Greenhouse and Lever can change their page
markup at any time, and there's no way to test that from outside a live run.

### `Max applications per run`
**Default:** `3` · **Read by:** script

Hard cap per hourly sync, same spirit as `Max sends per run`. Starts low on
purpose. Counts against the cap whether a submission succeeds, fails, or needs
manual questions — each attempt is still one live request to a real employer's
site.

### `Applicant first name`, `Applicant last name`, `Applicant phone`, `Applicant LinkedIn URL`
**Default:** blank · **Read by:** script

The profile used to fill the application form. Email isn't a separate key — it
reuses `Digest recipient` (or your account email if that's blank too). Leaving
any of these blank just means that field goes unfilled; if the posting marks
it required, the row becomes `Needs Manual Questions` instead of submitting
half-empty.

### What it won't do

If a posting has a required field this can't confidently map to the profile
above — a custom screening question, a salary expectation, a work-authorization
dropdown — the row is marked `Needs Manual Questions` and **nothing is
submitted**. It never guesses an answer on your behalf. See
[SCHEMA.md](SCHEMA.md#auto-apply-status-y) for the full state machine.

---

## Notifications

### `Digest enabled`
**Default:** `TRUE` · **Read by:** script

Send an HTML digest after a sync that added rows. A sync that finds nothing new
never emails, so this won't spam you hourly.

### `Digest recipient`
**Default:** blank → the account running the script · **Read by:** script

Where digests go. Also where recruiter-less outreach drafts are addressed. A
different address than the one running the script is fine.

---

## Timing

### `Follow-up days`
**Default:** `7` · **Read by:** script

Days after `Date Submitted` before `dailyMaintenance` creates a "Follow up"
calendar event, for rows still at `Applied`. Seven is the conventional nudge
interval. The event is created once per job, ever.

### `Stale days`
**Default:** `5` · **Read by:** script

Days before a `Not Applied` row's `Date Found` cell turns red. Purely visual —
nothing is deleted or deprioritised.

Treat it as a feedback signal rather than a to-do list. A handful of red rows
means a normal week. A wall of red means your search brief is wrong: tighten
`Exclusions`, or lower `Jobs per run` and apply to more of what you get.

The threshold is baked into a conditional-format rule at `setup` time, so changing
it needs a re-run of `setup` (or any sync — `applyFormats_` rebuilds the rules).

---

## Where settings actually live

| Location | Holds | Survives a script update |
| --- | --- | --- |
| `Config` tab | Everything above | Yes — `setup` never overwrites an existing tab |
| Script Properties | Optional `JOB_APPLICATIONS_FOLDER_ID` | Yes |
| Document Properties | `evt_*` keys, so calendar events are created once | Yes |
| Source constants | Schema, status options, colours | **No** — re-apply local edits |

If you need to change something in that last row, see
[CONTRIBUTING.md](../CONTRIBUTING.md#changing-the-schema) — the column letters in
the dashboard formulas have to move with it.
