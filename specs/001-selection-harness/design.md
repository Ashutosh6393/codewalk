# Selection Harness — Design

The plan. Source of truth for **what** gets built. Nothing gets implemented that is not
described here.

> **This is not an ADR.** The decision and its rationale live in
> `docs/adr/001-Initial-Architecture.md`. This document assumes that decision is made and
> describes how it lands in the codebase.

- **Source ADR:** `docs/adr/001-Initial-Architecture.md` (Future work; D-03, D-04, D-17, D-20)
- **Status:** draft — open questions resolved; awaiting final go on Slice 1
- **Approved by:** — (pending)

> Implementation does not start until Status is `approved`.

---

## What we're building

The **validation harness**: the first, LLM-free version of the engine's selection path,
pointed at real repos instead of a webpage. Given a hand-labelled set of Next.js repos, it
clones each at a pinned commit, builds the file **universe** and **coverage ledger**, runs
the **tiered auth-selection cascade** (playbook → keyword/symbol → fan-in), and measures
**anchor recall** against the ground-truth labels — logging enough per repo to read the
calibration thresholds off the results.

After this ships: we can answer the one question the whole ADR rests on — *does the
selection cascade reliably pick the right files?* — with a number, per repo, per tier,
instead of a hope.

## Why now

The ADR's *Future work* and CONTEXT.md's *Next build* both name this as the next thing to
build — explicitly **not the product**. Everything downstream (the explanation call, the
report writer, chat, UI, queue) is capped by selection quality, so selection gets proven in
isolation first, where the failure signal is cleanest and cheapest.

---

## Scope

### In scope

- A new **`packages/engine`** package holding the selection path (the reusable engine core,
  per D-05 — facts inside, no prose, no consumer logic).
- **Universe + coverage ledger** (D-20): ignore-list, file bucketing, coverage %.
- **Framework detection + Next.js playbook** (tier 1, D-17).
- **Auth keyword/symbol dictionary** (tier 2, D-17).
- **Dependency graph + fan-in** via `dependency-cruiser` (tier 3, D-03/D-04).
- The **cascade** that runs tiers 1→2→3, degrading in order, emitting provenance and
  tier-derived confidence (D-17).
- A thin **measurement harness**: ground-truth label file, clone-at-SHA adapter, run loop,
  recall diff, per-repo logging.

### Out of scope

- **The LLM explanation call** — the harness measures *selection*, i.e. which files get
  picked. No packet assembly for a model, no prose, no citations. (ADR Future work, explicit.)
- **tree-sitter span extraction** — spans feed the deferred explanation call, not selection.
  Tier-2's "symbol dictionary" is served by content/keyword matching in the harness. → deferred.
- **The citation trust gate + cite-failure threshold (D-19)** — downstream of the LLM;
  cannot be measured here. See Open questions.
- **UI, database, job queue, API server, caching** — none of the request-path machinery
  (D-07/D-08/D-11/D-12). The harness is a script.
- **Subsystems beyond auth** — auth is the single subsystem the ADR's harness targets.
- **The `retrieve()` public surface, the report/chat consumers** — built later, on top of a
  selection path proven here.

Anything discovered mid-build that is not in the in-scope list goes to **Deferred work**
in `summary.md`. It does not get built.

---

## Approach

A repo flows through the harness as: **clone at SHA → universe → bucket → select(auth) →
diff vs ground truth → log**. The graph is built once per repo and feeds both fan-in (tier 3)
and the coverage ledger's import-component clustering.

```
labels.yaml ──▶ clone(sha) ──▶ universe (ignore-list)
                                   │
                                   ├─▶ graph (dependency-cruiser) ──▶ fan-in
                                   │
                                   ▼
                        select("auth")  tier1 playbook
                                        tier2 dictionary   ──▶ anchors + provenance + confidence
                                        tier3 fan-in
                                   │
                                   ├─▶ bucket → coverage ledger (classified / known-cat / unknown)
                                   ▼
                        recall diff (selected vs labelled anchors) ──▶ per-repo log record
```

