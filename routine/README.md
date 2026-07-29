# The discovery routine

The scheduled half of ICE. It searches for jobs, assembles the
per-application assets in Drive, and drops a `Job Inbox - <timestamp>` sheet for
the [Apps Script](../apps-script/JobTrackerSync.gs) to ingest.

- **[PROMPT.md](PROMPT.md)** — the prompt to paste into your scheduler, with
  placeholders for your Drive IDs.
- Output contract: [../docs/SCHEMA.md](../docs/SCHEMA.md)
- Sample of what it emits: [../examples/job-inbox.sample.csv](../examples/job-inbox.sample.csv)

## Running it on Claude cloud routines

This is the reference setup — it needs no server, no API key, and no billing
beyond a Claude subscription.

1. Create the Drive folders described in [../docs/SETUP.md](../docs/SETUP.md) and
   note their IDs (the long string in the folder URL).
2. Connect the **Google Drive** connector at
   [claude.ai/settings/connectors](https://claude.ai/settings/connectors).
3. Fill in the placeholders in [PROMPT.md](PROMPT.md).
4. Create the routine at [claude.ai/code/routines](https://claude.ai/code/routines)
   — or, from Claude Code, ask for a scheduled agent and it will do it for you.

A twice-daily schedule works well: `13 12,23 * * *` (UTC) fires at 08:13 and
19:13 US Eastern — before the workday and after it, so new postings are in your
inbox when you sit down.

> Routine schedules are stored in UTC. Convert deliberately, and re-check after a
> daylight-saving shift.

## Running it somewhere else

Nothing in the design is specific to Claude routines. Any agent that can (a)
search the web, (b) read a Google Sheet, and (c) create files in a Drive folder
can drive this half. The Apps Script only cares that a sheet named
`Job Inbox - <anything>` appears in the folder with the right headers.

Known-workable alternatives, none of which are implemented here — see
[CONTRIBUTING.md](../CONTRIBUTING.md) if you want to add one:

| Runner | Notes |
| --- | --- |
| GitHub Actions + Anthropic API | Fully self-hosted; needs a service account with Drive write access and an API key in repo secrets. |
| A second Apps Script | No LLM, but a `UrlFetchApp` job-board poller could populate an inbox sheet directly. |
| Local cron | Same as Actions, minus the CI. Your laptop has to be awake. |

## Cost

On Claude routines, two runs a day at ten jobs a run sits comfortably inside a
normal subscription — the expensive part is fetching and reading job pages, not
the writing. If you raise `Jobs per run` well past ~25 you will start to feel it.
