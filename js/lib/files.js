import { formatFileSize } from './format.js';

export const MAX_FILE_BYTES = 1_000_000;
const MAX_DATA_URL_LENGTH = 1_400_000; // base64 inflates ~4/3 — keeps RTDB writes small
const MAX_IMAGE_DIM = 1600;

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error(`Couldn't read "${file.name}". Try again.`));
    r.readAsDataURL(file);
  });
}

function loadImage(src, fileName) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't decode image "${fileName}".`));
    img.src = src;
  });
}

function tooBig(file) {
  return new Error(
    `"${file.name}" is too large even after compression (${formatFileSize(file.size)}). ` +
    `Max sendable size is ~1 MB — try a smaller file or send a link.`
  );
}

async function downscaleImage(file) {
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl, file.name);
  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
  if (scale >= 1) {
    if (dataUrl.length > MAX_DATA_URL_LENGTH) throw tooBig(file);
    return dataUrl;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const outType = file.type === 'image/png' || file.type === 'image/gif' ? 'image/png' : 'image/jpeg';
  const out = canvas.toDataURL(outType, 0.85);
  if (out.length > MAX_DATA_URL_LENGTH) throw tooBig(file);
  return out;
}

// Converts a picked File into message attachment data. Throws a friendly
// Error for oversize/unreadable files — callers catch and toast.
export async function fileToMessageData(file, maxBytes = MAX_FILE_BYTES) {
  if (!file) throw new Error('No file selected.');
  if (file.size > maxBytes) {
    throw new Error(
      `"${file.name}" is ${formatFileSize(file.size)} — max ${formatFileSize(maxBytes)}. ` +
      `Images are auto-compressed; for big files, send a drive link instead.`
    );
  }
  if (file.type.startsWith('image/')) {
    const dataUrl = await downscaleImage(file);
    return { type: 'image', dataUrl, fileName: file.name, fileSize: file.size, mime: file.type };
  }
  const dataUrl = await readAsDataURL(file);
  return {
    type: 'file',
    dataUrl,
    fileName: file.name || 'file',
    fileSize: file.size,
    mime: file.type || 'application/octet-stream',
  };
}
