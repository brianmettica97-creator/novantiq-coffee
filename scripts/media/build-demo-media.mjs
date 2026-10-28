// Descarga y optimiza los recursos de la demo (fotos y videos) declarados en
// demo-media.manifest.json. Genera WebP en varias resoluciones, un placeholder
// difuso (LQIP) por foto, videos H.264 recortados sin audio y sus pósters.
//
// Uso: node scripts/media/build-demo-media.mjs [--force]
// Los archivos generados se versionan en public/demo; el script solo hace falta
// para regenerarlos.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(join(root, 'scripts/media/demo-media.manifest.json'), 'utf8'));
const force = process.argv.includes('--force');
const outDir = join(root, manifest.outDir);
const cacheDir = join(root, '.cache/demo-media');
const WIDTHS = [480, 960, 1600];

for (const d of ['img', 'video', cacheDir]) mkdirSync(d === cacheDir ? d : join(outDir, d), { recursive: true });

async function download(url, file) {
  if (existsSync(file) && !force) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Descarga fallida ${res.status}: ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const index = { images: {}, videos: {} };

for (const [key, id] of Object.entries(manifest.images)) {
  const src = join(cacheDir, `${id}.jpg`);
  await download(`https://images.unsplash.com/photo-${id}?w=1800&q=85&fm=jpg`, src);
  const meta = await sharp(src).metadata();
  const variants = {};
  for (const w of WIDTHS) {
    const file = join(outDir, 'img', `${key}-${w}.webp`);
    if (!existsSync(file) || force) {
      await sharp(src).resize({ width: w, withoutEnlargement: true }).webp({ quality: w > 1000 ? 74 : 78 }).toFile(file);
    }
    variants[w] = `/${manifest.outDir.replace(/^public\//, '')}/img/${key}-${w}.webp`;
  }
  const lqip = await sharp(src).resize({ width: 20 }).blur(1).webp({ quality: 40 }).toBuffer();
  index.images[key] = {
    width: meta.width,
    height: meta.height,
    variants,
    lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
    source: `https://images.unsplash.com/photo-${id}`,
    license: 'Unsplash License',
  };
  console.log('img', key);
}

for (const [key, v] of Object.entries(manifest.videos)) {
  const src = join(cacheDir, `video-${v.id}.mp4`);
  await download(`https://assets.mixkit.co/videos/${v.id}/${v.id}-720.mp4`, src);
  const out = join(outDir, 'video', `${key}.mp4`);
  const poster = join(outDir, 'video', `${key}-poster.webp`);
  if (!existsSync(out) || force) {
    execFileSync(ffmpegPath, [
      '-v', 'error', '-y', '-ss', String(v.start), '-t', String(v.duration), '-i', src,
      '-vf', `scale=${v.width}:-2`, '-an', '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow',
      '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
    ]);
  }
  if (!existsSync(poster) || force) {
    const frame = join(cacheDir, `poster-${key}.png`);
    execFileSync(ffmpegPath, ['-v', 'error', '-y', '-ss', String(v.start + 0.2), '-i', src, '-frames:v', '1', frame]);
    await sharp(frame).resize({ width: v.width }).webp({ quality: 72 }).toFile(poster);
  }
  const base = `/${manifest.outDir.replace(/^public\//, '')}/video`;
  index.videos[key] = {
    src: `${base}/${key}.mp4`,
    poster: `${base}/${key}-poster.webp`,
    bytes: statSync(out).size,
    durationSeconds: v.duration,
    source: `https://mixkit.co (video ${v.id})`,
    license: 'Mixkit Free License',
  };
  console.log('video', key, Math.round(statSync(out).size / 1024), 'KB');
}

const indexFile = join(root, 'src/demo/generated/media-index.json');
mkdirSync(dirname(indexFile), { recursive: true });
writeFileSync(indexFile, JSON.stringify(index, null, 2));
console.log('índice ->', indexFile);
