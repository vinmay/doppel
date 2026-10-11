const EMBED_MAX_SIDE = 1024; // LiteRT resizes to <=1260 patches anyway; this keeps memory low
const THUMB_MAX_SIDE = 512;

async function resizeToJpeg(bmp: ImageBitmap, maxSide: number, quality: number): Promise<Blob> {
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s);
  const h = Math.round(bmp.height * s);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode JPEG"))), "image/jpeg", quality),
  );
}

/** Decode once (honouring EXIF orientation), then make the embed image and thumbnail. */
export async function prepareImage(file: Blob): Promise<{ embedBlob: Blob; thumbBlob: Blob }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const [embedBlob, thumbBlob] = await Promise.all([
      resizeToJpeg(bmp, EMBED_MAX_SIDE, 0.9),
      resizeToJpeg(bmp, THUMB_MAX_SIDE, 0.8),
    ]);
    return { embedBlob, thumbBlob };
  } finally {
    bmp.close();
  }
}
