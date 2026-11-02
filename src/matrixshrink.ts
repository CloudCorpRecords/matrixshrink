/**
 * matrixshrink core: redundant CI matrix combinations from
 * run history and coverage overlap.
 *
 *   findRedundantCombos(combos, runs) -> report
 *
 * Behaviour:
 * - A combo is ELIGIBLE when it has at least one run.
 *   covered(combo) is the union of `covered` across its runs,
 *   and failing(combo) is true when at least one of its runs
 *   has outcome "fail".
 * - Redundancy scan: the eligible combos are visited in
 *   ascending id order, maintaining the set of combos flagged
 *   redundant so far. An eligible combo C is flagged REDUNDANT
 *   iff failing(C) is false AND covered(C) is a subset of the
 *   union of covered(R) over all eligible combos R != C that
 *   are NOT flagged redundant at that moment (kept-so-far plus
 *   not-yet-scanned). Consequences: of two eligible combos
 *   with identical coverage the alphabetically-first is
 *   flagged and the second is not (the first no longer counts
 *   as covering); an always-passing combo with an empty
 *   covered set is redundant (the empty set is a subset of
 *   any union); a combo that ever failed is never redundant.
 * - Combos with zero runs are reported in `no_runs` and are
 *   never redundant — there is no evidence either way.
 *
 * Validation is strict and path-naming: any malformed input
 * throws an Error naming the offending path (for example
 * "runs[2].combo references unknown combination
 * \"node22-linux\"") and no partial result is produced.
 */
import type {
  MatrixCombo,
  MatrixRun,
  MatrixShrinkResult,
  RedundantCombo,
} from "./types.js";

export const VERSION = "0.1.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Validate the raw arguments and return the normalised combo
 * list (dimensions defaulted) and run list (covered defaulted).
 * Reference checks (a run naming a supplied combo) run in a
 * second pass, after every combo id is known.
 */
function validateArgs(
  combos: unknown,
  runs: unknown,
): { combos: MatrixCombo[]; runs: MatrixRun[] } {
  if (combos === undefined) throw new Error("combos is required");
  if (!Array.isArray(combos) || combos.length === 0) {
    throw new Error("combos must be a non-empty array");
  }
  if (runs === undefined) throw new Error("runs is required");
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error("runs must be a non-empty array");
  }

  // Combos: structure, ids, and dimension value types.
  const validCombos: MatrixCombo[] = [];
  const indexById = new Map<string, number>();
  combos.forEach((raw, i) => {
    const path = `combos[${i}]`;
    if (!isRecord(raw)) throw new Error(`${path} must be an object`);
    if (raw.id === undefined) throw new Error(`${path}.id is required`);
    if (typeof raw.id !== "string" || raw.id.length === 0) {
      throw new Error(`${path}.id must be a non-empty string`);
    }
    const firstIndex = indexById.get(raw.id);
    if (firstIndex !== undefined) {
      throw new Error(
        `${path}.id duplicates combos[${firstIndex}].id "${raw.id}"`,
      );
    }
    indexById.set(raw.id, i);

    let dimensions: Record<string, string> = {};
    if (raw.dimensions !== undefined) {
      if (!isRecord(raw.dimensions)) {
        throw new Error(`${path}.dimensions must be an object`);
      }
      for (const [key, value] of Object.entries(raw.dimensions)) {
        if (typeof value !== "string") {
          throw new Error(`${path}.dimensions.${key} must be a string`);
        }
      }
      dimensions = { ...(raw.dimensions as Record<string, string>) };
    }
    validCombos.push({ id: raw.id, dimensions });
  });

  // Runs: structure and per-field types first.
  const validRuns: MatrixRun[] = [];
  runs.forEach((raw, i) => {
    const path = `runs[${i}]`;
    if (!isRecord(raw)) throw new Error(`${path} must be an object`);
    if (raw.combo === undefined) throw new Error(`${path}.combo is required`);
    if (typeof raw.combo !== "string") {
      throw new Error(`${path}.combo must be a string`);
    }
    if (raw.outcome === undefined) {
      throw new Error(`${path}.outcome is required`);
    }
    if (raw.outcome !== "pass" && raw.outcome !== "fail") {
      throw new Error(`${path}.outcome must be "pass" or "fail"`);
    }
    let covered: string[] = [];
    if (raw.covered !== undefined) {
      if (!Array.isArray(raw.covered)) {
        throw new Error(`${path}.covered must be an array`);
      }
      raw.covered.forEach((entry, j) => {
        if (typeof entry !== "string") {
          throw new Error(`${path}.covered[${j}] must be a string`);
        }
      });
      covered = [...(raw.covered as string[])];
    }
    validRuns.push({ combo: raw.combo, outcome: raw.outcome, covered });
  });

  // Second pass: every run must name a supplied combo.
  validRuns.forEach((run, i) => {
    if (!indexById.has(run.combo)) {
      throw new Error(
        `runs[${i}].combo references unknown combination "${run.combo}"`,
      );
    }
  });

  return { combos: validCombos, runs: validRuns };
}

/** Find the redundant combos in the supplied matrix and run history. */
export function findRedundantCombos(
  combos: unknown,
  runs: unknown,
): MatrixShrinkResult {
  const { combos: validCombos, runs: validRuns } = validateArgs(combos, runs);

  // Per-combo evidence: coverage union and failing flag.
  const coveredById = new Map<string, Set<string>>();
  const failingIds = new Set<string>();
  const runCountById = new Map<string, number>();
  for (const run of validRuns) {
    runCountById.set(run.combo, (runCountById.get(run.combo) ?? 0) + 1);
    let set = coveredById.get(run.combo);
    if (set === undefined) {
      set = new Set<string>();
      coveredById.set(run.combo, set);
    }
    for (const key of run.covered) set.add(key);
    if (run.outcome === "fail") failingIds.add(run.combo);
  }

  const allIds = sorted(validCombos.map((c) => c.id));
  const eligible = allIds.filter((id) => (runCountById.get(id) ?? 0) > 0);
  const no_runs = allIds.filter((id) => (runCountById.get(id) ?? 0) === 0);

  // Greedy redundancy scan in ascending id order. A combo
  // flagged redundant stops counting as coverage for every
  // combo scanned after it; combos not yet scanned still count.
  const redundantIds = new Set<string>();
  for (const id of eligible) {
    if (failingIds.has(id)) continue;
    const covered = coveredById.get(id) ?? new Set<string>();
    const union = new Set<string>();
    for (const other of eligible) {
      if (other === id || redundantIds.has(other)) continue;
      for (const key of coveredById.get(other) ?? []) union.add(key);
    }
    let subset = true;
    for (const key of covered) {
      if (!union.has(key)) {
        subset = false;
        break;
      }
    }
    if (subset) redundantIds.add(id);
  }

  const redundant: RedundantCombo[] = sorted(redundantIds).map((id) => ({
    id,
    covered: sorted(coveredById.get(id) ?? []),
  }));
  const kept = eligible.filter((id) => !redundantIds.has(id));
  const failing = sorted(failingIds);

  return {
    redundant,
    kept,
    failing,
    no_runs,
    total_combos: validCombos.length,
    total_runs: validRuns.length,
  };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
