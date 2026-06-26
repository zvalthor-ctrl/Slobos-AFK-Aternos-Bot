"use strict";

const { addLog, getLogs } = require("./logger");
const mineflayer = require("mineflayer");
const { Movements, pathfinder, goals } = require("mineflayer-pathfinder");
const { GoalBlock } = goals;
const config = require("./settings.json");
const express = require("express");
const http = require("http");
const https = require("https");

// ============================================================
// EXPRESS SERVER - Keep Render/Aternos alive
// ============================================================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

// Bot state tracking
let botState = {
  connected: false,
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  startTime: Date.now(),
  errors: [],
  wasThrottled: false,
};

// Health check endpoint for monitoring
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${config.name} Dashboard</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" media="print" onload="this.media='all'"
              href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
        <style>
          *, *::before, *::after { box-sizing: border-box; }

          body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: #0d1117;
            color: #e6edf3;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 24px;
          }

          main { width: 100%; max-width: 400px; }

          header { margin-bottom: 28px; }
          header h1 {
            font-size: 26px;
            font-weight: 700;
            color: #f0f6fc;
            margin: 0;
            line-height: 1.2;
          }
          header p {
            font-size: 14px;
            color: #8b949e;
            margin: 6px 0 0;
            line-height: 1.5;
          }

          .status-section {
            border-radius: 12px;
            padding: 20px 24px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 16px;
            transition: background 0.3s, border-color 0.3s;
          }
          .status-section.online  { background: #0d2218; border: 2px solid #238636; }
          .status-section.offline { background: #200d0d; border: 2px solid #da3633; }

          .status-icon {
            width: 44px; height: 44px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 20px; flex-shrink: 0;
            transition: background 0.3s;
          }
          .status-icon.online  { background: #238636; }
          .status-icon.offline { background: #da3633; }

          .status-label { font-size: 18px; font-weight: 700; line-height: 1.2; transition: color 0.3s; }
          .status-label.online  { color: #3fb950; }
          .status-label.offline { color: #f85149; }
          .status-detail { font-size: 13px; color: #8b949e; margin-top: 3px; }

          dl { margin: 0; }
          .stat-card {
            background: #161b22;
            border: 1px solid #21262d;
            border-radius: 10px;
            padding: 16px 20px;
            margin-bottom: 10px;
          }
          dt { font-size: 12px; color: #8b949e; font-weight: 600; margin-bottom: 4px; }
          dd { margin: 0; font-size: 17px; font-weight: 600; color: #e6edf3; line-height: 1.3; }
          .stat-detail { margin: 4px 0 0; font-size: 11px; color: #6e7681; }

          .controls { margin-top: 8px; }
          .btn-grid { display: grid; gap: 10px; margin-bottom: 10px; }
          .btn-grid-2 { grid-template-columns: 1fr 1fr; }

          .btn-primary {
            min-height: 52px; border-radius: 10px;
            font-size: 15px; font-weight: 700;
            cursor: pointer; letter-spacing: 0.3px;
            transition: opacity 0.2s, filter 0.2s;
            font-family: inherit;
          }
          .btn-primary:hover  { filter: brightness(1.1); }
          .btn-primary:active { opacity: 0.85; }
          .btn-start { border: 2px solid #238636; background: #0d2218; color: #3fb950; }
          .btn-stop  { border: 2px solid #da3633; background: #200d0d; color: #f85149; }

          .btn-secondary {
            min-height: 44px; border-radius: 10px;
            border: 1px solid #21262d; background: #161b22; color: #8b949e;
            font-size: 13px; font-weight: 500;
            text-decoration: none;
            display: flex; align-items: center; justify-content: center;
            font-family: inherit; cursor: pointer;
            transition: background 0.2s, color 0.2s;
          }
          .btn-secondary:hover { background: #21262d; color: #c9d1d9; }

          footer { margin-top: 20px; text-align: center; }
          footer p { font-size: 12px; color: #484f58; margin: 0; }
        </style>
      </head>
      <body>
        <main role="main" aria-label="AFK Bot Dashboard">

          <header>
            <h1>AFK Bot Dashboard</h1>
            <p>Minecraft server bot &middot; Live status</p>
          </header>

          <section
            id="status-section"
            role="status"
            aria-live="polite"
            aria-label="Bot connection status"
            class="status-section offline"
          >
            <div id="status-icon" aria-hidden="true" class="status-icon offline">&#x2717;</div>
            <div>
              <div id="status-label" class="status-label offline">Connecting…</div>
              <div id="status-detail" class="status-detail">Establishing connection</div>
            </div>
          </section>

          <section aria-label="Bot statistics">
            <dl>
              <div class="stat-card">
                <dt>Uptime</dt>
                <dd id="uptime-text">—</dd>
                <p class="stat-detail">Time since last connection</p>
              </div>
              <div class="stat-card">
                <dt>Coordinates</dt>
                <dd id="coords-text">Searching…</dd>
                <p class="stat-detail">Bot's current in-game position</p>
              </div>
              <div class="stat-card">
                <dt>Server address</dt>
                <dd>${config.server.ip}</dd>
                <p class="stat-detail">Minecraft server hostname</p>
              </div>
              <div class="stat-card">
                <dt>Bots connectés</dt>
                <dd id="bots-text">—</dd>
                <p class="stat-detail" id="bots-detail">Liste des instances</p>
              </div>
            </dl>
          </section>

          <section class="controls" aria-label="Bot controls">
            <div class="btn-grid btn-grid-2">
              <button class="btn-primary btn-start" onclick="startBot()" aria-label="Start bot">Start bot</button>
              <button class="btn-primary btn-stop" onclick="stopBot()" aria-label="Stop bot">Stop bot</button>
            </div>
            <div class="btn-grid btn-grid-2">
              <a href="/tutorial" class="btn-secondary" aria-label="View setup guide">Setup guide</a>
              <a href="/logs" class="btn-secondary" aria-label="View bot logs">View logs</a>
            </div>
            <div class="stat-card" style="margin-top:10px;">
              <dt style="font-size:12px;color:#8b949e;font-weight:600;margin-bottom:8px;">Nombre de bots</dt>
              <div style="display:flex;gap:8px;align-items:center;">
                <input id="bot-count-input" type="number" min="1" max="10" value="${config["bot-count"] || 1}"
                  style="width:70px;padding:8px 10px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#e6edf3;font-size:15px;font-weight:600;text-align:center;font-family:inherit;" />
                <button onclick="setBotCount()" style="flex:1;min-height:38px;border-radius:8px;border:1px solid #388bfd;background:#0d2044;color:#79c0ff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Sauvegarder</button>
              </div>
              <p id="bot-count-msg" style="margin:6px 0 0;font-size:11px;color:#6e7681;"></p>
            </div>
          </section>

          <footer>
            <p>Status updates every 5 seconds</p>
          </footer>

        </main>

        <script>
          function formatUptime(s) {
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            if (h > 0) return h + 'h ' + m + 'm ' + sec + 's';
            if (m > 0) return m + 'm ' + sec + 's';
            return sec + ' seconds';
          }

          async function update() {
            try {
              const r = await fetch('/health');
              const data = await r.json();
              const online = data.status === 'connected';

              const section = document.getElementById('status-section');
              const icon    = document.getElementById('status-icon');
              const label   = document.getElementById('status-label');
              const detail  = document.getElementById('status-detail');

              section.className = 'status-section ' + (online ? 'online' : 'offline');
              icon.className    = 'status-icon '    + (online ? 'online' : 'offline');
              icon.textContent  = online ? '✓' : '✗';
              label.className   = 'status-label '   + (online ? 'online' : 'offline');
              label.textContent = online ? 'Connected' : 'Disconnected';
              detail.textContent = online ? 'Bot is active on the server' : 'Attempting to reconnect';

              document.getElementById('uptime-text').textContent = formatUptime(data.uptime);

              if (data.coords) {
                const x = Math.floor(data.coords.x);
                const y = Math.floor(data.coords.y);
                const z = Math.floor(data.coords.z);
                document.getElementById('coords-text').textContent = 'X ' + x + ', Y ' + y + ', Z ' + z;
              } else {
                document.getElementById('coords-text').textContent = 'Searching…';
              }

              // Bots multi
              if (data.bots) {
                document.getElementById('bots-text').textContent = data.connectedCount + ' / ' + data.botCount;
                const details = data.bots.map(b =>
                  (b.connected ? '🟢' : '🔴') + ' ' + b.username
                ).join('  ');
                document.getElementById('bots-detail').textContent = details;
              }
            } catch (e) {
              const label = document.getElementById('status-label');
              label.className = 'status-label offline';
              label.textContent = 'Unreachable';
            }
          }

          async function startBot() {
            const r = await fetch('/start', { method: 'POST' });
            const data = await r.json();
            alert(data.success ? 'Bots démarrés !' : data.msg);
            update();
          }

          async function stopBot() {
            const r = await fetch('/stop', { method: 'POST' });
            const data = await r.json();
            alert(data.success ? 'Bots arrêtés !' : data.msg);
            update();
          }

          async function setBotCount() {
            const count = parseInt(document.getElementById('bot-count-input').value, 10);
            const r = await fetch('/set-bot-count', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ count })
            });
            const data = await r.json();
            const msg = document.getElementById('bot-count-msg');
            msg.textContent = data.msg;
            msg.style.color = data.success ? '#3fb950' : '#f85149';
          }

          setInterval(update, 5000);
          update();
        </script>
      </body>
    </html>
  `);
});
app.get("/tutorial", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${config.name} - Setup Guide</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" media="print" onload="this.media='all'"
              href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
        <style>
          *, *::before, *::after { box-sizing: border-box; }

          body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: #0d1117;
            color: #e6edf3;
            margin: 0;
            padding: 40px 24px;
          }

          main {
            width: 100%;
            max-width: 560px;
            margin: 0 auto;
          }

          .back-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 500;
            color: #8b949e;
            text-decoration: none;
            background: #161b22;
            border: 1px solid #21262d;
            border-radius: 8px;
            padding: 7px 14px;
            margin-bottom: 32px;
            transition: color 0.2s, background 0.2s;
          }
          .back-btn:hover { background: #21262d; color: #c9d1d9; }

          header { margin-bottom: 32px; }
          header h1 {
            font-size: 26px;
            font-weight: 700;
            color: #f0f6fc;
            margin: 0;
            line-height: 1.2;
          }
          header p {
            font-size: 14px;
            color: #8b949e;
            margin: 6px 0 0;
            line-height: 1.5;
          }

          .step-card {
            background: #161b22;
            border: 1px solid #21262d;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 16px;
          }

          .step-header {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-bottom: 18px;
          }

          .step-number {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: #0d2218;
            border: 2px solid #238636;
            color: #3fb950;
            font-size: 14px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .step-title {
            font-size: 16px;
            font-weight: 700;
            color: #f0f6fc;
            margin: 0;
          }

          ol {
            margin: 0;
            padding: 0;
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }

          li {
            font-size: 14px;
            color: #8b949e;
            line-height: 1.6;
            padding-left: 20px;
            position: relative;
          }

          li::before {
            content: "·";
            position: absolute;
            left: 6px;
            color: #3fb950;
            font-weight: 700;
          }

          li strong { color: #e6edf3; font-weight: 600; }

          code {
            background: #21262d;
            border: 1px solid #30363d;
            padding: 2px 7px;
            border-radius: 5px;
            font-family: 'SF Mono', 'Fira Code', monospace;
            font-size: 12px;
            color: #e6edf3;
          }

          a { color: #58a6ff; text-decoration: none; }
          a:hover { text-decoration: underline; }

          footer {
            margin-top: 32px;
            text-align: center;
          }
          footer p { font-size: 12px; color: #484f58; margin: 0; }
        </style>
      </head>
      <body>
        <main>
          <a href="/" class="back-btn">&#8592; Back to Dashboard</a>

          <header>
            <h1>Setup Guide</h1>
            <p>Get your AFK bot running in under 15 minutes</p>
          </header>

          <div class="step-card">
            <div class="step-header">
              <div class="step-number">1</div>
              <h2 class="step-title">Configure Aternos</h2>
            </div>
            <ol>
              <li>Go to <strong>Aternos</strong> and open your server.</li>
              <li>Install <strong>Paper/Bukkit</strong> as your server software.</li>
              <li>Enable <strong>Cracked</strong> mode using the green switch.</li>
              <li>Install these plugins: <code>ViaVersion</code>, <code>ViaBackwards</code>, <code>ViaRewind</code></li>
            </ol>
          </div>

          <div class="step-card">
            <div class="step-header">
              <div class="step-number">2</div>
              <h2 class="step-title">GitHub Setup</h2>
            </div>
            <ol>
              <li>Download this project as a ZIP and extract it.</li>
              <li>Edit <code>settings.json</code> with your server IP and port.</li>
              <li>Upload all files to a new <strong>GitHub Repository</strong>.</li>
            </ol>
          </div>

          <div class="step-card">
            <div class="step-header">
              <div class="step-number">3</div>
              <h2 class="step-title">Deploy on Replit (Free 24/7)</h2>
            </div>
            <ol>
              <li>Import your GitHub repo into <strong>Replit</strong>.</li>
              <li>Set the run command to <code>npm start</code>.</li>
              <li>Hit <strong>Run</strong> — the bot connects automatically.</li>
              <li>The bot pings itself every 10 minutes to stay alive.</li>
            </ol>
          </div>

          <footer>
            <p>AFK Bot Dashboard &middot; ${config.name}</p>
          </footer>
        </main>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.json({
    status: botState.connected ? "connected" : "disconnected",
    uptime: Math.floor((Date.now() - botState.startTime) / 1000),
    coords: bot && bot.entity ? bot.entity.position : null,
    lastActivity: botState.lastActivity,
    reconnectAttempts: botState.reconnectAttempts,
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
    botCount: TOTAL_BOTS,
    connectedCount: allBots.filter(b => b.isConnected()).length,
    bots: allBots.map(b => ({ index: b.index, username: b.username, connected: b.isConnected() })),
  });
});

app.post("/set-bot-count", express.json(), (req, res) => {
  const count = parseInt(req.body.count, 10);
  if (isNaN(count) || count < 1 || count > 10)
    return res.json({ success: false, msg: "Nombre invalide (1-10)." });

  const fs = require("fs");
  try {
    const raw = fs.readFileSync("settings.json", "utf8");
    const cfg = JSON.parse(raw);
    cfg["bot-count"] = count;
    fs.writeFileSync("settings.json", JSON.stringify(cfg, null, 2));
    // Apply immediately — no restart needed
    applyBotCount(count);
    addLog(`[Config] Nombre de bots changé → ${count} (appliqué immédiatement).`);
    res.json({ success: true, msg: `${count} bot(s) actifs maintenant.` });
  } catch (e) {
    res.json({ success: false, msg: "Erreur lecture settings.json : " + e.message });
  }
});

app.get("/ping", (req, res) => res.send("pong"));

app.get("/logs", (req, res) => {
  const logs = getLogs();

  const escapeHTML = (str) =>
    str.replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[m],
    );

  const logCount = logs.length;

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${config.name} - Logs</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" media="print" onload="this.media='all'"
              href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
        <style>
          *, *::before, *::after { box-sizing: border-box; }

          body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: #0d1117;
            color: #e6edf3;
            margin: 0;
            padding: 40px 24px;
          }

          main {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
          }

          .back-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 500;
            color: #8b949e;
            text-decoration: none;
            background: #161b22;
            border: 1px solid #21262d;
            border-radius: 8px;
            padding: 7px 14px;
            margin-bottom: 32px;
            transition: color 0.2s, background 0.2s;
          }
          .back-btn:hover { background: #21262d; color: #c9d1d9; }

          .page-header {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            margin-bottom: 20px;
            gap: 12px;
            flex-wrap: wrap;
          }

          .page-header-left h1 {
            font-size: 26px;
            font-weight: 700;
            color: #f0f6fc;
            margin: 0;
            line-height: 1.2;
          }
          .page-header-left p {
            font-size: 14px;
            color: #8b949e;
            margin: 6px 0 0;
          }

          .badge {
            font-size: 12px;
            font-weight: 600;
            color: #8b949e;
            background: #161b22;
            border: 1px solid #21262d;
            border-radius: 20px;
            padding: 4px 12px;
            white-space: nowrap;
          }

          .log-card {
            background: #0d1117;
            border: 1px solid #21262d;
            border-radius: 12px;
            overflow: hidden;
          }

          .log-card-header {
            background: #161b22;
            border-bottom: 1px solid #21262d;
            padding: 12px 18px;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .dot { width: 10px; height: 10px; border-radius: 50%; }
          .dot-red   { background: #ff5f57; }
          .dot-yellow{ background: #ffbd2e; }
          .dot-green { background: #28c840; }

          .log-card-title {
            font-size: 12px;
            font-weight: 500;
            color: #484f58;
            margin-left: 4px;
          }

          .log-body {
            padding: 16px 18px;
            max-height: 560px;
            overflow-y: auto;
            font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 12.5px;
            line-height: 1.7;
          }

          .log-entry { display: block; padding: 1px 0; white-space: pre-wrap; word-break: break-all; }
          .log-entry.error   { color: #ff7b72; }
          .log-entry.warn    { color: #e3b341; }
          .log-entry.success { color: #3fb950; }
          .log-entry.control { color: #58a6ff; }
          .log-entry.default { color: #8b949e; }

          .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: #484f58;
            font-size: 13px;
          }

          .refresh-bar {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 6px;
            margin-top: 12px;
            font-size: 12px;
            color: #484f58;
          }
          .refresh-dot {
            width: 7px; height: 7px;
            border-radius: 50%;
            background: #3fb950;
            animation: pulse 2s infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }

          .console-row {
            display: flex;
            align-items: center;
            border-top: 1px solid #21262d;
            background: #0d1117;
            padding: 10px 18px;
            gap: 10px;
          }

          .console-prompt {
            font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 13px;
            color: #3fb950;
            font-weight: 700;
            flex-shrink: 0;
            user-select: none;
          }

          .console-input {
            flex: 1;
            background: transparent;
            border: none;
            outline: none;
            font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 12.5px;
            color: #e6edf3;
            caret-color: #3fb950;
          }

          .console-input::placeholder { color: #484f58; }

          .console-send {
            background: #0d2218;
            border: 1px solid #238636;
            color: #3fb950;
            font-size: 12px;
            font-weight: 600;
            padding: 5px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-family: inherit;
            transition: background 0.2s;
            flex-shrink: 0;
          }
          .console-send:hover { background: #122d1a; }
          .console-send:disabled { opacity: 0.5; cursor: default; }

          .console-wrap {
            position: relative;
          }

          .cmd-suggestions {
            display: none;
            position: absolute;
            bottom: calc(100% + 6px);
            left: 0; right: 0;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            z-index: 10;
          }

          .cmd-suggestions.visible { display: block; }

          .cmd-item {
            display: flex;
            align-items: baseline;
            gap: 12px;
            padding: 9px 16px;
            cursor: pointer;
            transition: background 0.12s;
            border-bottom: 1px solid #21262d;
          }
          .cmd-item:last-child { border-bottom: none; }
          .cmd-item:hover, .cmd-item.active {
            background: #21262d;
          }

          .cmd-name {
            font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 12.5px;
            font-weight: 700;
            color: #3fb950;
            flex-shrink: 0;
            min-width: 90px;
          }

          .cmd-desc {
            font-size: 12px;
            color: #6e7681;
          }

          footer { margin-top: 32px; text-align: center; }
          footer p { font-size: 12px; color: #484f58; margin: 0; }
        </style>
      </head>
      <body>
        <main>
          <a href="/" class="back-btn">&#8592; Back to Dashboard</a>

          <div class="page-header">
            <div class="page-header-left">
              <h1>Bot Logs</h1>
              <p>Live output from the AFK bot</p>
            </div>
            <span class="badge">${logCount} ${logCount === 1 ? "entry" : "entries"}</span>
          </div>

          <div class="log-card">
            <div class="log-card-header">
              <span class="dot dot-red"></span>
              <span class="dot dot-yellow"></span>
              <span class="dot dot-green"></span>
              <span class="log-card-title">bot.log</span>
            </div>
            <div class="log-body" id="log-body">
              ${logCount === 0
                ? `<div class="empty-state">No log entries yet. Start the bot to see output.</div>`
                : logs.map((l) => {
                    const escaped = escapeHTML(l);
                    const lower = l.toLowerCase();
                    let cls = "default";
                    if (lower.includes("error") || lower.includes("fail")) cls = "error";
                    else if (lower.includes("warn")) cls = "warn";
                    else if (lower.includes("[control]")) cls = "control";
                    else if (lower.includes("connect") || lower.includes("join") || lower.includes("spawn")) cls = "success";
                    return `<span class="log-entry ${cls}">${escaped}</span>`;
                  }).join("")
              }
            </div>
            <div class="console-wrap">
              <div class="cmd-suggestions" id="cmd-suggestions"></div>
              <div class="console-row">
                <span class="console-prompt">&gt;</span>
                <input
                  id="console-input"
                  class="console-input"
                  type="text"
                  placeholder="Type / for commands, or any message…"
                  autocomplete="off"
                  spellcheck="false"
                >
                <button id="console-send" class="console-send">Send</button>
              </div>
            </div>
          </div>

          <div class="refresh-bar">
            <span class="refresh-dot"></span>
            <span id="refresh-label">Auto-refreshing every 5 seconds</span>
          </div>

          <footer>
            <p>AFK Bot Dashboard &middot; ${config.name}</p>
          </footer>
        </main>

        <script>
          (function() {
            var logBody  = document.getElementById('log-body');
            var input    = document.getElementById('console-input');
            var sendBtn  = document.getElementById('console-send');
            var label    = document.getElementById('refresh-label');
            var sugBox   = document.getElementById('cmd-suggestions');
            var refreshTimer = null;
            var typing = false;
            var activeIdx = -1;

            var COMMANDS = [
              { name: '/help',   desc: 'Show all available commands' },
              { name: '/pos',    desc: "Show bot's current coordinates" },
              { name: '/status', desc: 'Show connection status & uptime' },
              { name: '/list',   desc: 'List players on the server' },
              { name: '/say',    desc: 'Send a chat message in-game' },
            ];

            function scrollBottom() {
              if (logBody) logBody.scrollTop = logBody.scrollHeight;
            }

            function scheduleRefresh() {
              clearTimeout(refreshTimer);
              if (!typing) {
                refreshTimer = setTimeout(function() { location.reload(); }, 5000);
              }
            }

            function appendLocalEntry(text, cls) {
              var span = document.createElement('span');
              span.className = 'log-entry ' + (cls || 'control');
              span.textContent = text;
              logBody.appendChild(span);
              scrollBottom();
            }

            function hideSuggestions() {
              sugBox.classList.remove('visible');
              sugBox.innerHTML = '';
              activeIdx = -1;
            }

            function setActive(idx) {
              var items = sugBox.querySelectorAll('.cmd-item');
              items.forEach(function(el, i) {
                el.classList.toggle('active', i === idx);
              });
              activeIdx = idx;
            }

            function showSuggestions(val) {
              var query = val.toLowerCase();
              var matches = COMMANDS.filter(function(c) {
                return c.name.startsWith(query);
              });

              if (!matches.length) { hideSuggestions(); return; }

              sugBox.innerHTML = matches.map(function(c, i) {
                return '<div class="cmd-item" data-cmd="' + c.name + '">' +
                  '<span class="cmd-name">' + c.name + '</span>' +
                  '<span class="cmd-desc">' + c.desc + '</span>' +
                '</div>';
              }).join('');

              sugBox.querySelectorAll('.cmd-item').forEach(function(el) {
                el.addEventListener('mousedown', function(e) {
                  e.preventDefault();
                  input.value = el.dataset.cmd + ' ';
                  hideSuggestions();
                  input.focus();
                });
              });

              activeIdx = -1;
              sugBox.classList.add('visible');
            }

            input.addEventListener('input', function() {
              var val = input.value;
              if (val.startsWith('/')) {
                showSuggestions(val);
              } else {
                hideSuggestions();
              }
            });

            input.addEventListener('keydown', function(e) {
              var items = sugBox.querySelectorAll('.cmd-item');
              if (sugBox.classList.contains('visible') && items.length) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive(Math.min(activeIdx + 1, items.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive(Math.max(activeIdx - 1, 0));
                  return;
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && activeIdx >= 0)) {
                  e.preventDefault();
                  var chosen = items[activeIdx >= 0 ? activeIdx : 0];
                  input.value = chosen.dataset.cmd + ' ';
                  hideSuggestions();
                  return;
                }
                if (e.key === 'Escape') {
                  hideSuggestions();
                  return;
                }
              }
              if (e.key === 'Enter') sendCommand();
            });

            function sendCommand() {
              var cmd = input.value.trim();
              if (!cmd) return;
              hideSuggestions();
              input.value = '';
              sendBtn.disabled = true;
              appendLocalEntry('> ' + cmd, 'control');

              fetch('/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd })
              })
              .then(function(r) { return r.json(); })
              .then(function(data) {
                if (data.msg) {
                  data.msg.split('\\n').forEach(function(line) {
                    appendLocalEntry(line, data.success ? 'default' : 'error');
                  });
                }
              })
              .catch(function() {
                appendLocalEntry('Failed to send command.', 'error');
              })
              .finally(function() {
                sendBtn.disabled = false;
                input.focus();
                scheduleRefresh();
              });
            }

            sendBtn.addEventListener('click', sendCommand);

            input.addEventListener('focus', function() {
              typing = true;
              clearTimeout(refreshTimer);
              label.textContent = 'Auto-refresh paused while typing';
            });
            input.addEventListener('blur', function() {
              setTimeout(function() {
                hideSuggestions();
                typing = false;
                label.textContent = 'Auto-refreshing every 5 seconds';
                scheduleRefresh();
              }, 150);
            });

            scrollBottom();
            scheduleRefresh();
          })();
        </script>
      </body>
    </html>
  `);
});

let botRunning = true;

app.post("/start", (req, res) => {
  if (botRunning) return res.json({ success: false, msg: "Already running" });

  botRunning = true;
  addLog(`[Control] Démarrage de ${TOTAL_BOTS} bot(s) — reconnexion automatique activée.`);
  allBots.forEach((b, idx) => {
    const delay = idx * BOT_STAGGER_MS;
    if (delay === 0) { b.start(); return; }
    addLog(`[Multi-bot] ${b.username} démarrera dans ${delay / 1000}s`);
    setTimeout(() => { if (botRunning) b.start(); }, delay);
  });

  res.json({ success: true });
});

app.post("/stop", (req, res) => {
  if (!botRunning) return res.json({ success: false, msg: "Already stopped" });

  botRunning = false;
  allBots.forEach(b => b.stop());
  addLog(`[Control] ${TOTAL_BOTS} bot(s) arrêtés — reconnexion automatique désactivée.`);

  res.json({ success: true });
});

app.post("/command", express.json(), (req, res) => {
  const cmd = (req.body.command || "").trim();
  if (!cmd) return res.json({ success: false, msg: "Empty command." });

  addLog(`[Console] > ${cmd}`);

  if (cmd === "/help") {
    const lines = [
      "Available commands:",
      "  /help          - Show this help message",
      "  /pos           - Show bot's current coordinates",
      "  /status        - Show bot connection status",
      "  /list          - Ask server for player list",
      "  /say <message> - Send a chat message in-game",
      "  /<anything>    - Send any Minecraft command directly",
      "  <text>         - Send plain chat (no slash needed)",
    ];
    lines.forEach((l) => addLog(`[Console] ${l}`));
    return res.json({ success: true, msg: lines.join("\n") });
  }

  if (cmd === "/pos" || cmd === "/coords") {
    const pos = bot && bot.entity ? bot.entity.position : null;
    const msg = pos
      ? `Position: X=${Math.floor(pos.x)}  Y=${Math.floor(pos.y)}  Z=${Math.floor(pos.z)}`
      : "Position unavailable (bot not spawned).";
    addLog(`[Console] ${msg}`);
    return res.json({ success: true, msg });
  }

  if (cmd === "/status") {
    const status = botState.connected ? "Connected" : "Disconnected";
    const uptime = Math.floor((Date.now() - botState.startTime) / 1000);
    const msg = `Status: ${status} | Uptime: ${uptime}s | Reconnects: ${botState.reconnectAttempts}`;
    addLog(`[Console] ${msg}`);
    return res.json({ success: true, msg });
  }

  if (!bot || typeof bot.chat !== "function") {
    const msg = bot
      ? "Bot is still connecting — try again in a moment."
      : "Bot is not running.";
    addLog(`[Console] ${msg}`);
    return res.json({ success: false, msg });
  }

  try {
    bot.chat(cmd);
    addLog(`[Console] Sent to server: ${cmd}`);
    return res.json({ success: true, msg: `Sent: ${cmd}` });
  } catch (err) {
    addLog(`[Console] Error: ${err.message}`);
    return res.json({ success: false, msg: err.message });
  }
});

// ============================================================
//                    END OF WEB TOOLS
//============================================================

// FIX: handle port conflict gracefully - try next port if taken
const server = app.listen(PORT, "0.0.0.0", () => {
  addLog(`[Server] HTTP server started on port ${server.address().port} `);
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    const fallbackPort = PORT + 1;
    addLog(`[Server] Port ${PORT} in use - trying port ${fallbackPort} `);
    server.listen(fallbackPort, "0.0.0.0");
  } else {
    addLog(`[Server] HTTP server error: ${err.message} `);
  }
});

// FIX: only one definition of formatUptime
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s} s`;
}

// ============================================================
// SELF-PING - Prevent Render from sleeping
// FIX: only ping if RENDER_EXTERNAL_URL is set (skip useless localhost ping)
// ============================================================
const SELF_PING_INTERVAL = 10 * 60 * 1000;

function startSelfPing() {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (!renderUrl) {
    addLog(
      "[KeepAlive] No RENDER_EXTERNAL_URL set - self-ping disabled (running locally)",
    );
    return;
  }
  setInterval(() => {
    const protocol = renderUrl.startsWith("https") ? https : http;
    protocol
      .get(`${renderUrl}/ping`, (res) => {
        // Silent success
      })
      .on("error", (err) => {
        addLog(`[KeepAlive] Self-ping failed: ${err.message}`);
      });
  }, SELF_PING_INTERVAL);
  addLog("[KeepAlive] Self-ping system started (every 10 min)");
}

startSelfPing();

// ============================================================
// MEMORY MONITORING
// ============================================================
setInterval(
  () => {
    const mem = process.memoryUsage();
    const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
    addLog(`[Memory] Heap: ${heapMB} MB`);
  },
  5 * 60 * 1000,
);

// ============================================================
// MULTI-BOT EXTRA INSTANCES
// ============================================================
let activeBotCount = Math.max(1, Math.min(10, config["bot-count"] || 1));
let TOTAL_BOTS = activeBotCount;

function makeBot(index) {
  const base = (config["bot-account"].username || "Bot").replace(/\d+$/, "");
  const username = base + String(index).padStart(2, "0");
  let eBot = null;
  let connected = false;
  let isRecon = false;
  let reconTimer = null;
  let attempts = 0;
  let running = false;
  let wasThrottled = false;

  function cleanup() {
    if (eBot) {
      try { eBot.removeAllListeners(); eBot.end(); } catch(e) {}
      eBot = null;
    }
    connected = false;
    if (index === 0) { botState.connected = false; bot = null; }
  }

  function schedRecon() {
    if (!running || isRecon) return;
    isRecon = true;
    attempts++;
    let delay;
    if (wasThrottled) {
      wasThrottled = false;
      delay = 60000 + Math.floor(Math.random() * 60000);
      addLog(`[Bot#${index}] Throttle détecté — délai étendu: ${(delay / 1000).toFixed(0)}s`);
    } else {
      const base = config.utils["auto-reconnect-delay"] || 2000;
      const max  = config.utils["max-reconnect-delay"]  || 30000;
      delay = Math.min(base * Math.pow(2, attempts - 1), max) + Math.floor(Math.random() * 2000);
    }
    addLog(`[Bot#${index}] Reconnexion dans ${(delay / 1000).toFixed(1)}s (tentative #${attempts})`);
    if (index === 0) botState.reconnectAttempts = attempts;
    reconTimer = setTimeout(() => {
      isRecon = false;
      reconTimer = null;
      if (running) connect();
    }, delay);
  }

  function connect() {
    cleanup();
    if (!running) return;
    addLog(`[Bot#${index}] Connecting as ${username}...`);
    try {
      const ver = config.server.version && config.server.version.trim() ? config.server.version : false;
      eBot = mineflayer.createBot({
        username,
        password: config["bot-account"].password || undefined,
        auth: config["bot-account"].type,
        host: config.server.ip,
        port: config.server.port,
        version: ver,
        hideErrors: false,
        checkTimeoutInterval: 600000,
      });

      const spawnTimeout = setTimeout(() => {
        if (!connected) { addLog(`[Bot#${index}] Spawn timeout`); schedRecon(); }
      }, 90000);

      eBot.once("spawn", () => {
        clearTimeout(spawnTimeout);
        connected = true;
        attempts = 0;
        if (index === 0) {
          bot = eBot;
          botState.connected = true;
          botState.lastActivity = Date.now();
          botState.reconnectAttempts = 0;
        }
        addLog(`[Bot#${index}] ✓ Connecté en tant que ${username} (v${eBot.version})`);

        // Auto-auth : écouter les prompts du serveur (register OU login)
        if (config.utils["auto-auth"] && config.utils["auto-auth"].enabled) {
          const pwd = config.utils["auto-auth"].password;
          let authDone = false;

          const tryAuth = (type) => {
            if (authDone || !eBot || !connected) return;
            authDone = true;
            try {
              if (type === "register") {
                eBot.chat(`/register ${pwd} ${pwd}`);
                addLog(`[Bot#${index}] Auth → /register`);
              } else {
                eBot.chat(`/login ${pwd}`);
                addLog(`[Bot#${index}] Auth → /login`);
              }
            } catch(e) {}
          };

          eBot.on("messagestr", (msg) => {
            if (authDone) return;
            const m = msg.toLowerCase();
            if (m.includes("/register") || m.includes("register ")) tryAuth("register");
            else if (m.includes("/login") || m.includes("login ")) tryAuth("login");
          });

          // Failsafe : si pas de prompt après 10s, essayer /login
          setTimeout(() => {
            if (!authDone && eBot && connected) {
              addLog(`[Bot#${index}] Auth failsafe → /login`);
              tryAuth("login");
            }
          }, 10000 + index * 500);
        }

        // ── Charger pathfinder (mêmes modules que le bot principal) ──
        try { eBot.loadPlugin(pathfinder); } catch(e) {}
        const eMcData = require("minecraft-data")(eBot.version);
        const eMove = new Movements(eBot, eMcData);
        eMove.canDig = false;
        eMove.allowFreeMotion = false;
        eMove.liquidCost = 1000;
        eMove.fallDamageCost = 1000;

        // ── Circle walk aléatoire ──
        if (config.movement && config.movement["circle-walk"] && config.movement["circle-walk"].enabled) {
          const radius = config.movement["circle-walk"].radius || 4;
          let originX = null, originZ = null, isPaused = false;

          const doStep = () => {
            const baseDelay = config.movement["circle-walk"].speed || 3000;
            const delay = baseDelay * 0.5 + Math.floor(Math.random() * baseDelay * 2);
            setTimeout(() => {
              if (!eBot || !connected) { doStep(); return; }
              if (!originX) { originX = eBot.entity.position.x; originZ = eBot.entity.position.z; }
              if (isPaused) { doStep(); return; }
              try {
                const angle = Math.random() * Math.PI * 2;
                const dist  = (0.4 + Math.random() * 0.6) * radius;
                eBot.pathfinder.setMovements(eMove);
                eBot.pathfinder.setGoal(new GoalBlock(
                  Math.floor(originX + Math.cos(angle) * dist),
                  Math.floor(eBot.entity.position.y),
                  Math.floor(originZ + Math.sin(angle) * dist)
                ));
              } catch(e) {}
              doStep();
            }, delay);
          };
          doStep();

          // Pauses aléatoires
          const schedulePause = () => {
            setTimeout(() => {
              if (!eBot || !connected) { schedulePause(); return; }
              isPaused = true;
              try { eBot.pathfinder.setGoal(null); } catch(e) {}
              const dur = 15000 + Math.floor(Math.random() * 45000);
              setTimeout(() => { isPaused = false; schedulePause(); }, dur);
            }, 120000 + Math.floor(Math.random() * 180000));
          };
          schedulePause();
        }

        // ── Sauts aléatoires ──
        if (config.movement && config.movement["random-jump"] && config.movement["random-jump"].enabled) {
          const schedJump = () => {
            const base = config.movement["random-jump"].interval || 10000;
            const delay = base * 0.5 + Math.floor(Math.random() * base * 1.5);
            setTimeout(() => {
              if (!eBot || !connected) { schedJump(); return; }
              try {
                eBot.setControlState("jump", true);
                setTimeout(() => { if (eBot) try { eBot.setControlState("jump", false); } catch(e) {} }, 200 + Math.floor(Math.random() * 200));
              } catch(e) {}
              schedJump();
            }, delay);
          };
          schedJump();
        }

        // ── Regard aléatoire ──
        if (config.movement && config.movement["look-around"] && config.movement["look-around"].enabled) {
          const schedLook = () => {
            const base = config.movement["look-around"].interval || 5000;
            const delay = base * 0.4 + Math.floor(Math.random() * base * 2.5);
            setTimeout(() => {
              if (!eBot || !connected) { schedLook(); return; }
              try { eBot.look(Math.random() * Math.PI * 2 - Math.PI, (Math.random() - 0.5) * (Math.PI / 2), false); } catch(e) {}
              schedLook();
            }, delay);
          };
          schedLook();
        }

        // ── Lit la nuit (shared bed tracker) ──
        if (config.modules && config.modules.beds && config.beds && config.beds["place-night"]) {
          let isTryingToSleep = false;
          let myBedKey = null;
          setInterval(async () => {
            if (!eBot || !connected || isTryingToSleep) return;
            try {
              if (!eBot.time) return;
              const isNight = eBot.time.timeOfDay >= 12500 && eBot.time.timeOfDay <= 23500;
              if (isNight) {
                const bed = eBot.findBlock({
                  matching: (b) => {
                    if (!b.name.includes("bed")) return false;
                    const k = `${b.position.x},${b.position.y},${b.position.z}`;
                    return !occupiedBeds.has(k);
                  },
                  maxDistance: 8,
                });
                if (bed) {
                  myBedKey = `${bed.position.x},${bed.position.y},${bed.position.z}`;
                  occupiedBeds.add(myBedKey);
                  isTryingToSleep = true;
                  try { await eBot.sleep(bed); addLog(`[Bot#${index}] Dort...`); }
                  catch(e) {}
                  finally {
                    isTryingToSleep = false;
                    if (myBedKey) { occupiedBeds.delete(myBedKey); myBedKey = null; }
                  }
                }
              }
            } catch(e) {
              isTryingToSleep = false;
              if (myBedKey) { occupiedBeds.delete(myBedKey); myBedKey = null; }
            }
          }, 10000);
        }

        // ── Anti-AFK : bras ──
        setInterval(() => {
          if (!eBot || !connected) return;
          try { eBot.swingArm(); } catch(e) {}
        }, 10000 + Math.floor(Math.random() * 50000));

        // ── Hotbar cycling ──
        setInterval(() => {
          if (!eBot || !connected) return;
          try { eBot.setQuickBarSlot(Math.floor(Math.random() * 9)); } catch(e) {}
        }, 30000 + Math.floor(Math.random() * 90000));

        // ── Teabagging occasionnel ──
        setInterval(() => {
          if (!eBot || !connected || typeof eBot.setControlState !== "function") return;
          if (Math.random() > 0.9) {
            let count = 2 + Math.floor(Math.random() * 3);
            const doTeabag = () => {
              if (count <= 0 || !eBot || typeof eBot.setControlState !== "function") return;
              try {
                eBot.setControlState("sneak", true);
                setTimeout(() => {
                  try { if (eBot) eBot.setControlState("sneak", false); } catch(e) {}
                  count--;
                  setTimeout(doTeabag, 150);
                }, 150);
              } catch(e) {}
            };
            doTeabag();
          }
        }, 120000 + Math.floor(Math.random() * 180000));

        // ── Accroupi aléatoire ──
        const scheduleExtraSneak = () => {
          const delay = 45000 + Math.floor(Math.random() * 90000);
          setTimeout(() => {
            if (!eBot || !connected || typeof eBot.setControlState !== "function") {
              scheduleExtraSneak(); return;
            }
            try {
              eBot.setControlState("sneak", true);
              const dur = 2000 + Math.floor(Math.random() * 6000);
              setTimeout(() => {
                try { if (eBot) eBot.setControlState("sneak", false); } catch(e) {}
                scheduleExtraSneak();
              }, dur);
            } catch(e) { scheduleExtraSneak(); }
          }, delay);
        };
        scheduleExtraSneak();

        // ── Ouverture inventaire ──
        const scheduleExtraInventory = () => {
          const delay = 180000 + Math.floor(Math.random() * 300000);
          setTimeout(() => {
            if (!eBot || !connected) { scheduleExtraInventory(); return; }
            try {
              eBot.openInventory && eBot.openInventory();
              setTimeout(() => {
                try { if (eBot && eBot.currentWindow) eBot.closeWindow(eBot.currentWindow); } catch(e) {}
                scheduleExtraInventory();
              }, 2000 + Math.floor(Math.random() * 4000));
            } catch(e) { scheduleExtraInventory(); }
          }, delay);
        };
        scheduleExtraInventory();

        // ── Combat ──
        if (config.modules && config.modules.combat) {
          let lastAttackTime = 0;
          let lockedTarget = null, lockedTargetExpiry = 0;
          eBot.on("physicsTick", () => {
            if (!eBot || !connected || !config.combat["attack-mobs"]) return;
            const now = Date.now();
            if (now - lastAttackTime < 620) return;
            try {
              if (lockedTarget && now < lockedTargetExpiry && eBot.entities[lockedTarget.id] && lockedTarget.position) {
                if (eBot.entity.position.distanceTo(lockedTarget.position) < 4) {
                  eBot.attack(lockedTarget); lastAttackTime = now; return;
                } else { lockedTarget = null; }
              }
              const mobs = Object.values(eBot.entities).filter(e => e.type === "mob" && e.position && eBot.entity.position.distanceTo(e.position) < 4);
              if (mobs.length > 0) { lockedTarget = mobs[0]; lockedTargetExpiry = now + 3000; eBot.attack(lockedTarget); lastAttackTime = now; }
            } catch(e) {}
          });
          if (config.combat["auto-eat"]) {
            eBot.on("health", () => {
              try {
                if (eBot.food < 14) {
                  const food = eBot.inventory.items().find(i => i.foodPoints && i.foodPoints > 0);
                  if (food) eBot.equip(food, "hand").then(() => eBot.consume()).catch(() => {});
                }
              } catch(e) {}
            });
          }
        } else if (config.modules && config.modules.avoidMobs) {
          // ── Évitement des mobs ──
          setInterval(() => {
            if (!eBot || !connected || typeof eBot.setControlState !== "function") return;
            try {
              const entities = Object.values(eBot.entities).filter(e => e.type === "mob" || (e.type === "player" && e.username !== eBot.username));
              for (const e of entities) {
                if (!e.position) continue;
                if (eBot.entity.position.distanceTo(e.position) < 5) {
                  eBot.setControlState("back", true);
                  setTimeout(() => { try { if (eBot) eBot.setControlState("back", false); } catch(e) {} }, 500);
                  break;
                }
              }
            } catch(e) {}
          }, 2000);
        }

        // ── Chat → Discord ──
        if (config.modules && config.modules.chat) {
          eBot.on("chat", (chatUser, message) => {
            if (!eBot || chatUser === eBot.username) return;
            try {
              if (config.discord && config.discord.enabled && config.discord.events && config.discord.events.chat) {
                sendDiscordWebhook(`💬 **${chatUser}**: ${message}`, 0x7289da);
              }
            } catch(e) {}
          });
        }

        const activeModules = ["walk", "jump", "regard", "lit", "anti-afk"];
        if (config.modules && config.modules.combat) activeModules.push("combat");
        if (config.modules && config.modules.avoidMobs && !config.modules.combat) activeModules.push("avoidMobs");
        if (config.modules && config.modules.chat) activeModules.push("chat");
        addLog(`[Bot#${index}] Modules actifs : ${activeModules.join(", ")}`);
      });

      eBot.on("kicked", (reason) => {
        const r = typeof reason === "object" ? JSON.stringify(reason) : String(reason || "");
        addLog(`[Bot#${index}] Expulsé: ${r}`);
        const rLow = r.toLowerCase();
        if (rLow.includes("throttl") || rLow.includes("wait before reconnect") || rLow.includes("too fast")) {
          wasThrottled = true;
        }
        if (config.discord && config.discord.events && config.discord.events.disconnect) {
          sendDiscordWebhook(`[!] **Kicked** \`${username}\`: ${r}`, 0xff0000);
        }
      });

      eBot.on("end", () => {
        connected = false;
        if (index === 0) { botState.connected = false; bot = null; }
        if (config.discord && config.discord.events && config.discord.events.disconnect) {
          sendDiscordWebhook(`[-] **Disconnected**: \`${username}\``, 0xf87171);
        }
        schedRecon();
      });
      eBot.on("error", (err) => { addLog(`[Bot#${index}] Erreur: ${err.message || err}`); schedRecon(); });
    } catch(e) {
      addLog(`[Bot#${index}] Erreur: ${e.message}`);
      schedRecon();
    }
  }

  // Watchdog for extra bots
  setInterval(() => {
    if (running && !connected && !isRecon && !reconTimer) {
      addLog(`[Bot#${index}] Watchdog: reconnexion forcée`);
      attempts = 0;
      schedRecon();
    }
  }, 30000);

  return {
    start()      { running = true; attempts = 0; connect(); },
    stop()       { running = false; isRecon = false; if (reconTimer) { clearTimeout(reconTimer); reconTimer = null; } cleanup(); },
    isConnected: () => connected,
    username,
    index,
  };
}

// Tous les bots gérés dynamiquement via applyBotCount() — index 0 = Louis00
const allBots = [];

// Délai entre chaque connexion bot pour éviter le throttle serveur
const BOT_STAGGER_MS = 25000; // 25s entre chaque bot

function applyBotCount(n) {
  n = Math.max(1, Math.min(10, n));
  TOTAL_BOTS = n;
  activeBotCount = n;

  // Créer les bots manquants (index 0 inclus — tous passent par makeBot)
  while (allBots.length < n) {
    const i = allBots.length;
    const mgr = makeBot(i);
    allBots.push(mgr);
    addLog(`[Multi-bot] Bot#${i} ajouté (${mgr.username})`);
    if (botRunning) {
      const slotDelay = i * BOT_STAGGER_MS;
      if (slotDelay === 0) {
        mgr.start();
      } else {
        addLog(`[Multi-bot] Bot#${i} (${mgr.username}) démarrera dans ${slotDelay / 1000}s`);
        setTimeout(() => { if (botRunning) mgr.start(); }, slotDelay);
      }
    }
  }

  // Supprimer les bots en trop
  while (allBots.length > n) {
    const mgr = allBots.pop();
    mgr.stop();
    addLog(`[Multi-bot] Bot#${mgr.index} supprimé (${mgr.username})`);
  }

  addLog(`[Multi-bot] Nombre de bots actif : ${TOTAL_BOTS}`);
}

let bot = null;
let lastDiscordSend = 0;
const DISCORD_RATE_LIMIT_MS = 5000;

// ============================================================
// SHARED BED TRACKER - prevents multiple bots using the same bed
// ============================================================
const occupiedBeds = new Set(); // keys: "x,y,z"

// ============================================================
// CONSOLE COMMANDS
// ============================================================
const readline = require("readline");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", (line) => {
  if (!bot || !botState.connected) {
    addLog("[Console] Bot not connected");
    return;
  }

  const trimmed = line.trim();
  if (trimmed.startsWith("say ")) {
    bot.chat(trimmed.slice(4));
  } else if (trimmed.startsWith("cmd ")) {
    bot.chat("/" + trimmed.slice(4));
  } else if (trimmed === "status") {
    addLog(
      `Connected: ${botState.connected}, Uptime: ${formatUptime(Math.floor((Date.now() - botState.startTime) / 1000))}`,
    );
  } else {
    bot.chat(trimmed);
  }
});

// ============================================================
// DISCORD WEBHOOK INTEGRATION
// FIX: use Buffer.byteLength for Content-Length (handles non-ASCII usernames correctly)
// FIX: rate limiting to avoid spam when bot is flapping
// ============================================================
function sendDiscordWebhook(content, color = 0x0099ff) {
  if (
    !config.discord ||
    !config.discord.enabled ||
    !config.discord.webhookUrl ||
    config.discord.webhookUrl.includes("YOUR_DISCORD")
  )
    return;

  // FIX: Discord rate limiting - skip if sent too recently
  const now = Date.now();
  if (now - lastDiscordSend < DISCORD_RATE_LIMIT_MS) {
    addLog("[Discord] Rate limited - skipping webhook");
    return;
  }
  lastDiscordSend = now;

  const protocol = config.discord.webhookUrl.startsWith("https") ? https : http;
  const urlParts = new URL(config.discord.webhookUrl);

  const payload = JSON.stringify({
    username: config.name,
    embeds: [
      {
        description: content,
        color: color,
        timestamp: new Date().toISOString(),
        footer: { text: "Slobos AFK Bot" },
      },
    ],
  });

  const options = {
    hostname: urlParts.hostname,
    port: 443,
    path: urlParts.pathname + urlParts.search,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // FIX: use Buffer.byteLength instead of payload.length - handles non-ASCII (e.g. usernames with accents/emoji)
      "Content-Length": Buffer.byteLength(payload, "utf8"),
    },
  };

  const req = protocol.request(options, (res) => {
    // Silent success
  });

  req.on("error", (e) => {
    addLog(`[Discord] Error sending webhook: ${e.message}`);
  });

  req.write(payload);
  req.end();
}

// ============================================================
// CRASH RECOVERY - IMMORTAL MODE
// Chaque bot a son propre watchdog ; l'exception globale log et laisse faire
// ============================================================
process.on("uncaughtException", (err) => {
  const msg = err.message || "Unknown";
  addLog(`[FATAL] Uncaught Exception: ${msg}`);
  botState.errors.push({ type: "uncaught", message: msg, time: Date.now() });
  if (botState.errors.length > 100) botState.errors = botState.errors.slice(-50);
  // Chaque bot gère sa propre reconnexion via ses event handlers et watchdog
});

process.on("unhandledRejection", (reason) => {
  const msg = String(reason);
  addLog(`[FATAL] Unhandled Rejection: ${msg}`);
  botState.errors.push({ type: "rejection", message: msg, time: Date.now() });
  if (botState.errors.length > 100) botState.errors = botState.errors.slice(-50);
});

process.on("SIGTERM", () => {
  addLog("[System] SIGTERM received — ignoring, bot will stay alive.");
});

process.on("SIGINT", () => {
  addLog("[System] SIGINT received — ignoring, bot will stay alive.");
});

// =============================
//===============================
// START THE BOT
// ============================================================
addLog("=".repeat(50));
addLog("  Minecraft AFK Bot v2.5 - Bug-Fixed Edition");
addLog("=".repeat(50));
addLog(`Server: ${config.server.ip}:${config.server.port}`);
addLog(`Version: ${config.server.version}`);
addLog(
  `Auto-Reconnect: ${config.utils["auto-reconnect"] ? "Enabled" : "Disabled"}`,
);
addLog("=".repeat(50));

applyBotCount(activeBotCount);
