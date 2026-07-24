import { describe, expect, test } from "bun:test";
import { mixedTree } from "./__fixtures__/mixed-tree.js";
import { keptUniverse } from "./ignore.js";

describe("keptUniverse — ignore-list + universe (T-05)", () => {
  test("T-05: drops node_modules, lockfile, build dir, .d.ts, binary, and .gitignore entries", () => {
    const kept = keptUniverse([...mixedTree.files], mixedTree.gitignore);
    expect(kept).toEqual([...mixedTree.kept]);
  });

  test("with no .gitignore, applies the always-ignore floor only", () => {
    const kept = keptUniverse(["node_modules/x.js", "bun.lock", ".env", "lib/db.ts"]);
    // .env survives without a .gitignore telling us to drop it; the floor still drops the rest.
    expect(kept).toEqual([".env", "lib/db.ts"]);
  });
});
