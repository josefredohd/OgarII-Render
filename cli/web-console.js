const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

class WebConsole {
    constructor(serverHandle, port = 3002) {
        this.handle = serverHandle;
        this.port = port;
        this.app = express();
        this.history = [];
        this.maxHistorySize = 100;

        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(bodyParser.json());
    }

    setupRoutes() {

        this.app.get('/console', (req, res) => {
            res.send(this.getHTML());
        });

        this.app.post('/console/command', (req, res) => {
            const { command } = req.body;

            if (!command) {
                return res.json({ success: false, error: 'No command provided' });
            }

            try {
                const output = [];
                const originalPrint = this.handle.logger.print;

                this.handle.logger.print = (message) => {
                    output.push(message.toString());
                    originalPrint.call(this.handle.logger, message);
                };

                const success = this.handle.commands.execute(null, command);

                this.handle.logger.print = originalPrint;

                this.addToHistory(`@ ${command}`, 'command');
                output.forEach(line => this.addToHistory(line, 'output'));

                res.json({ 
                    success: true, 
                    output: output.length > 0 ? output : ['Command executed successfully']
                });

            } catch (error) {
                this.addToHistory(`Error executing command: ${error}`, 'error');
                res.json({ success: false, error: error.message });
            }
        });

        this.app.get('/console/history', (req, res) => {
            res.json(this.history);
        });

        this.app.get('/console/status', (req, res) => {
            try {
                let playerCount = 0;

                if (this.handle.listener && this.handle.listener.clients) {
                    playerCount = this.handle.listener.clients.size;
                }

                res.json({
                    running: this.handle.running || false,
                    gamemode: this.handle.settings?.gamemode || 'Unknown',
                    serverPort: this.handle.settings?.serverPort || 3001,
                    players: playerCount
                });
            } catch (error) {

                res.json({
                    running: false,
                    gamemode: 'Error',
                    serverPort: 3001,
                    players: 0,
                    error: error.message
                });
            }
        });
    }

