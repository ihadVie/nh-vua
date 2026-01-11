module.exports.config = {
  name: "leaveNoti",
  eventType: "log:unsubscribe"
};

module.exports.handleEvent = async ({ api, event, config }) => {
  if (config.notiGroup === false) return;

  const threadID = event.threadID;
  const leftID = event.logMessageData?.leftParticipantFbId;
  if (!leftID) return;

  const isKicked = event.author && event.author !== leftID;
  const status = isKicked ? "bị mời ra" : "rời";

  const message = `👋 Thành viên ${leftID} đã ${status} khỏi nhóm.`;
  return api.sendMessage(message, threadID);
};
