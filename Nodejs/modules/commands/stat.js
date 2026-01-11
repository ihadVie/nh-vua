"use strict";

const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const { createCanvas, loadImage } = require("canvas");

// ========= CONFIG =========
module.exports.config = {
  name: "stat",
  version: "1.1.8",
  hasPermssion: 0,
  credits: "Vanloi",
  description: "Dashboard thống kê toàn server",
  commandCategory: "Thống kê",
  usages: "stat",
  cooldowns: 10
};

// ========= STORAGE =========
const dataDir = path.join(__dirname, "../commands/tuongtac/stat_data/");
const serverFile = path.join(dataDir, "__server__.json");
const iconDir = path.join(dataDir, "icons");
const commandsDir = fs.existsSync(path.join(__dirname, "..", "commands"))
  ? path.join(__dirname, "..", "commands")
  : __dirname;

function ensureDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirpSync(dataDir);
  if (!fs.existsSync(iconDir)) fs.mkdirpSync(iconDir);
}
function readJSONSafe(file, fallback) {
  try { if (!fs.existsSync(file)) return fallback; return fs.readJsonSync(file); }
  catch { return fallback; }
}
function writeJSONSafe(file, obj) {
  const tmpFile = `${file}.tmp`;
  fs.writeJsonSync(tmpFile, obj, { spaces: 2 });
  fs.moveSync(tmpFile, file, { overwrite: true });
}
function commandExists(name) {
  const existsInMap = global?.client?.commands?.has?.(name);
  if (existsInMap !== undefined) return existsInMap;
  return true;
}
function isValidID(id) {
  return typeof id === "string" && /^\d+$/.test(id);
}

function dayKey(t = Date.now()) {
  const d = new Date(t + 7 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}
function ymKeyFromDay(yyyy_mm_dd) {
  return yyyy_mm_dd.slice(0, 7);
}
function sumLastDays(daily, days) {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  let sum = 0;
  for (let i=0;i<days;i++){
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate()-i);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
    sum += Number(daily?.[k] || 0);
  }
  return sum;
}

function formatComma(n) {
  n = Number(n) || 0;
  return n.toLocaleString("en-US");
}
function formatShort(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n/1e9).toFixed(2).replace(/\.00$/,"")+"b";
  if (n >= 1e6) return (n/1e6).toFixed(2).replace(/\.00$/,"")+"m";
  if (n >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,"")+"k";
  return String(n);
}

// ========= PREFIX DETECT (đếm lệnh) =========
function getPrefix(threadID) {
  try {
    if (global?.data?.threadData?.get) {
      const td = global.data.threadData.get(threadID);
      if (td?.PREFIX) return td.PREFIX;
    }
  } catch {}
  return global?.config?.PREFIX || "!";
}
function isCommandMessage(body, prefix) {
  if (!body || typeof body !== "string") return false;
  const s = body.trim();
  return s.startsWith(prefix);
}
function parseCommandName(body, prefix) {
  const s = body.trim().slice(prefix.length).trim();
  const cmd = s.split(/\s+/)[0]?.toLowerCase();
  return cmd || null;
}

// ========= DATA =========
function initServerData() {
  return {
    total: 0,
    daily: {},
    replyTotal: 0,
    replyDaily: {},
    threads: {},
    users: {},
    cmds: { total: 0, daily: {}, byName: {} },
    updatedAt: 0
  };
}

