const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');

class WebConsole {
    constructor(serverHandle, credentials) {
        this.handle = serverHandle;
        this.credentials = credentials;
        this.port = 3002;
        this.app = express();
        this.history = [];
        this.maxHistorySize = 100;
        this.sessions = new Map();

        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(bodyParser.json());
    }

    setupRoutes() {

        this.app.get('/console', (req, res) => {
            res.send(this.getLoginHTML());
        });

        this.app.post('/console/login', (req, res) => {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({ success: false, error: 'Username and password required' });
            }

            if (username === this.credentials.username && password === this.credentials.password) {

                const token = crypto.randomBytes(32).toString('hex');
                this.sessions.set(token, {
                    username: username,
                    loginTime: new Date(),
                    lastActivity: new Date()
                });

                this.cleanupSessions();

                res.json({ success: true, token: token });
            } else {
                res.status(401).json({ success: false, error: 'Invalid credentials' });
            }
        });

        this.app.get('/console/main', (req, res) => {
            res.send(this.getConsoleHTML());
        });

        const authMiddleware = (req, res, next) => {
            const token = req.headers.authorization;

            if (!token || !this.sessions.has(token)) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            this.sessions.get(token).lastActivity = new Date();
            next();
        };

        this.app.post('/console/logout', authMiddleware, (req, res) => {
            const token = req.headers.authorization;
            if (token) {
                this.sessions.delete(token);
            }
            res.json({ success: true });
        });

        this.app.get('/console/check-session', authMiddleware, (req, res) => {
            res.json({ valid: true });
        });

        this.app.post('/console/clear-history', authMiddleware, (req, res) => {
            const previousSize = this.history.length;
            this.history = []; 

            this.addToHistory(`Console history cleared (${previousSize} entries removed)`, 'info');

            res.json({ 
                success: true, 
                message: `Cleared ${previousSize} history entries`,
                cleared: previousSize
            });
        });

