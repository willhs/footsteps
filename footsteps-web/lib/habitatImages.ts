// Fetch and decode the habitat lookup images (lib/habitat.ts reads them). Each is a 720 × 360
// lossless WebP of ~70-90 KB, requested the first time the cursor rests on a year and cached.
const cache = new Map<string, Promise<Uint8ClampedArray>>();

/** RGBA pixels of a lookup image, byte-exact (no colour conversion, no premultiplying). */
async function decode(url: string): Promise<Uint8ClampedArray> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bmp = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Habitat decoder requires a 2D canvas');
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

export function loadLookup(url: string): Promise<Uint8ClampedArray> {
  let p = cache.get(url);
  if (!p) {
    p = decode(url).catch((error) => {
      cache.delete(url); // allow a retry on the next hover
      throw error;
    });
    cache.set(url, p);
  }
  return p;
}
