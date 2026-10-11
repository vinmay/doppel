// Simulates "no network" for the app: every request gets 503 except POST
// /__report, which still logs to report.log so a headless run can report back.
// Usage: node scripts/dead-server.mjs [port]
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 4173);
createServer((req, res) => {
  if (req.method === "POST" && req.url === "/__report") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      appendFileSync("report.log", `${new Date().toISOString()} ${body}\n`);
      res.end("ok");
    });
    return;
  }
  console.log("503", req.method, req.url);
  res.writeHead(503).end("offline");
}).listen(port, () => console.log(`dead server on ${port}`));
