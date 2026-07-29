# resumes/

A local staging directory, mirroring the resume folder in your Drive. **Its
contents are gitignored** — see [.gitignore](../.gitignore).

The discovery routine reads resumes from **Google Drive**, never from this repo,
so you do not have to put anything here at all. It is useful only as a place to
keep the source files next to the project while you iterate on them.

Never commit a resume. They carry your phone number, home address, and personal
email, and a public repo keeps them forever.

## Suggested layout

One folder per resume variant, matching the labels you use in the routine prompt
and in the tracker's `Resume Used` column:

```
resumes/
├── software-engineering/
├── ml-research/
├── finance-quant/
└── finance-equity/
```

Keeping the folder names identical to the Drive folder names makes the routine
prompt easier to read and the `By Resume Used` dashboard breakdown easier to
interpret.
