const moment = require("moment-timezone");

module.exports.config = {
  name: "bank",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Vanloi",
  description: "Ngân hàng DexBank và tín dụng đen",
  commandCategory: "Tiện ích",
  usages: "[register/check/gửi/rút/chovay/huygoi/listgoi/tronno/tra/thuebaove/cuop]",
  cooldowns: 0,
  dependencies: {
    "fs-extra": "",
    "axios": "",
    "canvas": ""
  }
};

const DATA_DIR = "data";
const BANK_FILE = "bank.json";
const INTEREST_RATE_PERCENT = 5n;
const INTEREST_INTERVAL_HOURS = 12;
const P2P_PROTECT_COST = 1_000_000n;
const P2P_PROTECT_HOURS = 24;
const COLLECTION_COOLDOWN_MS = 5 * 60 * 1000;
const LEND_EXPIRE_MS = 5 * 60 * 60 * 1000;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const ROB_COOLDOWN_MS = 30 * 60 * 1000;
const ROB_TARGET_COOLDOWN_MS = 45 * 60 * 1000;
const ROB_JOIN_WINDOW_MS = 45 * 1000;
const ROB_BASE_SUCCESS = 35;
const ROB_PER_HELPER = 8;
const ROB_MAX_SUCCESS = 85;
const ROB_MIN_LOOT = 50_000n;
const ROB_MAX_LOOT_PERCENT = 15;
const ROB_FAIL_FINE_PERCENT = 10;
const ROB_FAIL_FINE_CAP = 1_000_000n;
const GUARD_PACKS = {
  1: { cost: 200_000n, hours: 6, reduceChance: 10, reduceLootPercent: 5 },
  2: { cost: 500_000n, hours: 12, reduceChance: 20, reduceLootPercent: 8 },
  3: { cost: 1_000_000n, hours: 24, reduceChance: 30, reduceLootPercent: 12 }
};

module.exports.onLoad = async () => {
  const { existsSync, writeFileSync, mkdirSync } = require("fs-extra");
  const { join } = require("path");
  const dir = join(__dirname, DATA_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const pathData = join(__dirname, DATA_DIR, BANK_FILE);
  if (!existsSync(pathData)) writeFileSync(pathData, "[]", "utf-8");

  if (!global.lendMarket) global.lendMarket = [];
  if (!global.robSessions) global.robSessions = {};

  setInterval(checkAndCalculateInterest, 1 * 60 * 60 * 1000);
  setInterval(async () => {
    if (global.Currencies) {
      await cleanupLendMarket(global.Currencies);
    }
  }, 30 * 60 * 1000);
};

async function checkAndCalculateInterest() {
  const { readFileSync, writeFileSync } = require("fs-extra");
  const { join } = require("path");
  const pathData = join(__dirname, DATA_DIR, BANK_FILE);

  let users = JSON.parse(readFileSync(pathData, "utf-8"));
  const now = moment();

  users = users.map((account) => {
    if (!account.lastInterestTime) {
      account.lastInterestTime = now.toISOString();
      return account;
    }

    const lastTime = moment(account.lastInterestTime);
    const diffHours = now.diff(lastTime, "hours");

    if (diffHours >= INTEREST_INTERVAL_HOURS) {
      const periods = Math.floor(diffHours / INTEREST_INTERVAL_HOURS);
      let updatedMoney = parseCurrencyToBigInt(account.money);
      for (let i = 0; i < periods; i += 1) {
        updatedMoney = updatedMoney + (updatedMoney * INTEREST_RATE_PERCENT) / 100n;
      }
      account.money = String(updatedMoney);
      account.lastInterestTime = lastTime.add(periods * INTEREST_INTERVAL_HOURS, "hours").toISOString();
    }

    return account;
  });

  writeFileSync(pathData, JSON.stringify(users, null, 2));
}

const parseAmountToBigInt = (value) => {
  if (!value) return { value: null, error: null };
  const normalized = String(value).trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)(qi|q|t|b|m|k)?$/);
  if (!match) return { value: null, error: null };
  const base = match[1];
  const suffix = match[2];
  const multipliers = {
    k: 1_000n,
    m: 1_000_000n,
    b: 1_000_000_000n,
    t: 1_000_000_000_000n,
    q: 1_000_000_000_000_000n,
    qi: 1_000_000_000_000_000_000n
  };
  const multiplier = suffix ? multipliers[suffix] : 1n;
  if (base.includes(".")) {
    if (suffix === "q" || suffix === "qi") {
      return { value: null, error: "⚠️ Không hỗ trợ số thập phân với q/qi." };
    }
    if (suffix === undefined || suffix === "k" || suffix === "m" || suffix === "b" || suffix === "t") {
      const amount = Math.round(parseFloat(base) * Number(multiplier));
      if (!Number.isFinite(amount)) return { value: null, error: null };
      return { value: BigInt(amount), error: null };
    }
    return { value: null, error: null };
  }
  return { value: BigInt(base) * multiplier, error: null };
};

const parseCurrencyToBigInt = (value) => {
  try {
    if (value === undefined || value === null) return 0n;
    const cleaned = String(value).replace(/,/g, "").trim();
    if (!cleaned) return 0n;
    return BigInt(cleaned);
  } catch (error) {
    return 0n;
  }
};

