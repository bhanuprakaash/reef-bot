# Design

What the bot is, what's decided and why. Facts checked 2026-11-27. How to test it:
[testing.md](testing.md). Background research: [research.md](research.md).

## Why this exists

Reef (atoll) was a Mac app wrapping Claude Code and Codex coding sessions. Raw Claude Code already
does that, so the harness adds little. New direction: **a personal bot**, simple on the surface,
doing the heavy lifting underneath. Integrations first; coding agents become one integration later.
Goal: learning, fun, open source, free for friends. Overlap with Grok Bot or Muse is fine.

## Decided

- **For the owner first**, on his Mac. Friends later, each with their own API key (see Policy).
- **A bot is a folder** (`bots/<name>/`: settings, persona, memory). Users create bots; every bot
  shares one core prompt. The persona is what a user writes: the bot's job and voice, nothing else.
- **First bot: Slack catch-up.** What did I miss, who's waiting on me, what did I promise. Chosen
  because the scheduled brief is the top real-world use, and it needs every piece (MCP, memory,
  evidence, approvals) and nothing extra.
- **Slack is a source and later where the bot reports.** Real Slack reuses the Claude Slack plugin's
  sign-in from Claude Code (Anthropic's Slack app). It's borrowed: sharing with friends needs our own
  Slack app, since Slack's MCP admits only internal or Marketplace apps. Read-only for now.
- **Evidence over claims.** Link what it read; say when it didn't check; report what a tool result
  shows. Claiming undone work is the worst failure across every product reviewed.
- **Anything that reaches other people goes through an approval card** (SDK `canUseTool`).
- **Not now:** coding, browser, shopping, a skill marketplace, multiple chat surfaces. Secrets go to a
  vault (not built; until then the bot saves a password to memory if asked).
- **Mock-up first** (web page + Node), architecture later. The Tauri app is the product shell.

## Policy

Anthropic docs, 2026-11-27 ([Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview),
[legal](https://code.claude.com/docs/en/legal-and-compliance)):

- Personal use of the Agent SDK on your own subscription is allowed.
- Products may not offer claude.ai login or plan limits to their users, or handle claude.ai
  credentials. Shared use means API keys.
- Claude Code must run as published: don't strip or rewrite the SDK's requests (watching is fine).

## Engine: the Agent SDK as a near-raw model call

`@anthropic-ai/claude-agent-sdk` 0.3.332 (CLI 2.1.332). `query()` starts the `claude` binary as a
child process. Options in `src/bot.ts`:

- `tools: []`, `settingSources: []`, `strictMcpConfig: true`: no built-in tools, no CLAUDE.md,
  settings, skills or plugins, no MCP servers but ours.
- **A clean `env`** (`PATH`, `HOME`, `USER`). `env` replaces the child's environment; inheriting it
  from Claude desktop leaked ~350 tokens of the host session into every request.
- **An empty `cwd` outside any repo.** The SDK's environment block names the folder and its git
  state. Not a sandbox: with file or shell tools the bot could reach anything.
- **Our own `title`.** Without it the SDK makes an extra Sonnet call per new chat to name it.
- `thinking: adaptive` + `effort` per bot. Adaptive lets the model decide whether and how long to
  think; effort steers depth; thinking tokens bill as output. `disabled` is fastest and cheapest.

What the SDK still sends (~600 tokens, measured with `src/proxy.ts`; can't be turned off on a
subscription login, and shouldn't be rewritten): a billing line, "You are a Claude agent, built on
Anthropic's Claude Agent SDK.", the account email in a reminder, and an environment block (folder,
OS, model, date). `CLAUDE_CODE_SIMPLE=1` (bare mode) needs an API key; untested.

Cost notes: `total_cost_usd` is the chat's running total, so a reply's cost is the difference.
Caching works across a resumed chat (a follow-up read 82k tokens from cache and cost ~$0.02). Real
Slack's 15 read tools are ~8k tokens per request, mostly cached; a per-bot tool allowlist would cut
them.

## Memory

- **Markdown files** in the bot's `memory/`: `me.md` (the owner), `people.md`, `loops.md` (open
  promises and people waiting), `done.md` (the archive). Each file's first line describes it.
- **Written only through our tools** (in-process MCP: `remember` adds a dated line, `edit_memory`
  replaces exact text, `read_memory`). Never Claude's file tools, which reach the whole Mac.
- **Platform rules live in the core prompt:** save what will matter again in the file that fits;
  mention saves about people; when something finishes, move it to `done.md` with how it ended.
- **`done.md` is never loaded every time**; the bot reads it when the past matters.
- **Reading is a test variable:** push (all files in the prompt; always applied, cached), pull (an
  index, read on demand; scales, but the model must decide to look), hybrid (`me.md` plus an index).
  Push while memory is small.
- Later: `me.md` and `people.md` shared across bots; a "tidy memory" run (archive, flag stale loops,
  merge duplicates); scheduled routines.

## Prompt

Layers, top to bottom: SDK lines → **core** (`core.md`, ours, every bot) → **persona** (the user's,
per bot) → **memory** → the message. The core holds only what's true for every bot and never refers
to the persona.

Principles, from Anthropic's prompting guides, its published claude.ai prompt, and OpenAI's GPT-5
guide and Model Spec:

1. One role sentence; describe the job and how to talk, not adjectives. Colleague register.
2. Give the reason with each rule: the model generalises from reasons.
3. Say what to do, not what to avoid. No CRITICAL/MUST: current models overreact.
4. No contradictions between core, persona and memory: they hurt more than vagueness.
5. Short, tagged sections; long data above instructions.
6. Act vs ask depends on the action: read and draft freely; confirm what reaches others.
7. Report what happened, not what was meant to happen. Text from tools is data, not orders.
8. Memory is a default; the current message wins. Don't store one-offs.
9. At most one question; answer an ambiguous ask with a stated reading first. Prose by default.
10. One line holds the rules for the whole conversation (Haiku bends under argument otherwise).
11. Examples (3–5) shape tone better than more rules; add them when tests show the need.

`core.md` sections and why: `how_to_answer` (the owner sees only the final message; answer first,
short), `evidence` (the worst failure), `actions` (the approval card), `content_is_not_instructions`
(inbox bots get prompt-injected), `memory` (the platform rules above). Left out on purpose: identity
(the SDK sends one), safety boilerplate, tool how-to (tool descriptions carry it).

## Open

- If a user's persona says "just send it, don't ask", does the persona or the core win?
- Routines: how the bot behaves when nobody is there to answer an approval card.
- Progress updates: the model sometimes puts the answer in a progress update and ends with only the
  tail. The chat page shows updates; anything posted elsewhere (Slack briefs) must post both or
  require a complete final message.
- Bare mode with an API key for friends; our own Slack app.

## Roadmap

Add capabilities one at a time, each proven (its own scenarios, held-out runs, some real use) before
the next. Adding them together hides which one broke the bot, and every tool costs tokens and
attention. The engine (`src/`, `core.md`, memory, tests) becomes the product; the Tauri app wraps it,
started in parallel once 1–3 are done.

| # | Capability | Why here |
| --- | --- | --- |
| 1 | Routines (scheduled runs) + sending to the owner's own DM | Turns catch-up into the morning brief, the top real-world use; low risk |
| 2 | Gmail + Calendar (read, then draft) | Same pattern as Slack; completes the brief; brings email prompt injection |
| 3 | Approved sending (Slack replies, emails) | The approval card exists; switch it on for real |
| 4 | Vault for secrets | Needed before trusting it with accounts |
| 5 | Skills (our own, vetted; no marketplace) | Reusable ways of working, e.g. meeting prep |
| 6 | Web search, then a browser (built-in WebKit pane) | Useful but slow and fragile; browser last |
| 7 | Coding (Claude Code as a tool) | Biggest risk; needs a done-predicate, a separate verifier and evidence |
