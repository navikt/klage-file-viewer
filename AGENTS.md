# AGENTS.md

## Commands
- Install dependencies: `bun i`
- Build the library: `bun run build`
- Run unit tests: `bun test`
- Check types: `bun typecheck`
- Lint and fix code: `bun lint --fix`
- Find unused code: `bun knip`

## Code style
- TypeScript strict mode
- No implicit boolean conversions
- No type coercion
- No single line if statements
- Use arrow functions for callbacks
- Use discriminated unions for type narrowing
- Avoid type casting
- Place helper functions after main functions
- Use early returns to reduce nesting
- Prefer ternary expression in TSX/JSX over guard and default operators

## Tooling notes
- Use `--no-pager` with Git commands that may invoke a pager (e.g., `git --no-pager diff`)
