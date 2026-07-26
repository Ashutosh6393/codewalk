# Selection Harness — Summary

Written for a **human**, at the point a PR slice is complete — before the PR is raised and
before any automated review has run. It must stand on its own.

Read this, then the diff, then approve the PR.

- **Slice:** 4 of 5 · **Branch:** `feat/selection-harness`
- **Spec:** `design.md` · **ADR:** `docs/adr/001-Initial-Architecture.md` (D-17, D-20)
- **Tasks:** 10–12 · **Tests:** 7 added (20 → 27 total), all passing
- **Size:** 4 non-test files (`dictionary/auth.ts`, `select.ts`, `types.ts`,
  `implementation.md`) + 3 test files + 3 fixtures. 225 lines changed in the 4 non-test
  files (`git diff --stat dd50390..HEAD`, excluding tests/fixtures). Limit: 5–7 files
  excl. tests, 500 lines — comfortably inside on both axes.

> **Process note:** Slices 1–3 are merged (PRs #1, #2, #3, all from
> `feat/selection-harness`). This PR is Slice 4 alone. The **local** `main` ref is stale at
> `2595f4d`, so `git merge-base HEAD main` misreports; `origin/main` is `dd50390` (PR #3's
> merge) and that is the true base for this slice's diff.

---

## TL;DR

`select("auth")` now runs the **full three-tier cascade** instead of stopping at tier 1.
A repo without a Next.js `next-auth` setup but with hand-rolled login/session code (tier 2,
content keyword match) or with neither playbook nor vocabulary but a clear import-graph
signal (tier 3, fan-in) now gets real anchors instead of an empty tier-1-only fallthrough.
Confidence is read straight off which tier fired (high/medium/low). And critically, a repo
with **no auth at all** now comes back with an honest empty result (`hasAuth: false`)
instead of inventing an anchor from whatever file happens to have the most imports — every
repo has import structure, so fan-in alone was never allowed to be the evidence.

---

## What changed

| File | Change | Why |
|---|---|---|
| `packages/engine/src/dictionary/auth.ts` | new | Auth keyword dictionary (tier 2): 15-term list, word-boundary matching, requires ≥2 distinct terms so one incidental "cookie" mention doesn't qualify a file. Also exports `authCandidates` — files with ≥1 term — the gate tier 3 ranks within. |
| `packages/engine/src/select.ts` | modify | Adds tiers 2 and 3 to the cascade, replacing the tier-1-only placeholder from Slice 1. Tier 2 fires on a dictionary hit; tier 3 ranks `authCandidates` by fan-in, keeps the top 2, and drops zero-fan-in entries. |
| `packages/engine/src/types.ts` | modify | Adds `hasAuth: boolean` to `SelectionResult` — the honest-absence flag (D-20). |
| `packages/engine/src/__fixtures__/{hand-rolled-auth,no-vocabulary,no-auth}.ts` | new | Three synthetic repos, one per remaining harness category: tier-2 target, tier-3 target, and the no-auth case. |
| `packages/engine/src/dictionary/auth.test.ts`, `select.cascade.test.ts`, `select.no-auth.test.ts` | new | T-13 (dictionary), T-12/T-14 (tier-3 fallback + cascade order), T-15 (honest none-found). |
| `specs/001-selection-harness/implementation.md` | modify | Task states, SHAs, session notes. |

### How it works now

1. **Tier 1 (playbook)** — unchanged from Slice 1: Next.js convention anchors, high
   confidence.
2. **Tier 2 (dictionary)** — `matchAuthVocabulary` scans each file's path + content (with
   `import`/`require` lines stripped first — an import specifier names another module, not
   this file) for auth terms, and keeps files with 2 or more distinct terms. Medium
   confidence.
3. **Tier 3 (fan-in fallback)** — ranks `authCandidates(files, readFile)` (files with ≥1
   auth term) by fan-in, descending, drops anything with zero fan-in, keeps the top 2. Low
   confidence. `hasAuth` is `topFanIn.length > 0`.
