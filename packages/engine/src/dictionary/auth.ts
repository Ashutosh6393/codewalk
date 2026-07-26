/**
 * Auth keyword dictionary (ADR-001 D-17, tier 2). Content/keyword matching only — no
 * tree-sitter, no LLM (design.md, Out of scope). Used when a repo has no recognised
 * framework playbook (tier 1) to anchor auth files by convention path, so we fall back to
 * scanning file content — and the file's own path — for auth vocabulary instead.
 */

/**
 * Auth-domain terms. Matched case-insensitively on word boundaries against a file's path
 * and its content. A filename is a primary auth signal (`auth.ts`, `session.ts`,
 * `middleware.ts`) and is what lets a repo with odd internal naming still register.
 */
const AUTH_TERMS = [
  "auth",
  "login",
  "logout",
  "password",
  "credential",
  "token",
  "session",
  "jwt",
  "oauth",
  "cookie",
  "bcrypt",
  "signin",
  "authorize",
  "identity",
  "permission",
] as const;

const termPatterns = AUTH_TERMS.map((term) => new RegExp(`\\b${term}\\b`, "i"));

/**
 * A file qualifies only when it carries several distinct auth terms, not one. One
 * incidental mention (e.g. a comment referencing "authentication" or a stray "cookie")
 * must not be enough — that's what separates a real auth file from an unrelated file that
 * happens to touch a cookie. Two distinct terms is the minimum that rules out a single
 * incidental hit while still catching hand-rolled auth code, which reliably mixes several
 * of these terms (login + password + token, session + jwt + cookie, ...).
 */
const MIN_DISTINCT_TERMS = 2;

/** Matches an `import ...` statement line, or a `require("...")` assignment line. */
const IMPORT_LINE = /^\s*(import\s|.*=\s*require\()/;

/**
 * An import specifier names ANOTHER module, not this file — it's that module's signal,
 * not this one's. Without stripping it, every consumer of an auth module (e.g. a page
 * that merely does `import { checkAuth } from "./auth"`) scores auth terms it never
 * actually contains, which turns ordinary callers into false positives. A line filter is
 * enough here; this deliberately does not parse or resolve modules.
 */
function stripImportLines(content: string): string {
  return content
    .split("\n")
    .filter((line) => !IMPORT_LINE.test(line))
    .join("\n");
}

/** How many distinct auth terms a file's path + content (imports stripped) match together. */
function countDistinctTerms(path: string, readFile: (path: string) => string): number {
  const haystack = `${path} ${stripImportLines(readFile(path))}`;
  return termPatterns.filter((pattern) => pattern.test(haystack)).length;
}

export function matchAuthVocabulary(
  files: string[],
  readFile: (path: string) => string,
): string[] {
  return files.filter((path) => countDistinctTerms(path, readFile) >= MIN_DISTINCT_TERMS);
}

/**
 * Files carrying at least one auth term — the plausible candidates tier 3 may rank.
 * Fan-in alone is never evidence that auth exists (D-20): every repo has import
 * structure, so tier 3 must not rank purely by fan-in. Instead it ranks only among files
 * that already carry some auth vocabulary, however weak — fan-in breaks ties among
 * plausible files, it never manufactures a candidate out of nothing.
 */
export function authCandidates(files: string[], readFile: (path: string) => string): string[] {
  return files.filter((path) => countDistinctTerms(path, readFile) >= 1);
}
