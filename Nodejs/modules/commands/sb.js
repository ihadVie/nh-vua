"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { createCanvas, loadImage /*, registerFont*/ } = require("canvas");

/**
 * sb.js = bản dashboard (canvas) nhưng LỆNH là: sb ...
 * Ví dụ:
 *  - sb tai 50k
 *  - sb xiu all
 *  - sb b2gn 200k
 *  - sb b3gn 100k
 *  - sb cs 50k 6
 *
 * NOTE emoji trong canvas hay không hiện => file này không phụ thuộc emoji.
 *
 * OPTIONAL FONT:
 * - Bỏ font ttf vào: assets/fonts/
 * - Bật registerFont dưới đây và đổi FONT_FAMILY = "Spline Sans"
 */
// const { registerFont } = require("canvas");
// const fontDir = path.join(__dirname, "assets", "fonts");
// registerFont(path.join(fontDir, "SplineSans-Regular.ttf"), { family: "Spline Sans" });
// registerFont(path.join(fontDir, "SplineSans-Bold.ttf"), { family: "Spline Sans" });

module.exports.config = {
  name: "sb",
  version: "0.0.6",
  hasPermssion: 0,
  credits: "Vanloi",
  description: "Sicbo/Tài Xỉu",
  commandCategory: "Trò Chơi",
  usages: "sb tai/xiu, b3gn, b2gn, cs, số tiền",
  cooldowns: 10
};

// ====== TỶ LỆ THẮNG ======
const tilethang = 1;
const tilethangb3dn = 5;
const tilethangb2dn = 3;
const haisogiong = 2;
const basogiong = 2;
const motsogiong = 1;

// ====== THEME ======
const COLORS = {
  cyan: "#56f2ff",
  purple: "#a855f7",
  pink: "#f472ff",
  orange: "#ff8b5e",
  green: "#45ffb4",
  red: "#ff4b6e",
  text: "#e5ecff",
  muted: "#98a2c3",
  panel: "rgba(18, 24, 39, 0.75)",
  panelStrong: "rgba(20, 28, 47, 0.9)"
};

const FONT_FAMILY = "Arial"; // đổi thành "Spline Sans" nếu registerFont

// ====== DICE JPEG (tuỳ chọn) ======
const DICE_IMAGE_DIR = path.join(__dirname, "data", "taixiu"); // chứa 1.jpeg..6.jpeg
const SEND_DICE_JPEG_ALONG_WITH_DASHBOARD = false; // true = gửi kèm 3 ảnh jpeg như bản cũ
const SEND_DICE_JPEG_IF_CANVAS_FAILS = true; // nếu vẽ canvas lỗi thì vẫn gửi 3 jpeg

// =================== UTILS ===================
function replace(int) {
  const n = Number(int);
  if (!Number.isFinite(n)) return "0";
  return n.toString().replace(/(.)(?=(\d{3})+$)/g, "$1,");
}

function parseBetAmount(value) {
  if (!value && value !== 0) return NaN;
  if (typeof value === "number") return Math.round(value);

  const normalized = String(value).trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)(qi|q|t|b|m|k)?$/);
  if (!match) return NaN;

  const amount = parseFloat(match[1]);
  const suffix = match[2];
  const multipliers = { k: 1e3, m: 1e6, b: 1e9, t: 1e12, q: 1e15, qi: 1e18 };
  const multiplier = suffix ? multipliers[suffix] : 1;

  const out = Math.round(amount * multiplier);
  if (!Number.isFinite(out) || out <= 0) return NaN;
  return out;
}

function ensureCacheDir() {
  const cacheDir = path.join(__dirname, "cache");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  return cacheDir;
}

function cleanupOldImages(cacheDir, maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    const now = Date.now();
    const files = fs.readdirSync(cacheDir);
    for (const f of files) {
      if (!f.startsWith("sb-") || !f.endsWith(".png")) continue;
      const fp = path.join(cacheDir, f);
      const st = fs.statSync(fp);
      if (now - st.mtimeMs > maxAgeMs) fs.unlinkSync(fp);
    }
  } catch {}
}

