// src/webview/variableExplorerPanel.js
const vscode = require('vscode');
const path = require('path');
const { getWebviewContent } = require('./webviewContent');

// Responses whose `variables` should refresh the table.
const VARIABLE_COMMANDS = new Set([
    'run_file', 'run_code', 'get_variables', 'update_variable', 'clear_namespace', 'load_session'
]);

class VariableExplorerPanel {
    /**
     * @param {vscode.ExtensionContext} context
     * @param {import('../pythonManager').PythonManager} pythonManager
     * @param {() => void} onDispose
     */
    constructor(context, pythonManager, onDispose) {
        this.context = context;
        this.pythonManager = pythonManager;
        this.panel = null;
        this.onDisposeCallback = onDispose;
        this.disposables = [];

        this.createPanel();
        this.disposables.push(
            pythonManager.onMessage(msg => this.handlePythonResponse(msg)),
            pythonManager.onStateChange(() => this.postStatus())
        );
        // Populate immediately (starts the backend if needed).
        this.pythonManager.getVariables().catch(() => {});
    }

    createPanel() {
        this.panel = vscode.window.createWebviewPanel(
            'variableExplorer',
            'Variable Explorer',
            { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(this.context.extensionPath)]
            }
        );
        this.panel.iconPath = vscode.Uri.file(path.join(this.context.extensionPath, 'logo.png'));
        this.panel.webview.html = getWebviewContent(this.panel.webview, this.context.extensionPath);

        this.disposables.push(this.panel.webview.onDidReceiveMessage(message => {
            Promise.resolve(this.handleMessage(message)).catch(e => {
                vscode.window.showErrorMessage(`Variable Explorer: ${e.message}`);
            });
        }));

