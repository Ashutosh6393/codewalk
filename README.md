# CodeWalk

Point it at a public JavaScript/TypeScript GitHub repo. It shows someone new to that repo
how the project is built — structure, stack, entry points, and plain-language write-ups of
its subsystems — with every claim linked to the line of code it came from.

The last part is the point. Plenty of tools draw a dependency graph; the ones that also
*explain* tend to produce a confident, plausible, wrong summary, and a newcomer can't tell
that from a right one. So every explanation here is grounded in code that was actually
read, every citation is verified against what we sent the model, and anything we can't
explain is labelled — never quietly omitted.

**Status: pre-implementation.** The design is settled; no product code is written yet.

---

## Start here

| File | What it holds |
|---|---|
| [CONTEXT.md](CONTEXT.md) | The problem, who it's for, domain vocabulary, what we're deliberately not building |
| [docs/adr/001-Initial-Architecture.md](docs/adr/001-Initial-Architecture.md) | Every architectural decision and why, including the alternatives rejected |
| [CLAUDE.md](CLAUDE.md) | Agent entry point — an index into the rules |
| [SPEC-WORKFLOW.md](SPEC-WORKFLOW.md) | How features get built |
| [tech-stack.yaml](tech-stack.yaml) | The approved dependency menu |

---

## How it works, in one pass

```
Browser → API server → job queue → worker → engine → consumers
                ↑
         commit-SHA cache
```

The **engine** clones at a commit, builds a dependency graph, detects the framework and
stack, and exposes `retrieve(intent)`. It emits facts and never prose. **Consumers** write
the prose: the report writer, then the chat loop.

Each subsystem write-up runs one bounded loop — select anchor files with a zero-token
tiered cascade, assemble a packet of real code spans, one model call to explain it, then a
deterministic gate that verifies every citation against the packet we sent. Confidence
comes from which tier fired, not from the model's opinion of itself.

Whole output is cached against the commit SHA, so the tenth viewer of a repo pays nothing.

Details in [ADR-001](docs/adr/001-Initial-Architecture.md). Don't re-derive them from the
code — the ADR records the *why*, which the code can't.

---

## What's next

Not the product. The design rests on one unproven assumption — that the selection cascade
picks the right files — and everything downstream is capped by it. So the next build is
the smallest thing that tests it: the file-picker, run against 10 hand-labelled real repos
in a measuring loop. No LLM, no UI, no database, no queue.

Full plan: "Future work — the validation harness" in
[ADR-001](docs/adr/001-Initial-Architecture.md).

---

## Development

```bash
bun install          # also installs the git hooks
bun run dev
bun test
bun run typecheck
bun run docs:check   # fails if generated doc blocks have drifted
```

Bun + Turborepo. Feature work happens on `feat/{name}`, never on `main`.

Scaffold install notes and hook customization: [SETUP.md](SETUP.md).
