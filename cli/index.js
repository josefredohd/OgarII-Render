const fs = require("fs");
const path = require("path");
const http = require("http"); 
const DefaultSettings = require("../src/Settings");
const ServerHandle = require("../src/ServerHandle");
const { genCommand } = require("../src/commands/CommandList");
const WebConsole = require("./web-console");

/** @returns {DefaultSettings} */
function readSettings() {
    const settingsPath = path.join(__dirname, "settings.json");
    try { 
        return JSON.parse(fs.readFileSync(settingsPath, "utf-8")); 
    } catch (e) {
        console.log("caught error while parsing/reading settings.json:", e.stack);
        process.exit(1);
    }
}

/** @param {DefaultSettings} settings */
function overwriteSettings(settings) {
    const settingsPath = path.join(__dirname, "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), "utf-8");
}

const settingsPath = path.join(__dirname, "settings.json");
if (!fs.existsSync(settingsPath)) {
    console.log("Creating default settings.json...");
    overwriteSettings(DefaultSettings);
}

let settings = readSettings();

const currentHandle = new ServerHandle(settings);
overwriteSettings(currentHandle.settings);
require("./log-handler")(currentHandle);
const logger = currentHandle.logger;

const webConsole = new WebConsole(currentHandle);

const DefaultCommands = require("../src/commands/DefaultCommands");
const DefaultProtocols = [
    require("../src/protocols/LegacyProtocol"),
    require("../src/protocols/ModernProtocol"),
];
const DefaultGamemodes = [
    require("../src/gamemodes/FFA"),
    require("../src/gamemodes/Teams"),
    require("../src/gamemodes/LastManStanding")
];

DefaultCommands(currentHandle.commands, currentHandle.chatCommands);
currentHandle.protocols.register(...DefaultProtocols);
currentHandle.gamemodes.register(...DefaultGamemodes);

currentHandle.commands.register(
    genCommand({
        name: "start",
        args: "",
        desc: "start the handle",
        exec: (handle, context, args) => {
            if (!handle.start()) {
                handle.logger.print("handle already running");
            } else {
                handle.logger.print("handle started successfully");
            }
        }
    }),
    genCommand({
        name: "stop",
        args: "",
        desc: "stop the handle",
        exec: (handle, context, args) => {
            if (!handle.stop()) {
                handle.logger.print("handle not started");
            } else {
                handle.logger.print("handle stopped successfully");
            }
        }
    }),
    genCommand({
        name: "restart",
        args: "",
        desc: "restart the handle",
        exec: (handle, context, args) => {
            handle.stop();
            setTimeout(() => {
                handle.start();
                handle.logger.print("handle restarted successfully");
            }, 1000);
        }
    }),
    genCommand({
        name: "status",
        args: "",
        desc: "show server status",
        exec: (handle, context, args) => {
            handle.logger.print("Server is " + (handle.running ? "RUNNING" : "STOPPED"));
            handle.logger.print("Gamemode: " + handle.settings.gamemode);
            handle.logger.print("Port: " + handle.settings.serverPort);
            handle.logger.print("Players: " + (handle.listener ? handle.listener.clients.size : 0));
        }
    }),
    genCommand({
        name: "reload",
        args: "",
        desc: "reload the settings from local settings.json",
        exec: (handle, context, args) => {
            handle.setSettings(readSettings());
            logger.print("Settings reloaded successfully");
        }
    }),
    genCommand({
        name: "save",
        args: "",
        desc: "save the current settings to settings.json",
        exec: (handle, context, args) => {
            overwriteSettings(handle.settings);
            logger.print("Settings saved successfully");
        }
    })
);

async function startServer() {
    try {

        const httpServer = http.createServer();

        await webConsole.start(httpServer);

        currentHandle.httpServer = httpServer;

        currentHandle.start();

        const port = currentHandle.settings.serverPort || 3001;
        httpServer.listen(settings.serverPort || 3001, () => {
            logger.print("=== OgarII Server Started ===");
            logger.print("Game Server + Web Console running on port " + (settings.serverPort || 3001));
            logger.print("Access console at: http://localhost:" + (settings.serverPort || 3001) + "/console");
        });

    } catch (error) {
        logger.print("Failed to start server: " + error.message);
        process.exit(1);
    }
}

function shutdown() {
    logger.print("Shutting down server...");
    webConsole.stop();
    currentHandle.stop();
    setTimeout(() => {
        process.exit(0);
    }, 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer();
