import { DatabaseSync } from 'node:sqlite';
import type { ColorMode } from './config.js';

export type JobStatus = 'pending' | 'printed' | 'cancelled' | 'failed';

export interface PrintJob {
  id: number;
  sender: string;
  senderName: string;
  originalName: string;
  storedPath: string;
  mime: string;
  status: JobStatus;
  createdAt: number;
}

export function openDb(file = './print-queue.db'): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT NOT NULL,
      senderName TEXT NOT NULL DEFAULT '',
      originalName TEXT NOT NULL,
      storedPath TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);
  const cols = db.prepare('PRAGMA table_info(jobs)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'senderName')) {
    db.exec('ALTER TABLE jobs ADD COLUMN senderName TEXT NOT NULL DEFAULT ""');
  }
  return db;
}

export function createJob(
  db: DatabaseSync,
  job: { sender: string; senderName?: string; originalName: string; storedPath: string; mime: string },
): PrintJob {
  const stmt = db.prepare(
    'INSERT INTO jobs (sender, senderName, originalName, storedPath, mime, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
  );
  return stmt.get(job.sender, job.senderName ?? '', job.originalName, job.storedPath, job.mime, 'pending', Date.now()) as unknown as PrintJob;
}

export function latestPendingJob(db: DatabaseSync, sender: string): PrintJob | null {
  const stmt = db.prepare(
    "SELECT * FROM jobs WHERE sender = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
  );
  return (stmt.get(sender) as PrintJob | undefined) ?? null;
}

export function setJobStatus(db: DatabaseSync, id: number, status: JobStatus): void {
  db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, id);
}

export function getJob(db: DatabaseSync, id: number): PrintJob | null {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as unknown as PrintJob | undefined;
  return row ?? null;
}

export function listJobs(db: DatabaseSync, limit = 50): PrintJob[] {
  return db.prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT ?').all(limit) as unknown as PrintJob[];
}

/** Runtime settings (DB overrides .env). */
/** Allowlist: DB row wins when present (empty = open to all), else .env default. */
export function getAllowlist(db: DatabaseSync): string[] | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('allowlist') as
    | { value: string }
    | undefined;
  if (!row) return null;
  return row.value ? row.value.split(',').filter(Boolean) : [];
}

export function setAllowlist(db: DatabaseSync, numbers: string[]): void {
  setSetting(db, 'allowlist', numbers.join(','));
}
/** Admin-approval mode: DB setting wins ('1'/'0'), else .env default. */
export function isAdminApproval(db: DatabaseSync, cfg: { adminApproval: boolean }): boolean {
  const v = getSetting(db, 'adminApproval');
  if (v === '1') return true;
  if (v === '0') return false;
  return cfg.adminApproval;
}

/** Mock-print mode: DB setting wins ('1'/'0'), else .env default. */
export function isMockPrint(db: DatabaseSync, cfg: { mockPrint: boolean }): boolean {
  const v = getSetting(db, 'mockPrint');
  if (v === '1') return true;
  if (v === '0') return false;
  return cfg.mockPrint;
}
export function getSetting(db: DatabaseSync, key: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? '';
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value,
  );
}