The selection functions are **pure** — given a file listing, a content accessor, and the
manifest, they return anchors. That is the primary test seam: the whole cascade is exercised
against committed fixtures with no network, no LLM, no DB. Clone is a thin IO adapter tested
separately; the real labelled repos drive the measurement *run*, not the unit tests.

### Package placement

`packages/engine` is a shared workspace package (per tech-stack `packages/*` rule and D-05's
"reusable engine" boundary). The harness runner lives **in-package** as a Bun script
(`bun run --filter engine harness`) because it *is* the engine's selection path pointed at
real repos — not a separate product app.

```
packages/engine/
  src/
    types.ts            # Zod schemas: Confidence, Provenance, Bucket, SelectionResult, RepoModel
    ignore.ts           # ignore-list + universe (which files count)
    bucket.ts           # coverage ledger: bucketing + coverage %
    graph.ts            # dependency-cruiser adapter: import graph, alias resolution, fan-in
    playbook/next.ts    # Next.js detection + convention anchor globs (tier 1)
    dictionary/auth.ts  # auth keyword/symbol dictionary (tier 2)
    select.ts           # the cascade: tier1 → tier2 → tier3
    __fixtures__/       # synthetic repo trees, one per label category
  harness/
    labels.yaml         # ground-truth: repo, sha, expected anchors, has-auth, category
    clone.ts            # git clone --depth 1 at SHA into an SHA-keyed cache dir
    run.ts              # loop: for each label → select → diff → log
    recall.ts           # precision/recall diff of selected vs labelled anchors
```

### Data model

No database. No Prisma. State is a committed `labels.yaml` (ground truth) and the harness's
stdout/log records. Structured types are Zod schemas in `types.ts` (D-18 shape, minus prose):
`SelectionResult { confidence, provenance{ tier, anchors[], framework }, anchors[], bucketSummary }`.

### API surface

None. No HTTP. The harness is invoked as a Bun script; `select()` is an in-process function.

### Validation

Zod at two boundaries: the parsed **manifest** (`package.json` deps → framework detection)
and the **`labels.yaml`** file on load. Both fail fast with a clear error. No untyped `as`;
types are `z.infer` of the schemas.

### UI

None.

### Existing code to reuse

- **`dependency-cruiser`** — JS/TS import graph + module resolution (path aliases via
  `tsconfig`, workspaces). D-04 decided "buy resolution." Recommended over `madge` (heavier
  but resolves `@/`-style aliases Next.js repos depend on). **Not yet in `tech-stack.yaml`** —
  added in Slice 3, justified by ADR-001 D-04. *(Open question: dependency-cruiser vs madge.)*
- **Bun** — runtime, test runner, script runner; `git` shelled from `clone.ts`.
- **Zod** — foundation validation.
- **`.gitignore` parsing** — reuse a maintained matcher (e.g. `ignore`) rather than
  hand-rolling glob semantics; confirmed in Slice 2.

---

## Files touched

Keep this current. It is how PR slices get sized.

| Path | Change | Layer | Slice |
|---|---|---|---|
| `packages/engine/package.json` | new | package | 1 |
| `packages/engine/tsconfig.json` | new | package | 1 |
| `packages/engine/src/types.ts` | new | engine | 1 |
| `packages/engine/src/playbook/next.ts` | new | engine | 1 |
| `packages/engine/src/select.ts` | new | engine | 1, 4 |
| `packages/engine/harness/recall.ts` | new | harness | 1 |
| `packages/engine/src/__fixtures__/*` | new | fixture | 1, 2, 4 |
| `packages/engine/src/ignore.ts` | new | engine | 2 |
| `packages/engine/src/bucket.ts` | new | engine | 2 |
| `packages/engine/src/graph.ts` | new | engine | 3 |
| `tech-stack.yaml` | modify | docs | 3 |
| `packages/engine/src/dictionary/auth.ts` | new | engine | 4 |
| `packages/engine/harness/labels.yaml` | new | harness | 5 |
| `packages/engine/harness/clone.ts` | new | harness | 5 |
| `packages/engine/harness/run.ts` | new | harness | 5 |

Excluding tests, each slice stays within **5–7 files / 500 lines**.

---

## Test cases

Every task in `implementation.md` maps to one or more of these IDs. If a behaviour is not
listed here, there is no test for it, and it does not get built.

