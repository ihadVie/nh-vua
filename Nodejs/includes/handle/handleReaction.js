module.exports = async ({ api, event, Users, Threads, Currencies }) => {
    if (!global.client?.handleReaction?.length) return;

    const messageID = event.messageID;
    if (!messageID) return;

    const index = global.client.handleReaction.findIndex(
        (handle) => handle.messageID === messageID
    );

    if (index === -1) return;

    const handleReaction = global.client.handleReaction[index];
    const command = global.commands.get(handleReaction.name);

    if (!command?.handleReaction) return;

    try {
        await command.handleReaction({
            api,
            event,
            handleReaction,
            Users,
            Threads,
            Currencies
        });
    } catch (error) {
        const errorMessage = error?.message || String(error);
        api.sendMessage(`Lỗi xử lý phản ứng: ${errorMessage}`, event.threadID, event.messageID);
    }

    if (!handleReaction.keep) {
        global.client.handleReaction.splice(index, 1);
    }
};
