import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { listPrinters } from './printer.js';
import { openDb } from './queue.js';
import { startDashboard } from './server.js';
import { setBridgeContext, startBridge } from './whatsapp.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  await fs.promises.mkdir(cfg.inboxDir, { recursive: true });
  const db = openDb(path.join(cfg.inboxDir, 'print-queue.db'));
  try {
    console.log(await listPrinters());
  } catch {
    console.log('CUPS not available (lpstat failed). Printing will fail until CUPS is set up.');
  }
  startDashboard(cfg, db);
  setBridgeContext(cfg, db);
  await startBridge(cfg, db);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}
);
