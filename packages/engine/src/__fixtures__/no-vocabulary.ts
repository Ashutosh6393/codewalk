/**
 * Synthetic "no vocabulary" repo — the tier-3 fan-in fallback path (ADR harness category 3).
 * No `next` in the manifest, so tier 1 (playbook) cannot fire. File contents carry none of
 * `dictionary/auth.ts`'s `AUTH_TERMS` — not even a single incidental hit — so tier 2 cannot
 * fire either. The only signal left is import structure: two files sit far above the rest in
 * fan-in, and those are what tier 3 must surface.
 *
 * `fanIn` mirrors `graph.ts`'s `fanIn()` return shape (`ReadonlyMap<string, number>`) so it
 * can be passed straight into `select()`'s `RepoInput.fanIn` with no conversion.
 *
 * `expectedAuthAnchors` is the hand label: the top-2 fan-in files, in descending fan-in
 * order. The gap is deliberate (5 and 3, next-highest is 0) so "top 2" is unambiguous.
 */
export const noVocabulary = {
  name: "no-vocabulary",
  manifest: {
    dependencies: { react: "^19.0.0" },
  },
  files: [
    "package.json",
    "lib/identity-gateway.ts",
    "lib/permission-check.ts",
    "lib/analytics.ts",
    "app/dashboard.ts",
    "app/settings.ts",
    "app/profile.ts",
    "app/reports.ts",
  ],
  contents: {
    "package.json": `{"name":"no-vocabulary","dependencies":{"react":"^19.0.0"}}`,
    "lib/identity-gateway.ts": `
      export function verifyIdentity(userId: string) {
        return userId.length > 0;
      }
    `,
    "lib/permission-check.ts": `
      import { verifyIdentity } from "./identity-gateway";

      export function checkPermission(userId: string, resource: string) {
        return verifyIdentity(userId) && resource !== "";
      }
    `,
    "lib/analytics.ts": `
      // Unrelated: page-view counting, not access control.
      export function trackEvent(name: string) {
        console.log(name);
      }
    `,
    "app/dashboard.ts": `
      import { verifyIdentity } from "../lib/identity-gateway";
      import { checkPermission } from "../lib/permission-check";

      export function renderDashboard(userId: string) {
        return verifyIdentity(userId) && checkPermission(userId, "dashboard");
      }
    `,
    "app/settings.ts": `
      import { verifyIdentity } from "../lib/identity-gateway";
      import { checkPermission } from "../lib/permission-check";

      export function renderSettings(userId: string) {
        return verifyIdentity(userId) && checkPermission(userId, "settings");
      }
    `,
    "app/profile.ts": `
      import { verifyIdentity } from "../lib/identity-gateway";
      import { checkPermission } from "../lib/permission-check";

      export function renderProfile(userId: string) {
        return verifyIdentity(userId) && checkPermission(userId, "profile");
      }
    `,
    "app/reports.ts": `
      import { verifyIdentity } from "../lib/identity-gateway";

      export function renderReports(userId: string) {
        return verifyIdentity(userId);
      }
    `,
  } satisfies Record<string, string>,
  // identity-gateway: imported by permission-check, dashboard, settings, profile, reports = 5
  // permission-check: imported by dashboard, settings, profile = 3
  // everything else: 0 (absent, matching graph.ts's fanIn() convention)
  fanIn: new Map<string, number>([
    ["lib/identity-gateway.ts", 5],
    ["lib/permission-check.ts", 3],
  ]),
  expectedAuthAnchors: ["lib/identity-gateway.ts", "lib/permission-check.ts"],
} as const;
