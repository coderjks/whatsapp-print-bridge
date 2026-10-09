import type { ColorMode } from './config.js';

export type PrintCommand =
  | { kind: 'cancel' }
  | { kind: 'print'; colorMode: ColorMode; copies: number }
  | { kind: 'unknown' };

const MAX_COPIES = 10;

/** Accepts: PRINT, PRINT BW, PRINT COLOR, PRINT COPIES 2, PRINT COLOR COPIES 2 (any order, case-insensitive). */
export function parsePrintCommand(
  text: string,
  defaults: { colorMode: ColorMode; copies: number },
): PrintCommand {
  const t = text.trim().toUpperCase().replace(/\s+/g, ' ');
  if (t === 'CANCEL') return { kind: 'cancel' };
  if (!t.startsWith('PRINT')) return { kind: 'unknown' };

  let colorMode: ColorMode = defaults.colorMode;
  let copies = defaults.copies;

  if (t.includes('COLOR') && t.includes('BW')) return { kind: 'unknown' };
  if (t.includes('COLOR')) colorMode = 'COLOR';
  if (/\bBW\b|\bB&W\b|\bBLACK/.test(t)) colorMode = 'BW';

  const m = t.match(/COPIES\s+(\d{1,2})/);
  if (m) {
    copies = parseInt(m[1], 10);
    if (!Number.isFinite(copies) || copies < 1 || copies > MAX_COPIES) {
      return { kind: 'unknown' };
    }
  }

  // Reject anything with unexpected tokens besides PRINT/BW/COLOR/COPIES N
  const stripped = t
    .replace(/^PRINT/, '')
    .replace(/\bCOLOR\b/, '')
    .replace(/\bBW\b|\bB&W\b|\bBLACK.*WHITE\b|\bBLACK\b/, '')
    .replace(/COPIES\s+\d{1,2}/, '')
    .trim();
  if (stripped.length > 0) return { kind: 'unknown' };

  return { kind: 'print', colorMode, copies };
}

export function buildQueuedMessage(fileName: string): string {
  return (
    `Received ${fileName}. ✅\n` +
    `It is queued for admin approval at the shop — you will be told once it is printed.\n` +
    `Reply CANCEL to withdraw it.`
  );
}

/** Direct mode escalated to pending: large / flood-suspect print needs admin review. */
export function buildApprovalRequiredMessage(fileName: string, reason: string): string {
  return (
    `Received ${fileName}. ✅\n` +
    `This print needs admin approval (${reason}) — it is queued and nothing has printed yet.\n` +
    `You will be told once it is printed. Reply CANCEL to withdraw it.`
  );
}

export function buildConfirmMessage(
  fileName: string,
  defaults: { colorMode: ColorMode; copies: number },
): string {
  return (
    `Received ${fileName} ✅\n` +
    `Reply PRINT BW, PRINT COLOR, optionally with COPIES N (1-10).\n` +
    `Examples: PRINT / PRINT COLOR / PRINT BW COPIES 2 / CANCEL\n` +
    `Default: PRINT ${defaults.colorMode} (COPIES ${defaults.copies})`
  );
}
