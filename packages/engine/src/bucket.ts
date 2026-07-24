import { Glob } from "bun";

/**
 * Coverage ledger (ADR D-20). Every kept file lands in exactly one bucket:
 *
 *  - `classified`     — claimed by a subsystem selection (e.g. the auth anchors).
 *  - `known-category` — recognised non-subsystem files (tests, config, styles,
 *                       framework entrypoints). Counted as covered: we know what they
 *                       are, they just aren't a subsystem to explain.
 *  - `unknown`        — genuine-unknown source. The honest remainder (D-20): the files
 *                       we could not account for, which downstream clustering surfaces
 *                       rather than silently dropping.
 *
 * Coverage = (classified + known-category) / total kept. Only the unknown remainder
 * drags it down, which is the whole point — it measures what we can't yet explain.
 */
export interface CoverageLedger {
  classified: string[];
  knownCategory: string[];
  unknown: string[];
  coverage: number;
}

/**
 * Files we can name without understanding a subsystem. Deliberately excludes `route.ts`
 * and other API handlers: a non-auth route is a real subsystem file that must surface in
 * the remainder, not be hidden here.
 */
const KNOWN_CATEGORY_GLOBS = [
  // tests
  "**/*.test.{ts,tsx,js,jsx}",
  "**/*.spec.{ts,tsx,js,jsx}",
  "**/__tests__/**",
  // config
  "**/*.config.{ts,js,mjs,cjs}",
  "**/tsconfig*.json",
  "**/package.json",
  "**/biome.json",
  "**/.eslintrc*",
  "**/.prettierrc*",
  // styles
  "**/*.{css,scss,sass,less}",
  // Next.js app-router entrypoints (convention-named special files)
  "**/page.{ts,tsx,js,jsx}",
  "**/layout.{ts,tsx,js,jsx}",
  "**/template.{ts,tsx,js,jsx}",
  "**/loading.{ts,tsx,js,jsx}",
  "**/error.{ts,tsx,js,jsx}",
  "**/global-error.{ts,tsx,js,jsx}",
  "**/not-found.{ts,tsx,js,jsx}",
  "**/default.{ts,tsx,js,jsx}",
];

const knownCategoryMatchers = KNOWN_CATEGORY_GLOBS.map((g) => new Glob(g));

function isKnownCategory(path: string): boolean {
  return knownCategoryMatchers.some((m) => m.match(path));
}

/**
 * A surfaced piece of the genuine-unknown remainder (ADR D-20). Either a folder of
 * several unknowns worth a look, or a single file so widely imported it matters despite
 * being alone.
 */
export interface RemainderCluster {
  /** The folder for a cluster; the file's own folder for a high-fan-in single. */
  dir: string;
  files: string[];
  reason: "cluster" | "high-fan-in";
}

const dirOf = (path: string): string => {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
};

/**
 * Surface only the parts of the unknown remainder worth a human's attention (T-09):
 * folders holding `minCluster`+ unknown files, and singles with fan-in at or above
 * `fanInThreshold`. A lone low-fan-in util stays hidden — the point is signal, not a
 * wall of every unclassified file.
 */
export function clusterRemainder(
  unknown: string[],
  opts: {
    minCluster?: number;
    fanIn?: ReadonlyMap<string, number>;
    fanInThreshold?: number;
  } = {},
): RemainderCluster[] {
  const minCluster = opts.minCluster ?? 3;
  const fanInThreshold = opts.fanInThreshold ?? 3;

  // Group by folder, preserving first-appearance order.
  const byDir = new Map<string, string[]>();
  for (const path of unknown) {
    const dir = dirOf(path);
    (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push(path);
  }

  const clusters: RemainderCluster[] = [];
  const singles: RemainderCluster[] = [];
  for (const [dir, files] of byDir) {
    if (files.length >= minCluster) {
      clusters.push({ dir, files, reason: "cluster" });
      continue;
    }
    // Sub-threshold folder: rescue individually important files by fan-in.
    for (const file of files) {
      if ((opts.fanIn?.get(file) ?? 0) >= fanInThreshold) {
        singles.push({ dir, files: [file], reason: "high-fan-in" });
      }
    }
  }

  return [...clusters, ...singles];
}

export function bucket(kept: string[], classified: string[]): CoverageLedger {
  const classifiedSet = new Set(classified);
  const inClassified: string[] = [];
  const knownCategory: string[] = [];
  const unknown: string[] = [];

  for (const path of kept) {
    if (classifiedSet.has(path)) inClassified.push(path);
    else if (isKnownCategory(path)) knownCategory.push(path);
    else unknown.push(path);
  }

  const coverage =
    kept.length === 0 ? 1 : (inClassified.length + knownCategory.length) / kept.length;

  return { classified: inClassified, knownCategory, unknown, coverage };
}