4. If nothing fires, the cascade returns tier 3's empty result: no anchors, `hasAuth:
   false`, low confidence — never a thrown error, never an invented anchor.

---

## QA

**What does this let a user do that they couldn't before?**
Nothing user-facing yet — still no UI, no LLM. For the operator: `select("auth")` now
produces a real answer for the two repo shapes Slice 1 couldn't handle (hand-rolled auth,
no framework at all) plus a real "no auth here" for repos that genuinely have none, which
is the case Slice 5's recall measurement most needs to not get wrong.

**What happens when it fails?**
There's no failure mode that throws. `repo.readFile` and `repo.fanIn` are optional; if
absent, tiers 2 and 3 simply produce no candidates and the cascade falls through to the
empty tier-3 result. A repo whose real auth code doesn't share any of the 15 hand-picked
terms (see Deferred work) will be silently miscategorised as no-auth — that is a real
false-negative risk the term list carries, not a bug the code hides.

**Does this touch existing behaviour?**
Tier 1 and its test are unchanged. `bucket.ts`, `graph.ts`, `ignore.ts`, `recall.ts` are
untouched — `select.no-auth.test.ts` calls the existing `bucket()` to prove the remainder
still surfaces the no-auth repo's real files, but doesn't modify it. `types.ts` gained one
field (see the note below on blast radius).

**Any data migration / performance / security implications?**
None. No DB, no network, no new dependency. `stripImportLines` and the term scan are
per-file string operations over already-loaded content — same order of work as tier 2 in
the design, nothing added that scales worse than linear in file count × content size.

**What did we deliberately not do?**
Rank tier 2's matched files (see Deferred work). Calibrate the term list or the two
thresholds (`MIN_DISTINCT_TERMS`, tier-3 top-N) against real repos — that's Slice 5's job.
Extend `Intent` beyond `"auth"` — no second subsystem was asked for this slice.

---

## The mid-slice design correction (read this before approving)

Tier 3 as it landed in Slice 3 (fan-in only, no gate) would have ranked the **whole repo**
by fan-in — meaning any repo with an import graph got anchors, including a repo with zero
auth. That directly violates ADR-001 D-20 ("never invent an anchor"), and it's exactly the
gap the ADR's own Future work section names: *"1–2 with no auth (does the engine say 'none
found' instead of inventing it?)"*. This was caught during Task 12 (attempt 1 → 2), before
merge, not by CI.

Two changes landed together to close it:

1. **Import lines are stripped before term-counting** (`stripImportLines` in
   `dictionary/auth.ts`). An import specifier names another module — `import { checkAuth }
   from "./auth"` is that module's signal, not the importing file's. Without this fix, every
   ordinary consumer of an auth module scored auth terms it never actually contained; it
   was tripping tier 2 on three files in the `no-vocabulary` fixture that were never
   supposed to match.
2. **Tier 3 now ranks only `authCandidates`** — files carrying at least one auth term —
   and drops any candidate with zero fan-in. Fan-in became a **ranker among plausible
   files**, never evidence on its own.

A simpler fix was tried first and discarded: a repo-level "does this repo mention auth
anywhere" gate. It cannot work — the `no-auth` fixture's own `package.json` contains
`"name": "no-auth"`, which matches `\bauth\b` on a word boundary. A repo-wide gate would
have let that one incidental match unlock the whole cascade for a repo that has no auth
anywhere else. The per-file, per-candidate gate (`authCandidates`) doesn't have this hole
because `package.json` itself has no fan-in and isn't a plausible auth *file*.

---

## Blast-radius note

`design.md`'s Slice 4 blast radius lists `src/dictionary/auth.ts` and `src/select.ts`
only. `src/types.ts` gained one field (`hasAuth`) that wasn't in that list — approved by
the operator at the slice gate before work began. Reasoning: T-15 requires the engine to
*state* honest absence as a fact, not have every future consumer re-derive
`anchors.length === 0` for itself.

---

## Known looseness (reviewer's call, not a defect)

`types.ts` documents `hasAuth` as "derived mechanically… never hand-set per tier." In
`select.ts`, tiers 1 and 2 actually write the literal `true` inside an `if (matched.length
> 0)` guard, rather than computing `matched.length > 0` inline like tier 3 does. The
invariant holds — `true` only ever appears when `matched.length > 0` is already true, so
behaviourally it's the same thing — but the comment claims a stronger mechanical guarantee
than the code structurally enforces. Worth a look, not worth blocking on.

---

## Repo-history note

Task 11's implementation (`c2b8c26`) and its tests (`ecc8ba5`) landed as two separate
commits instead of one atomic commit, so neither is independently revertible.
Additionally, `c2b8c26` and `8b903c6` are missing the `Co-Authored-By`/`Claude-Session`
trailers the other two slice-4 commits carry (`f4b0694`, `ecc8ba5` have them). Both are
coder agents committing without being asked to at that point. Neither was rebased to clean
up: `feat/selection-harness` is shared and already has three PRs merged off it, so
rewriting its history was out of bounds.

---

## Verify it yourself

```bash
git checkout feat/selection-harness
bun install
cd packages/engine && bun test && bun run check-types
```

1. `bun test` → expect **27 pass**, 0 fail, 9 files, 74 `expect()` calls.
2. Read `src/select.no-auth.test.ts` — it's the acceptance test for the mid-slice fix
   above: `noAuth.fanIn` hands tier 3 clear winners (`lib/db.ts` at 5, `lib/analytics.ts`
   at 3) specifically to prove the cascade refuses to bite anyway.
3. Break it on purpose: in `dictionary/auth.ts`, change `authCandidates`'s filter from
   `>= 1` back to returning every file (i.e. make tier 3 rank the whole repo again) →
   `select.no-auth.test.ts`'s `expect(result.anchors).toEqual([])` fails, because
   `lib/db.ts` (5 imports, zero auth terms) becomes the top pick.

---

## Test coverage

| Test | Verifies | File |
|---|---|---|
| T-13 | Dictionary matches files with ≥2 distinct auth terms, rejects a single incidental mention | `src/dictionary/auth.test.ts` |
| T-12 | Tier-3 fan-in fallback returns the top-2 files by fan-in when tiers 1/2 don't fire; confidence=low | `src/select.cascade.test.ts` |
| T-14 | Cascade degrades in tier order across three fixtures: tier1→high, tier2→medium, tier3→low | `src/select.cascade.test.ts` |
| T-15 | No-auth repo returns empty anchors + `hasAuth=false`, and its files still land in the remainder via `bucket()` | `src/select.no-auth.test.ts` |

**Not covered (by design, later slices):** running this cascade against real cloned
repos (Slice 5); calibrating the term list/thresholds from that measurement.

### Test revisions in this slice

**None.**

---

## Acceptance criteria (design.md, Slice 4)

> "the cascade degrades in order; confidence = the tier that fired; a no-auth repo yields
> an honest 'none found' with files still in the remainder."

- **Cascade degrades in order** — satisfied. T-14 exercises all three tiers on three
  distinct fixtures and confirms `provenance.tier` matches which one fired, tier 1 before
  tier 2 before tier 3, no tier skipped or reordered.
- **Confidence = the tier that fired** — satisfied. `confidenceForTier` (`types.ts`) is the
  single source of the 1→high/2→medium/3→low map; every tier in `select.ts` reads from it
  rather than hand-setting a confidence string.
- **No-auth repo yields honest "none found," files still in remainder** — satisfied by
  T-15: `hasAuth: false`, `anchors: []`, and a direct assertion that all 7 of the no-auth
  fixture's real files land in `bucket()`'s `unknown` list, not dropped.

---

## Deferred work

| Item | Why deferred | Worth doing? |
|---|---|---|
| Calibrate cluster/fan-in thresholds | Needs real-repo data from Slice 5 | yes (Slice 5) |
| **Auth term list + `MIN_DISTINCT_TERMS`/tier-3 top-N thresholds** | Hand-picked guesses this slice, not measured. Exactly the "instrumented defaults, not guesses" Slice 5's measurement run is for. | yes (Slice 5) |
| tree-sitter symbol extraction | Feeds the LLM packet, not selection | yes (with the explanation call) |
| Cite-failure threshold (D-19) | Needs the LLM's citations; out of harness scope | yes (post-harness) |
| LLM explanation call, report writer, chat, UI, DB, queue | Downstream of proven selection; out of ADR harness scope | yes (own ADRs/specs) |
| Test for `fanIn`'s importer-dedupe path | Still no fixture forces a double-import from one file (carried from Slice 3) | yes |
| Monorepo/workspace-spanning graph resolution | No workspace fixture built yet | yes, if a labelled repo (Slice 5) needs it |
| **Tier 2 returns matched files unranked** | `matchAuthVocabulary` filters, doesn't order by match strength; no consumer needed ordering yet | maybe — only if Slice 5 shows tier-2 anchor lists need trimming |
| **`select`'s `Intent` type is `"auth"`-only** | The dictionary is auth-specific by construction; a second subsystem needs its own dictionary and its own `Intent` member | yes, whenever a second subsystem is asked for — not this feature |
| Root `package.json`'s `typecheck` script calls `turbo run typecheck`, but `turbo.json` defines the task as `check-types` — `bun run typecheck` fails with "Could not find task" | Pre-existing, unrelated to this slice; reporting per core-principles.md rather than fixing in an unrelated diff | yes, small fix, someone else's diff |
| `.claude/hooks/check-test-count.sh` counts test declarations with a recursive grep that doesn't exclude `node_modules`, so its baseline (1385) isn't the repo's actual test count | Pre-existing, still works as a monotonic guard (1385→1392 this slice); the absolute number is just meaningless | maybe, low priority |

---

## Documentation updated

- [x] `specs/001-selection-harness/implementation.md` — task states, SHAs, slice state, session notes
- [ ] No new ADR needed — this slice implements decisions already made in ADR-001 (D-17, D-20)
- [ ] No `tech-stack.yaml` change — no new dependency
- [ ] No generated blocks affected (`bun run docs:check` clean)
