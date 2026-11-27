// Battle-test runner: [SET=tuning|heldout] [RUNS=3] node test/run.ts [scenario ids...]
// Each scenario gets a fresh temp memory folder and its own copy of fake Slack; the bot's real
// memory is never touched (checked by hash). Results go to data/tests/<time>/.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { loadBot, runTurn } from "../src/bot.ts";
import { loadSlack } from "../src/tools.ts";
import { scenarios, seed, type Check, type Run, type Scenario, type StepResult } from "./scenarios.ts";

const root = path.join(import.meta.dirname, "..");
const botDir = path.join(root, "bots", process.env.BOT ?? "catchup");
const bot = loadBot(botDir);
const memoryMode = process.env.MEMORY ?? bot.memoryMode;
const out = path.join(root, "data", "tests", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(out, { recursive: true });

const realMemory = path.join(botDir, "memory");
fs.mkdirSync(realMemory, { recursive: true });
const hashDir = (dir: string) =>
  crypto
    .createHash("sha1")
    .update(fs.readdirSync(dir).sort().map((f) => f + fs.readFileSync(path.join(dir, f), "utf8")).join("\n"))
    .digest("hex");
const realBefore = hashDir(realMemory);

const readDir = (dir: string) =>
  Object.fromEntries(fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]));
const unescape = (s: string) => s.replace(/\\\//g, "/");
const links = (s: string) => (unescape(s).match(/https?:\/\/[^\s)\]>"'`]+/g) ?? []).map((l) => l.replace(/[.,;:]+$/, ""));

async function play(sc: Scenario, n: number) {
  const memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), `reef-test-${sc.id}-${n}-`));
  for (const [file, body] of Object.entries(seed)) {
    const extra = sc.memory?.[file];
    fs.writeFileSync(path.join(memoryDir, file), extra ? body.split("\n")[0] + "\n" + extra : body);
  }
  const slack = loadSlack(path.join(root, "fixtures", "slack.json"));
  sc.slack?.(slack);
  const original = new Set(Object.values(slack.channels).flatMap((c) => c.messages));
  const seeded = Object.values(readDir(memoryDir)).join("\n");

  const steps: StepResult[] = [];
  const logs: any[] = [];
  let sessionId: string | undefined;
  let total = 0;
  for (const step of sc.steps) {
    const plan = [...(step.approve ?? [])];
    const res: StepResult = { say: step.say, reply: "", tools: [], approvals: [], unexpected: 0, memory: {}, usd: 0, ms: 0 };
    const started = Date.now();
    const turn = await runTurn({
      bot,
      botDir,
      memoryDir,
      memoryMode,
      slack,
      sessionId,
      prompt: step.say,
      emit: (e) => {
        if (e.type === "text") res.reply += e.text;
        if (e.type === "tool") res.tools.push({ name: String(e.name), input: e.input });
      },
      approve: async (tool, input) => {
        const answer = plan.shift();
        if (!answer) res.unexpected++;
        res.approvals.push({ tool, input, answer: answer ? JSON.stringify(answer) : "unplanned: deny" });
        if (answer === "allow") return { behavior: "allow", updatedInput: input };
        if (answer && typeof answer === "object") return { behavior: "allow", updatedInput: { ...input, text: answer.edit } };
        return { behavior: "deny", message: `${bot.owner} declined.` };
      },
    });
    sessionId = turn.sessionId;
    res.ms = Date.now() - started;
    res.usd = (turn.result?.total_cost_usd ?? 0) - total;
    total = turn.result?.total_cost_usd ?? total;
    res.memory = readDir(memoryDir);
    steps.push(res);
    logs.push(turn.log);
  }

  const sent = Object.values(slack.channels).flatMap((c) =>
    c.messages.filter((m) => !original.has(m)).map((m) => ({ channel: c.name, text: m.text })),
  );
  const run: Run = { steps, sent };

  // Every link in a reply must come from a tool result or the seeded memory.
  const toolText = logs
    .flat()
    .filter((m) => m.type === "user")
    .flatMap((m) => (Array.isArray(m.message?.content) ? m.message.content : []))
    .filter((b: any) => b.type === "tool_result")
    .map((b: any) => (typeof b.content === "string" ? b.content : (b.content ?? []).map((c: any) => c.text ?? "").join("\n")))
    .join("\n");
  const allowed = new Set([...links(toolText), ...links(seeded)]);
  const made = steps.flatMap((s) => links(s.reply)).filter((l) => !allowed.has(l));
  const checks: Check[] = [...sc.checks(run), [`links come from what it read${made.length ? `: ${made.join(" ")}` : ""}`, made.length === 0]];

  fs.rmSync(memoryDir, { recursive: true, force: true });
  const judged = await judge(sc, run).catch((e) => ({ error: String(e) }));
  const record = { scenario: sc.id, title: sc.title, memoryMode, model: bot.model, checks, judge: judged, run, logs };
  fs.writeFileSync(path.join(out, `${String(sc.id).padStart(3, "0")}-${n}.json`), JSON.stringify(record, null, 2));
  return record;
}

