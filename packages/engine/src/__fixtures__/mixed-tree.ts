/**
 * Synthetic mixed repo tree — exercises the universe + coverage ledger (Slice 2).
 * Committed so ignore/bucket logic is tested with no clone and no filesystem.
 *
 * The tree mixes files that must be dropped by the ignore-list (node_modules, a
 * lockfile, a build dir, a `.d.ts`, a binary, and `.gitignore` entries) with kept
 * files spanning every bucket: auth anchors (classified), known-category files
 * (test/config/style/entrypoint), and genuine-unknown source.
 */
export const mixedTree = {
  name: "mixed-tree",
  gitignore: ".env\ncoverage/\n*.log\n",
  files: [
    // --- dropped by the ignore-list ---
    "node_modules/react/index.js",
    "bun.lock",
    "dist/bundle.js",
    "types/global.d.ts",
    "public/logo.png",
    ".env", // .gitignore
    "coverage/report.html", // .gitignore (dir)
    "app.log", // .gitignore (*.log)
    // --- kept: auth anchors (classified) ---
    "middleware.ts",
    "app/api/auth/[...nextauth]/route.ts",
    // --- kept: known-category ---
    "app/page.tsx", // entrypoint
    "app/layout.tsx", // entrypoint
    "next.config.js", // config
    "middleware.test.ts", // test
    "styles/globals.css", // style
    // --- kept: genuine-unknown ---
    "lib/db.ts",
    "lib/utils.ts",
  ],
  /** Files that survive the ignore-list, in input order. */
  kept: [
    "middleware.ts",
    "app/api/auth/[...nextauth]/route.ts",
    "app/page.tsx",
    "app/layout.tsx",
    "next.config.js",
    "middleware.test.ts",
    "styles/globals.css",
    "lib/db.ts",
    "lib/utils.ts",
  ],
} as const;