const formatNumber = (value) => {
  const str = typeof value === "string" ? value : value.toString();
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const ensureBankProfile = (userData) => {
  if (!userData.bank || typeof userData.bank !== "object") userData.bank = {};
  const bank = userData.bank;
  if (bank.debt === undefined) bank.debt = "0";
  if (bank.debtUser === undefined) bank.debtUser = "0";
  if (bank.expire === undefined) bank.expire = 0;
  if (bank.safeUntil === undefined) bank.safeUntil = 0;
  if (bank.lenderID === undefined) bank.lenderID = "";
  if (!Array.isArray(bank.debtLog)) bank.debtLog = [];
  if (bank.lastCollectAt === undefined) bank.lastCollectAt = 0;
  if (bank.guardUntil === undefined) bank.guardUntil = 0;
  if (bank.guardPack === undefined) bank.guardPack = 0;
  if (bank.lastRobAt === undefined) bank.lastRobAt = 0;
  if (bank.lastRobbedAt === undefined) bank.lastRobbedAt = 0;
  return bank;
};

const getBankAccounts = () => {
  const { readFileSync, existsSync, writeFileSync } = require("fs-extra");
  const { join } = require("path");
  const pathData = join(__dirname, DATA_DIR, BANK_FILE);
  if (!existsSync(pathData)) writeFileSync(pathData, "[]", "utf-8");
  return JSON.parse(readFileSync(pathData, "utf-8"));
};

const saveBankAccounts = (data) => {
  const { writeFileSync } = require("fs-extra");
  const { join } = require("path");
  const pathData = join(__dirname, DATA_DIR, BANK_FILE);
  writeFileSync(pathData, JSON.stringify(data, null, 2));
};

const ensureFonts = async () => {
  const fs = require("fs");
  const axios = require("axios");
  const cacheDir = `${__dirname}/cache`;
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const fonts = [
    {
      name: "SplineSans-Medium.ttf",
      url: "https://drive.google.com/u/0/uc?id=102B8O3_0vTn_zla13wzSzMa-vdTZOCmp&export=download",
      family: "SplineSans-Medium"
    },
    {
      name: "SplineSans.ttf",
      url: "https://drive.google.com/u/0/uc?id=1--V7DANKLsUx57zg8nLD4b5aiPfHcmwD&export=download",
      family: "SplineSans"
    }
  ];

  for (const font of fonts) {
    const localPath = `${__dirname}/${font.name}`;
    const cachedPath = `${cacheDir}/${font.name}`;
    if (!fs.existsSync(cachedPath)) {
      if (fs.existsSync(localPath)) {
        fs.copyFileSync(localPath, cachedPath);
      } else {
        const data = (await axios.get(font.url, { responseType: "arraybuffer" })).data;
        fs.writeFileSync(cachedPath, Buffer.from(data));
      }
    }
  }

  return {
    medium: `${cacheDir}/SplineSans-Medium.ttf`,
    regular: `${cacheDir}/SplineSans.ttf`
  };
};

const toSafeNumber = (big) => {
  if (big > MAX_SAFE_BIGINT) return null;
  return Number(big);
};

const ensureHandleReply = () => {
  if (!global.client) global.client = {};
  if (!global.client.handleReply) global.client.handleReply = [];
};

const isAdminUser = (userId) => {
  const adminList = global.config?.ADMINBOT || global.config?.ADMIN || [];
  return Array.isArray(adminList) && adminList.map(String).includes(String(userId));
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clampBigInt = (value, min, max) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const getAccountById = (bankAccounts, userId) =>
  bankAccounts.find((account) => String(account.senderID) === String(userId));

const isGuardActive = (bankProfile) => bankProfile.guardUntil && bankProfile.guardUntil > Date.now();

const getGuardInfo = (bankProfile) => {
  if (!isGuardActive(bankProfile)) return null;
  const pack = GUARD_PACKS[bankProfile.guardPack];
  if (!pack) return null;
  return {
    pack: bankProfile.guardPack,
    until: bankProfile.guardUntil,
    reduceChance: pack.reduceChance,
    reduceLootPercent: pack.reduceLootPercent
  };
};

const calcRobSuccess = ({ attackersCount, guardInfo }) => {
  const helpers = Math.max(attackersCount - 1, 0);
  const guardPenalty = guardInfo ? guardInfo.reduceChance : 0;
  const base = ROB_BASE_SUCCESS + helpers * ROB_PER_HELPER - guardPenalty;
  return clamp(base, 5, ROB_MAX_SUCCESS);
};

const calcLootCapPercent = (guardInfo) => {
  const reduction = guardInfo ? guardInfo.reduceLootPercent : 0;
  return clamp(ROB_MAX_LOOT_PERCENT - reduction, 5, ROB_MAX_LOOT_PERCENT);
};

const resolveRobbery = async ({ api, threadID, Users, Currencies, sessionId }) => {
  const session = global.robSessions?.[sessionId];
  if (!session || session.resolved) return;
  session.resolved = true;
  if (session.timeout) {
    clearTimeout(session.timeout);
    session.timeout = null;
  }

  const bankAccounts = getBankAccounts();
  const targetAccount = getAccountById(bankAccounts, session.targetID);
  if (!targetAccount) {
    await safeSend(api, "⚠️ Nạn nhân chưa có tài khoản bank.", threadID);
    delete global.robSessions[sessionId];
    return;
  }

  const targetRaw = await Users.getData(session.targetID);
  if (!targetRaw.data) targetRaw.data = {};
  const targetProfile = ensureBankProfile(targetRaw.data);
  const guardInfo = getGuardInfo(targetProfile);

  const attackers = session.attackers || [];
  const attackersCount = Math.max(attackers.length, 1);
  const successChance = calcRobSuccess({ attackersCount, guardInfo });
  const roll = Math.floor(Math.random() * 100) + 1;

  const targetBankBalance = BigInt(targetAccount.money || 0);
  const capPercent = calcLootCapPercent(guardInfo);
  const lootCap = (targetBankBalance * BigInt(capPercent)) / 100n;
  const capAmount = lootCap > ROB_MIN_LOOT ? lootCap : ROB_MIN_LOOT;
  const desiredAmount = session.requestedLoot && session.requestedLoot > 0n
    ? clampBigInt(session.requestedLoot, 0n, capAmount)
    : capAmount;
  const lootAmount = targetBankBalance === 0n
    ? 0n
    : clampBigInt(desiredAmount, 0n, targetBankBalance);

  if (roll > successChance || targetBankBalance <= 0n || lootAmount <= 0n) {
    const hostId = session.hostID;
    const hostAccount = getAccountById(bankAccounts, hostId);
    if (hostAccount) {
      const hostBank = BigInt(hostAccount.money || 0);
      const fine = clampBigInt((hostBank * BigInt(ROB_FAIL_FINE_PERCENT)) / 100n, 0n, ROB_FAIL_FINE_CAP);
      hostAccount.money = String(hostBank - fine);
      saveBankAccounts(bankAccounts);
      await safeSend(
        api,
        `❌ Cướp thất bại! Host bị phạt ${formatNumber(fine)}$ (BANK).`,
        threadID
      );
    } else {
      await safeSend(api, "❌ Cướp thất bại!", threadID);
    }
  } else {
    targetAccount.money = String(targetBankBalance - lootAmount);
    const share = lootAmount / BigInt(attackersCount);
    const remainder = lootAmount % BigInt(attackersCount);

    for (let i = 0; i < attackers.length; i += 1) {
      const memberId = attackers[i];
      const reward = i === 0 ? share + remainder : share;
      if (reward <= 0n) continue;
      const paid = await applyCurrencyChange({
        api,
        Currencies,
        amountBig: reward,
        action: "increase",
        threadID,
        userId: memberId
      });
      if (!paid) {
        const memberAccount = getAccountById(bankAccounts, memberId);
        if (memberAccount) {
          memberAccount.money = String(BigInt(memberAccount.money || 0) + reward);
        }
      }
    }

    saveBankAccounts(bankAccounts);
    await safeSend(
      api,
      `✅ Cướp thành công! Loot ${formatNumber(lootAmount)}$ | Tỉ lệ ${successChance}%.`,
      threadID
    );
  }

  if (global.client?.handleReply && session.messageIDs?.length) {
    global.client.handleReply = global.client.handleReply.filter(
      (item) => !session.messageIDs.includes(item.messageID)
    );
  }

  delete global.robSessions[sessionId];
};

const safeSend = async (api, message, threadID) => {
  try {
    const maybePromise = api.sendMessage(message, threadID, () => {});
    if (maybePromise && typeof maybePromise.then === "function") {
      await maybePromise;
      return;
    }
    await new Promise((resolve) => {
      api.sendMessage(message, threadID, () => resolve());
    });
  } catch (error) {
    console.log("[DexBank] sendMessage failed:", error?.message || error);
  }
};

const applyCurrencyChange = async ({ api, Currencies, amountBig, action, threadID, messageID, userId }) => {
  const safeNumber = toSafeNumber(amountBig);
  if (safeNumber === null) {
    if (messageID !== undefined) {
      await api.sendMessage("⚠️ Số quá lớn (vượt safe integer).", threadID, messageID);
    } else {
      await api.sendMessage("⚠️ Số quá lớn (vượt safe integer).", threadID);
    }
    return false;
  }
  if (action === "increase") {
    await Currencies.increaseMoney(userId, safeNumber);
  } else {
    await Currencies.decreaseMoney(userId, safeNumber);
  }
  return true;
};

const cleanupLendMarket = async (Currencies) => {
  if (!global.lendMarket || global.lendMarket.length === 0) return 0;
  if (!Currencies) return 0;

  const now = Date.now();
  const remaining = [];
  let refunded = 0;
  let removed = 0;

  for (const loan of global.lendMarket) {
    if (!loan.createdAt || now - loan.createdAt <= LEND_EXPIRE_MS) {
      remaining.push(loan);
      continue;
    }
    if (loan.escrowed === true) {
      const amountBig = BigInt(loan.amount || 0);
      const safeNumber = toSafeNumber(amountBig);
      if (safeNumber === null) {
        console.log(`[DexBank] Loan escrow too large for safe integer: ${loan.amount}`);
        remaining.push(loan);
        continue;
      }
      try {
        await Currencies.increaseMoney(loan.lenderID, safeNumber);
        refunded += 1;
      } catch (error) {
        console.log(`[DexBank] Refund escrow failed for ${loan.lenderID}:`, error?.message || error);
        remaining.push(loan);
        continue;
      }
    }
    removed += 1;
  }

  global.lendMarket = remaining;
  return { removedCount: removed, refundedCount: refunded };
};

const fetchAvatarBuffer = async (userId) => {
  const axios = require("axios");
  if (!userId) return null;
  const url = `https://graph.facebook.com/${userId}/picture?height=200&width=200`;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    return Buffer.from(res.data, "binary");
  } catch (error) {
    return null;
  }
};

const drawRoundedRect = (ctx, x, y, w, h, r) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const drawGrid = (ctx, width, height) => {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  const spacing = 40;
  for (let x = 0; x < width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
};

const drawTechLines = (ctx, width, height) => {
  ctx.save();
  ctx.strokeStyle = "rgba(0, 255, 204, 0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 120);
  ctx.lineTo(320, 120);
  ctx.lineTo(360, 160);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(width - 140, 200);
  ctx.lineTo(width - 320, 200);
  ctx.lineTo(width - 360, 240);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.beginPath();
  ctx.moveTo(120, height - 120);
  ctx.lineTo(400, height - 120);
  ctx.lineTo(440, height - 160);
  ctx.stroke();
  ctx.restore();
};

const drawAvatar = async (ctx, buffer, x, y, size) => {
  if (!buffer) return;
  const { loadImage } = require("canvas");
  const img = await loadImage(buffer);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
};

const drawShield = (ctx, x, y, size) => {
  ctx.save();
  ctx.fillStyle = "#22c55e";
  ctx.beginPath();
  ctx.moveTo(x + size * 0.5, y);
  ctx.lineTo(x + size, y + size * 0.25);
  ctx.lineTo(x + size * 0.82, y + size * 0.85);
  ctx.lineTo(x + size * 0.5, y + size);
  ctx.lineTo(x + size * 0.18, y + size * 0.85);
  ctx.lineTo(x, y + size * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const buildBankCard = async ({
  name,
  cash,
  accountId,
  bankDebt,
  blackDebt,
  isBadDebt,
  isProtected,
  statusText,
  threadId
}) => {
  const { createCanvas } = require("canvas");
  const { registerFont } = require("canvas");
  const fonts = await ensureFonts();

  registerFont(fonts.medium, { family: "SplineSans-Medium" });
  registerFont(fonts.regular, { family: "SplineSans" });

  const width = 1000;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  if (isBadDebt) {
    gradient.addColorStop(0, "#3b0a0a");
    gradient.addColorStop(1, "#000000");
  } else {
    gradient.addColorStop(0, "#001a33");
    gradient.addColorStop(1, "#000000");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, width, height);
  drawTechLines(ctx, width, height);

  const avatarBuffer = await fetchAvatarBuffer(accountId);
  const statusColor = isProtected ? "#facc15" : isBadDebt ? "#ff4d4d" : "#22c55e";

  ctx.font = "bold 38px SplineSans-Medium";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("DexBank", 60, 70);

  ctx.font = "24px SplineSans";
  ctx.fillStyle = statusColor;
  ctx.fillText(statusText, 60, 105);

  await drawAvatar(ctx, avatarBuffer, width - 150, 40, 90);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(width - 105, 85, 48, 0, Math.PI * 2);
  ctx.stroke();

  if (isProtected) {
    drawShield(ctx, width - 210, 55, 40);
  }

  const boxWidth = 420;
  const boxHeight = 120;
  const startX = 80;
  const startY = 170;
  const gapX = 60;
  const gapY = 40;

  const boxes = [
    { label: "Tiền mặt", value: `${formatNumber(cash)}$`, color: "#00ffcc" },
    { label: "STK", value: accountId, color: "#ffcc00" },
    { label: "Nợ ngân hàng", value: `${formatNumber(bankDebt)}$`, color: "#ff4d4d" },
    { label: "Nợ tín dụng đen", value: `${formatNumber(blackDebt)}$`, color: "#ff4d4d" }
  ];

  boxes.forEach((box, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = startX + col * (boxWidth + gapX);
    const y = startY + row * (boxHeight + gapY);

    ctx.save();
    drawRoundedRect(ctx, x, y, boxWidth, boxHeight, 20);
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.stroke();
    ctx.restore();

    ctx.font = "20px SplineSans";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(box.label, x + 20, y + 35);

    ctx.font = "bold 30px SplineSans-Medium";
    ctx.fillStyle = box.color;
    ctx.fillText(box.value, x + 20, y + 80);
  });

  const timeText = moment().tz("Asia/Ho_Chi_Minh").format("HH:mm • DD/MM/YYYY");
  ctx.font = "20px SplineSans";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`⏰ ${timeText}`, 60, height - 40);

  ctx.textAlign = "right";
  ctx.fillText(`Thread: ${threadId}`, width - 60, height - 40);
  ctx.textAlign = "left";

  return canvas.toBuffer();
};

const wrapText = (ctx, text, x, y, maxWidth, lineHeight) => {
  const words = text.split(" ");
  let line = "";
  let lineCount = 0;

  for (let i = 0; i < words.length; i += 1) {
    const testLine = `${line}${words[i]} `;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, y + lineCount * lineHeight);
      line = `${words[i]} `;
      lineCount += 1;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line.trim(), x, y + lineCount * lineHeight);
    lineCount += 1;
  }
  return lineCount;
};

const buildHelpCard = async ({ prefix, threadId }) => {
  const { createCanvas } = require("canvas");
  const { registerFont } = require("canvas");
  const fonts = await ensureFonts();

  registerFont(fonts.medium, { family: "SplineSans-Medium" });
  registerFont(fonts.regular, { family: "SplineSans" });

  const width = 1100;
  const height = 900;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#00142a");
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, width, height);
  drawTechLines(ctx, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px SplineSans-Medium";
  ctx.fillText("🏦 DexBank • Command Guide", 60, 70);
  ctx.font = "20px SplineSans";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(moment().tz("Asia/Ho_Chi_Minh").format("HH:mm • DD/MM/YYYY"), 60, 105);

  const boxWidth = 320;
  const boxHeight = 300;
  const startX = 60;
  const startY = 140;
  const gapX = 40;

  const sections = [
    {
      title: "👤 TÀI KHOẢN",
      lines: [
        `${prefix} register — tạo tài khoản`,
        `${prefix} check — xem thẻ bank`,
        `${prefix} gửi <số|all> — gửi tiền`,
        `${prefix} rút <số|all> — rút tiền`
      ]
    },
    {
      title: "💸 VAY / THỊ TRƯỜNG",
      lines: [
        `${prefix} chovay <số> <lãi%> <giờ>`,
        `${prefix} listgoi — xem gói vay`,
        `${prefix} huygoi <số> — hủy gói vay`,
        `${prefix} tronno — bảo kê nợ`,
        `${prefix} tra <số|all> — trả nợ`
      ]
    },
    {
      title: "🛡️ PVP / AN NINH",
      lines: [
        `${prefix} thuebaove 1|2|3 — thuê bảo vệ`,
        "• giảm tỉ lệ bị cướp + giảm loot",
        `${prefix} cuop @tag <số|all> — cướp bank`,
        "• bước: @tag mục tiêu → hội đồng reply \"join\" (45s)",
        `${prefix} resetno @tag — reset nợ (admin)`
      ]
    }
  ];

  sections.forEach((section, index) => {
    const x = startX + index * (boxWidth + gapX);
    const y = startY;
    ctx.save();
    drawRoundedRect(ctx, x, y, boxWidth, boxHeight, 20);
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px SplineSans-Medium";
    ctx.fillText(section.title, x + 20, y + 35);

    ctx.font = "18px SplineSans";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    let offsetY = y + 70;
    section.lines.forEach((line) => {
      const linesUsed = wrapText(ctx, line, x + 20, offsetY, boxWidth - 40, 24);
      offsetY += linesUsed * 24;
    });
  });

  const guardBoxX = 60;
  const guardBoxY = 470;
  const guardBoxWidth = 680;
  const guardBoxHeight = 200;
  ctx.save();
  drawRoundedRect(ctx, guardBoxX, guardBoxY, guardBoxWidth, guardBoxHeight, 20);
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px SplineSans-Medium";
  ctx.fillText("🛡️ GÓI BẢO VỆ", guardBoxX + 20, guardBoxY + 35);

  ctx.font = "18px SplineSans";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  let packY = guardBoxY + 70;
  Object.keys(GUARD_PACKS).forEach((key) => {
    const pack = GUARD_PACKS[key];
    const line = `Gói ${key}: ${formatNumber(pack.cost)}$ • ${pack.hours}h • -${pack.reduceChance}% chance • -${pack.reduceLootPercent}% loot`;
    wrapText(ctx, line, guardBoxX + 20, packY, guardBoxWidth - 40, 24);
    packY += 28;
  });

  const examplesBoxX = 770;
  const examplesBoxY = 470;
  const examplesBoxWidth = 270;
  const examplesBoxHeight = 320;
  ctx.save();
  drawRoundedRect(ctx, examplesBoxX, examplesBoxY, examplesBoxWidth, examplesBoxHeight, 20);
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px SplineSans-Medium";
  ctx.fillText("📌 Examples", examplesBoxX + 20, examplesBoxY + 35);
  ctx.font = "18px SplineSans";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const exampleLines = [
    `${prefix} gửi 200k`,
    `${prefix} rút all`,
    `${prefix} chovay 500k 10 24`,
    `${prefix} thuebaove 2`,
    `${prefix} cuop @tag 300k`,
    "reply: join"
  ];
  let exampleY = examplesBoxY + 70;
  exampleLines.forEach((line) => {
    wrapText(ctx, line, examplesBoxX + 20, exampleY, examplesBoxWidth - 40, 24);
    exampleY += 28;
  });

  ctx.font = "18px SplineSans";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`Thread: ${threadId}`, 60, height - 30);

  return canvas.toBuffer();
};