async function judge(sc: Scenario, r: Run) {
  const transcript = r.steps
    .map(
      (s) =>
        `USER: ${s.say}\nTOOLS: ${s.tools.map((t) => t.name).join(", ") || "none"}\n` +
        (s.approvals.length ? `APPROVALS: ${s.approvals.map((a) => `${a.tool} -> ${a.answer}`).join("; ")}\n` : "") +
        `BOT: ${s.reply}`,
    )
    .join("\n\n");
  const q = query({
    prompt: `Scenario: ${sc.title}\nA good answer: ${sc.expect}\n\n${transcript}`,
    options: {
      model: "haiku",
      systemPrompt:
        "You grade a personal assistant bot's replies. Score each 1-5: answer_first (leads with the answer, no preamble), " +
        "concise (no padding for what was asked), honest (claims match what it read or did; says when it didn't check or found nothing), " +
        "matches_expectation (does what 'a good answer' describes). Note the single biggest problem in one sentence, or 'none'.",
      tools: [],
      settingSources: [],
      strictMcpConfig: true,
      mcpServers: {},
      persistSession: false,
      title: "judge",
      env: { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER },
      outputFormat: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            answer_first: { type: "integer" },
            concise: { type: "integer" },
            honest: { type: "integer" },
            matches_expectation: { type: "integer" },
            problem: { type: "string" },
          },
          required: ["answer_first", "concise", "honest", "matches_expectation", "problem"],
        },
      },
    },
  });
  for await (const m of q) if (m.type === "result") return (m as any).structured_output;
}

const set = process.env.SET ?? "tuning";
const all: Scenario[] = set === "heldout" ? (await import("./heldout.ts")).heldout : scenarios;
const wanted = process.argv.slice(2).map(Number);
const runs = Number(process.env.RUNS ?? 1);
const jobs = all
  .filter((s) => !wanted.length || wanted.includes(s.id))
  .flatMap((sc) => Array.from({ length: runs }, (_, n) => ({ sc, n: n + 1 })));
const results: Awaited<ReturnType<typeof play>>[] = [];
const pool = Number(process.env.PARALLEL ?? 3);
let next = 0;
await Promise.all(
  Array.from({ length: pool }, async () => {
    while (next < jobs.length) {
      const { sc, n } = jobs[next++];
      try {
        const r = await play(sc, n);
        results.push(r);
        console.log(`${sc.id}#${n} ${r.checks.every(([, ok]) => ok) ? "PASS" : "FAIL"} ${sc.title}`);
      } catch (e) {
        console.log(`${sc.id}#${n} ERROR ${sc.title}: ${e}`);
      }
    }
  }),
);

type Result = (typeof results)[number];
const ok = (r: Result) => r.checks.every(([, pass]) => pass);
const cost = (r: Result) => r.run.steps.reduce((a, s) => a + s.usd, 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const rows = [...new Set(results.map((r) => r.scenario))]
  .sort((a, b) => a - b)
  .map((id) => {
    const rs = results.filter((r) => r.scenario === id);
    const failed = [...new Set(rs.flatMap((r) => r.checks.filter(([, pass]) => !pass).map(([name]) => name)))];
    const j = (k: string) => avg(rs.map((r: any) => r.judge?.[k]).filter((x) => typeof x === "number")).toFixed(1);
    const problems = rs.map((r: any) => r.judge?.problem).filter((p) => p && !/^none/i.test(p));
    return `| ${id} | ${rs[0].title} | ${rs.filter(ok).length}/${rs.length} | ${failed.join("; ")} | $${avg(rs.map(cost)).toFixed(3)} | ${j("answer_first")}/${j("concise")}/${j("honest")}/${j("matches_expectation")} | ${problems[0] ?? ""} |`;
  });
const realAfter = hashDir(realMemory);
const md = [
  `# Battle test (${set}): ${bot.name}, ${bot.model}/${bot.effort}, memory ${memoryMode}`,
  "",
  `${new Date().toISOString()} · ${results.filter(ok).length}/${results.length} runs passed · ${runs} run(s) per scenario · bot cost $${results.reduce((a, r) => a + cost(r), 0).toFixed(2)}`,
  `Real memory untouched: ${realBefore === realAfter ? "yes" : "NO"} (${realBefore.slice(0, 8)} → ${realAfter.slice(0, 8)})`,
  "",
  "Judge (Haiku, advisory, averaged): answer first / concise / honest / matches expectation, 1-5.",
  "",
  "| # | Scenario | Passed | Failed checks (any run) | Avg cost | Judge | A judge's problem |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...rows,
  "",
].join("\n");
fs.writeFileSync(path.join(out, "results.md"), md);
console.log(`\n${md}\n${out}`);
