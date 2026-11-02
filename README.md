# matrixshrink

A CI matrix grows one combination at a time — a new operating
system here, a new runtime version there — and nobody ever
takes one out, because nobody can say which ones are safe to
drop. matrixshrink answers that from evidence. You supply the
combinations in the matrix and the recorded run history —
which combo each run exercised, whether it passed or failed,
and the coverage keys it exercised (test files, feature ids,
whatever you track) — and matrixshrink reports the combos
that can go:

- **Redundant** — a combo is redundant when every one of its
  runs passed and its coverage is fully exercised by the
  combos that stay. The scan is greedy and deterministic:
  eligible combos are visited in ascending id order, and a
  combo once flagged stops counting as coverage for the
  combos scanned after it. So of two combos with identical
  coverage, the alphabetically-first is flagged and the
  second stays — one of them has to remain to hold the
  coverage. An always-passing combo that exercised no
  coverage at all is redundant: the empty set is covered by
  anything, including nothing.
- **Failing** — a combo with even one failed run is never
  redundant. A failure is evidence the combo catches
  something, so it is always kept, it is listed in `failing`,
  and its coverage still counts toward covering other combos.
- **No runs** — a combo with no recorded runs is listed in
  `no_runs` and is never flagged. There is no evidence either
  way, and matrixshrink does not guess.

The report carries each redundant combo with its full
coverage (the union across its runs, sorted), the ids kept,
the ids failing, the ids with no runs, and the totals of
combos and runs supplied.

Validation is strict: a missing or duplicate combo id, a
run naming a combo that was not supplied, an outcome other
than `"pass"` or `"fail"`, a non-string dimension value or
coverage key, and any other malformed field are errors that
name the offending path (for example
`runs[2].combo references unknown combination "node22-linux"`)
and produce no partial report. The computation is pure and
local: no network, no configuration, no files read beyond
the input you pass in.

## CLI

```bash
npx @reneturcios/matrixshrink analyze --input args.json
npx @reneturcios/matrixshrink --version
```

`args.json` contains the full arguments object:

```json
{
  "combos": [
    { "id": "linux-node20", "dimensions": { "os": "linux", "node": "20" } },
    { "id": "linux-node18", "dimensions": { "os": "linux", "node": "18" } },
    { "id": "mac-node20", "dimensions": { "os": "macos", "node": "20" } }
  ],
  "runs": [
    { "combo": "linux-node20", "outcome": "pass", "covered": ["unit", "integration", "e2e"] },
    { "combo": "linux-node18", "outcome": "pass", "covered": ["unit"] },
    { "combo": "mac-node20", "outcome": "fail", "covered": ["unit", "integration"] }
  ]
}
```

`dimensions` is optional per combo (default `{}`) and
`covered` is optional per run (default `[]`). The report is
printed as JSON:

```json
{
  "redundant": [{ "id": "linux-node18", "covered": ["unit"] }],
  "kept": ["linux-node20", "mac-node20"],
  "failing": ["mac-node20"],
  "no_runs": [],
  "total_combos": 3,
  "total_runs": 3
}
```

Exit codes: `0` on success, `1` on a runtime error (including
an unreadable or invalid input file, or invalid input), `2`
on a usage error.

## MCP server

```bash
npx -y @reneturcios/matrixshrink mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "matrixshrink": {
      "command": "npx",
      "args": ["-y", "@reneturcios/matrixshrink", "mcp"]
    }
  }
}
```

### Tools

- `find_redundant_combos` — Find redundant CI matrix
  combinations from run history and coverage overlap.
  - `combos` (array, required, at least one) — combinations
    as `{id, dimensions?}` objects; `id` is unique across
    the set and each `dimensions` value is a string
  - `runs` (array, required, at least one) — recorded runs
    as `{combo, outcome, covered?}` objects; `combo` names a
    supplied combination and `outcome` is `"pass"` or
    `"fail"`

  Returns `{redundant, kept, failing, no_runs, total_combos,
  total_runs}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/matrixshrink
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/matrixshrink analyze --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
