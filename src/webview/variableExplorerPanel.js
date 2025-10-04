// src/webview/variableExplorerPanel.js
const vscode = require('vscode');
const { getWebviewContent } = require('./webviewContent');

class VariableExplorerPanel {
    constructor(context, pythonManager) {
        this.context = context;
        this.pythonManager = pythonManager;
        this.panel = null;

        this.createPanel();
        this.startPythonBackend();
    }

    createPanel() {
        this.panel = vscode.window.createWebviewPanel(
            'variableExplorer',
            'Variable Explorer',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = getWebviewContent(this.panel.webview, this.context.extensionPath);

        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message)
        );

        this.panel.onDidDispose(() => {
            this.panel = null;
            this.pythonManager.dispose();
        });
    }

    startPythonBackend() {
        if (!this.pythonManager.isRunning()) {
            this.pythonManager.start((response) => {
                this.handlePythonResponse(response);
            });
        }
    }

    handleMessage(message) {
        switch (message.command) {
            case 'refresh':
                this.pythonManager.getVariables();
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