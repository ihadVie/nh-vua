module.exports.config = {
  name: "pay",
  version: "1.0.1",
  hasPermssion: 0,
  credits: "Vanloi",
  description: "Chuyển tiền của bản thân cho ai đó",
  commandCategory: "Nhóm",
  usages: "pay [Tag | Reply] [Coins]",
  cooldowns: 5,
};

module.exports.run = async ({ event, api, Currencies, args, Users }) => {
  let { threadID, messageID, senderID, messageReply, mentions } = event;
  let receiveID;
  let amount;

  const parseAmount = (value) => {
    if (!value) return NaN;
    const normalized = String(value).trim().toLowerCase();
    const match = normalized.match(/^(\d+(?:\.\d+)?)(qi|q|t|b|m|k)?$/);
    if (!match) return NaN;
    const base = parseFloat(match[1]);
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
    return Math.round(base * multiplier);
  };

  if (messageReply) {
    receiveID = messageReply.senderID;
    amount = parseAmount(args[0]);
  } else if (Object.keys(mentions).length > 0) {
    receiveID = Object.keys(mentions)[0];
    const nameLength = mentions[receiveID].trim().split(/\s+/).length;
    amount = parseAmount(args[nameLength]);
  } else {
    return api.sendMessage('Cách dùng:\n»dùng pay + tag + số tiền\n»dùng pay + reply + số tiền', threadID, messageID);
  }

  if (isNaN(amount) || amount <= 0) {
    return api.sendMessage(`»Số lượng coins phải là một số và lớn hơn 0.`, threadID, messageID);
  }

  const senderBalance = (await Currencies.getData(senderID)).money || 0;
  if (amount > senderBalance) {
    return api.sendMessage(`»Bạn lấy đâu ra nhiều tiền như thế?`, threadID, messageID);
  }

  await Currencies.decreaseMoney(senderID, amount);
  await Currencies.increaseMoney(receiveID, amount);

  const namePay = await Users.getNameUser(receiveID);
  return api.sendMessage(`Đã chuyển thành công ${amount}$ cho ${namePay}.`, threadID, messageID);
}
