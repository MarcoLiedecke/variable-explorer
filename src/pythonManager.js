// src/pythonManager.js
const vscode = require('vscode');
const path = require('path');
const { spawn } = require('child_process');

class PythonManager {
    constructor(context) {
        this.context = context;
        this.process = null;
        this.messageCallback = null;
        this.outputBuffer = ''; // Buffer for accumulating stdout data
    }

    start(onMessage) {
        if (this.process) {
            console.log('Python process already running');
            return;
        }

        this.messageCallback = onMessage;
        this.outputBuffer = ''; // Reset buffer
        const pythonPath = vscode.workspace.getConfiguration('python').get('defaultInterpreterPath') || 'python';
        const backendScript = path.join(this.context.extensionPath, 'python', 'variable_inspector.py');

        this.process = spawn(pythonPath, [backendScript]);

        this.process.stdout.on('data', (data) => {
            // Accumulate data in buffer
            this.outputBuffer += data.toString();

            // Process complete lines (ending with \n)
            let lineEnd;
            while ((lineEnd = this.outputBuffer.indexOf('\n')) !== -1) {
                const line = this.outputBuffer.substring(0, lineEnd).trim();
                this.outputBuffer = this.outputBuffer.substring(lineEnd + 1);

                if (line.length > 0) {
                    try {
                        const response = JSON.parse(line);
                        if (this.messageCallback) {
                            this.messageCallback(response);
                        }
                    } catch (e) {
                        console.error('Error parsing Python output:', e, {
                            line: line.substring(0, 100) + '...',
                            length: line.length
                        });
                    }
                }
            }
        });

        this.process.stderr.on('data', (data) => {
            console.error(`Python Error: ${data}`);
        });

        this.process.on('close', (code) => {
            console.log(`Python process exited with code ${code}`);
            this.process = null;
            this.outputBuffer = ''; // Clear buffer on close
        });
    }

    sendCommand(command) {
        if (!this.process || !this.process.stdin) {
            console.error('Python backend not running, cannot send command:', command.command);
            // Return false silently - caller should check isRunning() before calling
            return false;
        }

        try {
            const commandStr = JSON.stringify(command);
            this.process.stdin.write(commandStr + '\n');
            return true;
        } catch (e) {
            console.error('Error sending command to Python:', e);
            vscode.window.showErrorMessage('Failed to communicate with Python backend. Please try restarting Variable Explorer.');
            return false;
        }
    }

    runFile(filePath) {
        const captureMainLocals = vscode.workspace.getConfiguration('variableExplorer').get('captureMainLocals', false);
        return this.sendCommand({
            command: 'run_file',
            file: filePath,
            capture_main_locals: captureMainLocals
        });
    }

    runCode(code) {
        const captureMainLocals = vscode.workspace.getConfiguration('variableExplorer').get('captureMainLocals', false);
        return this.sendCommand({
            command: 'run_code',
            code: code,
            capture_main_locals: captureMainLocals
        });
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