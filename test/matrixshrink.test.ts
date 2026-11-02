import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findRedundantCombos } from "../src/matrixshrink.js";

/**
 * All tests are pure local computation over inline combo/run
 * fixtures: no filesystem, no network. Each behaviour in the
 * spec is pinned by its own case, including the deterministic
 * greedy scan consequences and every validation path.
 */

const combo = (id: string, dimensions?: Record<string, string>) => ({
  id,
  ...(dimensions !== undefined ? { dimensions } : {}),
});
const run = (c: string, outcome: string, covered?: string[]) => ({
  combo: c,
  outcome,
  ...(covered !== undefined ? { covered } : {}),
});
const pass = (c: string, covered?: string[]) => run(c, "pass", covered);
const fail = (c: string, covered?: string[]) => run(c, "fail", covered);

describe("findRedundantCombos — redundancy", () => {
  it("flags a combo whose coverage is fully exercised by a combo that stays", () => {
    const out = findRedundantCombos(
      [combo("full"), combo("part")],
      [pass("full", ["a", "b"]), pass("part", ["a"])],
    );
    assert.deepEqual(out.redundant, [{ id: "part", covered: ["a"] }]);
    assert.deepEqual(out.kept, ["full"]);
    assert.deepEqual(out.failing, []);
    assert.deepEqual(out.no_runs, []);
    assert.equal(out.total_combos, 2);
    assert.equal(out.total_runs, 2);
  });

  it("keeps a combo that covers a key no other staying combo covers", () => {
    const out = findRedundantCombos(
      [combo("a"), combo("b")],
      [pass("a", ["x", "unique-a"]), pass("b", ["x"])],
    );
    // b is covered by a; a's unique key is covered by nobody else.
    assert.deepEqual(out.redundant, [{ id: "b", covered: ["x"] }]);
    assert.deepEqual(out.kept, ["a"]);
  });

  it("flags nothing when every combo covers a unique key", () => {
    const out = findRedundantCombos(
      [combo("a"), combo("b")],
      [pass("a", ["only-a"]), pass("b", ["only-b"])],
    );
    assert.deepEqual(out.redundant, []);
    assert.deepEqual(out.kept, ["a", "b"]);
  });

  it("unions covered across a combo's runs and sorts it ascending in the output", () => {
    const out = findRedundantCombos(
      [combo("anchor"), combo("multi")],
      [
        fail("anchor", ["gamma", "alpha", "beta"]),
        pass("multi", ["beta", "alpha"]),
        pass("multi", ["gamma", "alpha"]),
      ],
    );
    assert.deepEqual(out.redundant, [
      { id: "multi", covered: ["alpha", "beta", "gamma"] },
    ]);
    assert.deepEqual(out.kept, ["anchor"]);
    assert.equal(out.total_runs, 3);
  });

  it("treats an omitted covered field the same as an empty one", () => {
    const omitted = findRedundantCombos(
      [combo("a"), combo("b")],
      [pass("a"), fail("b", ["k"])],
    );
    const explicit = findRedundantCombos(
      [combo("a"), combo("b")],
      [pass("a", []), fail("b", ["k"])],
    );
    assert.deepEqual(omitted, explicit);
  });

  it("is deterministic: the input order of combos and runs does not change the result", () => {
    const combos = [combo("full"), combo("part"), combo("other")];
    const runs = [
      pass("full", ["a", "b"]),
      pass("part", ["a"]),
      fail("other", ["z"]),
    ];
    const forward = findRedundantCombos(combos, runs);
    const reversed = findRedundantCombos(
      [...combos].reverse(),
      [...runs].reverse(),
    );
    assert.deepEqual(reversed, forward);
  });

  it("carries dimensions without letting them affect the scan", () => {
    const withDims = findRedundantCombos(
      [
        combo("full", { os: "linux", node: "20" }),
        combo("part", { os: "linux", node: "18" }),
      ],
      [pass("full", ["a", "b"]), pass("part", ["a"])],
    );
    const without = findRedundantCombos(
      [combo("full"), combo("part")],
      [pass("full", ["a", "b"]), pass("part", ["a"])],
    );
    assert.deepEqual(withDims, without);
  });
});