| ID | Verifies | Type | Given → When → Then |
|---|---|---|---|
| T-01 | Framework detection | unit | manifest with `next` + `next-auth` → detect → framework=`next`, provenance records it |
| T-02 | Tier-1 selects convention anchors | unit | next-auth repo fixture → `select("auth")` → picks `middleware.ts`, `app/api/auth/**/route.ts`; confidence=high |
| T-03 | Playbook overrides fan-in | unit | route file imported by nobody (fan-in 0) → tier-1 → still selected |
| T-04 | Recall diff | unit | selected set + labelled anchors → diff → correct precision/recall, hit/miss lists |
| T-05 | Ignore-list + universe | unit | tree with `node_modules`, lockfile, `dist`, `*.d.ts`, binary, `.gitignore` entry → universe → all excluded, kept set correct |
| T-06 | Bucketing — classified | unit | file claimed by auth selection → bucket → `classified` |
| T-07 | Bucketing — known-category | unit | test/config/style/entrypoint files → bucket → `known-category` (not counted against coverage) |
| T-08 | Coverage % | unit | mixed tree → coverage = (classified + known-category) ÷ total kept |
| T-09 | Remainder clustering | unit | one lone unknown util vs a ≥N-file unknown folder → only the cluster (or a high-fan-in single) surfaces |
| T-10 | Graph builds + resolves aliases | integration | fixture repo with `@/lib/*` tsconfig alias → graph → edge resolves to the real file |
| T-11 | Fan-in count | integration | fixture where 3 files import `lib/db.ts` → fan-in(`lib/db.ts`)=3 |
| T-12 | Tier-3 fan-in fallback | unit | repo with no playbook + no dictionary hit → `select` → top-fan-in files; confidence=low |
| T-13 | Tier-2 dictionary | unit | hand-rolled auth (no `next-auth`, files contain `jwt`/`session`/`cookie`) → tier-1 misses, tier-2 fires; confidence=medium |
| T-14 | Cascade degrades in order | unit | fixtures forcing each tier → confidence = tier that fired (1→high, 2→med, 3→low) |
| T-15 | Honest "none found" | unit | repo with no auth → `select` → empty anchors + `has_auth=false`, files still land in remainder, never "no system" |
| T-16 | Provenance record | unit | any select → provenance = { tier, anchors[], framework } populated |
| T-17 | Harness loop logs per repo | integration | fake labelled set (fixtures) → `run` → one record each: tier, selected, hit/miss, confidence, coverage% |
| T-18 | Clone at pinned SHA | integration | label with sha → clone → working tree at that exact SHA (thin; may run against a small real/local repo) |

### Edge cases and failure modes

- **No `package.json` / no manifest** → framework=unknown; skip tier-1, fall to tier-2/3 (T-14 family).
- **`next-auth` present but no route/middleware files** (misconfigured) → tier-1 partial, degrade to tier-2 for the rest.
- **Missing `.gitignore`** → apply the always-ignore floor only (T-05).
- **Monorepo workspaces** → dependency-cruiser resolves across workspaces; fan-in spans them (T-10/T-11).
- **High-fan-in genuine-unknown file** → surfaces individually even without a cluster (T-09).
- **Clone network failure** → harness records the repo as errored and continues the loop; does not abort the run.

---

## Slice plan

Vertical, walking-skeleton-first, riskiest (selection) threaded from slice 1, dependency-ordered.
Each slice is independently demonstrable and independently mergeable.

### Slice 1 — Walking skeleton: tier-1 recall on one repo

- **Blast radius:** `packages/engine/{package.json,tsconfig.json}`, `src/types.ts`,
  `src/playbook/next.ts`, `src/select.ts` (tier-1 only), `harness/recall.ts`, one next-auth fixture.
- **Acceptance:** running the tier-1 path on a committed next-auth fixture selects the
  convention auth anchors and prints a recall number vs a hand label. End to end, no graph, no
  tiers 2/3, no clone.
- **Tests:** T-01, T-02, T-03, T-04, T-16.

### Slice 2 — Universe + coverage ledger (D-20 denominator)

