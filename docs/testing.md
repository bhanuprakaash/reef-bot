# Testing

How we battle-test the bot, and the results so far. Rules for changing prompts after a test:
[lessons.md](lessons.md).

## How

Fake Slack (`fixtures/slack.json`, dates move forward by whole weeks so it stays current), so runs
repeat. Each scenario gets a temp copy of memory and its own Slack; the runner hashes the bot's real
memory before and after to prove it's untouched. Results: `data/tests/<time>/` (git-ignored).

```sh
node test/run.ts                      # tuning set, once each
RUNS=3 node test/run.ts               # 3 runs per scenario: compare pass rates, not single runs
SET=heldout RUNS=3 node test/run.ts   # held-out set: judge changes, never tune to it
node test/run.ts 3 12                 # selected scenarios
```

- **Automatic checks decide pass/fail:** outcomes first (what was sent, memory file contents, tools
  used), then clear facts in the reply. Every scenario also checks that each link in a reply came
  from a tool result or the seeded memory.
- **A Haiku judge is advisory:** answer first, concise, honest, matches expectation (1–5). It sees
  replies and tool names, not tool results, so it sometimes calls true claims unverified.

## Scenarios

**Tuning set** (`test/scenarios.ts`, 1–17), written while shaping the prompt:

- Catch-up: what did I miss (1), anyone waiting on me (2), what did I promise (3), payments outage (4).
- Memory: uses a known preference (5), saves a preference but not a one-off (6), closes a loop into
  done.md (7), trusts Slack over stale memory (8), answers a past question from done.md (9).
- Actions: draft vs. send (10), declined approval (11), edited approval (12).
- Traps: injected instruction in #random (13), private channel (14), "did you send it?" when nothing
  was sent (15), two people named Sam (16), nothing there (17).

**Held-out set** (`test/heldout.ts`, 101–110), written by a separate session that never saw the
prompts: one-thing-first triage, multi-turn reference resolution, a false premise, a question about
something outside Slack, saving then reusing a person fact, refusing to store a password, edited
approval then recall, declined then changed instruction, a message trying to edit memory, a promised
postmortem that never appeared. 106 (password) is expected to fail until the vault exists.

## Results

Catch-up bot, Sonnet 5.5, medium effort, memory push.

| Round | Change | Tuning | Held-out |
| --- | --- | --- | --- |
| Baseline | first core prompt | 12/17 (1 run) | n/a |
| 1 | harness fixes (links, `sent_text`), "only the final message is seen" | 16/17 (1 run) | n/a |
| 2 | memory rules moved to the core; persona trimmed; page shows updates | 47/51 (3 runs) | 26/30 (3 runs) |

Round 2 logs: `data/tests/2026-11-27T16-42-00-740Z/` (tuning), `…T16-44-19-444Z/` (held-out).
Cost ~$0.017 per scenario run, 5–16 s.

What the rounds found:

- **Harness bugs, not the bot:** links read with escaped slashes (a false 3/17); fake links shaped like
  dates, which the model "corrected"; a fake send that didn't return the sent text; a regex that
  flagged "Ravi is no longer waiting".
- **Hidden answer:** the answer lands in a progress update and the final message only says what was
  saved. 3/17 at baseline, 5/81 in round 2 despite the prompt line. The page shows updates now; see
  the open item in [design.md](design.md).
- **Stores a password** (held-out 106, 3/3): a vault decision, not a prompt patch.
- **Still weak: length.** Replies lead well but add unrequested extras and memory notes (judge
  "concise" mostly 2.5–3.5).

## Next

- Variants, 3 runs each, on both sets: memory push/pull/hybrid; Sonnet vs. Haiku; effort levels.
- More held-out scenarios, ideally from real situations in the owner's week.
