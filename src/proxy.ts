// Logs every request the bot sends to Anthropic into data/captures/, then forwards it.
// Run the server with ANTHROPIC_BASE_URL=http://127.0.0.1:4600. Captures hold your email and
// Slack content: they stay in data/, which is git-ignored.
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";

const dir = path.join(import.meta.dirname, "..", "data", "captures");
fs.mkdirSync(dir, { recursive: true });
let n = 0;

http
  .createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const headers = { ...req.headers };
      for (const k of ["authorization", "x-api-key", "cookie"]) if (headers[k]) headers[k] = "REDACTED";
      let parsed: unknown = body.toString();
      try {
        parsed = JSON.parse(body.toString());
      } catch {}
      const file = path.join(dir, `${String(++n).padStart(3, "0")}.json`);
      fs.writeFileSync(file, JSON.stringify({ method: req.method, url: req.url, headers, body: parsed }, null, 2));
      console.log(req.method, req.url, "->", file);
      const up = https.request(
        { host: "api.anthropic.com", path: req.url, method: req.method, headers: { ...req.headers, host: "api.anthropic.com" } },
        (r) => {
          res.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(res);
        },
      );
      up.on("error", (e) => res.writeHead(502).end(e.message));
      up.end(body);
    });
  })
  .listen(4600, "127.0.0.1", () => console.log("capture proxy on http://127.0.0.1:4600"));