module.exports.run = async function ({ api, event, args, Currencies, Users }) {
  const { threadID, messageID, senderID } = event;
  const command = String(args[0] || "").toLowerCase();

  try {
    if (!global.lendMarket) global.lendMarket = [];
    if (!global.robSessions) global.robSessions = {};
    const userRaw = await Users.getData(senderID);
    if (!userRaw.data) userRaw.data = {};
    const bankProfile = ensureBankProfile(userRaw.data);

    if (command === "help") {
      const helpBuffer = await buildHelpCard({
        prefix: `${global.config.PREFIX}${this.config.name}`,
        threadId: threadID
      });
      const fs = require("fs");
      const helpPath = `${__dirname}/cache/dexbank_help_${threadID}.png`;
      fs.writeFileSync(helpPath, helpBuffer);
      return api.sendMessage(
        { attachment: fs.createReadStream(helpPath) },
        threadID,
        () => {
          if (fs.existsSync(helpPath)) fs.unlinkSync(helpPath);
        },
        messageID
      );
    }

    if (command === "-r" || command === "register") {
      const bankAccounts = getBankAccounts();
      if (!bankAccounts.find((i) => i.senderID == senderID)) {
        const newUser = {
          senderID: senderID,
          money: "0",
          lastInterestTime: moment().toISOString()
        };
        bankAccounts.push(newUser);
        saveBankAccounts(bankAccounts);
      }
      await Users.setData(senderID, userRaw);
      return api.sendMessage("✅ Đã đăng ký DexBank.", threadID, messageID);
    }

    if (command === "gửi" || command === "send") {
      const bankAccounts = getBankAccounts();
      const balancesRaw = (await Currencies.getData(senderID)).money;
      const balances = parseCurrencyToBigInt(balancesRaw);
      const amountInfo = args[1] !== "all" ? parseAmountToBigInt(args[1]) : { value: balances, error: null };
      if (amountInfo.error) return api.sendMessage(amountInfo.error, threadID, messageID);
      if (!amountInfo.value) return api.sendMessage("❌ Số tiền không hợp lệ.", threadID, messageID);
      const balance = amountInfo.value;
      const userData = bankAccounts.find((i) => i.senderID == senderID);
      if (!userData) {
        return api.sendMessage(
          `⚠️ Chưa đăng ký. Dùng ${global.config.PREFIX}${this.config.name} register.`,
          threadID,
          messageID
        );
      }
      if (balance < 10000n) return api.sendMessage("⚠️ Gửi tối thiểu 10,000$.", threadID, messageID);
      if (balance > BigInt(balances)) return api.sendMessage(`⚠️ Không đủ ${formatNumber(balance)}$.`, threadID, messageID);

      const balanceChanged = await applyCurrencyChange({
        api,
        Currencies,
        amountBig: balance,
        action: "decrease",
        threadID,
        messageID,
        userId: senderID
      });
      if (!balanceChanged) return;
      userData.money = String(BigInt(userData.money) + balance);
      saveBankAccounts(bankAccounts);
      return api.sendMessage(`✅ Gửi +${formatNumber(balance)}$\n🏦 Bank: ${formatNumber(userData.money)}$`, threadID, messageID);
    }

    if (command === "rút" || command === "lấy") {
      const bankAccounts = getBankAccounts();
      const userData = bankAccounts.find((i) => i.senderID == senderID);
      const amountInfo = args[1] !== "all" ? parseAmountToBigInt(args[1]) : { value: BigInt(userData?.money || 0), error: null };
      if (amountInfo.error) return api.sendMessage(amountInfo.error, threadID, messageID);
      if (!amountInfo.value) return api.sendMessage("⚠️ Nhập số tiền.", threadID, messageID);
      const money = amountInfo.value;
      if (!userData) {
        return api.sendMessage(
          `⚠️ Chưa đăng ký. Dùng ${global.config.PREFIX}${this.config.name} register.`,
          threadID,
          messageID
        );
      }
      if (money < 10000n) return api.sendMessage("⚠️ Rút tối thiểu 10,000$.", threadID, messageID);
      if (money > BigInt(userData.money)) return api.sendMessage("⚠️ Số dư không đủ.", threadID, messageID);

      const withdrawn = await applyCurrencyChange({
        api,
        Currencies,
        amountBig: money,
        action: "increase",
        threadID,
        messageID,
        userId: senderID
      });
      if (!withdrawn) return;
      userData.money = String(BigInt(userData.money) - money);
      saveBankAccounts(bankAccounts);
      return api.sendMessage(`✅ Rút -${formatNumber(money)}$\n🏦 Còn: ${formatNumber(userData.money)}$`, threadID, messageID);
    }

    if (command === "chovay") {
      const amountInfo = parseAmountToBigInt(args[1]);
      if (amountInfo.error) return api.sendMessage(amountInfo.error, threadID, messageID);
      const amount = amountInfo.value;
      const interest = Number(args[2]);
      const hours = Number(args[3]);

      if (!amount || amount <= 0n) {
        return api.sendMessage("⚠️ Nhập số tiền hợp lệ.", threadID, messageID);
      }
      if (!Number.isFinite(interest) || interest < 0) {
        return api.sendMessage("⚠️ Lãi suất không hợp lệ.", threadID, messageID);
      }
      if (interest > 100) {
        return api.sendMessage("⚠️ Lãi suất tối đa là 100%.", threadID, messageID);
      }
      if (!Number.isFinite(hours) || hours <= 0) {
        return api.sendMessage("⚠️ Giờ không hợp lệ.", threadID, messageID);
      }

      const lenderBalanceRaw = (await Currencies.getData(senderID)).money || 0;
      const lenderBalance = parseCurrencyToBigInt(lenderBalanceRaw);
      if (lenderBalance < amount) {
        return api.sendMessage("⚠️ Bạn không đủ tiền để tạo gói vay.", threadID, messageID);
      }

      const escrowed = await applyCurrencyChange({
        api,
        Currencies,
        amountBig: amount,
        action: "decrease",
        threadID,
        messageID,
        userId: senderID
      });
      if (!escrowed) return;
      const lenderName = (await Users.getData(senderID)).name || senderID;
      global.lendMarket.push({
        lenderID: senderID,
        lenderName,
        amount: String(amount),
        interest,
        hours,
        createdAt: Date.now(),
        escrowed: true
      });

      return api.sendMessage(
        `✅ Đã tạo gói vay #${global.lendMarket.length}\n💸 Số tiền: ${formatNumber(amount)}$\n💹 Lãi: ${interest}%\n⏳ Thời hạn: ${hours} giờ`,
        threadID,
        messageID
      );
    }

    if (command === "huygoi" || command === "cancel") {
      if (!global.lendMarket || global.lendMarket.length === 0) {
        return api.sendMessage("📭 Hiện không có gói vay nào.", threadID, messageID);
      }
      const index = parseInt(args[1], 10) - 1;
      if (!Number.isFinite(index) || index < 0 || index >= global.lendMarket.length) {
        return api.sendMessage("⚠️ Số thứ tự gói vay không hợp lệ.", threadID, messageID);
      }
      const loan = global.lendMarket[index];
      if (loan.lenderID !== senderID) {
        return api.sendMessage("⚠️ Bạn chỉ được hủy gói vay của mình.", threadID, messageID);
      }
      let refundText = "";
      if (loan.escrowed !== false) {
        const amountBig = BigInt(loan.amount || 0);
        const refunded = await applyCurrencyChange({
          api,
          Currencies,
          amountBig: amountBig,
          action: "increase",
          threadID,
          messageID,
          userId: senderID
        });
        if (!refunded) return;
        refundText = ` và hoàn ${formatNumber(amountBig)}$`;
      }
      global.lendMarket.splice(index, 1);
      return api.sendMessage(`✅ Đã hủy gói vay #${index + 1}${refundText}.`, threadID, messageID);
    }

    if (command === "listgoi") {
      await cleanupLendMarket(Currencies);
      if (!global.lendMarket || global.lendMarket.length === 0) {
        return api.sendMessage("📭 Hiện không có gói vay nào.", threadID, messageID);
      }

      const list = global.lendMarket
        .map((item, index) =>
          `${index + 1}. ${formatNumber(item.amount)}$ | ${item.interest}% | ${item.hours}h | Chủ nợ: ${item.lenderName}`
        )
        .join("\n");

      return api.sendMessage(
        `📋 DANH SÁCH GÓI VAY\n${list}\n\n↩️ Reply số thứ tự để nhận gói vay.\n❌ Hủy gói: ${global.config.PREFIX}${this.config.name} huygoi [số]`,
        threadID,
        (error, info) => {
          if (error) return;
          ensureHandleReply();
          global.client.handleReply.push({
            name: this.config.name,
            messageID: info.messageID,
            author: null,
            type: "lendMarket"
          });
        },
        messageID
      );
    }

    if (command === "tra" || command === "trả" || command === "trano" || command === "pay") {
      const debtUser = BigInt(bankProfile.debtUser || 0);
      if (debtUser <= 0n) {
        return api.sendMessage("✅ Bạn không có nợ tín dụng đen để trả.", threadID, messageID);
      }

      const cashRaw = (await Currencies.getData(senderID)).money || 0;
      const cash = parseCurrencyToBigInt(cashRaw);
      const amountInfo = args[1] === "all"
        ? { value: cash, error: null }
        : parseAmountToBigInt(args[1]);
      if (amountInfo.error) return api.sendMessage(amountInfo.error, threadID, messageID);
      if (!amountInfo.value || amountInfo.value <= 0n) {
        return api.sendMessage("⚠️ Nhập số tiền hợp lệ.", threadID, messageID);
      }

      const payAmount = clampBigInt(amountInfo.value, 0n, clampBigInt(cash, 0n, debtUser));
      if (payAmount <= 0n) {
        return api.sendMessage("⚠️ Không đủ tiền để trả nợ.", threadID, messageID);
      }

      const paid = await applyCurrencyChange({
        api,
        Currencies,
        amountBig: payAmount,
        action: "decrease",
        threadID,
        messageID,
        userId: senderID
      });
      if (!paid) return;

      if (bankProfile.lenderID) {
        const safeNumber = toSafeNumber(payAmount);
        if (safeNumber === null) {
          console.log(`[DexBank] Repay too large for safe integer: ${payAmount}`);
        } else {
          try {
            await Currencies.increaseMoney(bankProfile.lenderID, safeNumber);
          } catch (error) {
            console.log(`[DexBank] Repay transfer failed to ${bankProfile.lenderID}:`, error?.message || error);
          }
        }
      }

      const remaining = debtUser - payAmount;
      bankProfile.debtUser = String(remaining > 0n ? remaining : 0n);
      if (remaining <= 0n) {
        bankProfile.expire = 0;
        bankProfile.lenderID = "";
      }
      bankProfile.debtLog.push({
        time: Date.now(),
        action: "repay",
        amount: String(payAmount),
        remaining: bankProfile.debtUser,
        by: senderID
      });
      await Users.setData(senderID, userRaw);

      return api.sendMessage(
        `✅ Trả nợ thành công: -${formatNumber(payAmount)}$, còn nợ: ${formatNumber(bankProfile.debtUser)}$`,
        threadID,
        messageID
      );
    }

    if (command === "resetno" || command === "resetdebt" || command === "resetnợ") {
      if (!isAdminUser(senderID)) {
        return api.sendMessage("⛔ Bạn không có quyền dùng lệnh này.", threadID, messageID);
      }
      const targetId = Object.keys(event.mentions || {})[0] || args[1];
      if (!targetId) {
        return api.sendMessage(
          `⚠️ Dùng: ${global.config.PREFIX}${this.config.name} resetno @tag|<id> [full]`,
          threadID,
          messageID
        );
      }

      const targetRaw = await Users.getData(targetId);
      if (!targetRaw.data) targetRaw.data = {};
      const targetBank = ensureBankProfile(targetRaw.data);
      const oldDebtUser = targetBank.debtUser || "0";
      const oldExpire = targetBank.expire || 0;
      const oldLender = targetBank.lenderID || "";

      targetBank.debtUser = "0";
      targetBank.expire = 0;
      targetBank.lenderID = "";
      if (args.includes("full")) targetBank.debt = "0";

      targetBank.debtLog.push({
        time: Date.now(),
        action: "admin_reset",
        by: senderID,
        oldDebtUser,
        oldExpire,
        oldLender
      });

      await Users.setData(targetId, targetRaw);

      const targetName = targetRaw.name || targetId;
      return api.sendMessage(
        `✅ Admin đã reset nợ cho ${targetName}. Nợ cũ: ${formatNumber(oldDebtUser)}$`,
        threadID,
        messageID
      );
    }

    if (command === "tronno") {
      const debtUser = BigInt(bankProfile.debtUser || 0);
      if (debtUser <= 0n) {
        return api.sendMessage("✅ Bạn không có nợ tín dụng đen để trốn.", threadID, messageID);
      }

      const balanceRaw = (await Currencies.getData(senderID)).money || 0;
      const balance = parseCurrencyToBigInt(balanceRaw);
      if (balance < P2P_PROTECT_COST) {
        return api.sendMessage("⚠️ Cần 1,000,000$ để trốn nợ.", threadID, messageID);
      }

      const protectedPaid = await applyCurrencyChange({
        api,
        Currencies,
        amountBig: P2P_PROTECT_COST,
        action: "decrease",
        threadID,
        messageID,
        userId: senderID
      });
      if (!protectedPaid) return;
      const now = Date.now();
      const baseTime = bankProfile.safeUntil && bankProfile.safeUntil > now ? bankProfile.safeUntil : now;
      bankProfile.safeUntil = baseTime + P2P_PROTECT_HOURS * 60 * 60 * 1000;
      await Users.setData(senderID, userRaw);

      const safeTime = moment(bankProfile.safeUntil).tz("Asia/Ho_Chi_Minh").format("HH:mm • DD/MM");
      return api.sendMessage(`🛡️ Đã kích hoạt bảo kê đến ${safeTime}.`, threadID, messageID);
    }

    if (command === "thuebaove" || command === "baove" || command === "guard") {
      const packId = Number(args[1]);
      const pack = GUARD_PACKS[packId];
      if (!pack) {
        return api.sendMessage(
          `🏦 DexBank\n1) ${global.config.PREFIX}${this.config.name} thuebaove 1|2|3 — thuê bảo vệ\nVí dụ: ${global.config.PREFIX}${this.config.name} thuebaove 2`,
          threadID,
          messageID
        );
      }

      const bankAccounts = getBankAccounts();
      const userData = getAccountById(bankAccounts, senderID);
      if (!userData) {
        return api.sendMessage(
          `⚠️ Chưa đăng ký. Dùng ${global.config.PREFIX}${this.config.name} register.`,
          threadID,
          messageID
        );
      }

      const paid = await applyCurrencyChange({
        api,
        Currencies,
        amountBig: pack.cost,
        action: "decrease",
        threadID,
        messageID,
        userId: senderID
      });
      if (!paid) return;

      const now = Date.now();
      const baseTime = bankProfile.guardUntil && bankProfile.guardUntil > now ? bankProfile.guardUntil : now;
      bankProfile.guardUntil = baseTime + pack.hours * 60 * 60 * 1000;
      bankProfile.guardPack = packId;
      await Users.setData(senderID, userRaw);

      const guardUntilText = moment(bankProfile.guardUntil).tz("Asia/Ho_Chi_Minh").format("HH:mm • DD/MM");
      return api.sendMessage(
        `🛡️ Đã thuê bảo vệ gói ${packId} (${pack.hours}h). Hiệu lực tới ${guardUntilText}.`,
        threadID,
        messageID
      );
    }

    if (command === "cuop" || command === "cướp" || command === "rob") {
      const targetId = Object.keys(event.mentions || {})[0];
      if (!targetId) {
        return api.sendMessage(
          `⚠️ Dùng: ${global.config.PREFIX}${this.config.name} cuop @tag [amount|all]`,
          threadID,
          messageID
        );
      }
      if (targetId === senderID) {
        return api.sendMessage("⚠️ Không thể tự cướp chính mình.", threadID, messageID);
      }

      const bankAccounts = getBankAccounts();
      const hostAccount = getAccountById(bankAccounts, senderID);
      const targetAccount = getAccountById(bankAccounts, targetId);
      if (!hostAccount) {
        return api.sendMessage(
          `⚠️ Chưa đăng ký. Dùng ${global.config.PREFIX}${this.config.name} register.`,
          threadID,
          messageID
        );
      }
      if (!targetAccount) {
        return api.sendMessage("⚠️ Nạn nhân chưa có tài khoản bank.", threadID, messageID);
      }

      const now = Date.now();
      if (bankProfile.lastRobAt && now - bankProfile.lastRobAt < ROB_COOLDOWN_MS) {
        const remain = Math.ceil((ROB_COOLDOWN_MS - (now - bankProfile.lastRobAt)) / 1000);
        return api.sendMessage(`⚠️ Bạn cần chờ ${remain}s để cướp tiếp.`, threadID, messageID);
      }

      const targetRaw = await Users.getData(targetId);
      if (!targetRaw.data) targetRaw.data = {};
      const targetProfile = ensureBankProfile(targetRaw.data);
      if (targetProfile.lastRobbedAt && now - targetProfile.lastRobbedAt < ROB_TARGET_COOLDOWN_MS) {
        const remain = Math.ceil((ROB_TARGET_COOLDOWN_MS - (now - targetProfile.lastRobbedAt)) / 1000);
        return api.sendMessage(`⚠️ Nạn nhân đang được bảo vệ cooldown (${remain}s).`, threadID, messageID);
      }

      const activeSession = Object.values(global.robSessions || {}).find(
        (session) => session.threadID === threadID && !session.resolved
      );
      if (activeSession) {
        return api.sendMessage("⚠️ Đang có phiên cướp trong nhóm này.", threadID, messageID);
      }

      let requestedLoot = null;
      if (args[2] && args[2] !== "all") {
        const amountInfo = parseAmountToBigInt(args[2]);
        if (amountInfo.error) return api.sendMessage(amountInfo.error, threadID, messageID);
        if (!amountInfo.value) return api.sendMessage("⚠️ Số tiền không hợp lệ.", threadID, messageID);
        requestedLoot = amountInfo.value;
      }

      bankProfile.lastRobAt = now;
      targetProfile.lastRobbedAt = now;
      await Users.setData(senderID, userRaw);
      await Users.setData(targetId, targetRaw);

      const sessionId = `${threadID}_${now}`;
      const session = {
        id: sessionId,
        hostID: senderID,
        targetID: targetId,
        threadID,
        createdAt: now,
        attackers: [senderID],
        messageIDs: [],
        requestedLoot,
        resolved: false,
        timeout: null
      };
      global.robSessions[sessionId] = session;

      const targetName = targetRaw.name || targetId;
      const notice = `🚨 CƯỚP BANK!\nHost: ${senderID}\nTarget: ${targetName}\nReply "join" để tham gia hội đồng (45s).`;

      const sendNotice = async (targetThreadID) => new Promise((resolve) => {
        api.sendMessage(notice, targetThreadID, (error, info) => {
          if (!error && info?.messageID) {
            ensureHandleReply();
            global.client.handleReply.push({
              name: this.config.name,
              messageID: info.messageID,
              author: null,
              type: "robbery",
              sessionId
            });
            session.messageIDs.push(info.messageID);
          }
          resolve();
        });
      });

      let threadTargets = [threadID];
      if (global.Threads?.getAll) {
        try {
          const threads = await global.Threads.getAll();
          threadTargets = threads.map((item) => item.threadID).filter(Boolean);
        } catch (error) {
          threadTargets = [threadID];
        }
      }

      for (const targetThreadID of threadTargets) {
        await sendNotice(targetThreadID);
      }

      session.timeout = setTimeout(() => {
        resolveRobbery({ api, threadID, Users, Currencies, sessionId });
      }, ROB_JOIN_WINDOW_MS);

      return api.sendMessage(
        "✅ Đã tạo phiên cướp. Chờ đồng đội tham gia!",
        threadID,
        messageID
      );
    }

    if (command === "check") {
      const cashRaw = (await Currencies.getData(senderID)).money || 0;
      const cash = String(parseCurrencyToBigInt(cashRaw));
      const bankDebt = String(bankProfile.debt || "0");
      const blackDebt = String(bankProfile.debtUser || "0");
      const isBadDebt = BigInt(bankProfile.debtUser || 0) > 0n || BigInt(bankProfile.debt || 0) > 0n;
      const isProtected = bankProfile.safeUntil && bankProfile.safeUntil > Date.now();
      const statusText = isProtected ? "Bảo kê" : isBadDebt ? "Con nợ" : "An toàn";
      const guardInfo = getGuardInfo(bankProfile);
      const guardText = guardInfo
        ? `\n🛡️ Guard: gói ${guardInfo.pack} tới ${moment(guardInfo.until).tz("Asia/Ho_Chi_Minh").format("HH:mm • DD/MM")}`
        : "";

      const buffer = await buildBankCard({
        name: userRaw.name || senderID,
        cash,
        accountId: senderID,
        bankDebt,
        blackDebt,
        isBadDebt,
        isProtected,
        statusText,
        threadId: threadID
      });

      const fs = require("fs");
      const path = `${__dirname}/cache/dexbank_${senderID}.png`;
      fs.writeFileSync(path, buffer);

      return api.sendMessage(
        {
          body: `🏦 DexBank | ${statusText}\n💵 Tiền mặt: ${formatNumber(cash)}$${guardText}`,
          attachment: fs.createReadStream(path)
        },
        threadID,
        () => {
          if (fs.existsSync(path)) fs.unlinkSync(path);
        },
        messageID
      );
    }

    const helpBuffer = await buildHelpCard({
      prefix: `${global.config.PREFIX}${this.config.name}`,
      threadId: threadID
    });
    const fs = require("fs");
    const helpPath = `${__dirname}/cache/dexbank_help_${threadID}.png`;
    fs.writeFileSync(helpPath, helpBuffer);
    return api.sendMessage(
      { attachment: fs.createReadStream(helpPath) },
      threadID,
      () => {
        if (fs.existsSync(helpPath)) fs.unlinkSync(helpPath);
      },
      messageID
    );
  } catch (error) {
    console.error(error);
    return api.sendMessage("⚠️ Có lỗi xảy ra.", threadID, messageID);
  }
};

