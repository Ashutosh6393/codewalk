# Selection Harness — Implementation

Live state. The **source of truth** for where things stand. An agent resuming this feature
reads this file first and picks up from it.

Update it after every task. Never batch updates.

- **Status:** in-review
- **Branch:** `feat/selection-harness`
- **Spec:** `design.md` · **ADR:** `docs/adr/001-Initial-Architecture.md`
- **Current task:** Slice 5 — Tasks 13 and 14 done and green; open question at the gate on the
  recall-hit fixture (see session notes). Slice 4 awaiting review; slices 1–3 merged (#1, #2, #3)

---

## Task states

| State | Meaning |
|---|---|
| `pending` | Not started. Dependencies may not be met yet. |
| `red` | Failing test written and confirmed failing for the right reason. |
| `green` | Code passes the test. Not yet committed. |
| `done` | **Test agent confirmed all test cases pass**, committed. |
| `blocked` | Attempt budget exhausted. Work stops here. |

A task reaches `done` only on the test agent's confirmation. The coder agent never marks
its own task complete.

---

## Tasks

In dependency order. Each task must be independently testable and map to test IDs in
`design.md`.

| # | Task | Depends on | Tests | Slice | State | Attempts | Commit |
|---|---|---|---|---|---|---|---|
| 1 | Scaffold `packages/engine` (package.json, tsconfig, workspace wiring) + `types.ts` Zod schemas (Confidence, Provenance, SelectionResult) | — | — | 1 | `done` | 1/3 | 5ff36ed |
| 2 | Next.js playbook: framework detection from manifest + convention auth anchor globs | 1 | T-01 | 1 | `done` | 1/3 | 4ccbbd7 |
| 3 | `select("auth")` tier-1 path: apply playbook anchors, emit provenance + high confidence | 2 | T-02, T-03, T-16 | 1 | `done` | 1/3 | (this commit) |
| 4 | `recall.ts`: precision/recall diff of selected vs labelled anchors + one next-auth fixture | 1 | T-04 | 1 | `done` | 1/3 | 54d93ac |
| 5 | `ignore.ts`: ignore-list (always-ignore floor + `.gitignore`) → kept universe | 1 | T-05 | 2 | `done` | 1/3 | 22345c0 |
| 6 | `bucket.ts`: bucket kept files (classified / known-category / genuine-unknown) + coverage % | 5, 3 | T-06, T-07, T-08 | 2 | `done` | 1/3 | bb8d124 |
| 7 | Remainder clustering: surface only ≥N-file clusters or high-fan-in singles | 6 | T-09 | 2 | `done` | 1/3 | 5279892 |
| 8 | `graph.ts`: dependency-cruiser adapter — import graph + alias resolution; add dep to `tech-stack.yaml` | 1 | T-10 | 3 | `done` | 1/3 | c030852 |
| 9 | Fan-in computation from the graph | 8 | T-11 | 3 | `done` | 1/3 | 0e2ad0b |
| 10 | `dictionary/auth.ts`: auth keyword/symbol dictionary (tier 2) | 1 | T-13 | 4 | `done` | 1/3 | f4b0694 |
| 11 | `select` tiers 2 & 3: wire dictionary + fan-in fallback; degrade in order; confidence per tier | 3, 9, 10 | T-12, T-14 | 4 | `done` | 1/3 | c2b8c26 + ecc8ba5 |
| 12 | Honest "none found": no-auth repo → empty anchors, `has_auth=false`, files still in remainder | 11, 7 | T-15 | 4 | `done` | 2/3 | 8b903c6 |
| 13 | `clone.ts`: `git clone --depth 1` at pinned SHA into an SHA-keyed cache dir | 1 | T-18 | 5 | `done` | 1/3 | dcc8dbb |
| 14 | `labels.yaml` schema + `run.ts` loop: per-repo select → diff → log record; clone failure recorded & skipped | 12, 13, 4 | T-17 | 5 | `done` | 1/3 | (this commit) |

### Attempt budget

**3 code attempts per task.** Resets each task, never carries over.

Stop early — do not spend the remaining budget — if the **same failure signature appears
twice in a row**. An identical error twice means the problem is not understood, and
further attempts distort the implementation to satisfy an assertion nobody has understood.

Environmental failures (missing dependency, bad import, config, flake) do not consume an
attempt. Fix them and retry.

On exhaustion: mark `blocked`, fill in the record below, **stop**. Do not start the next
task — tasks are dependency-ordered.

---

## PR slices

Each slice ships independently: summary → human review → PR → CI review.
Max 5–7 files (excluding tests) and 500 lines per slice.

| Slice | Contains | Files | State | PR |
|---|---|---|---|---|
| 1 | Tasks 1–4 — walking skeleton: tier-1 recall on one repo | 8 | `merged` | #1 |
| 2 | Tasks 5–7 — universe + coverage ledger | 5 | `merged` | #2 |
| 3 | Tasks 8–9 — dependency graph + fan-in | 2 | `merged` | #3 |
| 4 | Tasks 10–12 — full cascade: tiers 1→2→3 | 3 | `in-review` | — |
| 5 | Tasks 13–14 — measurement over the labelled set | 10 | `in-review` | — |

---

## Blocked

_Nothing blocked._

---

## Test revisions

Every deliberate change to a test, with justification. Written by the **test agent only**.
A revision on a task that was failing gets extra scrutiny from the human reviewer.

| Date | Test | Change | Why |
|---|---|---|---|
| | | | |

---

## Session notes

Newest first. Keep entries short — this is a handoff, not a diary.

### 2026-07-27 (Slice 5 complete)

- **Done:** Tasks 13–14. `cloneAtSha` (dcc8dbb), `runLabels` + `labels.yaml` (a20981d), plus
  an auth-bearing fixture so T-17 proves a real hit (8053b7c). 36 tests pass (+9),
  typecheck clean, `docs:check` in sync. No test revisions.
- **The harness has measured nothing.** `labels.yaml` ships `repos: []` — the 10 hand-labelled
  repos are the operator's input per the spec's resolved open question, confirmed at this
  gate. `bun run --filter '@codewalk/engine' harness` prints `{"aggregateRecall":1}`, a
  vacuous pass over zero repos. The apparatus works; the number does not exist yet.
- **Blast radius widened by agreement.** T-17 originally ran only against `alias-repo`, whose
  cascade honestly bottoms out at tier 3 with no anchors — so every labelled file was a miss
  and the assertions held identically whether `scoreRecall`'s hits/misses were wired right or
  swapped. Operator approved adding `src/__fixtures__/next-auth-app/` (tier 1 fires, one hit,
  one miss, recall 0.5) plus one `tsconfig.json` exclude entry, matching the existing
  `alias-repo` precedent.
- **Watch out for:** the same mutation check on `run.ts`'s `selected: result.anchors` →
  `result.provenance.anchors` leaves the suite **green**, because tier 1 assigns the same
  array to both fields in `select.ts` and tier 3 hardcodes `provenance.anchors: []`. Only a
  tier-2/3 fixture with non-empty top-level anchors would catch that rewiring. Recorded in
  `summary.md` → Deferred work.
- **`cloneAtSha` has never hit a real remote.** T-18 runs against a local temp repo (which
  the design allows). `fetch --depth 1 origin <sha>` needs the server to permit
  fetch-by-SHA; GitHub does, but it is unproven here until real labels arrive.
- **Doc fix:** `design.md` documented the runner as `bun run --filter engine harness`, which
  matches no workspace — the package is `@codewalk/engine`. Corrected in two places.
- **`@codewalk/engine` has no `lint` task**, so no linter has ever run over this package.
  Repo-root `bun run lint` also fails on pre-existing CRLF in `apps/web`. Both recorded as
  deferred, neither touched here.
- **Next:** all 14 tasks are `done`. Slices 4 and 5 are both unmerged on this branch — review
  and merge slice 4 first, then this one. After that the spec is code-complete and the next
  move is not code: supply `labels.yaml` and run the measurement.

### 2026-07-26 (Slice 4 complete)

- **Done:** Tasks 10–12. Auth keyword dictionary (f4b0694), cascade tiers 2/3 wired into
  `select` (c2b8c26 + ecc8ba5), honest "none found" (8b903c6). 27 tests pass (+7),
  typecheck clean, `docs:check` in sync. No test revisions.
- **Design correction mid-slice (Task 12, attempt 1 → 2).** Tier 3 as merged in Slice 3
  ranked the *whole repo* by fan-in, so any repo with imports got anchors — a no-auth repo
  would have been handed `lib/db.ts` as an "auth anchor", the invented anchor ADR-001 D-20
  forbids. Two fixes landed together:
  - **Import lines are stripped before term-counting.** An import specifier names *another*
    module, so it is that module's signal. Without this every consumer of an auth module
    scores auth terms it doesn't contain — it was making three `no-vocabulary` files trip
    tier 2.
  - **Tier 3 ranks only `authCandidates`** (files with ≥1 auth term), dropping zero-fan-in
    entries. Fan-in is a ranker among plausible files, never evidence on its own. A
    repo-level "does this repo mention auth" gate was tried first and cannot work: the
    `no-auth` fixture's own `package.json` contains `"name": "no-auth"`, which matches
    `\bauth\b`.
- **`types.ts` widened by one field** (`hasAuth`) beyond the slice's stated blast radius —
  approved by the operator at the slice gate. T-15 requires the engine to *state* honest
  absence rather than have each consumer re-derive it.
- **Watch out for:** `hasAuth` is `anchors.length > 0` in effect, but tiers 1/2 write the
  literal `true` inside an `if (matched.length > 0)` guard. The invariant holds structurally;
  the `types.ts` comment saying it is "never hand-set per tier" is looser than the code.
- **History note:** Task 11's source and its tests are in two commits (c2b8c26 by the coder
  agent, ecc8ba5 with the tests) rather than one atomic commit, and both c2b8c26 and
  8b903c6 are missing the `Co-Authored-By`/`Claude-Session` trailers.
  `feat/selection-harness` is shared with three merged PRs, so this was not rebased to
  tidy. Note also that the local `main` ref is stale at 2595f4d — `origin/main` (dd50390)
  is the real merge base for this slice.
