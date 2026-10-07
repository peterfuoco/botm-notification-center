## Context
Backend take-home for Book of the Month
Requirements: docs/REQUIREMENTS.txt (i will add this later)

## Stack
Node.js, TypeScript (strict, don't use 'any'), Koa, MySQL (for Aurora)

## Architecture
- Organize one job per file, separation of concerns
- Separate subfolders for routes, services, data, etc in src

## Rules to Follow
- Plan/Spec mode first for every task. Propose the full plan first
- Implement each task at a time, and check with me before commiting and moving forward. Don't build ahead of the current task
- After each task, run a npm typecheck and test`, then add a row to docs/AI_LOG.md (what was delegated, what I changed/pushed back on).