# Linting and Formatting

Typhoon uses **oxlint** for linting and **oxfmt** for code formatting. Both are Rust-based tools that are significantly faster than ESLint and Prettier.

## oxfmt (Formatting)

### Configuration

Formatting rules are defined in `.oxfmtrc.json`:

```json
{
  "useTabs": false,
  "tabWidth": 2,
  "printWidth": 120,
  "singleQuote": true,
  "jsxSingleQuote": false,
  "quoteProps": "as-needed",
  "trailingComma": "all",
  "semi": true,
  "arrowParens": "always",
  "bracketSameLine": false,
  "bracketSpacing": true,
  "sortImports": true,
  "sortTailwindcss": {
    "functions": ["clsx", "cn", "cva"]
  },
  "ignorePatterns": ["**/node_modules", "**/dist", "**/.turbo", "**/coverage", "**/.mastra"]
}
```

Key settings:

- **120-character line width** (wider than the 80-char default)
- **Single quotes** for JavaScript/TypeScript strings
- **Double quotes** for JSX attributes
- **Trailing commas** everywhere
- **Import sorting** enabled (auto-groups and alphabetizes imports)
- **Tailwind CSS class sorting** for `clsx`, `cn`, and `cva` functions

### Commands

```bash
# Auto-fix formatting (modifies files in place)
bun run format
# Equivalent to: bunx oxfmt .

# Check formatting without modifying files (fails if any file is unformatted)
bun run format:check
# Equivalent to: bunx oxfmt --check .

# Format a specific file
bunx oxfmt path/to/file.ts
```

### When to Format

- **Before committing:** The Lefthook pre-commit hook runs `oxfmt --check` on staged files. If formatting is wrong, the commit is rejected. Run `bun run format` to fix.
- **During development:** Run `bun run format` periodically or configure your editor to format on save.

## oxlint (Linting)

### Configuration

Lint rules are defined in `.oxlintrc.json`:

```json
{
  "plugins": ["typescript", "unicorn", "oxc", "import", "react", "jsx-a11y", "vitest"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "perf": "warn"
  },
  "rules": {
    "no-var": "error",
    "no-console": "warn",
    "prefer-const": "error",
    "prefer-template": "warn",
    "eqeqeq": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "warn",
    "import/no-default-export": "error",
    "react-hooks/exhaustive-deps": "warn",
    "react/no-array-index-key": "warn",
    "unicorn/prefer-string-replace-all": "warn",
    "unicorn/prefer-at": "warn",
    "vitest/no-focused-tests": "error"
  }
}
```

### Key Rules

| Rule                                 | Level | Rationale                                              |
| ------------------------------------ | ----- | ------------------------------------------------------ |
| `@typescript-eslint/no-explicit-any` | error | Enforce strong typing                                  |
| `import/no-default-export`           | error | Named exports for consistency (config files exempted)  |
| `eqeqeq`                             | error | Prevent type coercion bugs                             |
| `no-var`                             | error | Use `const`/`let` only                                 |
| `prefer-const`                       | error | Immutable by default                                   |
| `vitest/no-focused-tests`            | error | Prevent `.only` tests from being committed             |
| `react-hooks/exhaustive-deps`        | warn  | Catch missing useEffect dependencies                   |
| `no-console`                         | warn  | Use `@typhoon/logger` instead (off in tests and fixtures) |

### Overrides

Rules are relaxed for specific file patterns:

| Files                              | Relaxed Rules                                                  |
| ---------------------------------- | -------------------------------------------------------------- |
| `**/*.config.ts`, `**/*.config.js` | `import/no-default-export` off (config files need defaults)    |
| `**/*.test.ts`, `**/*.test.tsx`    | `no-explicit-any` off, `no-console` off                        |
| `**/tests/e2e/**`                  | `vitest/expect-expect` off, `vitest/no-conditional-expect` off |
| `**/components/ui/**/*.tsx`        | Various jsx-a11y rules off (vendor-like shadcn components)     |
| `**/fixtures/**`, `**/seed/**`     | `no-console` off                                               |
| `**/packages/logger/**`            | `no-console` off (logger itself uses console)                  |

### External Plugins

The config also integrates external ESLint plugins via `jsPlugins`:

- `@tanstack/eslint-plugin-query` -- TanStack Query best practices
- `@tanstack/eslint-plugin-router` -- TanStack Router best practices
- `eslint-plugin-drizzle` -- Drizzle ORM usage rules
- `eslint-plugin-react-refresh` -- React Refresh boundary rules

### Commands

```bash
# Run linter on entire project
bun run lint
# Equivalent to: bunx oxlint .

# Run format check + lint + typecheck (full quality check)
bun run check
# Equivalent to: bunx oxfmt --check . && bunx oxlint . && turbo run typecheck

# Lint a specific file
bunx oxlint path/to/file.ts
```

### Suppression Policy

**Avoid `// oxlint-disable-next-line` suppressions.** Fix the underlying issue instead. Only suppress as a last resort, and include a clear explanation of why the suppression is necessary:

```typescript
// Bad -- no explanation
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = response.body;

// Acceptable -- clear justification
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- third-party library returns untyped data
const data: any = thirdPartyLib.parse(raw);
```

## Lefthook Git Hooks

Lefthook is installed via `bun install` (the `postinstall` script runs `lefthook install` when a `.git` directory exists). It runs checks at two stages:

### Pre-Commit (fast, file-scoped)

Runs format and lint checks in parallel on staged files before every commit:

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    format-check:
      glob: '*.{ts,tsx,js,jsx,json,css}'
      run: bunx oxfmt --check --no-error-on-unmatched-pattern {staged_files}
    lint:
      glob: '*.{ts,tsx,js,jsx}'
      run: bunx oxlint {staged_files}
```

| Hook         | What it checks                          | Scope        |
| ------------ | --------------------------------------- | ------------ |
| format-check | Files are formatted per `.oxfmtrc.json` | Staged files |
| lint         | No lint violations per `.oxlintrc.json` | Staged files |

### Pre-Push (full project typecheck)

Runs the TypeScript typecheck across all packages before every push:

```yaml
# lefthook.yml
pre-push:
  commands:
    typecheck:
      run: bun run typecheck
```

| Hook      | What it checks       | Scope          |
| --------- | -------------------- | -------------- |
| typecheck | No TypeScript errors | Entire project |

### Fixing Hook Failures

If any hook fails, the commit or push is rejected. To fix:

```bash
# Fix formatting
bun run format

# Fix lint issues (manual -- oxlint does not auto-fix)
# Read the error message, fix the code

# Fix type errors
bun run typecheck   # See the errors
# Fix the code

# Retry the commit/push
git add .
git commit -m "your message"
git push
```

## Editor Integration

### VS Code

For the best experience, configure VS Code to format on save using oxfmt. Since oxfmt is a newer tool, check for available extensions or use the CLI-based format-on-save approach:

```json
// .vscode/settings.json (project-level)
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "oxfmt.oxfmt-vscode"
}
```

If no VS Code extension is available, rely on the pre-commit hook to catch formatting issues.

## Ignored Paths

Both oxlint and oxfmt ignore the same paths:

- `**/node_modules`
- `**/dist`
- `**/.turbo`
- `**/coverage`
- `**/.mastra`
