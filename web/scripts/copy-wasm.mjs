// Self-host the LiteRT-LM WASM runtime so the app works offline
// (the SDK's default is jsDelivr). Output is gitignored.
import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../node_modules/@litert-lm/core/wasm/", import.meta.url));
const dst = fileURLToPath(new URL("../public/litertlm-wasm/", import.meta.url));
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`copied LiteRT-LM wasm -> ${dst}`);