- **Next:** After merge, `/clear`, then `implement selection-harness` for Slice 5
  (`clone.ts`, `labels.yaml`, `run.ts`, Tasks 13–14) — the first slice that touches the
  network and the first to need real ground-truth labels from the operator.

### 2026-07-26 (Slice 3 complete)

- **Done:** Tasks 8–9. `graph.ts` dependency-cruiser adapter resolving `@/*` tsconfig
  aliases (c030852), `fanIn` counting distinct importers per target (0e2ad0b). 20 tests
  pass (+2), typecheck clean. `dependency-cruiser` recorded in `tech-stack.yaml` under
  ADR-001 D-04 (landed with Task 8's commit).
- **State:** Slice 3 (dependency graph + fan-in) done and green. Awaiting human review +
  PR merge.
- **Observation for Slice 4:** the T-11 fixture has each of the 3 importers reach
  `lib/db.ts` exactly once, so `fanIn`'s importer-dedupe (`Set` per target, guarding
  against a file that imports the same target twice — e.g. a type-only import beside a
  value import) is implemented but not exercised by any test. Behaviour is correct by
  inspection; flagging so Slice 4 doesn't assume it's covered.
- **Next:** After merge, `/clear`, then `implement selection-harness` for Slice 4
  (dictionary + tiers 2/3 cascade, Tasks 10–12) — first real consumer of `fanIn`.

