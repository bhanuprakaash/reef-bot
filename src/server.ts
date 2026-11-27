import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { loadBot, runTurn, type Emit } from "./bot.ts";
import { ensureMemory, loadSlack } from "./tools.ts";

const root = path.join(import.meta.dirname, "..");
const botDir = path.join(root, "bots", process.env.BOT ?? "catchup");
const bot = loadBot(botDir);
const memoryDir = path.join(botDir, "memory");
ensureMemory(memoryDir);
const memoryMode: string = process.env.MEMORY ?? bot.memoryMode;
const runsFile = path.join(root, "data", "runs.jsonl");
fs.mkdirSync(path.dirname(runsFile), { recursive: true });

const realSlack = process.env.SLACK === "real";
const slack = realSlack ? null : loadSlack(path.join(root, "fixtures", "slack.json"));
const sessions = new Map<string, { id: string; usd: number }>(); // thread id -> SDK session, its cost so far
const approvals = new Map<string, (r: PermissionResult) => void>();

async function chat(thread: string, prompt: string, emit: Emit, signal: AbortSignal) {
  const started = Date.now();
  const prev = sessions.get(thread);
  const { sessionId, log, result } = await runTurn({
    bot,
    botDir,
    memoryDir,
    memoryMode,
    slack,
    sessionId: prev?.id,
    prompt,
    emit,
    signal,
    approve: (tool, input) => {
      const id = randomUUID();
      emit({ type: "approval", id, tool, input });
      return new Promise((resolve) => {
        approvals.set(id, resolve);
        signal.addEventListener("abort", () => resolve({ behavior: "deny", message: "chat closed" }));
      });
    },
  });
  // total_cost_usd is the session's running total; this reply's cost is the difference.
  const usd = (result?.total_cost_usd ?? 0) - (prev?.usd ?? 0);
  if (sessionId) sessions.set(thread, { id: sessionId, usd: result?.total_cost_usd ?? 0 });
  emit({ type: "done", ok: result?.subtype === "success", ms: Date.now() - started, usd, turns: result?.num_turns });
  fs.appendFileSync(runsFile, JSON.stringify({ at: new Date().toISOString(), thread, prompt, memoryMode, model: bot.model, usd, log }) + "\n");
}

const readBody = (req: http.IncomingMessage) =>
  new Promise<any>((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => resolve(s ? JSON.parse(s) : {}));
  });

http
  .createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/chat") {
      const { thread, text } = await readBody(req);
      res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache" });
      const abort = new AbortController();
      res.on("close", () => abort.abort());
      const emit = (e: Record<string, unknown>) => res.write(JSON.stringify(e) + "\n");
      try {
        await chat(thread, text, emit, abort.signal);
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      res.end();
      return;
    }
    if (req.method === "POST" && req.url === "/approve") {
      const { id, allow, input } = await readBody(req);
      const resolve = approvals.get(id);
      approvals.delete(id);
      resolve?.(allow ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: `${bot.owner} declined.` });
      res.writeHead(resolve ? 204 : 404).end();
      return;
    }
    if (req.url === "/bot") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ name: bot.name, memoryMode, slack: realSlack ? "real, read-only" : "fake" }));
      return;
    }
    res.writeHead(200, { "content-type": "text/html" }).end(fs.readFileSync(path.join(root, "index.html")));
  })
  .listen(Number(process.env.PORT ?? 4700), "127.0.0.1", () => console.log(`${bot.name} on http://127.0.0.1:${process.env.PORT ?? 4700}`));
