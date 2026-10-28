// Procesa archivos en el navegador antes de subirlos: así el servidor recibe
// imágenes ya optimizadas (WebP en varios anchos) y nunca archivos pesados
// innecesarios. Las validaciones se repiten en backend (Storage + SQL).
import { checkUpload } from '../../../domain/validation';
import type { PreparedUpload } from '../../../data/repository';

const IMAGE_WIDTHS = [480, 960, 1600];

export class UploadError extends Error {}

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new UploadError('No se pudo leer la imagen. ¿Está dañada?');
  }
}

async function toWebp(bitmap: ImageBitmap, width: number, quality = 0.8): Promise<Blob> {
  const w = Math.min(width, bitmap.width);
  const h = Math.round((bitmap.height / bitmap.width) * w);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality));
  if (!blob) throw new UploadError('El navegador no pudo convertir la imagen.');
  return blob;
}

async function placeholder(bitmap: ImageBitmap): Promise<string> {
  const blob = await toWebp(bitmap, 20, 0.4);
  return await new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(blob);
  });
}

const baseName = (f: File) => f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();

export async function prepareImage(file: File, alt = ''): Promise<PreparedUpload> {
  const check = checkUpload(file, 'image');
  if (!check.ok) throw new UploadError(check.error);
  const bitmap = await loadBitmap(file);
  const widths = IMAGE_WIDTHS.filter((w, i) => i === 0 || w <= bitmap.width * 1.1);
  const variants = [];
  for (const w of widths) variants.push({ width: Math.min(w, bitmap.width), file: { name: `w${w}.webp`, blob: await toWebp(bitmap, w, w > 1000 ? 0.76 : 0.8) } });
  const main = variants[variants.length - 1].file;
  const result: PreparedUpload = {
    kind: 'image', title: baseName(file), alt, mimeType: 'image/webp',
    bytes: variants.reduce((s, v) => s + v.file.blob.size, 0),
    width: bitmap.width, height: bitmap.height, placeholder: await placeholder(bitmap),
    main, variants, poster: null,
  };
  bitmap.close();
  return result;
}

/** Captura un fotograma del video como póster y lee sus dimensiones. */
async function videoPoster(file: File): Promise<{ blob: Blob; width: number; height: number; duration: number }> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await new Promise<void>((res, rej) => {
      video.onloadeddata = () => res();
      video.onerror = () => rej(new UploadError('El navegador no puede reproducir este video. Usá MP4 (H.264) o WebM.'));
    });
    video.currentTime = Math.min(0.5, video.duration / 2 || 0);
    await new Promise((res) => { video.onseeked = res; });
    const bitmap = await createImageBitmap(video);
    const blob = await toWebp(bitmap, 960, 0.75);
    const out = { blob, width: video.videoWidth, height: video.videoHeight, duration: video.duration };
    bitmap.close();
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareVideo(file: File, title = ''): Promise<PreparedUpload> {
  const check = checkUpload(file, 'video');
  if (!check.ok) throw new UploadError(check.error);
  const poster = await videoPoster(file);
  if (poster.duration > 60) throw new UploadError('El video dura más de 60 segundos. Recortalo para que cargue rápido en celulares.');
  const ext = file.type === 'video/webm' ? 'webm' : 'mp4';
  return {
    kind: 'video', title: title || baseName(file), alt: title || baseName(file), mimeType: file.type, bytes: file.size,
    width: poster.width, height: poster.height, placeholder: null,
    main: { name: `video.${ext}`, blob: file }, variants: [], poster: { name: 'poster.webp', blob: poster.blob },
  };
}
