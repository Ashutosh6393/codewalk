import path from "node:path";
import { cruise } from "dependency-cruiser";
import extractTSConfig from "dependency-cruiser/config-utl/extract-ts-config";

/**
 * Thin dependency-cruiser adapter (T-10/T-11, ADR-001 D-04: "buy module resolution"
 * rather than hand-roll an import parser). dependency-cruiser already knows how to walk
 * `import`/`require` and resolve `tsconfig` path aliases (e.g. `@/lib/db`) to the real
 * file on disk — the one thing a from-scratch parser would get wrong first.
 *
 * Two adapter-only decisions worth recording, since both are easy to get silently wrong:
 *
 *  - The parsed `tsconfig` must be passed as `transpileOptions.tsConfig` (4th argument),
 *    not just `cruiseOptions.tsConfig.fileName`. Without it, dependency-cruiser's alias
 *    plugin falls back to a relative `baseUrl` and resolves aliases against `process.cwd()`
 *    instead of the tsconfig's own directory — aliases then silently fail to resolve
 *    (`couldNotResolve: true`), which is worse than an error because nothing throws.
 *  - dependency-cruiser reports paths relative to whatever cwd/baseDir it was pointed at,
 *    and on Windows with native (`\`) separators. Both are normalised here so downstream
 *    consumers always see repo-relative, POSIX paths.
 */

export interface GraphEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  edges: GraphEdge[];
}

const toPosix = (filePath: string): string => filePath.replaceAll("\\", "/");

export async function buildGraph(root: string): Promise<DependencyGraph> {
  const tsConfigFileName = path.join(root, "tsconfig.json");

  const { output } = await cruise(
    ["."],
    {
      baseDir: root,
      tsConfig: { fileName: tsConfigFileName },
    },
    {},
    { tsConfig: extractTSConfig(tsConfigFileName) },
  );

  if (typeof output === "string") {
    throw new Error("dependency-cruiser returned a formatted string, expected a cruise result");
  }

  const edges: GraphEdge[] = [];
  for (const module of output.modules) {
    for (const dependency of module.dependencies) {
      if (dependency.couldNotResolve) continue;
      edges.push({ from: toPosix(module.source), to: toPosix(dependency.resolved) });
    }
  }

  return { edges };
}

/**
 * Fan-in: how many distinct files import a given file. Exists as the tier-3 fallback
 * ranker (ADR-001 D-17) and to rescue high-fan-in singles out of the remainder cluster
 * (D-20) — on a known framework, playbook anchors override fan-in; fan-in only ranks
 * what the playbook doesn't already place.
 *
 * A file with zero importers is absent from the map, not present with 0 — callers
 * (`clusterRemainder` in bucket.ts) already default via `?? 0`.
 */
export function fanIn(graph: DependencyGraph): ReadonlyMap<string, number> {
  const importersByTarget = new Map<string, Set<string>>();

  for (const edge of graph.edges) {
    // dependency-cruiser can report the same import target twice for one file (e.g. a
    // type-only import alongside a value import) — dedupe by importer, not by edge, or
    // fan-in would double-count a single importer.
    let importers = importersByTarget.get(edge.to);
    if (!importers) {
      importers = new Set();
      importersByTarget.set(edge.to, importers);
    }
    importers.add(edge.from);
  }

  const counts = new Map<string, number>();
  for (const [target, importers] of importersByTarget) {
    counts.set(target, importers.size);
  }
  return counts;
}
