import { describe, expect, test } from "bun:test";
import { bucket, clusterRemainder } from "./bucket.js";
import { mixedTree } from "./__fixtures__/mixed-tree.js";

// The auth anchors selection would claim in the mixed tree (T-06 input).
const classified = ["middleware.ts", "app/api/auth/[...nextauth]/route.ts"];

describe("bucket — coverage ledger (T-06, T-07, T-08)", () => {
  test("T-06: a file claimed by selection lands in `classified`", () => {
    const ledger = bucket([...mixedTree.kept], classified);
    expect(ledger.classified).toEqual(classified);
  });

  test("T-07: test/config/style/entrypoint files land in `known-category`", () => {
    const ledger = bucket([...mixedTree.kept], classified);
    expect(ledger.knownCategory).toContain("middleware.test.ts"); // test
    expect(ledger.knownCategory).toContain("next.config.js"); // config
    expect(ledger.knownCategory).toContain("styles/globals.css"); // style
    expect(ledger.knownCategory).toContain("app/page.tsx"); // entrypoint
    expect(ledger.knownCategory).toContain("app/layout.tsx"); // entrypoint
    // genuine-unknown source is NOT hidden as a known category
    expect(ledger.unknown).toEqual(["lib/db.ts", "lib/utils.ts"]);
  });

  test("T-08: coverage = (classified + known-category) / total kept", () => {
    const ledger = bucket([...mixedTree.kept], classified);
    // 2 classified + 5 known-category over 9 kept
    expect(ledger.coverage).toBeCloseTo(7 / 9, 10);
  });
});

describe("clusterRemainder — surface signal, not noise (T-09)", () => {
  const unknown = [
    "lib/helpers/format.ts", // lone, low fan-in → must stay hidden
    "services/billing.ts", // ┐
    "services/invoice.ts", // ├─ a ≥3-file unknown folder → surfaces as a cluster
    "services/tax.ts", // ┘
    "lib/db.ts", // lone but high fan-in → surfaces individually
  ];
  const fanIn = new Map<string, number>([
    ["lib/helpers/format.ts", 1],
    ["services/billing.ts", 1],
    ["services/invoice.ts", 0],
    ["services/tax.ts", 1],
    ["lib/db.ts", 8],
  ]);

  test("T-09: a cluster surfaces, a lone util does not, a high-fan-in single does", () => {
    const surfaced = clusterRemainder(unknown, { fanIn });
    const surfacedFiles = surfaced.flatMap((c) => c.files);

    expect(surfacedFiles).not.toContain("lib/helpers/format.ts");

    const cluster = surfaced.find((c) => c.reason === "cluster");
    expect(cluster?.files).toEqual([
      "services/billing.ts",
      "services/invoice.ts",
      "services/tax.ts",
    ]);

    const single = surfaced.find((c) => c.reason === "high-fan-in");
    expect(single?.files).toEqual(["lib/db.ts"]);
  });

  test("with no fan-in data, only clusters surface", () => {
    const surfaced = clusterRemainder(unknown);
    expect(surfaced.map((c) => c.reason)).toEqual(["cluster"]);
  });
});
