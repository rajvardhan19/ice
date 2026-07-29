# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because there is no package to install, "upgrading" means pasting the new
[`JobTrackerSync.gs`](apps-script/JobTrackerSync.gs) into your sheet and running
`setup` again. `setup` is idempotent and never overwrites your `Config` tab.

> ⚠️ marks a release that adds an OAuth scope. Google will re-prompt for
> authorisation on the first run after it.

## [Unreleased]

### Changed
- `main` is now protected by a branch ruleset: no direct pushes, no force
  pushes, no deletion, and three CI checks required to merge — with no admin
  exemption. [CONTRIBUTING.md](CONTRIBUTING.md#pull-requests) documents the flow,
  including the fork-first setup and GitHub's hold on first-time contributors'
  Actions runs.
- Dropped the issue-template link to Discussions, which is not enabled on the
  repository, in favour of the contributing guide.

## [1.0.0] — 2026-07-29

First public release. The project moves from a personal setup to something
someone else can actually install.

### Added
- **`Config` tab drives everything.** `Your name` and
  `Job Applications folder ID` are now settings rather than source constants —
  there is nothing personal left in the code. `JOB_APPLICATIONS_FOLDER_ID` also
  works as a Script Property for shared sheets.
- **`Job Finder` menu** on the tracker: *Sync now*, *Rebuild dashboard*,
  *Check setup*, *Re-run setup*. The sheet is usable without opening the script
  editor.
- **`checkSetup()`** — one dialog reporting tabs, Drive folder access, config
  gaps, and all three triggers. The first stop for any problem.
- **[`appsscript.json`](apps-script/appsscript.json)** manifest declaring the
  OAuth scopes explicitly, so the grant is reviewable before you accept it.
- **[`routine/PROMPT.md`](routine/PROMPT.md)** — the discovery half, previously
  untracked, now a documented template with placeholders.
- **Sample data** in [`examples/`](examples/): a filled-in Config and a valid
  inbox sheet, so the sync can be tested without waiting for a scheduled run.
- Full documentation: [setup](docs/SETUP.md),
  [configuration](docs/CONFIGURATION.md), [architecture](docs/ARCHITECTURE.md),
  [schema](docs/SCHEMA.md), [troubleshooting](docs/TROUBLESHOOTING.md),
  [FAQ](docs/FAQ.md).
- Community files: MIT [licence](LICENSE), [contributing guide](CONTRIBUTING.md),
  [code of conduct](CODE_OF_CONDUCT.md), [security policy](SECURITY.md), issue
  and PR templates, and a lint workflow.

### Changed
- Outreach is signed from `Your name` instead of a hardcoded name, and falls back
  to an unsigned message when it's blank.
- `Digest recipient` defaults to whoever runs the script rather than a hardcoded
  address.
- `syncFromBot` reports a missing or unopenable folder as a toast and returns,
  instead of throwing out of a trigger.
- The `Job Inbox` prefix and `[synced]` marker are named constants.
- Boolean config parsing treats an empty value as "use the default" rather than
  as false.

### Removed
- Personal resumes and the exported application tracker, along with the git
  history that contained them. `resumes/`, `*.xlsx`, and `*.pdf` are now
  gitignored.

### Security
- Documented the full OAuth grant and its blast radius in [SECURITY.md](SECURITY.md),
  with instructions for [running with fewer scopes](docs/SETUP.md#running-with-fewer-scopes).

---

## Pre-release history

Not tagged; recorded because the design decisions still explain the code.

### v3 — outreach, dashboard, and calendar
⚠️ *Added the Gmail and Calendar scopes.*

- Schema grew to 21 columns: recruiter name and email, outreach status, sent
  date, and doc link, plus deadline and interview date.
- `Dashboard` tab: pipeline funnel chart, applications this week, outreach sent,
  follow-ups due, and breakdowns by resume and by source.
- Gmail digest after each sync that adds rows.
- Recruiter outreach via `processOutreach_`, guard-railed from the start:
  published addresses only, a per-run send cap, send-once, and a
  `Recruiter auto-send` kill-switch defaulting to `FALSE`.
- `handleEdit` status automation — `Applied` stamps `Date Submitted`, an
  interview date creates a calendar event.
- `dailyMaintenance` for deadline and follow-up reminders.
- The agent gained a `Config`-driven brief, URL link-checking, and dedup against
  existing cover-letter folders.
- **Considered and rejected:** generating a tailored resume per job. It drifts
  from the truth and leaves you defending a document you didn't write. The agent
  copies the best-matching variant unchanged.

### v2 — the two-half split
- The agent stopped regenerating the tracker. It now reads the master sheet plus
  any pending inboxes for dedup and emits only *new* jobs as
  `Job Inbox - <timestamp>` sheets.
- `JobTrackerSync.gs` introduced: hourly ingest, dedup on `Link to Job Req`,
  formatting reapplied, consumed inboxes renamed `[synced]`.
- This is where the architecture stopped fighting the Drive connector's
  create-only limit and started
  [using it](docs/ARCHITECTURE.md#the-constraint-that-shaped-everything).

### v1 — the naive version
- A scheduled agent that regenerated a tracker sheet from scratch each run.
- Lost hand-edited status, notes, and formatting on every run, and couldn't
  append because the Drive connector has no edit capability. Replaced by v2.

[Unreleased]: https://github.com/rajvardhan19/malik-finder/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/rajvardhan19/malik-finder/releases/tag/v1.0.0
