/**
 * Synthetic "clean next-auth" repo — the tier-1 happy path (ADR harness category 1).
 * A committed fixture so selection is tested with no network and no clone.
 *
 * `expectedAuthAnchors` is the hand label: the auth files a human says are correct.
 * It doubles as ground truth for the recall diff (T-04).
 */
export const nextAuthClean = {
  name: "next-auth-clean",
  manifest: {
    dependencies: { next: "^15.0.0", "next-auth": "^5.0.0", react: "^19.0.0" },
  },
  files: [
    "package.json",
    "middleware.ts",
    "app/api/auth/[...nextauth]/route.ts",
    "app/page.tsx",
    "app/layout.tsx",
    "lib/db.ts",
    "components/Nav.tsx",
  ],
  expectedAuthAnchors: ["middleware.ts", "app/api/auth/[...nextauth]/route.ts"],
} as const;
