# Selection Harness — Implementation

Live state. The **source of truth** for where things stand. An agent resuming this feature
reads this file first and picks up from it.

Update it after every task. Never batch updates.

- **Status:** in-review
- **Branch:** `feat/selection-harness`
- **Spec:** `design.md` · **ADR:** `docs/adr/001-Initial-Architecture.md`
- **Current task:** Slice 1 complete — awaiting human review + PR merge

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
| 5 | `ignore.ts`: ignore-list (always-ignore floor + `.gitignore`) → kept universe | 1 | T-05 | 2 | `done` | 1/3 | (slice 2) |
| 6 | `bucket.ts`: bucket kept files (classified / known-category / genuine-unknown) + coverage % | 5, 3 | T-06, T-07, T-08 | 2 | `done` | 1/3 | (slice 2) |
| 7 | Remainder clustering: surface only ≥N-file clusters or high-fan-in singles | 6 | T-09 | 2 | `done` | 1/3 | (slice 2) |
| 8 | `graph.ts`: dependency-cruiser adapter — import graph + alias resolution; add dep to `tech-stack.yaml` | 1 | T-10 | 3 | `pending` | 0/3 | — |
| 9 | Fan-in computation from the graph | 8 | T-11 | 3 | `pending` | 0/3 | — |
| 10 | `dictionary/auth.ts`: auth keyword/symbol dictionary (tier 2) | 1 | T-13 | 4 | `pending` | 0/3 | — |
| 11 | `select` tiers 2 & 3: wire dictionary + fan-in fallback; degrade in order; confidence per tier | 3, 9, 10 | T-12, T-14 | 4 | `pending` | 0/3 | — |
| 12 | Honest "none found": no-auth repo → empty anchors, `has_auth=false`, files still in remainder | 11, 7 | T-15 | 4 | `pending` | 0/3 | — |
| 13 | `clone.ts`: `git clone --depth 1` at pinned SHA into an SHA-keyed cache dir | 1 | T-18 | 5 | `pending` | 0/3 | — |
| 14 | `labels.yaml` schema + `run.ts` loop: per-repo select → diff → log record; clone failure recorded & skipped | 12, 13, 4 | T-17 | 5 | `pending` | 0/3 | — |

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
| 1 | Tasks 1–4 — walking skeleton: tier-1 recall on one repo | 8 | `in-review` | — |
| 2 | Tasks 5–7 — universe + coverage ledger | ~2 | `pending` | — |
| 3 | Tasks 8–9 — dependency graph + fan-in | ~2 | `pending` | — |
| 4 | Tasks 10–12 — full cascade: tiers 1→2→3 | ~2 | `pending` | — |
| 5 | Tasks 13–14 — measurement over the labelled set | ~3 | `pending` | — |

---

## Blocked

Delete this section when nothing is blocked.

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
