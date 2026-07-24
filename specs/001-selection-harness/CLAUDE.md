# CLAUDE.md — Selection Harness

Feature-specific instructions. Read this **first**, before `design.md`.

- **Spec:** `specs/001-selection-harness/`
- **Source ADR:** `docs/adr/001-Initial-Architecture.md`
- **Branch:** `feat/selection-harness`
- **Workflow:** [`SPEC-WORKFLOW.md`](../../SPEC-WORKFLOW.md) — the loop, retry limits, and
  file ownership rules apply here in full.

---

## Context

The validation harness is the first, LLM-free version of CodeWalk's engine selection path,
run as a measuring loop instead of behind a webpage. It clones hand-labelled Next.js repos at
a pinned commit, builds the file universe and coverage ledger, runs the tiered auth-selection
cascade (playbook → keyword/symbol → fan-in), and measures anchor recall against ground truth.
It exists to prove the one assumption the whole ADR rests on — that selection picks the right
files — before any model call, UI, database, or queue is built.

---

## Before writing anything

1. Read `design.md` — scope, files touched, test cases.
2. Read `implementation.md` — this is the source of truth for current state.
3. If any task is `blocked`, **stop and report it.** Do not start other tasks.
4. Confirm you are on `feat/selection-harness`.
5. Read the reference implementations note below.

---

## Which agent am I?

| If you are the… | You may write | You may **never** write |
|---|---|---|
| Test agent | `*.test.ts` | source files |
| Coder agent | source files, `implementation.md` | **any test file** |

If you are the coder agent and you believe a test is wrong: **stop and escalate.**
Do not edit it, skip it, or weaken the assertion. That path produces a green suite that
proves nothing, and it is the single failure mode this workflow exists to prevent.

---

## Reference implementations

This is a **greenfield** package — `packages/engine` does not exist yet and there is no prior
engine/harness code to imitate. Follow the repo-wide conventions instead of inventing a shape:

| Concern | Follow |
|---|---|
| Package layout | `packages/typescript-config/` for the workspace `package.json` + tsconfig shape |
| Validation | `tech-stack.yaml` → Zod: schemas are source of truth, types via `z.infer` |
| Tests | `.claude/rules/testing.md` — `bun:test`, colocated `*.test.ts`, behaviour-named |
| Fixtures | Synthetic repo trees under `src/__fixtures__/`, one per label category |

---

## Patterns for this feature

- **Selection functions are pure.** `select(intent, { files, readFile, manifest })` →
  `SelectionResult`. No IO inside the cascade — clone and file-reading are adapters at the
  edge. This is what makes the cascade testable against fixtures with no network.
- **Facts inside, no prose (D-05/D-18).** The engine emits structured facts only — anchors,
  provenance, confidence, buckets. It never writes a sentence of narrative. There is no model
  call anywhere in this package.
- **Confidence is mechanical (D-17).** It is derived from the tier that fired
  (1→high, 2→medium, 3→low). Never a model self-assessment, never hand-set.
- **Honesty by subtraction (D-20).** A missed subsystem must still surface via the coverage
  remainder — "couldn't classify," never "no system found." A no-auth repo returns empty
  anchors with `has_auth=false`; it never invents an anchor.
- **Playbook overrides fan-in on known frameworks (D-17).** A convention-wired route file is
  imported by nobody — fan-in would bury it. Tier-3 is the fallback, never the ranker when a
  playbook matched.
- Validate the manifest and `labels.yaml` at their boundaries with Zod. Derive types with
  `z.infer` — do not hand-write them.
- Adding `dependency-cruiser` is pre-approved by ADR-001 D-04, but it must land in
  `tech-stack.yaml` in the **same commit** (Slice 3, Task 8). No other new dependency without
  asking.

---

## Don't

- Don't build anything not in `design.md`. New ideas go to **Deferred work** in `summary.md`.
- Don't skip tests, and don't write code before the failing test exists.
- Don't mark a task `done` yourself — the test agent confirms the pass.
- Don't continue past a `blocked` task.
- Don't batch documentation updates; they ship in the same commit as the change.
- **Don't add the LLM explanation call, tree-sitter span extraction, citations, a UI, a
  database, or a queue.** All are explicitly out of scope — the harness is LLM-free by design.
- **Don't use fan-in as the primary ranker on a known framework** — it buries convention-wired
  entry points. Playbook first, fan-in last.
- **Don't let a no-auth repo produce an invented anchor.** Honest absence is a hard requirement.
