import { expect, test } from "@playwright/test";

// Link preview: og/twitter tags in the built index.html, and a 1200x630 PNG.
test("built index.html has the link-preview tags and the og image exists @small", async ({ request }) => {
  const html = await (await request.get("/")).text();
  for (const tag of [
    /<meta property="og:title" content="Doppel[^"]*">/,
    /<meta property="og:description" content="[^"]{40,}">/,
    /<meta property="og:image" content="https:\/\/doppel-ws59\.onrender\.com\/og\.png">/,
    /<meta property="og:image:width" content="1200">/,
    /<meta property="og:image:height" content="630">/,
    /<meta name="twitter:card" content="summary_large_image">/,
  ]) expect(html).toMatch(tag);
  const img = await request.get("/og.png");
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toContain("image/png");
  const b = await img.body();
  expect(b.readUInt32BE(16)).toBe(1200); // PNG IHDR width
  expect(b.readUInt32BE(20)).toBe(630); // PNG IHDR height
});
