"use strict";

module.exports = function (api) {
  return function sendMessageV2(msg, threadID, callback) {
    if (typeof callback !== "function") callback = () => {};

    // Chuẩn bị nội dung
    const body = typeof msg === "string" ? msg : msg.body;
    const effectID = msg.message_effect_id || "";

    // Sử dụng chính api.sendMessage của DongDev nhưng truyền tham số thứ 4
    // Trong bản FCA-Unofficial, tham số thứ 4 thường là tin nhắn trả lời (reply)
    // Nhưng nếu truyền object, nó sẽ hiểu là Metadata
    return api.sendMessage({
      body: body,
      message_effect_id: effectID
    }, threadID, callback);
  };
};