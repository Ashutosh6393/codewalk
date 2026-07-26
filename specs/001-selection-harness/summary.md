# Selection Harness — Summary

Written for a **human**, at the point a PR slice is complete — before the PR is raised and
before any automated review has run. It must stand on its own.

Read this, then the diff, then approve the PR.

- **Slice:** 3 of 5 · **Branch:** `feat/selection-harness`
- **Spec:** `design.md` · **ADR:** `docs/adr/001-Initial-Architecture.md` (D-04)
- **Tasks:** 8–9 · **Tests:** 2 added (20 total), all passing
- **Size:** 2 reviewable files (`graph.ts`, `tsconfig.json` tweak) + `tech-stack.yaml` +
  1 test file + 1 on-disk fixture repo. Limit: 5–7 files excl. tests, 500 lines.

> **Process note:** Slices 1 and 2 are still unmerged — Slices 1, 2 and 3 all sit on
> `feat/selection-harness`. A single PR of the whole branch would exceed the file limit.
> Either merge Slices 1–2 first, or open stacked per-slice PRs. This is an operator decision;
> the code is sliced cleanly regardless (Slice 3 touches no Slice 1/2 file).

---

## TL;DR

The engine can now build a real import graph for a repo and count **fan-in** — how many
distinct files import a given file. This is the substrate tier-3 of the selection cascade
(Slice 4) will rank on when a repo has no framework playbook and no auth vocabulary hit. It
resolves TypeScript path aliases (`@/lib/db` resolves to the real file on disk), which is the
exact thing a hand-rolled import parser would get wrong first, and which Next.js repos lean
on constantly.

---

## What changed

| File | Change | Why |
|---|---|---|
| `packages/engine/src/graph.ts` | new | `buildGraph(root)` (dependency-cruiser adapter) + `fanIn(graph)` (distinct-importer counts) |
| `packages/engine/src/graph.test.ts` | new | T-10 (alias resolution) + T-11 (fan-in count) |
| `packages/engine/src/__fixtures__/alias-repo/` | new | Real on-disk fixture: 4 `.ts` files + a real `tsconfig.json` with a `@/*` alias |
| `packages/engine/tsconfig.json` | modify | Excludes the fixture directory from this package's own typecheck |
| `packages/engine/package.json`, `bun.lock` | dep/generated | `+dependency-cruiser@18.1.0` |
| `tech-stack.yaml` | modify | New `engine.dependency_graph` section, citing ADR-001 D-04 |
| `specs/001-selection-harness/implementation.md` | modify | Task states, SHAs, session notes |

### How it works now

1. **`buildGraph(root)`** shells out to dependency-cruiser's programmatic `cruise` API
   against a directory on disk, resolves every import edge (including `tsconfig` path
   aliases), drops unresolved specifiers, and returns `{ edges: { from, to }[] }` with
   repo-relative POSIX paths (dependency-cruiser reports native-separator paths on Windows;
   this adapter normalises them).
2. **`fanIn(graph)`** dedupes importers of each target file through a `Set` — one file
   importing the same target twice (e.g. a type-only import beside a value import) counts as
   one importer, not two — and returns a map from target file to distinct-importer count. A
   file nobody imports is absent from the map, not present with `0`; callers already default
   with `?? 0` (see `clusterRemainder` in `bucket.ts`).

---

## QA

**What does this let a user do that they couldn't before?**
Nothing user-facing yet. For the operator: the engine can now answer "how many files import
this one," across real import graphs with alias resolution — the number tier-3 selection and
the remainder's high-fan-in-single rescue (Slice 2) will consume starting Slice 4.

**What happens when it fails?**
An unresolved import (e.g. a genuinely broken alias, or an import dependency-cruiser can't
follow) is silently dropped from the edge list rather than thrown — this is dependency-cruiser's
own `couldNotResolve` flag, and the adapter treats "can't resolve" as "no edge," not an error.
That is a real, if narrow, false negative for fan-in: a file with a broken import to something
real still under-counts as an importer of that target. No test in this slice exercises that
distinction; it is not disguised as covered.

**Does this touch existing behaviour?**
No. One new engine file plus its adapter test and fixture; `ignore.ts`, `bucket.ts`, and
Slice 1's `select`/`recall`/playbook are untouched. `fanIn` is a pure function over a
`DependencyGraph` value — nothing in this slice wires it into `bucket.ts` or `select.ts` yet.

