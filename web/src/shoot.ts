// One shot: photo -> embedding (on device) -> temperature and rank against
// today's secret -> saved locally. Only the thumbnail and the numbers are
// stored; the photo embedding is thrown away.
import { prepareImage } from "./capture";
import { getEmbedder, isFakeEmbedder } from "./embed";
import type { GameState, Secret } from "./game";
import { recordShot } from "./play";
import { scoreShot } from "./score";
import { newId, type Shot } from "./store";
import { loadVocab } from "./vocab";

export async function takeShot(
  game: GameState,
  secret: Secret,
  file: File,
  onStatus: (s: string) => void = () => {},
): Promise<{ game: GameState; shot: Shot }> {
  onStatus("Developing…");
  const [{ embedBlob, thumbBlob }, vocab] = await Promise.all([prepareImage(file), loadVocab()]);
  onStatus("Reading the photo on your phone…");
  const embedder = getEmbedder();
  await embedder.ready();
  let photo = await embedder.embedImage(embedBlob);
  // Test mode only (?embedder=fake): a fixture named win*.jpg "is" the secret,
  // so end-to-end tests can finish a game.
  if (isFakeEmbedder() && file.name.startsWith("win")) {
    photo = vocab.vectors.slice(secret.vocabIndex * vocab.dim, (secret.vocabIndex + 1) * vocab.dim);
  }
  const s = scoreShot(photo, vocab.vectors, secret.vocabIndex);
  const shot: Shot = {
    id: newId(),
    day: game.day,
    ts: Date.now(),
    temperature: s.temperature,
    rank: s.rank,
    of: s.of,
    band: s.band,
    won: s.won,
    thumbBlob,
  };
  return { game: await recordShot(game, shot), shot };
}
