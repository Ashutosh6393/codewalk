# Selection Harness — Summary

Written for a **human**, at the point a PR slice is complete — before the PR is raised and
before any automated review has run. It must stand on its own.

Read this, then the diff, then approve the PR.

- **Slice:** 1 of 5 · **Branch:** `feat/selection-harness`
- **Spec:** `design.md` · **ADR:** `docs/adr/001-Initial-Architecture.md`
- **Tasks:** 1–4 · **Tests:** 11 added, all passing
- **Size:** 7 non-test files, ~250 lines (limit: 5–7 files excl. tests, 500 lines)

---

## TL;DR

The engine can now look at a Next.js repo's file list and pick out its auth files using the
framework's conventions, then score that pick against a hand label. On a clean `next-auth`
fixture it selects the right files and reports full recall. This is the walking skeleton —
the thinnest end-to-end path (detect → select → measure) that proves the selection approach
works before any of the harder tiers or real-repo cloning exist.

---

## What changed

| File | Change | Why |
|---|---|---|
| `packages/engine/package.json` | new | The reusable engine package (D-05). Deps: zod; scripts: test, check-types, harness |
| `packages/engine/tsconfig.json` | new | Extends the shared `@codewalk/typescript-config/base.json` |
| `packages/engine/src/types.ts` | new | Zod result schemas: Confidence, Tier, Framework, Provenance, SelectionResult (facts-only, D-18) |
| `packages/engine/src/playbook/next.ts` | new | Next.js detection from the manifest + the auth convention globs (tier 1) |
| `packages/engine/src/select.ts` | new | `select('auth')` — tier-1 selection; tiers 2/3 stubbed as an empty fallthrough |
| `packages/engine/src/__fixtures__/next-auth-clean.ts` | new | Committed synthetic repo + hand label; the deterministic test substrate |
| `packages/engine/harness/recall.ts` | new | `scoreRecall` — hits/misses/extras + precision/recall |
| `CLAUDE.md`, `bun.lock` | generated | Workspace block regenerated; lockfile reconciled to the real filesystem (+zod, +@types/bun) |

### How it works now

`select('auth', { files, manifest })` runs the cascade's first tier:

1. `detectFramework(manifest)` reads the `next` dependency → `"next"` or `"unknown"`.
2. On a Next.js repo it matches the playbook's auth globs (`middleware.ts`,
   `app/api/auth/**/route.ts`, `next-auth` v5 config, …) against the file listing with
   `Bun.Glob` — no dependency added.
3. Matches become the anchors, tagged **tier 1 → high confidence**, with provenance recording
   the tier, framework, and matched anchors.

`scoreRecall(selected, labelled)` then diffs the pick against the hand label and reports
recall/precision. The skeleton test wires the two together on the fixture and asserts recall = 1.

---

## QA

**What does this let a user do that they couldn't before?**
Nothing user-facing — there is no product yet. For the operator, it's the first runnable piece
of the engine's selection path and the measuring stick the whole ADR's Future work depends on.

**What happens when it fails?**
Pure functions with no IO or model calls in this slice. A malformed manifest fails closed to
`framework: "unknown"` (lenient Zod parse) rather than throwing. `scoreRecall` treats empty
label/selection sets as vacuous passes, so there's no divide-by-zero on a no-auth repo.

**Does this touch existing behaviour?**
No. It's a brand-new isolated package. The only shared-file edits are generated: the `CLAUDE.md`
workspace block and `bun.lock` (which was already stale vs. the filesystem — see Risks).

**Any data migration?**
None. No database in this feature.

**Any performance implications?**
None meaningful. Glob matching over a bounded in-memory file list.

**Any security or auth implications?**
None. No network, no code execution, no secrets. Reads no files in this slice (inputs are
in-memory). Honours the ADR's "never execute repository code" (D-13) trivially.

**What did we deliberately not do?**
Tiers 2 (keyword/symbol) and 3 (fan-in), the universe/coverage ledger, the dependency graph,
and real-repo cloning — all later slices. `select`'s tier-2/3 branch is an intentional empty
fallthrough (tier 3 / low) until Slice 4.

---

## Verify it yourself

```bash
git checkout feat/selection-harness
bun install
cd packages/engine && bun test && bun run check-types
```

1. `bun test` → expect **11 pass**, 3 files.
2. Read `harness/recall.test.ts` → the skeleton test selects on the fixture and asserts full recall.
3. Break it on purpose: add a bogus glob or remove `middleware.ts` from the fixture's
   `expectedAuthAnchors` → the recall/skeleton test fails cleanly (not a crash).

---

## Test coverage

| Test | Verifies | File |
|---|---|---|
| T-01 | Framework detection (next / devDep / unknown / empty) | `src/playbook/next.test.ts` |
| T-02 | Tier-1 selects convention anchors, high confidence | `src/select.test.ts` |
| T-03 | A route imported by nobody is still selected (playbook over fan-in) | `src/select.test.ts` |
| T-16 | Provenance records tier, framework, anchors | `src/select.test.ts` |
| T-04 | Recall diff (mixed / perfect / empty) + end-to-end skeleton | `harness/recall.test.ts` |

**Covered:** framework detection incl. the empty/unknown edge; tier-1 selection and its
fan-in override; the recall math incl. empty-denominator edges; the full detect→select→score path.

**Not covered (by design, later slices):** tiers 2/3, the universe/ignore-list, bucketing,
the real dependency graph, cloning. The tier-2/3 empty fallthrough is exercised only
indirectly here; it gets real tests in Slice 4.

### Test revisions in this slice

**None.**

---

## Risks and things to watch

| Risk | Likelihood | What to watch |
|---|---|---|
| Fixtures don't resemble real repos | med | The whole point of Slices 3–5; real-repo recall (Slice 5) is the true signal, not fixture greenness |
| `bun.lock` churn looks alarming in the diff | low | It's the lockfile reconciling to the actual filesystem — the original referenced `@repo/*` template packages that don't exist on disk. Verify no *real* dependency was dropped |
| `Bun.Glob` semantics differ from expectation | low | Covered by T-02 (matches `app/api/auth/[...nextauth]/route.ts` via `**`); watch if a new glob is added |

**Rollback:** revert commits `5ff36ed`, `4ccbbd7`, `e22fde1`, `54d93ac`. No migration, no
shared runtime code — the package is self-contained, so a revert is clean.

---

## Deferred work

| Item | Why deferred | Worth doing? |
|---|---|---|
| tree-sitter symbol extraction | Feeds the LLM packet, not selection; harness uses keyword matching | yes (with the explanation call) |
| Cite-failure threshold (D-19) | Needs the LLM's citations; out of harness scope | yes (post-harness) |
| LLM explanation call, report writer, chat, UI, DB, queue | Downstream of proven selection; explicitly out of ADR harness scope | yes (own ADRs/specs) |

Anything marked **yes** that is non-trivial needs its own ADR before it becomes a spec.

---

## Documentation updated

- [x] `CLAUDE.md` — workspace/repository-shape block regenerated (new `packages/engine`)
- [x] `specs/001-selection-harness/implementation.md` — task states, slice state, session notes
- [ ] No other documentation affected by this slice
