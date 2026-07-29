# Tracker schema

21 columns, fixed order. Both halves depend on it: the agent emits it, the Apps
Script reads it positionally, and the dashboard formulas reference the column
letters directly.

Defined in [`JobTrackerSync.gs`](../apps-script/JobTrackerSync.gs) as `HEADERS`
(the labels) and `COL` (1-based indices). A sample:
[`examples/job-inbox.sample.csv`](../examples/job-inbox.sample.csv).

## Columns

| # | Col | Header | Written by | Notes |
| --- | --- | --- | --- | --- |
| 1 | A | Company Name | agent | |
| 2 | B | Role | agent | Title as posted |
| 3 | C | Location | agent | Free text, or `Remote` |
| 4 | D | Application Status | agent → you | Dropdown. Agent seeds `Not Applied` |
| 5 | E | Salary | agent | Free text; blank if unposted |
| 6 | F | Date Found | agent | `YYYY-MM-DD`. Drives the stale-row highlight |
| 7 | G | Date Submitted | script | Auto-stamped when status → `Applied` |
| 8 | H | **Link to Job Req** | agent | **Dedup key.** Verified URL, never blank |
| 9 | I | Source | agent | Feeds the dashboard's `By Source` |
| 10 | J | Resume Used | agent | Variant label. Feeds `By Resume Used` |
| 11 | K | Cover Letter Link | agent | Google Doc URL |
| 12 | L | Match Reason | agent | One sentence on why it fits |
| 13 | M | Rejection Reason | you | Post-mortem field |
| 14 | N | Notes | you | |
| 15 | O | Recruiter Name | agent | Blank unless published |
| 16 | P | Recruiter Email | agent | Blank unless published. **Never guessed** |
| 17 | Q | Outreach Status | agent → script | Dropdown. Agent seeds `Pending` |
| 18 | R | Outreach Sent Date | script | Stamped on a real send |
| 19 | S | Outreach Doc Link | agent | Doc the script reads for the email body |
| 20 | T | Deadline | agent | `YYYY-MM-DD`. Triggers a calendar reminder |
| 21 | U | Interview Date | you | Filling it creates a calendar event |

Five columns are yours to edit by hand: `Application Status`, `Rejection Reason`,
`Notes`, `Interview Date`, and — when you want to re-queue a message —
`Outreach Status`.

## Enums

### Application Status (D)

| Value | Colour | Meaning |
| --- | --- | --- |
| `Not Applied` | cream | Default. Goes red after `Stale days` |
| `Applied` | green | Stamps `Date Submitted`; starts the follow-up clock |
| `Interviewing` | blue | |
| `Offer` | dark green | |
| `Rejected` | red | Pair with `Rejection Reason` |
| `On Hold` | pink | |

### Outreach Status (Q)

| Value | Set by | Meaning |
| --- | --- | --- |
| `Pending` | agent | Queued. The sync picks this up |
| `Drafted` | script | Gmail draft created, awaiting you |
| `Sent` | script | Actually emailed; `Outreach Sent Date` stamped |
| `Skipped` | script | Send failed — will not retry |
| `Replied` | you | Terminal, informational |

Only `Pending` is acted on, which is what makes outreach send-once. Set a row
back to `Pending` to re-queue it.

Both dropdowns are set to allow invalid values, so an unrecognised string won't
block a paste — it just won't be picked up by anything.

## Dates

Emit `YYYY-MM-DD` from the agent. The script writes real `Date` objects
(`new Date()`), and reads defensively — `new Date(value)` with an `isNaN` check,
so a text date usually still works.

`dailyMaintenance` compares against local midnight, so "7 days" means seven
calendar days, not 168 hours.

## Changing the schema

Four places move together:

1. `HEADERS` — the labels.
2. `COL` — the 1-based indices.
3. `buildDashboard_` — **hardcoded column letters** in the KPI and QUERY
   formulas (`D:D`, `F2:F`, `G2:G`, `I2:I`, `J2:J`, `Q:Q`). Inserting a column
   before `Q` silently breaks the outreach KPI: the formula keeps working, it
   just counts the wrong column.
4. [`routine/PROMPT.md`](../routine/PROMPT.md) — the header list and per-column
   rules the agent follows.

Then re-run `setup`. Appending at the end is cheap; inserting in the middle
requires migrating existing rows by hand, since the script matches by position,
not by header name.

A schema change is a breaking change — flag it in [CHANGELOG.md](../CHANGELOG.md)
with migration notes.