        this.app.post('/console/command', authMiddleware, (req, res) => {
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

        this.app.get('/console/history', authMiddleware, (req, res) => {
            res.json(this.history);
        });

        this.app.get('/console/status', authMiddleware, (req, res) => {
            try {
                res.json({
                    running: this.handle.running || false,
                    serverPort: this.handle.settings?.serverPort || 3001
                });
            } catch (error) {
                res.json({
                    running: false,
                    serverPort: 3001,
                    error: error.message
                });
            }
        });
    }

    cleanupSessions() {
        const now = new Date();
        for (const [token, session] of this.sessions.entries()) {

            if (now - session.lastActivity > 24 * 60 * 60 * 1000) {
                this.sessions.delete(token);
            }
        }
    }

    addToHistory(message, type = 'info') {

        const validTypes = ['command', 'error', 'success', 'output', 'info', 'warning'];
        const cleanType = validTypes.includes(type) ? type : 'info';

        this.history.push({
            message: message.toString(),
            type: cleanType,
            timestamp: new Date().toISOString()
        });

        if (this.history.length > this.maxHistorySize) {
            this.history = this.history.slice(-this.maxHistorySize);
        }
    }

    getLoginHTML() {
        return `<!DOCTYPE html>
<html>
<head>
    <title>OgarII Web Console - Login</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { box-sizing: border-box; }
        body { 
            margin: 0; 
            padding: 0; 
            background: #0d1117; 
            color: #c9d1d9; 
            font-family: 'Courier New', monospace;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .login-container {
            background: #161b22;
            padding: 40px;
            border-radius: 10px;
            border: 1px solid #30363d;
            width: 100%;
            max-width: 400px;
        }
        h2 {
            text-align: center;
            margin-bottom: 30px;
            color: #58a6ff;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            color: #8b949e;
        }
        input {
            width: 100%;
            padding: 12px;
            background: #0a0c10;
            color: #c9d1d9;
            border: 1px solid #30363d;
            border-radius: 6px;
            font-family: inherit;
            font-size: 14px;
        }
        input:focus {
            outline: none;
            border-color: #58a6ff;
        }
        button {
            width: 100%;
            padding: 12px;
            background: #238636;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
        }
        button:hover {
            background: #2ea043;
        }
        .error {
            color: #f85149;
            text-align: center;
            margin-top: 10px;
            display: none;
        }
        .credentials-info {
            background: #1c2128;
            padding: 15px;
            border-radius: 6px;
            margin-top: 20px;
            font-size: 12px;
            color: #8b949e;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h2>OgarII Console Login</h2>
        <form id="loginForm">
            <div class="form-group">
                <label for="username">Username:</label>
                <input type="text" id="username" required>
            </div>
            <div class="form-group">
                <label for="password">Password:</label>
                <input type="password" id="password" required>
            </div>
            <button type="submit">Login</button>
        </form>
        <div class="error" id="errorMessage"></div>

        <div class="credentials-info" id="credentialsInfo" style="display: none;">
            <strong>First time setup:</strong> Check your server console for generated credentials
        </div>
    </div>

    <script>

        async function checkExistingSession() {
            const token = localStorage.getItem('consoleToken');
            if (!token) return;

            try {
                const response = await fetch('/console/check-session', {
                    headers: { 'Authorization': token }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.valid) {

                        window.location.href = '/console/main';
                        return;
                    }
                }
            } catch (error) {

                console.log('Session check failed, staying on login page');
            }

            localStorage.removeItem('consoleToken');
        }

        checkExistingSession();

        if (!localStorage.getItem('hasSeenLogin')) {
            document.getElementById('credentialsInfo').style.display = 'block';
            localStorage.setItem('hasSeenLogin', 'true');
        }

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('errorMessage');

            try {
                const response = await fetch('/console/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (data.success) {
                    localStorage.setItem('consoleToken', data.token);
                    window.location.href = '/console/main';
                } else {
                    errorDiv.textContent = data.error;
                    errorDiv.style.display = 'block';
                }
            } catch (error) {
                errorDiv.textContent = 'Login failed: ' + error.message;
                errorDiv.style.display = 'block';
            }
        });

        document.getElementById('username').focus();
    </script>
</body>
</html>`;
    }

    getConsoleHTML() {
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
        .logout-btn {
            background: #da3633;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            margin-left: 15px;
        }
        .logout-btn:hover {
            background: #f85149;
        }
        .clear-hint {
            position: absolute;
            bottom: 80px;
            right: 20px;
            background: rgba(13, 17, 23, 0.9);
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            color: #3fb950;
            border: 1px solid #3fb950;
            display: none;
            z-index: 1000;
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
            .clear-hint {
                bottom: 100px;
                right: 10px;
                font-size: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="console-container">
        <div class="header">
            <h2>OgarII Web Console</h2>
            <div class="status-info">
                Status: <span id="serverStatus">Checking...</span> | 
                Port: <span id="serverPort">-</span>
                <button class="logout-btn" onclick="logout()">Logout</button>
            </div>
        </div>

        <div class="console-output" id="consoleOutput">
            <div class="console-line info">Web Console initialized. Type commands below.</div>
            <div class="console-line info">Available commands: help, start, stop, restart, status, reload, save</div>
            <div class="console-line info">Shortcuts: Ctrl+L (clear console), ↑/↓ (command history)</div>
        </div>

        <div class="console-input">
            <input type="text" id="commandInput" placeholder="Enter command (type 'help' for list)...">
            <button id="executeBtn">Execute</button>
        </div>

        <div class="clear-hint" id="clearHint">Console cleared</div>
    </div>

    <script>
        class WebConsoleClient {
            constructor() {
                this.output = document.getElementById('consoleOutput');
                this.commandInput = document.getElementById('commandInput');
                this.executeBtn = document.getElementById('executeBtn');
                this.serverStatus = document.getElementById('serverStatus');
                this.serverPort = document.getElementById('serverPort');
                this.clearHint = document.getElementById('clearHint');

                this.commandHistory = [];
                this.historyIndex = -1;
                this.currentCommand = '';

                this.token = localStorage.getItem('consoleToken');

                if (!this.token) {

                    window.location.href = '/console';
                    return;
                }

                this.init();
            }

            async init() {

                try {
                    const response = await fetch('/console/check-session', {
                        headers: { 'Authorization': this.token }
                    });

                    if (!response.ok) {
                        throw new Error('Invalid session');
                    }

                    const data = await response.json();
                    if (!data.valid) {
                        throw new Error('Invalid session');
                    }

                    this.setupEventListeners();
                    this.loadHistory();
                    this.startStatusUpdates();
                    this.startSessionCheck();

                } catch (error) {
                    console.log('Session validation failed:', error);
                    localStorage.removeItem('consoleToken');
                    window.location.href = '/console';
                    return;
                }
            }

            setupEventListeners() {

                this.commandInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.executeCommand();
                    }
                });

                this.commandInput.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        this.navigateHistory(-1);
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        this.navigateHistory(1);
                    } else if (e.ctrlKey && e.key === 'l') {
                        e.preventDefault();
                        this.clearConsole();
                    } else if (e.ctrlKey && e.key === 'L') {
                        e.preventDefault();
                        this.clearConsole();
                    }
                });

                document.addEventListener('keydown', (e) => {
                    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
                        e.preventDefault();
                        this.clearConsole();
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

            async clearConsole() {
                try {

                    const response = await fetch('/console/clear-history', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': this.token
                        }
                    });

                    const data = await response.json();

                    if (data.success) {

                        this.output.innerHTML = '';

                        this.showClearHint(data.message);

                        this.addLine('Console cleared. Type "help" for available commands.', 'info');
                    } else {
                        this.addLine('Error clearing console: ' + data.error, 'error');
                    }

                } catch (error) {

                    this.output.innerHTML = '';
                    this.showClearHint('Console cleared (local only)');
                    this.addLine('Console cleared locally. Network error clearing server history.', 'warning');
                    this.addLine('Type "help" for available commands.', 'info');
                }

                this.commandInput.focus();
            }

