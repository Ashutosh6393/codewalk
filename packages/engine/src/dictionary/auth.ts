/**
 * Auth keyword dictionary (ADR-001 D-17, tier 2). Content/keyword matching only — no
 * tree-sitter, no LLM (design.md, Out of scope). Used when a repo has no recognised
 * framework playbook (tier 1) to anchor auth files by convention path, so we fall back to
 * scanning file content for auth vocabulary instead.
 */

/** Auth-domain terms. Matched case-insensitively on word boundaries against file content. */
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

export function matchAuthVocabulary(
  files: string[],
  readFile: (path: string) => string,
): string[] {
  return files.filter((path) => {
    const content = readFile(path);
    const distinctTermsMatched = termPatterns.filter((pattern) => pattern.test(content)).length;
    return distinctTermsMatched >= MIN_DISTINCT_TERMS;
  });
}
