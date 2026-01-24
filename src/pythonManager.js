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
        // Always update the message callback, even if process is already running
        // This allows the new panel to receive messages after the old panel is disposed
        this.messageCallback = onMessage;

        if (this.process) {
            console.log('Python process already running');
            return;
        }
        this.outputBuffer = ''; // Reset buffer

        // Get Python path with better fallback logic for macOS
        let pythonPath = vscode.workspace.getConfiguration('python').get('defaultInterpreterPath');
        if (!pythonPath) {
            // Try variableExplorer.pythonPath setting
            pythonPath = vscode.workspace.getConfiguration('variableExplorer').get('pythonPath');
        }
        if (!pythonPath) {
            // Use python3 on macOS/Linux, python on Windows
            pythonPath = process.platform === 'win32' ? 'python' : 'python3';
        }

        const backendScript = path.join(this.context.extensionPath, 'python', 'variable_inspector.py');

        // Get the workspace folder as the working directory
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const spawnOptions = workspaceFolder ? { cwd: workspaceFolder } : {};

        console.log(`Starting Python backend with: ${pythonPath} ${backendScript}`);

        try {
            this.process = spawn(pythonPath, [backendScript], spawnOptions);
        } catch (e) {
            console.error('Failed to spawn Python process:', e);
            vscode.window.showErrorMessage(
                `Variable Explorer: Failed to start Python backend. ` +
                `Make sure Python is installed and accessible as "${pythonPath}". ` +
                `You can configure the Python path in settings.`
            );
            return;
        }

        // Handle spawn errors (e.g., command not found)
        this.process.on('error', (err) => {
            console.error('Python process error:', err);
            this.process = null;
            vscode.window.showErrorMessage(
                `Variable Explorer: Failed to start Python. Error: ${err.message}. ` +
                `Please check that Python is installed and the path is correct in settings.`
            );
        });

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
            const errorMsg = data.toString();
            console.error(`Python Error: ${errorMsg}`);
            // Show critical errors to user (but not regular warnings)
            if (errorMsg.includes('ModuleNotFoundError') ||
                errorMsg.includes('ImportError') ||
                errorMsg.includes('SyntaxError') ||
                errorMsg.includes('No module named')) {
                vscode.window.showErrorMessage(`Variable Explorer Python Error: ${errorMsg.substring(0, 200)}`);
            }
        });

        this.process.on('close', (code) => {
            console.log(`Python process exited with code ${code}`);
            if (code !== 0 && code !== null) {
                vscode.window.showWarningMessage(
                    `Variable Explorer: Python backend exited unexpectedly (code ${code}). ` +
                    `Try running a Python file again to restart it.`
                );
            }
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

    saveSession(filePath) {
        return this.sendCommand({
            command: 'save_session',
            file: filePath
        });
    }

    loadSession(filePath) {
        return this.sendCommand({
            command: 'load_session',
            file: filePath
        });
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