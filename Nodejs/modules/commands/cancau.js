const fs = require("fs");
const path = require("path");

module.exports.config = {
    name: "cancau",
    version: "2.5.0",
    hasPermssion: 0,
    credits: "Vanloi",
    description: "Mua, trang bị, xem và ghép cần câu (bao gồm Cần Câu Vô Hạn) + hướng dẫn sử dụng",
    commandCategory: "Trò Chơi",
    usages: "cancau mua/trangbi/ghep/shard",
    cooldowns: 3
};

    const canCauList = {
        "rẻ":      { name: "Cần câu lá",            price: 0,           rate: 0.05 },
        "trung":    { name: "Cần câu trung bình",    price: 5000,        rate: 0.15 },
        "mắc":      { name: "Cần câu mắc",           price: 20000,       rate: 0.3 },
        "xịn":      { name: "Cần câu xịn",           price: 100000,      rate: 0.5 },
        "thần":     { name: "Cần câu thần",          price: 100000000,   rate: 0.7 },
        "siêu":     { name: "Cần câu siêu cấp",      price: 300000000,   rate: 0.9 },
        "vinhcuu":  { name: "Cần câu Vĩnh Cửu",      price: 500000000,   rate: 0.93 },
        "vohan":    { name: "Cần Câu Vô Hạn",        price: 0,           rate: 1.0 } // chỉ ghép
};

// ⭐ 4 MẢNH CẦN CÂU VÔ HẠN
const shardList = [
    { key: "infinity", name: "Mảnh Vô Cực (Infinity Shard)" },
    { key: "everlasting", name: "Mảnh Hằng Cửu (Everlasting Shard)" },
    { key: "supreme", name: "Mảnh Tuyệt Luân (Supreme Shard)" },
    { key: "origin", name: "Mảnh Khởi Nguyên (Origin Shard)" }
];

// Tỉ lệ rơi mảnh khi câu cá (không phải Vô Hạn)
const shardRates = {
    infinity: 0.001,
    everlasting: 0.002,
    supreme: 0.003,
    origin: 0.004
};

// ======================= RANDOM SHARD =======================
function randomShard() {
    const r = Math.random();
    let acc = 0;
    for (let s of shardList) {
        acc += shardRates[s.key];
        if (r < acc) return s;
    }
    return null;
}

// ======================= BỔ TRỢ =======================
function hasAllShards(shards) {
    return shardList.every(s => shards[s.key] > 0);
}

function tryCombineShards(shards) {
    if (Math.random() < 0.8) {
        // thất bại: reset tất cả mảnh
        shardList.forEach(s => shards[s.key] = 0);
        return false;
    }
    // thành công: reset tất cả mảnh
    shardList.forEach(s => shards[s.key] = 0);
    return true;
}

// ======================= MAIN =======================
module.exports.run = async function({ api, event, args, Users, Currencies }) {
    const { senderID, threadID } = event;
    const send = msg => api.sendMessage(msg, threadID);

    // Load user
    let user = await Users.getData(senderID);
    if (!user.data) user.data = {};
    if (!user.data.canCau) user.data.canCau = { owned: ["rẻ"], equip: "rẻ" };
    if (!user.data.shards) user.data.shards = { infinity:0, everlasting:0, supreme:0, origin:0 };

    const action = args[0]?.toLowerCase();
    const type = args[1]?.toLowerCase();

    // ======================= XEM MẢNH =======================
    if (action === "shard") {
        return send(
`🔮 Túi Mảnh Vô Hạn
🟪 ${user.data.shards.infinity} × Mảnh Vô Cực
🟦 ${user.data.shards.everlasting} × Mảnh Hằng Cửu
🟫 ${user.data.shards.supreme} × Mảnh Tuyệt Luân
🟥 ${user.data.shards.origin} × Mảnh Khởi Nguyên
${hasAllShards(user.data.shards) ? "\n🔥 Đủ 4 mảnh! Dùng cancau ghep để ghép Cần Câu Vô Hạn." : ""}`
        );
    }

    // ======================= GHÉP MẢNH =======================
    if (action === "ghep") {
        if (!hasAllShards(user.data.shards))
            return send("⚠️ Bạn chưa đủ 4 mảnh để ghép Cần Câu Vô Hạn!");

        const success = tryCombineShards(user.data.shards);
        if (success) {
            if (!user.data.canCau.owned.includes("vohan")) user.data.canCau.owned.push("vohan");
            await Users.setData(senderID, user);
            return send("🔥 Ghép thành công! Nhận Cần Câu Vô Hạn.");
        } else {
            await Users.setData(senderID, user);
            return send("💥 Ghép thất bại! Toàn bộ mảnh đã mất.");
        }
    }

    // ======================= HIỂN THỊ HƯỚNG DẪN =======================
    if (!action) {
        const equipped = canCauList[user.data.canCau.equip]?.name || "Chưa trang bị";
        const owned = user.data.canCau.owned
            .map(key => canCauList[key]?.name || key)
            .join(", ") || "Chưa sở hữu";
        const available = Object.keys(canCauList)
            .filter(key => key !== "vohan" && !user.data.canCau.owned.includes(key))
            .map(key => {
                const item = canCauList[key];
                return `${item.name} • ${item.price.toLocaleString("vi-VN")}$ • Rate ${item.rate}`;
            })
            .join("\n") || "Không còn cần câu nào để mua";

        return send(
`🎣 Cần câu đang trang bị: ${equipped}

🪝 Cần câu đang có: ${owned}

💰 Cần câu có thể mua:
${available}

💡 Hướng dẫn:
- cancau mua [loại]
- cancau trangbi [loại]
- cancau ghep (khi đủ 4 mảnh)
- cancau shard`
        );
    }

    // ======================= MUA/TRANG BỊ =======================
    if (action !== "mua" && action !== "trangbi") return send("⚠️ Hành động không hợp lệ!");
    if (!type || !canCauList[type]) return send("⚠️ Loại cần câu không tồn tại!");

    // ⭐ MUA
    if (action === "mua") {
        if (type === "vohan") return send("⚠️ Cần Câu Vô Hạn không thể mua, chỉ ghép được!");
        if (user.data.canCau.owned.includes(type)) return send(`⚠️ Bạn đã sở hữu ${canCauList[type].name}!`);

        const money = (await Currencies.getData(senderID)).money;
        if (money < canCauList[type].price) return send(`❌ Không đủ tiền! Giá: ${canCauList[type].price.toLocaleString("vi-VN")}$`);

        await Currencies.decreaseMoney(senderID, canCauList[type].price);
        user.data.canCau.owned.push(type);
        await Users.setData(senderID, user);

        return send(`✅ Mua thành công: ${canCauList[type].name} • Rate ${canCauList[type].rate}`);
    }

    // ⭐ TRANG BỊ
    if (action === "trangbi") {
        if (!user.data.canCau.owned.includes(type)) return send(`⚠️ Bạn chưa sở hữu ${canCauList[type].name}!`);
        user.data.canCau.equip = type;
        await Users.setData(senderID, user);
        return send(`✅ Đã trang bị: ${canCauList[type].name} • Rate ${canCauList[type].rate}`);
    }
};
