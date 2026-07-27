# Selection Harness — Summary

Written for a **human**, at the point a PR slice is complete — before the PR is raised and
before any automated review has run. It must stand on its own.

Read this, then the diff, then approve the PR.

- **Slice:** 5 of 5 · **Branch:** `feat/selection-harness`
- **Spec:** `design.md` · **ADR:** `docs/adr/001-Initial-Architecture.md` (D-03, D-04, Future
  work step 4)
- **Tasks:** 13–14 · **Tests:** 9 added (27 → 36 total), all passing
- **Size:** 10 non-test files, 236 lines (`git diff --stat aff02df..HEAD -- . ':!*.test.ts'`).
  Full diffstat incl. tests: 12 files, 516 insertions, 7 deletions. Limit: 5–7 files excl.
  tests, 500 lines — **lines are inside the limit, file count is not** (10 vs 7). Five of
  those ten are the new `next-auth-app` fixture directory (`package.json`, `middleware.ts`,
  `route.ts`, `lib/db.ts`, `tsconfig.json`) and two more are spec files. Reviewer's call
  whether a five-file synthetic fixture tree counts as "one file" for the limit's intent;
  flagging rather than deciding it silently.

> **Process note:** Slice 4 (Tasks 10–12, PR not yet raised) and Slice 5 (this one, Tasks
> 13–14) both sit on `feat/selection-harness`, unmerged, on top of each other. Slices 1–3 are
> merged (#1, #2, #3). This summary and diff cover **Slice 5 only** — Task 13 (`dcc8dbb`),
> Task 14 (`a20981d`), and a follow-up test commit (`8053b7c`) — measured against `aff02df`
> (Slice 4's tip), not against `main`. If Slice 4 hasn't been reviewed and merged first, the
> human is approving two unmerged slices' worth of behaviour change on one branch.

---

## TL;DR

`bun run --filter '@codewalk/engine' harness` now exists and runs end to end: clone a repo at
a pinned SHA into an SHA-keyed cache, run the same `select("auth")` cascade the rest of the
engine uses, score the result against a hand-labelled `anchors` list, and print one JSON
record per repo plus an aggregate recall number. That is the **measuring apparatus** the
whole ADR has been building toward.

It has never measured anything real. `labels.yaml` ships with `repos: []` — the ten
hand-labelled repos are the operator's input, not this spec's to invent, and they haven't
arrived yet. Run the command today and it prints `{"aggregateRecall":1}`: a vacuous pass
over zero repos, per `scoreRecall`'s documented empty-denominator behaviour, not a real
number. **Selection quality is still unvalidated.** This slice proves the harness can
produce a number; it has not yet produced the number.

---

## What changed

| File | Change | Why |
|---|---|---|
| `packages/engine/harness/clone.ts` | new | `cloneAtSha(url, sha, cacheDir)`: `git init` + `remote add` + `fetch --depth 1 origin <sha>` + `checkout FETCH_HEAD`, because `git clone --depth 1` alone only ever gets you the default branch's HEAD, never an arbitrary historical SHA. Caches the working tree at `cacheDir/<sha>` so a repeat run for the same commit is a cache hit. A failed fetch removes the partial directory, so it cannot masquerade as a cache hit next run. |
| `packages/engine/harness/run.ts` | new | `runLabels(labels, { clone })`: for each labelled repo, clone → build universe/graph/manifest → `select("auth")` → `scoreRecall` vs the label's `anchors` → `bucket()` for coverage → push a per-repo record. Clone is injected so the loop is unit-testable with no network. A clone failure becomes an `errored` record, not a thrown error — one unreachable repo must not abort the run over the other nine. Also defines the Zod `Labels` schema (40-hex-char SHA regex) and the `if (import.meta.main)` CLI entry point that reads `labels.yaml`, runs the loop, and prints per-repo JSON plus an aggregate recall line. |
| `packages/engine/harness/labels.yaml` | new | The ground-truth file `run.ts` loads. Ships as `repos: []` with a commented worked example — see TL;DR. Parsed with `Bun.YAML`, so no YAML dependency was added. |
| `packages/engine/src/__fixtures__/next-auth-app/**` | new | A second on-disk fixture (`package.json` declaring `next`+`next-auth`, `middleware.ts`, `app/api/auth/[...nextauth]/route.ts`, `lib/db.ts`, `tsconfig.json`). Added after Task 14 landed, specifically because the existing `alias-repo` fixture (no manifest, tier 3 bottoms out empty) can't discriminate a correctly-wired `run.ts` from a subtly wrong one — see the limitation below. |
| `packages/engine/tsconfig.json` | modify | One exclude entry: `next-auth-app` added alongside the existing `alias-repo`. Same reason as the pre-existing entry — it's a synthetic repo tree with its own `tsconfig`, not source of this package. |
| `packages/engine/harness/clone.test.ts` | new | T-18: builds a real two-commit local git repo in a temp dir, clones the *older* SHA (not HEAD), and asserts the checked-out content and SHA match — proving this isn't just "clone HEAD" — plus a cache-hit test (plants a sentinel file, re-clones, confirms it survives). |
| `packages/engine/harness/run.test.ts` | new | T-17: `Labels` schema validation (accepts well-formed, rejects missing/malformed SHA); the loop against `alias-repo` (tier-3 honest-empty case); the clone-failure-continues-the-loop case; the `next-auth-app` real-hit case (added in the follow-up commit). |
| `specs/001-selection-harness/design.md` | modify | Corrected the documented harness invocation in two places: `bun run --filter engine harness` matches no workspace — the package is `@codewalk/engine`. Fixed under the docs freshness contract, same commit as this summary. |
| `specs/001-selection-harness/implementation.md` | modify | Task states, SHAs, slice state, session notes. |

`packages/engine/harness/recall.ts` is untouched this slice; it's mentioned only because
`run.ts` is its first real consumer beyond the Slice-1 unit test.

---

## How the loop works

```
labels.yaml → for each repo:
  clone(url, sha)        — cache hit if already cloned, else git init/fetch/checkout
  → glob the working tree, apply keptUniverse() (ignore-list)
  → buildGraph() + fanIn()
  → parse package.json if present
  → select("auth", { files, manifest, readFile, fanIn })   — the same pure cascade
  → scoreRecall(result.anchors, label.anchors)             — hits/misses/recall/precision
  → bucket(kept, result.anchors)                            — coverage %
  → push { tier, confidence, selected, hits, misses, recall, precision, coverage, hasAuth }
```

A clone failure short-circuits that one repo into `{ status: "errored", name, error }` and
the loop continues. The CLI entry point prints one JSON line per repo, then one aggregate
line: `scoreRecall` run again over every selected file and every labelled anchor across all
`ok` repos, pooled together.

---

## QA

**What does this let a reviewer do that they couldn't before?**
Run the harness against any Git URL + SHA and get a recall/precision number for that one
repo. Nothing more. There is still no real dataset behind it, so there is nothing to read a
calibration threshold off yet — that was always Slice 5's job, and it's the one thing this
slice cannot do until the operator supplies labels.

**What happens when it fails?**
- Clone failure (bad URL, unreachable network, bad SHA) → recorded as `{status: "errored",
  name, error}`, loop continues. Verified by `run.test.ts`'s ordered two-repo case.
- Malformed `labels.yaml` (missing or bad-shaped SHA, etc.) → `Labels.parse` throws at load,
  before any cloning starts. Fail fast, not a silent skip.
- A repo with no `package.json` → `manifest` is `undefined`, `select` falls through tier 1 to
  2/3 exactly as it does for any manifest-less repo (unchanged behaviour from Slice 4).
- Nothing in this slice changes what `select()` does — `run.ts` is a caller, not a rewrite of
  the cascade.

**Does this touch existing behaviour?**
No. `select.ts`, `bucket.ts`, `graph.ts`, `ignore.ts`, `recall.ts`, `types.ts` are all
untouched — the diff for this slice is entirely new files (`clone.ts`, `run.ts`,
`labels.yaml`, the new fixture) plus one line in `tsconfig.json` and the two spec files.

**Any data migration / performance / security implications?**
No DB, no migration. `cloneAtSha` shells out to `git` via `execFileSync` with an argument
array — never a shell string — so a URL or SHA is never interpolated into a command line.
That URL comes from `labels.yaml`, a committed file the operator controls, not untrusted
external input. If `labels.yaml` ever accepts input from outside the repo, that assumption
needs revisiting. Cloning is depth-1 and cached by SHA, so re-running the harness doesn't
re-fetch.

**What did we deliberately not do?**
Fill in real labels — not this spec's to invent (see TL;DR and Deferred work). Calibrate any
threshold — there's nothing to calibrate against yet. Handle a partial or corrupt cache
directory beyond "not present → re-clone" (the failure path deletes the directory, but no
test forces a half-written working tree that survives a crash).

---

## A known limitation in the new fixture (read this before approving)

`next-auth-app` was added, after Task 14 landed, specifically so T-17 exercises a real tier-1
hit/miss instead of only the honest-empty case. It was mutation-checked in both directions:

- Swapping `hits`/`misses` inside `recall.ts` **does** make the new test fail — it
  discriminates a broken recall diff.
- Changing `run.ts`'s `selected: result.anchors` to `result.provenance.anchors` **does not**
  make any test fail. Verified twice, independently, by editing the line, running the suite,
  and reverting. The reason: in `select.ts`, tier 1 assigns the literal same array to both
  `anchors` and `provenance.anchors`. Every fixture currently in the harness suite bottoms
  out on tier 1 or tier-3-empty, and tier 3 sets `provenance.anchors: []` unconditionally
  regardless of what's selected — so a fixture that reaches tier 2 or tier 3 *with a
  non-empty top-level `anchors`* is the only kind that would catch this class of rewiring.
  No such fixture exists in `run.test.ts` yet.

This is not a bug in the shipped code — `result.anchors` is correct today — but it is a real
gap in what the test suite would catch if someone later "simplified" `run.ts` to read from
`provenance.anchors` instead.

---

## Verify it yourself

```bash
git checkout feat/selection-harness
bun install
cd packages/engine && bun test && bun run check-types
```

1. `bun test` → expect **36 pass**, 0 fail, 11 files, 107 `expect()` calls (up from 27 at
   Slice 4's tip).
2. `bun run --filter '@codewalk/engine' harness` (from repo root) → prints
   `{"aggregateRecall":1}` and nothing else, because `labels.yaml` is empty. This is the
   vacuous-pass behaviour, not a bug.
3. Break it on purpose: in `harness/clone.ts`, change the `checkout` target from
   `"FETCH_HEAD"` to `"HEAD"` → `clone.test.ts`'s "checks out the working tree at the exact
   pinned SHA, not HEAD" fails, because the source fixture repo's default-branch HEAD is the
   *newer* of its two commits, not the pinned older one the test asks for.
4. Break it differently: in `harness/run.ts`, change `selected: result.anchors` to
   `selected: result.provenance.anchors` → the full suite still passes (see the limitation
   above). This is the one worth sitting with before approving — it's a real gap, not a
   hypothetical.

---

## `cloneAtSha` has not run against a real remote

T-18 exercises it against a small real local git repo built fresh in a temp dir (`git init` +
two commits) — the exact "small real/local repo" `design.md`'s T-18 description allows. It
has never fetched from an actual `https://github.com/...` URL. The `git fetch --depth 1
origin <sha>` recipe depends on the remote server allowing fetch-by-arbitrary-SHA
(`uploadpack.allowReachableSHA1InWant`). GitHub allows this. It is unproven in this codebase
and will be exercised for the first time against the operator's real label set, not before.

---

## Test revisions in this slice

**None** — no test was created, edited, weakened, skipped, or deleted to force a pass. The
test count only rose: 27 → 30 (T-18) → 35 (T-17) → 36 (the fixture hit case).

One `as any` was removed from `run.test.ts` a few minutes after that line was written, within
the same slice and before it was committed. This is a **style fix**, not a semantic test
change — it satisfies CLAUDE.md's "never `as any`" rule and did not alter what the test
asserts or which behaviour it covers. Flagging it here anyway so it's visible rather than
found later.

---

## Test coverage

| Test | Verifies | File |
|---|---|---|
| T-18 | `cloneAtSha` checks out the pinned SHA (not HEAD), keys the working tree by SHA, and treats a second call for the same SHA as a cache hit (no re-clone) | `harness/clone.test.ts` |
| T-17 | `Labels` schema accepts a well-formed entry and rejects a missing or malformed SHA; `runLabels` produces one record per repo with tier/confidence/selected/hits/misses/coverage; a clone failure is recorded as `errored` and the loop continues past it; a real next-auth fixture produces a genuine partial hit (recall strictly between 0 and 1) | `harness/run.test.ts` |

**Not covered (by design, later — when labels arrive):** any real repo's recall number;
threshold calibration read off that number; the tier-2/tier-3 provenance-vs-anchors
discrimination gap above.

---

## Acceptance criteria (design.md, Slice 5)

> "`bun run --filter '@codewalk/engine' harness` clones each labelled repo at its SHA, runs
> selection, and emits one log record per repo (tier fired, files selected, hit/miss,
> confidence, coverage %); anchor recall is computed across the set. A clone failure is
> recorded and skipped, not fatal."

- **Clones each labelled repo at its SHA** — satisfied mechanically (T-18), **unproven**
  against real remotes (see the note above), and there is nothing in `labels.yaml` to clone
  yet.
- **Emits one log record per repo with tier/selected/hit-miss/confidence/coverage** —
  satisfied. `run.test.ts`'s two `ok`-path tests assert every field on the record.
- **Anchor recall computed across the set** — satisfied mechanically: the CLI entry point
  pools every `ok` repo's selected files and every label's anchors into one `scoreRecall`
  call and prints `aggregateRecall`. Against the current empty `labels.yaml` this pools zero
  repos, which is why it prints `1` — a vacuous pass, not a validated recall figure.
- **A clone failure is recorded and skipped, not fatal** — satisfied. The ordered two-repo
  test in `run.test.ts` proves the second repo's record still appears after the first errors.

The one thing the acceptance criteria implies but this slice cannot deliver: an actual recall
number computed over real, hand-labelled repos. That's blocked on the operator's labels, not
on any code in this diff.

---

## Deferred work

| Item | Why deferred | Worth doing? |
|---|---|---|
| **The actual measurement run** — real anchor recall over the 10 hand-labelled repos | Blocked on the operator supplying `labels.yaml` (resolved open question: not this spec's to invent) | yes — this is the whole point of the ADR; nothing about selection quality is proven until this runs |
| **Calibrate the auth term list, `MIN_DISTINCT_TERMS`, tier-3 top-N, and the remainder cluster cutoff** | Needs the real-repo measurement above to read numbers off | yes, immediately after real labels land |
| **Tier-2/tier-3 provenance-vs-anchors discrimination gap** (see limitation above) | No fixture yet reaches tier 2/3 with a non-empty top-level `anchors` while `provenance.anchors` stays `[]` | yes — a small, cheap fixture addition, no design change |
| Cite-failure threshold (D-19) | Needs the LLM's citations; explicitly out of harness scope. Per the spec's resolved open question the harness settles two of three thresholds, and this is the deferred third | yes, when the explanation call lands |
| tree-sitter symbol/span extraction | Feeds the LLM explanation packet, not selection; tier 2 is served by keyword matching here | yes, with the explanation call |
| Tier 2 returns matched files unranked | Carried forward from Slice 4 — no consumer has needed ordering yet | maybe — only if the real measurement shows tier-2 anchor lists need trimming |
| `select`'s `Intent` type is `"auth"`-only | Carried forward from Slice 4 — a second subsystem needs its own dictionary and `Intent` member | yes, whenever a second subsystem is asked for — not this feature |
| Test for `fanIn`'s importer-dedupe path | Carried forward from Slice 3 — still no fixture forces a double-import from one file | yes |
| Monorepo/workspace-spanning graph resolution | No workspace fixture built yet | yes, if a real labelled repo turns out to be a monorepo |
| Partial or corrupted cache directory in `cloneAtSha` | The failure path deletes the directory, but a crash mid-checkout could still leave one that reads as a cache hit | maybe, low priority until observed |
| Repo-root `bun run lint` fails on `apps/web`'s `package.json`/`tsconfig.json` (CRLF vs LF) | Pre-existing, untouched by this slice. Note the related gap: `@codewalk/engine` has **no `lint` task at all**, so no linter ran over `clone.ts`/`run.ts` — `check-types` and `bun test` are the only automated checks this diff passed | yes, someone else's diff |
| Root `package.json`'s `typecheck` script calls a task `turbo.json` doesn't define | Pre-existing, unrelated to this slice; reporting rather than fixing in an unrelated diff | yes, small fix, someone else's diff |

---

## Documentation updated

- [x] `specs/001-selection-harness/implementation.md` — task states, SHAs, slice state,
  session notes
- [x] `specs/001-selection-harness/design.md` — corrected the harness invocation in two
  places, same commit as this summary
- [x] No new ADR needed — this slice implements decisions already made in ADR-001 (D-03,
  D-04, Future work step 4)
- [x] No `tech-stack.yaml` change — no new dependency (`Bun.YAML` is built in)
- [x] No generated blocks affected (`bun run docs:check` → "Docs are in sync.")
