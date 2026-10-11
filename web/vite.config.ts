import { appendFileSync, createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

// Dev/preview-only: lets a browser we can't script (e.g. Windows Edge with a
// real GPU) POST spike/self-test output back to web/report.log.
const reportSink = (): Plugin => {
  const sink = (req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      appendFileSync("report.log", `${new Date().toISOString()} ${body}\n`);
      res.end("ok");
    });
  };
  return {
    name: "report-sink",
    configureServer: (server) => void server.middlewares.use("/__report", sink),
    configurePreviewServer: (server) => void server.middlewares.use("/__report", sink),
  };
};

// Dev/preview-only: serve a locally downloaded model from web/.models/ at
// /models/ (production loads it from Hugging Face). Kept out of public/ so it
// never lands in dist/.
const localModels = (): Plugin => {
  const handler = (req: { url?: string }, res: ServerResponse, next: () => void) => {
    const file = join(".models", decodeURIComponent((req.url ?? "/").split("?")[0]));
    if (!existsSync(file) || !statSync(file).isFile()) return next();
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", statSync(file).size);
    createReadStream(file).pipe(res);
  };
  return {
    name: "local-models",
    configureServer: (server) => void server.middlewares.use("/models", handler),
    configurePreviewServer: (server) => void server.middlewares.use("/models", handler),
  };
};

// Build src/sw.ts to a stable /sw.js and inject the precache list. The list is
// taken from the files actually written to dist/assets (in writeBundle):
// earlier hooks still see chunks Vite deletes later, e.g. the empty JS stub
// for a CSS-only dynamic import, and one 404 in the list makes the service
// worker's install fail. The WASM runtime and test images are left out: the
// service worker caches the one WASM variant a browser uses.
// The vocab vectors (public/vocab-<hash>.bin) are precached too: no shot can be scored without them.
const VOCAB_FILE = JSON.parse(readFileSync("../data/vocab-vectors.json", "utf8")).file;
const DEMO_FILES = ["05-pinecone.jpg", "05-artichoke.jpg", "03-tree-bark.jpg", "03-elephant-skin.jpg", "06-brick-wall.jpg", "06-chocolate-bar.jpg"].map((f) => `demo/${f}`);
const PUBLIC_PRECACHE = ["index.html", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", VOCAB_FILE, "practice/cloud.jpg", "practice/cotton.jpg", ...DEMO_FILES];
const serviceWorker = (): Plugin => ({
  name: "service-worker",
  apply: "build",
  writeBundle(options) {
    const outDir = options.dir!;
    const assets = readdirSync(join(outDir, "assets"))
      .filter((f) => !f.endsWith(".map"))
      .map((f) => `assets/${f}`);
    const precache = [...PUBLIC_PRECACHE, ...assets];
    for (const f of precache) {
      if (!existsSync(join(outDir, f))) throw new Error(`precache entry missing from dist: ${f}`);
    }
    const buildId = Date.now().toString(36);
    const litert = JSON.parse(readFileSync("node_modules/@litert-lm/core/package.json", "utf8")).version;
    const swPath = join(outDir, "sw.js");
    const header = `const __PRECACHE__ = ${JSON.stringify(precache)};\nconst __BUILD_ID__ = ${JSON.stringify(buildId)};\nconst __LITERT_VERSION__ = ${JSON.stringify(litert)};\n`;
    writeFileSync(swPath, header + readFileSync(swPath, "utf8"));
  },
});

export default defineConfig({
  base: "./",
  plugins: [reportSink(), localModels(), serviceWorker()],
  optimizeDeps: { exclude: ["@litert-lm/core"] },
  server: { port: 5173, strictPort: true, fs: { allow: [".."] } },
  build: {
    // Test builds (VITE_ALLOW_FAKE=1) go to their own folder so they can never be deployed.
    outDir: process.env.VITE_ALLOW_FAKE === "1" ? "dist-e2e" : "dist",
    rollupOptions: {
      input: { main: "index.html", sw: "src/sw.ts" },
      output: { entryFileNames: (c) => (c.name === "sw" ? "sw.js" : "assets/[name]-[hash].js") },
    },
  },
});