describe("findRedundantCombos — the greedy scan, pinned consequences", () => {
  it("of two identical-coverage combos, flags the alphabetically-first only", () => {
    const out = findRedundantCombos(
      [combo("beta"), combo("alpha")],
      [pass("alpha", ["x"]), pass("beta", ["x"])],
    );
    // alpha is scanned first: beta (not yet scanned) still
    // covers x, so alpha is redundant. beta is then scanned
    // with alpha no longer counting, so beta stays.
    assert.deepEqual(out.redundant, [{ id: "alpha", covered: ["x"] }]);
    assert.deepEqual(out.kept, ["beta"]);
  });

  it("of three identical-coverage combos, flags the first two and keeps the last", () => {
    const out = findRedundantCombos(
      [combo("alpha"), combo("beta"), combo("gamma")],
      [pass("alpha", ["x"]), pass("beta", ["x"]), pass("gamma", ["x"])],
    );
    assert.deepEqual(
      out.redundant.map((r) => r.id),
      ["alpha", "beta"],
    );
    assert.deepEqual(out.kept, ["gamma"]);
  });

  it("flags an always-passing combo with an empty covered set, even as the only combo", () => {
    const out = findRedundantCombos([combo("only")], [pass("only")]);
    // The empty set is a subset of any union, including the
    // empty union of the (zero) other combos.
    assert.deepEqual(out.redundant, [{ id: "only", covered: [] }]);
    assert.deepEqual(out.kept, []);
  });

  it("flags an empty-coverage combo alongside covering combos", () => {
    const out = findRedundantCombos(
      [combo("empty"), combo("real")],
      [pass("empty", []), pass("real", ["k"])],
    );
    assert.deepEqual(out.redundant, [{ id: "empty", covered: [] }]);
    assert.deepEqual(out.kept, ["real"]);
  });

  it("lets kept-so-far and not-yet-scanned combos both count as coverage", () => {
    const out = findRedundantCombos(
      [combo("alpha"), combo("beta"), combo("gamma")],
      [
        pass("alpha", ["x"]),
        pass("beta", ["x", "y"]),
        pass("gamma", ["y"]),
      ],
    );
    // alpha: beta+gamma cover x -> redundant. beta: gamma alone
    // (alpha flagged) covers only y, not x -> kept. gamma:
    // beta is kept-so-far and covers y -> redundant.
    assert.deepEqual(
      out.redundant.map((r) => r.id),
      ["alpha", "gamma"],
    );
    assert.deepEqual(out.kept, ["beta"]);
  });

  it("a combo covered only by an already-flagged combo is not redundant", () => {
    const out = findRedundantCombos(
      [combo("a1"), combo("a2"), combo("solo")],
      [pass("a1", ["x"]), pass("a2", ["x"]), pass("solo", ["x"])],
    );
    // a1 redundant via a2/solo; a2 redundant via solo alone;
    // solo has no staying cover left, so it is kept.
    assert.deepEqual(
      out.redundant.map((r) => r.id),
      ["a1", "a2"],
    );
    assert.deepEqual(out.kept, ["solo"]);
  });
});

describe("findRedundantCombos — failing combos", () => {
  it("never flags a combo that ever failed, even when its coverage is a subset", () => {
    const out = findRedundantCombos(
      [combo("flaky"), combo("main")],
      [pass("flaky", ["a"]), fail("flaky", ["a"]), pass("main", ["a", "b"])],
    );
    assert.deepEqual(out.redundant, []);
    assert.deepEqual(out.kept, ["flaky", "main"]);
    assert.deepEqual(out.failing, ["flaky"]);
  });

  it("a single fail run among passes makes the combo failing", () => {
    const out = findRedundantCombos(
      [combo("c")],
      [pass("c", ["a"]), pass("c", ["a"]), fail("c", ["a"])],
    );
    assert.deepEqual(out.failing, ["c"]);
    assert.deepEqual(out.kept, ["c"]);
    assert.deepEqual(out.redundant, []);
  });

  it("a failing combo's coverage still counts toward making another combo redundant", () => {
    const out = findRedundantCombos(
      [combo("bad"), combo("dup")],
      [fail("bad", ["x"]), pass("dup", ["x"])],
    );
    // bad is never flagged, so it stays and covers dup fully.
    assert.deepEqual(out.redundant, [{ id: "dup", covered: ["x"] }]);
    assert.deepEqual(out.kept, ["bad"]);
    assert.deepEqual(out.failing, ["bad"]);
  });

  it("sorts the failing list ascending regardless of input order", () => {
    const out = findRedundantCombos(
      [combo("zeta"), combo("alpha"), combo("mid")],
      [fail("zeta", ["1"]), fail("alpha", ["2"]), pass("mid", ["3"])],
    );
    assert.deepEqual(out.failing, ["alpha", "zeta"]);
  });
});

describe("findRedundantCombos — combos with no runs", () => {
  it("reports combos with zero runs in no_runs and never flags them", () => {
    const out = findRedundantCombos(
      [combo("ghost"), combo("full"), combo("part")],
      [pass("full", ["a", "b"]), pass("part", ["a"])],
    );
    assert.deepEqual(out.no_runs, ["ghost"]);
    assert.deepEqual(
      out.redundant.map((r) => r.id),
      ["part"],
    );
    assert.deepEqual(out.kept, ["full"]);
    assert.equal(out.total_combos, 3);
    assert.equal(out.total_runs, 2);
  });

  it("sorts no_runs ascending and excludes them from kept and failing", () => {
    const out = findRedundantCombos(
      [combo("z-none"), combo("ran"), combo("a-none")],
      [pass("ran", ["k"])],
    );
    assert.deepEqual(out.no_runs, ["a-none", "z-none"]);
    assert.deepEqual(out.kept, ["ran"]);
    assert.deepEqual(out.failing, []);
  });

  it("a no-runs combo provides no coverage for the scan", () => {
    // If the ghost's (nonexistent) runs counted, nothing could
    // be concluded anyway; the scan only uses eligible combos,
    // so "solo" with a unique key is kept.
    const out = findRedundantCombos(
      [combo("ghost"), combo("solo")],
      [pass("solo", ["only-key"])],
    );
    assert.deepEqual(out.redundant, []);
    assert.deepEqual(out.kept, ["solo"]);
    assert.deepEqual(out.no_runs, ["ghost"]);
  });
});

