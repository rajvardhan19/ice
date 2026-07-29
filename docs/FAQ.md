# FAQ

### What does it cost?

Nothing beyond what you already pay. Apps Script is free with a Google account.
The only variable cost is whatever runs the discovery agent — on a Claude
subscription, two runs a day at ten jobs a run sits comfortably inside normal
usage.

### Why the name?

It finds you a *malik* — an owner, a boss. Read it as "boss finder" and it's
almost professional.

### Does it apply to jobs for me?

**No, and that's deliberate.** It finds jobs, picks a resume, writes a letter,
and drafts the recruiter email. You review and submit.

Auto-submission would be a bad idea on the merits — application forms are
bespoke, mistakes are unrecoverable and reputational, and a bot filling in
"why do you want to work here" is worse than nothing. The 30 seconds you spend
reviewing is the highest-leverage part of the whole pipeline.

### Will it email recruiters without me knowing?

No. `Recruiter auto-send` defaults to `FALSE`, so everything is a Gmail draft
until you deliberately change that. Turn it on and three guardrails still apply:
the address must have been published by the company (the agent is forbidden from
constructing addresses from name patterns), `Max sends per run` caps volume, and
each row can only send once.

### Does it write a new resume for each job?

No — it *selects* from the variants you wrote and copies one unchanged. Tailoring
was tried and removed: generated resumes drift from the truth, and a resume you
didn't write is a liability in an interview. The cover letter is the per-job
artifact.

### Can I use something other than Claude for discovery?

Yes. The Apps Script only cares that a Google Sheet named `Job Inbox - <anything>`
appears in the folder with the [right headers](SCHEMA.md). Anything that can
produce that works. [Options →](../routine/README.md#running-it-somewhere-else)

### Can I use Excel / Notion / Airtable instead of Sheets?

Not without real work — the sync half is Apps Script, which only exists inside
Google. Notion or Airtable would mean reimplementing it against their API, plus
somewhere to run it. That's a legitimate contribution, just a substantial one.

### Why Apps Script instead of a real backend?

Because it needs no infrastructure, no secrets, and no maintenance, and it runs
as you — so Gmail, Calendar, Drive, and Sheets access come free with no OAuth
app, service account, or token rotation. A Python service would be more
comfortable to write and strictly worse to own.
[More →](ARCHITECTURE.md#what-isnt-here)

### Why is the dedup key the URL and not company + role?

Company+role matching would silently drop legitimately distinct roles — two SWE
openings on different teams look identical. URL matching's failure is a visible
duplicate you delete in two seconds; the alternative's failure is an application
you never knew you missed.
[More →](ARCHITECTURE.md#idempotency)

### Can several people share one tracker?

Not well. Outreach is signed with a single `Your name`, and Gmail drafts land in
whichever account authorised the script. One tracker per person; the repo is
happy to be forked.

### Does my data go anywhere?

No. No third-party server, no telemetry, no analytics, no phone-home. The script
runs entirely inside your Google account under your own OAuth grant, and the
repo contains no keys because there are none to contain. The agent side sees
whatever your scheduler's connector can see — that's between you and them.

### Is it safe to fork publicly?

The repo, yes — there's nothing personal in it. Your *data* is another matter:
never commit resumes or an exported tracker. `resumes/` and `*.xlsx` are
gitignored precisely because a public repo keeps a leaked PDF forever, even after
you delete it. [SECURITY.md](../SECURITY.md)

### How many jobs should I actually run at?

Ten twice a day, the default, is ~140 a week — already more than most people can
apply to properly. Raising `Jobs per run` doesn't raise quality linearly, since
the agent works down a relevance ranking. If you want more *good* jobs, widen
`Role keywords` before raising the cap.
[More →](CONFIGURATION.md#jobs-per-run)

### The stale-row highlight is a wall of red. Am I doing it wrong?

That's the signal working. A wall of red means the agent is handing you jobs you
don't want to apply to — tighten `Exclusions` until red rows are the exception.
It's a diagnostic for your search brief, not a to-do list.

### Are there tests?

No. Apps Script has no local runtime and the entire file is I/O against Google
services, so a meaningful test suite means a mocking layer that doesn't exist
yet. Changes are verified against a scratch spreadsheet —
[CONTRIBUTING.md](../CONTRIBUTING.md#testing-changes). Fixing this would be a
genuinely valuable contribution.

### How do I uninstall it?

Delete the triggers (**Apps Script › Triggers**), then delete the script project.
Your sheet, Drive files, and calendar events stay put. Delete the routine
separately in whatever scheduler you used.
