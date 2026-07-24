# Selection Harness — Summary

Written for a **human**, at the point a PR slice is complete — before the PR is raised and
before any automated review has run. It must stand on its own.

Read this, then the diff, then approve the PR.

- **Slice:** 2 of 5 · **Branch:** `feat/selection-harness`
- **Spec:** `design.md` · **ADR:** `docs/adr/001-Initial-Architecture.md`, `docs/adr/002-ignore-for-gitignore-matching.md`
- **Tasks:** 5–7 · **Tests:** 7 added (18 total), all passing
- **Size:** 5 reviewable files (~289 lines) + 2 test files. Limit: 5–7 files excl. tests, 500 lines.

> **Process note:** Slice 1 is not yet merged — Slices 1 and 2 both sit on
> `feat/selection-harness`. A single PR of the whole branch would exceed the file limit.
> Either merge Slice 1 first, or open stacked per-slice PRs. This is an operator decision;
> the code is sliced cleanly regardless (Slice 2 touches no Slice 1 file).

---

## TL;DR

The engine can now compute a repo's **kept universe** — the files that count, after dropping
dependencies, build output, lockfiles, binaries and anything the repo's `.gitignore` excludes
— and then **bucket** every kept file into `classified` / `known-category` / `genuine-unknown`,
reporting a **coverage %**. The unclassified remainder is filtered to signal: a folder of
several unknowns surfaces as a cluster, a widely-imported single surfaces on its own, and a
lone low-fan-in util stays quiet. This is the D-20 "honesty by subtraction" denominator — what
lets the harness say *"couldn't classify these"* instead of pretending it saw everything.

---

## What changed

| File | Change | Why |
|---|---|---|
| `packages/engine/src/ignore.ts` | new | `keptUniverse(files, gitignore)` — always-ignore floor + repo `.gitignore`, one matcher |
| `packages/engine/src/bucket.ts` | new | `bucket()` (coverage ledger) + `clusterRemainder()` (T-09 signal filter) |
| `packages/engine/src/__fixtures__/mixed-tree.ts` | new | Committed synthetic tree spanning every ignore + bucket case |
| `tech-stack.yaml` | modify | New `engine` section records `ignore` as the gitignore matcher (rule 4) |
| `docs/adr/002-ignore-for-gitignore-matching.md` | new | Justifies the one new dependency |
| `packages/engine/package.json`, `bun.lock` | dep/generated | `+ignore@7` |

### How it works now

1. **`keptUniverse(files, gitignore)`** builds one `ignore` matcher from the always-ignore
   floor (`node_modules/`, `dist/`, `*.d.ts`, lockfiles, binaries by extension) plus the
   repo's `.gitignore` text, and returns the surviving files in input order. Gitignore
   semantics (depth-any, anchoring, dir-only, negation) come from the library, not hand-rolled.
2. **`bucket(kept, classified)`** sorts each kept file: in the `classified` set → `classified`;
   else matching a known-category glob (test / config / style / Next.js entrypoint) →
   `known-category`; else → `unknown`. `coverage = (classified + known-category) / total kept`.
   Only genuine-unknown source drags coverage down.
3. **`clusterRemainder(unknown, { fanIn })`** groups the unknown remainder by folder and
   surfaces only folders with ≥3 unknowns (clusters) or singles with fan-in ≥3 (high-fan-in).

---

## QA

**What does this let a user do that they couldn't before?**
Nothing user-facing. For the operator: the harness now has an honest denominator — it can
report what fraction of a repo it accounted for, and name the parts it couldn't, which is the
D-20 guarantee the selection numbers will be read against.

**What happens when it fails?**
Pure functions, no IO, no model. Empty inputs are handled: `keptUniverse([])` → `[]`;
`bucket([], …)` → coverage 1 (vacuous). A missing `.gitignore` defaults to `""`, applying the
floor only (spec edge case). No throwing paths.

