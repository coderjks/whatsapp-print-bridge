# WhatsApp Print Bridge (v1)

Send a file/image on WhatsApp → it prints via CUPS. The **Admin approval** toggle
on the dashboard queue controls the flow: **OFF** (default) = customer replies
`PRINT [BW|COLOR] [COPIES N]` and it prints immediately; **ON** = every file waits
for admin preview + **✓ Approve & Print** — nothing prints without it.

## 1. Prereqs

- Node 20+
- CUPS with your printer installed (`lpstat -p -d` should list it)
- For DOCX/PPTX/XLSX: LibreOffice (`soffice --headless`)
- A spare WhatsApp number recommended (unofficial Baileys client)

## 2. Setup

```bash
npm install --allow-git=all
cp .env.example .env
# edit .env: PRINTER_NAME, ALLOWED_NUMBERS
npm run dev
# scan the QR with WhatsApp > Linked devices
```

One-click (does the above + installs Node/LibreOffice deps on first run):
Windows → double-click **`start-windows.bat`** · macOS → `./start-macos.sh` · Linux → `./start-linux.sh`.

### Windows (cybercafe laptop)

1. Double-click **`start-windows.bat`**. No Node? It installs the latest LTS itself
   (via `winget`, else a silent MSI — may show one admin prompt), warns if
   LibreOffice is missing (needed for Word/PowerPoint/Excel files, from
   https://www.libreoffice.org/download/download-libreoffice/).
   First run installs dependencies; every run opens the dashboard at
   `http://localhost:3001`.
2. Link WhatsApp, pick the Windows printer from the side-panel dropdown,
   press Test print. Keep the black window open during shop hours
   (closing it stops the app).

Printing on Windows goes through SumatraPDF (bundled with `pdf-to-printer`);
BW maps to monochrome, copies are honored. Office conversion uses the
installed LibreOffice (`C:\Program Files\LibreOffice\...`).

Prefer a code over QR? Set `WHATSAPP_NUMBER=919876543210` (digits only, the
number you're linking) in `.env` and restart — the dashboard then shows an
8-digit pairing code: WhatsApp → Linked devices → Link a device →
**Link with phone number instead** → enter the code. No camera needed.

Check printer caps:

```bash
lpstat -p -d
lpoptions -p <printer> -l | grep -i color
```

## 3. Usage

1. Customer sends PDF / JPG / PNG / WEBP / DOCX / PPTX / XLSX to the linked number.
2. **Approval OFF:** bot sends PRINT instructions → customer replies `PRINT [BW|COLOR] [COPIES N]` → prints immediately, bot sends print status. **`CANCEL`** withdraws.
   Safeguards (even with approval OFF): large files (`AUTO_PRINT_MAX_MB`, default 5MB), many copies (`AUTO_PRINT_MAX_COPIES`, default 2),
   too many pending files (`AUTO_PRINT_MAX_PENDING`, default 3) or too many prints/hour (`AUTO_PRINT_MAX_PER_HOUR`, default 5)
   stay `pending` for admin review instead of auto-printing. Tune via `.env` or `POST /api/settings`.
   **Approval ON:** bot says the file is waiting for admin approval.
3. Admin (either mode) can open the dashboard queue, **👁 Preview**, pick **BW/COLOR + copies**, and **✓ Approve & Print**.
4. Job prints (or mock-archives) and the row flips to `printed`.

## 4. Dashboard (printer status + job queue)

Open `http://localhost:3001` (set `PORT` in `.env` to change it):

- **WhatsApp card** — QR or pairing-code linking, linked-number display, Unlink button.
  Enter the number in the input + "Get pairing code" to link a different number
  without touching `.env` (stored in the DB, survives restarts).
- **Printer side panel** — auto-detected CUPS printers as clickable rows (active/default badges, stored in the DB, overrides `PRINTER_NAME`), Refresh, **Test print**, and a **Mock print** switch (DB-stored, overrides `MOCK_PRINT`).
- **Job queue** — every file received via WhatsApp with status (`pending` / `printed` / `cancelled` / `failed`), preview + approve controls, **↻ Retry** for failed jobs, **🖨 Reprint** for printed ones, admin-approval switch, auto-refreshes every 3s.
- JSON APIs: `GET /api/link|status|jobs|printers|settings`, `POST /api/printer|printer/test|link/phone|link/logout|link/refresh|settings|jobs/:id/approve|jobs/:id/cancel`.

Tip: CUPS also has its own UI at `http://localhost:631` for low-level printer/job detail.

## 5. Docker (PC or Raspberry Pi)

```bash
npm run build
docker compose up --build -d
docker logs -f whatsapp-print-bridge  # get QR on first run
```

Linux/Pi shares host CUPS via `/var/run/cups`. On macOS, point at `ipp://host.docker.internal:631`.

## 5. Notes

- Queue stored in `inbox/print-queue.db`, downloads in `inbox/`.
- Session in `auth/` — don't commit it.
- Unofficial client: may break on WhatsApp updates; migrate to Business Cloud API later if needed.
