/**
 * Synthetic "no auth" repo — the honest "none found" path (ADR harness category, D-20).
 * No `next` and no auth library in the manifest, so tier 1 cannot fire. File paths and
 * contents carry zero terms from `dictionary/auth.ts`'s `AUTH_TERMS` (including the
 * `identity`/`permission` terms added alongside path matching) — not even one incidental
 * hit — so tier 2 cannot fire either.
 *
 * Unlike `no-vocabulary.ts`, this repo also carries no weak repo-level auth signal at all:
 * no file's path or content matches a single auth term. `fanIn` still supplies clear
 * winners (5 and 3, same shape as the other fan-in fixtures) precisely so the test can
 * prove tier 3 refuses to invent an anchor from fan-in alone when there is no auth signal
 * to gate it on (T-15) — the tempting data is there, and the cascade must still say "none".
 *
 * `expectedAuthAnchors` is empty: there is no auth in this repo, and nothing should be
 * invented.
 */
export const noAuth = {
  name: "no-auth",
  manifest: {
    dependencies: { react: "^19.0.0" },
  },
  files: [
    "package.json",
    "lib/db.ts",
    "lib/analytics.ts",
    "lib/notifications.ts",
    "app/dashboard.ts",
    "app/settings.ts",
    "app/profile.ts",
    "app/reports.ts",
  ],
  contents: {
    "package.json": `{"name":"no-auth","dependencies":{"react":"^19.0.0"}}`,
    "lib/db.ts": `
      export function connect() {
        return { host: "localhost", port: 5432 };
      }

      export function query(sql: string) {
        return [];
      }
    `,
    "lib/analytics.ts": `
      import { connect } from "./db";

      export function trackEvent(name: string) {
        const client = connect();
        return client;
      }
    `,
    "lib/notifications.ts": `
      export function sendEmail(to: string, subject: string) {
        console.log(\`Sending to \${to}: \${subject}\`);
      }
    `,
    "app/dashboard.ts": `
      import { connect } from "../lib/db";
      import { trackEvent } from "../lib/analytics";

      export function renderDashboard() {
        trackEvent("dashboard_view");
        return connect();
      }
    `,
    "app/settings.ts": `
      import { connect } from "../lib/db";
      import { trackEvent } from "../lib/analytics";

      export function renderSettings() {
        trackEvent("settings_view");
        return connect();
      }
    `,
    "app/profile.ts": `
      import { connect } from "../lib/db";
      import { trackEvent } from "../lib/analytics";

      export function renderProfile() {
        trackEvent("profile_view");
        return connect();
      }
    `,
    "app/reports.ts": `
      import { connect } from "../lib/db";

      export function renderReports() {
        return connect();
      }
    `,
  } satisfies Record<string, string>,
  // db: imported by analytics, dashboard, settings, profile, reports = 5
  // analytics: imported by dashboard, settings, profile = 3
  // everything else: 0 (absent, matching graph.ts's fanIn() convention)
  fanIn: new Map<string, number>([
    ["lib/db.ts", 5],
    ["lib/analytics.ts", 3],
  ]),
  expectedAuthAnchors: [] as string[],
} as const;
