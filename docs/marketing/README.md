# Marketing feature log

Plain-language write-ups of what CourtHub can do, for the marketing team.

- [`FEATURES.md`](FEATURES.md) is the index: every feature, newest first, with its dates.
- [`features/`](features/) has one page per feature covering what it does, who it helps and
  talking points.

## Dates

- **Shipped** is the day the feature was merged into the app (the PR merge date).
- **Published** is the day marketing announced it (a post, email or site update). Leave it as
  `—` until then. Marketing fills it in on **both** the feature page and the index row.
  Anything still showing `—` is free to announce.

## Adding a feature (every new feature)

In the same PR as the feature:

1. Create `features/YYYY-MM-DD-<short-name>.md` using the shipped date:

   ```md
   # <Feature name in customer words>

   - **Shipped:** YYYY-MM-DD · **Published:** —
   - **For:** Players | Partners | Everyone
   - **PR:** #NN

   ## In one line
   What it does and why someone would care.

   ## For partners / For players
   - The key things people can now do.

   ## Talking points
   - Angles marketing can use.
   ```

2. Add a row to the top of the table in `FEATURES.md`.

Write it for customers, with no code or internal terms. Skip purely internal work like
refactors, tests, pagination and CI. Only include things a customer can see or use.
