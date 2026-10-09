import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import express from 'express';
import QRCode from 'qrcode';
import type { AppConfig } from './config.js';
import { ensurePdf, previewPdf } from './converter.js';
import { buildTestPage, listPrinters, listPrintersStructured, printPdf, resolvePrinterName } from './printer.js';
import { getAllowlist, getJob, getSetting, isAdminApproval, isMockPrint, listJobs, setAllowlist, setJobStatus, setSetting } from './queue.js';
import { bridgeState, logoutLink, normalizeNumber, refreshLinkCode, startLinking } from './whatsapp.js';

const PAGE = `<!doctype html>
<html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PrintBridge · WhatsApp to Printer</title>
<style>
:root{
  --brand1:#4f46e5;--brand2:#4f46e5;
  --bg:#f7f7f8;--text:#09090b;--muted:#71717a;
  --row-border:rgba(9,9,11,.09);
  --card:rgba(255,255,255,.78);--card-border:rgba(9,9,11,.08);
  --pre-bg:#09090b;--pre-text:#f4f4f5;
  --code-bg:rgba(79,70,229,.09);
  --shadow:0 12px 32px rgba(9,9,11,.08);
  --green-bg:#dcfce7;--green-tx:#15803d;--amber-bg:#fef3c7;--amber-tx:#b45309;
  --gray-bg:rgba(9,9,11,.06);--gray-tx:#52525b;--red-bg:#fee2e2;--red-tx:#b91c1c;
  --field:rgba(255,255,255,.7);
  --modal-ov:rgba(255,255,255,.45);--modal-card:rgba(255,255,255,.82);
}
[data-theme="dark"]{
  --brand1:#818cf8;--brand2:#818cf8;
  --bg:#09090b;--text:#fafafa;--muted:#a1a1aa;
  --row-border:rgba(255,255,255,.1);
  --card:rgba(24,24,27,.66);--card-border:rgba(255,255,255,.09);
  --pre-bg:#000;--pre-text:#e4e4e7;
  --code-bg:rgba(129,140,248,.14);
  --shadow:0 12px 32px rgba(0,0,0,.5);
  --green-bg:rgba(20,60,40,.8);--green-tx:#6ee7a8;--amber-bg:rgba(70,45,5,.8);--amber-tx:#fbbf24;
  --gray-bg:rgba(255,255,255,.08);--gray-tx:#d4d4d8;--red-bg:rgba(70,18,18,.8);--red-tx:#fca5a5;
  --field:rgba(255,255,255,.04);
  --modal-ov:rgba(0,0,0,.45);--modal-card:rgba(28,28,32,.72);
}
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;background:var(--bg);color:var(--text);min-height:100vh;font-weight:300;overflow-x:hidden;transition:background .4s,color .4s}
header{background:#09090b;color:#fff;padding:28px 16px 70px}
.header-in{max-width:1360px;margin:0 auto;display:flex;align-items:center;gap:16px;position:relative;z-index:1}
.logo{width:52px;height:52px;flex:none;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.4);border-radius:16px;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(0,0,0,.2)}
.logo svg{width:30px;height:30px}
header h1{margin:0;font-size:27px;font-weight:200;letter-spacing:2.5px}
header p{margin:5px 0 0;opacity:.92;font-size:13.5px;font-weight:300;letter-spacing:.3px}
.theme-btn{margin-left:auto;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.4);color:#fff;font-weight:500;padding:9px 18px;border-radius:999px;cursor:pointer;font-size:13px;white-space:nowrap;backdrop-filter:blur(8px);transition:background .25s,transform .25s}
.theme-btn:hover{background:rgba(255,255,255,.3);transform:translateY(-1px)}
main{max-width:1360px;margin:-38px auto 48px;padding:0 24px;position:relative;z-index:1}
.dash-grid{display:grid;grid-template-columns:320px minmax(0,1fr);gap:16px;align-items:start}
.dash-main{min-width:0;display:flex;flex-direction:column;gap:0}
.dash-main .card{margin-top:16px}
.dash-side{min-width:0}
.dash-side .card{margin-top:16px}
.dash-side .pair-code{font-size:25px;letter-spacing:6px;text-indent:6px}
@media(max-width:920px){.dash-grid{grid-template-columns:1fr}}
.plist{display:flex;flex-direction:column;gap:8px;margin:12px 0}
.prow{display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid var(--card-border);border-radius:12px;background:var(--field);cursor:pointer;font-size:13.5px;transition:border-color .2s,transform .2s,box-shadow .2s}
.prow:hover{border-color:var(--brand1);transform:translateY(-1px)}
.prow.active{border-color:var(--brand1);box-shadow:0 0 0 3px rgba(79,70,229,.18)}
.prow .pdot{width:8px;height:8px;border-radius:50%;background:#22c55e;flex:none}
.prow .pdot.off{background:#f59e0b}
.prow .pname{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prow .ptag{margin-left:auto;flex:none}
.alist-row{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--card-border);border-radius:11px;background:var(--field);font-size:13.5px;margin-bottom:6px}
.alist-row button{margin-left:auto}
details summary{list-style:none}
details summary::-webkit-details-marker{display:none}
.tabs{display:inline-flex;background:var(--card);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid var(--card-border);border-radius:999px;padding:5px;gap:4px;box-shadow:var(--shadow)}
.tab{border:0;background:transparent;color:var(--muted);font-weight:500;font-size:14px;padding:10px 24px;border-radius:999px;cursor:pointer;transition:all .25s}
.tab.active{background:linear-gradient(135deg,var(--brand1),var(--brand2));color:#fff;box-shadow:0 6px 18px rgba(79,70,229,.4)}
.card{background:var(--card);backdrop-filter:blur(22px) saturate(1.35);-webkit-backdrop-filter:blur(22px) saturate(1.35);border:1px solid var(--card-border);border-radius:20px;box-shadow:var(--shadow);padding:24px;margin-top:16px;animation:rise .55s cubic-bezier(.2,.7,.3,1) both}
.card:nth-child(3){animation-delay:.07s}.card:nth-child(4){animation-delay:.14s}.card:nth-child(5){animation-delay:.21s}
@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.card h2{margin:0 0 14px;font-size:16.5px;font-weight:500;letter-spacing:.3px;display:flex;align-items:center;gap:9px}
.dot{width:11px;height:11px;border-radius:50%;display:inline-block;flex:none}
.wa-icon{width:22px;height:22px;display:inline-flex;flex:none}
.wa-icon svg{width:100%;height:100%}
.dot.on{background:#22c55e;animation:pulse-g 2.2s infinite}
.dot.off{background:#f59e0b;animation:pulse-a 2.2s infinite}
@keyframes pulse-g{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}70%{box-shadow:0 0 0 9px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
@keyframes pulse-a{0%{box-shadow:0 0 0 0 rgba(245,158,11,.55)}70%{box-shadow:0 0 0 9px rgba(245,158,11,0)}100%{box-shadow:0 0 0 0 rgba(245,158,11,0)}}
.status-pill{font-size:12.5px;font-weight:500;padding:5px 14px;border-radius:999px;letter-spacing:.3px}
.status-pill.on{background:var(--green-bg);color:var(--green-tx)}
.status-pill.off{background:var(--amber-bg);color:var(--amber-tx)}
.link-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
input,select{background:var(--field);backdrop-filter:blur(8px);color:var(--text);border:1px solid var(--card-border);padding:9px 12px;border-radius:11px;font-size:14px;font-weight:300;max-width:100%;transition:border-color .2s,box-shadow .2s}
input:focus,select:focus{outline:none;border-color:var(--brand1);box-shadow:0 0 0 3px rgba(79,70,229,.22)}
.link-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:4px}
@media(max-width:660px){.link-grid{grid-template-columns:1fr}}
.opt-card{background:var(--field);border:1px solid var(--card-border);border-radius:16px;padding:22px 16px;text-align:center;backdrop-filter:blur(10px);transition:transform .3s,box-shadow .3s}
.opt-card:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
.opt-card h3{margin:0 0 2px;font-size:15px;font-weight:500;letter-spacing:.3px}
.opt-card .sub{color:var(--muted);font-size:12.5px;font-weight:300;margin-bottom:14px;letter-spacing:.4px}
.opt-icon{width:48px;height:48px;margin:0 auto 12px;border-radius:50%;background:linear-gradient(135deg,var(--brand1),var(--brand2));display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(79,70,229,.45)}
.opt-icon svg{width:23px;height:23px}
.opt-card img{width:220px;height:220px;max-width:100%;border:10px solid #fff;outline:1px solid rgba(15,23,42,.12);border-radius:12px;box-shadow:0 8px 26px rgba(0,0,0,.18);transition:transform .3s}
.opt-card img:hover{transform:scale(1.03)}
.opt-card .hint{margin-top:12px}
.pair-code{font-size:32px;font-weight:200;letter-spacing:9px;text-indent:9px;background:linear-gradient(135deg,#1c1c1e,#000);color:#fff;padding:16px 18px;border-radius:14px;margin-bottom:12px;text-align:center;font-variant-numeric:tabular-nums;box-shadow:0 8px 26px rgba(20,10,60,.45),inset 0 1px 0 rgba(255,255,255,.15)}
.code-sub{color:var(--muted);font-size:13px;font-weight:300;margin-bottom:12px;text-align:center}
.hint{color:var(--muted);font-size:13.5px;font-weight:300;line-height:1.65;letter-spacing:.2px}
.hint ol{margin:8px 0;padding-left:20px}
.hint code,.step code{background:var(--code-bg);padding:2px 7px;border-radius:7px;font-size:12.5px;color:var(--text)}
pre{background:var(--pre-bg);color:var(--pre-text);padding:15px 17px;border-radius:13px;font-size:12.5px;font-weight:300;white-space:pre-wrap;margin:12px 0 0;border:1px solid var(--card-border)}
.printer-row{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin:10px 0 4px}
.msg{font-size:13px;font-weight:300;color:var(--muted);min-height:18px}
table{border-collapse:collapse;width:100%}
th,td{padding:10px 10px;text-align:left;font-size:14px;border-bottom:1px solid var(--row-border)}
tbody tr{transition:background .2s}
tbody tr:hover{background:rgba(79,70,229,.07)}
th{color:var(--muted);font-weight:500;text-transform:uppercase;font-size:11px;letter-spacing:1px}
.badge{padding:4px 12px;border-radius:999px;font-size:11.5px;font-weight:500;letter-spacing:.3px}
.pending{background:var(--amber-bg);color:var(--amber-tx)}.printed{background:var(--green-bg);color:var(--green-tx)}
.cancelled{background:var(--gray-bg);color:var(--gray-tx)}.failed{background:var(--red-bg);color:var(--red-tx)}
button.action{background:linear-gradient(135deg,var(--brand1),var(--brand2));border:0;color:#fff;font-weight:500;padding:8px 18px;border-radius:11px;cursor:pointer;font-size:13.5px;box-shadow:0 6px 18px rgba(79,70,229,.4);transition:transform .2s,filter .2s,box-shadow .2s}
button.action:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 10px 24px rgba(79,70,229,.5)}
button.action:active{transform:translateY(0)}
button.action:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none;filter:grayscale(.4)}
button.ghost{background:transparent;border:1px solid var(--card-border);color:var(--text);font-weight:400;padding:7px 15px;border-radius:11px;cursor:pointer;font-size:13px;backdrop-filter:blur(6px);transition:border-color .2s,transform .2s}
button.ghost:hover{border-color:var(--brand1);transform:translateY(-1px)}
button.danger{background:var(--red-bg);border:1px solid transparent;color:var(--red-tx);font-weight:500;padding:7px 15px;border-radius:11px;cursor:pointer;font-size:13px;transition:transform .2s}
button.danger:hover{transform:translateY(-1px)}
.empty{color:var(--muted);font-size:14px;font-weight:300;padding:12px 0}
.row-actions{display:flex;gap:6px;align-items:center;flex-wrap:nowrap;overflow-x:auto;padding-bottom:3px;scrollbar-width:thin}
.row-actions button,.row-actions select,.row-actions input{flex:none}
.act-col{display:flex;flex-direction:column;gap:5px;align-items:flex-start}
.opts{display:flex;gap:5px;align-items:center}
.opts select,.opts input{padding:3px 6px;font-size:12px;border-radius:7px}
.table-wrap{overflow-x:auto;margin:0 -4px;padding:0 4px}
.toolbar{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center}
.toolbar input[type="text"]{flex:1;min-width:180px}
.toolbar input[type="date"]{flex:0 0 auto;width:150px;min-width:0;color:var(--muted)}
.toolbar select{flex:0 0 auto;max-width:100%}
[data-theme="dark"] input[type="date"]{color-scheme:dark}
th.sortable{cursor:pointer;user-select:none;white-space:nowrap}
th.sortable:hover{color:var(--text)}
button.mini{background:none;border:0;color:var(--muted);font-size:13px;font-weight:400;cursor:pointer;padding:4px 6px;white-space:nowrap}
button.mini:hover{color:var(--brand1);text-decoration:underline}
.icon-btn{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:1px solid var(--card-border);color:var(--text);border-radius:10px;cursor:pointer;font-size:15px;flex:none;transition:border-color .2s,transform .2s,box-shadow .2s}
.icon-btn:hover{border-color:var(--brand1);transform:translateY(-1px)}
.icon-btn.primary{background:linear-gradient(135deg,var(--brand1),var(--brand2));border:0;color:#fff;box-shadow:0 4px 14px rgba(79,70,229,.4)}
.icon-btn.primary:hover{filter:brightness(1.1)}
.icon-btn svg{width:16px;height:16px}
[data-tip]{position:relative}
[data-tip]:hover::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 9px);left:50%;transform:translateX(-50%);background:#09090b;color:#fff;font-size:11.5px;font-weight:400;padding:5px 11px;border-radius:8px;white-space:nowrap;z-index:70;pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.3)}
[data-theme="dark"] [data-tip]:hover::after{background:#f4f4f5;color:#09090b}
.icon-btn.c-blue{color:#2563eb;border-color:rgba(37,99,235,.4);background:rgba(37,99,235,.1)}
.icon-btn.c-green{background:#16a34a;border:0;color:#fff;box-shadow:0 4px 14px rgba(22,163,74,.4)}
.icon-btn.c-green:hover{filter:brightness(1.08)}
.icon-btn.c-red{color:#dc2626;border-color:rgba(220,38,38,.35);background:rgba(220,38,38,.08)}
.icon-btn.c-amber{color:#d97706;border-color:rgba(217,119,6,.4);background:rgba(217,119,6,.12)}
.icon-btn.c-violet{color:#7c3aed;border-color:rgba(124,58,237,.4);background:rgba(124,58,237,.1)}
[data-theme="dark"] .icon-btn.c-blue{color:#60a5fa}
[data-theme="dark"] .icon-btn.c-red{color:#f87171}
[data-theme="dark"] .icon-btn.c-amber{color:#fbbf24}
[data-theme="dark"] .icon-btn.c-violet{color:#a78bfa}
.step{display:flex;gap:15px;margin:18px 0}
.step-num{flex:none;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--brand1),var(--brand2));color:#fff;font-weight:600;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(79,70,229,.4)}
.step h3{margin:3px 0 7px;font-size:15px;font-weight:500}
.step p{margin:0;color:var(--muted);font-size:14px;font-weight:300;line-height:1.65}
.cmd-table td:first-child{white-space:nowrap}
.switch-wrap{display:inline-flex;align-items:center;gap:9px;margin-left:auto;cursor:pointer;font-size:12.5px;font-weight:500;color:var(--muted)}
.switch-wrap input{display:none}
.switch{width:42px;height:23px;border-radius:999px;background:var(--gray-bg);position:relative;transition:.25s;display:inline-block;flex:none;border:1px solid var(--card-border)}
.switch::after{content:'';position:absolute;width:16px;height:16px;border-radius:50%;background:#fff;top:2.5px;left:3px;transition:.25s;box-shadow:0 1px 4px rgba(0,0,0,.35)}
.switch-wrap input:checked + .switch{background:linear-gradient(135deg,var(--brand1),var(--brand2));box-shadow:0 0 14px rgba(79,70,229,.55)}
.switch-wrap input:checked + .switch::after{left:21px}
.switch-wrap.conn input + .switch{transition:background .3s,box-shadow .3s}
.switch-wrap.conn-connected input + .switch{background:#16a34a;border-color:#16a34a;box-shadow:0 0 12px rgba(22,163,74,.55)}
.switch-wrap.conn-wait input + .switch{background:#f59e0b;border-color:#f59e0b;box-shadow:0 0 12px rgba(245,158,11,.5)}
.switch-wrap.conn-idle input + .switch{background:#ef4444;border-color:#ef4444;box-shadow:0 0 12px rgba(239,68,68,.5)}
.switch-wrap.conn-progress input + .switch{background:#2563eb;border-color:#2563eb;animation:pulse-b 1.4s infinite}
@keyframes pulse-b{0%{box-shadow:0 0 0 0 rgba(37,99,235,.55)}70%{box-shadow:0 0 0 9px rgba(37,99,235,0)}100%{box-shadow:0 0 0 0 rgba(37,99,235,0)}}
.switch.big{width:52px;height:27px}
.switch.big::after{width:19px;height:19px;top:3px}
.switch-wrap input:checked + .switch.big::after{left:27px}
.dash-side .link-grid{grid-template-columns:1fr}
#preview-modal,#link-modal,#app-modal{animation:fade .25s ease}
#preview-modal > div,#link-modal > div,#app-modal > div{animation:pop .3s cubic-bezier(.2,.7,.3,1.1)}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes pop{from{opacity:0;transform:scale(.96) translateY(10px)}to{opacity:1;transform:none}}
footer{text-align:center;color:var(--muted);font-size:12px;font-weight:300;margin:28px 0;letter-spacing:.5px}
a{color:var(--brand1)}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
</style></head><body>
<header>
  <div class="header-in">
    <div class="logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/>
        <rect x="6" y="14" width="12" height="7" rx="1" fill="#fff" stroke="none"/>
        <circle cx="17.5" cy="12" r="1" fill="#fff" stroke="none"/>
      </svg>
    </div>
    <div>
      <h1>PrintBridge</h1>
      <p>WhatsApp to printer · PDF · images · Office files</p>
    </div>
    <button class="theme-btn" id="theme-btn" onclick="toggleTheme()">🌙 Dark</button>
  </div>
</header>
<main>
  <div class="tabs">
    <button class="tab active" id="tab-dash" onclick="showTab('dash')">Dashboard</button>
    <button class="tab" id="tab-allow" onclick="showTab('allow')">Allowed Senders</button>
    <button class="tab" id="tab-guide" onclick="showTab('guide')">Setup Guide</button>
  </div>

  <div id="view-dash">
  <div class="dash-grid">
   <aside class="dash-side">
    <div class="card">
      <h2><span class="wa-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="#25D366" d="M12 2a10 10 0 0 0-8.5 15.5L2 22l4.7-1.2A10 10 0 1 0 12 2z"/><g transform="translate(7,7) scale(0.42)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></g></svg></span> WhatsApp
        <label class="switch-wrap conn" id="conn-switch" title="Show QR and pairing options">
          <input type="checkbox" id="connect-toggle" onchange="toggleConnect(this.checked)">
          <span class="switch"></span>
        </label>
      </h2>
      <div class="hint" id="qr-hint" style="margin:2px 0 0">Flip the switch to reveal QR and pairing options.</div>
      <div class="link-row" id="link-active" style="display:none">
        <span>Linked as <b id="link-account">unknown</b></span>
        <button class="danger" onclick="unlink()">Unlink</button>
      </div>
      <div class="hint" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--row-border)">Status: <span id="conn-pill" class="status-pill off">Waiting to link…</span></div>
    </div>
    <div class="card">
      <h2>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><rect x="6" y="14" width="12" height="7"/></svg>
        Printers
        <label class="switch-wrap" title="When ON, jobs are archived instead of printed.">
          <input type="checkbox" id="mock-toggle" onchange="setMock(this.checked)">
          <span class="switch"></span><span id="mock-label">Mock print</span>
        </label>
      </h2>
      <div class="hint" style="margin:2px 0 10px">Active: <b id="printer-active">(system default)</b></div>
      <div class="printer-row">
        <select id="printer-select" style="flex:1;min-width:0" onchange="setActivePrinter()" title="Select printer"></select>
        <button class="icon-btn" data-tip="Refresh printers" aria-label="Refresh printers" onclick="loadPrinters()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></button>
      </div>
      <button class="action" style="width:100%;padding:11px;margin-top:8px;font-size:14px" onclick="testPrint()"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:17px;height:17px;vertical-align:-3px"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Test print</button>
      <div class="msg" id="printer-msg"></div>
    </div>
   </aside>
   <div class="dash-main">
    <div class="card">
      <h2>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><rect x="6" y="14" width="12" height="7"/></svg>
        Print queue
        <label class="switch-wrap" title="When ON, jobs wait for dashboard approval. When OFF, WhatsApp PRINT prints directly.">
          <input type="checkbox" id="approval-toggle" onchange="setApproval(this.checked)">
          <span class="switch"></span><span id="approval-label">Admin approval</span>
        </label>
      </h2>
      <div class="toolbar">
        <input type="text" id="job-search" placeholder="Search file or sender…" oninput="renderJobs()">
        <select id="job-filter" onchange="renderJobs()" title="Filter by status">
          <option value="">All</option><option value="pending">Pending</option><option value="printed">Printed</option><option value="cancelled">Cancelled</option><option value="failed">Failed</option>
        </select>
        <input type="date" id="job-date" onchange="renderJobs()" title="Filter by date">
      </div>
      <div class="table-wrap"><table><thead><tr><th class="sortable" onclick="sortBy('id')"># <span id="sort-id"></span></th><th class="sortable" onclick="sortBy('originalName')">File <span id="sort-originalName"></span></th><th class="sortable" onclick="sortBy('sender')">Sender <span id="sort-sender"></span></th><th class="sortable" onclick="sortBy('status')">Status <span id="sort-status"></span></th><th class="sortable" onclick="sortBy('createdAt')">Received <span id="sort-createdAt"></span></th><th>Options</th><th>Actions</th></tr></thead>
      <tbody id="jobs"></tbody></table></div>
      <div class="empty" id="jobs-empty" style="display:none">No jobs yet — send a PDF, image or Office file to the linked WhatsApp number.</div>
    </div>
   </div><!-- /dash-main -->
  </div><!-- /dash-grid -->
    <div id="app-modal" style="display:none;position:fixed;inset:0;background:rgba(2,6,23,.7);backdrop-filter:blur(6px);z-index:60;padding:24px" onclick="if(event.target===this)closeAppModal()">
      <div style="background:var(--card);border:1px solid var(--card-border);border-radius:18px;max-width:420px;margin:12vh auto;padding:22px;box-shadow:var(--shadow)">
        <b>PrintBridge</b>
        <p class="hint" id="app-modal-msg" style="margin:10px 0 16px"></p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="ghost" id="app-modal-cancel" onclick="closeAppModal()">Cancel</button>
          <button class="action" id="app-modal-ok" onclick="closeAppModal()">OK</button>
        </div>
      </div>
    </div>
  </div>

  <div id="view-allow" style="display:none">
    <div class="card">
      <h2>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Allowed senders
      </h2>
      <p class="hint" style="margin:0 0 6px">Only these numbers can send files for printing. Leave the list empty to allow anyone who messages the linked number.</p>
      <div class="hint" id="allowlist-mode">loading…</div>
      <div id="allowlist-numbers" style="margin-top:8px"></div>
      <div class="link-row" style="margin:10px 0 0">
        <input id="allowlist-input" placeholder="e.g. 919876543210" size="20" onkeydown="if(event.key==='Enter')addNumber()">
        <button class="action" onclick="addNumber()">Add</button>
      </div>
      <div class="msg" id="allowlist-msg"></div>
    </div>
  </div>

  <div id="view-guide" style="display:none">
    <div class="card">
      <h2>Getting started</h2>
      <div class="step"><div class="step-num">1</div><div>
        <h3>Link WhatsApp</h3>
        <p>Flip the <b>Connect WhatsApp</b> switch on the Dashboard to reveal the QR and pairing-code options. Scan the QR, or enter your number with country code and press <b>Get code</b>. Linking is one-time; the session persists across restarts.</p>
      </div></div>
      <div class="step"><div class="step-num">2</div><div>
        <h3>Connect a printer</h3>
        <p>Pick the active printer from the <b>Printers</b> dropdown in the side panel and press <b>Set as active</b>, then <b>Test print</b> to verify. No hardware? Flip the <b>Mock print</b> switch in the same panel — the list switches to 4 mock printers and jobs are archived to <code>inbox/printed/</code> instead of printing.</p>
      </div></div>
      <div class="step"><div class="step-num">3</div><div>
        <h3>Customer sends a file</h3>
        <p>From <b>another phone</b>, the customer sends a PDF, JPG, PNG, WEBP, DOCX, PPTX or XLSX <b>to the linked number</b>. The bot confirms receipt. The customer can reply <code>CANCEL</code> to withdraw it. Restrict who can trigger prints from the <b>Allowed senders</b> panel — empty means anyone.</p>
      </div></div>
      <div class="step"><div class="step-num">4</div><div>
        <h3>Print — direct or admin-approved</h3>
        <p>The <b>Admin approval</b> switch on the queue card controls this. <b>OFF:</b> the customer replies <code>PRINT [BW|COLOR] [COPIES N]</code> and it prints immediately. <b>ON:</b> the customer is told to wait — you click <b>👁 Preview</b> to inspect, choose <b>BW/COLOR</b> + copies, then <b>✓ Approve &amp; Print</b>. Nothing prints without approval in ON mode.</p>
      </div></div>
    </div>
    <div class="card">
      <h2>Commands &amp; approvals</h2>
      <table class="cmd-table"><thead><tr><th>Where</th><th>Action</th><th>Effect</th></tr></thead><tbody>
        <tr><td>WhatsApp</td><td><code>PRINT [BW|COLOR] [COPIES N]</code></td><td>Prints immediately when approval is OFF; acknowledged-and-queued when ON</td></tr>
        <tr><td>WhatsApp</td><td><code>CANCEL</code></td><td>Customer withdraws their pending file</td></tr>
        <tr><td>Dashboard</td><td>👁 Preview</td><td>Inspect the file (PDF) before printing; original via “Open original”</td></tr>
        <tr><td>Dashboard</td><td>BW / COLOR + copies</td><td>Per-job print options (default BW, 1 copy)</td></tr>
        <tr><td>Dashboard</td><td>✓ Approve &amp; Print</td><td>Print now — works for pending and cancelled jobs (the only way a job prints when approval is ON)</td></tr>
        <tr><td>Dashboard</td><td>↻ Retry</td><td>Failed jobs go back to pending for another attempt</td></tr>
        <tr><td>Dashboard</td><td>🖨 Reprint</td><td>Print an already-printed job again with chosen options</td></tr>
      </tbody></table>
    </div>
    <div class="card">
      <h2>Troubleshooting</h2>
      <div class="step"><div class="step-num">!</div><div>
        <h3>File not showing in the queue?</h3>
        <p>Send a <b>fresh</b> file after the status shows Connected (messages arriving before linking are never seen). It must come <b>from a different number</b> — messages sent from the linked device itself are ignored. Also check it goes to the linked number's chat.</p>
      </div></div>
      <div class="step"><div class="step-num">!</div><div>
        <h3>Print failed?</h3>
        <p>Check the Printer status card and <code>lpstat -p -d</code>. Office files need LibreOffice (<code>soffice</code>) installed. Oversized files (over <code>MAX_FILE_MB</code>) are rejected with a WhatsApp reply.</p>
      </div></div>
    </div>
  </div>
</main>
<footer>PrintBridge · v1 · refreshes every 3s</footer>
<div id="link-modal" style="display:none;position:fixed;inset:0;background:var(--modal-ov);backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);z-index:50;padding:24px;overflow-y:auto;align-items:center;justify-content:center" onclick="if(event.target===this)closeLinkModal()">
  <div style="background:var(--modal-card);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--card-border);border-radius:18px;width:100%;max-width:660px;margin:auto;padding:22px;box-shadow:var(--shadow)">
    <div style="display:flex;align-items:center;margin-bottom:6px">
      <b>Connect WhatsApp</b>
      <button class="ghost" style="margin-left:auto" onclick="closeLinkModal()">✕ Close</button>
    </div>
    <div class="link-grid">
      <div class="opt-card" id="opt-qr" style="display:none">
        <div class="opt-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18h3v3h-3z"/></svg>
        </div>
        <img id="qr-img" alt="WhatsApp login QR">
        <div class="hint">WhatsApp → Settings → Linked devices → Link a device</div>
      </div>
      <div class="opt-card" id="opt-code" style="display:none">
        <div class="opt-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18.5h2"/></svg>
        </div>
        <h3>Pairing code</h3>
        <div class="sub">No camera needed</div>
        <div class="pair-code" id="pair-code">········</div>
        <input id="wa-phone" placeholder="Number with country code" oninput="phoneInput()" style="width:100%;margin:10px 0 8px">
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button class="action" id="pair-btn" onclick="savePhoneAndGetCode()" disabled>Get code</button>
          <button class="ghost" onclick="clearPhone()">Clear</button>
        </div>
        <div class="code-sub" style="margin-top:8px"><a href="#" onclick="newCode();return false">get a new code</a><span class="hint"> · 11–15 digits incl. country code</span></div>
      </div>
    </div>
  </div>
</div>
<div id="preview-modal" style="display:none;position:fixed;inset:0;background:rgba(2,6,23,.7);backdrop-filter:blur(6px);z-index:50;padding:24px" onclick="if(event.target===this)closePreview()">
  <div style="background:var(--card);border:1px solid var(--card-border);border-radius:18px;max-width:900px;margin:0 auto;height:100%;display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--shadow)">
    <div style="display:flex;gap:10px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--row-border)">
      <b id="preview-title">Preview</b>
      <a id="preview-original" href="#" target="_blank" style="font-size:13px">Open original</a>
      <button class="ghost" style="margin-left:auto" onclick="closePreview()">✕ Close</button>
    </div>
    <iframe id="preview-frame" title="File preview" style="flex:1;border:0;width:100%"></iframe>
  </div>
</div>
<script>
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
let phoneTouched=false;
function showTab(name){
  if(name!=='dash'&&name!=='allow'&&name!=='guide')name='dash';
  for(const t of ['dash','allow','guide']){
    document.getElementById('view-'+t).style.display = name===t?'block':'none';
    document.getElementById('tab-'+t).className = 'tab'+(name===t?' active':'');
  }
  try{localStorage.setItem('pb-tab',name)}catch(e){}
}
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  document.getElementById('theme-btn').textContent = t==='dark'?'☀️ Light':'🌙 Dark';
  try{localStorage.setItem('pb-theme-v2',t)}catch(e){}
}
function toggleTheme(){
  applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark');
}
(function init(){
  let t='light',tab='dash';
  try{t=localStorage.getItem('pb-theme-v2')||'light';tab=localStorage.getItem('pb-tab')||'dash'}catch(e){}
  applyTheme(t);showTab(tab);
  try{if(localStorage.getItem('pb-connect')==='1')document.getElementById('connect-toggle').checked=true;}catch(e){}
  loadPrinters();loadSettings();loadAllowlist();
})();
let allJobs=[],jobSort={key:'id',dir:-1};
const ICON_EYE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_X='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const ICON_RETRY='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
const ICON_PRINT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
function sortBy(key){
  if(jobSort.key===key)jobSort.dir*=-1;else jobSort={key:key,dir:1};
  renderJobs();
}
function dayOf(ts){
  const d=new Date(ts);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function renderJobs(){
  const q=(document.getElementById('job-search').value||'').toLowerCase();
  const f=document.getElementById('job-filter').value;
  const dd=document.getElementById('job-date').value;
  let rows=allJobs.filter(j=>(!f||j.status===f)&&(!dd||dayOf(j.createdAt)===dd)&&(!q||(j.originalName+' '+j.sender+' '+(j.senderName||'')+' '+j.status).toLowerCase().includes(q)));
  const sk=jobSort.key,sd=jobSort.dir;
  rows=rows.slice().sort((a,b)=>{
    let x=a[sk],y=b[sk];
    if(sk==='sender'){x=a.senderName||a.sender;y=b.senderName||b.sender;}
    const c=(typeof x==='number'&&typeof y==='number')?x-y:String(x).localeCompare(String(y));
    return c*sd;
  });
  for(const k of ['id','originalName','sender','status','createdAt'])
    document.getElementById('sort-'+k).textContent=(jobSort.key===k?(jobSort.dir===1?'▲':'▼'):'');
  document.getElementById('jobs').innerHTML = rows.map(j => {
    const previewBtn = '<button class="icon-btn" data-tip="Preview" aria-label="Preview" onclick="openPreview('+j.id+')">'+ICON_EYE+'</button>';
    const senderCell = (j.senderName && j.senderName!==j.sender)
      ? '<b>'+esc(j.senderName)+'</b><br><span class="hint">'+esc(j.sender)+'</span>'
      : esc(j.sender);
    const optsCell = (j.status==='pending'||j.status==='printed'||j.status==='cancelled')
      ? '<span class="opts"><select id="color-'+j.id+'" title="Color mode"><option value="BW">BW</option><option value="COLOR">COLOR</option></select>'+
        '<input id="copies-'+j.id+'" type="number" min="1" max="10" value="1" style="width:44px" title="Copies (1-10)"></span>'
      : '';
    let actions = '<div class="row-actions">'+previewBtn+'</div>';
    if (j.status==='pending') {
      actions = '<div class="row-actions">'+previewBtn+
        '<button class="icon-btn" data-tip="Approve & Print" aria-label="Approve and print" onclick="approveJob('+j.id+')">'+ICON_CHECK+'</button>'+
        '<button class="icon-btn" data-tip="Cancel" aria-label="Cancel" onclick="cancelJob('+j.id+')">'+ICON_X+'</button></div>';
    } else if (j.status==='failed') {
      actions = '<div class="row-actions">'+previewBtn+
        '<button class="icon-btn" data-tip="Retry" aria-label="Retry" onclick="retryJob('+j.id+')">'+ICON_RETRY+'</button></div>';
    } else if (j.status==='cancelled') {
      actions = '<div class="row-actions">'+previewBtn+
        '<button class="icon-btn" data-tip="Approve & Print" aria-label="Approve and print" onclick="approveJob('+j.id+')">'+ICON_CHECK+'</button></div>';
    } else if (j.status==='printed') {
      actions = '<div class="row-actions">'+previewBtn+
        '<button class="icon-btn" data-tip="Reprint" aria-label="Reprint" onclick="reprintJob('+j.id+')">'+ICON_PRINT+'</button></div>';
    }
    const statusLabel = j.status.charAt(0).toUpperCase()+j.status.slice(1);
    return '<tr><td>'+j.id+'</td><td>'+esc(j.originalName)+'</td><td>'+senderCell+'</td>'+
      '<td><span class="badge '+j.status+'">'+statusLabel+'</span></td>'+
      '<td>'+new Date(j.createdAt).toLocaleString()+'</td><td>'+optsCell+'</td><td>'+actions+'</td></tr>';
  }).join('');
  const empty=document.getElementById('jobs-empty');
  if(!allJobs.length){empty.style.display='block';empty.textContent='No jobs yet — send a PDF, image or Office file to the linked WhatsApp number.';}
  else if(!rows.length){empty.style.display='block';empty.textContent='No jobs match the current search/filter.';}
  else empty.style.display='none';
}
async function refresh(){
  try{
    const l = await (await fetch('/api/link')).json();
    const pill=document.getElementById('conn-pill'),
          img=document.getElementById('qr-img'),hint=document.getElementById('qr-hint'),
          optQr=document.getElementById('opt-qr'),optCode=document.getElementById('opt-code'),
          codeEl=document.getElementById('pair-code'),
          tgl=document.getElementById('connect-toggle'),wrap=document.getElementById('conn-switch'),
          act=document.getElementById('link-active');
    if(l.connected){pill.className='status-pill on';pill.textContent='Connected ✓';
      closeLinkModal();
      optQr.style.display='none';optCode.style.display='none';
      tgl.checked=true;tgl.disabled=true;wrap.className='switch-wrap conn conn-connected';
      act.style.display='flex';
      document.getElementById('link-account').textContent=l.account||'unknown';
      hint.style.display='none';}
    else{pill.className='status-pill off';pill.textContent='Waiting to link…';
      tgl.disabled=false;act.style.display='none';
      const phoneInput=document.getElementById('wa-phone');
      if(!phoneTouched&&l.savedPhone){phoneInput.value=l.savedPhone;phoneInput();}
      document.getElementById('link-modal').style.display=tgl.checked?'flex':'none';
      if(l.qr){img.src=l.qr;optQr.style.display='block';}else optQr.style.display='none';
      codeEl.textContent=l.code||'········';optCode.style.display='block';
      hint.style.display='block';
      if(l.idle){wrap.className='switch-wrap conn conn-idle';hint.textContent='Session idle — flip the switch to generate connect options.';}
      else if(!l.qr&&!l.code){wrap.className='switch-wrap conn conn-progress';hint.textContent='Starting link session — options appearing…';}
      else if(!tgl.checked){wrap.className='switch-wrap conn conn-wait';hint.textContent='Flip the switch to reveal QR and pairing options.';}
      else{wrap.className='switch-wrap conn conn-wait';hint.textContent='Scan the QR, or enter your number for a pairing code.';}}
  }catch(e){}
  try{
    const s = await (await fetch('/api/status')).json();
    allJobs = await (await fetch('/api/jobs')).json();
    renderJobs();
  }catch(e){}
}
async function cancelJob(id){await fetch('/api/jobs/'+id+'/cancel',{method:'POST'});refresh();}
async function retryJob(id){
  const r=await (await fetch('/api/jobs/'+id+'/retry',{method:'POST'})).json();
  if(!r.ok)showAlert('Retry failed: '+r.error);
  refresh();
}
async function reprintJob(id){
  const colorMode=document.getElementById('color-'+id).value;
  const copies=document.getElementById('copies-'+id).value;
  const r=await (await fetch('/api/jobs/'+id+'/reprint',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({colorMode,copies})})).json();
  if(!r.ok)showAlert('Reprint failed: '+r.error);
  else showAlert('Reprinted job #'+id+' ('+r.colorMode+', COPIES '+r.copies+').'+(r.mock?' Mock mode — archived, nothing sent to a real printer.':''));
  refresh();
}
async function approveJob(id){
  const colorMode=document.getElementById('color-'+id).value;
  const copies=document.getElementById('copies-'+id).value;
  const r=await (await fetch('/api/jobs/'+id+'/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({colorMode,copies})})).json();
  if(!r.ok)showAlert('Approve failed: '+r.error);
  refresh();
}
function toggleConnect(on){
  try{localStorage.setItem('pb-connect',on?'1':'0')}catch(e){}
  document.getElementById('link-modal').style.display=on?'flex':'none';
  refresh();
}
function closeLinkModal(){
  const m=document.getElementById('link-modal');
  const wasOpen=m.style.display!=='none';
  m.style.display='none';
  if(!wasOpen)return;
  const t=document.getElementById('connect-toggle');
  if(t){t.checked=false;try{localStorage.setItem('pb-connect','0')}catch(e){}}
}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){closeLinkModal();closePreview();closeAppModal();}
});
let appModalConfirm=null;
function showAlert(msg){
  document.getElementById('app-modal-msg').textContent=msg;
  document.getElementById('app-modal-cancel').style.display='none';
  const ok=document.getElementById('app-modal-ok');ok.textContent='OK';ok.onclick=closeAppModal;
  document.getElementById('app-modal').style.display='block';
}
function showConfirm(msg,onYes){
  document.getElementById('app-modal-msg').textContent=msg;
  document.getElementById('app-modal-cancel').style.display='';
  const ok=document.getElementById('app-modal-ok');ok.textContent='Confirm';
  ok.onclick=function(){closeAppModal();if(onYes)onYes();};
  document.getElementById('app-modal').style.display='block';
}
function closeAppModal(){document.getElementById('app-modal').style.display='none';appModalConfirm=null;}
function openPreview(id){
  document.getElementById('preview-title').textContent='Preview — job #'+id;
  document.getElementById('preview-frame').src='/api/jobs/'+id+'/preview';
  document.getElementById('preview-original').href='/api/jobs/'+id+'/file';
  document.getElementById('preview-modal').style.display='block';
}
function closePreview(){
  document.getElementById('preview-modal').style.display='none';
  document.getElementById('preview-frame').src='about:blank';
}
async function loadSettings(){
  try{
    const s=await (await fetch('/api/settings')).json();
    document.getElementById('approval-toggle').checked=!!s.adminApproval;
    document.getElementById('approval-label').textContent=s.adminApproval?'Admin approval: ON':'Admin approval: OFF';
    document.getElementById('mock-toggle').checked=!!s.mockPrint;
    document.getElementById('mock-label').textContent=s.mockPrint?'Mock print: ON':'Mock print: OFF';
  }catch(e){}
}
async function setMock(on){
  await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mockPrint:on})});
  loadSettings();loadPrinters();refresh();
}
async function setApproval(on){
  await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adminApproval:on})});
  loadSettings();
}
function phoneInput(){
  phoneTouched=true;
  const d=document.getElementById('wa-phone').value.replace(/\D/g,'');
  document.getElementById('pair-btn').disabled=!(d.length>=11&&d.length<=15);
}
async function clearPhone(){
  const el=document.getElementById('wa-phone');el.value='';phoneTouched=true;
  document.getElementById('pair-btn').disabled=true;
  const r=await (await fetch('/api/link/phone',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:''})})).json();
  if(!r.ok)showAlert(r.error);refresh();
}
async function savePhoneAndGetCode(){
  const el=document.getElementById('wa-phone');
  const phone=el.value;
  document.getElementById('pair-code').textContent='requesting…';
  document.getElementById('opt-code').style.display='block';
  const r=await (await fetch('/api/link/phone',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone})})).json();
  if(!r.ok)showAlert(r.error);else if(!phone.replace(/\D/g,''))phoneTouched=false;
  refresh();
}
async function unlink(){
  showConfirm('Unlink WhatsApp? You will need to link again to receive files.',async function(){
    await fetch('/api/link/logout',{method:'POST'});refresh();
  });
}
async function loadAllowlist(){
  try{
    const d=await (await fetch('/api/allowlist')).json();
    document.getElementById('tab-allow').textContent=d.open?'Allowed Senders · Open':('Allowed Senders ('+d.numbers.length+')');
    document.getElementById('allowlist-mode').innerHTML=d.open
      ?'<span class="badge printed">Open</span> <span class="hint">— anyone who messages can trigger prints.</span>'
      :'<span class="badge pending">Restricted</span> <span class="hint">— only these numbers trigger prints:</span>';
    document.getElementById('allowlist-numbers').innerHTML=d.numbers.map(n=>
      '<div class="alist-row"><span>'+esc(n)+'</span><button class="mini" onclick="removeNumber(this.dataset.n)" data-n="'+n+'">✕ Remove</button></div>').join('')
      ||'<div class="empty">No restrictions set.</div>';
  }catch(e){}
}
async function saveAllowlist(numbers){
  const r=await (await fetch('/api/allowlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({numbers})})).json();
  if(!r.ok)showAlert(r.error);else document.getElementById('allowlist-msg').textContent=r.open?'Allowlist cleared — open to all numbers.':'Allowlist updated.';
  loadAllowlist();
}
async function addNumber(){
  const el=document.getElementById('allowlist-input');
  const v=el.value.trim();if(!v)return;
  const cur=await (await fetch('/api/allowlist')).json();
  el.value='';
  saveAllowlist([...cur.numbers,v]);
}
async function removeNumber(n){
  const cur=await (await fetch('/api/allowlist')).json();
  saveAllowlist(cur.numbers.filter(x=>x!==n));
}
async function loadPrinters(){
  try{
    const d=await (await fetch('/api/printers')).json();
    document.getElementById('printer-active').textContent=d.active||'(system default)';
    document.getElementById('printer-select').innerHTML=
      '<option value="">(System default)'+(d.defaultName?' — '+esc(d.defaultName):'')+'</option>'+
      d.printers.map(p=>'<option value="'+esc(p.name)+'"'+(p.name===d.active?' selected':'')+'>'+esc(p.name)+(p.enabled?'':' (disabled)')+'</option>').join('')||
      '<option value="">(no printers detected)</option>';
  }catch(e){}
}
async function setActivePrinter(){
  const name=document.getElementById('printer-select').value;
  const r=await (await fetch('/api/printer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name||''})})).json();
  document.getElementById('printer-msg').textContent=r.ok?'':('Error: '+r.error);
  loadPrinters();
}
async function testPrint(){
  document.getElementById('printer-msg').textContent='Sending test page…';
  const r=await (await fetch('/api/printer/test',{method:'POST'})).json();
  document.getElementById('printer-msg').textContent=r.ok?('Test page sent to '+(r.printer||'printer')+(r.mock?' (mock mode — check inbox/printed/)':'')):('Error: '+r.error);
}
async function newCode(){await fetch('/api/link/refresh',{method:'POST'});refresh();}
setInterval(refresh,3000);refresh();
</script></body></html>`;

