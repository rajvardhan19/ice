# What this changes

<!-- One or two sentences. Link the issue if there is one: Fixes #123 -->

## Why

<!-- The problem being solved. Skip if it's obvious from the title. -->

## How I tested it

<!-- Required. There's no test suite, so this section is the review.
     Be specific about what you did NOT check — that's useful, not embarrassing.
     See CONTRIBUTING.md#testing-changes for the scratch-sheet loop. -->

- [ ] Ran `setup` on a **scratch** sheet (not my real tracker)
- [ ] Synced the sample inbox from `examples/` and checked rows landed correctly
- [ ] Ran the sync twice — the second run was a no-op
- [ ] `npm run lint` passes

Anything I didn't verify:

## Impact on existing users

<!-- Tick anything that applies. None of these block a PR; they change how it's
     reviewed and released. -->

- [ ] Changes the tracker schema — existing sheets need migration
- [ ] Adds or changes an OAuth scope — forces everyone to re-authorise
- [ ] Changes the agent prompt contract in `routine/PROMPT.md`
- [ ] Adds a `Config` key
- [ ] None of the above — safe to paste over an existing install

## Docs

- [ ] Updated the docs affected by this change, or none were affected
- [ ] Added a `CHANGELOG.md` entry under `[Unreleased]`

## Checklist

- [ ] No personal data in the diff — no resumes, real email addresses, Drive IDs,
      sheet IDs, or script IDs
- [ ] Matches the surrounding code style (`function name_()` for private,
      `function (x) {}` callbacks, degrade-don't-throw error handling)
