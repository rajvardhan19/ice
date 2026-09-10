# Security policy

## The short version

ICE holds no secrets. There is no API key, no service account, no
token, no `.env`, and no server. The Apps Script runs inside your own Google
account under your own OAuth grant, and every setting lives in your spreadsheet
rather than in source.

That removes most of the usual attack surface. What's left is worth understanding
before you install it, because the script does have access to your Gmail,
Calendar, and Drive.

## What the script can do

Granted at `setup` via [`appsscript.json`](apps-script/appsscript.json):

| Scope | Used for | Blast radius if the script misbehaves |
| --- | --- | --- |
| `spreadsheets` | Writing tracker rows | Any spreadsheet you can open |
| `drive` | Reading inbox sheets, renaming them | Any file in your Drive |
| `documents.readonly` | Reading outreach Docs | Read of any Doc you can open |
| `gmail.send` | Digests, recruiter outreach | **Sending mail as you** |
| `gmail.compose` | Outreach drafts | Creating drafts as you |
| `calendar` | Interview, deadline, follow-up events | Your default calendar |
| `script.scriptapp` | Installing its own triggers | Scheduling code in your account |
| `userinfo.email` | Digest fallback recipient | Your address |
| `script.external_request` | Opt-in: MX lookups for email guessing, form fetch/submit for auto-apply | The script can make outbound HTTP requests to hosts it decides to contact — see the two guardrail sections below for exactly which hosts and why |

