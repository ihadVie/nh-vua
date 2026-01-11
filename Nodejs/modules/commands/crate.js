const fs = require("fs");

module.exports.config = {
  name: "crate",
  version: "1.7.0",
  hasPermssion: 0,
  credits: "Vanloi",
  description: "Quản lý túi đồ, mảnh ghép và giao dịch cá",
  commandCategory: "Trò Chơi",
  usages: "crate [shard/give]",
  cooldowns: 3
};

// Hàm tính Max Slot đồng bộ với cauca.js
function calcMaxSlot(level, equip) {
    let max = 20; // Base
    if (level >= 15) max += 5;
    if (level >= 20) max += 5;
    if (level > 20) max += Math.floor((level - 20) / 5) * 5;
    if (equip === "vohan") max += 5;
    return max;
}

module.exports.run = async function({ api, event, args, Users, Currencies }) {
  const { senderID, threadID, mentions } = event;
  const send = msg => api.sendMessage(msg, threadID);

  let userRaw = await Users.getData(senderID);
  if (!userRaw.data) userRaw.data = {};
  let user = userRaw.data;

  // Khởi tạo shards
  if (!user.shards) user.shards = { infinity: 0, everlasting: 0, supreme: 0, origin: 0 };
  if (!user.fishInventory) user.fishInventory = [];

  // =========================
  // 🔮 XEM SHARDS
  // =========================
  if (args[0]?.toLowerCase() === "shard") {
    return send(
`🔮 TÚI MẢNH VÔ HẠN
-------------------
🟪 ${user.shards.infinity} × Mảnh Vô Cực
🟦 ${user.shards.everlasting} × Mảnh Hằng Cửu
🟫 ${user.shards.supreme} × Mảnh Tuyệt Luân
🟥 ${user.shards.origin} × Mảnh Khởi Nguyên`
    );
  }

  // =========================
  // 🐟 LỆNH TẶNG CÁ (Dùng trực tiếp)
  // =========================
  if (args[0]?.toLowerCase() === "give") {
    const index = parseInt(args[1]) - 1;
    const mentionID = Object.keys(mentions)[0];

    if (user.fishInventory.length === 0) return send("⚠️ Bạn không có cá để tặng.");
    if (isNaN(index) || index < 0 || index >= user.fishInventory.length) return send("⚠️ Số thứ tự cá không đúng.");
    if (!mentionID) return send("⚠️ Hãy tag người muốn tặng cá.");

    let receiverRaw = await Users.getData(mentionID);
    if (!receiverRaw.data) receiverRaw.data = {};
    if (!receiverRaw.data.fishInventory) receiverRaw.data.fishInventory = [];

    const recMaxSlot = calcMaxSlot(receiverRaw.data.fishLevel || 1, receiverRaw.data.canCau?.equip || "rẻ");
    if (receiverRaw.data.fishInventory.length >= recMaxSlot) return send("⚠️ Kho của người nhận đã đầy.");

    const fish = user.fishInventory.splice(index, 1)[0];
    receiverRaw.data.fishInventory.push(fish);

    await Users.setData(senderID, userRaw);
    await Users.setData(mentionID, receiverRaw);

    return send(`🎁 Đã tặng [${fish.name}] cho ${receiverRaw.name}`);
  }

  // =========================
  // 🐟 XEM KHO CÁ
  // =========================
  if (user.fishInventory.length === 0) return send("📦 Kho cá của đạo hữu đang trống rỗng.");

  const currentMax = calcMaxSlot(user.fishLevel || 1, user.canCau?.equip || "rẻ");

  const fishList = user.fishInventory
    .map((f, i) => `${i + 1}. ${f.name} [${f.rarity.toUpperCase()}] - ${f.price.toLocaleString()}$`)
    .join("\n");

  const msg = 
`🐟 KHO CÁ CỦA: ${userRaw.name}
-------------------------
${fishList}
-------------------------
📦 Sức chứa: ${user.fishInventory.length}/${currentMax}
💰 Tổng giá trị: ${user.fishInventory.reduce((a, b) => a + b.price, 0).toLocaleString()}$

💡 HƯỚNG DẪN:
- Reply [all] để bán hết.
- Reply [số] để bán cá (VD: 1 3 5).
- Reply [give số @tag] để tặng cá.`;

  api.sendMessage(msg, threadID, (err, info) => {
    global.client.handleReply.push({
      name: this.config.name,
      messageID: info.messageID,
      author: senderID
    });
  }, event.messageID);
};

// =====================================
// 📌 HANDLE REPLY
// =====================================
module.exports.handleReply = async function({ api, event, handleReply, Users, Currencies }) {
  const { senderID, threadID, body } = event;
  if (senderID != handleReply.author) return;

  let userRaw = await Users.getData(senderID);
  let user = userRaw.data;

  if (!user.fishInventory || user.fishInventory.length === 0) return;

  const input = body.toLowerCase().trim();

  // BÁN TOÀN BỘ
  if (input === "all") {
    let total = user.fishInventory.reduce((a, b) => a + b.price, 0);
    user.fishInventory = [];
    await Users.setData(senderID, userRaw);
    await Currencies.increaseMoney(senderID, total);
    return api.sendMessage(`💰 Bán toàn bộ cá thành công! Nhận về: ${total.toLocaleString()}$`, threadID);
  }

  // TẶNG CÁ (Reply)
  if (input.startsWith("give")) {
    const args = input.split(" ");
    const index = parseInt(args[1]) - 1;
    const mentionID = Object.keys(event.mentions)[0];

    if (isNaN(index) || !mentionID || index < 0 || index >= user.fishInventory.length) {
        return api.sendMessage("⚠️ Sai cú pháp. Ví dụ: give 1 @tag", threadID);
    }

    let receiverRaw = await Users.getData(mentionID);
    if (!receiverRaw.data) receiverRaw.data = {};
    if (!receiverRaw.data.fishInventory) receiverRaw.data.fishInventory = [];

    const recMaxSlot = calcMaxSlot(receiverRaw.data.fishLevel || 1, receiverRaw.data.canCau?.equip || "rẻ");
    if (receiverRaw.data.fishInventory.length >= recMaxSlot) return api.sendMessage("⚠️ Kho người nhận đã đầy.", threadID);

    const fish = user.fishInventory.splice(index, 1)[0];
    receiverRaw.data.fishInventory.push(fish);

    await Users.setData(senderID, userRaw);
    await Users.setData(mentionID, receiverRaw);
    return api.sendMessage(`🎁 Đã tặng [${fish.name}] cho ${receiverRaw.name}`, threadID);
  }

  // BÁN THEO SỐ THỨ TỰ
  const indices = input.split(/\s+/)
    .map(n => parseInt(n) - 1)
    .filter(n => !isNaN(n) && n >= 0 && n < user.fishInventory.length);

  if (indices.length === 0) return api.sendMessage("⚠️ Vui lòng chọn số thứ tự hợp lệ.", threadID);

  // Sắp xếp giảm dần để splice không bị sai index
  indices.sort((a, b) => b - a);
  let totalMoney = 0;
  let soldCount = 0;

  for (let i of indices) {
    const f = user.fishInventory.splice(i, 1)[0];
    totalMoney += f.price;
    soldCount++;
  }

  await Users.setData(senderID, userRaw);
  await Currencies.increaseMoney(senderID, totalMoney);
  return api.sendMessage(`💰 Đã bán ${soldCount} con cá. Thu về: ${totalMoney.toLocaleString()}$`, threadID);
};