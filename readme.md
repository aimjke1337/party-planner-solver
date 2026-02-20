# Party Planner Solver

A lightweight frontend + solver for configuring and optimizing a 6x6 Party Planner board.

## Run

No build is required.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Features implemented

- 6x6 board with drag & drop placement for characters and items.
- Character editor with 3 local needs and 1 global need.
- Activation logic with 8-neighbor checks and dependency perks.
- Unlimited and budgeted solve modes.
- Configurable prices + cost perks.
- Solver objective: maximize satisfied needs (`K`) and multiplier (`1 + 0.25 * K`), with tie-breakers for lower spend and fewer items.
- Inactive items are visually marked and excluded from need counts.

## Notes

- Solver currently uses stochastic local search with seeded randomness (fast and generic, but not mathematically guaranteed global optimum for all scenarios).
- Output includes diagnostics for satisfied/unsatisfied needs and global counts.
