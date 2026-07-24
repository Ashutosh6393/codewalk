import { describe, expect, test } from "bun:test";
import { nextAuthClean } from "./__fixtures__/next-auth-clean.js";
import { select } from "./select.js";

describe("select('auth') — tier 1 (T-02, T-03, T-16)", () => {
  test("T-02: selects Next.js convention auth anchors with high confidence", () => {
    const result = select("auth", {
      files: [...nextAuthClean.files],
      manifest: nextAuthClean.manifest,
    });
    expect(result.anchors).toContain("middleware.ts");
    expect(result.anchors).toContain("app/api/auth/[...nextauth]/route.ts");
    expect(result.confidence).toBe("high");
    expect(result.provenance.tier).toBe(1);
  });

  test("T-03: a route imported by nobody (fan-in 0) is still selected by the playbook", () => {
    const fanIn = new Map<string, number>([
      ["app/api/auth/[...nextauth]/route.ts", 0],
    ]);
    const result = select("auth", {
      files: [...nextAuthClean.files],
      manifest: nextAuthClean.manifest,
      fanIn,
    });
    expect(result.anchors).toContain("app/api/auth/[...nextauth]/route.ts");
    expect(result.provenance.tier).toBe(1);
  });

  test("T-16: provenance records tier, framework, and named anchors", () => {
    const result = select("auth", {
      files: [...nextAuthClean.files],
      manifest: nextAuthClean.manifest,
    });
    expect(result.provenance.framework).toBe("next");
    expect(result.provenance.tier).toBe(1);
    expect(result.provenance.anchors.length).toBeGreaterThan(0);
  });
});