**Does this touch existing behaviour?**
No. Two new engine files plus one fixture; Slice 1's `select`/`recall`/playbook are untouched.
`bucket()` takes the classified set as a parameter rather than calling `select`, so the ledger
and the cascade stay decoupled.

**Any data migration / performance / security implications?**
None. No DB, no network, no code execution, no secrets. All matching is over bounded in-memory
file lists. `ignore` is a zero-runtime-dependency, types-shipping library that runs under Bun.

**What did we deliberately not do?**
The dependency graph and real fan-in (Slice 3) — `clusterRemainder` accepts a `fanIn` map but
nothing computes one yet, so high-fan-in singles only fire once Slice 3 lands. Tiers 2/3 of the
cascade and real-repo cloning remain later slices. Known-category deliberately **excludes**
`route.ts`: a non-auth API route is a real subsystem file and must surface in the remainder,
not be hidden.

---

## Verify it yourself

```bash
git checkout feat/selection-harness
bun install
cd packages/engine && bun test && bun run check-types
```

1. `bun test` → expect **18 pass**, 5 files.
2. Read `src/ignore.test.ts` and `src/bucket.test.ts` against `src/__fixtures__/mixed-tree.ts`.
3. Break it on purpose: add `lib/db.ts` to the fixture's `.gitignore` → it drops from `kept`
   and coverage shifts; or drop the `*.log` floor/gitignore entry → `app.log` leaks into `kept`.

---

## Test coverage

| Test | Verifies | File |
|---|---|---|
| T-05 | Ignore-list + universe: floor + `.gitignore`; floor-only when no gitignore | `src/ignore.test.ts` |
| T-06 | Bucketing — a selected file lands in `classified` | `src/bucket.test.ts` |
| T-07 | Bucketing — test/config/style/entrypoint → `known-category`; unknown source stays unknown | `src/bucket.test.ts` |
| T-08 | Coverage % = (classified + known-category) / total kept | `src/bucket.test.ts` |
| T-09 | Remainder clustering: cluster surfaces, lone util hidden, high-fan-in single surfaces | `src/bucket.test.ts` |

**Not covered (by design, later slices):** real fan-in values (Slice 3 feeds `clusterRemainder`);
tiers 2/3; cloning. `clusterRemainder`'s high-fan-in path is tested with a hand-built map here.

### Test revisions in this slice

**None.**

---

## Risks and things to watch

| Risk | Likelihood | What to watch |
|---|---|---|
| Known-category globs over/under-match on real repos | med | The `KNOWN_CATEGORY_GLOBS` list is a heuristic; the Slice 5 real-repo run is where over-broad matching (hiding a real subsystem) would show up as suspiciously high coverage |
| Cluster thresholds (≥3 files, fan-in ≥3) are guesses | med | Defaults, tunable via opts; Slice 5 logging is meant to calibrate them off real data |
| `ignore` matcher edge cases | low | Covered by T-05; the library owns the hard semantics |

**Rollback:** revert commits `22345c0`, `bb8d124`, `5279892`. Self-contained new files; no
shared runtime code touched, so the revert is clean (leaves Slice 1 intact).

---

## Deferred work

| Item | Why deferred | Worth doing? |
|---|---|---|
| Calibrate cluster/fan-in thresholds | Needs real-repo data from Slice 5 | yes (Slice 5) |
| tree-sitter symbol extraction | Feeds the LLM packet, not selection | yes (with the explanation call) |
| Cite-failure threshold (D-19) | Needs the LLM's citations; out of harness scope | yes (post-harness) |
| LLM explanation call, report writer, chat, UI, DB, queue | Downstream of proven selection; out of ADR harness scope | yes (own ADRs/specs) |

---

## Documentation updated

- [x] `tech-stack.yaml` — new `engine` section for the `ignore` dependency
- [x] `docs/adr/002-ignore-for-gitignore-matching.md` — the dependency decision
- [x] `specs/001-selection-harness/implementation.md` — task states, SHAs, slice state, session notes
- [ ] No generated blocks affected (`bun run docs:check` clean)
