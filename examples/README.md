# Examples

Reference data, not fixtures — nothing imports these. They exist so you can see
the exact shape each half of the system expects.

| File | What it shows |
| --- | --- |
| [config.sample.csv](config.sample.csv) | A filled-in `Config` tab. Paste into A1 of your tracker's Config sheet to start from something real instead of the blank defaults. |
| [job-inbox.sample.csv](job-inbox.sample.csv) | One `Job Inbox - <timestamp>` sheet as the discovery routine emits it. Useful for testing the sync without waiting for a scheduled run. |

All companies, people, URLs, and salaries in these files are invented.

## Testing the sync with the sample inbox

1. Upload `job-inbox.sample.csv` to your Job Applications folder and convert it
   to a Google Sheet (**File › Save as Google Sheets**).
2. Rename it `Job Inbox - 2026-03-14-0813` — the `Job Inbox` prefix is what the
   script scans for.
3. In the tracker, **Job Finder › Sync now**.

Three rows should land in `Tracker`, the file should be renamed
`[synced] Job Inbox - …`, and you should get a digest email. Delete the rows and
the file afterwards; the URLs are fake and will fail a link check.
