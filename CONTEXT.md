# CONTEXT.md — CodeWalk

What we're building and why. Read this first in any session.

This file answers *what problem exists and for whom*. It does not describe folder
structure, file names, or APIs — those live in the code and go stale here.

---

## In one sentence

CodeWalk takes a public JavaScript/TypeScript GitHub repo and shows someone new to it how
the project is built — structure, stack, entry points, and plain-language write-ups of its
subsystems — with every claim linked to the line of code it came from.

## The problem

Landing in an unfamiliar repo costs hours before you can make a single useful change. The
README says what the project *is*, not how it's wired. Existing tools stop at the
mechanical half — a file graph, a dependency list — which is the half you could have
worked out yourself. Nobody explains how *auth* works in *this* repo.

The tools that do attempt explanation have a worse failure mode: they generate a confident,
plausible, wrong architecture summary. A newcomer has no way to tell that from a right one,
and by the time they find out they've built on a misunderstanding.

## Who uses it

| User | What they're trying to do | What they care about |
|---|---|---|
| Newcomer to a repo | Orient fast — how is this organized, where do I start reading | Speed, and not being misled |
| Prospective contributor | Decide whether and how to contribute; find where a change would go | Trust, accuracy of the subsystem write-ups |
| Operator (solo maintainer) | Keep it running without babysitting it | Cost per repo, no meltdowns |

## What success looks like

- A newcomer reads the report and can name the entry point, the framework, and how one
  subsystem works — without opening the repo first.
- Every claim in a narrative section carries a citation that points at code which actually
  supports it. Wrong claims are labelled low-confidence, not shipped as fact.
- Where we *can't* explain something, the report says so. It never reports "no auth found"
  for a repo that has auth.
- Cost per fresh repo stays bounded and predictable; a repeat viewer of the same commit
  costs nothing.

---

## Domain language

The vocabulary of this project. Use these exact terms in code, tests, commits, and
conversation. If you find yourself inventing a synonym, use the term here instead — or
propose adding one.

| Term | Means | Does **not** mean |
|---|---|---|
| **Engine** | The reusable black box: builds the repo model and exposes `retrieve(intent)`. Emits facts, never prose. | The whole backend. The engine does not write reports. |
| **Consumer** | Anything that reads from the engine and writes output — the report writer (#1), the chat loop (#2). | A user. |
| **Facts layer** | Report content computed by parsing, zero model calls: tech stack, file graph, config facts, git stats, subsystem *detection*. | Anything cheap-looking. "Architecture overview" is a narrative section. |
| **Narrative layer** | Report content produced by `retrieve()` + one explanation call. Same engine path chat uses. | Free text. It is citation-bound and confidence-scored. |
| **Subsystem** | A detected concern within the repo — auth, storage, caching — that gets its own write-up. | A package or a folder. Subsystems cut across both. |
| **Playbook** | Per-framework knowledge encoding where a framework conventionally puts things (Next.js `middleware.ts`, `app/api/auth/**/route.ts`). | A prompt template. |
| **Anchor** | A file the selection cascade picks as implementing a subsystem. | Every file that mentions the subsystem. |
| **Cascade / tier** | The 0-token selection ladder: tier 1 playbook anchors → tier 2 keyword/symbol dictionary → tier 3 fan-in. | Alternatives we choose between. They degrade in order. |
| **Confidence** | Derived mechanically from which tier fired (1 → high, 2 → medium, 3 → low), then downgraded by failed citations. | A model self-assessment. The model never sets it. |
| **Packet** | The bounded input assembled for one explanation call: facts + local subgraph + real code spans. | The repo. The model sees only the packet. |
| **Span** | A `path` + line range + the actual code, extracted with tree-sitter. | A whole file. |
| **Trust gate** | The deterministic post-model check: every `[path:line]` citation must resolve inside the packet that was sent. | A review step. It is string-and-range math, zero tokens. |
| **Coverage ledger** | Bucketing every non-ignored file as classified / known-category / genuine-unknown, so misses surface by subtraction. | A test-coverage metric. |
| **Remainder** | The genuine-unknown files, surfaced as significant clusters. Shown as "couldn't classify". | Dead code. |
| **Fan-in** | How many files import a given file. Drives the "start here" ranking and the tier-3 fallback. | Importance in general — it buries convention-wired entry points. |

Ambiguous domain terms are the most common cause of an agent building the wrong thing
correctly. Add to this table whenever a misunderstanding surfaces.

---

## Boundaries

### We are building

- Repo analysis for **JavaScript/TypeScript only**, with per-framework playbooks.
- A report split into a facts layer (parsed) and a narrative layer (explained, cited).
- Subsystem architecture write-ups — the differentiating feature, not a stretch goal.
- A folder-level dependency graph with expand-on-click and a ranked "start here" tour.
- Always-on chat over the same retrieval path.
- Deterministic trust mechanics: tier-derived confidence, citation verification, coverage
  ledger.

### We are explicitly not building

- **Other languages** — one language family is what makes the playbooks possible.
- **A vector database for code** — keyword + graph covers it; only prose files are embedded.
- **A code-execution sandbox** — we never run a stranger's repo. Static analysis only.
- **Agentic retrieval** — no fetch tool, no roaming. Selection is pre-computed; the model
  synthesizes from a packet.
- **A model fetch-hatch** — the cascade degrades to low-confidence instead.
- **Citation retry** — failed citations are stripped, flagged, and logged.
- **LLM naming of the unclassified remainder** — surfaced structurally in v1.
- **Our own module resolver or graph renderer** — both bought, neither differentiates.
- **Elastic worker pools** — a fixed, small concurrency cap fits a solo build.

Second list matters more than the first. It is what stops scope creep from looking like
initiative.

---

## Constraints

| Constraint | Detail |
|---|---|
| Users / scale | Solo build serving real users. Bursty: one trending repo can arrive from thousands of viewers at once. Sized to the actual job, not hyperscale. |
| Cost | Model tokens are the bill and input dominates. Every trust mechanism must be deterministic and free — zero model tokens — or a solo build can't afford to be trustworthy. |
| Repo size | Hard ceiling on file count and total size, checked via the GitHub API before cloning. Over the line → refuse and offer a subfolder. |
| Safety | Never execute repository code. Reading files is the only permitted operation. |
| Team | One person. No one to babysit a meltdown; self-protection has to be built in. |
| Budget / deadlines | Tiny; no fixed deadline. Cost and rate-limit numbers are unmeasured — they settle at the prototype. |

---

## External systems

Things we depend on that we do not control.

| System | Used for | If it goes down |
|---|---|---|
| GitHub API | Size/file-count pre-check, commit SHA resolution, permalink targets | Can't accept new repos; cached commits still serve. Citations still render as links. |
| GitHub git (clone) | Fetching repo contents at a commit | Job fails with a retryable status; the queue retries. |
| LLM provider | The explanation call — the entire narrative layer | Facts layer still ships; narrative sections stream as unavailable rather than blocking the report. |
| Module resolution tool | JS/TS import resolution, path aliases, workspaces | Not a runtime dependency, but its resolution limits are our limits. |

---

## Current state

- **Stage:** prototype — pre-implementation
- **Live:** not yet
- **Users:** none yet
- **Next build:** the validation harness, not the product. It tests the one unproven
  assumption the whole design rests on — that the selection cascade picks the right files.
  See "Future work" in [`docs/adr/001-Initial-Architecture.md`](docs/adr/001-Initial-Architecture.md).

---

## Decisions

Architectural decisions are **not** recorded here. They live in [`docs/adr/`](docs/adr/).
This file describes the problem; ADRs record what we chose to do about it.
