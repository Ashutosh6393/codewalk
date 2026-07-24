# ADR-002: `ignore` for `.gitignore` matching in the selection harness

- **Date:** 2026-07-25
- **Status:** accepted

## Context

The selection harness's kept universe (ADR-001 D-20) must honor each repo's
`.gitignore` so the coverage denominator is honest. `.gitignore` semantics are not glob
semantics: depth-any matching, leading-`/` anchoring, trailing-`/` directory-only rules,
and `!` negation. Getting the universe wrong distorts the coverage % and remainder — both
part of this harness's definition of done — so correctness here is not cosmetic. The
package is new to the repo, so per `tech-stack.yaml` rule 4 the choice is recorded here.

## Alternatives

1. **Hand-roll a minimal matcher** — no dependency, but reimplements a wheel and drops
   `!` negation, which real repo `.gitignore` files use. Weakest exactly where the harness
   must be trusted.
2. **`ignore`** — the de-facto `.gitignore` matcher: zero runtime dependencies, ships
   types, works under Bun, correct on the full spec including negation and anchoring.

## Decision

Use **`ignore`**. The same matcher applies both the always-ignore floor and the repo's
`.gitignore` in `packages/engine/src/ignore.ts`. Recorded in `tech-stack.yaml` under
`engine`.

## Tradeoffs

One more dependency in the engine package, accepted because gitignore parsing is a
maintained-library problem, not core domain logic (`buy_vs_build`).

## Consequences

The kept universe reflects real `.gitignore` behavior, so coverage % and the remainder
are measured against an honest denominator. Future engine work reuses the same matcher
rather than re-deriving ignore rules.
