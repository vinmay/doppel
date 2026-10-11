export interface HuntPrompt {
  id: string;
  text: string;
  hint: string;
  decoys: string[];
}

export interface Pack {
  date: string; // YYYY-MM-DD
  model: string;
  region: string;
  prompts: HuntPrompt[];
}

// Bundled at build time so packs work offline with the app shell.
const modules = import.meta.glob<Pack>("../../data/prompt-packs/*.json", { eager: true, import: "default" });

export const PACKS: Pack[] = Object.values(modules).sort((a, b) => a.date.localeCompare(b.date));

export function findPrompt(promptId: string, packs: Pack[] = PACKS): { pack: Pack; prompt: HuntPrompt } | undefined {
  for (const pack of packs) {
    const prompt = pack.prompts.find((p) => p.id === promptId);
    if (prompt) return { pack, prompt };
  }
  return undefined;
}