`gmail.send` is the one to think hardest about — it's the only scope that can
take an irreversible action visible to other people. It exists so digests and
approved outreach work; you can
[remove it](docs/SETUP.md#running-with-fewer-scopes) and keep everything else.

Google's "unverified app" warning during setup is expected: the app is your own
copy of the script. Read the code before you click Allow — that's the actual
security model here, and it's why the file is one readable page rather than a
dependency tree.

## Guardrails on outreach

Because sending mail is the sharpest edge, it is fenced deliberately:

- `Recruiter auto-send` defaults to **`FALSE`** — everything is a draft until you
  change it.
- Even enabled, a row only sends if the address parses as an email and was
  *published* by the company. The agent prompt forbids constructing addresses
  from name patterns.
- `Max sends per run` caps volume per sync.
- A row's status flips to `Sent` before the next pass, so nothing is emailed
  twice.
- Rows with no recruiter address are drafted **to you**, never sent.

If you find a way around any of these, that's a vulnerability — please report it.

## Guardrails on email guessing

Opt-in, off by default (`Email guessing enabled`, see
[CONFIGURATION.md](docs/CONFIGURATION.md#email-guessing-enabled)). This is a
real change to a guarantee this document used to state unconditionally: **the
discovery agent still can never guess or construct an email** — that rule is
unchanged and enforced in the agent's own prompt — but when you turn this
setting on, the deterministic sync script optionally can, for exactly the
reason "the script, not the model, holds every destructive capability" from
[ARCHITECTURE.md](docs/ARCHITECTURE.md) — a guess is reviewable code, not a
model's judgment call.

- One candidate address per row (`first.last@<Company Domain>`), never a spray
  of variants against the same inbox.
- Kept only if the domain resolves an MX record — a domain-level sanity check,
  not mailbox verification. There is no confirmation the specific person's
  mailbox exists.
- `Recruiter Email Source` records `Guessed` on every row this writes to, so
  provenance is always visible in the tracker.
- Whether a guessed address is actually emailed is still entirely gated by
  `Recruiter auto-send` and `Max sends per run` — this setting only decides
  whether a guess is attempted, not whether it's sent.

## Guardrails on auto-apply

Opt-in, off by default (`Auto-apply enabled`, see
[CONFIGURATION.md](docs/CONFIGURATION.md#auto-apply)). There is no public,
keyless API for submitting a job application — Greenhouse's and Lever's
documented application-submission APIs require an API key issued by the
*employer's own* admin, not something available to a candidate's tool. What
this feature automates instead is the plain public HTML application form each
posting already serves to any browser — no login, no account, no credentials.

- **Exact-hostname allowlist**, checked before any network call:
  `boards.greenhouse.io`, `job-boards.greenhouse.io`, `jobs.lever.co`. No
  subdomain matching, no wildcards — a job posting can never point this
  feature at an arbitrary host, which is what keeps your resume and profile
  data from ever being sent anywhere the posting's own URL doesn't already
  point.
- **Never answers a screening question it doesn't recognise.** A required form
  field that isn't confidently mappable to your applicant profile (name,
  email, phone, resume, LinkedIn) stops the submission — the row is marked
  `Needs Manual Questions`, nothing is sent.
- **One attempt per row, terminal on failure.** `Failed` and
  `Needs Manual Questions` are never automatically retried, for the same
  reason a failed outreach send isn't: retrying an application risks a
  duplicate submission, which is worse than not applying once.
- **`Max applications per run`** caps volume per sync, and starts at `3` —
  deliberately low, since this is the newest and least-tested code path in
  the project. Greenhouse and Lever can change their page markup at any time;
  there's no automated test suite that would catch that (see
  [CONTRIBUTING.md#testing-changes](CONTRIBUTING.md#testing-changes)), so
  verify against a real posting before raising the cap or trusting it broadly.

### In scope, added

- Anything that gets auto-apply to POST to a host outside the exact allowlist
  above.
- Anything that gets auto-apply to submit a form with a guessed or fabricated
  answer to a required field it didn't recognise.
- Anything that gets a row re-submitted after it already reached a terminal
  `Auto-Apply Status`.
- Anything that gets an email guessed or sent when `Email guessing enabled` /
  `Recruiter auto-send` are `FALSE`.

## Reporting a vulnerability

**Don't open a public issue.**

Use [GitHub private vulnerability reporting](https://github.com/rajvardhan19/ice/security/advisories/new)
on this repository. If that's unavailable, contact
[@rajvardhan19](https://github.com/rajvardhan19) through their GitHub profile.

Please include what an attacker could achieve, the steps to reproduce, and the
version or commit you're on. You'll get an acknowledgement within a week, and
credit in the advisory and [CHANGELOG](CHANGELOG.md) unless you'd rather not.

This is a hobby project maintained in spare time — there is no bounty and no SLA,
but reports are taken seriously and fixes ship as fast as they can be verified.

### In scope

- Anything that gets the script to send mail the user didn't approve.
- Anything that lets a crafted `Job Inbox` sheet cause writes outside the
  tracker, or exfiltrate data.
- Injection through job-posting content into emails, docs, or formulas — the
  digest HTML-escapes fields, but the outreach body and cell values are paths
  worth probing.
- Prompt injection through a job posting that changes what the discovery agent
  does.
- Anything in the repo that leaks a contributor's or user's personal data.

### Out of scope

- Google's own services, quotas, and the unverified-app screen.
- Your scheduler or LLM provider — report those to them.
- "The script has broad OAuth scopes." Known, documented above, and reducible.
- A user putting their own secrets in a public fork.

## Supported versions

The latest commit on `main` is the only supported version. There are no
backports; upgrading is pasting a file and re-running `setup`.

## Protecting your own data

The most likely security incident with this project isn't a vulnerability — it's
someone committing their resume to a public fork.

- **Never commit** resumes, cover letters, exported trackers, Drive or sheet IDs,
  or real email addresses. `.gitignore` covers `resumes/`, `*.xlsx`, `*.pdf`, and
  `.clasp.json`, but it can't catch an ID pasted into a markdown file.
- **Redact logs.** `Check setup` output and Apps Script execution logs contain
  Drive IDs and email addresses, including recruiters'.
- **Deleting a file doesn't remove it from git history.** If you've already
  pushed something personal, you need to rewrite history *and* force-push — and
  assume anything public was already scraped. Rotate what you can.
- **Review the script before granting access**, especially if you got it from a
  fork rather than upstream. A modified `processOutreach_` could mail anyone.
