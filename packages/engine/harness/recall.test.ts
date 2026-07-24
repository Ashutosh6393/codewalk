import { describe, expect, test } from "bun:test";
import { nextAuthClean } from "../src/__fixtures__/next-auth-clean.js";
import { select } from "../src/select.js";
import { scoreRecall } from "./recall.js";

describe("scoreRecall — anchor recall diff (T-04)", () => {
  test("computes hits, misses, extras, precision, and recall", () => {
    const labelled = ["middleware.ts", "app/api/auth/[...nextauth]/route.ts"];
    const selected = ["middleware.ts", "lib/db.ts"]; // one hit, one extra, one miss
    const r = scoreRecall(selected, labelled);
    expect(r.hits).toEqual(["middleware.ts"]);
    expect(r.misses).toEqual(["app/api/auth/[...nextauth]/route.ts"]);
    expect(r.extras).toEqual(["lib/db.ts"]);
    expect(r.recall).toBeCloseTo(0.5);
    expect(r.precision).toBeCloseTo(0.5);
  });

  test("perfect selection scores recall and precision 1", () => {
    const r = scoreRecall(["a.ts", "b.ts"], ["a.ts", "b.ts"]);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.misses).toEqual([]);
    expect(r.extras).toEqual([]);
  });

  test("no labels and no selection is a vacuous pass", () => {
    const r = scoreRecall([], []);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
  });
});

describe("walking skeleton: select -> recall on the clean next-auth fixture (T-04)", () => {
  test("tier-1 selection scores full recall against the hand label", () => {
    const result = select("auth", {
      files: [...nextAuthClean.files],
      manifest: nextAuthClean.manifest,
    });
    const r = scoreRecall(result.anchors, [...nextAuthClean.expectedAuthAnchors]);
    expect(r.recall).toBe(1);
    expect(r.misses).toEqual([]);
  });
});
