/**
 * SHA-pinned clone for the selection harness (Task 13).
 *
 * `git clone --depth 1` only ever gets you HEAD of the default branch — it cannot
 * check out an arbitrary historical SHA. So we do it in steps: `git init` an empty
 * repo, add the remote, then `git fetch --depth 1 origin <sha>` (a shallow fetch of
 * that exact commit, not the branch tip), then check out FETCH_HEAD.
 *
 * The working tree lives at `cacheDir/<sha>`. Keying by SHA means a re-run for the
 * same commit is a cache hit (return the existing dir, no git call at all), and two
 * different SHAs of the same repo never collide in the cache.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export async function cloneAtSha(url: string, sha: string, cacheDir: string): Promise<string> {
  const workingTree = path.join(cacheDir, sha);

  if (fs.existsSync(workingTree)) {
    return workingTree;
  }

  try {
    execFileSync("git", ["init", workingTree]);
    execFileSync("git", ["-C", workingTree, "remote", "add", "origin", url]);
    execFileSync("git", ["-C", workingTree, "fetch", "--depth", "1", "origin", sha]);
    execFileSync("git", ["-C", workingTree, "checkout", "FETCH_HEAD"]);
  } catch (error) {
    fs.rmSync(workingTree, { recursive: true, force: true });
    throw error;
  }

  return workingTree;
}
