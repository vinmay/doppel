// The prompt packs for Node-side test code (packs.ts uses import.meta.glob, which only Vite has).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Pack } from "../../src/packs";

const dir = path.join(import.meta.dirname, "../../../data/prompt-packs");
export const PACKS_FOR_NODE: Pack[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")));

export const VOCAB_FOR_NODE: string[] = JSON.parse(readFileSync(path.join(import.meta.dirname, "../../../data/vocab.json"), "utf8")).items.map(
  (i: { text: string }) => i.text,
);
