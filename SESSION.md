# Session — whatsapp-print-bridge — 2026-10-09

## Done — 2026-10-09 direct-mode safeguards (uncommitted)
- Auto mode (`ADMIN_APPROVAL=false`) now escalates to `pending` for admin review when: file > `AUTO_PRINT_MAX_MB` (5), `COPIES` > `AUTO_PRINT_MAX_COPIES` (2), sender pending ≥ `AUTO_PRINT_MAX_PENDING` (3), or sender prints/hour ≥ `AUTO_PRINT_MAX_PER_HOUR` (5). Dashboard Approve bypasses guards.
- Touched: `src/config.ts` (4 new fields + parsing), `src/queue.ts` (`countPendingBySender`, `countPrintedSince`, `autoApproveLimits` with DB override), `src/whatsapp.ts` (`directPrintBlockReason` + checks at media intake and PRINT time, `buildApprovalRequiredMessage` reply, job stays `pending`), `src/commands.ts` (new message), `src/server.ts` (`GET/POST /api/settings` exposes/tunes `auto.*`), `.env.example`, `README.md`.
- Verified: `npm run typecheck` clean; guard matrix via `tsx` (small→pass, large/copies/pending/rate→blocked with reason; counters ok).
- UI (uncommitted): queue-card header has a `🛡 Safeguards · 5MB / 2 copies / 3 pending / 5/h` button opening a modal with 4 labelled cards (Max MB / Max copies / Max pending / Max-hour) + Save/Cancel; `loadSettings()` populates + summary, `saveAuto()` persists via `POST /api/settings {auto:{...}}` and auto-closes; Esc/overlay closes. Verified live on :3001 (modal markup served, settings round-trip ok).
- Modal style: all four modal cards (`preview/link/app/auto`) forced to white (`#fff` bg, dark text, light-theme scoped vars) in both themes — readable inputs/buttons on white even in dark mode. Verified live on :3001.
- Header concept animation (uncommitted): pure-CSS 6s loop — pulsing WhatsApp node → page launches in a projectile arc (rises, tilts, lands at the printer) → printer slides out lined paper + green ✓ badge, status (`Sending… → Printing… → Printed ✓`, 13.5px) centered in the flight lane between the icons. Borderless/chromeless (transparent, no pill), tight 440px lane, nudged 8px down from the header top, centered between logo/title and theme button (official WhatsApp glyph in white on green; header is a deep navy-blue gradient `#070b18→#0e1533→#1e1b4e`). 40px icons, row vertically centered (61px lane matched to node heights, flight at icon-center height); status hides ≤920px, whole animation hides ≤640px; static fallback under `prefers-reduced-motion`. Verified live on :3001.

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
- `cp .env.example .env` (edit `PRINTER_NAME`), `npm install --allow-git=all`, `npm run dev` → dashboard at `http://localhost:3001`, scan QR to link
- Dashboard APIs: `GET /api/link|status|printers|jobs|allowlist|settings`, `POST /api/printer|printer/test|link/phone|logout|refresh|settings|allowlist|jobs/:id/approve|cancel|retry|reprint`
- Inspect queue: `python3 -c "import sqlite3;db=sqlite3.connect('inbox/print-queue.db');print(list(db.execute('SELECT id,originalName,status FROM jobs')));print(list(db.execute('SELECT * FROM settings')))"`
- Verify: `npm run typecheck`, `lpstat -p -d`, CUPS `http://localhost:631`
