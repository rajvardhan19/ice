# Contributing

Thanks for being here. This is a small project with an unusual shape — most of it
is one Apps Script file and one prompt — so the contribution loop is short once
you know where things are.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## What's most useful

Roughly in order of how much they'd help:

- **Alternative runners for the discovery half.** A GitHub Actions workflow, a
  local script — anything that can emit a valid `Job Inbox` sheet. The interface
  is [documented](docs/SCHEMA.md) and deliberately narrow.
- **A test harness.** There isn't one. See [Testing changes](#testing-changes)
  for why, and why fixing it is hard.
- **Shorter setup.** The current flow is 20 minutes of manual Drive-ID copying.
  A bootstrap script, or a template sheet people can copy, would be a big win.
- **Job-board coverage and dedup.** Better source handling, smarter duplicate
  detection than exact-URL.
- **Docs.** If something confused you, that's a bug. Fixing it while it's fresh
  is worth more than a feature.

Small, focused PRs land fast. For anything that changes the schema, adds an OAuth
scope, or restructures the two halves, **open an issue first** — those have
migration consequences for existing users.

## Repository layout

```
apps-script/
  JobTrackerSync.gs      the sync half — all of it
  appsscript.json        manifest; edit when scopes change
routine/
  PROMPT.md              the discovery half
docs/                    setup, config, architecture, schema, troubleshooting, FAQ
examples/                sample Config and inbox sheets
```

No build step, no dependencies at runtime. `package.json` exists only to pin the
linter.

## Development setup

```bash
git clone https://github.com/rajvardhan19/malik-finder.git
cd malik-finder
npm install          # eslint only
npm run lint
```

Linting is the whole of CI. It runs on every push and PR.

### Working with `clasp` (optional)

Editing in the Apps Script web editor and pasting back is fine for a one-line
change. For anything larger, [`clasp`](https://github.com/google/clasp) gives you
a real editor and a push loop:

```bash
npm install -g @google/clasp
clasp login
cp apps-script/.clasp.json.example apps-script/.clasp.json
# put your script ID in it — Apps Script › Project Settings › Script ID
cd apps-script && clasp push
```

`.clasp.json` is gitignored. It contains your script ID; don't commit it.

## Testing changes

There is no test suite, and it's worth being honest about why: Apps Script has no
local runtime, and effectively every function in the file is I/O against
`SpreadsheetApp`, `DriveApp`, `GmailApp`, or `CalendarApp`. Testing it properly
means a mocking layer for the Google Apps Script global namespace. That would be
a great contribution; it doesn't exist yet.

Until then, **verify against a scratch spreadsheet, never your real tracker**:

1. New Google Sheet, new Drive folder. Paste in your modified script, run `setup`.
2. Point the scratch `Config` at the scratch folder. Set `Digest recipient` to
   yourself and leave `Recruiter auto-send` at `FALSE`.
3. Upload [`examples/job-inbox.sample.csv`](examples/job-inbox.sample.csv),
   convert it to a Google Sheet, rename it `Job Inbox - 2026-03-14-0813`.
4. **Job Finder › Sync now**.

Then check: rows landed in the right columns, the file was renamed `[synced]`,
a digest arrived, drafts were created, and a second sync is a no-op. That last
one catches most regressions — see
[idempotency](docs/ARCHITECTURE.md#idempotency).

Touching calendar code? Also run `dailyMaintenance` by hand and confirm a second
run creates nothing new.

**In your PR, say what you actually verified.** "Tested sync + digest on a
scratch sheet, didn't test calendar" is genuinely useful. Claiming coverage you
don't have is not.

## Code style

Match the file. It's an old-school Apps Script idiom and consistency beats
personal preference:

- `const`/`let`, no `var` at the top level (`var` inside the legacy `for` loops
  is fine — leave it).
- `function name_()` with a trailing underscore means private. Apps Script hides
  these from the Run dropdown, which is the point: anything without an underscore
  is a user-facing entry point.
- `function (x) { }` over arrow functions in callbacks, matching the existing
  code.
- Two-space indent, semicolons, single quotes.
- Comment *why*, not *what*. The banner comments dividing sections are load-bearing
  for navigating a 400-line single file — keep them.

`npm run lint` enforces the mechanical parts.

### Error handling

Follow the existing posture: **degrade, don't throw.** A trigger that throws
sends the user a failure email from Google and stops the run. Prefer a toast, a
status value, or a swallowed `catch` with a comment saying why.

The one asymmetry to preserve: a failed *send* is terminal (`Skipped`), a failed
*draft* is retried. Sending twice is worse than not drafting once.

## Changing the schema

Four places move together — [SCHEMA.md](docs/SCHEMA.md#changing-the-schema) has
the details. The one that bites: `buildDashboard_` hardcodes column letters
(`D:D`, `Q:Q`, …). Insert a column before `Q` and the outreach KPI keeps working
while counting the wrong thing.

Schema changes are breaking. Note them in [CHANGELOG.md](CHANGELOG.md) with
migration steps.

## Changing OAuth scopes

Adding a scope forces every existing user to re-authorise through Google's
unverified-app screen — a real cost. Justify it in the PR, update
[`appsscript.json`](apps-script/appsscript.json) and the scope table in
[SETUP.md](docs/SETUP.md), and flag it in the changelog.

## Never commit

- Resumes, cover letters, exported trackers, or any real application data.
- Drive folder IDs, sheet IDs, script IDs.
- Real email addresses — yours or a recruiter's. Use `example.com`.

`.gitignore` covers the common cases, but it can't catch an ID pasted into a doc.
Skim your own diff before pushing; anything merged here is public forever.

If you find personal data already committed, please report it privately —
[SECURITY.md](SECURITY.md).

## Pull requests

1. Branch from `main`.
2. Keep it focused. One concern per PR.
3. Run `npm run lint`.
4. Update the docs in the same PR. A behaviour change with stale docs is
   incomplete.
5. Fill in the PR template, especially the testing section.

Commit messages: imperative mood, meaningful subject. Conventional Commits
(`fix:`, `feat:`, `docs:`) are welcome but not enforced.

Maintainers may push small fixes directly to your branch to get a PR over the
line — say so in the PR if you'd rather they didn't.

## Reporting bugs

Use the [issue templates](https://github.com/rajvardhan19/malik-finder/issues/new/choose).
The **Job Finder › Check setup** output and the relevant
**Apps Script › Executions** log entry are the two most useful things you can
include — **redacted**, since both can contain email addresses and Drive IDs.
