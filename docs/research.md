# Research

What always-on agent bots are, what people use them for, how they fail, how a bot owns a task to done, and what to borrow from agent delegation. Condensed from four notes read 2026-11-24 (delegation) and 2026-11-26 (the rest). Claims marked unconfirmed were not verified. Suggestions are suggestions, not decisions.

## The bots

- **Grok Bot (xAI).** Many single-job Bots sharing one cloud VM with a browser, files and a terminal. Skills (playbooks) plus routines (schedule or event triggers). Reached by desktop, mobile, Slack and Teams. Hands coding to Cursor Cloud Agents and attaches their evidence to its reply. [How it works](https://docs.x.ai/grok-bot/how-grok-bot-works.md) · [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations.md)
- **Meta Muse.** One personal agent with its own cloud VM and browser, launched 8 Sep 2026, in the Muse app and WhatsApp. A separate agent must approve anything it sends out. [Meta newsroom](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/)
- **OpenClaw (was Clawdbot).** Open source, self-hosted on the user's own Mac mini, VPS or Pi. Chat over Telegram, WhatsApp, Discord or iMessage. Community skills on ClawHub. [Showcase](https://openclaw.ai/showcase)
- **Claude Tag (Anthropic).** `@Claude` in Slack channels, with channel memory and routines, in an ephemeral cloud sandbox. Public beta on Team and Enterprise. [Claude Tag](https://claude.com/docs/claude-tag)
- **Cursor Automations and Projects; Codex in Slack.** Event or schedule triggered cloud coding agents, and coordinators over them. Covered under "What the labs ship".

## What people use them for

No product publishes usage counts. The ranking uses three signals: the job appears in two or more products (P), it recurs on a schedule or event (R), and a named user says they keep running it or gives a number (U). Rows 1 to 6 have all three; their order is a judgement.

1. **Scheduled sweep and brief** (P, R, U). Read inbox, calendar and Slack on a timer, archive noise, ping only on what needs you, send one digest. Claire Vo's "Chief" sweeps six inboxes hourly; Anthropic runs a daily company brief; OpenClaw users share rollup skills. With coding dispatch, it has the most independent users. [Vo on Grok Bot](https://www.chatprd.ai/how-i-ai/grok-bot-agent-templates-and-workflows)
2. **Driving coding agents from chat** (P, R, U). Talk through the work, say "Go", and the bot splits it into PRs and drives Codex, Claude Code or Cursor agents, often overnight. [Eliason](https://x.com/nateliason/status/2014797672419340435)
3. **PR queue babysitting** (P, R, U). Rebase, apply review, chase CI. Vo cleared about 50 stale PRs in one Friday.
4. **First pass on alerts** (P, R, U). Triage and a first evidence-based report, not the fix. Anthropic reports a 14-minute median to first analysis on its own incidents, with humans merging and deploying. Vendor's own figure. [Claude on call](https://claude.com/blog/ai-ci-cd-on-call)
5. **Family and household coordination** (P, R, U). Daily school and pickup checks; a Sunday household roundup either spouse feeds.
6. **Support and intake triage** (P, R, U). Hourly sweeps that draft replies and refunds.
7. **Money-saving errands** (P, U, not recurring). One user reports $4,200 saved negotiating a car; a forgotten subscription found.

No source shows a bot promoting services between environments. The closest is one OpenClaw user fixing a failed deploy by voice.

## What goes wrong

- **Claiming work not done.** The worst failure seen. A Grok Bot reviewer found it reported checking a document it never opened, and it got worse with more work. [Zen Aegis](https://zenaegis.com/grok-bot-review/) Muse made up a restaurant phone number. [Yahoo Finance](https://finance.yahoo.com/technology/article/metas-muse-is-an-impressively-capable-ai-agent-despite-some-hiccups-173310662.html)
- **Run status is not completion.** Anthropic's docs say a scheduled task's "Succeeded" means the session ended without error, not that the work was done. [Scheduled tasks](https://code.claude.com/docs/en/routines.md)
- **Malicious community skills.** Koi Security found 341 malicious skills among 2,857 audited on ClawHub; 335 installed a macOS infostealer. As reported by The Hacker News; Koi's own report not read. [The Hacker News](https://thehackernews.com/2026/02/researchers-find-341-malicious-clawhub.html)
- **Browser errands break.** Open-ended shopping got stuck; specific requests (one booking) worked. [Vo on Muse](https://www.chatprd.ai/how-i-ai/meta-muse-review-personal-ai-agent)
- **Self-hosting upkeep.** Vo moved about 30 OpenClaw agents to Grok Bot to escape upkeep.
- **Smaller complaints.** Routines need precise setup; the default voice is flat; alert diagnoses are often wrong at first.
- **Shared computer is not a boundary.** All of a user's Grok Bots share one VM, so the docs say not to treat Bots as a security boundary. [Approvals and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy.md)

## Owning a task to done

The best-documented practice is Lauren Tan's (`@poteto`, Grok Bot engineer) open-source `pstack` playbooks. In her setup the bot does not own the task; the workflow does. Grok Bot routines gather context; cloud coding agents do the work.

- **Done is a predicate, set before work starts.** Tests green, repro fixed, all N PRs merged. A time limit is not done. Stop when the predicate holds; never loosen it to call the job finished. [Autonomous run](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/autonomous-run.md)
- **A handoff has four parts:** goal, finish condition, permissions, and an escape hatch (if truly stuck, stop and write up why). [Overnight guide](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/07-overnight.md)
- **Proof is the real app, driven.** A per-app verify skill launches the app, drives the real user path, keeps screenshots or video and checks side effects. A verify skill never run is a draft. Green CI alone never authorizes a merge. [create-verification-skill](https://github.com/cursor/plugins/blob/main/pstack/skills/create-verification-skill/SKILL.md)
- **The verifier did not write the work.** Fresh agents, ideally from a different model family, re-run the gates and audit. An owner never merges on the strength of its own check. [Autopilot-full](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/autopilot-full.md)
- **A decision log.** One row per decision (time, decision, why, evidence, result), read by a reviewer in the morning. [show-me-your-work](https://github.com/cursor/plugins/blob/main/pstack/skills/show-me-your-work/SKILL.md)
- **Judge by side effects, not status text.** An hourly tick probes each worker; summaries can hide a stuck child. Each worker gets a "stuck-after" time.
- **Proceed on the reversible, ask on the rest.** Irreversible actions, outside messages, product or taste calls, and real dead ends go to the person.
- **Earn the loop.** Run it while you watch until it has proved itself.
- **Grok Bot's own pieces.** A coding agent's evidence travels with the reply; its docs suggest asking for a list of what the bot could not verify. [Files and results](https://docs.x.ai/grok-bot/files-and-results.md) Approval cards from background work expire after 30 minutes. [Approvals and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy.md)

## Delegating to coding agents

Durable lessons from the older Reef delegation survey (A2A, Claude Code, Codex, LangGraph, Devin).

- **Start with one lead and workers that report back.** A written brief, the worker's own context, one result. Anthropic, LangChain and Cognition all recommend this shape first. [Anthropic patterns](https://claude.com/blog/multi-agent-coordination-patterns) · [Cognition 2026](https://cognition.com/blog/multi-agents-working)
- **The brief is everything the worker sees.** Objective, output format, tools and boundaries. Vague briefs caused duplicated work and gaps. [Research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- **Keep writes single-threaded.** Parallel agents writing the same code is the failure everyone reports. Extra agents analyse or review.
- **Make "needs input" a state, not prose.** The worker records a question and ends its turn; the answer resumes the same task. A2A calls it `input-required`. Without the state, a question looks like a finished report. Nothing should block inside a tool call waiting for an answer. [A2A spec](https://raw.githubusercontent.com/a2aproject/A2A/main/docs/specification.md)
- **Another agent's message is never the person's consent.** Approvals go up to the person.
- **No source promises exactly-once delivery.** Reliability comes from a durable task record that can be read again and receivers that tolerate duplicates.
- **Cap everything.** Depth, concurrency, rounds and spend, plus a no-progress counter that forces a stop or replan. Slow reply loops between two sessions can run to thousands of messages. [Cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)
- **Show state, not chatter.** A row per worker with its status; the transcript on demand.

## What the labs ship

Handing off a task and walking away is commodity. Judging that the work was done is not.

- **Claude Code scheduled tasks:** schedule, API or GitHub trigger; one run per trigger; success means the session ended. A fired prompt cannot act as approval for actions in the run.
- **Claude Code Projects:** a coordinator starts threads; each thread watches its PR, fixes CI, answers review. An approval must be answered inside the waiting thread. [Projects](https://code.claude.com/docs/en/claude-projects.md)
- **Claude Tag:** posts a checklist in the thread; can follow one PR to merge. "Done" is not defined.
- **Managed Agents Outcomes (API beta):** iterates until a grader in a separate context returns satisfied, up to a cap. The only built-in "done" judge found. [Define outcomes](https://platform.claude.com/docs/en/managed-agents/define-outcomes)
- **Cursor Automations and Projects; Codex in Slack and scheduled tasks:** triggers, cloud agents and coordinators; "done" left to the reader. [Codex in Slack](https://learn.chatgpt.com/docs/third-party/slack)
- Each lab's coordinator drives only its own workers. One small community plugin has Grok Bot route to Claude Code and Codex with cross-model review; its own README says an end-to-end Claude Code run is unproven. [AgwaB/grok-bot-agents](https://github.com/AgwaB/grok-bot-agents)

## Implications for our bot (suggestions)

1. **First job: the scheduled brief.** It has the most evidence and needs only read access plus drafts.
2. **Report only what a tool result shows,** and list what it did not check. This targets the worst failure in every review.
3. **One approval card for every send, post, booking or spend.** Muse, Grok Bot and Claude Tag all gate these.
4. **No open skill marketplace.** A few vetted skills; secrets in Keychain.
5. **Skip shopping and open-ended browser errands for v1.**
6. **Routines a Mac can keep:** schedules and polling, not inbound webhooks. Say when a routine was missed during sleep and catch up on wake.
7. **When coding comes, hold the predicate.** Write the finish condition up front, have a separate verifier (another model where possible) drive the real thing, keep evidence, and show it in chat. Driving both Claude Code and Codex is something no lab's coordinator does.
8. **Delegation shape when needed:** lead plus workers, a `needs_input` state, caps and a stall counter, a durable task record, state rows rather than chatter.

## Not confirmed

- Lauren Tan's talk figures (3,000 to 11,000 PRs a month, about 0.5% reverted) come from third-party write-ups; the transcript was not read. Her own posts give about 1,000 PRs in a month.
- The Grok Bot changelog could not be read (403). The earlier claim that Grok Bot docs describe Cursor's `statusChange` webhooks was wrong: that is in Cursor's docs.
- Whether Grok Bot can dispatch to Claude Code or Codex without a community plugin.
- How often agents in her setup merge with no human. Her post says they do; the playbook allows it only after a clean verifier verdict.
- CNN's Muse review (HTTP 451), Muse pricing (Axios snippet only), Vo's "90% of my day hands off" (podcast summaries only).
- Later OpenClaw security counts (1,184 malicious skills, 30,000+ exposed instances) come from search snippets.
- Peter Yang's "14 best bots" list is paywalled after two bots; no X Space by Lauren Tan could be found.
- Whether a Claude Code subagent can ask its parent and wait for an answer mid-run.
