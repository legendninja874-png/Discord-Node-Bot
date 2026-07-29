# mewo Discord Bot — Replit Workspace

## Project Overview

This is the **mewo** Discord bot monorepo — a Node.js/TypeScript project deployed on **Railway** via Docker.

### Stack
- **Runtime:** Node.js 22, pnpm 10 workspace
- **Bot:** `artifacts/discord-bot/` — discord.js v14
- **API:** `artifacts/api-server/` — Express 5 + Drizzle ORM + PostgreSQL
- **Dashboard:** `artifacts/control-center/` — React (not actively used)
- **Shared libs:** `lib/db/`, `lib/api-zod/`, `lib/api-spec/`, `lib/api-client-react/`

## How Development Works

**Do NOT run the bot on Replit.** The bot runs on Railway (Docker). Replit is used for editing code only.

### Workflow
1. Make code changes here in Replit
2. Push to GitHub → Railway auto-deploys via Docker
3. Ask me to check Railway logs/status when needed

### Pushing to GitHub
Uses Replit's built-in GitHub auth — no manual token needed:
```javascript
await gitPush({});
```

### Checking Railway
Use the Railway GraphQL API (token stored as `RAILWAY_TOKEN` secret).
- Project ID: stored in `RAILWAY_PROJECT_ID` env var
- Service ID: stored in `RAILWAY_SERVICE_ID` env var
- Environment ID: stored in `RAILWAY_ENVIRONMENT_ID` env var

### Typechecking (bot only)
```bash
pnpm --filter @workspace/discord-bot run typecheck
```

## Environment Variables

| Key | Where | Purpose |
|-----|-------|---------|
| `RAILWAY_TOKEN` | Replit Secret | Railway API access (logs, status) |
| `RAILWAY_PROJECT_ID` | Env var | Railway project identifier |
| `RAILWAY_SERVICE_ID` | Env var | Railway service identifier |
| `RAILWAY_ENVIRONMENT_ID` | Env var | Railway environment identifier |
| `SESSION_SECRET` | Replit Secret | Express session secret |

## Adding New Bot Secrets / Env Vars to Railway
Drop the key and value in chat — I'll add it to Railway via API.

## User Preferences
- Don't check Railway deployments automatically — only when explicitly asked
- Don't run or configure the control-center dashboard workflow
- Bot runs on Railway, not Replit
