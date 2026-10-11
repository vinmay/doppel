// "Need an idea?": 3 starter hints a day from data/twin-ideas.json, picked
// deterministically by date so everyone gets the same three, and a reload
// doesn't reshuffle them.
import data from "../../data/twin-ideas.json";
import { hash } from "./twin";

export const IDEAS: string[] = data.ideas.map((i) => i.text);

const STOP = new Set(["something", "and", "with", "a", "an", "the", "of", "that", "like", "in", "on", "or", "very"]);
const words = (s: string) => (s.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => !STOP.has(w));

export function ideasFor(day: string, n = 3, pool: string[] = IDEAS): string[] {
  // Rank every idea by a per-day hash, then take the first n that share no
  // word with one already picked, so the three hints point different ways.
  const ranked = pool.map((text) => ({ text, k: hash(`${day}|${text}`) })).sort((a, b) => a.k - b.k);
  const out: string[] = [];
  const used = new Set<string>();
  for (const { text } of ranked) {
    const w = words(text);
    if (w.some((x) => used.has(x))) continue;
    out.push(text);
    w.forEach((x) => used.add(x));
    if (out.length === n) return out;
  }
  for (const { text } of ranked) if (out.length < n && !out.includes(text)) out.push(text);
  return out;
}
