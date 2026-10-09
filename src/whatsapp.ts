import fs from 'node:fs';
import path from 'node:path';
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WAMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import type { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from './config.js';
import { buildConfirmMessage, buildQueuedMessage, parsePrintCommand } from './commands.js';
import { ensurePdf } from './converter.js';
import { printPdf, resolvePrinterName } from './printer.js';
import { createJob, getAllowlist, getSetting, isAdminApproval, isMockPrint, latestPendingJob, openDb, setJobStatus } from './queue.js';

const log = pino({ level: 'info' });

/** Shared bridge state surfaced on the dashboard (/api/link). */
export const bridgeState: {
  qr: string | null;
  pairingCode: string | null;
  linkMethod: 'qr' | 'pairing';
  connected: boolean;
  account: string | null;
  /** True when no linking socket is running (fresh boot w/o session, or after Unlink). */
  idle: boolean;
} = {
  qr: null,
  pairingCode: null,
  linkMethod: 'qr',
  connected: false,
  account: null,
  idle: false,
};

let activeSock: Pick<
  ReturnType<typeof makeWASocket>,
  'requestPairingCode' | 'logout' | 'authState'
> | null = null;
let pairingRequested = false;
let sockReady = false;
/** Set while Unlink is tearing down, so the resulting close event doesn't restart. */
let suppressRestart = false;
let bridgeCfg: AppConfig | null = null;
let bridgeDb: DatabaseSync | null = null;

function waitForReady(timeoutMs = 20000): Promise<boolean> {
  const start = Date.now();
  return (async () => {
    while (Date.now() - start < timeoutMs) {
      if (sockReady && activeSock) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return sockReady && !!activeSock;
  })();
}

/** Unlink WhatsApp and immediately start a fresh linking session.
 * Baileys' logout() only removes the companion device server-side — it leaves
 * local auth files behind, so wipe ./auth explicitly, otherwise the next boot
 * silently relinks the old session. */
export async function logoutLink(): Promise<void> {
  suppressRestart = true;
  if (activeSock) {
    try {
      await activeSock.logout();
    } catch {
      // already disconnected — continue with cleanup
    }
    activeSock = null;
  }
  try {
    const fs = await import('node:fs');
    await fs.promises.rm('./auth', { recursive: true, force: true });
  } catch {
    // ignore
  }
  bridgeState.qr = null;
  bridgeState.pairingCode = null;
  bridgeState.connected = false;
  bridgeState.account = null;
  pairingRequested = false;
  sockReady = false;
  if (bridgeCfg) await startBridge(bridgeCfg, bridgeDb ?? undefined);
}

/** Context for startLinking when boot went idle without ever starting a socket. */
export function setBridgeContext(cfg: AppConfig, db: DatabaseSync): void {
  bridgeCfg = cfg;
  bridgeDb = db;
}
/** Start a linking session (fresh QR / pairing code). No-op while already linked. */
export async function startLinking(): Promise<void> {
  if (bridgeState.connected) throw new Error('Already linked.');
  if (activeSock) throw new Error('Link already in progress — wait for the QR or code.');
  if (!bridgeCfg) throw new Error('Bridge not initialised yet.');
  await startBridge(bridgeCfg, bridgeDb ?? undefined);
}
export async function refreshLinkCode(phoneNumber: string): Promise<string | null> {
  if (activeSock?.authState.creds.registered) {
    throw new Error('Already linked — unlink first to switch numbers.');
  }
  const ready = await waitForReady();
  if (!ready || !activeSock) {
    throw new Error('WhatsApp link is not ready yet — wait for the QR to appear, then retry.');
  }
  pairingRequested = true;
  const code = await activeSock.requestPairingCode(phoneNumber);
  bridgeState.pairingCode = code;
  bridgeState.linkMethod = 'pairing';
  log.info({ code }, 'Enter this pairing code in WhatsApp > Linked devices > Link with phone number');
  console.log(`\nPairing code: ${code}\n`);
  return code;
}
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOC_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function senderNumber(jid: string | undefined): string {
  return (jid ?? '').split('@')[0].replace(/\D/g, '');
}

export function isAllowed(sender: string, allowed: Set<string>): boolean {
  if (allowed.size === 0) return true;
  return allowed.has(sender);
}

/** Effective allowlist: DB row wins when present (empty = open), else .env. */
export function effectiveAllowlist(db: DatabaseSync, cfg: AppConfig): Set<string> {
  const stored = getAllowlist(db);
  if (stored !== null) return new Set(stored);
  return cfg.allowedNumbers;
}

export function normalizeNumber(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

type MediaInfo = { buffer: Buffer; mime: string; fileName: string } | null;

async function extractMedia(msg: WAMessage): Promise<MediaInfo> {
  const m = msg.message;
  if (!m) return null;
  const doc = m.documentMessage;
  if (doc) {
    const buf = await downloadMediaMessage(msg, 'buffer', {});
    return {
      buffer: buf as Buffer,
      mime: doc.mimetype ?? 'application/octet-stream',
      fileName: doc.fileName ?? `file-${Date.now()}`,
    };
  }
  const img = m.imageMessage;
  if (img) {
    const buf = await downloadMediaMessage(msg, 'buffer', {});
    return {
      buffer: buf as Buffer,
      mime: img.mimetype ?? 'image/jpeg',
      fileName: `image-${Date.now()}.jpg`,
    };
  }
  return null;
}

function textOf(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return '';
  return m.conversation ?? m.extendedTextMessage?.text ?? '';
}

export async function startBridge(cfg: AppConfig, existingDb?: DatabaseSync): Promise<void> {
  await fs.promises.mkdir(cfg.inboxDir, { recursive: true });
  const db = existingDb ?? openDb(path.join(cfg.inboxDir, 'print-queue.db'));
  bridgeCfg = cfg;
  bridgeDb = db;
  const linkNumber = getSetting(db, 'linkPhoneNumber') || cfg.linkPhoneNumber;
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }) });
  activeSock = sock;
  pairingRequested = false;
  suppressRestart = false;
  bridgeState.idle = false;
  bridgeState.linkMethod = linkNumber ? 'pairing' : 'qr';
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    void (async () => {
      if (u.qr) {
        bridgeState.connected = false;
        sockReady = true;
        // Always keep the QR available; additionally fetch a pairing code when we know the number.
        bridgeState.qr = u.qr;
        log.info('Scan this QR with WhatsApp > Linked devices to log in.');
        qrcode.generate(u.qr, { small: true });
        if (linkNumber && !sock.authState.creds.registered && !pairingRequested) {
          try {
            await refreshLinkCode(linkNumber);
          } catch (e) {
            log.warn({ err: e }, 'Pairing code not ready yet — QR still available');
          }
        }
      }
      if (u.connection === 'open') {
        sockReady = true;
        bridgeState.qr = null;
        bridgeState.pairingCode = null;
        bridgeState.connected = true;
        bridgeState.account =
          senderNumber((sock.authState.creds.me as { id?: string } | undefined)?.id) || null;
        log.info('WhatsApp connected');
      }
    if (u.connection === 'close') {
      bridgeState.connected = false;
      sockReady = false;
      const code = (u.lastDisconnect?.error as Boom)?.output?.statusCode;
      log.warn({ code }, 'Connection closed');
      if (suppressRestart) {
        suppressRestart = false;
        return;
      }
      if (code === DisconnectReason.loggedOut) {
        // Session invalidated (e.g. unlinked from the phone): wipe creds so the
        // next socket starts a fresh login instead of looping on 401.
        bridgeState.qr = null;
        bridgeState.pairingCode = null;
        bridgeState.account = null;
        pairingRequested = false;
        void (async () => {
          try {
            await fs.promises.rm('./auth/creds.json', { force: true });
          } catch {
            // ignore
          }
          await startBridge(cfg, db);
        })();
      } else {
        bridgeState.qr = null;
        bridgeState.pairingCode = null;
        void startBridge(cfg, db);
      }
      }
    })();
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      log.info(
        {
          remoteJid: msg.key.remoteJid,
          fromMe: !!msg.key.fromMe,
          kinds: msg.message ? Object.keys(msg.message) : [],
        },
        'incoming WhatsApp message',
      );
      try {
        if (msg.key.fromMe) continue;
        const remote = msg.key.remoteJid ?? '';
        const sender = senderNumber(msg.key.participant ?? remote);
        if (!isAllowed(sender, effectiveAllowlist(db, cfg))) continue;

        const media = await extractMedia(msg).catch((e) => {
          log.warn({ err: e }, 'media download failed');
          return null;
        });
        if (media) {
          if (!IMAGE_TYPES.has(media.mime) && !DOC_TYPES.has(media.mime)) {
            await sock.sendMessage(remote, { text: `Unsupported type ${media.mime}. Send PDF, JPG, PNG, WEBP, DOCX, PPTX, XLSX.` });
            continue;
          }
          const sizeMB = media.buffer.length / 1024 / 1024;
          if (sizeMB > cfg.maxFileMB) {
            await sock.sendMessage(remote, { text: `File too large (${sizeMB.toFixed(1)}MB > ${cfg.maxFileMB}MB).` });
            continue;
          }
          const safe = path.basename(media.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
          const stored = path.join(cfg.inboxDir, `${Date.now()}-${safe}`);
          await fs.promises.writeFile(stored, media.buffer);
          createJob(db, {
            sender,
            senderName: typeof msg.pushName === 'string' ? msg.pushName : '',
            originalName: safe,
            storedPath: stored,
            mime: media.mime,
          });
          await sock.sendMessage(remote, {
            text: isAdminApproval(db, cfg)
              ? buildQueuedMessage(safe)
              : buildConfirmMessage(safe, { colorMode: cfg.defaultColorMode, copies: cfg.defaultCopies }),
          });
          continue;
        }

        const text = textOf(msg);
        if (!text) continue;
        const cmd = parsePrintCommand(text, { colorMode: cfg.defaultColorMode, copies: cfg.defaultCopies });
        if (cmd.kind === 'unknown') continue;
        const job = latestPendingJob(db, sender);
        if (!job) {
          await sock.sendMessage(remote, { text: 'No pending file. Send a PDF/image/document first.' });
          continue;
        }
        if (cmd.kind === 'cancel') {
          setJobStatus(db, job.id, 'cancelled');
          await sock.sendMessage(remote, { text: `Cancelled ${job.originalName}.` });
          continue;
        }
        if (isAdminApproval(db, cfg)) {
          // Approval mode: printing happens only from the dashboard.
          await sock.sendMessage(remote, {
            text: `${job.originalName} is already queued ✅ — waiting for admin approval at the shop.`,
          });
          continue;
        }
        // Direct mode: WhatsApp PRINT prints immediately.
        try {
          const pdf = await ensurePdf(job.storedPath, job.mime);
          await printPdf(pdf, {
            printerName: resolvePrinterName(db, cfg),
            colorMode: cmd.colorMode,
            copies: cmd.copies,
            jobName: job.originalName,
            mock: isMockPrint(db, cfg),
          });
          setJobStatus(db, job.id, 'printed');
          await sock.sendMessage(remote, {
            text: `Printed ${job.originalName} (${cmd.colorMode}, COPIES ${cmd.copies}).`,
          });
        } catch (e) {
          setJobStatus(db, job.id, 'failed');
          log.error({ err: e }, 'print failed');
          await sock.sendMessage(remote, { text: `Print failed: ${(e as Error).message}` });
        }
      } catch (e) {
        log.error({ err: e }, 'message handler error');
      }
    }
  });
}