let qrCache = { qr: '', url: '' };

export function startDashboard(cfg: AppConfig, db: DatabaseSync): void {
  const app = express();
  app.use(express.json());

  app.get('/', (_req, res) => res.type('html').send(PAGE));

  app.get('/api/link', async (_req, res) => {
    let qr: string | null = null;
    if (bridgeState.qr) {
      if (qrCache.qr !== bridgeState.qr) {
        qrCache = { qr: bridgeState.qr, url: await QRCode.toDataURL(bridgeState.qr, { width: 240, margin: 1 }) };
      }
      qr = qrCache.url;
    }
    res.json({
      connected: bridgeState.connected,
      account: bridgeState.account,
      idle: bridgeState.idle,
      qr,
      code: bridgeState.pairingCode,
      savedPhone: getSetting(db, 'linkPhoneNumber') || cfg.linkPhoneNumber,
    });
  });

  app.post('/api/link/start', async (_req, res) => {
    try {
      await startLinking();
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: false, error: (e as Error).message });
    }
  });

  app.post('/api/link/refresh', async (_req, res) => {
    try {
      if (bridgeState.idle) return res.json({ ok: false, error: 'Link session is not running yet — please wait a moment and retry.' });
      const phone = getSetting(db, 'linkPhoneNumber') || cfg.linkPhoneNumber;
      if (!phone) return res.json({ ok: false, error: 'Enter a WhatsApp number first to use pairing codes.' });
      const code = await refreshLinkCode(phone);
      res.json({ ok: true, code });
    } catch (e) {
      res.json({ ok: false, error: (e as Error).message });
    }
  });

  app.get('/api/status', async (_req, res) => {
    try {
      const { raw: printers } = await listPrintersStructured(isMockPrint(db, cfg));
      res.json({ ok: true, printers, configured: resolvePrinterName(db, cfg) || '(system default)', mock: isMockPrint(db, cfg) });
    } catch (e) {
      res.json({ ok: false, printers: `CUPS error: ${(e as Error).message}`, configured: cfg.printerName, mock: isMockPrint(db, cfg) });
    }
  });

  app.get('/api/printers', async (_req, res) => {
    const { printers, defaultName, raw } = await listPrintersStructured(isMockPrint(db, cfg));
    res.json({ printers, defaultName, raw, active: resolvePrinterName(db, cfg) });
  });

  app.post('/api/printer', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    setSetting(db, 'printerName', name);
    res.json({ ok: true, active: resolvePrinterName(db, cfg) });
  });

  app.post('/api/printer/test', async (_req, res) => {
    try {
      const active = resolvePrinterName(db, cfg);
      const buf = await buildTestPage(active);
      const p = path.join(cfg.inboxDir, `test-page-${Date.now()}.pdf`);
      await fs.promises.writeFile(p, buf);
      await printPdf(p, {
        printerName: active,
        colorMode: 'BW',
        copies: 1,
        jobName: 'PrintBridge Test Page',
        mock: isMockPrint(db, cfg),
      });
      res.json({ ok: true, mock: isMockPrint(db, cfg), printer: active || '(system default)' });
    } catch (e) {
      res.json({ ok: false, error: (e as Error).message });
    }
  });

  app.post('/api/link/phone', async (req, res) => {
    const phone = String(req.body?.phone ?? '').replace(/\D/g, '');
    if (bridgeState.connected) {
      res.json({ ok: false, error: 'Already linked — unlink first to switch numbers.' });
      return;
    }
    if (bridgeState.idle) {
      res.json({ ok: false, error: 'Link session is not running yet — please wait a moment and retry.' });
      return;
    }
    if (phone === '') {
      setSetting(db, 'linkPhoneNumber', '');
      res.json({ ok: true, cleared: true });
      return;
    }
    if (phone.length < 7 || phone.length > 15) {
      res.json({ ok: false, error: 'Enter a valid number with country code, e.g. 919876543210.' });
      return;
    }
    try {
      setSetting(db, 'linkPhoneNumber', phone);
      const code = await refreshLinkCode(phone);
      res.json({ ok: true, code });
    } catch (e) {
      res.json({ ok: false, error: (e as Error).message });
    }
  });

  app.post('/api/link/logout', async (_req, res) => {
    try {
      await logoutLink();
      res.json({ ok: true });
    } catch (e) {
      res.json({ ok: false, error: (e as Error).message });
    }
  });

  app.get('/api/allowlist', (_req, res) => {
    const stored = getAllowlist(db);
    const numbers = stored ?? [...cfg.allowedNumbers];
    res.json({ numbers, open: numbers.length === 0, fromEnv: stored === null });
  });

  app.post('/api/allowlist', (req, res) => {
    const raw = req.body?.numbers;
    const list: string[] = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
    const numbers: string[] = [];
    for (const n of list) {
      const d = normalizeNumber(String(n));
      if (d && !numbers.includes(d)) numbers.push(d);
    }
    if (list.length > 0 && numbers.length === 0) {
      res.json({ ok: false, error: 'No valid numbers (use digits with country code, 7–15 digits).' });
      return;
    }
    setAllowlist(db, numbers);
    res.json({ ok: true, numbers, open: numbers.length === 0 });
  });

  app.get('/api/settings', (_req, res) => {
    res.json({ adminApproval: isAdminApproval(db, cfg), mockPrint: isMockPrint(db, cfg) });
  });

  app.post('/api/settings', (req, res) => {
    const pick = (v: unknown): '1' | '0' | null =>
      v === true || v === '1' || v === 'true' ? '1' : v === false || v === '0' || v === 'false' ? '0' : null;
    const a = pick(req.body?.adminApproval);
    const m = pick(req.body?.mockPrint);
    if (a !== null) setSetting(db, 'adminApproval', a);
    if (m !== null) setSetting(db, 'mockPrint', m);
    res.json({ ok: true, adminApproval: isAdminApproval(db, cfg), mockPrint: isMockPrint(db, cfg) });
  });

  app.get('/api/jobs', (_req, res) => {
    res.json(listJobs(db));
  });

  app.get('/api/jobs/:id/file', (req, res) => {
    const job = getJob(db, Number(req.params.id));
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
    res.sendFile(path.resolve(job.storedPath));
  });

  app.get('/api/jobs/:id/preview', async (req, res) => {
    const job = getJob(db, Number(req.params.id));
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
    try {
      const pdf = await previewPdf(job.storedPath, job.mime);
      res.type('application/pdf');
      res.set('Content-Disposition', `inline; filename="preview-${job.id}.pdf"`);
      res.send(pdf);
    } catch (e) {
      res.status(422).json({ ok: false, error: `Preview unavailable: ${(e as Error).message}` });
    }
  });

  app.post('/api/jobs/:id/approve', async (req, res) => {
    const job = getJob(db, Number(req.params.id));
    if (!job) return res.json({ ok: false, error: 'Job not found' });
    if (job.status !== 'pending' && job.status !== 'cancelled') {
      return res.json({ ok: false, error: `Only pending or cancelled jobs can be approved (job is ${job.status}).` });
    }
    const colorMode = String(req.body?.colorMode ?? 'BW').toUpperCase() === 'COLOR' ? 'COLOR' : 'BW';
    let copies = parseInt(req.body?.copies ?? '1', 10);
    if (!Number.isFinite(copies) || copies < 1 || copies > 10) copies = 1;
    try {
      const pdf = await ensurePdf(job.storedPath, job.mime);
      await printPdf(pdf, {
        printerName: resolvePrinterName(db, cfg),
        colorMode,
        copies,
        jobName: job.originalName,
        mock: isMockPrint(db, cfg),
      });
      setJobStatus(db, job.id, 'printed');
      res.json({ ok: true, mock: isMockPrint(db, cfg), colorMode, copies });
    } catch (e) {
      setJobStatus(db, job.id, 'failed');
      res.json({ ok: false, error: (e as Error).message });
    }
  });

  app.post('/api/jobs/:id/cancel', (req, res) => {
    setJobStatus(db, Number(req.params.id), 'cancelled');
    res.json({ ok: true });
  });

  app.post('/api/jobs/:id/retry', (req, res) => {
    const job = getJob(db, Number(req.params.id));
    if (!job) return res.json({ ok: false, error: 'Job not found' });
    if (job.status !== 'failed') {
      return res.json({ ok: false, error: `Only failed jobs can be retried (job is ${job.status}).` });
    }
    setJobStatus(db, job.id, 'pending');
    res.json({ ok: true });
  });

  function parsePrintOpts(body: unknown): { colorMode: 'BW' | 'COLOR'; copies: number } {
    const b = (body ?? {}) as { colorMode?: unknown; copies?: unknown };
    const colorMode = String(b.colorMode ?? 'BW').toUpperCase() === 'COLOR' ? 'COLOR' : 'BW';
    let copies = parseInt(String(b.copies ?? '1'), 10);
    if (!Number.isFinite(copies) || copies < 1 || copies > 10) copies = 1;
    return { colorMode, copies };
  }

  app.post('/api/jobs/:id/reprint', async (req, res) => {
    const job = getJob(db, Number(req.params.id));
    if (!job) return res.json({ ok: false, error: 'Job not found' });
    if (job.status !== 'printed') {
      return res.json({ ok: false, error: `Only printed jobs can be reprinted (job is ${job.status}).` });
    }
    const { colorMode, copies } = parsePrintOpts(req.body);
    try {
      const pdf = await ensurePdf(job.storedPath, job.mime);
      await printPdf(pdf, {
        printerName: resolvePrinterName(db, cfg),
        colorMode,
        copies,
        jobName: job.originalName,
        mock: isMockPrint(db, cfg),
      });
      res.json({ ok: true, mock: isMockPrint(db, cfg), colorMode, copies });
    } catch (e) {
      setJobStatus(db, job.id, 'failed');
      res.json({ ok: false, error: (e as Error).message });
    }
  });

  app.listen(cfg.port, () => console.log(`Dashboard: http://localhost:${cfg.port}`));
}
