# Reef bot

Personal-bot mock-up. Before changing anything, read `README.md` (run, layout),
`docs/design.md` (what's decided and why), `docs/testing.md` (how we test, results) and
`docs/lessons.md` (mistakes not to repeat). Don't restate their content here.

## Working here

- Smallest change that does the job; no speculative options or layers.
- Prove changes by running the bot (browser, `curl -N -X POST localhost:4700/chat`, or
  `node test/run.ts`), not by reading code.
- Prompt changes follow `docs/lessons.md`: real cause first (data, tool, UI), general principles
  only, judge on the held-out set with 3 runs.
- Platform rules go in `core.md`; a persona holds only a bot's job and voice.
- A design decision goes into `docs/design.md`; a test result into `docs/testing.md`.
- `data/` holds the owner's email and Slack content: never commit it, never send it off this
  machine.
