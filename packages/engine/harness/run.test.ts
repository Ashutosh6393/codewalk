import { describe, expect, test } from "bun:test";
import { confidenceForTier } from "../src/types.js";
import { Labels, runLabels } from "./run.js";

/**
 * `alias-repo` is the same real on-disk fixture `graph.test.ts` (T-10/T-11) exercises —
 * no `package.json`, so the manifest is absent and framework detection returns `unknown`
 * (T-01's `unknown` branch, not tier 1). It also has no `.env`/lockfile noise, so the
 * kept universe is exactly its five real files.
 *
 * Verified directly against `select()` before writing these assertions (not guessed):
 * none of `route.ts`/`session.ts`/`middleware.ts` carries 2+ distinct auth terms (tier 2's
 * floor), and neither `route.ts` nor `session.ts` — the only tier-3 candidates, since each
 * carries exactly one term via its path — is imported by anything (fan-in 0 for both), so
 * `rankByFanIn` (select.ts) drops them. The cascade honestly bottoms out at tier 3 with an
 * empty selection (D-20's "couldn't classify," never a manufactured anchor) rather than
 * partially matching a hand-picked label. That is what these assertions encode — a real
 * miss for every labelled anchor, not a fabricated hit.
 */
const FIXTURE_ROOT = `${import.meta.dir}/../src/__fixtures__/alias-repo`;

const posix = (p: string): string => p.replaceAll("\\", "/");

function validLabels(): Labels {
  return {
    repos: [
      {
        name: "alias-repo",
        url: "https://example.test/owner/alias-repo",
        sha: "a".repeat(40),
        category: "graph-fixture",
        hasAuth: false,
        anchors: ["lib/session.ts", "app/api/auth/route.ts"],
      },
    ],
  };
}

describe("Labels — labels.yaml ground-truth schema", () => {
  test("parses a well-formed labelled repo", () => {
    expect(() => Labels.parse(validLabels())).not.toThrow();
  });

  test("rejects an entry missing sha", () => {
    const bad = validLabels() as { repos: Array<Partial<Labels["repos"][number]>> };
    delete bad.repos[0]!.sha;
    expect(() => Labels.parse(bad)).toThrow();
  });

  test("rejects a sha that is not 40 hex characters", () => {
    const bad = validLabels();
    bad.repos[0]!.sha = "not-a-real-sha";
    expect(() => Labels.parse(bad)).toThrow();
  });
});

describe("runLabels — harness loop (T-17)", () => {
  test("T-17: logs one record per repo with tier, selected, hits/misses, confidence, and coverage%", async () => {
    const labels = validLabels();
    const records = await runLabels(labels, {
      clone: async () => FIXTURE_ROOT,
    });

    expect(records).toHaveLength(1);
    const record = records[0]!;
    if (record.status !== "ok") {
      throw new Error(`expected an ok record, got errored: ${JSON.stringify(record)}`);
    }

    // Tier is one of the three cascade tiers, and confidence is derived from *that* tier
    // via the single source of truth (types.ts) — never hardcoded or independently set.
    expect([1, 2, 3]).toContain(record.tier);
    expect(record.confidence).toBe(confidenceForTier[record.tier]);

    expect(Array.isArray(record.selected)).toBe(true);
    expect(record.selected.map(posix)).toEqual([]);

    // Ground truth for this repo has two labelled anchors; the cascade's honest
    // none-found result (see fixture note above) selects neither — both anchors are real
    // misses, and there are zero hits because nothing was selected. Hits + misses still
    // partitions the full labelled set.
    expect(record.hits).toEqual([]);
    expect(record.misses.map(posix).sort()).toEqual(
      ["lib/session.ts", "app/api/auth/route.ts"].sort(),
    );
    expect(record.hits.length + record.misses.length).toBe(labels.repos[0]!.anchors.length);

    expect(typeof record.coverage).toBe("number");
    expect(record.coverage).toBeGreaterThanOrEqual(0);
    expect(record.coverage).toBeLessThanOrEqual(1);
  });

  test("clone failure is recorded as errored and does not abort the run", async () => {
    const labels: Labels = {
      repos: [
        {
          name: "unreachable-repo",
          url: "https://example.test/owner/unreachable-repo",
          sha: "b".repeat(40),
          category: "graph-fixture",
          hasAuth: false,
          anchors: [],
        },
        {
          name: "alias-repo",
          url: "https://example.test/owner/alias-repo",
          sha: "a".repeat(40),
          category: "graph-fixture",
          hasAuth: false,
          anchors: [],
        },
      ],
    };

    // Ordered so a naive implementation that aborts on the first rejection would return
    // zero or one record instead of two — a fixed count is the thing that proves the
    // loop actually continued past the failure.
    const records = await runLabels(labels, {
      clone: async (url: string) => {
        if (url.includes("unreachable-repo")) {
          throw new Error("clone failed: network unreachable");
        }
        return FIXTURE_ROOT;
      },
    });

    expect(records).toHaveLength(2);

    const [first, second] = records;
    expect(first!.status).toBe("errored");
    if (first!.status !== "errored") throw new Error("unreachable");
    expect(first!.name).toBe("unreachable-repo");
    expect(first!.error).toContain("network unreachable");

    expect(second!.status).toBe("ok");
  });

  /**
   * `next-auth-app` is a real on-disk fixture (same spirit as `alias-repo`): a
   * `package.json` declaring `next` + `next-auth` as dependencies, so `detectFramework`
   * returns "next" and tier 1 fires for real — unlike `alias-repo` above, whose
   * `selected` is `[]` and can't tell a correct hits/misses wiring from a swapped one.
   *
   * Verified directly against `select()` before writing these assertions: the kept
   * universe is `middleware.ts`, `package.json`, `tsconfig.json`, `lib/db.ts`, and
   * `app/api/auth/[...nextauth]/route.ts`; tier 1's playbook globs match the first and
   * last, so `result.anchors` is exactly `["middleware.ts",
   * "app/api/auth/[...nextauth]/route.ts"]`. The label below marks `middleware.ts` (a
   * real anchor, so a real hit) and `lib/db.ts` (an ordinary non-auth file the cascade
   * never selects, so a real miss) — giving recall = 1/2, strictly between 0 and 1.
   */
  test("T-17: on a real next-auth fixture, tier 1 fires with genuine hits and misses", async () => {
    const FIXTURE_ROOT = `${import.meta.dir}/../src/__fixtures__/next-auth-app`;
    const labels: Labels = {
      repos: [
        {
          name: "next-auth-app",
          url: "https://example.test/owner/next-auth-app",
          sha: "c".repeat(40),
          category: "framework-fixture",
          hasAuth: true,
          anchors: ["middleware.ts", "lib/db.ts"],
        },
      ],
    };

    const records = await runLabels(labels, {
      clone: async () => FIXTURE_ROOT,
    });

    expect(records).toHaveLength(1);
    const record = records[0]!;
    if (record.status !== "ok") {
      throw new Error(`expected an ok record, got errored: ${JSON.stringify(record)}`);
    }

    expect(record.tier).toBe(1);
    expect(record.confidence).toBe(confidenceForTier[1]);

    expect(record.selected.map(posix).sort()).toEqual(
      ["middleware.ts", "app/api/auth/[...nextauth]/route.ts"].sort(),
    );

    expect(record.hits.map(posix)).toEqual(["middleware.ts"]);
    expect(record.misses.map(posix)).toEqual(["lib/db.ts"]);

    expect(record.recall).toBeGreaterThan(0);
    expect(record.recall).toBeLessThan(1);

    expect(record.hasAuth).toBe(true);
  });
});
