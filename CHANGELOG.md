# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `find_redundant_combos` MCP tool and
  `analyze` CLI command finding redundant CI matrix
  combinations from caller-supplied run history.
- Deterministic greedy redundancy scan in ascending id
  order (a flagged combo stops counting as coverage, so of
  two identical-coverage combos the alphabetically-first is
  flagged), empty-coverage combos flagged when they always
  pass, combos that ever failed never flagged, and combos
  with no runs reported separately — with path-naming
  validation errors for unknown run references, duplicate
  ids, bad outcomes, and malformed input.
