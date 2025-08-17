import { NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { downloadTileFile } from '@/lib/tilesService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function listYearsFromBucket(bucketName: string): Promise<{ name: string; size: number; updated?: string }[]> {
  const storage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
  const bucket = storage.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: 'humans_', delimiter: '/' });
  return files
    .filter((f) => f.name.endsWith('.mbtiles'))
    .filter((f) => !f.name.includes('_lod_'))
    .map((f) => ({ name: f.name, size: Number.parseInt(String(f.metadata.size || '0'), 10), updated: f.metadata.updated }));
}

export async function POST(req: Request) {
  // Optional auth: only enforce if token is configured on the service
  const configuredToken = process.env.WARM_CACHE_TOKEN;
  if (configuredToken) {
    const provided = req.headers.get('x-warm-token');
    if (!provided || provided !== configuredToken) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (process.env.NODE_ENV !== 'production' || !process.env.GCP_PROJECT_ID || !process.env.GCS_BUCKET_NAME) {
    return NextResponse.json({ error: 'Warming only available in production with GCS' }, { status: 400 });
  }

  const concurrency = Number.parseInt(process.env.CACHE_WARMING_CONCURRENCY || '2', 10);
  const bucketName = process.env.GCS_BUCKET_NAME!;

  try {
    const items = await listYearsFromBucket(bucketName);
    if (items.length === 0) {
      return NextResponse.json({ ok: true, warmed: 0, message: 'No tile files found' });
    }

    const queue = [...items];
    let active = 0;
    let warmed = 0;
    const errors: { name: string; error: string }[] = [];

    await new Promise<void>((resolve) => {
      const pump = () => {
        while (active < concurrency && queue.length) {
          const file = queue.shift()!;
          active += 1;
          const gsPath = `gs://${bucketName}/${file.name}`;
          // Construct a TileFile-like object for downloadTileFile
          downloadTileFile({
            exists: true,
            path: gsPath,
            isLocal: false,
            size: file.size,
            mtime: file.updated ? new Date(file.updated) : undefined,
          })
            .then(() => {
              warmed += 1;
            })
            .catch((e) => {
              errors.push({ name: file.name, error: (e as Error).message });
            })
            .finally(() => {
              active -= 1;
              if (queue.length) pump();
              else if (active === 0) resolve();
            });
        }
      };
      pump();
    });

    return NextResponse.json({ ok: true, warmed, total: items.length, errors });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

