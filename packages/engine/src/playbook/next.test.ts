import { describe, expect, test } from "bun:test";
import { detectFramework } from "./next.js";

describe("Next.js playbook — framework detection (T-01)", () => {
  test("detects Next.js from a manifest that depends on next", () => {
    const manifest = {
      dependencies: { next: "^15.0.0", "next-auth": "^5.0.0", react: "^19.0.0" },
    };
    expect(detectFramework(manifest)).toBe("next");
  });

  test("detects Next.js when next is a devDependency", () => {
    const manifest = { devDependencies: { next: "15.0.0" } };
    expect(detectFramework(manifest)).toBe("next");
  });

  test("returns unknown when there is no next dependency", () => {
    const manifest = { dependencies: { express: "^4.0.0" } };
    expect(detectFramework(manifest)).toBe("unknown");
  });

  test("returns unknown for an empty or missing manifest", () => {
    expect(detectFramework({})).toBe("unknown");
    expect(detectFramework(undefined)).toBe("unknown");
  });
});
