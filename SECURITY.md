# Security policy

## The short version

malik-finder holds no secrets. There is no API key, no service account, no
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

## Reporting a vulnerability

**Don't open a public issue.**

Use [GitHub private vulnerability reporting](https://github.com/rajvardhan19/malik-finder/security/advisories/new)
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
