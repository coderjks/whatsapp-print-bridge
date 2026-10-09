import { spawn } from 'node:child_process';
import type { DatabaseSync } from 'node:sqlite';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ColorMode } from './config.js';
import { getSetting } from './queue.js';

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${cmd} exited ${code}: ${stderr}`)),
    );
  });
}

export async function listPrinters(): Promise<string> {
  try {
    const { stdout } = await run('lpstat', ['-p', '-d']);
    return stdout;
  } catch (e) {
    // lpstat exits 1 when CUPS is up but no printers are added — valid state, not an error.
    const msg = (e as Error).message;
    if (/no destinations added/i.test(msg)) return 'No printers added. Add one in System Settings → Printers.';
    throw e;
  }
}

export async function describePrinter(printer: string): Promise<string> {
  if (process.platform === 'win32') return ''; // no lpoptions on Windows; pdf-to-printer handles options
  try {
    const { stdout } = await run('lpoptions', printer ? ['-p', printer, '-l'] : ['-l']);
    return stdout;
  } catch {
    return '';
  }
}

export interface DetectedPrinter {
  name: string;
  state: string;
  enabled: boolean;
  isDefault: boolean;
}

export function parseLpstat(output: string): { printers: DetectedPrinter[]; defaultName: string } {
  const printers: DetectedPrinter[] = [];
  for (const line of output.split('\n')) {
    const m = line.match(/^printer (\S+)\s+(.*)$/);
    if (m) {
      const enabled = /enabled/i.test(m[2]) && !/disabled/i.test(m[2]);
      printers.push({ name: m[1], state: m[2].trim(), enabled, isDefault: false });
    }
  }
  const d = output.match(/^system default destination:\s*(\S+)/m);
  const defaultName = d ? d[1] : '';
  for (const p of printers) if (p.name === defaultName) p.isDefault = true;
  return { printers, defaultName };
}

export async function listPrintersStructured(mock = false): Promise<{
  printers: DetectedPrinter[];
  defaultName: string;
  raw: string;
}> {
  if (mock) {
    const printers: DetectedPrinter[] = [
      { name: 'Mock_Printer_Office', state: 'is idle. enabled', enabled: true, isDefault: true },
      { name: 'Mock_Printer_Color', state: 'is idle. enabled', enabled: true, isDefault: false },
      { name: 'Mock_Printer_BW', state: 'is idle. enabled', enabled: true, isDefault: false },
      { name: 'Mock_Printer_Offline', state: 'disabled', enabled: false, isDefault: false },
    ];
    return {
      printers,
      defaultName: 'Mock_Printer_Office',
      raw: [
        'printer Mock_Printer_Office is idle. enabled',
        'printer Mock_Printer_Color is idle. enabled',
        'printer Mock_Printer_BW is idle. enabled',
        'printer Mock_Printer_Offline disabled',
        'system default destination: Mock_Printer_Office',
      ].join('\n'),
    };
  }
  if (process.platform === 'win32' && !mock) {
    try {
      const { getPrinters, getDefaultPrinter } = await import('pdf-to-printer');
      const [list, def] = await Promise.all([getPrinters(), getDefaultPrinter().catch(() => null)]);
      const printers: DetectedPrinter[] = list.map((p) => ({
        name: p.name,
        state: '',
        enabled: true,
        isDefault: def?.name === p.name,
      }));
      const defaultName = def?.name ?? '';
      return {
        printers,
        defaultName,
        raw: printers.map((p) => `printer ${p.name}`).join('\n') || 'No printers found. Add one in Settings → Printers.',
      };
    } catch (e) {
      return { printers: [], defaultName: '', raw: `Windows print error: ${(e as Error).message}` };
    }
  }
  try {
    const raw = await listPrinters();
    if (raw.startsWith('No printers added')) return { printers: [], defaultName: '', raw };
    const { printers, defaultName } = parseLpstat(raw);
    return { printers, defaultName, raw };
  } catch (e) {
    return { printers: [], defaultName: '', raw: `CUPS error: ${(e as Error).message}` };
  }
}

/** Active printer: UI setting wins, then .env, then system default (''). */
export function resolvePrinterName(db: DatabaseSync, cfg: { printerName: string }): string {
  return getSetting(db, 'printerName') || cfg.printerName;
}

/** One-page test print to verify the printer from the UI. */
export async function buildTestPage(printerName: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([440, 300]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('PrintBridge Test Page', { x: 40, y: 230, size: 22, font: bold });
  page.drawText(`Printer: ${printerName || '(system default)'}`, { x: 40, y: 195, size: 12, font: regular });
  page.drawText(`Time: ${new Date().toLocaleString()}`, { x: 40, y: 175, size: 12, font: regular });
  page.drawText('If you can read this, printing works.', {
    x: 40,
    y: 145,
    size: 12,
    font: regular,
    color: rgb(0.2, 0.4, 0.8),
  });
  return Buffer.from(await pdf.save());
}

function colorArgs(colorMode: ColorMode, printerCaps: string): string[] {
  const opt = colorMode === 'BW' ? 'Gray' : 'RGB';
  // Only pass ColorModel if the driver advertises it; else rely on printer default.
  if (/ColorModel/i.test(printerCaps)) return ['-o', `ColorModel=${opt}`];
  return [];
}

/** Pure: CUPS `lp` args (unit-testable, no side effects). */
export function buildLpArgs(
  pdfPath: string,
  opts: { printerName: string; colorMode: ColorMode; copies: number; jobName?: string },
  printerCaps: string,
): string[] {
  const args: string[] = [];
  if (opts.printerName) args.push('-d', opts.printerName);
  args.push('-n', String(opts.copies));
  args.push(...colorArgs(opts.colorMode, printerCaps));
  if (opts.jobName) args.push('-t', opts.jobName.slice(0, 80));
  args.push(pdfPath);
  return args;
}

/** Pure: pdf-to-printer options for Windows (unit-testable, no side effects). */
export function buildWindowsPrintOptions(opts: {
  printerName: string;
  colorMode: ColorMode;
  copies: number;
}): { printer?: string; copies: number; monochrome: boolean } {
  return {
    ...(opts.printerName ? { printer: opts.printerName } : {}),
    copies: opts.copies,
    monochrome: opts.colorMode === 'BW',
  };
}

async function printViaWindows(
  pdfPath: string,
  opts: { printerName: string; colorMode: ColorMode; copies: number },
): Promise<void> {
  const { print } = await import('pdf-to-printer');
  await print(pdfPath, buildWindowsPrintOptions(opts));
}

/** Print a PDF: mock archive, Windows (SumatraPDF), or CUPS `lp`. With mock:true, skip real printing. */
export async function printPdf(
  pdfPath: string,
  opts: { printerName: string; colorMode: ColorMode; copies: number; jobName?: string; mock?: boolean },
): Promise<void> {
  if (opts.mock) {
    const { default: fs } = await import('node:fs');
    const { default: path } = await import('node:path');
    const outDir = path.join(path.dirname(pdfPath), 'printed');
    await fs.promises.mkdir(outDir, { recursive: true });
    const out = path.join(outDir, `${Date.now()}-${path.basename(pdfPath)}`);
    await fs.promises.copyFile(pdfPath, out);
    console.log(
      `[MOCK PRINT] ${opts.jobName ?? pdfPath} | ${opts.colorMode} | COPIES ${opts.copies} | archived → ${out}`,
    );
    return;
  }
  if (process.platform === 'win32') {
    await printViaWindows(pdfPath, opts);
    return;
  }
  const caps = opts.printerName ? await describePrinter(opts.printerName).catch(() => '') : '';
  await run('lp', buildLpArgs(pdfPath, opts, caps));
}
