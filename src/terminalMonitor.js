// src/terminalMonitor.js - Monitor terminal execution to detect "Run Python File" button usage
const vscode = require('vscode');
const path = require('path');

class TerminalMonitor {
    constructor(getPanel, pythonManager) {
        this.getPanel = getPanel;
        this.pythonManager = pythonManager;
        this.disposables = [];
        this.enabled = true;
        this.lastRunFile = null;
        this.lastRunTime = 0;
    }

    start() {
        // Check if monitoring is enabled
        this.updateEnabledFromConfig();

        // Listen for configuration changes
        const configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('variableExplorer.monitorTerminalExecution')) {
                this.updateEnabledFromConfig();
            }
        });
        this.disposables.push(configDisposable);

        // Listen for terminal creation (first run detection)
        const terminalOpenDisposable = vscode.window.onDidOpenTerminal((terminal) => {
            this.handleTerminalOpen(terminal);
        });
        this.disposables.push(terminalOpenDisposable);

        // Listen for shell execution if available (subsequent runs with shell integration)
        if (vscode.window.onDidStartTerminalShellExecution) {
            const startExecDisposable = vscode.window.onDidStartTerminalShellExecution((event) => {
                this.handleShellExecution(event);
            });
            this.disposables.push(startExecDisposable);
        }

        if (vscode.window.onDidEndTerminalShellExecution) {
            const endExecDisposable = vscode.window.onDidEndTerminalShellExecution((event) => {
                this.handleShellExecutionEnd(event);
            });
            this.disposables.push(endExecDisposable);
        }
    }

    updateEnabledFromConfig() {
        this.enabled = vscode.workspace.getConfiguration('variableExplorer').get('monitorTerminalExecution', true);
    }

    handleTerminalOpen(terminal) {
        if (!this.enabled) return;

        const name = terminal.name || '';
        const isPythonTerminal = name === 'Python' ||
            (name.includes('Python') && !name.includes('Debugger'));

        if (!isPythonTerminal) return;

        // Get the active Python file
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'python') return;

        const filePath = editor.document.uri.fsPath;

        // Debounce - don't re-run if we just ran this file
        const now = Date.now();
        if (this.lastRunFile === filePath && now - this.lastRunTime < 2000) {
            return;
        }

        this.runFileInExplorer(filePath);
    }

    handleShellExecution(event) {
        if (!this.enabled) return;

        const terminal = event.terminal;
        const name = terminal.name || '';

        // Only process Python terminals
        const isPythonTerminal = name === 'Python' ||
            (name.includes('Python') && !name.includes('Debugger'));
        if (!isPythonTerminal) return;

        const execution = event.execution;
        const commandLine = execution.commandLine;

        if (commandLine && commandLine.value) {
            this.checkCommandForPython(commandLine.value);
        }
    }

    handleShellExecutionEnd(event) {
        if (!this.enabled) return;

        const terminal = event.terminal;
        const name = terminal.name || '';

        // Only process Python terminals
        const isPythonTerminal = name === 'Python' ||
            (name.includes('Python') && !name.includes('Debugger'));
        if (!isPythonTerminal) return;

        const execution = event.execution;
        const commandLine = execution.commandLine;

        if (commandLine && commandLine.value) {
            this.checkCommandForPython(commandLine.value);
        }
    }

    checkCommandForPython(command) {
        // Parse the command to see if it's running a Python file
        const pythonRunPattern = /(?:python3?|.*[\/\\]python[^\/\\]*)\s+["']?([^"'\s]+\.py)["']?/i;
        const match = command.match(pythonRunPattern);

        if (match) {
            let filePath = match[1];

            // If it's a relative path, resolve it against workspace
            if (!path.isAbsolute(filePath)) {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (workspaceFolder) {
                    filePath = path.join(workspaceFolder, filePath);
                }
            }

            // Debounce
            const now = Date.now();
            if (this.lastRunFile === filePath && now - this.lastRunTime < 2000) {
                return;
            }

            this.runFileInExplorer(filePath);
        }
    }

    runFileInExplorer(filePath) {
        // Track last run for debouncing
        this.lastRunFile = filePath;
        this.lastRunTime = Date.now();

        // Get or create the panel
        const panel = this.getPanel();
        if (panel) {
            panel.reveal();

            // Wait for backend to be ready
            const executeRun = () => {
                if (this.pythonManager.isRunning()) {
                    this.pythonManager.runFile(filePath);
                } else {
                    // Backend might be starting, wait a bit
                    setTimeout(() => {
                        if (this.pythonManager.isRunning()) {
                            this.pythonManager.runFile(filePath);
                        }
                    }, 1000);
                }
            };

            executeRun();
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}

module.exports = { TerminalMonitor };
