import { describe, expect, test } from "bun:test";
import { buildGraph } from "./graph.js";

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
