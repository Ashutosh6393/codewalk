import { describe, expect, test } from "bun:test";
import { buildGraph, fanIn } from "./graph.js";

/**
 * `alias-repo` is a real on-disk fixture repo (not an object-literal fixture like the
 * ones in ignore/bucket): dependency-cruiser resolves imports off the filesystem and a
 * `tsconfig.json`, so the alias it needs to prove out has to actually exist on disk.
 *
 * The tree also carries the shape T-11 needs (3 files import `lib/db.ts`) so that task
 * adds no new fixture — this test only asserts the alias resolves to the real file.
 */
const FIXTURE_ROOT = `${import.meta.dir}/__fixtures__/alias-repo`;

describe("buildGraph — dependency-cruiser adapter (T-10)", () => {
  test("T-10: resolves a tsconfig `@/*` alias import to the real target file", async () => {
    const graph = await buildGraph(FIXTURE_ROOT);
    // Normalise to POSIX separators — this repo runs on Windows, and a path-separator
    // mismatch is not a legitimate reason for this assertion to fail.
    const edges = graph.edges.map((edge) => ({
      from: edge.from.replaceAll("\\", "/"),
      to: edge.to.replaceAll("\\", "/"),
    }));

    // The edge must resolve to the real file dependency-cruiser found on disk...
    expect(edges).toContainEqual({ from: "app/api/auth/route.ts", to: "lib/db.ts" });

    // ...never left as the unresolved `@/lib/db` specifier from the source text.
    expect(edges.some((edge) => edge.to.startsWith("@/"))).toBe(false);
  });
});

describe("fanIn — T-11", () => {
  test("counts distinct importers of lib/db.ts as 3, and omits a file nobody imports", async () => {
    const graph = await buildGraph(FIXTURE_ROOT);

    const counts = fanIn(graph);

    // `lib/db.ts` is imported by lib/session.ts, middleware.ts, and app/api/auth/route.ts —
    // fan-in counts distinct importing files, not import statements.
    expect(counts.get("lib/db.ts")).toBe(3);

    // A file with no importers must not appear as a zero entry or otherwise — the map is
    // keyed only by files that are actually depended on, which is what `clusterRemainder`
    // (bucket.ts) expects when it does `opts.fanIn?.get(file) ?? 0`.
    expect(counts.has("app/api/auth/route.ts")).toBe(false);
  });
});