describe("findRedundantCombos — validation", () => {
  const oneCombo = [combo("a")];
  const oneRun = [pass("a", ["k"])];

  it("rejects missing or empty combos and runs", () => {
    assert.throws(() => findRedundantCombos(undefined, oneRun), /combos is required/);
    assert.throws(() => findRedundantCombos([], oneRun), /combos must be a non-empty array/);
    assert.throws(() => findRedundantCombos("nope", oneRun), /combos must be a non-empty array/);
    assert.throws(() => findRedundantCombos(oneCombo, undefined), /runs is required/);
    assert.throws(() => findRedundantCombos(oneCombo, []), /runs must be a non-empty array/);
    assert.throws(() => findRedundantCombos(oneCombo, "nope"), /runs must be a non-empty array/);
  });

  it("rejects a combo or run that is not an object, naming the path", () => {
    assert.throws(() => findRedundantCombos([42], oneRun), /combos\[0\] must be an object/);
    assert.throws(
      () => findRedundantCombos(oneCombo, [pass("a"), "x"]),
      /runs\[1\] must be an object/,
    );
  });

  it("rejects a combo missing its id, naming the path", () => {
    assert.throws(
      () => findRedundantCombos([{ dimensions: {} }], oneRun),
      /combos\[0\]\.id is required/,
    );
  });

  it("rejects an empty or non-string combo id, naming the path", () => {
    assert.throws(
      () => findRedundantCombos([combo("")], oneRun),
      /combos\[0\]\.id must be a non-empty string/,
    );
    assert.throws(
      () => findRedundantCombos([{ id: 42 }], oneRun),
      /combos\[0\]\.id must be a non-empty string/,
    );
  });

  it("rejects a duplicate combo id, naming both paths", () => {
    assert.throws(
      () => findRedundantCombos([combo("a"), combo("b"), combo("a")], oneRun),
      /combos\[2\]\.id duplicates combos\[0\]\.id "a"/,
    );
  });

  it("rejects dimensions that are not an object, naming the path", () => {
    assert.throws(
      () => findRedundantCombos([{ id: "a", dimensions: "linux" }], oneRun),
      /combos\[0\]\.dimensions must be an object/,
    );
    assert.throws(
      () => findRedundantCombos([{ id: "a", dimensions: ["linux"] }], oneRun),
      /combos\[0\]\.dimensions must be an object/,
    );
  });

  it("rejects a non-string dimensions value, naming the path", () => {
    assert.throws(
      () =>
        findRedundantCombos(
          [combo("a"), { id: "b", dimensions: { node: 20 } }],
          oneRun,
        ),
      /combos\[1\]\.dimensions\.node must be a string/,
    );
  });

  it("rejects a run missing its combo or outcome, naming the path", () => {
    assert.throws(
      () => findRedundantCombos(oneCombo, [{ outcome: "pass" }]),
      /runs\[0\]\.combo is required/,
    );
    assert.throws(
      () => findRedundantCombos(oneCombo, [{ combo: "a" }]),
      /runs\[0\]\.outcome is required/,
    );
  });

  it("rejects a non-string run combo, naming the path", () => {
    assert.throws(
      () => findRedundantCombos(oneCombo, [{ combo: 7, outcome: "pass" }]),
      /runs\[0\]\.combo must be a string/,
    );
  });

  it("rejects a run referencing an unknown combination, naming the path", () => {
    assert.throws(
      () =>
        findRedundantCombos(
          [combo("a"), combo("b")],
          [pass("a"), pass("node22-linux")],
        ),
      /runs\[1\]\.combo references unknown combination "node22-linux"/,
    );
  });

  it("rejects an outcome other than pass or fail, naming the path", () => {
    assert.throws(
      () => findRedundantCombos(oneCombo, [run("a", "skipped")]),
      /runs\[0\]\.outcome must be "pass" or "fail"/,
    );
    assert.throws(
      () => findRedundantCombos(oneCombo, [{ combo: "a", outcome: 1 }]),
      /runs\[0\]\.outcome must be "pass" or "fail"/,
    );
  });

  it("rejects a non-array covered field and a non-string covered entry, naming the path", () => {
    assert.throws(
      () => findRedundantCombos(oneCombo, [{ combo: "a", outcome: "pass", covered: "k" }]),
      /runs\[0\]\.covered must be an array/,
    );
    assert.throws(
      () =>
        findRedundantCombos(oneCombo, [
          pass("a", ["ok"]),
          { combo: "a", outcome: "pass", covered: ["ok", 5] },
        ]),
      /runs\[1\]\.covered\[1\] must be a string/,
    );
  });
});
