const getCommandPrefix = (config) => config.PREFIX || "-";

const hasPermission = (senderID, command, config) => {
    const permission = command?.config?.hasPermssion ?? 0;
    const admins = config.ADMINBOT || [];
    const supporters = config.NDH || [];

    if (permission === 0) return true;
    if (permission === 1) return admins.includes(senderID);
    if (permission === 2) return admins.includes(senderID) || supporters.includes(senderID);
    return false;
};

const isBanned = (senderID, threadID, config) => {
    const bannedUsers = config.BANNED_USERS || [];
    const bannedThreads = config.BANNED_THREADS || [];
    return bannedUsers.includes(senderID) || bannedThreads.includes(threadID);
};

module.exports = async ({ api, event, Users, Threads, Currencies, config }) => {
    const { body, senderID, threadID, messageID } = event;
    const isGroup = event.isGroup ?? threadID !== senderID;

    if (!body || !senderID) return;

    if (!config.allowInbox && !isGroup) return;

    if (isBanned(senderID, threadID, config)) return;

    const prefix = getCommandPrefix(config);
    if (!body.startsWith(prefix)) return;

    const args = body.slice(prefix.length).trim().split(/\s+/).filter(Boolean);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    const command = global.commands.get(commandName);
    if (!command) return;

    if ((config.commandDisabled || []).includes(commandName)) {
        return api.sendMessage(`Lệnh ${commandName} đang bị tắt.`, threadID, messageID);
    }

    if (!hasPermission(senderID, command, config)) {
        return api.sendMessage("Bạn không có quyền sử dụng lệnh này.", threadID, messageID);
    }

    if (global.client?.accountStatus === "checkpoint") {
        return api.sendMessage("⚠️ Bot đang gặp checkpoint hoặc yêu cầu đăng nhập lại.", threadID, messageID);
    }

    const now = Date.now();
    const cooldownSeconds = command?.config?.cooldowns ?? 3;
    const cooldownKey = `${senderID}_${commandName}`;

    if (global.cooldowns.has(cooldownKey)) {
        const expirationTime = global.cooldowns.get(cooldownKey) + cooldownSeconds * 1000;
        if (now < expirationTime) {
            const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
            return api.sendMessage(
                `Vui lòng chờ ${timeLeft} giây trước khi dùng lại lệnh này.`,
                threadID,
                messageID
            );
        }
    }

    global.cooldowns.set(cooldownKey, now);

    try {
        await command.run({
            api,
            event,
            args,
            Users,
            Threads,
            Currencies,
            config,
            prefix
        });
    } catch (error) {
        const errorMessage = error?.message || String(error);
        api.sendMessage(`Lỗi khi chạy lệnh: ${errorMessage}`, threadID, messageID);
    }
};
