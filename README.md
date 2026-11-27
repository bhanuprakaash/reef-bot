# Reef bot (mock-up)

A personal bot you chat with on your Mac: simple on the surface, Slack (and later more) underneath.
A mock-up to learn how a bot should behave before building the product. Why and what's decided:
[docs/design.md](docs/design.md).

## Run

Needs Node 22.6+ (runs TypeScript directly) and Claude Code signed in.

```sh
npm install
npm start          # fake Slack, http://127.0.0.1:4700
npm run real       # your real Slack, read-only, http://127.0.0.1:4701
npm test           # battle tests; see docs/testing.md
```

Settings: `BOT=catchup` (folder under `bots/`), `MEMORY=push|pull|hybrid`, `PORT`. Real Slack reuses
the Claude Slack plugin's sign-in from Claude Code.

To see what goes to Anthropic: `npm run proxy`, then start `src/server.ts` with
`ANTHROPIC_BASE_URL=http://127.0.0.1:4600`. Requests land in `data/captures/`.

`data/` holds run logs and captures with your email and Slack content. It's git-ignored.

## Layout

```text
core.md            core prompt shared by every bot
bots/<name>/       bot.json (model, effort, memory mode), persona.md, memory/*.md
src/bot.ts         one bot turn: query() with lean options, tools, approvals
src/tools.ts       fake Slack and memory tools (in-process MCP servers)
src/server.ts      chat server, approval cards, run log
src/proxy.ts       capture proxy
index.html         chat page
test/              scenarios.ts (tuning), heldout.ts, run.ts (runner, checks, judge)
fixtures/          fake Slack snapshot
docs/              design, testing, lessons, research
```
