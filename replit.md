# Last Stand Bot — Replit Workspace

## Project Overview

**Discord bot** (`artifacts/discord-bot`) + REST API (`artifacts/api-server`) + React dashboard (`artifacts/control-center`) in a **pnpm monorepo**.

The **bot runs on Railway** (Docker, auto-deploy from GitHub). This Replit workspace is the **dev environment** — write code here, push to GitHub, Railway deploys automatically.

---

## How to work on the bot

### 1. Make your changes
Edit files in `artifacts/discord-bot/src/`.

### 2. Typecheck + commit + push
```bash
bash scripts/railway-commit.sh "feat: describe what you changed"
# then gitPush({ branch: "main" }) via CodeExecution
```
- `railway-commit.sh` — typechecks and commits (no push)
- Push is done via Replit's built-in `gitPush()` CodeExecution callback (GitHub OAuth, no token needed)
- Railway auto-deploys from the GitHub push

### 3. Check Railway status (only when needed — costs credits)
```bash
bash scripts/railway-status.sh      # recent deployments
bash scripts/railway-logs.sh        # logs from latest deploy
bash scripts/railway-logs.sh <id>   # logs from a specific deploy
```

---

## Railway helper scripts

| Script | What it does |
|--------|-------------|
| `bash scripts/railway-push.sh "msg"` | Typecheck → commit → push → wait for deploy |
| `bash scripts/railway-status.sh` | Show recent deployment history |
| `bash scripts/railway-logs.sh` | Tail last 100 lines from latest deployment |
| `bash scripts/railway-logs.sh <deployId>` | Logs from a specific deployment |
| `bash scripts/railway-env.sh list` | List all Railway env vars |
| `bash scripts/railway-env.sh set KEY VALUE` | Add/update a Railway env var |

---

## Adding API keys

Drop the key value in chat and I'll run:
```bash
bash scripts/railway-env.sh set KEY_NAME value
```
Then push a dummy commit to redeploy and pick up the new key.

---

## Project structure

```
artifacts/
  discord-bot/   ← bot code (deploys to Railway)
  api-server/    ← Express REST API
  control-center/← React dashboard (Vite)
lib/
  db/            ← Drizzle ORM + PostgreSQL schema (shared)
  api-zod/       ← shared Zod validators
scripts/
  railway-push.sh
  railway-logs.sh
  railway-status.sh
  railway-env.sh
Dockerfile       ← Railway Docker build
```

---

## Railway project IDs (already in env)

- **Project:** `f2bcfbe8-29aa-43a0-b22d-7d2061e18725` (Last Stand Management)
- **Service:** `ba0c3fb3-0de2-4136-8c68-34a0196db19e`
- **Environment:** `118ab811-e2fe-4290-adbe-e6877dd46138` (production)

---

## Embed design philosophy

Every embed must feel like a human sat down and actually wrote it — not a bot templating output. The goal is natural, readable, and clean.

**The feel:**
- Write like a person, not a system. No robotic phrasing like "Operation completed successfully." Say what happened in plain words.
- Straight to the point — don't pad with filler, but don't be so terse it feels cold either. Give it some body.
- Titles should read like something you'd actually say, not a function name.
- Field names should be short and casual — `"from"` not `"Source User"`, `"when"` not `"Timestamp"`.
- If there's context worth showing, show it. A one-liner embed for something complex feels lazy.

**What to avoid:**
- ❌ All-caps field names (`"STATUS"`, `"USER ID"`)
- ❌ Filler phrases ("Here is the result of your query")
- ❌ Repeating the command back ("You ran: mewo help")
- ❌ Walls of fields for simple things — use the description instead
- ❌ Timestamp on every single embed — only add it when it actually matters

**Colors:**
- Error: `0xED4245`
- Success: `0x57F287`
- Info / neutral: `0x5865F2`

**Footer:** always `"mewo • <module>"` — keep it lowercase and simple.

**Other conventions:**
- Every bot response must be a rich embed — never plain text
- All imports use `.js` extension (ES modules)

## User preferences

- Do NOT run the Discord bot locally — typecheck only
- Do NOT set up workflows for the bot
- Use Railway for all bot deployments
- Push to GitHub → Railway auto-deploys via Docker
