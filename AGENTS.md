# AGENTS.md

## Commands
- Install dependencies: `bun i`
- Build the library: `bun run build`
- Run unit tests: `bun test`
- Check types: `bun run typecheck`
- Lint and fix code: `bun run lint --fix`

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
