import { zipSync } from "fflate";
import type { GameRecord, Shot } from "./store";

/** "Export my shots": shots.json plus one JPEG thumbnail per shot, zipped. */
export async function buildExportZip(shots: Shot[], games: GameRecord[] = []): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const rows = [];
  for (const c of shots) {
    const thumb = `thumbs/${c.id}.jpg`;
    files[thumb] = new Uint8Array(await c.thumbBlob.arrayBuffer());
    const { thumbBlob: _, ...row } = c;
    rows.push({ ...row, time: new Date(c.ts).toISOString(), thumb });
  }
  files["shots.json"] = new TextEncoder().encode(JSON.stringify({ exportedAt: new Date().toISOString(), games, shots: rows }, null, 2));
  // JPEGs are already compressed; level 0 keeps export fast on phones.
  const zip = zipSync(files, { level: 0 });
  return new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
