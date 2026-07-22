# ADR: GitHub Repository Visualizer — System Architecture

- **Status:** Accepted — v1 design baseline
- **Date:** 2026-07-16 · revised 2026-07-17 (design deep-dive: report layering, token strategy, retrieval cascade, trust seams)
- **Scope:** Architecture for v1. Numbers (cost, rate limits, exact storage) are deferred to prototype measurement.

---

## Context

We are building a tool that takes a public GitHub repository, analyzes it without running its
code, and shows a newcomer how the project is built: its structure, tech stack, entry point,
how to clone/contribute, and — the hard part — plain-language write-ups of its subsystems
(auth, storage, caching, etc.). A "chat with the codebase" feature sits alongside the report.

The primary user is **someone new to a repo** who wants to orient fast, either to understand
its patterns/architecture or to decide whether and how to contribute.

The feature list splits cleanly into an *easy half* (file/folder graph, tech stack, clone
instructions, entry point — mostly mechanical parsing) and a *hard half* (explaining an
arbitrary subsystem's architecture — deep code comprehension). The hard half is what makes
the product worth using and also where it can most easily lie to users. The architecture
below is organized to make the hard half tractable and trustworthy.

**Scale & calibration.** This is a **solo build serving real users** — the combination that sets
the calibration. Solo means the maintenance and money budgets are tiny and there is nobody to
babysit a meltdown; real users means the safety rails stay on. So we *keep* the cheap
self-protection (D-11 size ceiling, D-12 one-job-per-commit — these save the operator, not just
servers) and *cut* the elastic worker-pool framing of D-07 down to a fixed, small concurrency
cap with a queue. Same idea, a tenth of the machinery. The recurring discipline throughout is:
every trust mechanism must be **deterministic and free** (zero model tokens), because that is the
only way a cost-sensitive solo build can afford to be trustworthy.

## Decision drivers

- **Trust over polish.** A confident, wrong architecture diagram loses a user permanently.
  Every claim must be verifiable.
- **Depth over breadth.** Be excellent on a narrow slice before expanding.
- **Reuse without premature generalization.** Keep a clean seam for a future reusable engine,
  but do not build generality that no second product yet demands.
- **Calibrate to real scale.** No hyperscale machinery, no vector DB we don't need, no
  code-execution sandbox. Match the solution to the actual job.

---

## Decisions

Each decision lists its rationale, the alternatives considered, and the consequence (tradeoff)
we accept. They were resolved top-down; later decisions depend on earlier ones.

### D-01 — Scope: JavaScript/TypeScript repos only, for the newcomer/contributor
- **Decision:** Support only JS/TS projects in v1. Primary user is someone new to a repo who
  wants to understand it or contribute.
- **Why:** One language family lets us build per-framework playbooks (Next.js, Express, NestJS,
  …), which is the single biggest quality lever. "Any language" means a shallow job everywhere
  and a great job nowhere.
- **Alternatives:** Any-language support (shallow, generic). A wide-but-shallow tier where only
  the file graph / tech stack work broadly.
- **Consequence:** Users whose projects are in other languages bounce. That is the price of
  being genuinely good at something.

### D-02 — The deep architecture explanation is core, not optional
- **Decision:** Treat subsystem architecture write-ups as a core, must-ship feature.
- **Why:** It is the feature that differentiates the product. The file graph and tech stack are
  table stakes that every similar toy already ships.
- **Alternatives:** Ship the easy half broadly and label deep architecture as "best-effort."
- **Consequence:** We cannot quietly drop the hardest feature when it gets difficult. We walk
  in with eyes open.

### D-03 — Retrieval via a dependency graph + signals + graph-walk (not vector search)
- **Decision:** Before any AI reads code, deterministically build a dependency graph (which
  file imports/uses which). To explain a subsystem: detect it via cheap signals (manifest
  entries like `next-auth`/`redis`/`prisma`, folder names), then walk the graph outward from
  those anchors to gather only the handful of files that implement it. Feed that bounded set to
  the model with a requirement to cite file and line.
- **Why:** Architecture is about how files are *wired together*. The dependency graph captures
  wiring exactly; embeddings capture what code *talks about* and miss the silent glue file.
  The graph is also the backbone of the whole product — the file graph, entry-point detection,
  tech stack, and subsystem-finding all fall out of the same parse.
- **Alternatives:** Feed the whole repo to a big-context model (doesn't scale, worse quality on
  large inputs). Vector search / RAG (good for "find code about X," weak for "explain how X is
  built").
- **Consequence:** Static parsing is blind to dynamically wired code — framework magic
  (decorators, dependency injection, file-based routing, auto-discovery) and hand-rolled
  systems with no recognizable library. Those cases fall back to a broader chunk and are
  labeled low-confidence; we never claim "no system found."

### D-04 — Buy module resolution; build the graph logic and framework playbooks
- **Decision:** Use an existing tool (e.g. `dependency-cruiser`, or lighter `madge`) for JS/TS
  parsing + module resolution, including path aliases and monorepo workspaces. Use `tree-sitter`
  directly only for finer-grained symbol/doc-comment extraction. Build the graph rollups and
  framework playbooks ourselves.
- **Why:** Correct JS/TS module resolution (turning `@/lib/auth` into a real file via
  `tsconfig`) is a swamp of edge cases and zero user-visible differentiation. The playbooks are
  our actual edge.
- **Alternatives:** Hand-roll the resolver (weeks of work, no value).
- **Consequence:** We depend on an external tool's resolution behavior and its limits.

### D-05 — Engine ↔ consumers boundary
- **Decision:** The reusable **engine** exposes exactly two things: (1) a structured model of
  the repo (dependency graph, framework, entry points, tech stack, config/infra facts, symbol
  tags, git stats), computed once and cached per commit; and (2) a `retrieve(intent)` function
  returning ranked code chunks with citations. Everything that *writes* — the report, the chat
  loop, any future security/docs product — lives **outside** as a consumer. The report writer
  is consumer #1; the chat loop is consumer #2. Rule of thumb: **facts inside, narrative
  outside.**
- **Why:** An engine is only reusable if its output leaks no single product's needs. The list
  of report sections is a product opinion, not an engine fact (a security auditor would ask for
  a different list). Reusable engines are *extracted* once a second real product demands them —
  not designed up front against imaginary consumers. We build the seam, not the surface.
- **Alternatives:** Build a configurable, general engine now (guessing at future needs, paying
  for unused flexibility). Let report-writing logic live inside the engine (turns it into a
  monolith that can't be reused).
- **Consequence:** Requires discipline: add no engine feature the chat product doesn't itself
  need today. `retrieve()` must be able to run against a live, incrementally-updated view later
  (for a future coding-agent consumer), so we avoid baking in a "frozen snapshot only"
  assumption — without building the incremental path now.

### D-06 — Chat: keyword + graph on code, embeddings only on prose files
- **Decision:** Chat retrieval uses fast keyword search (ripgrep) plus a graph-walk over code,
  and embeddings only for prose files (README, specs, `CLAUDE.md`, docs). No vector DB for
  code in v1.
- **Why:** Code is exact tokens — a question about login hits files containing `login`,
  `session`, `signIn`, `jwt`. Keyword search finds those better and cheaper than embeddings.
  This makes chat cheap enough to always offer, so we don't force a "report or chat" choice on
  the user; chat is always-on and warms up just behind the report.
- **Alternatives:** Embeddings-first for all code (slower and pricier ingest, must embed the
  whole repo before the user can chat).
- **Consequence:** Weaker on "vague concept, no matching word" questions (e.g. asking about
  "abuse prevention" when the code says `rateLimiter`). Embeddings become a quality upgrade
  added only if real usage shows keyword search failing.

### D-07 — Background job model: queue + workers + status channel + commit-SHA cache
- **Decision:** On submit, create a job and return instantly with an ID. A separate worker pool
  consumes the queue and runs the engine. The browser polls/streams for status. The engine's
  output is cached against the exact commit SHA.
- **Why:** The work is slow and bursty; synchronous web requests time out (~30–60s) and one big
  repo would block everyone. The queue also buys retries and rate-limiting. Commit-SHA caching
  is the biggest cost lever — the tenth viewer of a repo at the same commit pays nothing.
- **Alternatives:** Synchronous processing in the request (fine for a demo, falls over on the
  first real repo).
- **Consequence:** More infrastructure (queue, worker process, status channel) and more states
  to design for (queued, cloning, analyzing, partial, failed). The report is a snapshot that
  goes stale on a new commit, which we solve by re-analyzing per commit.

### D-08 — First-viewer UX: stream sections + a live "what the engine is doing" checklist
- **Decision:** Stream each report section as it completes. Show a live checklist of engine
  progress ("cloning… mapping 428 files… detecting framework: Next.js… writing auth…"). Report
  streams first; chat lights up a few seconds later once the parse and prose embeddings finish.
- **Why:** The first viewer of any repo always eats the full analysis time (no cache yet).
  Progress-as-content turns the unavoidable wait into trust — the user watches the engine be
  competent.
- **Alternatives:** A single spinner until everything is done (dead, opaque feel).
- **Consequence:** We must design and expose partial/streaming states end to end.

### D-09 — File graph: folder-level, expand-on-click, and a supporting actor
- **Decision:** The default graph view collapses to top-level folders, with folder-to-folder
  dependency weight shown; the user expands a folder on click to drill down. The primary view
  is a ranked "start here" tour driven by fan-in (how many files import a given file); the full
  flat graph lives behind a "nerd mode" toggle.
- **Why:** A full flat graph of hundreds of files is an unreadable hairball — the most common
  way these projects fail. The user's real question is "how is this organized and where do I
  start?", which is about hierarchy and importance, not every edge. Folder rollups are cheap;
  we already have the file graph.
- **Alternatives:** Full force-directed graph as the hero (hairball). Graph-as-star instead of
  the guided tour.
- **Consequence:** We lose the "look at all of it" wow moment and must compute folder-level
  dependency rollups.

### D-10 — Buy the graph renderer
- **Decision:** Use an existing graph library (Cytoscape.js or React Flow) for nodes, edges,
  zoom, pan, and expand/collapse.
- **Why:** Rendering is solved. Our value is *what* we feed the renderer (the rolled-up, ranked
  graph), not the rendering itself.
- **Alternatives:** Hand-roll a graph renderer (weeks of pain, no differentiation).
- **Consequence:** Dependency on a rendering library's API and constraints.

### D-11 — Hard size ceiling with a subfolder escape hatch
- **Decision:** Set a hard ceiling on file count and total size, checked via the GitHub API
  **before** cloning. Over the line, refuse immediately and offer a partial analysis
  ("analyze just `src/`?").
- **Why:** The first person to submit a huge repo must not be able to tie up a worker for
  twenty minutes. The subfolder offer turns a hard "no" into a useful partial "yes."
- **Alternatives:** No limit (worker meltdown on the first large repo).
- **Consequence:** Very large repos are only ever partially analyzed.

### D-12 — One job per commit, ever
- **Decision:** Concurrent requests for the same uncached commit coalesce onto a single job.
  The first request creates it; the rest wait on it and all receive the result.
- **Why:** Otherwise a trending repo hit by thousands of users simultaneously spins up thousands
  of workers all analyzing the identical commit — a self-inflicted denial of service.
- **Alternatives:** Naive per-request jobs (self-DoS).
- **Consequence:** Slight coordination complexity (request coalescing / job deduplication).

### D-13 — Never execute repository code; static analysis only
- **Decision:** Only ever read files. Never run the repo's install/setup step or any of its
  code.
- **Why:** Running a project's install step can automatically execute code the repo's author
  wrote (e.g. install scripts) on our servers — a stranger's code, thousands of times a day,
  from unvetted repos. That code could read secrets, mine crypto, or attack from our
  infrastructure.
- **Alternatives:** Run the install step inside a locked-down, network-less, secret-less,
  time/memory-limited disposable sandbox for slightly better import resolution into
  `node_modules`. Rejected for v1: enormous risk and cost for a marginal quality bump on a
  secondary concern.
- **Consequence:** We lose some resolution accuracy at the edges (following imports *into*
  third-party libraries). Resolving imports within the repo's own code — what the architecture
  and graph features actually need — works fine without installing anything.

---

### Design deep-dive (2026-07-17): report layering, token strategy, retrieval cascade, trust seams

These decisions refine the engine core (D-03/D-05) after working the retrieval and cost
mechanics end to end. They resolve the original "accuracy & trust mechanics" open question.

### D-14 — Report = a facts layer (0 LLM) + a narrative layer; the narrative is shared with chat
- **Decision:** Split every report into a *facts layer* — tech stack, code-quality signals, file
  graph, config facts, git stats, feature *detection* — computed by parsing with zero model
  calls, and a *narrative layer* — what the repo does, the architecture overview, each subsystem
  write-up — produced by `retrieve()` + one explanation call. The narrative layer is the *same*
  engine path chat uses.
- **Why:** The cheap-vs-hard line does not run *between* report and chat; it runs *through both*.
  "Architecture overview" as a heading is a parse job; the paragraph a newcomer actually reads is
  deep comprehension (D-02). Naming the layers stops us mislabeling the hard half as cheap — and
  it turns out the tame-looking chat items (how to contribute, run locally, CI/CD) are the *cheap*
  half (one known file each), while the real chat questions ("how does auth work here") share the
  report's priciest path.
- **Alternatives:** Treat the report as uniformly cheap ("just parse a few files") — collapses the
  moment a section needs comprehension.
- **Consequence:** A "section" is two kinds of work with two costs; the report writer assembles
  facts and narrative from different sources.

### D-15 — Token strategy: ship the free-lunch levers, defer the quality-trading dials
- **Decision:** Cut tokens with levers that *also* improve quality/latency: (a) assemble
  facts-layer sections with no model call; (b) make one explanation call *per detected subsystem*
  only; (c) send tree-sitter-extracted spans, not whole files; (d) prompt-cache the static
  playbook/system prefix across a report's bursty calls. Defer the levers that trade quality for
  tokens — batching several subsystems into one call, skeletonizing peripheral files, model
  tiering — until a prototype has measured real cost.
- **Why:** Input tokens are code and dominate the bill; output is rounding error. The free-lunch
  levers remove code that never needed sending and *sharpen* the explanation. The dials trade
  explanation quality on the value-critical path and must not be pulled before measurement.
- **Alternatives:** Optimize aggressively up front (batching/tiering now) — premature; risks
  degrading the differentiator to save money we haven't measured.
- **Consequence:** v1 cost is bounded but not minimal — roughly 4–7 calls per fresh repo, driven
  by subsystem count. That number *is* the product, not a leak to optimize away.

### D-16 — Retrieval is pre-computed, not agentic
- **Decision:** The engine pre-computes an index (graph, AST/symbols, keyword positions) and hands
  the explanation call a bounded packet. It does **not** hand the model a fetch tool and let it
  roam the codebase to assemble its own context.
- **Why:** The index *replaces the model's search loop* — the expensive part. Agentic roaming
  ("just-in-time" retrieval) multiplies model round-trips and, because the API is stateless,
  re-sends a growing context each hop: superlinear, unpredictable cost, hard to test. Anthropic's
  context-engineering guidance lands on a *hybrid* — retrieve up front for speed, explore only at
  the model's discretion — and a solo, cost-sensitive build takes the "retrieve up front" half and
  declines exploration on purpose. A repo at a frozen commit is exactly the non-dynamic content
  where pre-computed retrieval is safe.
- **Alternatives:** Fully agentic retrieval (model greps its own files) — highest-token,
  least-predictable option; the opposite of the cost goal.
- **Consequence:** Answer quality is capped by how well selection picks files up front; when
  selection misses, we label low-confidence rather than let the model wander. The index drives
  *selection*; the explanation call still reads the real *code* of the selected spans — the graph
  replaces grep, not reading.

### D-17 — Selection is a deterministic tiered cascade; confidence = which tier fired
- **Decision:** Pick a subsystem's files with a 0-token cascade. **Tier 1** playbook anchors
  (known framework → named convention files, e.g. Next.js `middleware.ts`,
  `app/api/auth/**/route.ts`). **Tier 2** a per-subsystem keyword/symbol dictionary
  (`{jwt, session, cookie, hash, …}` for auth) when no playbook matches. **Tier 3** fan-in ranking
  as the no-playbook fallback. Playbook-named anchors **override** fan-in for known frameworks. Set
  section confidence from the tier that fired (tier 1 → high, tier 2 → medium, tier 3 → low). No
  model fetch-hatch / roaming in v1.
- **Why:** Playbook, keyword, and fan-in are not competitors — they're tiers of one cascade that
  *degrades* instead of failing. Fan-in silently *buries* framework-magic entry points (a route
  file is imported by nobody), so it must be the fallback, not the ranker, on known frameworks.
  Confidence-from-tier turns "trust over polish" into a mechanism instead of a promise.
- **Alternatives:** Fan-in as the primary ranker (betrays every convention-wired framework); a
  hard-capped model fetch-hatch (the one unpredictable-cost, hard-to-test piece; defends only the
  long tail — deferred behind data, re-add only if real usage shows no-vocabulary repos are common).
- **Consequence:** A repo whose subsystem uses no conventional vocabulary (auth in
  `lib/gatekeeper.ts`, no library string, low fan-in) can fall through to a generic, low-confidence
  answer — which we *label*, never hide.

### D-18 — Output contract: engine returns facts, the consumer writes prose; citations are commit-pinned permalinks
- **Decision:** `retrieve(intent)` returns a structured `RetrievalResult` — `confidence`,
  `provenance` (tier + named anchors + framework), `spans` (`path`, `startLine`, `endLine`,
  `blobSha`, `code`, optional `symbol`), a local `subgraph` (orientation only), and `facts` — and
  **no prose**. The consumer produces prose with inline `[path:line]` citations, each rendered as a
  **GitHub permalink pinned to the analyzed commit SHA**. The model cites the spans it actually
  read; keyword hits are for *selection*, never for *attribution*.
- **Why:** This is the D-05 boundary made concrete — facts inside, narrative outside — enforced by
  the schema rather than by discipline. `path:line` permalinks put every claim one click from its
  evidence with no opaque-ID layer to maintain. A citation minted from a keyword hit points at code
  that may not support the claim: an authoritative-looking lie, the exact failure driver #1 forbids.
- **Alternatives:** A rigid per-claim `claims[]` schema (v2 — inline is how the model writes and the
  user reads); opaque span IDs (needless translation layer).
- **Consequence:** Inline citation parsing is mildly brittle; mitigated by a strict output-format
  instruction and a tolerant parser.

### D-19 — Citation verification: a deterministic, packet-scoped guard
- **Decision:** After the model emits and before the user sees, check every inline `[path:line]`
  against the **packet that was sent** (not the whole repo): the path must be one we sent, the line
  must fall inside a sent span for that path, and within file bounds. On failure: strip the
  citation, keep the sentence, mark it unverified, downgrade the section's confidence, and log it.
  No re-cite retry in v1.
- **Why:** Citations coming *out* of the model can still be hallucinated; an unverified citation is
  the same lie one step later. The guard is string-and-range math over ground truth we already hold
  — the cheapest possible trust mechanism, zero model tokens. Packet-scoped is the correct scope: a
  citation to a file we never sent came from training priors, not the code.
- **Alternatives:** Retry once with failures fed back ("cite only from provided spans") — salvages
  quality but costs a call; a v2 lever for a cost-sensitive build.
- **Consequence:** Some true claims lose their citation and get flagged; a section whose
  failed-cite ratio crosses a threshold is itself downgraded. The threshold is read off
  measurement, not guessed.

### D-20 — Detection recall: a coverage ledger, so absence is explicit by subtraction
- **Decision:** Track coverage as the complement of the known file set. The **universe** = all
  files − ignored (honor the repo's `.gitignore` plus a standard always-ignore floor:
  `node_modules`, lockfiles, `dist`/`build`/`.next`, minified, `*.d.ts`, binary assets). Bucket
  every kept file as *classified* (a subsystem claimed it), *known-category* (test / config / style
  / entrypoint — accounted for, not a subsystem), or *genuine-unknown*. Surface the **remainder** =
  genuine-unknown, but only as *significant clusters* (≥N files sharing a folder or import-component,
  **or** any single file with high fan-in), plus a headline **coverage %** =
  (classified + known-category) ÷ total.
- **Why:** You can't label an absence you never detected — so don't look *for* misses, derive them
  by subtraction. Even a total detection miss leaves the files in the remainder, surfaced as "a
  module we couldn't classify," never as "no system found" (D-03's honesty promise, now mechanical).
  Bucketing keeps tests/config from unfairly tanking the score; clustering keeps lone util files
  from crying wolf; the fan-in override catches the small-but-critical orphan everyone imports.
- **Alternatives:** Detect-and-hope (silent omission by construction); an LLM pass to *name* the
  remainder (costs calls — v2; v1 surfaces it structurally and offers a chat prompt to explore it).
- **Consequence:** Three thresholds — the failed-cite ratio, the cluster size/fan-in cutoff, and the
  ignore-list defining the universe — are instrumented defaults awaiting one calibration run (see
  Future work), not values derivable from a chair.

---

## Architecture overview

Request path: **Browser → API server → Job queue + workers → Engine → Consumers**, with a
commit-SHA **Cache** beside the API server.

1. The browser submits a repo URL and then watches the report fill in.
2. The API server checks the cache for the exact commit. Hit → instant results. Miss → it
   enqueues a job (coalescing onto any existing job for that commit) and returns immediately.
3. A worker consumes the job and runs the engine once.
4. The **engine** (reusable black box) clones at the commit, parses and resolves imports to
   build the dependency graph, detects the framework and tech stack, tags symbols, extracts
   config/infra facts and git stats, embeds the prose files, and exposes `retrieve(intent)`.
   Its whole output is cached against the commit.
5. **Consumers** read from the engine: the report writer (consumer #1) fills its known list of
   sections by calling `retrieve()` per section and streaming each as it completes; the chat
   loop (consumer #2) answers user questions with citations.

### Inside one subsystem write-up (the narrative path)

For each *detected* subsystem the report writer runs one bounded loop — chat reuses steps 1–4
for a live question:

1. **Select** (0 tokens) — the tiered cascade (D-17) picks anchor files: playbook → keyword/symbol
   → fan-in.
2. **Assemble the packet** — facts + a local subgraph (orientation) + the real tree-sitter spans of
   the anchors. Structure frames it; code grounds it.
3. **Explain** — one model call turns the packet into prose with inline `[path:line]` citations
   (D-18).
4. **Trust gate** (0 tokens) — verify every citation against the sent packet (D-19) and set the
   section's confidence from the tier that fired (D-17).
5. **Account** — the files this subsystem touched are marked *claimed*; whatever is left feeds the
   coverage ledger (D-20), so an unmapped module surfaces as "couldn't classify," never as absent.

The report is the sum of these per-subsystem loops plus the parsed facts layer.

## Open questions (unresolved, roughly in the order they will bite)

- **Threshold calibration** *(was: accuracy & trust mechanics — the mechanics are now decided in
  D-18/D-19/D-20).* Three numbers remain, and none is derivable from a chair: the failed-cite ratio
  that downgrades a whole section, the cluster size/fan-in cutoff for surfacing a remainder, and the
  ignore-list that defines the universe. *Settles at the validation harness (Future work).*
- **Private repos & GitHub auth.** Public-only for v1, or user-connected GitHub? Auth pulls in
  token storage, permissions, and a bigger trust boundary. *Settles by a product call on who
  the first users are.*
- **Storage: what and where.** The cached artifact (structured model + written report) —
  typically a blob store for the large JSON plus a small database for job status and repo
  metadata, but unspecified. *Settles by measuring the artifact's real size.*
- **Framework playbooks.** Which frameworks ship first (Next.js almost certainly #1) and what
  each playbook encodes. *Settles by writing one playbook end to end.*
- **Cost & rate-limit numbers.** AI calls per report, token budget per repo, per-user
  submission limits. *Settles by running real repos through a prototype and measuring.*
- **Chat memory across turns.** Conversation state and a strategy for follow-ups
  ("show me more"). *Settles by designing consumer #2 in detail.*

## Future work — the validation harness (do this next)

The whole design rests on one unproven assumption: **the selection cascade (D-17) reliably picks
the right files.** Everything downstream — explanation quality, cost, trust — is capped by it. So
the next build is *not* the product; it is the smallest slice that tests that assumption: the
file-picker, run in a measuring loop, with no LLM, no UI, no database, no queue. The harness *is*
the first version of the engine's selection path, pointed at real repos instead of a webpage.
There is no shortcut that tests nothing — the selection code has to exist first; the "harness" is
just the cheap wrapper (label a list, run a loop, diff two lists) around it.

1. **Pick 10 real Next.js repos, deliberately spread:** 3–4 clean `next-auth` (tier-1 should nail
   these), 2–3 hand-rolled auth with no library string (forces tier-2), 1–2 with auth in an odd
   place / odd naming (stresses coverage), 1–2 with *no* auth (does the engine say "none found"
   instead of inventing it?).
2. **Hand-label the correct auth anchor files per repo, before running anything.** That labelled
   set is ground truth; without it there is no recall number.
3. **Build the universe/bucketing first (D-20's denominator).** Clone at SHA, apply the
   ignore-list, bucket every file. Eyeball coverage % on all 10 — wrong bucketing is visible at a
   glance.
4. **Build the auth cascade (tiers 1→2→3) and measure anchor recall** against the hand labels.
   Log per repo: tier fired, files selected, hit/miss vs ground truth, confidence emitted.
5. **Read the three thresholds off the logs** (D-19/D-20): the cite-failure valley, the cluster
   cutoffs, the bucket rules. They are instrumented defaults, not guesses.

Deliberately **not** in the harness: the LLM explanation call. Selection recall is measurable
without it — you're checking whether the right *files* got picked, which is pure retrieval. Add
the model call only once recall is good; debug selection in isolation first, where the failure
signal is cleaner and cheaper.

**Definition of done:** anchor recall on the 10 repos is high enough to trust, and the three
thresholds have real values. If recall leaks, the log shows exactly which tier and which repo — a
concrete bug, not a hypothetical.

## Deliberately not built (calibration)

- **No vector database in v1** — keyword + graph covers code; only a few prose files are
  embedded.
- **No code-execution sandbox** — static analysis only.
- **No full flat force-directed graph as the primary view** — folder rollups instead.
- **No hyperscale machinery** — the design is sized to the actual job.
- **No agentic retrieval loop** — selection is pre-computed; the model synthesizes from a packet,
  it does not roam the codebase (D-16).
- **No model fetch-hatch in v1** — the cascade degrades to low-confidence instead; the hatch is the
  only unpredictable-cost piece and defends only the long tail (D-17).
- **No citation re-cite retry in v1** — failed citations are stripped, flagged, and logged, not
  re-requested (D-19).
- **No LLM naming of unclassified clusters** — the coverage remainder is surfaced structurally;
  naming is a v2 upgrade (D-20).
- **No elastic worker pools** — a fixed, small concurrency cap fits a solo build (calibration of
  D-07).