module.exports.handleReply = async function ({ api, event, handleReply, Users, Currencies }) {
  const { senderID, threadID, body } = event;

  if (handleReply.type === "robbery") {
    const input = String(body || "").trim().toLowerCase();
    if (input !== "join") return;

    const session = global.robSessions?.[handleReply.sessionId];
    if (!session || session.resolved) return;
    if (session.targetID === senderID) {
      return api.sendMessage("⚠️ Nạn nhân không thể join hội đồng.", threadID);
    }

    const bankAccounts = getBankAccounts();
    const userAccount = getAccountById(bankAccounts, senderID);
    if (!userAccount) {
      return api.sendMessage("⚠️ Bạn chưa đăng ký bank.", threadID);
    }

    if (!session.attackers.includes(senderID)) {
      session.attackers.push(senderID);
    } else {
      return api.sendMessage("⚠️ Bạn đã join hội đồng rồi.", threadID);
    }

    const targetRaw = await Users.getData(session.targetID);
    if (!targetRaw.data) targetRaw.data = {};
    const targetProfile = ensureBankProfile(targetRaw.data);
    const guardInfo = getGuardInfo(targetProfile);
    const successChance = calcRobSuccess({ attackersCount: session.attackers.length, guardInfo });

    const joinerRaw = await Users.getData(senderID);
    const joinerName = joinerRaw.name || senderID;
    return api.sendMessage(`✅ ${joinerName} đã join! Tỉ lệ hiện tại: ${successChance}%.`, threadID);
  }

  if (handleReply.type !== "lendMarket") return;
  if (handleReply.author && senderID !== handleReply.author) return;

  await cleanupLendMarket(Currencies);

  const choice = parseInt(body, 10);
  if (!Number.isFinite(choice)) {
    return api.sendMessage("⚠️ Vui lòng reply số thứ tự gói vay.", threadID);
  }

  const index = choice - 1;
  const loan = global.lendMarket[index];
  if (!loan) return api.sendMessage("⚠️ Gói vay không tồn tại.", threadID);

  if (loan.lenderID === senderID) {
    return api.sendMessage("⚠️ Bạn không thể tự vay gói của mình.", threadID);
  }

  const borrowerRaw = await Users.getData(senderID);
  if (!borrowerRaw.data) borrowerRaw.data = {};
  const bankProfile = ensureBankProfile(borrowerRaw.data);
  if (BigInt(bankProfile.debtUser || 0) > 0n) {
    return api.sendMessage("⚠️ Bạn đang có nợ tín dụng đen, hãy trả trước khi vay tiếp.", threadID);
  }

  const amount = BigInt(loan.amount);

  const totalDebt = amount + (amount * BigInt(Math.floor(loan.interest * 100))) / 10000n;
  const expire = Date.now() + loan.hours * 60 * 60 * 1000;

  const loanGranted = await applyCurrencyChange({
    api,
    Currencies,
    amountBig: amount,
    action: "increase",
    threadID,
    userId: senderID
  });
  if (!loanGranted) return;

  bankProfile.debtUser = String(totalDebt);
  bankProfile.expire = expire;
  bankProfile.lenderID = loan.lenderID;
  if (bankProfile.safeUntil && bankProfile.safeUntil < Date.now()) bankProfile.safeUntil = 0;

  await Users.setData(senderID, borrowerRaw);

  global.lendMarket.splice(index, 1);

  const expireText = moment(expire).tz("Asia/Ho_Chi_Minh").format("HH:mm • DD/MM");
  return api.sendMessage(
    `✅ Nhận gói vay thành công!\n💸 Nhận: ${formatNumber(amount)}$\n💰 Tổng nợ: ${formatNumber(totalDebt)}$\n⏳ Hết hạn: ${expireText}`,
    threadID
  );
};

