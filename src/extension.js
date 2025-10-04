// src/extension.js - Main extension entry point
const vscode = require('vscode');
const { registerCommands } = require('./commandHandlers');
const { PythonManager } = require('./pythonManager');
const { VariableExplorerPanel } = require('./webview/variableExplorerPanel');

let pythonManager;
let variableExplorerPanel;

function activate(context) {
    console.log('Variable Explorer extension is now active');

    // Initialize Python manager
    pythonManager = new PythonManager(context);

    // Function to get or create panel
    const getPanel = () => {
        if (!variableExplorerPanel) {
            variableExplorerPanel = new VariableExplorerPanel(context, pythonManager);
        }
        return variableExplorerPanel;
    };

    // Register all commands
    registerCommands(context, getPanel, pythonManager);

    // Clean up on deactivation
    context.subscriptions.push({
        dispose: () => {
            if (variableExplorerPanel) {
                variableExplorerPanel.dispose();
            }
            if (pythonManager) {
                pythonManager.dispose();
            }
        }
    });
}

function deactivate() {
    if (pythonManager) {
        pythonManager.dispose();
    }
}

module.exports = {
    activate,
    deactivate
};