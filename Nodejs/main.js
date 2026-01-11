const login = require("@dongdev/fca-unofficial");
const fs = require("fs-extra");
const path = require("path");
const logger = require("./utils/log");
const config = require("./config.json");

const { initDatabase } = require("./includes/controllers/database");
const Users = require("./includes/controllers/users");
const Threads = require("./includes/controllers/threads");
const Currencies = require("./includes/controllers/currencies");

const handleCommand = require("./includes/handle/handleCommand");
const handleReply = require("./includes/handle/handleReply");
const handleReaction = require("./includes/handle/handleReaction");
const handleCreateDatabase = require("./includes/handle/handleCreateDatabase");
const { kemRouter } = require("./src/ai/kemRouter");
const { sendKemImage } = require("./src/utils/sendKemImage");

global.config = config;
global.commands = new Map();
global.events = new Map();
global.cooldowns = new Map();
global.client = {
    handleReply: [],
    handleReaction: [],
    accountStatus: "ok"
};

global.Users = Users;
global.Threads = Threads;
global.Currencies = Currencies;

const loadCommands = () => {
    const commandsPath = path.join(__dirname, "modules", "commands");
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

    for (const file of commandFiles) {
        try {
            const command = require(path.join(commandsPath, file));
            if (command.config && command.config.name) {
                global.commands.set(command.config.name, command);
                logger.loader(`Loaded command: ${command.config.name}`);
            }
        } catch (error) {
            logger(`Failed to load command ${file}: ${error.message}`, "error");
        }
    }

    logger(`Loaded ${global.commands.size} commands`, "[ COMMANDS ]");
};

const loadEvents = () => {
    const eventsPath = path.join(__dirname, "modules", "events");
    if (!fs.existsSync(eventsPath)) return;

    const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));

    for (const file of eventFiles) {
        try {
            const eventModule = require(path.join(eventsPath, file));
            if (eventModule.config && eventModule.config.name) {
                global.events.set(eventModule.config.name, eventModule);
                logger.loader(`Loaded event: ${eventModule.config.name}`);
            }
        } catch (error) {
            logger(`Failed to load event ${file}: ${error.message}`, "error");
        }
    }

    logger(`Loaded ${global.events.size} events`, "[ EVENTS ]");
};

const appstatePath = config.APPSTATEPATH || "appstate.json";
if (!fs.existsSync(appstatePath)) {
    logger("File appstate.json not found! Please provide a valid appstate.", "error");
    process.exit(1);
}

let appstate;
try {
    appstate = JSON.parse(fs.readFileSync(appstatePath, "utf8"));
} catch (error) {
    logger(`Failed to parse appstate.json: ${error.message}`, "error");
    process.exit(1);
}

const runCommandEvents = async ({ api, event }) => {
    for (const command of global.commands.values()) {
        if (typeof command.handleEvent !== "function") continue;
        try {
            await command.handleEvent({ api, event, Users, Threads, Currencies });
        } catch (error) {
            logger(`Command event error: ${error.message}`, "error");
        }
    }
};

const runEventModules = async ({ api, event }) => {
    if (event.type !== "event") return;

    for (const [name, eventModule] of global.events.entries()) {
        if ((config.eventDisabled || []).includes(name)) continue;

        const expectedType = eventModule.config?.eventType;
        if (expectedType && expectedType !== event.logMessageType) continue;

        if (typeof eventModule.handleEvent !== "function") continue;

        try {
            await eventModule.handleEvent({ api, event, Users, Threads, Currencies, config });
        } catch (error) {
            logger(`Event module error: ${error.message}`, "error");
        }
    }
};

const refreshAccountStatus = (api) => {
    if (typeof api.getAppState !== "function") return;
    try {
        api.getAppState();
        global.client.accountStatus = "ok";
    } catch (error) {
        global.client.accountStatus = "checkpoint";
    }
};

const start = async () => {
    await initDatabase();
    loadCommands();
    loadEvents();

    login({ appState: appstate }, config.FCAOption, (err, api) => {
        if (err) {
            logger(`Login failed: ${JSON.stringify(err)}`, "error");
            return process.exit(1);
        }

        logger(`Logged in successfully as ${config.BOTNAME}`, "[ LOGIN ]");
        const botId = api.getCurrentUserID();

        api.setOptions({
            forceLogin: true,
            listenEvents: true,
            logLevel: "silent",
            selfListen: false
        });

        refreshAccountStatus(api);
        setInterval(() => refreshAccountStatus(api), 1000 * 60 * 5);

        api.listenMqtt(async (err, event) => {
            if (err) {
                logger(`Listen error: ${err}`, "error");
                return;
            }

            if (config.autoCreateDB) {
                await handleCreateDatabase({ api, event, Users, Threads });
            }

            if (event.type === "message" || event.type === "message_reply") {
                try {
                    const kemResponse = await kemRouter({ api, event, botId });
                    if (kemResponse) {
                        if (kemResponse.type === "image") {
                            await sendKemImage({
                                api,
                                threadID: event.threadID,
                                messageID: event.messageID,
                                payload: kemResponse
                            });
                        } else if (kemResponse.text) {
                            await api.sendMessage(kemResponse.text, event.threadID, event.messageID);
                        }
                        return;
                    }
                } catch (error) {
                    logger(`Kem router error: ${error.message}`, "error");
                    await api.sendMessage("Kem lỗi nhẹ rồi, bạn thử lại nha 🥺", event.threadID, event.messageID);
                    return;
                }
            }

            if (event.type === "message" || event.type === "message_reply") {
                await runCommandEvents({ api, event });
            }

            if (event.type === "message_reply") {
                await handleReply({ api, event, Users, Threads, Currencies });
            }

            if (event.type === "message" || event.type === "message_reply") {
                await handleCommand({ api, event, Users, Threads, Currencies, config });
            }

            if (event.type === "message_reaction") {
                await handleReaction({ api, event, Users, Threads, Currencies });
            }

            await runEventModules({ api, event });
        });
    });
};

start();

process.on("unhandledRejection", (reason) => {
    logger(`Unhandled Rejection: ${reason}`, "error");
});

process.on("uncaughtException", (error) => {
    logger(`Uncaught Exception: ${error.message}`, "error");
});
