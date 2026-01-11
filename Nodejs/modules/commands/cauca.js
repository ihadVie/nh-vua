const fs = require("fs");
const path = require("path");

module.exports.config = {
    name: "cau",
    version: "4.5.0",
    hasPermssion: 0,
    credits: "Vanloi",
    description: "Câu cá giải trí có hiệu ứng typing và PVP",
    commandCategory: "Trò Chơi",
    usages: "cau",
    cooldowns: 20
};

// ==========================
// KHỞI TẠO BIẾN TOÀN CỤC
// ==========================
if (!global.fishPVP) global.fishPVP = {};

// ==========================
// LOAD DỮ LIỆU CÁ
// ==========================
const fishDataPath = path.join(__dirname, "fishdata.json");
if (!fs.existsSync(fishDataPath)) {
    fs.writeFileSync(fishDataPath, JSON.stringify([
        { "name": "Cá Rô", "rarity": "common", "price": 10, "chance": 70 },
        { "name": "Cá Chép", "rarity": "uncommon", "price": 50, "chance": 50 },
        { "name": "Cá Thu", "rarity": "rare", "price": 200, "chance": 30 },
        { "name": "Cá Mập", "rarity": "legendary", "price": 2000, "chance": 5 }
    ], null, 4));
}
const fishData = JSON.parse(fs.readFileSync(fishDataPath));

const cooldownTime = 20 * 1000; 
const BASE_MAX_SLOT = 20;

const canCauList = {
    "rẻ": { name: "Cần câu rẻ", rate: 0.2 },
    "trung": { name: "Cần câu trung bình", rate: 0.4 },
    "mắc": { name: "Cần câu mắc", rate: 0.7 },
    "xịn": { name: "Cần câu xịn", rate: 0.7 },
    "thần": { name: "Cần câu thần", rate: 0.8 },
    "siêu": { name: "Cần câu siêu cấp", rate: 0.9 },
    "vinhcuu": { name: "Cần câu Vĩnh Cửu", rate: 0.9 },
    "vohan": { name: "Cần câu Vô Hạn", rate: 1.0 }
};

const shardList = [
    { key: "infinity", name: "Mảnh Vô Cực", rate: 0.001 },
    { key: "everlasting", name: "Mảnh Hằng Cửu", rate: 0.002 },
    { key: "supreme", name: "Mảnh Tuyệt Luân", rate: 0.003 },
    { key: "origin", name: "Mảnh Khởi Nguyên", rate: 0.004 }
];

const fishSkins = [
    { count: 200, name: "Skin Thường" },
    { count: 500, name: "Skin Lửa Tuyệt Luân" },
    { count: 1500, name: "Skin Băng Hàng" },
    { count: 4000, name: "Skin Rồng" }
];

const expByRarity = {
    common: 1, uncommon: 3, rare: 5, epic: 15,
    legendary: 40, mythical: 60, divine: 70, secret: 100
};

// ==========================
// HÀM HỖ TRỢ LOGIC
// ==========================
function randomFish(canType, bonus = 0) {
    const rate = (canCauList[canType]?.rate || 0.2) + bonus;
    const r = Math.random();
    let pool = r < rate 
        ? fishData.filter(f => ["rare","epic","legendary","mythical","divine","secret"].includes(f.rarity))
        : fishData.filter(f => ["common","uncommon"].includes(f.rarity));

    if (pool.length === 0) pool = fishData;

    let total = pool.reduce((a, b) => a + (b.chance || 1), 0);
    let rand = Math.random() * total;
    for (let f of pool) {
        if (rand < (f.chance || 1)) return f;
        rand -= (f.chance || 1);
    }
    return pool[0];
}

function randomShard() {
    const r = Math.random();
    let acc = 0;
    for (let s of shardList) {
        acc += s.rate;
        if (r < acc) return s;
    }
    return null;
}

function calculateLevel(exp) {
    return Math.floor(0.1 * Math.sqrt(exp)) + 1;
}

function calcMaxSlot(level, equip) {
    let max = BASE_MAX_SLOT;
    if (level >= 15) max += 5;
    if (level >= 20) max += 5;
    if (level > 20) max += Math.floor((level - 20) / 5) * 5;
    if (equip === "vohan") max += 5;
    return max;
}

