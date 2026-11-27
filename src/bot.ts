import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { query, type PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { knownBlock, memoryServer, slackServer, type Slack } from "./tools.ts";

export type Bot = { name: string; owner: string; slackUser: string; model: string; effort: string; memoryMode: string };
export type Emit = (e: Record<string, unknown>) => void;
export type Approve = (tool: string, input: Record<string, unknown>) => Promise<PermissionResult>;

const root = path.join(import.meta.dirname, "..");
// Outside any repo: the SDK's environment block names this folder and its git state.
const workDir = path.join(os.tmpdir(), "reef-bot-work");
fs.mkdirSync(workDir, { recursive: true });

export const loadBot = (botDir: string): Bot => JSON.parse(fs.readFileSync(path.join(botDir, "bot.json"), "utf8"));

// SLACK=real: the official Slack MCP (reuses Claude Code's stored sign-in), read-only for testing.
// Known writes are hidden from the model; anything else not on the read list is denied.
const slackReads = new Set(
  "read_channel read_thread read_canvas read_file read_list read_list_comments read_user_profile search_channels search_emojis search_public search_public_and_private search_users list_user_channels list_channel_members get_reactions"
    .split(" ")
    .map((t) => `mcp__slack__slack_${t}`),
);
const slackWrites =
  "send_message send_message_draft schedule_message add_reaction add_list_comment add_list_record create_canvas create_conversation create_list update_canvas update_list update_list_comment update_list_record get_file_upload_url complete_file_upload"
    .split(" ")
    .map((t) => `mcp__slack__slack_${t}`);
const realSlackServer = {
  type: "http" as const,
  url: "https://mcp.slack.com/mcp",
  oauth: { clientId: "1601185624273.8899143856786", callbackPort: 3118 },
  alwaysLoad: true,
};
const needsApproval = new Set(["mcp__slack__send_message"]);

function systemPrompt(bot: Bot, botDir: string, memoryDir: string, memoryMode: string) {
  const fill = (s: string) => s.replaceAll("{owner}", bot.owner).replaceAll("{today}", new Date().toDateString());
  return fill(fs.readFileSync(path.join(root, "core.md"), "utf8"))
    .replace("{persona}", fill(fs.readFileSync(path.join(botDir, "persona.md"), "utf8")).trim())
    .replace("{memory}", knownBlock(memoryDir, memoryMode));
}

export type Turn = {
  bot: Bot;
  botDir: string;
  memoryDir: string;
  memoryMode: string;
  slack: Slack | null; // null: real Slack
  sessionId?: string;
  prompt: string;
  emit: Emit;
  approve: Approve;
  signal?: AbortSignal;
};

// One user message through the bot. Returns the session to resume and the SDK messages.
export async function runTurn(t: Turn) {
  const log: any[] = [];
  let sessionId = t.sessionId;
  const real = t.slack === null;
  const run = query({
    prompt: t.prompt,
    options: {
      model: t.bot.model,
      effort: t.bot.effort as any,
      thinking: { type: "adaptive" },
      systemPrompt: systemPrompt(t.bot, t.botDir, t.memoryDir, t.memoryMode),
      title: "chat", // our own title: stops the SDK's extra title-generation call
      tools: [],
      settingSources: [],
      strictMcpConfig: true,
      mcpServers: {
        slack: real ? realSlackServer : slackServer(t.slack!, t.bot.slackUser),
        memory: memoryServer(t.memoryDir, t.memoryMode, t.emit),
      },
      disallowedTools: real ? slackWrites : [],
      cwd: workDir,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER,
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL, // set to capture requests (proxy.ts)
      },
      resume: t.sessionId,
      includePartialMessages: true,
      canUseTool: async (name, input) => {
        if (real && name.startsWith("mcp__slack__") && !slackReads.has(name))
          return { behavior: "deny", message: "Slack is read-only in this test." };
        if (!needsApproval.has(name)) return { behavior: "allow", updatedInput: input };
        return t.approve(name.replace(/^mcp__\w+__/, ""), input);
      },
    },
  });
  t.signal?.addEventListener("abort", () => run.interrupt().catch(() => {}));

  let result: any;
  for await (const m of run) {
    log.push(m);
    if (m.type === "system" && m.subtype === "init") sessionId = m.session_id;
    if (m.type === "stream_event" && m.event.type === "content_block_delta" && m.event.delta.type === "text_delta")
      t.emit({ type: "text", text: m.event.delta.text });
    if (m.type === "assistant")
      for (const b of m.message.content)
        if (b.type === "tool_use") t.emit({ type: "tool", name: b.name.replace(/^mcp__/, "").replace("__", "."), input: b.input });
        // Progress updates (thinking display "updates"): the model treats them as seen, so show them.
        else if (b.type === "thinking" && b.thinking) t.emit({ type: "update", text: b.thinking });
    if (m.type === "result") result = m;
  }
  return { sessionId, log, result };
}
