module.exports = async ({ api, event, Users, Threads, Currencies }) => {
    const { messageReply } = event;
    if (!messageReply || !global.client?.handleReply?.length) return;

    const messageID = messageReply.messageID;
    const index = global.client.handleReply.findIndex(
        (handle) => handle.messageID === messageID
    );

    if (index === -1) return;

    const handleReply = global.client.handleReply[index];
    const command = global.commands.get(handleReply.name);

    if (!command?.handleReply) return;

    try {
        await command.handleReply({
            api,
            event,
            handleReply,
            Users,
            Threads,
            Currencies
        });
    } catch (error) {
        const errorMessage = error?.message || String(error);
        api.sendMessage(`Lỗi xử lý phản hồi: ${errorMessage}`, event.threadID, event.messageID);
    }

    if (!handleReply.keep) {
        global.client.handleReply.splice(index, 1);
    }
};
