// src/runner.js - One place that knows how to run Python code in the Variable Explorer.
const vscode = require('vscode');
const path = require('path');

const DEDUPE_WINDOW_MS = 4000;

class Runner {
    /**
     * @param {import('./pythonManager').PythonManager} pythonManager
     * @param {() => any} getPanel
     * @param {vscode.OutputChannel} output
     */
    constructor(pythonManager, getPanel, output) {
        this.pythonManager = pythonManager;
        this.getPanel = getPanel;
        this.output = output;
        this.recentRuns = new Map();
    }

    /**
     * Working directory and sys.path[0] for a run - matching what the Python
     * extension does when it runs the file in a terminal.
     */
    runContext(filePath) {
        if (!filePath) {
            const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
            return { cwd: folder ? folder.uri.fsPath : undefined };
        }
        const uri = vscode.Uri.file(filePath);
        const folder = vscode.workspace.getWorkspaceFolder(uri) ||
            (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]);
        const inFileDir = vscode.workspace.getConfiguration('python', uri).get('terminal.executeInFileDir', false);
        const scriptDir = path.dirname(filePath);
        return {
            cwd: inFileDir || !folder ? scriptDir : folder.uri.fsPath,
            script_dir: scriptDir
        };
    }

    _settings() {
        const cfg = vscode.workspace.getConfiguration('variableExplorer');
        return {
            captureMainLocals: cfg.get('captureMainLocals', false),
            showOutputOnRun: cfg.get('showOutputOnRun', true)
        };
    }

    _showPanel() {
        const panel = this.getPanel();
        if (panel) {
            panel.reveal(true);
        }
    }

    _key(filePath) {
        const normalized = path.normalize(filePath);
        return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    }

    /** True if this file was started very recently (used to drop duplicate triggers). */
    recentlyRan(filePath) {
        const last = this.recentRuns.get(this._key(filePath));
        return last !== undefined && Date.now() - last < DEDUPE_WINDOW_MS;
    }

    /**
     * @param {string} filePath
     * @param {{shadow?: boolean, dedupe?: boolean}} options
     *   shadow: the same file is also running in a terminal
     *   dedupe: skip if this file was started within the last few seconds
     */
    async runFile(filePath, options = {}) {
        if (options.dedupe && this.recentlyRan(filePath)) {
            return undefined;
        }
        this.recentRuns.set(this._key(filePath), Date.now());

        const settings = this._settings();
        this._showPanel();
        if (!options.shadow && settings.showOutputOnRun) {
            this.output.show(true);
        }
        this.output.appendLine(`\n▶ Running ${filePath}${options.shadow ? ' (mirroring terminal run)' : ''}`);

        return this._run(() => this.pythonManager.runFile(filePath, Object.assign({
            capture_main_locals: settings.captureMainLocals,
            shadow: !!options.shadow
        }, this.runContext(filePath))), path.basename(filePath));
    }

    async runCode(code, document) {
        if (!code || !code.trim()) {
            return undefined;
        }
        const settings = this._settings();
        this._showPanel();
        const filePath = document && document.uri.scheme === 'file' ? document.uri.fsPath : undefined;
        return this._run(() => this.pythonManager.runCode(code, Object.assign({
            capture_main_locals: settings.captureMainLocals
        }, this.runContext(filePath))), 'selection');
    }

    /** Run the document shown in an editor, saving it first (like Spyder). */
    async runDocument(document, options = {}) {
        if (document.isUntitled) {
            return this.runCode(document.getText(), document);
        }
        if (document.isDirty) {
            const saved = await document.save();
            if (!saved) {
                vscode.window.showWarningMessage('Variable Explorer: the file could not be saved, running the version on disk.');
            }
        }
        return this.runFile(document.uri.fsPath, options);
    }

    async _run(start, label) {
        let response;
        try {
            response = await start();
        } catch (e) {
            // Start-up failures were already reported by the PythonManager.
            this.output.appendLine(`✖ ${label}: ${e.message}`);
            return undefined;
        }
        if (response.status === 'error') {
            this.output.appendLine(`✖ ${label} failed: ${response.error}`);
            if (!response.interrupted) {
                vscode.window.showErrorMessage(`Variable Explorer: ${response.error}`, 'Show Output').then(choice => {
                    if (choice === 'Show Output') {
                        this.output.show(true);
                    }
                });
            }
        } else if (response.duration !== undefined) {
            this.output.appendLine(`✔ ${label} finished in ${response.duration}s`);
        }
        return response;
    }
}

module.exports = { Runner };
