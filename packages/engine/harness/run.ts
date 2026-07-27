import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { buildGraph, fanIn } from "../src/graph.js";
import { keptUniverse } from "../src/ignore.js";
import { select } from "../src/select.js";
import { bucket } from "../src/bucket.js";
import type { Confidence, Tier } from "../src/types.js";
import { cloneAtSha } from "./clone.js";
import { scoreRecall } from "./recall.js";

/**
 * The harness loop (Slice 5, T-17): clone each labelled repo, run the same pure
 * `select()` cascade the rest of the engine uses, and score the result against
 * hand-labelled ground truth. `clone` is injected rather than called directly so the
 * loop is testable with no network — that's the design's test seam (see `clone.ts`).
 *
 * A clone failure becomes an `errored` record, not a thrown error. One unreachable repo
 * in a 10-repo labelled set must never abort the measurement run over the other nine.
 */

const REPO_LABEL = z.object({
  name: z.string(),
  url: z.string(),
  sha: z.string().regex(/^[0-9a-f]{40}$/, "sha must be exactly 40 hex characters"),
  category: z.string(),
  hasAuth: z.boolean(),
  anchors: z.array(z.string()),
});

export const Labels = z.object({
  repos: z.array(REPO_LABEL),
});
export type Labels = z.infer<typeof Labels>;

export type RepoRecord =
  | {
      status: "ok";
      name: string;
      tier: Tier;
      confidence: Confidence;
      selected: string[];
      hits: string[];
      misses: string[];
      recall: number;
      precision: number;
      coverage: number;
      hasAuth: boolean;
    }
  | {
      status: "errored";
      name: string;
      error: string;
    };

export interface RunOptions {
  clone: (url: string, sha: string) => Promise<string>;
}

const toPosix = (filePath: string): string => filePath.replaceAll("\\", "/");

export async function runLabels(labels: Labels, options: RunOptions): Promise<RepoRecord[]> {
  const records: RepoRecord[] = [];

  for (const label of labels.repos) {
    let root: string;
    try {
      root = await options.clone(label.url, label.sha);
    } catch (error) {
      records.push({
        status: "errored",
        name: label.name,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const files: string[] = [];
    for await (const filePath of new Bun.Glob("**/*").scan({ cwd: root })) {
      files.push(toPosix(filePath));
    }
    const gitignorePath = path.join(root, ".gitignore");
    const gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf8") : undefined;
    const kept = keptUniverse(files, gitignore);

    const graph = await buildGraph(root);
    const fanInCounts = fanIn(graph);

    const manifestPath = path.join(root, "package.json");
    const manifest = fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
      : undefined;

    const readFile = (repoRelativePath: string): string => {
      try {
        return fs.readFileSync(path.join(root, repoRelativePath), "utf8");
      } catch {
        return "";
      }
    };

    const result = select("auth", { files: kept, manifest, readFile, fanIn: fanInCounts });
    const recall = scoreRecall(result.anchors, label.anchors);
    const ledger = bucket(kept, result.anchors);

    records.push({
      status: "ok",
      name: label.name,
      tier: result.provenance.tier,
      confidence: result.confidence,
      selected: result.anchors,
      hits: recall.hits,
      misses: recall.misses,
      recall: recall.recall,
      precision: recall.precision,
      coverage: ledger.coverage,
      hasAuth: result.hasAuth,
    });
  }

  return records;
}

if (import.meta.main) {
  const labelsPath = path.join(import.meta.dir, "labels.yaml");
  const labels = Labels.parse(Bun.YAML.parse(fs.readFileSync(labelsPath, "utf8")));
  const cacheDir = path.join(os.tmpdir(), "codewalk-harness-cache");

  const records = await runLabels(labels, {
    clone: (url, sha) => cloneAtSha(url, sha, cacheDir),
  });

  for (const record of records) {
    console.log(JSON.stringify(record));
  }

  const okRecords = records.filter((record) => record.status === "ok");
  const aggregate = scoreRecall(
    okRecords.flatMap((record) => record.selected),
    labels.repos.flatMap((label) => label.anchors),
  );
  console.log(JSON.stringify({ aggregateRecall: aggregate.recall }));
}
