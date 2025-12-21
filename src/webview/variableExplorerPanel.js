// src/webview/variableExplorerPanel.js
const vscode = require('vscode');
const path = require('path');
const { getWebviewContent } = require('./webviewContent');

class VariableExplorerPanel {
    constructor(context, pythonManager, onDispose) {
        this.context = context;
        this.pythonManager = pythonManager;
        this.panel = null;
        this.onDisposeCallback = onDispose;

        this.createPanel();
        this.startPythonBackend();
    }

    createPanel() {
        // Get icon URI for the webview panel tab
        const iconPath = vscode.Uri.file(
            path.join(this.context.extensionPath, 'logo.png')
        );

        this.panel = vscode.window.createWebviewPanel(
            'variableExplorer',
            'Variable Explorer',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Set the icon for the webview panel tab
        this.panel.iconPath = iconPath;

        this.panel.webview.html = getWebviewContent(this.panel.webview, this.context.extensionPath);

        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message)
        );

        this.panel.onDidDispose(() => {
            this.panel = null;
            // Don't dispose the Python backend - keep it running for other operations
            // Notify extension.js that the panel was disposed
            if (this.onDisposeCallback) {
                this.onDisposeCallback();
            }
        });
    }

    startPythonBackend() {
        if (!this.pythonManager.isRunning()) {
            this.pythonManager.start((response) => {
                this.handlePythonResponse(response);
            });
        } else {
            // Backend is already running, just update the callback and request current variables
            this.pythonManager.start((response) => {
                this.handlePythonResponse(response);
            });
            // Request current variables to populate the reopened panel
            this.pythonManager.getVariables();
        }
    }

    handleMessage(message) {
        switch (message.command) {
            case 'refresh':
                if (!this.pythonManager.isRunning()) {
                    // Try to restart the backend
                    this.startPythonBackend();
                    setTimeout(() => {
                        if (this.pythonManager.isRunning()) {
                            this.pythonManager.getVariables();
                        }
                    }, 500);
                } else {
                    this.pythonManager.getVariables();
                }
                break;
            case 'viewVariable':
                this.pythonManager.getDetails(message.name, message.path);
                break;
            case 'updateVariable':
                this.pythonManager.updateVariable(message.name, message.type, message.value);
                break;
            case 'clearNamespace':
                console.log('Clearing namespace');
                this.pythonManager.clearNamespace();
                break;
            case 'getCaptureMainLocals':
                // Send the current setting value to the webview
                const currentValue = vscode.workspace.getConfiguration('variableExplorer').get('captureMainLocals', false);
                this.panel.webview.postMessage({
                    command: 'setCaptureMainLocals',
                    value: currentValue
                });
                break;
            case 'updateCaptureMainLocals':
                // Update the VS Code setting
                vscode.workspace.getConfiguration('variableExplorer').update('captureMainLocals', message.value, vscode.ConfigurationTarget.Global);
                break;
            case 'exportCSV':
                this.handleExportCSV(message);
                break;
        }
    }

    async handleExportCSV(message) {
        try {
            const { fileName, csvData, rowCount, columnCount } = message;

            // Show save dialog
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(fileName),
                filters: {
                    'CSV Files': ['csv'],
                    'All Files': ['*']
                }
            });

            if (uri) {
                // Write the CSV data to the selected file
                const buffer = Buffer.from(csvData, 'utf8');
                await vscode.workspace.fs.writeFile(uri, buffer);

                vscode.window.showInformationMessage(
                    `Exported ${rowCount} rows × ${columnCount} columns to ${path.basename(uri.fsPath)}`
                );
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export CSV: ${error.message}`);
        }
    }

    handlePythonResponse(response) {
        if (!this.panel) return;
        if (response.status === 'error') {
            vscode.window.showErrorMessage(`Variable Explorer: ${response.error}`);
            // Still update variables if present
            if (response.variables) {
                this.panel.webview.postMessage({
                    command: 'updateVariables',
                    variables: response.variables
                });
            }
        } else if (response.variables) {
            this.panel.webview.postMessage({
                command: 'updateVariables',
                variables: response.variables
            });
        } else if (response.name) {
            this.panel.webview.postMessage({
                command: 'showDetails',
                data: response
            });
        }
    }

    reveal() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
        }
    }

    dispose() {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}

module.exports = { VariableExplorerPanel };