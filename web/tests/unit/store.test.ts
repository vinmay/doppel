import "fake-indexeddb/auto";
import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { buildExportZip } from "../../src/export";
import {
  _resetDbForTests, addShot, clearAll, getGame, getMeta, getShot, listGames, listShots, putGame, setMeta, type Shot,
} from "../../src/store";

const shot = (id: string, ts: number, extra: Partial<Shot> = {}): Shot => ({
  id, ts, day: "2026-10-10", temperature: 40, rank: 12, of: 446, band: 2, won: false,
  thumbBlob: new Blob([`jpeg-${id}`], { type: "image/jpeg" }), ...extra,
});

beforeEach(async () => {
  _resetDbForTests();
  await clearAll();
});

describe("store", () => {
  it("adds shots and lists them by day, oldest first", async () => {
    await addShot(shot("b", 3000));
    await addShot(shot("a", 1000));
    await addShot(shot("c", 2000, { day: "2026-10-11" }));
    expect((await listShots("2026-10-10")).map((s) => s.id)).toEqual(["a", "b"]);
    expect((await listShots()).map((s) => s.id)).toEqual(["a", "c", "b"]);
    expect((await getShot("a"))?.rank).toBe(12);
  });

  it("stores the thumbnail blob", async () => {
    await addShot(shot("t", 1));
    expect((await getShot("t"))?.thumbBlob).toBeDefined();
  });

  it("games and meta round-trip; clearAll wipes everything", async () => {
    await putGame({ day: "2026-10-10", status: "won", endedAt: 5 });
    await setMeta("seen", true);
    await addShot(shot("x", 1));
    expect(await getGame("2026-10-10")).toEqual({ day: "2026-10-10", status: "won", endedAt: 5 });
    expect(await getMeta("seen")).toBe(true);
    await clearAll();
    expect(await listShots()).toEqual([]);
    expect(await listGames()).toEqual([]);
    expect(await getMeta("seen")).toBeUndefined();
  });
});

describe("export", () => {
  it("zips shots.json and one thumbnail per shot, without the blob in JSON", async () => {
    const zip = await buildExportZip([shot("a", Date.UTC(2026, 9, 8)), shot("b", Date.UTC(2026, 9, 9))], [{ day: "2026-10-10", status: "playing" }]);
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["shots.json", "thumbs/a.jpg", "thumbs/b.jpg"]);
    expect(new TextDecoder().decode(files["thumbs/a.jpg"])).toBe("jpeg-a");
    const json = JSON.parse(new TextDecoder().decode(files["shots.json"]));
    expect(json.shots).toHaveLength(2);
    expect(json.games).toHaveLength(1);
    expect(json.shots[0]).not.toHaveProperty("thumbBlob");
    expect(json.shots[0].time).toBe("2026-10-08T00:00:00.000Z");
  });
});