### 2026-07-25 (Slice 2 complete)

- **Done:** Tasks 5–7. Kept-universe ignore-list via the `ignore` matcher (22345c0),
  coverage-ledger bucketing (bb8d124), remainder clustering (5279892). 18 tests pass (+7),
  typecheck clean. New dep `ignore` recorded in `tech-stack.yaml` under ADR-002.
- **State:** Slice 2 (universe + coverage ledger) done and green. Awaiting human review +
  PR merge. `summary.md` rewritten for this slice.
- **Process note:** Slice 1 is still unmerged — both slices sit on `feat/selection-harness`.
  A single PR of the branch would exceed the 5–7 file limit; split per slice (stacked PRs)
  or merge Slice 1 first. Operator's call.
  _(Resolved 2026-07-26: both landed as separate PRs from this same branch — #1, then #2.
  One PR per slice off `feat/selection-harness` is the established pattern; no stacking needed.)_
- **Next:** After merge, `/clear`, then `implement selection-harness` for Slice 3
  (dependency graph + fan-in, Tasks 8–9). Slice 3 adds `dependency-cruiser` to
  `tech-stack.yaml` (ADR-001 D-04) in the same commit as `src/graph.ts`.
- **Watch out for:** Clustering lives in `bucket.ts`, not a separate `cluster.ts` — the
  design's Files-touched table scopes Slice 2 to `ignore.ts` + `bucket.ts`. `bucket()` takes
  the classified set as a param (it does not call `select`), keeping the ledger decoupled from
  the cascade. Known-category deliberately excludes `route.ts` so non-auth API routes stay in
  the honest remainder.

### 2026-07-24 (Slice 1 complete)

- **Done:** Tasks 1–4. Engine package scaffold + Zod types (5ff36ed), Next.js detection +
  auth globs (4ccbbd7), tier-1 selection (e22fde1), recall diff + skeleton (this commit).
  11 tests pass, typecheck clean.
- **State:** Slice 1 (walking skeleton: tier-1 recall on one fixture) done and green.
  Awaiting human review + PR merge. `summary.md` written.
- **Next:** After merge, `/clear`, then `implement selection-harness` for Slice 2
  (universe + coverage ledger, Tasks 5–7).
- **Watch out for:** `select` tiers 2/3 are an intentional empty fallthrough (tier 3 / low)
  until Slice 4 — that placeholder gets replaced, not extended. NodeNext requires `.js`
  extensions on all relative imports. The harness stays LLM-free; the cite-failure threshold
  (D-19) is not derivable here (only two of three thresholds settle in this harness).

### 2026-07-24 (spec scaffold)

- **Done:** Spec scaffolded from ADR-001 Future work. Four files written, slice plan approved,
  four open questions resolved at the gate.
- **State:** Slice plan approved; Slice 1 started.