**Any data migration / performance / security implications?**
None. No DB, no network. dependency-cruiser reads the filesystem under `root` and returns an
in-memory graph — this is the one place in the engine so far that touches disk directly
(everything in Slices 1–2 operated on in-memory fixture trees). `dependency-cruiser` is a
build-time devtool-class dependency (18.1.0), pre-approved by ADR-001 D-04; no new ADR was
required (contrast `ignore` in Slice 2, which needed one because it wasn't pre-approved).

**What did we deliberately not do?**
Wiring `fanIn` into tier-3 of `select()` and into `clusterRemainder`'s live consumption
(Slice 4) — this slice only produces the number, it does not consume it anywhere yet. No
monorepo/workspace-spanning fixture (design.md flags this as a T-10/T-11 case; the single
fixture repo here doesn't exercise cross-workspace resolution). No test for the
importer-dedupe path described below — see Risks.

---

## Verify it yourself

```bash
git checkout feat/selection-harness
bun install
cd packages/engine && bun test && bun run check-types
```

1. `bun test` → expect **20 pass**, 6 files, 45 `expect()` calls.
2. Read `src/graph.test.ts` against `src/__fixtures__/alias-repo/` — note it's real files on
   disk with a real `tsconfig.json`, not an object literal like the Slices 1–2 fixtures.
3. Break it on purpose: delete the `paths` block from
   `src/__fixtures__/alias-repo/tsconfig.json` → `@/lib/db` no longer resolves, T-10's
   "never left as an unresolved `@/` specifier" assertion fails, and T-11's fan-in count for
   `lib/db.ts` drops to 0 (no edges reach it at all).

---

## Test coverage

| Test | Verifies | File |
|---|---|---|
| T-10 | Graph builds + resolves a tsconfig `@/*` alias import to the real target file | `src/graph.test.ts` |
| T-11 | Fan-in counts distinct importers of `lib/db.ts` as 3; a file nobody imports is absent from the map | `src/graph.test.ts` |

**Not covered (by design, later slices):** wiring `fanIn` into tier-3 selection or the
remainder's high-fan-in rescue (Slice 4); monorepo/workspace-spanning resolution.

**Not covered (a real gap, not by design — see Risks):** the importer-dedupe path in
`fanIn` (one file importing the same target twice). The fixture has each of the 3 importers
reach `lib/db.ts` exactly once, so a naive edge-count implementation would pass this same
test. The dedupe logic is correct by inspection, not by regression test.

### Test revisions in this slice

**None.**

---

## Risks and things to watch

| Risk | Likelihood | What to watch |
|---|---|---|
| `fanIn`'s importer-dedupe (`Set` per target) has no regression test | med | Slice 4 is the first real consumer of `fanIn`; do not assume the dedupe path is covered until a test forces one file to import the same target twice |
| Unresolved imports silently drop as "no edge," not an error | low-med | A genuinely broken import and an alias-config bug look identical from the outside (both just produce a missing edge) — if fan-in numbers look off on a real repo, check `couldNotResolve` before assuming the graph is complete |
| The load-bearing `transpileOptions.tsConfig` argument is easy to regress | med | Passing only `cruiseOptions.tsConfig.fileName` is not enough for alias resolution — the *parsed* tsconfig must also go in as the 4th `cruise` argument (via `dependency-cruiser/config-utl/extract-ts-config`), or aliases fail silently (`couldNotResolve: true`, never a thrown error). Documented in `graph.ts`'s header comment and `tech-stack.yaml`; a future refactor that "simplifies" the `cruise` call is the way this regresses |
| Fixtures don't resemble real repos | med | `alias-repo` guards mechanics only (one alias, one fan-in count) — the real recall signal is the Slice 5 measurement run against labelled repos |

**Rollback:** revert commits `c030852`, `0e2ad0b`, `882153f`, `c382a35`. Self-contained new
files plus one config exclusion; no shared runtime code touched, so the revert is clean
(leaves Slices 1–2 intact).

---

## Deferred work

| Item | Why deferred | Worth doing? |
|---|---|---|
| Calibrate cluster/fan-in thresholds | Needs real-repo data from Slice 5 | yes (Slice 5) |
| tree-sitter symbol extraction | Feeds the LLM packet, not selection | yes (with the explanation call) |
| Cite-failure threshold (D-19) | Needs the LLM's citations; out of harness scope | yes (post-harness) |
| LLM explanation call, report writer, chat, UI, DB, queue | Downstream of proven selection; out of ADR harness scope | yes (own ADRs/specs) |
| Wire `fanIn` into tier-3 selection + remainder high-fan-in rescue | This slice only produces the number | yes (Slice 4, already planned) |
| Test for `fanIn`'s importer-dedupe path | No fixture currently forces a double-import from one file | yes, before Slice 4 leans on it |
| Monorepo/workspace-spanning graph resolution | No workspace fixture built this slice | yes, if a labelled repo (Slice 5) turns out to need it |

---

## Documentation updated

- [x] `tech-stack.yaml` — new `engine.dependency_graph` section for `dependency-cruiser`
- [x] `specs/001-selection-harness/implementation.md` — task states, SHAs, slice state, session notes
- [ ] No new ADR needed — `dependency-cruiser` was pre-approved by ADR-001 D-04
- [ ] No generated blocks affected (`bun run docs:check` clean)
