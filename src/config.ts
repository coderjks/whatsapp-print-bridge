import 'dotenv/config';
import path from 'node:path';

export type ColorMode = 'BW' | 'COLOR';

export interface AppConfig {
  printerName: string;
  allowedNumbers: Set<string>;
  defaultColorMode: ColorMode;
  defaultCopies: number;
  maxFileMB: number;
  inboxDir: string;
  port: number;
  /** Digits-only WhatsApp number to link via pairing code. Empty = QR-code flow. */
  linkPhoneNumber: string;
  /** When true, skip real `lp` printing: log + archive the PDF instead. */
  mockPrint: boolean;
  /** When true, jobs wait for dashboard approval; when false, WhatsApp PRINT prints directly. */
  adminApproval: boolean;
  /** Direct-mode safeguards: above these, jobs stay pending for admin review even when adminApproval is OFF. */
  autoApproveMaxFileMB: number;
  autoApproveMaxCopies: number;
  autoApproveMaxPending: number;
  autoApproveMaxPerHour: number;
}

export function parseAllowed(input: string | undefined): Set<string> {
  if (!input) return new Set();
  return new Set(
    input
      .split(',')
      .map((s) => s.trim().replace(/\D/g, ''))
      .filter(Boolean),
  );
}

export function loadConfig(): AppConfig {
  const mode = (process.env.DEFAULT_COLOR_MODE ?? 'BW').toUpperCase();
  const copies = Math.min(
    Math.max(parseInt(process.env.DEFAULT_COPIES ?? '1', 10) || 1, 1),
    10,
  );
  const num = (v: string | undefined, fb: number, min: number, max: number): number => {
    const n = parseInt(v ?? '', 10);
    if (!Number.isFinite(n)) return fb;
    return Math.min(Math.max(n, min), max);
  };
  return {
    printerName: process.env.PRINTER_NAME ?? '',
    allowedNumbers: parseAllowed(process.env.ALLOWED_NUMBERS),
    defaultColorMode: mode === 'COLOR' ? 'COLOR' : 'BW',
    defaultCopies: copies,
    maxFileMB: num(process.env.MAX_FILE_MB, 20, 1, 1000),
    inboxDir: path.resolve(process.env.INBOX_DIR ?? './inbox'),
    port: parseInt(process.env.PORT ?? '3001', 10) || 3001,
    linkPhoneNumber: (process.env.WHATSAPP_NUMBER ?? '').replace(/\D/g, ''),
    mockPrint: ['1', 'true', 'yes'].includes((process.env.MOCK_PRINT ?? '').toLowerCase()),
    adminApproval: ['1', 'true', 'yes'].includes((process.env.ADMIN_APPROVAL ?? '').toLowerCase()),
    autoApproveMaxFileMB: num(process.env.AUTO_PRINT_MAX_MB, 5, 1, 1000),
    autoApproveMaxCopies: num(process.env.AUTO_PRINT_MAX_COPIES, 2, 1, 10),
    autoApproveMaxPending: num(process.env.AUTO_PRINT_MAX_PENDING, 3, 1, 50),
    autoApproveMaxPerHour: num(process.env.AUTO_PRINT_MAX_PER_HOUR, 5, 1, 100),
  };
}
