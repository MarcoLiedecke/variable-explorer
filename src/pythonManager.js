// src/pythonManager.js
const vscode = require('vscode');
const path = require('path');
const { spawn } = require('child_process');

class PythonManager {
    constructor(context) {
        this.context = context;
        this.process = null;
        this.messageCallback = null;
    }

    start(onMessage) {
        if (this.process) {
            console.log('Python process already running');
            return;
        }

        this.messageCallback = onMessage;
        const pythonPath = vscode.workspace.getConfiguration('python').get('defaultInterpreterPath') || 'python';
        const backendScript = path.join(this.context.extensionPath, 'python', 'variable_inspector.py');

        this.process = spawn(pythonPath, [backendScript]);

        this.process.stdout.on('data', (data) => {
            try {
                const response = JSON.parse(data.toString());
                if (this.messageCallback) {
                    this.messageCallback(response);
                }
            } catch (e) {
                console.error('Error parsing Python output:', e);
            }
        });

        this.process.stderr.on('data', (data) => {
            console.error(`Python Error: ${data}`);
        });

        this.process.on('close', (code) => {
            console.log(`Python process exited with code ${code}`);
            this.process = null;
        });
    }

    sendCommand(command) {
        if (!this.process || !this.process.stdin) {
            vscode.window.showErrorMessage('Python backend not started. Please show Variable Explorer first.');
            return false;
        }

        try {
            const commandStr = JSON.stringify(command);
            this.process.stdin.write(commandStr + '\n');
            return true;
        } catch (e) {
            console.error('Error sending command to Python:', e);
            return false;
        }
    }

    runFile(filePath) {
        return this.sendCommand({ command: 'run_file', file: filePath });
    }

    runCode(code) {
        return this.sendCommand({ command: 'run_code', code: code });
    }

    getVariables() {
        return this.sendCommand({ command: 'get_variables' });
    }

    getDetails(varName, path = null) {
        const command = { command: 'get_details', name: varName };
        if (path) {
            command.path = path;
        }
        return this.sendCommand(command);
    }

    updateVariable(varName, varType, newValue) {
        return this.sendCommand({
            command: 'update_variable',
            name: varName,
            type: varType,
            value: newValue
        });
    }

    clearNamespace() {
        return this.sendCommand({ command: 'clear_namespace' });
    }

    isRunning() {
        return this.process !== null;
    }

    dispose() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
}

module.exports = { PythonManager };