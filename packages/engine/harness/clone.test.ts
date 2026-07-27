import { afterAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cloneAtSha } from "./clone.js";

/**
 * No network: the "remote" is a small real local git repo built fresh in a temp dir.
 * `git clone`/`git fetch` work fine against a local filesystem path, which is exactly
 * the "small real/local repo" T-18 allows.
 */
function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

function toPosix(p: string): string {
  return p.replaceAll("\\", "/");
}

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

// Build the source repo once: two commits, two distinct SHAs, so a naive
// "clone HEAD" implementation is provably wrong when asked for the older one.
const sourceRepo = makeTempDir("clone-test-source-");
git(["init"], sourceRepo);
fs.writeFileSync(path.join(sourceRepo, "marker.txt"), "v1");
git(["add", "marker.txt"], sourceRepo);
git(["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "v1"], sourceRepo);
const olderSha = git(["rev-parse", "HEAD"], sourceRepo);

fs.writeFileSync(path.join(sourceRepo, "marker.txt"), "v2");
git(["add", "marker.txt"], sourceRepo);
git(["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "v2"], sourceRepo);
// newer HEAD sha exists only to prove the checkout is NOT just "clone HEAD"

// git wants a local-path url in forward-slash form on Windows.
const sourceUrl = toPosix(sourceRepo);

afterAll(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("cloneAtSha — clone at pinned SHA (T-18)", () => {
  test("checks out the working tree at the exact pinned SHA, not HEAD", async () => {
    const cacheDir = makeTempDir("clone-test-cache-");

    const workingTree = await cloneAtSha(sourceUrl, olderSha, cacheDir);

    const checkedOutSha = git(["rev-parse", "HEAD"], workingTree);
    expect(checkedOutSha).toBe(olderSha);

    const markerContent = fs.readFileSync(path.join(workingTree, "marker.txt"), "utf-8");
    expect(markerContent).toBe("v1");
  });

  test("returns a working tree path keyed by the SHA", async () => {
    const cacheDir = makeTempDir("clone-test-cache-");

    const workingTree = await cloneAtSha(sourceUrl, olderSha, cacheDir);

    expect(toPosix(workingTree)).toContain(olderSha);
  });

  test("a second call with the same SHA is a cache hit: same path, no re-clone", async () => {
    const cacheDir = makeTempDir("clone-test-cache-");

    const firstTree = await cloneAtSha(sourceUrl, olderSha, cacheDir);

    // Prove "did not re-clone" observably: plant a sentinel that a fresh clone
    // would never produce, and require it to survive the second call.
    const sentinelPath = path.join(firstTree, "sentinel-from-first-call.txt");
    fs.writeFileSync(sentinelPath, "still here");

    const secondTree = await cloneAtSha(sourceUrl, olderSha, cacheDir);

    expect(toPosix(secondTree)).toBe(toPosix(firstTree));
    expect(fs.existsSync(path.join(secondTree, "sentinel-from-first-call.txt"))).toBe(true);
  });
});
