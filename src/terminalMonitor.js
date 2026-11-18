// src/terminalMonitor.js - Mirror "Run Python File" terminal runs into the Variable Explorer.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { parsePythonRunCommand } = require('./utils');

// How long to wait for shell integration to report the command before falling
// back to "a Python terminal opened while a Python file is active".
const OPEN_FALLBACK_DELAY_MS = 2500;

class TerminalMonitor {
    /**
     * @param {import('./runner').Runner} runner
     */
    constructor(runner) {
        this.runner = runner;
        this.disposables = [];
        this.enabled = true;
        this.pendingOpen = new Map();
    }

    start() {
        this.updateEnabledFromConfig();
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('variableExplorer.monitorTerminalExecution')) {
                    this.updateEnabledFromConfig();
                }
            }),
            vscode.window.onDidOpenTerminal(t => this.handleTerminalOpen(t)),
            vscode.window.onDidCloseTerminal(t => this.clearPending(t))
        );
        if (typeof vscode.window.onDidStartTerminalShellExecution === 'function') {
            this.disposables.push(vscode.window.onDidStartTerminalShellExecution(e => this.handleShellExecution(e)));
        }
    }

    updateEnabledFromConfig() {
        this.enabled = vscode.workspace.getConfiguration('variableExplorer').get('monitorTerminalExecution', true);
    }

    isPythonTerminal(terminal) {
        const name = (terminal && terminal.name) || '';
        return /python/i.test(name) && !/debug/i.test(name);
    }

    clearPending(terminal) {
        const timer = this.pendingOpen.get(terminal);
        if (timer) {
            clearTimeout(timer);
            this.pendingOpen.delete(terminal);
        }
    }

    handleTerminalOpen(terminal) {
        if (!this.enabled || !this.isPythonTerminal(terminal)) {
            return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'python' || editor.document.uri.scheme !== 'file') {
            return;
        }
        const filePath = editor.document.uri.fsPath;
        // Prefer the exact command line from shell integration; only fall back
        // to "the active file" if no command is reported for this terminal.
        this.clearPending(terminal);
        this.pendingOpen.set(terminal, setTimeout(() => {
            this.pendingOpen.delete(terminal);
            if (this.enabled) {
                this.runner.runFile(filePath, { shadow: true, dedupe: true });
            }
        }, OPEN_FALLBACK_DELAY_MS));
    }

    handleShellExecution(event) {
        if (!this.enabled) {
            return;
        }
        const terminal = event.terminal;
        this.clearPending(terminal);
        if (!this.isPythonTerminal(terminal)) {
            return;
        }
        const execution = event.execution;
        const commandLine = execution && execution.commandLine && execution.commandLine.value;
        let filePath = parsePythonRunCommand(commandLine);
        if (!filePath) {
            return;
        }
        if (!path.isAbsolute(filePath)) {
            const cwd = (execution.cwd && execution.cwd.fsPath) ||
                (terminal.shellIntegration && terminal.shellIntegration.cwd && terminal.shellIntegration.cwd.fsPath) ||
                (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath);
            if (!cwd) {
                return;
            }
            filePath = path.resolve(cwd, filePath);
        }
        if (!fs.existsSync(filePath)) {
            return;
        }
        this.runner.runFile(filePath, { shadow: true, dedupe: true });
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    dispose() {
        for (const timer of this.pendingOpen.values()) {
            clearTimeout(timer);
        }
        this.pendingOpen.clear();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}

module.exports = { TerminalMonitor };
