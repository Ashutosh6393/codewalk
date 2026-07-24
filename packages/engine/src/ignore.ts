import ignore from "ignore";

/**
 * The ignore-list that defines the kept universe (ADR D-20). A file must survive this
 * to count toward coverage or land in the remainder — everything downstream measures
 * against the kept set, so the denominator is honest only if this is.
 *
 * Two layers, both expressed as gitignore patterns and matched by the same engine:
 *  - the always-ignore floor below: things that are never source in any repo
 *    (dependencies, build output, generated `.d.ts`, lockfiles, binaries), and
 *  - the repo's own `.gitignore` (secrets, coverage output, logs), applied on top.
 *
 * The floor is deliberately minimal — exactly the universal non-source categories.
 * Anything repo-specific (e.g. `.env`) is dropped only if the repo's `.gitignore` says
 * so, which is where those entries live in practice.
 */
const ALWAYS_IGNORE = [
  "node_modules/",
  "dist/",
  "build/",
  ".next/",
  ".git/",
  "bun.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "*.d.ts",
  // binaries — not source, matched by extension at any depth
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.ico",
  "*.webp",
  "*.woff",
  "*.woff2",
  "*.ttf",
  "*.eot",
  "*.otf",
  "*.pdf",
  "*.zip",
  "*.mp4",
  "*.mov",
  "*.mp3",
];

/** Files that survive the ignore-list, in input order. */
export function keptUniverse(files: string[], gitignore = ""): string[] {
  const ig = ignore().add(ALWAYS_IGNORE).add(gitignore);
  return ig.filter(files);
}