// ========= EVENT TRACKING =========
module.exports.handleEvent = async function({ event, api, Users, Threads }) {
  try {
    if (!event?.threadID) return;
    const threadID = String(event.threadID);
    const senderID = String(event.senderID || "");
    if (!senderID) return;

    const botID = String(api.getCurrentUserID());
    if (senderID === botID) return;

    const isMsg = event.type === "message" || event.type === "message_reply";
    if (!isMsg) return;

    ensureDir();
    const day = dayKey(Date.now());
    const isReply = event.type === "message_reply";

    const sData = readJSONSafe(serverFile, initServerData());
    if (!sData.daily) sData.daily = {};
    if (!sData.replyDaily) sData.replyDaily = {};
    if (!sData.threads) sData.threads = {};
    if (!sData.users) sData.users = {};
    if (!sData.cmds) sData.cmds = { total: 0, daily: {}, byName: {} };
    if (!sData.cmds.daily) sData.cmds.daily = {};
    if (!sData.cmds.byName) sData.cmds.byName = {};

    if (!sData.threads[threadID]) {
      let tname = threadID;
      try { tname = (await Threads.getInfo(threadID))?.threadName || threadID; } catch {}
      sData.threads[threadID] = {
        name: tname,
        nameUpdatedAt: Date.now(),
        total: 0,
        daily: {},
        users: {}
      };
    } else {
      if (!sData.threads[threadID].daily) sData.threads[threadID].daily = {};
      if (!sData.threads[threadID].users) sData.threads[threadID].users = {};
      if (!sData.threads[threadID].nameUpdatedAt) sData.threads[threadID].nameUpdatedAt = 0;
    }

    if (!sData.users[senderID]) {
      let name = senderID;
      try { name = await Users.getNameUser(senderID); } catch {}
      sData.users[senderID] = {
        name,
        nameUpdatedAt: Date.now(),
        total: 0,
        firstSeen: Date.now(),
        perThreadFirstSeen: {},
        cmdTotal: 0,
        cmdDaily: {},
        cmdByName: {}
      };
    } else {
      if (!sData.users[senderID].nameUpdatedAt) sData.users[senderID].nameUpdatedAt = 0;
      if (!sData.users[senderID].perThreadFirstSeen) sData.users[senderID].perThreadFirstSeen = {};
      if (!sData.users[senderID].cmdTotal) sData.users[senderID].cmdTotal = 0;
      if (!sData.users[senderID].cmdDaily) sData.users[senderID].cmdDaily = {};
      if (!sData.users[senderID].cmdByName) sData.users[senderID].cmdByName = {};
      const now = Date.now();
      if (now - sData.users[senderID].nameUpdatedAt >= 24 * 60 * 60 * 1000) {
        let name = sData.users[senderID].name;
        try { name = await Users.getNameUser(senderID); } catch {}
        if (name && String(name).trim()) {
          sData.users[senderID].name = name;
          sData.users[senderID].nameUpdatedAt = now;
        }
      }
    }

    if (Date.now() - (sData.threads[threadID].nameUpdatedAt || 0) >= 24 * 60 * 60 * 1000) {
      let tname = sData.threads[threadID].name || threadID;
      try { tname = (await Threads.getInfo(threadID))?.threadName || tname; } catch {}
      if (tname && String(tname).trim()) {
        sData.threads[threadID].name = tname;
        sData.threads[threadID].nameUpdatedAt = Date.now();
      }
    }

    if (!sData.users[senderID].perThreadFirstSeen[threadID]) {
      sData.users[senderID].perThreadFirstSeen[threadID] = Date.now();
    }

    // messages
    sData.total += 1;
    sData.daily[day] = (sData.daily[day] || 0) + 1;
    sData.threads[threadID].total += 1;
    sData.threads[threadID].daily[day] = (sData.threads[threadID].daily[day] || 0) + 1;
    sData.threads[threadID].users[senderID] = (sData.threads[threadID].users[senderID] || 0) + 1;
    sData.users[senderID].total += 1;

    // replies
    if (isReply) {
      sData.replyTotal += 1;
      sData.replyDaily[day] = (sData.replyDaily[day] || 0) + 1;
    }

    // commands
    const body = event.body || "";
    const prefix = getPrefix(threadID);
    if (isCommandMessage(body, prefix)) {
      const cmd = parseCommandName(body, prefix);
      if (cmd && commandExists(cmd)) {
        sData.cmds.total += 1;
        sData.cmds.daily[day] = (sData.cmds.daily[day] || 0) + 1;
        sData.cmds.byName[cmd] = (sData.cmds.byName[cmd] || 0) + 1;

        sData.users[senderID].cmdTotal += 1;
        sData.users[senderID].cmdDaily[day] = (sData.users[senderID].cmdDaily[day] || 0) + 1;
        sData.users[senderID].cmdByName[cmd] = (sData.users[senderID].cmdByName[cmd] || 0) + 1;
      }
    }

    sData.updatedAt = Date.now();
    writeJSONSafe(serverFile, sData);
  } catch {}
};

