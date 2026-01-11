const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");

module.exports.config = {
  name: "tx",
  version: "0.0.3",
  hasPermssion: 0,
  credits: "Vanloi",
  description: "Chơi tài xỉu ",
  commandCategory: "Trò Chơi",
  usages: "tx tài/xỉu, b3gn, b2gn, cuocso, số tiền",
  cooldowns: 10
};

// Hệ số thắng
var tilethang = 1;
var tilethangb3dn = 5;
var tilethangb2dn = 3;
var haisogiong = 2;
var basogiong = 2;
var motsogiong = 1;

function replace(int) {
  return int.toString().replace(/(.)(?=(\d{3})+$)/g, '$1,');
}

function getImagePath(number) {
  return path.join(__dirname, "data", "taixiu", `${number}.jpeg`);
}

function parseBetAmount(value) {
  if (!value) return NaN;
  if (typeof value === "number") return value;
  const normalized = String(value).trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)(qi|q|t|b|m|k)?$/);
  if (!match) return NaN;
  const amount = parseFloat(match[1]);
  const suffix = match[2];
  const multipliers = {
    k: 1e3,
    m: 1e6,
    b: 1e9,
    t: 1e12,
    q: 1e15,
    qi: 1e18
  };
  const multiplier = suffix ? multipliers[suffix] : 1;
  return Math.round(amount * multiplier);
}

module.exports.run = async function ({ event, api, Currencies, Users, args }) {
  try {
    const { increaseMoney, decreaseMoney } = Currencies;
    const { threadID, messageID, senderID } = event;
    const { sendMessage } = api;
    const name = await Users.getNameUser(senderID);
    const money = (await Currencies.getData(senderID)).money;
    const bet = (args[1] === "all" ? money : parseBetAmount(args[1]));
    const input = args[0];
    const tong = parseInt(args[2]);

    if (!input) return sendMessage("❌ Bạn chưa nhập tài/xỉu/b3gn/b2gn/cuocso", threadID, messageID);
    if (!bet || isNaN(bet) || bet < 1000) return sendMessage("❌ Tiền cược phải từ 1000 trở lên", threadID, messageID);
    if (bet > money) return sendMessage("❌ Bạn không đủ tiền để cược", threadID, messageID);

    const inputMap = {
      "tài": "tài", "Tài": "tài", "-t": "tài",
      "xỉu": "xỉu", "Xỉu": "xỉu", "-x": "xỉu",
      "b3gn": "b3gn", "bbgn": "b3gn", "btgn": "b3gn",
      "b2gn": "b2gn", "bdgn": "b2gn", "bhgn": "b2gn",
      "cuocso": "cuocso", "cs": "cuocso"
    };

    const choose = inputMap[input];
    if (!choose) return sendMessage("❌ Sai tag", threadID, messageID);
    if (choose === 'cuocso' && (tong < 1 || tong > 6)) return sendMessage("❌ Số chọn không hợp lệ", threadID, messageID);

    const number = [];
    const img = [];

    for (let i = 0; i < 3; i++) {
      const n = Math.floor(Math.random() * 6 + 1);
      number.push(n);
      const imagePath = getImagePath(n);
      if (fs.existsSync(imagePath)) img.push(fs.createReadStream(imagePath));
    }

    const total = number.reduce((a, b) => a + b, 0);
    let ans, result, mn, mne;

    if (choose === 'cuocso') {
      const count = number.filter(n => n === tong).length;
      if (count === 3) {
        result = 'win'; mn = bet * basogiong;
      } else if (count === 2) {
        result = 'win'; mn = bet * haisogiong;
      } else if (count === 1) {
        result = 'win'; mn = bet * motsogiong;
      } else {
        result = 'lose'; mn = bet;
      }
      ans = tong;

    } else if (choose === 'b3gn') {
      if (number[0] === number[1] && number[1] === number[2]) {
        result = 'win'; mn = bet * tilethangb3dn;
        ans = "bộ ba đồng nhất";
      } else {
        result = 'lose'; mn = bet;
        ans = (total >= 11) ? "tài" : "xỉu";
      }

    } else if (choose === 'b2gn') {
      const isB2 = number[0] === number[1] || number[1] === number[2] || number[0] === number[2];
      if (isB2) {
        result = 'win'; mn = bet * tilethangb2dn;
        ans = "bộ hai đồng nhất";
      } else {
        result = 'lose'; mn = bet;
        ans = (total >= 11) ? "tài" : "xỉu";
      }

    } else {
      const isTriple = number[0] === number[1] && number[1] === number[2];
      ans = isTriple ? "bộ ba đồng nhất" : (total >= 11 ? "tài" : "xỉu");
      if (isTriple || ans !== choose) {
        result = 'lose'; mn = bet;
      } else {
        result = 'win'; mn = bet * tilethang;
      }
    }

    mne = (result === 'win') ? money + mn : money - mn;
    if (result === 'win') increaseMoney(senderID, mn);
    else decreaseMoney(senderID, mn);

    const msg = `🎲 𝗧𝗔̀𝗜 𝗫𝗜̉𝗨 🎲
[👤] Người chơi: ${name}
[🎯] Chọn: ${choose}
[🎲] Tổng: ${total} (${ans})
[💵] Đặt cược: ${replace(bet)}$
[📊] Kết quả: ${result === 'win' ? 'Thắng' : 'Thua'}
[💰] Số dư hiện tại: ${replace(mne)}$`;

    return sendMessage({ body: msg, attachment: img }, threadID, messageID);

  } catch (e) {
    console.error(e);
    api.sendMessage("❌ Đã xảy ra lỗi", event.threadID, event.messageID);
  }
};
