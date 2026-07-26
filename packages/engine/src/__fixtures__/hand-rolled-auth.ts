/**
 * Synthetic "hand-rolled auth" repo — the tier-2 dictionary path (ADR harness category 2).
 * Next.js manifest but no `next-auth`, and no files at the Next.js convention auth paths,
 * so tier 1 cannot fire. Auth is implemented by hand in ordinary lib files.
 *
 * `contents` exists because the dictionary matches file content, not just paths.
 * `expectedAuthAnchors` is the hand label: the auth files a human says are correct — it
 * excludes the decoy, which mentions only one auth term incidentally.
 */
export const handRolledAuth = {
  name: "hand-rolled-auth",
  manifest: {
    dependencies: { next: "^15.0.0", react: "^19.0.0" },
  },
  files: [
    "package.json",
    "lib/auth.ts",
    "lib/session.ts",
    "lib/analytics.ts",
    "app/page.tsx",
    "app/layout.tsx",
    "components/Nav.tsx",
  ],
  contents: {
    "package.json": `{"name":"hand-rolled-auth","dependencies":{"next":"^15.0.0"}}`,
    "lib/auth.ts": `
      import { hashPassword, verifyToken } from "./crypto";

      export function login(username: string, password: string) {
        const hashed = hashPassword(password);
        const token = verifyToken(hashed);
        return token;
      }
    `,
    "lib/session.ts": `
      import jwt from "jsonwebtoken";
      import bcrypt from "bcrypt";

      export function createSession(userId: string) {
        const token = jwt.sign({ userId }, process.env.SECRET!);
        return { token, cookie: \`session=\${token}\` };
      }
    `,
    "lib/analytics.ts": `
      // Reads a tracking id from a cookie; nothing to do with authentication.
      export function trackPageView(request: Request) {
        const trackingId = request.headers.get("cookie");
        return { trackingId };
      }
    `,
    "app/page.tsx": `export default function Page() { return null; }`,
    "app/layout.tsx": `export default function Layout({ children }: { children: unknown }) { return children; }`,
    "components/Nav.tsx": `export function Nav() { return null; }`,
  } satisfies Record<string, string>,
  expectedAuthAnchors: ["lib/auth.ts", "lib/session.ts"],
} as const;