// ========= MONTHLY SERIES =========
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function monthLabel(ym) {
  const y = +ym.slice(0,4);
  const m = +ym.slice(5,7);
  const month = MONTHS[m-1] || "";
  return `${month} '${String(y).slice(-2)}`;
}
function aggregateDailyToMonthly(daily) {
  const monthly = {};
  for (const [k,v] of Object.entries(daily||{})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const ym = ymKeyFromDay(k);
    monthly[ym] = (monthly[ym]||0) + Number(v||0);
  }
  return monthly;
}
function minDayKey(daily) {
  const keys = Object.keys(daily||{}).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k));
  if (!keys.length) return null;
  keys.sort();
  return keys[0];
}
function buildMonthlySeries(daily, startDay, end = new Date()) {
  const monthly = aggregateDailyToMonthly(daily);
  const s = startDay || minDayKey(daily) || dayKey(Date.now());
  let y = +s.slice(0,4);
  let m = +s.slice(5,7);

  const endY = end.getFullYear();
  const endM = end.getMonth()+1;

  const labels = [];
  const values = [];

  while (y < endY || (y === endY && m <= endM)) {
    const ym = `${y}-${String(m).padStart(2,"0")}`;
    labels.push(ym);
    values.push(Number(monthly[ym]||0));
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return { labels, values };
}

function extendMonthlySeries(series, minMonths = 6) {
  const labels = [...series.labels];
  const values = [...series.values];
  if (labels.length >= minMonths) return { labels, values };

  const first = labels[0] || dayKey(Date.now()).slice(0, 7);
  let y = +first.slice(0, 4);
  let m = +first.slice(5, 7);
  while (labels.length < minMonths) {
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    labels.unshift(`${y}-${String(m).padStart(2, "0")}`);
    values.unshift(0);
  }
  return { labels, values };
}

// ========= CANVAS UI =========
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+radius, y);
  ctx.arcTo(x+w, y, x+w, y+h, radius);
  ctx.arcTo(x+w, y+h, x, y+h, radius);
  ctx.arcTo(x, y+h, x, y, radius);
  ctx.arcTo(x, y, x+w, y, radius);
  ctx.closePath();
}
function card(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.40)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 7;
  roundRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = "#1f232a";
  ctx.fill();
  ctx.restore();

  // subtle gradient overlay
  const g = ctx.createLinearGradient(x, y, x, y+h);
  g.addColorStop(0, "rgba(255,255,255,0.035)");
  g.addColorStop(1, "rgba(0,0,0,0.15)");
  roundRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = g;
  ctx.fill();

  roundRect(ctx, x, y, w, h, 22);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.stroke();
}
function pill(ctx, x, y, w, h) {
  ctx.save();
  const r = Math.min(18, h / 2);
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = "rgba(28,32,39,0.85)";
  ctx.fill();

  const g = ctx.createLinearGradient(x, y, x, y+h);
  g.addColorStop(0, "rgba(255,255,255,0.03)");
  g.addColorStop(1, "rgba(0,0,0,0.12)");
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();

  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}
const FONT_STACK = "Sans, \"Noto Color Emoji\", \"Apple Color Emoji\", \"Segoe UI Emoji\"";

function txt(ctx, str, x, y, size, color, weight="800", align="left") {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(str, x, y);
}

