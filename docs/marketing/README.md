# Marketing feature log

Plain-language summaries of what CourtHub can do, for the marketing team. Each entry says
what shipped, who it helps, and whether marketing has announced it yet.

All entries live in [`FEATURES.md`](FEATURES.md), newest first.

## Dates

- **Shipped** — the day the feature was merged into the app (the PR merge date).
- **Published** — the day marketing announced it (post, email, site update). Leave it as
  `—` until then; marketing fills it in. Anything with `—` is still free to announce.

## Adding an entry (every new feature)

Add it to the top of `FEATURES.md` in the same PR as the feature:

```md
### <Feature name in customer words>
- **Shipped:** YYYY-MM-DD · **Published:** —
- **For:** Players | Partners | Platform admins
- **PR:** #NN

One to three sentences on what it does and why someone would care. No code or internal terms.
```

Skip purely internal work (refactors, tests, pagination, CI) — only things a customer can
see or use.
