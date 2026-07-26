import { describe, expect, test } from "bun:test";
import { bucket } from "./bucket.js";
import { nextAuthClean } from "./__fixtures__/next-auth-clean.js";
import { noAuth } from "./__fixtures__/no-auth.js";
import { select } from "./select.js";

/** Content reader shared by fixtures that carry a `contents` map. */
function readFileFrom(contents: Record<string, string>) {
  return (path: string) => {
    const content = contents[path];
    if (content === undefined) {
      throw new Error(`no fixture content for ${path}`);
    }
    return content;
  };
}

describe("select('auth') — honest 'none found' (T-15)", () => {
  test("a repo with no auth signal at all returns empty anchors and hasAuth=false, even with tempting fan-in data", () => {
    const result = select("auth", {
      files: [...noAuth.files],
      manifest: noAuth.manifest,
      readFile: readFileFrom(noAuth.contents),
      fanIn: noAuth.fanIn,
    });

    // Tier 3 must not invent an anchor from fan-in alone when there is no weak repo-level
    // auth signal (no path/content match anywhere) to gate it on. D-20: honest absence.
    expect(result.anchors).toEqual([]);
    expect(result.hasAuth).toBe(false);
    expect(result.confidence).toBe("low");
    expect(result.provenance.tier).toBe(3);

    // "Couldn't classify," never "no system found" (D-20): the repo's real source files
    // still land in the coverage ledger's remainder rather than vanishing.
    const ledger = bucket([...noAuth.files], result.anchors);
    for (const sourceFile of [
      "lib/db.ts",
      "lib/analytics.ts",
      "lib/notifications.ts",
      "app/dashboard.ts",
      "app/settings.ts",
      "app/profile.ts",
      "app/reports.ts",
    ]) {
      expect(ledger.unknown).toContain(sourceFile);
    }
    expect(ledger.coverage).toBeLessThan(1);
  });

  test("a repo where auth is found reports hasAuth=true (guards against hasAuth being hardcoded false)", () => {
    const result = select("auth", {
      files: [...nextAuthClean.files],
      manifest: nextAuthClean.manifest,
    });

    expect(result.hasAuth).toBe(true);
    expect(result.anchors.length).toBeGreaterThan(0);
  });
});