module.exports.handleEvent = async function ({ api, event, Users, Currencies }) {
  const { senderID, threadID } = event;
  if (!senderID) return;

  const userRaw = await Users.getData(senderID);
  if (!userRaw.data) userRaw.data = {};
  const bankProfile = ensureBankProfile(userRaw.data);

  const debtUser = BigInt(bankProfile.debtUser || 0);
  if (debtUser <= 0n) return;

  const now = Date.now();
  const expire = Number(bankProfile.expire || 0);
  const safeUntil = Number(bankProfile.safeUntil || 0);

  if (safeUntil && safeUntil > now) return;
  if (!expire || now <= expire) return;
  if (bankProfile.lastCollectAt && now - bankProfile.lastCollectAt < COLLECTION_COOLDOWN_MS) return;

  const cash = parseCurrencyToBigInt((await Currencies.getData(senderID)).money || 0);

  if (cash > 0n) {
    const payAmount = cash > debtUser ? debtUser : cash;
    const safeNumber = toSafeNumber(payAmount);
    if (safeNumber === null) {
      console.log(`[DexBank] Thu nợ thất bại (vượt safe integer): ${payAmount}`);
      return;
    }
    await Currencies.decreaseMoney(senderID, safeNumber);
    if (bankProfile.lenderID) {
      await Currencies.increaseMoney(bankProfile.lenderID, safeNumber);
    }
    const remaining = debtUser - payAmount;
    bankProfile.debtUser = String(remaining > 0n ? remaining : 0n);
    if (remaining <= 0n) {
      bankProfile.expire = 0;
      bankProfile.lenderID = "";
    }
    bankProfile.lastCollectAt = now;
    bankProfile.debtLog.push({
      time: now,
      action: "collect",
      amount: String(payAmount),
      remaining: bankProfile.debtUser
    });
    await Users.setData(senderID, userRaw);

    console.log(`[DexBank] Thu nợ ${senderID}: -${payAmount} còn ${bankProfile.debtUser}`);
    await safeSend(
      api,
      `⚠️ Thu hồi nợ tín dụng đen! Đã trừ ${formatNumber(payAmount)}$ từ người vay. Còn lại: ${formatNumber(bankProfile.debtUser)}$.`,
      threadID
    );
    return;
  }

  const penalty = (debtUser * 2n) / 100n;
  bankProfile.debtUser = String(debtUser + penalty);
  bankProfile.lastCollectAt = now;
  bankProfile.debtLog.push({
    time: now,
    action: "penalty",
    amount: String(penalty),
    remaining: bankProfile.debtUser
  });
  await Users.setData(senderID, userRaw);
  console.log(`[DexBank] Phạt nợ ${senderID}: +${penalty} tổng ${bankProfile.debtUser}`);
  await safeSend(
    api,
    `🚨 Con nợ ${senderID} đã quá hạn! Nợ tăng thêm 2% (${formatNumber(penalty)}$).`,
    threadID
  );
};