function loadHistory(cacheDir) {
  const historyPath = path.join(cacheDir, "sb_history.json");
  if (!fs.existsSync(historyPath)) return {};
  try {
    const raw = fs.readFileSync(historyPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("Failed to read sb_history.json", error);
    return {};
  }
}

function saveHistory(cacheDir, data) {
  const historyPath = path.join(cacheDir, "sb_history.json");
  try {
    fs.writeFileSync(historyPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed to write sb_history.json", e);
  }
}

function normalizeType(t) {
  const s = String(t || "").toLowerCase();
  if (s === "t" || s === "tai" || s === "tài") return "T";
  if (s === "x" || s === "xiu" || s === "xỉu") return "X";
  if (s === "3" || s === "triple") return "3";
  return "X";
}

function summarizeHistory(history) {
  if (!history || !history.length) return { taiPercent: 0, xiuPercent: 0, triplePercent: 0 };
  const totalRounds = history.length;
  const taiCount = history.filter((e) => normalizeType(e.type) === "T").length;
  const xiuCount = history.filter((e) => normalizeType(e.type) === "X").length;
  const tripleCount = history.filter((e) => normalizeType(e.type) === "3").length;
  return {
    taiPercent: Math.round((taiCount / totalRounds) * 100),
    xiuPercent: Math.round((xiuCount / totalRounds) * 100),
    triplePercent: Math.round((tripleCount / totalRounds) * 100)
  };
}

async function fetchAvatarBuffer(userId) {
  if (!userId) return null;
  const url = `https://graph.facebook.com/${userId}/picture?height=200&width=200`;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    return Buffer.from(res.data, "binary");
  } catch (e) {
    return null;
  }
}

function getDiceJpegPath(n) {
  return path.join(DICE_IMAGE_DIR, `${n}.jpeg`);
}

function buildDiceJpegAttachments(numbers) {
  const out = [];
  for (const n of numbers) {
    const p = getDiceJpegPath(n);
    if (fs.existsSync(p)) out.push(fs.createReadStream(p));
  }
  return out;
}

// =================== DRAW HELPERS ===================
function hexToRgba(hex, a = 1) {
  const h = String(hex).replace("#", "");
  const v = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function softShadow(ctx, color, blur = 18, ox = 0, oy = 0) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = ox;
  ctx.shadowOffsetY = oy;
}

function drawCenteredText(ctx, text, xCenter, y, font, color) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  const str = String(text);
  const w = ctx.measureText(str).width;
  ctx.fillText(str, xCenter - w / 2, y);
  ctx.restore();
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function strokeRounded(ctx, x, y, w, h, r, strokeStyle, lineWidth = 1.5) {
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  drawRoundedRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
}

function fillRounded(ctx, x, y, w, h, r, fillStyle) {
  ctx.save();
  ctx.fillStyle = fillStyle;
  drawRoundedRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

function drawGlowRect(ctx, x, y, width, height, color, blur = 24, alpha = 0.4) {
  ctx.save();
  softShadow(ctx, color, blur);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  drawRoundedRect(ctx, x, y, width, height, 18);
  ctx.fill();
  ctx.restore();
}

function addNoise(ctx, width, height, alpha = 0.045) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() * 255) | 0;
    d[i] = d[i] * (1 - alpha) + n * alpha;
    d[i + 1] = d[i + 1] * (1 - alpha) + n * alpha;
    d[i + 2] = d[i + 2] * (1 - alpha) + n * alpha;
  }
  ctx.putImageData(imgData, 0, 0);
}