        this.panel.onDidDispose(() => {
            this.panel = null;
            this.disposables.forEach(d => d.dispose());
            this.disposables = [];
            // The Python backend keeps running so variables survive closing the panel.
            if (this.onDisposeCallback) {
                this.onDisposeCallback();
            }
        });
    }

    post(message) {
        if (this.panel) {
            this.panel.webview.postMessage(message);
        }
    }

    postStatus() {
        const pm = this.pythonManager;
        this.post({
            command: 'status',
            running: pm.isRunning(),
            busy: pm.isBusy(),
            python: pm.info ? `Python ${pm.info.version}` : '',
            pythonPath: pm.info ? pm.info.python : ''
        });
    }

    async handleMessage(message) {
        const pm = this.pythonManager;
        switch (message.command) {
            case 'ready':
                this.postStatus();
                if (pm.isRunning()) {
                    pm.getVariables().catch(() => {});
                }
                this.post({
                    command: 'setCaptureMainLocals',
                    value: vscode.workspace.getConfiguration('variableExplorer').get('captureMainLocals', false)
                });
                break;
            case 'refresh':
                await pm.getVariables().catch(() => {});
                break;
            case 'viewVariable': {
                const r = await pm.getDetails(message.name, message.path);
                if (r.status === 'error') {
                    vscode.window.showWarningMessage(`Variable Explorer: ${r.error}`);
                }
                break;
            }
            case 'updateVariable': {
                const r = await pm.updateVariable(message.name, message.type, message.value);
                if (r.status === 'error') {
                    vscode.window.showErrorMessage(`Variable Explorer: ${r.error}`);
                }
                break;
            }
            case 'clearNamespace':
                await pm.clearNamespace().catch(() => {});
                break;
            case 'getCaptureMainLocals':
                this.post({
                    command: 'setCaptureMainLocals',
                    value: vscode.workspace.getConfiguration('variableExplorer').get('captureMainLocals', false)
                });
                break;
            case 'updateCaptureMainLocals':
                await vscode.workspace.getConfiguration('variableExplorer')
                    .update('captureMainLocals', !!message.value, vscode.ConfigurationTarget.Global);
                break;
            case 'exportCSV':
                await this.handleExportCSV(message);
                break;
            case 'saveSession':
                await this.handleSaveSession();
                break;
            case 'loadSession':
                await this.handleLoadSession();
                break;
            case 'interrupt':
                await vscode.commands.executeCommand('variableExplorer.interrupt');
                break;
            case 'restart':
                await vscode.commands.executeCommand('variableExplorer.restartBackend');
                break;
            case 'showOutput':
                await vscode.commands.executeCommand('variableExplorer.showOutput');
                break;
        }
    }

    defaultUri(fileName) {
        const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
        return folder ? vscode.Uri.joinPath(folder.uri, fileName) : vscode.Uri.file(fileName);
    }

    async handleSaveSession() {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: this.defaultUri('session.pkl'),
            filters: { 'Pickle Files': ['pkl'], 'All Files': ['*'] },
            title: 'Save Variable Explorer Session'
        });
        if (!uri) {
            return;
        }
        const r = await this.pythonManager.saveSession(uri.fsPath);
        if (r.status === 'error') {
            vscode.window.showErrorMessage(`Variable Explorer: ${r.error}`);
            return;
        }
        const skipped = r.skipped_vars ? r.skipped_vars.length : 0;
        vscode.window.showInformationMessage(
            `Saved ${r.saved_count} variable(s) using ${r.serializer}` + (skipped ? ` (${skipped} skipped)` : ''));
    }

    async handleLoadSession() {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            defaultUri: this.defaultUri(''),
            filters: { 'Pickle Files': ['pkl'], 'All Files': ['*'] },
            title: 'Load Variable Explorer Session'
        });
        if (!uris || uris.length === 0) {
            return;
        }
        const r = await this.pythonManager.loadSession(uris[0].fsPath);
        if (r.status === 'error') {
            vscode.window.showErrorMessage(`Variable Explorer: ${r.error}`);
            return;
        }
        vscode.window.showInformationMessage(`Loaded ${r.loaded_count} variable(s) using ${r.serializer}`);
    }

    /** Filtered rows come pre-built from the webview; full exports are written by pandas. */
    async handleExportCSV(message) {
        const baseName = String(message.name || 'dataframe').replace(/[^\w.-]+/g, '_');
        const uri = await vscode.window.showSaveDialog({
            defaultUri: this.defaultUri(`${baseName}_export.csv`),
            filters: { 'CSV Files': ['csv'], 'All Files': ['*'] }
        });
        if (!uri) {
            return;
        }
        if (typeof message.csvData === 'string') {
            // Filtered rows, already converted to CSV by the webview
            await vscode.workspace.fs.writeFile(uri, Buffer.from(message.csvData, 'utf8'));
            vscode.window.showInformationMessage(
                `Exported ${message.rowCount} rows × ${message.columnCount} columns to ${path.basename(uri.fsPath)}`);
            return;
        }
        const r = await this.pythonManager.exportCsv(message.name, message.path, uri.fsPath);
        if (r.status === 'error') {
            vscode.window.showErrorMessage(`Failed to export CSV: ${r.error}`);
            return;
        }
        vscode.window.showInformationMessage(
            `Exported ${r.rows} rows × ${r.columns} columns to ${path.basename(uri.fsPath)}`);
    }

    handlePythonResponse(response) {
        if (!this.panel) {
            return;
        }
        if (response.command === 'get_details') {
            if (response.status !== 'error') {
                this.post({ command: 'showDetails', data: response });
            }
            return;
        }
        if (VARIABLE_COMMANDS.has(response.command) && Array.isArray(response.variables)) {
            this.post({ command: 'updateVariables', variables: response.variables });
        }
    }

    reveal(preserveFocus = false) {
        if (this.panel) {
            this.panel.reveal(this.panel.viewColumn || vscode.ViewColumn.Two, preserveFocus);
        }
    }

    dispose() {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}

module.exports = { VariableExplorerPanel };
