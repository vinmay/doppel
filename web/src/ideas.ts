// "Need an idea?": 3 starter hints a day from data/twin-ideas.json, picked
// deterministically by date so everyone gets the same three, and a reload
// doesn't reshuffle them.
import data from "../../data/twin-ideas.json";
import { hash } from "./twin";

export const IDEAS: string[] = data.ideas.map((i) => i.text);

export function ideasFor(day: string, n = 3, pool: string[] = IDEAS): string[] {
  // Rank every idea by a per-day hash; take the first n. Stable and evenly mixed.
  return pool
    .map((text) => ({ text, k: hash(`${day}|${text}`) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, n)
    .map((x) => x.text);
}