            showClearHint(message = 'Console cleared') {
                this.clearHint.textContent = message;
                this.clearHint.style.display = 'block';
                setTimeout(() => {
                    this.clearHint.style.display = 'none';
                }, 2000);
            }

            navigateHistory(direction) {
                if (this.commandHistory.length === 0) return;

                if (direction === -1) { 
                    if (this.historyIndex === -1) {
                        this.currentCommand = this.commandInput.value;
                    }

                    if (this.historyIndex < this.commandHistory.length - 1) {
                        this.historyIndex++;
                        this.commandInput.value = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
                    }
                } else { 
                    if (this.historyIndex > 0) {
                        this.historyIndex--;
                        this.commandInput.value = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
                    } else if (this.historyIndex === 0) {
                        this.historyIndex = -1;
                        this.commandInput.value = this.currentCommand;
                    }
                }
            }

            addLine(text, className = '') {
                const line = document.createElement('div');

                line.className = 'console-line';
                if (className && typeof className === 'string') {
                    const classes = className.split(' ').filter(c => c.trim());
                    classes.forEach(cssClass => {
                        line.classList.add(cssClass);
                    });
                }

                line.textContent = text;
                this.output.appendChild(line);
                this.scrollToBottom();
            }

            scrollToBottom() {
                this.output.scrollTop = this.output.scrollHeight;
            }

            async executeCommand() {
                const command = this.commandInput.value.trim();
                if (!command) return;

                this.commandHistory.push(command);
                if (this.commandHistory.length > 50) {
                    this.commandHistory.shift();
                }
                this.historyIndex = -1;
                this.currentCommand = '';

                this.addLine('@ ' + command, 'command');
                this.commandInput.value = '';
                this.executeBtn.disabled = true;

                try {
                    const response = await fetch('/console/command', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': this.token
                        },
                        body: JSON.stringify({ command: command })
                    });

                    if (response.status === 401) {
                        localStorage.removeItem('consoleToken');
                        window.location.href = '/console';
                        return;
                    }

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
                    const response = await fetch('/console/history', {
                        headers: { 'Authorization': this.token }
                    });

                    if (response.status === 401) {
                        localStorage.removeItem('consoleToken');
                        window.location.href = '/console';
                        return;
                    }

                    const history = await response.json();
                    history.forEach(item => {

                        const typeMap = {
                            'command': 'command',
                            'error': 'error', 
                            'success': 'success',
                            'output': 'info',
                            'info': 'info',
                            'warning': 'warning'
                        };

                        const className = typeMap[item.type] || 'info';
                        this.addLine(item.message, className);
                    });
                } catch (error) {
                    console.log('Could not load command history:', error);
                }
            }

            async updateStatus() {
                try {
                    const response = await fetch('/console/status', {
                        headers: { 'Authorization': this.token }
                    });

                    if (response.status === 401) {
                        localStorage.removeItem('consoleToken');
                        window.location.href = '/console';
                        return;
                    }

                    const status = await response.json();

                    this.serverStatus.textContent = status.running ? 'RUNNING' : 'STOPPED';
                    this.serverStatus.className = status.running ? 'server-running' : 'server-stopped';
                    this.serverPort.textContent = status.serverPort || '-';
                } catch (error) {
                    this.serverStatus.textContent = 'ERROR';
                    this.serverStatus.className = 'error';
                    this.serverPort.textContent = '?';
                }
            }

            async startSessionCheck() {
                setInterval(async () => {
                    try {
                        const response = await fetch('/console/check-session', {
                            headers: { 'Authorization': this.token }
                        });

                        if (!response.ok) {
                            throw new Error('Session invalid');
                        }

                        const data = await response.json();

                        if (!data.valid) {
                            throw new Error('Session invalid');
                        }
                    } catch (error) {
                        console.log('Session check failed:', error);
                        localStorage.removeItem('consoleToken');
                        window.location.href = '/console';
                    }
                }, 30000); 
            }

            startStatusUpdates() {
                this.updateStatus();
                setInterval(() => this.updateStatus(), 3000);
            }
        }

        function logout() {
            const token = localStorage.getItem('consoleToken');
            if (token) {
                fetch('/console/logout', {
                    method: 'POST',
                    headers: { 'Authorization': token }
                }).catch(() => {});
            }
            localStorage.removeItem('consoleToken');
            window.location.href = '/console';
        }

        document.addEventListener('DOMContentLoaded', () => {
            new WebConsoleClient();
        });
    </script>
</body>
</html>`;
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
