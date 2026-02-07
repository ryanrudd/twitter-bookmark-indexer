# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Twitter/X bookmark indexer - a tool to organize and search bookmarks. Built with Bun and TypeScript.

## Commands

```bash
bun install          # Install dependencies
bun run start        # Run the application (bun run index.ts)
bun test             # Run tests
bun run index.ts     # Run directly
```

## Tech Stack

- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript with strict mode
- **Package Manager**: Bun (not npm/yarn/pnpm)

## Bun-Specific Guidelines

Use Bun APIs instead of Node.js equivalents:

| Instead of | Use |
|------------|-----|
| `node file.ts` | `bun file.ts` |
| `npm install` | `bun install` |
| `npx` | `bunx` |
| `dotenv` | Bun loads `.env` automatically |
| `express` | `Bun.serve()` |
| `better-sqlite3` | `bun:sqlite` |
| `ioredis` | `Bun.redis` |
| `pg`/`postgres.js` | `Bun.sql` |
| `ws` | Built-in `WebSocket` |
| `node:fs` readFile/writeFile | `Bun.file()` |
| `execa` | `Bun.$\`command\`` |
| `jest`/`vitest` | `bun test` |
| `vite`/`webpack` | `Bun.serve()` with HTML imports |

## Testing

Use Bun's built-in test runner:

```ts
import { test, expect } from "bun:test";

test("example", () => {
  expect(1).toBe(1);
});
```
