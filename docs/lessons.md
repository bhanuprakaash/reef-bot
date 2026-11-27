# Lessons

Mistakes we made shaping the bot, so we don't repeat them. Read before changing prompts, personas or
tests.

## Testing and prompt changes

1. **Don't fix the prompt for each failure.** We changed the prompt after every failing scenario and
   re-ran the same scenarios. A pass then partly means "the prompt fits these questions", not "the bot
   got better". Testing prompts against scenarios is standard; tuning to them is not.
2. **Find the real cause first: data, tool, UI, then prompt.** In the first baseline, 3 of 5 failures
   weren't the bot's fault:
   - Fake links looked like dates (`p202611251120`), so the model "fixed" the year. Fix: real-style
     links in the fixture.
   - The fake send didn't return the sent text, so the bot couldn't know the owner edited it. Fix:
     return `sent_text`.
   - The bot put its answer in progress updates the chat page didn't show. The prompt line ("only the
     final message is seen") cut it from 3 to 1 in 17 but didn't stop it; showing updates in the page
     is the fix.
3. **Change the prompt only for a pattern across several scenarios, written as a general principle
   with its reason.** Never a rule that only makes one scenario pass.
4. **Keep a held-out set.** Scenarios used to tune must not be the only ones used to judge. A second
   set, written by the owner or a separate session and not looked at while tuning, confirms a change
   helped in general.
5. **One run is not a result.** The same scenario passes and fails run to run (the hidden answer hit
   scenario 15, then 16, then 17). Run each scenario at least 3 times, compare pass rates, and check
   that nothing that passed now fails.
6. **The checker can be wrong too.** Two "failures" were our bugs: tool results read with escaped
   slashes (a false 3/17), and a regex that flagged "Ravi is no longer waiting". Look at the reply
   before believing a FAIL.
7. **The judge sees only what we give it.** The Haiku judge saw replies and tool names, not tool
   results, so it called true claims "unverified". Its scores are advisory; automatic checks decide.

## Prompt layers

8. **The persona is what a user writes: the bot's job and voice. Nothing else.** We put platform
   mechanics in the catch-up persona ("remember it in loops.md… move it to done.md"). A user making
   their own bot would never write that, so memory would work differently per bot. How memory works
   (files, archive, what's loaded) belongs to the platform: the core prompt or the tool descriptions.
9. **The core must not depend on the persona.** We added "routine bookkeeping the persona asks for
   needs no mention" to the core. The core holds what's true for every bot on its own.

## Debugging habits

10. **Don't trust a plain-text read of the page.** Reading the chat page as text drops link targets;
    we wrongly reported "no links" on real Slack. Check the run log (`data/runs.jsonl`) instead.
11. **Escape-aware searches.** Tool results arrive JSON-escaped (`https:\/\/…`); a plain pattern finds
    nothing. Unescape before searching or counting.
12. **`total_cost_usd` is the chat's running total, not the reply's.** Per-reply cost is the
    difference. We once called a $0.02 reply "$0.23".
13. **Tests never touch real memory.** A smoke test once wrote fake-Slack loops into the real
    `loops.md`. Tests use a temp copy; the runner hashes real memory before and after.