- **Blast radius:** `src/ignore.ts`, `src/bucket.ts`, fixtures for ignore/bucket cases.
- **Acceptance:** for a fixture tree, the harness reports the kept universe, buckets every
  file, and prints a coverage %; a lone unknown does not cry wolf, a cluster does.
- **Tests:** T-05, T-06, T-07, T-08, T-09.

### Slice 3 — Dependency graph + fan-in (tier-3 substrate)

- **Blast radius:** `src/graph.ts`, `tech-stack.yaml` (add dependency-cruiser), a
  fixture repo with `@/` aliases and known import counts.
- **Acceptance:** the graph builds for a fixture repo, resolves path aliases to real files,
  and fan-in counts are correct. dependency-cruiser recorded in `tech-stack.yaml` (ADR-001 D-04).
- **Tests:** T-10, T-11.

### Slice 4 — Full cascade: tiers 1→2→3, confidence + provenance

- **Blast radius:** `src/dictionary/auth.ts`, `src/select.ts` (add tiers 2 & 3), fixtures
  for hand-rolled-auth, no-vocabulary, and no-auth cases.
- **Acceptance:** the cascade degrades in order; confidence = the tier that fired; a no-auth
  repo yields an honest "none found" with files still in the remainder.
- **Tests:** T-12, T-13, T-14, T-15.

### Slice 5 — Measurement over the labelled set + threshold logging

- **Blast radius:** `harness/labels.yaml`, `harness/clone.ts`, `harness/run.ts`.
- **Acceptance:** `bun run --filter engine harness` clones each labelled repo at its SHA,
  runs selection, and emits one log record per repo (tier fired, files selected, hit/miss,
  confidence, coverage %); anchor recall is computed across the set. A clone failure is
  recorded and skipped, not fatal.
- **Tests:** T-17, T-18.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| dependency-cruiser mis-resolves aliases/workspaces | tier-3 fan-in wrong → wrong fallback selection | Test against `@/`-alias and workspace fixtures (T-10/T-11); label resolution gaps low-confidence, never silently wrong |
| Fixtures don't resemble real repos | green suite, leaky real recall | Fixtures guard *mechanics* only; the 10-repo measurement run (Slice 5) is the real acceptance signal — that's the whole point of the harness |
| Static analysis blind to framework-magic wiring (D-03 consequence) | tier-1 misses convention-wired anchors | Playbook encodes the conventions explicitly; tier-3 is a fallback, never the ranker on a known framework (D-17) |
| Clone flakiness / network | measurement run aborts | Pure path is network-free; clone cache keyed by SHA; per-repo errors recorded and skipped |
| Scope creep toward "just add the LLM" | harness stops being cheap/isolated | LLM is explicitly out of scope; selection recall is measurable without it |

---

## Open questions

All four resolved at the spec gate (2026-07-24).

- [x] **dependency-cruiser vs madge** (ADR D-04 said "e.g. … or lighter madge"). **Resolved:
  dependency-cruiser** — reliable `tsconfig` alias + workspace resolution, which Next.js repos
  lean on. Lands in `tech-stack.yaml` under ADR-001 D-04 in Slice 3 (Task 8).
- [x] **The cite-failure threshold (D-19) cannot be measured by this harness** — it needs the
  LLM's citations, which are out of scope. **Resolved: harness settles two of three.** Definition
  of done = trustworthy anchor recall + the remainder cluster/fan-in cutoff + the ignore-list/bucket
  rules. The cite-failure valley is deferred to when the explanation call lands, and is recorded in
  `summary.md` → Deferred work at Slice 5.
- [x] **Ground-truth labelling of the 10 repos** (ADR step 1–2). **Resolved: a human input, not
  built by the spec.** The harness ships `labels.yaml` with a defined, Zod-validated schema; the
  repo list + hand-labelled anchors are supplied by the operator. Slice 5 works against a fake
  labelled fixture set until real labels arrive.
- [x] **tree-sitter deferral.** **Resolved: deferred.** The harness serves tier-2 via
  keyword/content matching; tree-sitter symbol/span extraction waits for the explanation/packet
  work. Recorded in `summary.md` → Deferred work.
