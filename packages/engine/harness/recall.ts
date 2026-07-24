/**
 * Anchor recall diff — the harness's measuring stick (ADR Future work, step 4).
 * Compares the files selection picked against the hand-labelled ground truth.
 *
 * recall    = hits / labelled   (did we find the anchors a human marked?)
 * precision = hits / selected   (was what we picked actually auth?)
 *
 * Empty denominators are treated as vacuous passes: labelling nothing and selecting
 * nothing is a correct "no auth here" result, not a divide-by-zero.
 */
export interface RecallResult {
  /** Selected and labelled (true positives), in labelled order. */
  hits: string[];
  /** Labelled but not selected (false negatives), in labelled order. */
  misses: string[];
  /** Selected but not labelled (false positives), in selected order. */
  extras: string[];
  recall: number;
  precision: number;
}

export function scoreRecall(selected: string[], labelled: string[]): RecallResult {
  const selectedSet = new Set(selected);
  const labelledSet = new Set(labelled);

  const hits = labelled.filter((f) => selectedSet.has(f));
  const misses = labelled.filter((f) => !selectedSet.has(f));
  const extras = selected.filter((f) => !labelledSet.has(f));

  const recall = labelled.length === 0 ? 1 : hits.length / labelled.length;
  const precision = selected.length === 0 ? 1 : hits.length / selected.length;

  return { hits, misses, extras, recall, precision };
}
