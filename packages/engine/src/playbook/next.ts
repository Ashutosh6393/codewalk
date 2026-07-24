import { z } from "zod";
import type { Framework } from "../types.js";

/**
 * Next.js playbook (ADR D-17, tier 1). Encodes two things about Next.js:
 *  - how to recognise a Next.js repo from its manifest, and
 *  - where Next.js conventionally puts auth, as glob patterns.
 *
 * The playbook is the reason tier 1 beats fan-in on a known framework: a route file
 * wired by convention is imported by nobody, so fan-in would bury it (D-17). The globs
 * name those files directly.
 */

/** Lenient manifest boundary: we only care about the two dependency maps. */
const Manifest = z
  .object({
    dependencies: z.record(z.string()).optional(),
    devDependencies: z.record(z.string()).optional(),
  })
  .passthrough();

/** Detect the framework from a raw (unvalidated) parsed package.json. */
export function detectFramework(rawManifest: unknown): Framework {
  const parsed = Manifest.safeParse(rawManifest);
  if (!parsed.success) return "unknown";
  const deps = { ...parsed.data.dependencies, ...parsed.data.devDependencies };
  return "next" in deps ? "next" : "unknown";
}

/**
 * Convention locations for auth in a Next.js repo. Covers both routers (app/ and pages/)
 * and the `next-auth` v5 top-level config files. Matched against repo-relative paths.
 */
export const nextAuthAnchorGlobs = [
  "middleware.ts",
  "middleware.js",
  "app/api/auth/**/route.ts",
  "app/api/auth/**/route.js",
  "pages/api/auth/**/*.ts",
  "pages/api/auth/**/*.js",
  "auth.ts",
  "auth.config.ts",
] as const;