function fitText(ctx, str, maxWidth, size, weight="800") {
  let fontSize = size;
  ctx.font = `${weight} ${fontSize}px ${FONT_STACK}`;
  if (ctx.measureText(str).width <= maxWidth) return { text: str, size: fontSize };

  while (fontSize > 12 && ctx.measureText(str).width > maxWidth) {
    fontSize -= 1;
    ctx.font = `${weight} ${fontSize}px ${FONT_STACK}`;
  }

  if (ctx.measureText(str).width <= maxWidth) return { text: str, size: fontSize };

  let truncated = str;
  while (truncated.length > 1) {
    truncated = truncated.slice(0, -1);
    if (ctx.measureText(`${truncated}…`).width <= maxWidth) break;
  }
  return { text: `${truncated}…`, size: fontSize };
}
function dot(ctx, x, y, color) {
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI*2);
  ctx.fillStyle = color;
  ctx.fill();
}

// noise overlay (hạt)
function addNoise(ctx, x, y, w, h, amount = 3500) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  for (let i=0;i<amount;i++){
    const nx = x + Math.random() * w;
    const ny = y + Math.random() * h;
    const a = Math.random()*0.15;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(nx, ny, 1, 1);
  }
  ctx.restore();
}

function drawChart(ctx, x, y, w, h, labels, lineVals, barVals) {
  const len = Math.min(labels.length, lineVals.length, barVals.length);
  const n = len;
  if (n === 0) return;

  // rounded chart container inside
  ctx.save();
  roundRect(ctx, x, y, w, h, 18);
  ctx.clip();

  // background gradient
  const bg = ctx.createLinearGradient(x, y, x, y+h);
  bg.addColorStop(0, "rgba(255,255,255,0.02)");
  bg.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);

  // chart paddings
  const padL = 62, padR = 52, padT = 22, padB = 55;
  const px = x + padL, py = y + padT, pw = w - padL - padR, ph = h - padT - padB;

  const safeLine = lineVals.slice(0, n);
  const safeBars = barVals.slice(0, n);
  const niceMax = (value) => {
    const v = Math.max(1, value);
    const magnitude = Math.pow(10, Math.floor(Math.log10(v)));
    const normalized = v / magnitude;
    const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return step * magnitude;
  };

  const maxLine = niceMax(Math.max(1, ...safeLine));
  const maxBar = niceMax(Math.max(1, ...safeBars));

  // grid + axis labels
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(232,234,237,0.42)";
  ctx.font = `700 13px Sans`;
  ctx.textBaseline = "middle";

  const grid = 4;
  for (let i=0;i<=grid;i++){
    const yy = py + (ph/grid)*i;
    ctx.beginPath(); ctx.moveTo(px,yy); ctx.lineTo(px+pw,yy); ctx.stroke();

    ctx.textAlign = "right";
    const v = Math.round(maxLine*(grid-i)/grid);
    ctx.fillText(formatComma(v), px-10, yy);

    ctx.textAlign = "left";
    const bv = Math.round(maxBar*(grid-i)/grid);
    ctx.fillText(formatComma(bv), px+pw+10, yy);
  }

  const maxTicks = Math.max(1, n - 1);
  const step = pw / Math.max(1, maxTicks);
  const barW = n < 2 ? Math.min(60, pw * 0.22) : Math.max(6, step * 0.55);
  const tickX = (i) => px + (pw * i) / maxTicks;

  ctx.fillStyle = "rgba(220,90,160,0.32)";
  for (let i=0;i<n;i++){
    const v = safeBars[i] || 0;
    const bh = (v/maxBar)*ph;
    const bx = n < 2 ? px + (pw - barW) / 2 : tickX(i) - barW / 2;
    const by = py + ph - bh;
    roundRect(ctx, bx, by, barW, bh, 6);
    ctx.fill();
  }

  // line points
  const pts = safeLine.map((v,i)=>({
    xx: n < 2 ? px + pw / 2 : tickX(i),
    yy: py + ph - (v/maxLine)*ph
  }));

  // area fill
  ctx.beginPath();
  ctx.moveTo(pts[0].xx, py+ph);
  pts.forEach(p=>ctx.lineTo(p.xx,p.yy));
  ctx.lineTo(pts[pts.length-1].xx, py+ph);
  ctx.closePath();
  ctx.fillStyle = "rgba(90,200,120,0.20)";
  ctx.fill();

  // line stroke
  ctx.beginPath();
  ctx.moveTo(pts[0].xx, pts[0].yy);
  pts.forEach(p=>ctx.lineTo(p.xx,p.yy));
  ctx.strokeStyle = "rgba(90,200,120,0.95)";
  ctx.lineWidth = 6;
  ctx.stroke();

  // x ticks
  const tickEvery = n>80 ? 8 : n>50 ? 6 : n>30 ? 4 : 3;
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.fillStyle = "rgba(232,234,237,0.42)";
  ctx.font = `700 13px Sans`;

  for (let i=0;i<n;i++){
    if (i%tickEvery!==0 && i!==n-1) continue;
    const xx = n < 2 ? px + pw / 2 : tickX(i);
    ctx.beginPath(); ctx.moveTo(xx, py+ph); ctx.lineTo(xx, py+ph+7); ctx.stroke();

    const label = monthLabel(labels[i]);
    ctx.save();
    ctx.translate(xx, py+ph+12);
    ctx.rotate(-Math.PI/4);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  // subtle noise inside chart
  addNoise(ctx, x, y, w, h, 2200);

  ctx.restore();

  // outline
  roundRect(ctx, x, y, w, h, 18);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// avatar fetch
async function fetchAvatar(uid) {
  try {
    const url = `https://graph.facebook.com/${uid}/picture?type=large`;
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 8000 });
    return await loadImage(Buffer.from(res.data));
  } catch {
    return null;
  }
}

