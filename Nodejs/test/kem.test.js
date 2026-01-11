const assert = require("assert");
const path = require("path");

const openaiPath = path.join(__dirname, "..", "src", "ai", "openaiClient.js");
require.cache[require.resolve(openaiPath)] = {
  exports: {
    chat: async (model) => `model:${model}`,
    chatWithTools: async ({ model }) => ({
      choices: [{ message: { content: `agent:${model}` } }]
    }),
    image: async () => ({ url: "https://example.com/image.png", b64_json: null })
  }
};

const { kemRouter, isImageRequest, shouldRespond, isAdmin } = require("../src/ai/kemRouter");

const baseEvent = {
  body: "",
  senderID: "100",
  threadID: "200",
  messageID: "m1",
  mentions: {}
};

const fakeApi = {
  sendTyping: () => {},
  setMessageReaction: () => {}
};

process.env.MODEL_ADMIN = "gpt-5.2";
process.env.MODEL_MEMBER = "gpt-4.1-nano";
process.env.IMAGE_MODEL = "gpt-image-1.5";
process.env.ADMIN_IDS = "999";

async function run() {
  assert.strictEqual(shouldRespond({ event: { ...baseEvent, body: "hello" }, botId: "bot" }), false);
  assert.strictEqual(isImageRequest("kem vẽ sticker"), true);
  assert.strictEqual(isImageRequest("ảnh này đẹp"), false);

  const memberEvent = { ...baseEvent, body: "kem ơi hôm nay sao" };
  const memberRes = await kemRouter({ api: fakeApi, event: memberEvent, botId: "bot" });
  assert.strictEqual(memberRes.type, "text");
  assert.strictEqual(memberRes.text, "model:gpt-4.1-nano");

  const adminEvent = { ...baseEvent, body: "kem viết command", senderID: "999" };
  const adminRes = await kemRouter({ api: fakeApi, event: adminEvent, botId: "bot" });
  assert.strictEqual(adminRes.type, "text");
  assert.strictEqual(adminRes.text, "model:gpt-5.2");
  assert.strictEqual(isAdmin(adminEvent.senderID), true);

  const imageEvent = { ...baseEvent, body: "kem vẽ sticker" };
  const imageRes = await kemRouter({ api: fakeApi, event: imageEvent, botId: "bot" });
  assert.strictEqual(imageRes.type, "image");
  assert.ok(imageRes.url);

  const visionEvent = {
    ...baseEvent,
    body: "kem ơi ảnh này là gì",
    messageReply: { senderID: "123", attachments: [{ type: "photo", url: "https://example.com/a.png" }] }
  };
  const visionRes = await kemRouter({ api: fakeApi, event: visionEvent, botId: "bot" });
  assert.strictEqual(visionRes.type, "text");

  const agentEvent = { ...baseEvent, body: "kem agent tạo module", senderID: "999" };
  const agentRes = await kemRouter({ api: fakeApi, event: agentEvent, botId: "bot" });
  assert.strictEqual(agentRes.type, "text");
  assert.strictEqual(agentRes.text, "agent:gpt-5.2");

  console.log("kem.test.js passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
