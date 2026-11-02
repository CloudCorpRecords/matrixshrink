/**
 * matrixshrink types.
 *
 * matrixshrink looks at a CI matrix — the combinations of
 * dimensions (operating system, runtime version, and so on)
 * that a workflow runs — together with recorded run history,
 * and works out which combinations can be dropped without
 * losing any coverage. The caller supplies the full combo
 * set and the recorded runs: which combo each run exercised,
 * whether it passed or failed, and the coverage keys it
 * exercised.
 *
 * matrixshrink reports, as pure local computation:
 *
 *   - the redundant combos: eligible, always passing, and
 *     with coverage fully exercised by the combos that stay
 *   - the combos that are kept, the combos that ever failed,
 *     and the combos with no runs at all
 *   - the totals of supplied combos and runs
 *
 * Nothing is fetched, executed, or guessed: the result comes
 * only from the history supplied.
 */

/** One combination in the CI matrix, as supplied by the caller. */
export interface MatrixCombo {
  /** Combination identifier; unique across the supplied set. */
  id: string;
  /**
   * Dimension values for this combination, e.g.
   * {"os": "linux", "node": "20"}. Defaults to {} when omitted;
   * carried for identification, not used by the redundancy scan.
   */
  dimensions: Record<string, string>;
}

/** One recorded CI run, as supplied by the caller. */
export interface MatrixRun {
  /** Id of the combination this run exercised. */
  combo: string;
  /** Run outcome: "pass" or "fail". */
  outcome: "pass" | "fail";
  /**
   * Coverage keys this run exercised, e.g. test files or
   * feature ids. Defaults to [] when omitted.
   */
  covered: string[];
}

/** One combo flagged redundant, with its full coverage. */
export interface RedundantCombo {
  /** Combination identifier. */
  id: string;
  /** Union of coverage keys across the combo's runs, sorted ascending. */
  covered: string[];
}

/** The redundancy report. */
export interface MatrixShrinkResult {
  /** Flagged combos, sorted by id ascending. */
  redundant: RedundantCombo[];
  /** Eligible combos not flagged, ids sorted ascending (includes every failing combo). */
  kept: string[];
  /** Eligible combos with at least one "fail" run, ids sorted ascending. */
  failing: string[];
  /** Combos with zero runs, ids sorted ascending. */
  no_runs: string[];
  /** Number of supplied combos. */
  total_combos: number;
  /** Number of supplied runs. */
  total_runs: number;
}
