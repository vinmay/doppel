// Serves a deployed Warmr (or Sense Hunt) site byte-for-byte on localhost, plus POST
// /__report -> report.log, so headless Edge can self-test the *live build*
// (and the real Hugging Face model download) and report back.
// Usage: node scripts/live-proxy.mjs https://sense-hunt.onrender.com [port]
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const [origin = "https://sense-hunt.onrender.com", port = "4174"] = process.argv.slice(2);
createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/__report") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      appendFileSync("report.log", `${new Date().toISOString()} ${body}\n`);
      res.end("ok");
    });
    return;
  }
  try {
    const up = await fetch(origin + req.url, { headers: { "user-agent": req.headers["user-agent"] ?? "" } });
    const headers = Object.fromEntries([...up.headers].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding"].includes(k)));
    res.writeHead(up.status, headers);
    res.end(Buffer.from(await up.arrayBuffer()));
  } catch (e) {
    res.writeHead(502).end(String(e));
  }
}).listen(Number(port), () => console.log(`proxying ${origin} on http://localhost:${port}`));