    getHTML() {
        return `<!DOCTYPE html>
<html>
<head>
    <title>OgarII Web Console</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { box-sizing: border-box; }
        body { 
            margin: 0; 
            padding: 20px; 
            background: #0d1117; 
            color: #c9d1d9; 
            font-family: 'Courier New', monospace, 'SF Mono', Monaco, Inconsolata;
            height: 100vh;
            overflow: hidden;
        }
        .console-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #30363d;
        }
        .status-info {
            font-size: 14px;
            color: #8b949e;
        }
        .console-output {
            flex: 1;
            overflow-y: auto;
            border: 1px solid #30363d;
            padding: 15px;
            margin-bottom: 15px;
            background: #0a0c10;
            border-radius: 6px;
            font-size: 14px;
            line-height: 1.4;
        }
        .console-line {
            margin: 4px 0;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .console-input {
            display: flex;
            gap: 10px;
        }
        #commandInput {
            flex: 1;
            background: #0a0c10;
            color: #c9d1d9;
            border: 1px solid #30363d;
            padding: 12px;
            font-family: inherit;
            font-size: 14px;
            outline: none;
            border-radius: 6px;
            transition: border-color 0.2s;
        }
        #commandInput:focus {
            border-color: #58a6ff;
        }
        #executeBtn {
            background: #238636;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            transition: background 0.2s;
        }
        #executeBtn:hover {
            background: #2ea043;
        }
        #executeBtn:disabled {
            background: #484f58;
            cursor: not-allowed;
        }
        .command { color: #d29922; }
        .error { color: #f85149; }
        .success { color: #3fb950; }
        .info { color: #58a6ff; }
        .warning { color: #d29922; }
        .server-running { color: #3fb950; }
        .server-stopped { color: #f85149; }
        .scroll-indicator {
            position: absolute;
            bottom: 10px;
            right: 10px;
            background: rgba(0,0,0,0.8);
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            display: none;
        }

        @media (max-width: 768px) {
            .header {
                flex-direction: column;
                gap: 10px;
                text-align: center;
            }
            .status-info {
                font-size: 12px;
            }
        }
    </style>
</head>
<body>
    <div class="console-container">
        <div class="header">
            <h2>🎮 OgarII Web Console</h2>
            <div class="status-info">
                Status: <span id="serverStatus">Checking...</span> | 
                Players: <span id="playerCount">0</span> |
                Mode: <span id="gameMode">-</span> |
                Port: <span id="serverPort">-</span>
            </div>
        </div>

        <div class="console-output" id="consoleOutput">
            <div class="console-line info">Web Console initialized. Type commands below.</div>
            <div class="console-line info">Available commands: help, start, stop, restart, status, reload, save</div>
        </div>

        <div class="console-input">
            <input type="text" id="commandInput" placeholder="Enter command (type 'help' for list)...">
            <button id="executeBtn">Execute</button>
        </div>
    </div>

    <script>
        class WebConsoleClient {
            constructor() {
                this.output = document.getElementById('consoleOutput');
                this.commandInput = document.getElementById('commandInput');
                this.executeBtn = document.getElementById('executeBtn');
                this.serverStatus = document.getElementById('serverStatus');
                this.playerCount = document.getElementById('playerCount');
                this.gameMode = document.getElementById('gameMode');
                this.serverPort = document.getElementById('serverPort');

                this.init();
            }

            init() {
                this.setupEventListeners();
                this.loadHistory();
                this.startStatusUpdates();
                this.addLine('Console ready. Type "help" for available commands.', 'info');
            }

            setupEventListeners() {
                this.commandInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.executeCommand();
                    }
                });

                this.executeBtn.addEventListener('click', () => {
                    this.executeCommand();
                });

                this.commandInput.addEventListener('input', () => {
                    this.executeBtn.disabled = !this.commandInput.value.trim();
                });

                setTimeout(() => {
                    this.commandInput.focus();
                }, 100);
            }

            addLine(text, className = '') {
				const line = document.createElement('div');
				line.className = 'console-line ' + className;
				line.textContent = text; 
				this.output.appendChild(line);
				this.scrollToBottom();
			}

            escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            scrollToBottom() {
                this.output.scrollTop = this.output.scrollHeight;
            }

            async executeCommand() {
                const command = this.commandInput.value.trim();
                if (!command) return;

                this.addLine('@ ' + command, 'command');
                this.commandInput.value = '';
                this.executeBtn.disabled = true;

                try {
                    const response = await fetch('/console/command', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ command: command })
                    });

                    const data = await response.json();

                    if (data.success) {
                        if (data.output && data.output.length > 0) {
                            data.output.forEach(line => this.addLine(line, 'info'));
                        } else {
                            this.addLine('Command executed successfully', 'success');
                        }
                    } else {
                        this.addLine('Error: ' + data.error, 'error');
                    }
                } catch (error) {
                    this.addLine('Network error: ' + error.message, 'error');
                }

                this.executeBtn.disabled = false;
                this.commandInput.focus();
            }

            async loadHistory() {
                try {
                    const response = await fetch('/console/history');
                    const history = await response.json();
                    history.forEach(item => {
                        this.addLine(item.message, item.type);
                    });
                } catch (error) {
                    console.log('Could not load command history:', error);
                }
            }

            async updateStatus() {
                try {
                    const response = await fetch('/console/status');
                    const status = await response.json();

                    this.serverStatus.textContent = status.running ? 'RUNNING' : 'STOPPED';
                    this.serverStatus.className = status.running ? 'server-running' : 'server-stopped';
                    this.playerCount.textContent = status.players;
                    this.gameMode.textContent = status.gamemode || '-';
                    this.serverPort.textContent = status.serverPort || '-';
                } catch (error) {
                    this.serverStatus.textContent = 'ERROR';
                    this.serverStatus.className = 'error';
                    this.playerCount.textContent = '?';
                    this.gameMode.textContent = '?';
                    this.serverPort.textContent = '?';
                }
            }

            startStatusUpdates() {
                this.updateStatus();
                setInterval(() => this.updateStatus(), 3000); 
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            new WebConsoleClient();
        });
    </script>
</body>
</html>`;
    }

    addToHistory(message, type = 'info') {
        this.history.push({
            message: message.toString(),
            type: type,
            timestamp: new Date().toISOString()
        });

        if (this.history.length > this.maxHistorySize) {
            this.history = this.history.slice(-this.maxHistorySize);
        }
    }

    start(httpServer) {
        return new Promise((resolve, reject) => {
            try {
                this.server = httpServer;
                this.server.on('request', this.app); 
                this.handle.logger.print('Web console mounted at /console on same port');
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.handle.logger.print('Web console stopped');
        }
    }
}

module.exports = WebConsole;
