# matrixshrink — Build Report

MCP Rebuild 1000, Batch 14. Original program build from the
packages-100 plan (cluster B #21), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch14/matrixshrink.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `matrixshrink`, npm `@reneturcios/matrixshrink`,
MCP name `io.github.CloudCorpRecords/matrixshrink`, version
`0.1.0`, bin `matrixshrink` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Finds redundant
  CI matrix combinations from run history and coverage
  overlap.", 77 chars ≤100; npm entry carries
  `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/matrixshrink:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/matrixshrink"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`analyze --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/matrixshrink.ts` (core,
  `VERSION = "0.1.0"`)
- `test/matrixshrink.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/matrixshrink`,
  smoke-test server-name assertion `matrixshrink`)

## Tools implemented (1)

- `find_redundant_combos` — arguments: `combos` (array,
  required, minItems 1) of `{id (string, required, non-empty,
  unique), dimensions (object, optional, default {}; values
  are strings)}`, plus `runs` (array, required, minItems 1)
  of `{combo (string, required), outcome (string, required:
  "pass" or "fail"), covered (array of strings, optional,
  default [])}`.

  Returns `{redundant, kept, failing, no_runs, total_combos,
  total_runs}`. A combo is eligible when it has at least one
  run; covered(combo) is the union of `covered` across its
  runs and failing(combo) is true when any run failed. The
  redundancy scan iterates the eligible combos in ascending
  id order, maintaining the set flagged so far: an eligible
  combo is flagged redundant iff it never failed and its
  covered set is a subset of the union of covered over all
  eligible combos other than itself that are not flagged at
  that moment (kept-so-far plus not-yet-scanned). `redundant`
  lists `{id, covered}` sorted by id (covered sorted
  ascending), `kept` is the eligible unflagged ids sorted
  ascending (including every failing combo), `failing` is
  the eligible ever-failed ids sorted ascending, and
  `no_runs` is the zero-run ids sorted ascending.

  The fixture literal
  (`harness/fixtures/matrixshrink-tools-original.json`) and
  the `src/mcp.ts` literal are identical, with no `$schema`
  and no top-level `additionalProperties`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the fixture,
  per the standing fleet rule (no McpServer/zod schema
  conversion). Every `tools/call` is validated by the core
  itself, so the MCP and CLI paths share one validation
  implementation.
- Validation is path-naming and total, in two passes
  (combos then runs structure/types first, then run-to-combo
  references over the full id set, so runs may name combos
  declared anywhere in the array): missing/empty `combos`
  or `runs`, a combo missing `id`, an empty/non-string or
  duplicate id, `dimensions` present but not an object or
  with a non-string value, a run missing `combo`/`outcome`,
  a non-string run `combo`, a run naming no supplied combo,
  an `outcome` other than "pass"/"fail", a non-array
  `covered`, or a non-string `covered` entry throws an Error
  naming the offending path (e.g.
  `runs[2].combo references unknown combination "node22-linux"`)
  and produces no partial result (MCP: `isError`; CLI:
  exit 1).
- The greedy scan's pinned consequences are all test-locked:
  identical coverage flags the alphabetically-first combo
  only (three identical combos flag the first two and keep
  the last, because each flagged combo stops counting as
  coverage); an always-passing combo with an empty covered
  set is redundant even as the only combo (empty set ⊆ any
  union); a combo that ever failed is never redundant, but
  its coverage still counts toward flagging others; a combo
  with zero runs is never redundant and contributes no
  coverage.
- Local choices where the spec is silent (see also
  "Gaps"): `dimensions` is type-validated but does not
  appear in the result or affect the scan, because the spec
  fixes the output object to the six fields above and its
  redundancy rule mentions only runs and coverage; repeated
  keys inside one run's `covered` (and across a combo's
  runs) collapse through the coverage union, which is a set
  by definition.

## Verification (foreground, this session)

- `npx tsc` exit 0 (`dist/cli.js` built)
- `npm test` (`tsx --test test/*.test.ts`): **32 tests,
  32 pass, 0 fail** — subset redundancy with a staying
  cover, unique-key combos kept, coverage union across runs
  sorted in the output, omitted vs empty `covered`,
  input-order determinism, dimensions carried without
  effect, identical-coverage tie handling (two and three
  combos), empty-coverage redundancy (solo and alongside
  others), kept-so-far plus not-yet-scanned coverage both
  counting, a combo covered only by a flagged combo being
  kept, failing combos never redundant (single fail among
  passes included), a failing combo's coverage flagging
  another combo, failing list sorting, `no_runs` handling
  (listing, sorting, exclusion from kept/failing, no
  coverage contribution), totals, and every validation path
  (missing/empty/non-array `combos` and `runs`, non-object
  combo/run, missing/empty/non-string id, duplicate id,
  non-object `dimensions`, non-string `dimensions` value,
  missing run `combo`/`outcome`, non-string run `combo`,
  unknown run reference, invalid `outcome`, non-array
  `covered`, non-string `covered` entry)
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `analyze` with no `--input` exits 2;
  `analyze --input <missing file>` exits 1 naming the file;
  `analyze --input <valid file>` exits 0 and prints the
  report JSON (verified against the README's hand-checked
  example: redundant `[{linux-node18, [unit]}]`, kept
  `[linux-node20, mac-node20]`, failing `[mac-node20]`);
  `analyze --input <invalid file>` exits 1 with
  `runs[1].combo references unknown combination "node22-linux"`
- Parity: `harness/parity.py` vs
  `harness/fixtures/matrixshrink-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (run with the
  absolute rebuild path, as in publishorder's report; the
  harness does not expand a `~` inside the quoted rebuild
  string)

## Lockfile status

`package-lock.json` generated clean via Route 3 (temp copy
without `node_modules`/`dist`/`package-lock.json`, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/matrixshrink`, **128 package entries**. Local
`node_modules` was installed via `npm install
--ignore-scripts --offline` for build/test; gitignored.

## Gaps / honest notes

- **`dimensions` in the schema:** the spec defines
  `dimensions` as an object mapping dimension names to
  string values without fixing its JSON Schema shape. The
  schema literal represents it as
  `{type: "object", additionalProperties: {"type": "string"}}`
  — the standard string-map encoding — in both `src/mcp.ts`
  and the fixture, so parity is exact either way.
- **Non-string run `combo` wording:** the spec requires a
  run missing `combo` to error and a run naming no supplied
  combo to error, without fixing the message for a
  present-but-non-string `combo`; the message used is
  `runs[<i>].combo must be a string`, checked before the
  unknown-reference pass.
- **Duplicate-name error wording:** the spec requires a
  duplicate-id error naming the offending path without
  fixing the wording; the message used is
  `combos[<i>].id duplicates combos[<first>].id "<id>"`.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