function drawPanel(ctx, x, y, width, height) {
  ctx.save();
  const g = ctx.createLinearGradient(x, y, x + width, y + height);
  g.addColorStop(0, "rgba(20, 28, 47, 0.92)");
  g.addColorStop(1, "rgba(10, 14, 26, 0.88)");

  softShadow(ctx, "rgba(86,242,255,0.18)", 28);
  fillRounded(ctx, x, y, width, height, 22, g);

  ctx.shadowBlur = 0;
  strokeRounded(ctx, x, y, width, height, 22, "rgba(125,211,252,0.22)", 1.5);
  strokeRounded(ctx, x + 2, y + 2, width - 4, height - 4, 20, "rgba(168,85,247,0.16)", 1);
  ctx.restore();
}

function drawCard(ctx, x, y, width, height, accentColor, label, value, subLabel, highlight = false) {
  ctx.save();

  const bg = ctx.createLinearGradient(x, y, x + width, y + height);
  bg.addColorStop(0, "rgba(18, 24, 39, 0.78)");
  bg.addColorStop(1, "rgba(12, 18, 32, 0.70)");
  fillRounded(ctx, x, y, width, height, 20, bg);

  softShadow(ctx, hexToRgba(accentColor, 0.35), 22);
  strokeRounded(ctx, x, y, width, height, 20, hexToRgba(accentColor, highlight ? 0.95 : 0.65), 2);
  ctx.shadowBlur = 0;

  if (highlight) {
    const gg = ctx.createLinearGradient(x, y, x + width, y + height);
    gg.addColorStop(0, hexToRgba(COLORS.cyan, 0.95));
    gg.addColorStop(1, hexToRgba(COLORS.purple, 0.95));
    softShadow(ctx, "rgba(86,242,255,0.35)", 26);
    strokeRounded(ctx, x, y, width, height, 20, gg, 2.4);
    ctx.shadowBlur = 0;
  }

  ctx.fillStyle = COLORS.muted;
  ctx.font = `600 13px ${FONT_FAMILY}`;
  ctx.fillText(label, x + 18, y + 30);

  ctx.fillStyle = COLORS.text;
  ctx.font = `900 34px ${FONT_FAMILY}`;
  ctx.fillText(value, x + 18, y + 74);

  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 13px ${FONT_FAMILY}`;
  ctx.fillText(subLabel, x + 18, y + height - 18);

  ctx.restore();
}

function drawHeader(ctx) {
  ctx.fillStyle = COLORS.text;
  ctx.font = `900 24px ${FONT_FAMILY}`;
  ctx.fillText("DexWing Văn lợi", 80, 70);

  ctx.font = `700 18px ${FONT_FAMILY}`;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText("TOP 3", 360, 70);

  const iconX = 1050;
  const iconY = 45;
  const iconSize = 36;
  const icons = ["1", "2", "3"]; // tránh emoji cho chắc

  icons.forEach((icon, index) => {
    const x = iconX + index * (iconSize + 12);

    drawGlowRect(ctx, x, iconY, iconSize, iconSize, COLORS.purple, 18, 0.35);

    const bg = ctx.createLinearGradient(x, iconY, x + iconSize, iconY + iconSize);
    bg.addColorStop(0, "rgba(16,24,39,0.90)");
    bg.addColorStop(1, "rgba(10,14,26,0.75)");
    fillRounded(ctx, x, iconY, iconSize, iconSize, 12, bg);

    ctx.save();
    softShadow(ctx, "rgba(86,242,255,0.22)", 14);
    strokeRounded(ctx, x, iconY, iconSize, iconSize, 12, "rgba(168, 85, 247, 0.55)", 1.5);
    ctx.restore();

    ctx.fillStyle = COLORS.cyan;
    ctx.font = `900 16px ${FONT_FAMILY}`;
    ctx.fillText(icon, x + 13, iconY + 24);
  });
}

function drawDie(ctx, x, y, size, value) {
  ctx.save();

  softShadow(ctx, "rgba(0,0,0,0.55)", 26, 0, 10);

  const body = ctx.createLinearGradient(x, y, x + size, y + size);
  body.addColorStop(0, "rgba(245,250,255,0.98)");
  body.addColorStop(1, "rgba(170,195,255,0.55)");
  fillRounded(ctx, x, y, size, size, 22, body);

  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  softShadow(ctx, "rgba(86,242,255,0.55)", 22);
  strokeRounded(ctx, x, y, size, size, 22, "rgba(86,242,255,0.80)", 2.8);
  ctx.shadowBlur = 0;

  strokeRounded(ctx, x + 10, y + 10, size - 20, size - 20, 18, "rgba(86,242,255,0.35)", 2);

  const pipRadius = size * 0.08;
  const offset = size * 0.24;

  const positions = {
    tl: [x + offset, y + offset],
    tr: [x + size - offset, y + offset],
    bl: [x + offset, y + size - offset],
    br: [x + size - offset, y + size - offset],
    c: [x + size / 2, y + size / 2],
    ml: [x + offset, y + size / 2],
    mr: [x + size - offset, y + size / 2]
  };

  const pipMap = {
    1: ["c"],
    2: ["tl", "br"],
    3: ["tl", "c", "br"],
    4: ["tl", "tr", "bl", "br"],
    5: ["tl", "tr", "c", "bl", "br"],
    6: ["tl", "tr", "ml", "mr", "bl", "br"]
  };

  ctx.fillStyle = "rgba(16, 18, 28, 0.92)";
  (pipMap[value] || []).forEach((key) => {
    const [px, py] = positions[key];
    ctx.beginPath();
    ctx.arc(px, py, pipRadius, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalAlpha = 0.18;
  fillRounded(ctx, x + 8, y + 8, size * 0.55, size * 0.45, 18, "rgba(86,242,255,1)");
  ctx.globalAlpha = 1;

  ctx.restore();
}

async function drawAvatar(ctx, avatarBuffer, centerX, centerY, radius) {
  ctx.save();
  softShadow(ctx, "rgba(86,242,255,0.35)", 18);
  ctx.fillStyle = "rgba(16,24,39,0.92)";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  strokeRounded(ctx, centerX - radius, centerY - radius, radius * 2, radius * 2, radius, "rgba(86,242,255,0.60)", 2);
  ctx.restore();

  if (!avatarBuffer) return;

  try {
    const img = await loadImage(avatarBuffer);
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 3, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, centerX - radius + 3, centerY - radius + 3, (radius - 3) * 2, (radius - 3) * 2);
    ctx.restore();
  } catch {}
}

// =================== RENDER IMAGE ===================
async function renderSessionImage(data) {
  const width = 1280;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0b0f1a");
  bg.addColorStop(0.5, "#11162b");
  bg.addColorStop(1, "#1a1330");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  drawGlowRect(ctx, 120, 40, 420, 220, "rgba(97,115,255,0.16)", 95, 0.18);
  drawGlowRect(ctx, 860, 70, 320, 220, "rgba(244,114,255,0.16)", 95, 0.18);
  drawGlowRect(ctx, 240, 520, 420, 160, "rgba(86,242,255,0.14)", 95, 0.16);

  drawGlowRect(ctx, 40, 30, width - 80, height - 60, "rgba(86,242,255,0.22)", 70, 0.14);
  strokeRounded(ctx, 40, 30, width - 80, height - 60, 24, "rgba(86,242,255,0.20)", 2);

  drawHeader(ctx);

  // cards
  const cardY = 110;
  const cardW = 270;
  const cardH = 110;
  const gap = 20;
  const startX = 60;

  drawCard(ctx, startX, cardY, cardW, cardH, COLORS.cyan, "TAI", `${data.taiPercent}%`, "Win rate");
  drawCard(ctx, startX + (cardW + gap), cardY, cardW, cardH, COLORS.purple, "XIU", `${data.xiuPercent}%`, "Win rate");
  drawCard(ctx, startX + (cardW + gap) * 2, cardY, cardW, cardH, COLORS.pink, "TRIPLE", `${data.triplePercent}%`, "Special result");
  drawCard(ctx, startX + (cardW + gap) * 3, cardY, cardW, cardH, COLORS.cyan, "PHIEN HIEN TAI", `${data.currentTotal}`, "Total dice value", true);

  // chart panel
  const chartX = 60, chartY = 250, chartW = 780, chartH = 230;
  drawPanel(ctx, chartX, chartY, chartW, chartH);

  ctx.fillStyle = COLORS.text;
  ctx.font = `900 16px ${FONT_FAMILY}`;
  ctx.fillText("TONG DIEM MOI PHIEN", chartX + 20, chartY + 30);

  const plotX = chartX + 50;
  const plotY = chartY + 50;
  const plotW = chartW - 80;
  const plotH = chartH - 80;

  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = plotY + (plotH / 5) * i;
    ctx.beginPath();
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX + plotW, y);
    ctx.stroke();
  }

  const yLabels = [18, 15, 12, 9, 6, 3];
  yLabels.forEach((label, idx) => {
    const y = plotY + (plotH / 5) * idx + 4;
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 12px ${FONT_FAMILY}`;
    ctx.fillText(String(label), chartX + 16, y);
  });

  const barCount = (data.chartData && data.chartData.length) ? data.chartData.length : 1;
  const barGap = 18;
  const barW = (plotW - barGap * (barCount - 1)) / Math.max(1, barCount);
  const maxValue = 18;

  const linePoints = [];

  (data.chartData || []).forEach((raw, idx) => {
    const entry = { round: raw.round, value: raw.value, type: normalizeType(raw.type) };

    const h = Math.max(12, (entry.value / maxValue) * plotH);
    const x = plotX + idx * (barW + barGap);
    const y = plotY + plotH - h;

    const cTop =
      entry.type === "T" ? "rgba(86,242,255,0.90)" :
      entry.type === "X" ? "rgba(255,139,94,0.92)" :
      "rgba(168,85,247,0.92)";

    const cBot =
      entry.type === "T" ? "rgba(86,242,255,0.18)" :
      entry.type === "X" ? "rgba(255,139,94,0.18)" :
      "rgba(168,85,247,0.18)";

    const barGrad = ctx.createLinearGradient(x, y, x, y + h);
    barGrad.addColorStop(0, cTop);
    barGrad.addColorStop(1, cBot);

    ctx.save();
    softShadow(ctx, cTop.replace("0.90", "0.35"), 18);
    fillRounded(ctx, x, y, barW, h, 12, barGrad);
    ctx.restore();

    if (idx === (data.chartData.length - 1)) {
      ctx.save();
      softShadow(ctx, cTop.replace("0.90", "0.55"), 28);
      strokeRounded(ctx, x, y, barW, h, 12, cTop.replace("0.90", "0.95"), 2.2);
      ctx.restore();
    }

    drawCenteredText(ctx, entry.round, x + barW / 2, plotY + plotH + 20, `500 11px ${FONT_FAMILY}`, COLORS.muted);
    drawCenteredText(ctx, entry.value, x + barW / 2, y - 6, `900 12px ${FONT_FAMILY}`, COLORS.text);

    linePoints.push([x + barW / 2, y]);
  });

  if (linePoints.length >= 2) {
    ctx.save();
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2.2;
    softShadow(ctx, "rgba(86,242,255,0.55)", 12);
    ctx.beginPath();
    linePoints.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    ctx.restore();
  }

  linePoints.forEach(([px, py], i) => {
    const isLast = i === linePoints.length - 1;
    ctx.save();
    softShadow(ctx, "rgba(86,242,255,0.65)", isLast ? 18 : 10);
    ctx.fillStyle = "rgba(86,242,255,0.95)";
    ctx.beginPath();
    ctx.arc(px, py, isLast ? 4.6 : 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // sequence panel
  const seqX = 870, seqY = 250, seqW = 350, seqH = 230;
  drawPanel(ctx, seqX, seqY, seqW, seqH);

  ctx.fillStyle = COLORS.text;
  ctx.font = `900 16px ${FONT_FAMILY}`;
  ctx.fillText("CHUOI TAI / XIU", seqX + 20, seqY + 30);

  const badgeSize = 34, badgeGap = 10, perRow = 6;
  (data.sequence || []).map(normalizeType).forEach((entry, idx) => {
    const row = Math.floor(idx / perRow);
    const col = idx % perRow;
    const x = seqX + 20 + col * (badgeSize + badgeGap);
    const y = seqY + 55 + row * (badgeSize + badgeGap);

    const color = entry === "T" ? COLORS.cyan : entry === "X" ? COLORS.orange : COLORS.purple;

    const bg2 = ctx.createLinearGradient(x, y, x + badgeSize, y + badgeSize);
    bg2.addColorStop(0, "rgba(12,18,30,0.92)");
    bg2.addColorStop(1, "rgba(16,24,39,0.72)");
    fillRounded(ctx, x, y, badgeSize, badgeSize, 12, bg2);

    ctx.save();
    softShadow(ctx, hexToRgba(color, 0.45), 14);
    strokeRounded(ctx, x, y, badgeSize, badgeSize, 12, hexToRgba(color, 0.75), 1.6);
    ctx.restore();

    drawCenteredText(ctx, entry, x + badgeSize / 2, y + 22, `900 14px ${FONT_FAMILY}`, color);
  });

  // player panel
  const playerX = 60, playerY = 510, playerW = 360, playerH = 170;
  drawPanel(ctx, playerX, playerY, playerW, playerH);

  const avX = playerX + 55;
  const avY = playerY + 60;
  await drawAvatar(ctx, data.player.avatar, avX, avY, 30);

  ctx.fillStyle = COLORS.muted;
  ctx.font = `700 14px ${FONT_FAMILY}`;
  ctx.fillText(data.player.name || "Player", playerX + 110, playerY + 45);

  ctx.fillStyle = COLORS.cyan;
  ctx.font = `900 22px ${FONT_FAMILY}`;
  ctx.fillText(`$${replace(data.player.balance)}`, playerX + 110, playerY + 75);

  const statusColor = data.player.status === "WIN" ? COLORS.green : COLORS.red;

  const pillX = playerX + 20, pillY = playerY + 95, pillW = 140, pillH = 34;
  const pillBg = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY + pillH);
  pillBg.addColorStop(0, "rgba(12,18,30,0.90)");
  pillBg.addColorStop(1, "rgba(16,24,39,0.70)");
  fillRounded(ctx, pillX, pillY, pillW, pillH, 18, pillBg);

  ctx.save();
  softShadow(ctx, hexToRgba(statusColor, 0.45), 14);
  strokeRounded(ctx, pillX, pillY, pillW, pillH, 18, hexToRgba(statusColor, 0.75), 1.7);
  ctx.restore();

  drawCenteredText(ctx, data.player.status, pillX + pillW / 2, pillY + 22, `900 14px ${FONT_FAMILY}`, statusColor);

  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 12px ${FONT_FAMILY}`;
  ctx.fillText("", playerX + 20, playerY + 150);

  // dice panel
  const diceX = 450, diceY = 510, diceW = 770, diceH = 170;
  drawPanel(ctx, diceX, diceY, diceW, diceH);

  ctx.fillStyle = COLORS.text;
  ctx.font = `900 16px ${FONT_FAMILY}`;
  ctx.fillText("lắc lắc...", diceX + 20, diceY + 30);

  const dieSize = 92;
  const dieGap = 170;
  const startDiceX = diceX + 120;
  const startDiceY = diceY + 55;

  (data.dice || []).forEach((v, i) => {
    const x = startDiceX + i * dieGap;
    drawDie(ctx, x, startDiceY, dieSize, v);
    drawCenteredText(ctx, `Value ${v}`, x + dieSize / 2, startDiceY + dieSize + 20, `500 12px ${FONT_FAMILY}`, COLORS.muted);
  });

  addNoise(ctx, width, height, 0.045);
  return canvas;
}

// =================== GAME RUN ===================
module.exports.run = async function ({ event, api, Currencies, Users, args }) {
  try {
    const { increaseMoney, decreaseMoney } = Currencies;
    const { threadID, messageID, senderID } = event;
    const { sendMessage } = api;

    // HELP
    if (!args[0]) {
      return sendMessage(
        `SB - HUONG DAN\n` +
          `• sb tai <tien> | sb xiu <tien>\n` +
          `• sb b3gn <tien> (bo 3 dong nhat)\n` +
          `• sb b2gn <tien> (bo 2 dong nhat)\n` +
          `• sb cs <tien> <1-6> (cuoc so)\n` +
          `VD: sb tai 50k | sb cs 100k 6 | sb b2gn all`,
        threadID,
        messageID
      );
    }

    const name = await Users.getNameUser(senderID);
    const money = (await Currencies.getData(senderID)).money;

    const betArg = String(args[1] || "").toLowerCase();
    const bet = betArg === "all" ? money : parseBetAmount(args[1]);
    const input = String(args[0] || "").toLowerCase();
    const tong = Number.parseInt(args[2], 10);

    if (!input) return sendMessage("❌ Bạn chưa nhập tai/xiu/b3gn/b2gn/cs", threadID, messageID);
    if (!bet || isNaN(bet) || bet < 1000) return sendMessage("❌ Tiền cược phải từ 1000 trở lên", threadID, messageID);
    if (bet > money) return sendMessage("❌ Bạn không đủ tiền để cược", threadID, messageID);

    const inputMap = {
      "tài": "tài",
      tai: "tài",
      t: "tài",
      "-t": "tài",
      "xỉu": "xỉu",
      xiu: "xỉu",
      x: "xỉu",
      "-x": "xỉu",
      b3gn: "b3gn",
      bbgn: "b3gn",
      btgn: "b3gn",
      b2gn: "b2gn",
      bdgn: "b2gn",
      bhgn: "b2gn",
      cuocso: "cuocso",
      cs: "cuocso"
    };

    const choose = inputMap[input];
    if (!choose) return sendMessage("❌ Sai tag", threadID, messageID);
    if (choose === "cuocso" && (!Number.isInteger(tong) || tong < 1 || tong > 6)) {
      return sendMessage("❌ Số chọn không hợp lệ (1-6)", threadID, messageID);
    }

    // roll dice
    const numbers = [];
    for (let i = 0; i < 3; i++) numbers.push(Math.floor(Math.random() * 6 + 1));
    const total = numbers.reduce((a, b) => a + b, 0);

    let ans;
    let result;
    let mn;

    if (choose === "cuocso") {
      const count = numbers.filter((n) => n === tong).length;
      if (count === 3) { result = "win"; mn = bet * basogiong; }
      else if (count === 2) { result = "win"; mn = bet * haisogiong; }
      else if (count === 1) { result = "win"; mn = bet * motsogiong; }
      else { result = "lose"; mn = bet; }
      ans = tong;

    } else if (choose === "b3gn") {
      if (numbers[0] === numbers[1] && numbers[1] === numbers[2]) {
        result = "win";
        mn = bet * tilethangb3dn;
        ans = "bộ ba đồng nhất";
      } else {
        result = "lose";
        mn = bet;
        ans = total >= 11 ? "tài" : "xỉu";
      }

    } else if (choose === "b2gn") {
      const isB2 = numbers[0] === numbers[1] || numbers[1] === numbers[2] || numbers[0] === numbers[2];
      if (isB2) {
        result = "win";
        mn = bet * tilethangb2dn;
        ans = "bộ hai đồng nhất";
      } else {
        result = "lose";
        mn = bet;
        ans = total >= 11 ? "tài" : "xỉu";
      }

    } else {
      const isTriple = numbers[0] === numbers[1] && numbers[1] === numbers[2];
      ans = isTriple ? "bộ ba đồng nhất" : total >= 11 ? "tài" : "xỉu";
      if (isTriple || ans !== choose) { result = "lose"; mn = bet; }
      else { result = "win"; mn = bet * tilethang; }
    }

    const newBalance = result === "win" ? money + mn : money - mn;
    if (result === "win") await increaseMoney(senderID, mn);
    else await decreaseMoney(senderID, mn);

    // history
    const cacheDir = ensureCacheDir();
    cleanupOldImages(cacheDir);

    const historyStore = loadHistory(cacheDir);
    const threadHistory = Array.isArray(historyStore[threadID]) ? historyStore[threadID] : [];

    const isTripleRound = numbers[0] === numbers[1] && numbers[1] === numbers[2];
    const outcomeType = normalizeType(isTripleRound ? "3" : total >= 11 ? "T" : "X");

    threadHistory.push({ total, type: outcomeType });
    const trimmedHistory = threadHistory.slice(-30);
    historyStore[threadID] = trimmedHistory;
    saveHistory(cacheDir, historyStore);

    const stats = summarizeHistory(trimmedHistory);

    const last7 = trimmedHistory.slice(-7);
    const chartData = last7.map((entry, idx) => ({
      round: `R${idx + 1}`,
      value: entry.total,
      type: normalizeType(entry.type)
    }));

    const sequence = trimmedHistory.slice(-12).map((entry) => normalizeType(entry.type));

    const msg =
      `🎲 SICBO 🎲\n` +
      `[👤] Người chơi: ${name}\n` +
      `[🎯] Chọn: ${choose}\n` +
      `[🎲] Tổng: ${total} (${ans})\n` +
      `[💵] Cược: ${replace(bet)}$\n` +
      `[📊] Kết quả: ${result === "win" ? "Thắng" : "Thua"}\n` +
      `[💰] Số dư: ${replace(newBalance)}$`;

    // render dashboard
    try {
      const avatar = await fetchAvatarBuffer(senderID);
      const canvas = await renderSessionImage({
        taiPercent: stats.taiPercent,
        xiuPercent: stats.xiuPercent,
        triplePercent: stats.triplePercent,
        currentTotal: total,
        chartData,
        sequence,
        player: { name, balance: newBalance, status: result === "win" ? "WIN" : "LOSE", avatar },
        dice: numbers
      });

      const filePath = path.join(cacheDir, `sb-${threadID}-${senderID}-${Date.now()}.png`);
      fs.writeFileSync(filePath, canvas.toBuffer("image/png"));

      const atts = [fs.createReadStream(filePath)];

      if (SEND_DICE_JPEG_ALONG_WITH_DASHBOARD) {
        const diceJpegs = buildDiceJpegAttachments(numbers);
        // nếu thiếu ảnh thì vẫn gửi những cái có
        atts.push(...diceJpegs);
      }

      return sendMessage({ body: msg, attachment: atts }, threadID, messageID);
    } catch (err) {
      console.error("Render dashboard failed:", err);

      // fallback: gửi jpeg như bản cũ (nếu bật)
      if (SEND_DICE_JPEG_IF_CANVAS_FAILS) {
        const diceJpegs = buildDiceJpegAttachments(numbers);
        if (diceJpegs.length) {
          return sendMessage({ body: msg, attachment: diceJpegs }, threadID, messageID);
        }
      }

      // fallback cuối: chỉ text
      return sendMessage(msg, threadID, messageID);
    }
  } catch (e) {
    console.error(e);
    return api.sendMessage("❌ Đã xảy ra lỗi", event.threadID, event.messageID);
  }
};
