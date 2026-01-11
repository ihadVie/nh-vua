const ensureUser = async (api, senderID, Users) => {
  const existing = await Users.get(senderID);
  if (existing) return existing;

  let name = "User";
  try {
      const userInfo = await new Promise((resolve, reject) => {
          api.getUserInfo(senderID, (err, data) => {
              if (err) return reject(err);
              return resolve(data);
          });
      });
      if (userInfo && userInfo[senderID]) {
          name = userInfo[senderID].name || name;
      }
  } catch (error) {
      // ignore lookup errors
  }

  return Users.create(senderID, { name });
};

const ensureThread = async (api, threadID, Threads) => {
  const existing = await Threads.get(threadID);
  if (existing) return existing;

  let name = "";
  try {
      const info = await api.getThreadInfo(threadID);
      if (info?.threadName) name = info.threadName;
  } catch (error) {
      // ignore lookup errors
  }

  return Threads.create(threadID, { name });
};

module.exports = async ({ api, event, Users, Threads }) => {
  const { senderID, threadID } = event;
  if (!senderID || !threadID) return;

  await Promise.all([
      ensureUser(api, senderID, Users),
      ensureThread(api, threadID, Threads)
  ]);
};
