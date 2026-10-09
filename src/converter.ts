import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const OFFICE_MIMES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** Locate the LibreOffice binary (plain `soffice` on PATH for macOS/Linux,
 * install-dir lookup on Windows). Throws with install guidance when missing. */
export function resolveSoffice(): string {
  if (process.platform !== 'win32') return 'soffice';
  const candidates = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ];
  for (const c of candidates) {
    try {
      fs.accessSync(c);
      return c;
    } catch {
      // try next
    }
  }
  throw new Error(
    'LibreOffice not found. Install it from https://www.libreoffice.org/download/download-libreoffice/ to print Office documents.',
  );
}

function soffice(paths: string[], outDir: string): Promise<void> {
  let bin: string;
  try {
    bin = resolveSoffice();
  } catch (e) {
    return Promise.reject(e);
  }
  return new Promise((resolve, reject) => {
    execFile(bin, ['--headless', '--convert-to', 'pdf', '--outdir', outDir, ...paths], (err, stdout, stderr) => {
      err ? reject(new Error(`soffice failed: ${stderr || stdout}`)) : resolve();
    });
  });
}

/** Convert an image buffer to a single-page PDF. Handles JPEG/PNG/WEBP via sharp normalization. */
export async function imageToPdf(image: Buffer, mime: string): Promise<Buffer> {
  let png = image;
  if (mime === 'image/webp') png = await sharp(image).png().toBuffer();
  const img = await (mime === 'image/png' || mime === 'image/webp'
    ? sharp(png).metadata().then(() => png)
    : Promise.resolve(png));
  const pdf = await PDFDocument.create();
  const embedded =
    mime === 'image/png' || mime === 'image/webp'
      ? await pdf.embedPng(img)
      : await pdf.embedJpg(img);
  const page = pdf.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  return Buffer.from(await pdf.save());
}

function isPdf(buf: Buffer): boolean {
  return buf.subarray(0, 5).toString('ascii') === '%PDF-';
}

/** Return PDF bytes for dashboard preview (original PDFs pass through, others convert). */
export async function previewPdf(storedPath: string, mime: string): Promise<Buffer> {
  if (mime === 'application/pdf') return fs.promises.readFile(storedPath);
  return fs.promises.readFile(await ensurePdf(storedPath, mime));
}
export async function ensurePdf(downloadPath: string, mime: string): Promise<string> {
  const dir = path.dirname(downloadPath);
  if (mime === 'application/pdf') {
    if (downloadPath.toLowerCase().endsWith('.pdf')) return downloadPath;
    const out = downloadPath + '.pdf';
    await fs.promises.copyFile(downloadPath, out);
    return out;
  }
  if (IMAGE_MIMES.has(mime)) {
    const buf = await fs.promises.readFile(downloadPath);
    if (isPdf(buf)) return downloadPath;
    const pdf = await imageToPdf(buf, mime);
    const out = downloadPath.replace(/\.[a-z0-9]+$/i, '') + '.pdf';
    await fs.promises.writeFile(out, pdf);
    return out;
  }
  if (OFFICE_MIMES.has(mime) || /\.(docx?|pptx?|xlsx?|odt|ods|odp)$/i.test(downloadPath)) {
    await soffice([downloadPath], dir);
    const base = path.basename(downloadPath).replace(/\.[a-z0-9]+$/i, '');
    const out = path.join(dir, base + '.pdf');
    await fs.promises.access(out);
    return out;
  }
  throw new Error(`Unsupported file type: ${mime || downloadPath}`);
}
