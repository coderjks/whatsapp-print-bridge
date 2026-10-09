# Session — whatsapp-print-bridge — 2026-10-09

## Done — 2026-10-09 project exploration (uncommitted, no git repo)
- Mapped full flow: `src/index.ts` boot (mkdir inbox, open `print-queue.db`, dashboard + Baileys bridge) → `src/whatsapp.ts` receive/validate/store/reply → `src/commands.ts` PRINT/CANCEL parse → `src/converter.ts` image/Office→PDF → `src/printer.ts` CUPS/Windows/mock print → `src/queue.ts` sqlite jobs+settings → `src/server.ts` single-file dashboard + JSON APIs.
- Allowlist behavior verified in code: `config.ts:22-40` parses `ALLOWED_NUMBERS`; `queue.ts:73-84` DB `settings('allowlist')` wins over `.env` (null=from-env, empty=open); `whatsapp.ts:130-149,270-272` `effectiveAllowlist` + silent drop for non-allowed; `server.ts:790-810` GET/POST `/api/allowlist` with 7–15 digit normalization; UI tab `view-allow` with Open/Restricted badge, Add/Enter, ✕ Remove.
- Live state snapshot: `inbox/print-queue.db` has 4 jobs, all `printed` (1 PDF + 3 JPGs from 2 senders); settings `adminApproval=1, mockPrint=1, printerName=Mock_Printer_Office, allowlist='' (open), linkPhoneNumber=''`; `inbox/printed/` 44 archived PDFs; `auth/` linked session present; no `.env` (running on defaults + DB overrides); no `dist/` build.
- Docs compared: `salon-billing-web/.opencode/skills` has only `e2e-verify`, no save-session skill. This file mirrors its `SESSION.md` pattern manually.

## Pending / Next
- Decide `.env` vs DB as source of truth (currently DB overrides; `.env` missing so fresh clone falls back to `MOCK_PRINT=true` example defaults).
- Real-printer verification: flip `mockPrint=0`, set real `printerName`, `Test print` + live WhatsApp file → check `lpstat` / CUPS `localhost:631`.
- Admin-approval UX: currently ON (all WhatsApp PRINTs ack-and-queue); confirm OFF-path still desired for shop use.
- Init git repo + first commit (add `SESSION.md`, keep `auth/`, `inbox/*`, `.env` ignored per `.gitignore:1-7`).
- Optional: extract `PAGE` HTML from `server.ts:12-665` to static file; add `typecheck`/`build` CI check (`npm run typecheck`).

## Key files
- Boot: `src/index.ts:1-27`; config: `src/config.ts:1-50` (`.env.example:1-27` canonical defaults)
- WhatsApp: `src/whatsapp.ts:1-351` (allowlist `130-149`, media `153-175`, PRINT flow `306-346`)
- Commands: `src/commands.ts:1-64`; converter: `src/converter.ts:1-102`
- Printer: `src/printer.ts:1-209` (`buildLpArgs:151-163`, `printPdf:187-209`)
- Queue/DB: `src/queue.ts:1-112`; dashboard+API: `src/server.ts:669-922` (allowlist `790-810`, approve `849-873`)
- Ops: `Dockerfile:1-17`, `docker-compose.yml:1-14`, `start-windows.bat:1-37`, `README.md:1-88`
- State: `inbox/print-queue.db` (jobs+settings), `inbox/*.pdf|jpg` downloads, `inbox/printed/` mock archive, `auth/` Baileys session

## How to resume
- `cp .env.example .env` (edit `PRINTER_NAME`, `PORT=3001` for Windows parity), `npm install --allow-git=all`, `npm run dev` → scan QR at `http://localhost:3000`
- Dashboard APIs: `GET /api/link|status|printers|jobs|allowlist|settings`, `POST /api/printer|printer/test|link/phone|logout|refresh|settings|allowlist|jobs/:id/approve|cancel|retry|reprint`
- Inspect queue: `python3 -c "import sqlite3;db=sqlite3.connect('inbox/print-queue.db');print(list(db.execute('SELECT id,originalName,status FROM jobs')));print(list(db.execute('SELECT * FROM settings')))"`
- Verify: `npm run typecheck`, `lpstat -p -d`, CUPS `http://localhost:631`
