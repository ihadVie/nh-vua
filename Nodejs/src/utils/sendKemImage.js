const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const writeImageFile = async ({ url, b64_json, outputDir }) => {
  ensureDir(outputDir);
  const fileName = `kem_${crypto.randomUUID()}.png`;
  const filePath = path.join(outputDir, fileName);

  if (b64_json) {
    const buffer = Buffer.from(b64_json, "base64");
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download image failed: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
  return filePath;
};

const sendKemImage = async ({ api, threadID, messageID, payload }) => {
  const outputDir = path.join(__dirname, "..", "..", "cache");
  const filePath = await writeImageFile({
    url: payload.url,
    b64_json: payload.b64_json,
    outputDir
  });

  return new Promise((resolve) => {
    api.sendMessage(
      { attachment: fs.createReadStream(filePath) },
      threadID,
      () => {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        resolve();
      },
      messageID
    );
  });
};

module.exports = {
  sendKemImage
};
