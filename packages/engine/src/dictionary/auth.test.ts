import { describe, expect, test } from "bun:test";
import { handRolledAuth } from "../__fixtures__/hand-rolled-auth.js";
import { matchAuthVocabulary } from "./auth.js";

describe("matchAuthVocabulary — tier 2 dictionary (T-13)", () => {
  test("selects files whose content carries several distinct auth terms and rejects a single incidental mention", () => {
    const matched = matchAuthVocabulary([...handRolledAuth.files], (path) => {
      const content = (handRolledAuth.contents as Record<string, string>)[path];
      if (content === undefined) {
        throw new Error(`no fixture content for ${path}`);
      }
      return content;
    });

    expect(matched).toContain("lib/auth.ts");
    expect(matched).toContain("lib/session.ts");
    expect(matched).not.toContain("lib/analytics.ts");
  });
});