function twemojiCodePoints(str) {
  const points = [];
  let i = 0;
  while (i < str.length) {
    let cp = str.codePointAt(i);
    if (cp === 0xFE0F) { i += 1; continue; }
    points.push(cp.toString(16));
    i += cp > 0xFFFF ? 2 : 1;
  }
  return points.join("-");
}

const iconCache = new Map();
async function fetchIcon(name, emoji, size = 32) {
  const key = `${name}:${emoji}`;
  if (iconCache.has(key)) return iconCache.get(key);
  ensureDir();
  const code = twemojiCodePoints(emoji);
  const filePath = path.join(iconDir, `${name}-${code}.png`);
  if (fs.existsSync(filePath)) {
    const img = await loadImage(filePath);
    iconCache.set(key, img);
    return img;
  }

  const url = `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${code}.png`;
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 8000 });
  fs.writeFileSync(filePath, Buffer.from(res.data));
  const img = await loadImage(filePath);
  iconCache.set(key, img);
  return img;
}

// GMT+7 yyyy-mm-dd
function fmtGMT7(ts) {
  if (!ts) return "N/A";
  const d = new Date(ts + 7*60*60*1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth()+1).padStart(2,"0");
  const dd = String(d.getUTCDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

// ========= RUN =========
module.exports.run = async function({ api, event, Users, Threads }) {
  ensureDir();
  const threadID = String(event.threadID);
  const senderID = String(event.senderID);

  const sData = readJSONSafe(serverFile, initServerData());

  let userName = senderID;
  try { userName = await Users.getNameUser(senderID); } catch {}

  let threadName = threadID;
  try { threadName = (await Threads.getInfo(threadID))?.threadName || threadID; } catch {}

  const u = sData.users[senderID] || {
    name: userName,
    total: 0,
    firstSeen: null,
    perThreadFirstSeen: {},
    cmdTotal: 0,
    cmdDaily: {},
    cmdByName: {}
  };

  const createdOn = fmtGMT7(u.firstSeen);
  const joinedOn = fmtGMT7(u.perThreadFirstSeen?.[threadID]);

  const threadStatsRaw = sData.threads[threadID] || {};
  const threadStats = {
    total: Number(threadStatsRaw.total || 0),
    daily: threadStatsRaw.daily || {},
    users: threadStatsRaw.users || {}
  };

  // Messages totals (per-thread)
  const msg1d = sumLastDays(threadStats.daily, 1);
  const msg7d = sumLastDays(threadStats.daily, 7);
  const msgAll = threadStats.total || 0;

  const cmd1d = sumLastDays(sData.cmds.daily, 1);
  const cmd7d = sumLastDays(sData.cmds.daily, 7);

  // Server Ranks top 5 groups (threads) by total messages
  const topThreads = Object.entries(sData.threads || {})
    .map(([id, t]) => ({ id, name: t.name || id, total: Number(t.total||0) }))
    .sort((a,b)=>b.total-a.total)
    .slice(0, 5);

  // Top users toàn server (bxh 6)
  const botID = String(api.getCurrentUserID());
  const topServerUsers = Object.entries(sData.users || {})
    .map(([id, u]) => ({
      id,
      name: u?.name || id,
      total: Number(u?.total || 0)
    }))
    .filter(x => isValidID(x.id) && x.id !== botID && x.total > 0)
    .sort((a,b)=>b.total-a.total)
    .slice(0, 6);

  // Monthly series
  const startDay = minDayKey(sData.daily) || dayKey(Date.now());
  const rawMsgSeries = extendMonthlySeries(buildMonthlySeries(sData.daily, startDay, new Date()), 6);
  const msgSeries = {
    labels: rawMsgSeries.labels.slice(-12),
    values: rawMsgSeries.values.slice(-12)
  };
  const replyMonthlyMap = aggregateDailyToMonthly(sData.replyDaily);
  const replySeries = {
    labels: msgSeries.labels,
    values: msgSeries.labels.map(label => Number(replyMonthlyMap[label] || 0))
  };

  const topCommands = Object.entries(sData.cmds.byName || {})
    .map(([name, total]) => ({ name, total: Number(total || 0) }))
    .filter((cmd) => cmd.total > 0 && commandExists(cmd.name))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  // ========= DRAW =========
  const W = 1532;
  const H = 768;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // background
  ctx.fillStyle = "#0f1116";
  ctx.fillRect(0,0,W,H);

  // main container
  ctx.save();
  roundRect(ctx, 20, 20, W-40, H-40, 28);
  ctx.fillStyle = "#0f1116";
  ctx.fill();
  ctx.restore();

  // header bar
  card(ctx, 40, 40, W-80, 110);

  // Avatar card
  card(ctx, 55, 55, 120, 80);
  txt(ctx, "", 78, 105, 20, "rgba(232,234,237,0.9)", "800");

  const av = await fetchAvatar(senderID);
  if (av) {
    const cx = 115, cy = 95, r = 30;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.closePath();
    ctx.clip();
    ctx.drawImage(av, cx-r, cy-r, r*2, r*2);
    ctx.restore();
  } else {
    ctx.beginPath(); ctx.arc(115,95,30,0,Math.PI*2);
    ctx.fillStyle = "rgba(90,200,120,0.35)";
    ctx.fill();
  }

  // Name & group
  const userFit = fitText(ctx, userName, 520, 34, "900");
  txt(ctx, userFit.text, 240, 92, userFit.size, "#e8eaed", "900");
  const threadFit = fitText(ctx, threadName, 560, 22, "800");
  txt(ctx, threadFit.text, 240, 130, threadFit.size, "rgba(232,234,237,0.65)", "800");

  // Created/Joined cards
  card(ctx, W-520, 55, 220, 80);
  card(ctx, W-280, 55, 220, 80);
  txt(ctx, "Created On", W-500, 84, 20, "rgba(232,234,237,0.7)", "900");
  txt(ctx, createdOn,  W-500, 120, 24, "#e8eaed", "900");

  txt(ctx, "Joined On",  W-260, 84, 20, "rgba(232,234,237,0.7)", "900");
  txt(ctx, joinedOn,   W-260, 120, 24, "#e8eaed", "900");

  // ===== Row 1 =====
  // Server Ranks (TOP 5)
  card(ctx, 40, 170, 460, 250);
  txt(ctx, "Server Ranks", 70, 215, 30, "rgba(232,234,237,0.75)", "900");
  const trophyIcon = await fetchIcon("trophy", "🏆", 32);
  if (trophyIcon) ctx.drawImage(trophyIcon, 452, 192, 30, 30);

  // list 5 rows
  for (let i=0;i<5;i++){
    const t = topThreads[i] || { name: "N/A", total: 0 };
    const y = 240 + i*34;

    // rank badge
    pill(ctx, 70, y, 42, 28);
    txt(ctx, String(i+1), 91, y+20, 16, "#e8eaed", "900", "center");

    // name
    pill(ctx, 118, y, 270, 28);
    const nameFit = fitText(ctx, t.name, 250, 16, "900");
    txt(ctx, nameFit.text, 132, y+20, nameFit.size, "#e8eaed", "900");

    // total
    pill(ctx, 394, y, 86, 28);
    txt(ctx, formatShort(t.total), 437, y+20, 16, "rgba(232,234,237,0.9)", "900", "center");
  }

  // Messages box (1d/7d/All)
  card(ctx, 520, 170, 430, 250);
  txt(ctx, "Messages", 550, 215, 30, "rgba(232,234,237,0.75)", "900");
  txt(ctx, "#", 920, 215, 30, "rgba(232,234,237,0.55)", "900");

  const msgRows = [
    ["1d", msg1d],
    ["7d", msg7d],
    ["All", msgAll]
  ];
  msgRows.forEach((r, idx) => {
    pill(ctx, 550, 240 + idx*70, 370, 55);
    txt(ctx, r[0], 580, 277 + idx*70, 24, "rgba(232,234,237,0.75)", "900");
    pill(ctx, 640, 248 + idx*70, 260, 39);
    const msgFit = fitText(ctx, formatComma(r[1]), 240, 20, "900");
    txt(ctx, msgFit.text, 770, 277 + idx*70, msgFit.size, "#e8eaed", "900", "center");
  });

  // Tổng lệnh toàn server
  card(ctx, 970, 170, 522, 250);
  const cmdHeader = fitText(ctx, "Tổng lệnh toàn server", 420, 22, "900");
  txt(ctx, cmdHeader.text, 1000, 215, cmdHeader.size, "rgba(232,234,237,0.75)", "900");
  txt(ctx, "</>", 1450, 215, 26, "rgba(232,234,237,0.7)", "900", "right");

  const cmdRows = [
    ["All", sData.cmds.total],
    ["7d", cmd7d],
    ["1d", cmd1d]
  ];
  cmdRows.forEach((r, idx) => {
    pill(ctx, 1000, 240 + idx*70, 470, 55);
    pill(ctx, 1010, 250 + idx*70, 70, 35);
    txt(ctx, r[0], 1045, 274 + idx*70, 18, "rgba(232,234,237,0.75)", "900", "center");

    pill(ctx, 1090, 250 + idx*70, 360, 35);
    const valueFit = fitText(ctx, formatComma(r[1]), 330, 20, "900");
    txt(ctx, valueFit.text, 1270, 274 + idx*70, valueFit.size, "#e8eaed", "900", "center");
  });

  // ===== Row 2 =====
  // Top server users
  card(ctx, 40, 440, 620, 270);
  const topUserHeader = fitText(ctx, "Top Tương Tác Của Tất Cả Thành Viên Trong Box", 540, 22, "900");
  txt(ctx, topUserHeader.text, 70, 485, topUserHeader.size, "rgba(232,234,237,0.75)", "900");
  const chartIcon = await fetchIcon("chart", "📈", 26);
  if (chartIcon) ctx.drawImage(chartIcon, 620, 466, 24, 24);

  for (let i=0;i<6;i++){
    const rowY = 520 + i*30;
    const uu = topServerUsers[i];
    if (!uu) break;

    pill(ctx, 60, rowY, 50, 26);
    txt(ctx, String(i+1), 85, rowY+20, 16, "#e8eaed", "900", "center");

    pill(ctx, 120, rowY, 330, 26);
    const userRowFit = fitText(ctx, uu.name, 310, 16, "900");
    txt(ctx, userRowFit.text, 140, rowY+20, userRowFit.size, "#e8eaed", "900");

    pill(ctx, 460, rowY, 170, 26);
    txt(ctx, `${formatShort(uu.total)} msg`, 545, rowY+20, 16, "rgba(232,234,237,0.85)", "900", "center");
  }

  // Top commands
  card(ctx, 680, 440, 360, 270);
  txt(ctx, "Top Commands", 710, 485, 26, "rgba(232,234,237,0.75)", "900");
  const cmdIcon = await fetchIcon("command", "🧩", 24);
  if (cmdIcon) ctx.drawImage(cmdIcon, 1005, 466, 22, 22);

  for (let i=0;i<6;i++){
    const rowY = 520 + i*30;
    const cmd = topCommands[i];
    if (!cmd) break;

    pill(ctx, 700, rowY, 44, 26);
    txt(ctx, String(i+1), 722, rowY+20, 16, "#e8eaed", "900", "center");

    pill(ctx, 750, rowY, 170, 26);
    const cmdFit = fitText(ctx, cmd.name, 150, 16, "900");
    txt(ctx, cmdFit.text, 765, rowY+20, cmdFit.size, "#e8eaed", "900");

    pill(ctx, 930, rowY, 95, 26);
    txt(ctx, formatShort(cmd.total), 978, rowY+20, 16, "rgba(232,234,237,0.85)", "900", "center");
  }

  // Charts
  card(ctx, 1060, 440, 432, 270);
  txt(ctx, "Charts", 1090, 485, 26, "rgba(232,234,237,0.75)", "900");

  dot(ctx, 1230, 478, "rgba(90,200,120,0.95)");
  txt(ctx, "Message", 1250, 485, 20, "rgba(232,234,237,0.75)", "900");

  dot(ctx, 1370, 478, "rgba(220,90,160,0.95)");
  txt(ctx, "Reply", 1390, 485, 20, "rgba(232,234,237,0.75)", "900");

  // chart draw (reply bars pink)
  drawChart(ctx, 1075, 505, 402, 190, msgSeries.labels, msgSeries.values, replySeries.values);

  // noise nhẹ toàn ảnh (đúng “hạt” bạn muốn)
  addNoise(ctx, 40, 40, W-80, H-80, 4500);

  // footer
  txt(ctx, "Check ACTIVE:", 40, 748, 20, "#e8eaed", "900");
  txt(ctx, "All stats — Timezone:", 230, 748, 18, "rgba(232,234,237,0.55)", "900");
  card(ctx, 520, 720, 110, 40);
  txt(ctx, "GMT+7", 575, 748, 18, "#e8eaed", "900", "center");

  card(ctx, 1110, 712, 360, 48);
  txt(ctx, "DexBot - Van Loi", 1290, 746, 26, "#e8eaed", "900", "center");

  const outPath = path.join(dataDir, `__stat_${threadID}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));

  return api.sendMessage(
    { body: "📊 STAT: Thống kê toàn bộ server", attachment: fs.createReadStream(outPath) },
    threadID
  );
};