// ==========================
// MAIN FUNCTION
// ==========================
module.exports.run = async function({ api, event, Users, Currencies }) {
    const { senderID, threadID } = event;
    const send = (msg, mentions = []) => api.sendMessage({ body: msg, mentions }, threadID);

    // 1. Lấy và khởi tạo dữ liệu người dùng
    let userRaw = await Users.getData(senderID) || { data: {}, name: "Người dùng" };
    if (!userRaw.data) userRaw.data = {};
    let user = userRaw.data;

    const initData = {
        fishInventory: [],
        canCau: { owned: ["rẻ"], equip: "rẻ" },
        shards: { infinity: 0, everlasting: 0, supreme: 0, origin: 0 },
        fishExp: 0,
        fishLevel: 1,
        fishCooldown: 0,
        fishCount: 0,
        fishHistory: [],
        fishSkin: "Không có",
        bait: null
    };

    for (let key in initData) {
        if (user[key] === undefined) user[key] = initData[key];
    }

    // 2. Kiểm tra Cooldown
    if (user.fishCooldown && user.fishCooldown > Date.now()) {
        let remain = Math.ceil((user.fishCooldown - Date.now()) / 1000);
        return send(`⏳ Hãy đợi ${remain}s để chuẩn bị mồi câu tiếp theo.`);
    }

    // 3. Kiểm tra trang bị & kho
    const equip = user.canCau.equip;
    const MAX_SLOT = calcMaxSlot(user.fishLevel, equip);
    if (user.fishInventory.length >= MAX_SLOT)
        return send(`⚠️ Kho cá của bạn đã đầy (${user.fishInventory.length}/${MAX_SLOT}). Hãy đi bán bớt cá!`);

    // 4. Hiệu ứng Typing & Thả mồi
    if (typeof api.sendTyping === "function") {
        api.sendTyping(threadID, true, { duration: 3000 });
    }
    send(`🎣 ${userRaw.name} đang thả mồi bằng ${canCauList[equip]?.name || "Cần câu cũ"}...`);
    await new Promise(res => setTimeout(res, 3000));

    // 5. Logic PVP
    const pvp = global.fishPVP?.[threadID];
    if (pvp && (senderID === pvp.fromID || senderID === pvp.toID)) {
        if (!pvp.fishResult) pvp.fishResult = {};
        if (senderID === pvp.fromID) pvp.fishResult.from = true;
        if (senderID === pvp.toID) pvp.fishResult.to = true;
    }

    // 6. Bonus Mồi (Bait)
    let bonus = 0;
    if (user.bait) {
        if (user.bait.fail > 0 && Math.random() < user.bait.fail) {
            user.bait = null;
            await Users.setData(senderID, userRaw);
            return send(`❌ Cá đã cắn câu nhưng làm đứt mồi! Bạn không câu được gì.`);
        }
        bonus = user.bait.bonus || 0;
    }

    // 7. Thực hiện Câu cá
    const fish = randomFish(equip, bonus);
    user.fishInventory.push(fish);
    user.fishHistory.push(fish);

    const gainedExp = expByRarity[fish.rarity] || 1;
    user.fishExp += gainedExp;
    const oldLevel = user.fishLevel;
    user.fishLevel = calculateLevel(user.fishExp);
    user.fishCount += 1;
    user.fishCooldown = Date.now() + cooldownTime;
    user.bait = null;

    // 8. Tỉ lệ rơi mảnh (Shard)
    let shardDrop = (equip !== "vohan") ? randomShard() : null;
    if (shardDrop) user.shards[shardDrop.key] = (user.shards[shardDrop.key] || 0) + 1;

    // 9. Cập nhật Skin
    for (let skin of [...fishSkins].reverse()) {
        if (user.fishCount >= skin.count) {
            user.fishSkin = skin.name;
            break;
        }
    }

    // 10. Lưu dữ liệu
    await Users.setData(senderID, userRaw);

    // 11. Gửi kết quả
    let resultMsg = `🐟 ${userRaw.name} câu được ${fish.name} (${fish.price}$)\n` +
                    `⚡ Level: ${user.fishLevel} | EXP: ${user.fishExp} (+${gainedExp})\n` +
                    `✨ Skin: ${user.fishSkin}\n` +
                    `📦 Kho: ${user.fishInventory.length}/${MAX_SLOT}`;

    if (shardDrop) resultMsg += `\n🎁 Bạn nhận được 1 ${shardDrop.name}!`;
    if (user.fishLevel > oldLevel) resultMsg += `\n🎉 Chúc mừng! Bạn đã đạt Level ${user.fishLevel}!`;

    send(resultMsg, [{ tag: userRaw.name, id: senderID }]);

    // 12. Xử lý kết quả PVP cuối cùng
    if (pvp && pvp.fishResult?.from && pvp.fishResult?.to) {
        const fromData = (await Users.getData(pvp.fromID)) || { data: { fishInventory: [] } };
        const toData = (await Users.getData(pvp.toID)) || { data: { fishInventory: [] } };

        const fFish = fromData.data.fishInventory.slice(-1)[0];
        const tFish = toData.data.fishInventory.slice(-1)[0];

        const fVal = expByRarity[fFish?.rarity] || 0;
        const tVal = expByRarity[tFish?.rarity] || 0;

        let winnerID, loserID;
        if (fVal > tVal) { winnerID = pvp.fromID; loserID = pvp.toID; }
        else if (tVal > fVal) { winnerID = pvp.toID; loserID = pvp.fromID; }

        let bet = pvp.bet || 0;
        if (winnerID) {
            await Currencies.increaseMoney(winnerID, bet);
            await Currencies.decreaseMoney(loserID, bet);
        }

        let pvpMsg = `⚔️ KẾT QUẢ ĐỐI ĐẦU ⚔️\n------------------\n`;
        if (winnerID) {
            const wName = winnerID === pvp.fromID ? fromData.name : toData.name;
            const lName = loserID === pvp.fromID ? fromData.name : toData.name;
            pvpMsg += `🏆 Người thắng: ${wName} (+${bet}$)\n💀 Người thua: ${lName} (-${bet}$)`;
        } else {
            pvpMsg += `🤝 Kết quả hòa! Cả hai đều câu được độ hiếm ngang nhau.`;
        }

        setTimeout(() => send(pvpMsg), 1000);
        delete global.fishPVP[threadID];
    }
};