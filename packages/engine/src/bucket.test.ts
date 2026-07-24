import { describe, expect, test } from "bun:test";
import { bucket } from "./bucket.js";
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
