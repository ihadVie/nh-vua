/**
 * INDEX.JS - DEXSKILL BOT MONITOR
 */

const { spawn } = require("child_process");
const path = require("path");
const logger = require("./utils/log");

function startBot(message) {
    if (message) console.log(message);

    const child = spawn("node", ["--expose-gc", "main.js"], {
        cwd: __dirname,
        stdio: "inherit",
        shell: true
    });

    child.on("close", (codeExit) => {
        if (codeExit !== 0) {
            console.log("Bot gặp lỗi, sẽ khởi động lại sau 5 giây...");
            setTimeout(() => startBot("Bot đang khởi động lại..."), 5000);
        } else {
            console.log("Bot đã dừng lại.");
        }
    });

    child.on("error", (error) => {
        logger(`Đã xảy ra lỗi khi khởi động Bot: ${error}`, "error");
        setTimeout(() => startBot("Bot đang khởi động lại..."), 5000);
    });
}

/**
 * TẠO SERVER UPTIME (Giúp Bot không bị ngủ trên Replit)
 */
const express = require("express");
const app = express();
const port = process.env.PORT || 8080;

app.get("/", (req, res) => {
    res.send("Dexskill Bot is running!");
});

app.listen(port, () => {
    console.log(`[ UPTIME ] » Máy chủ đang chạy tại port: ${port}`);
});

// Bắt đầu quy trình chạy Bot
console.log("[ DEXSKILL ] » Đang kiểm tra hệ thống...");
startBot();

/**
 * AUTO CLEAN CACHE (Dọn dẹp tệp rác để tránh đầy bộ nhớ Replit)
 */
setInterval(() => {
    try {
        const cachePath = path.join(__dirname, "modules", "commands", "cache");
        if (require("fs").existsSync(cachePath)) {
            const files = require("fs").readdirSync(cachePath);
            files.forEach((file) => {
                // Giữ lại các font ttf, chỉ xóa ảnh tạm
                if (!file.endsWith(".ttf")) {
                    require("fs").unlinkSync(path.join(cachePath, file));
                }
            });
            console.log("[ CLEANER ] » Đã dọn dẹp bộ nhớ đệm.");
        }
    } catch (e) {
        // Bỏ qua lỗi nếu thư mục trống
    }
}, 1000 * 60 * 60); // Dọn dẹp mỗi 1 giờ
