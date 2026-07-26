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
