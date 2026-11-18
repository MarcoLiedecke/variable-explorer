// src/extension.js - Main extension entry point
const vscode = require('vscode');
const { registerCommands } = require('./commandHandlers');
const { PythonManager } = require('./pythonManager');
const { Runner } = require('./runner');
const { VariableExplorerPanel } = require('./webview/variableExplorerPanel');
const { TerminalMonitor } = require('./terminalMonitor');
const { onDidChangeInterpreter } = require('./interpreter');

let pythonManager;

function activate(context) {
    const output = vscode.window.createOutputChannel('Variable Explorer');
    context.subscriptions.push(output);

    pythonManager = new PythonManager(context, output);
    context.subscriptions.push(pythonManager);

    let panel = null;
    const getPanel = () => {
        if (!panel) {
            panel = new VariableExplorerPanel(context, pythonManager, () => {
                panel = null;
            });
        }
        return panel;
    };
    context.subscriptions.push({ dispose: () => panel && panel.dispose() });

    const runner = new Runner(pythonManager, getPanel, output);
    registerCommands(context, getPanel, pythonManager, runner, output);

    const terminalMonitor = new TerminalMonitor(runner);
    terminalMonitor.start();
    context.subscriptions.push(terminalMonitor);

    // Status bar: shows while code runs; click to interrupt.
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    status.command = 'variableExplorer.interrupt';
    status.text = '$(sync~spin) Variable Explorer: running';
    status.tooltip = 'Click to interrupt';
    context.subscriptions.push(status, pythonManager.onStateChange(() => {
        if (pythonManager.isBusy()) {
            status.show();
        } else {
            status.hide();
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('variableExplorer.extraPaths') ||
            e.affectsConfiguration('variableExplorer.reloadUserModules') ||
            e.affectsConfiguration('variableExplorer.maxDataFrameRows') ||
            e.affectsConfiguration('workspace')) {
            pythonManager.configure();
        }
        if (e.affectsConfiguration('variableExplorer.pythonPath')) {
            offerRestart('The Python path setting changed.');
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => pythonManager.configure()));

    // Follow interpreter changes made with "Python: Select Interpreter".
    onDidChangeInterpreter(() => offerRestart('The selected Python interpreter changed.'))
        .then(d => d && context.subscriptions.push(d))
        .catch(() => {});
}

async function offerRestart(reason) {
    if (!pythonManager || !pythonManager.isRunning()) {
        return; // next run picks up the new interpreter automatically
    }
    const choice = await vscode.window.showInformationMessage(
        `Variable Explorer: ${reason} Restart the backend to use it? Current variables will be lost.`,
        'Restart', 'Later');
    if (choice === 'Restart') {
        vscode.commands.executeCommand('variableExplorer.restartBackend');
    }
}

function deactivate() {
    if (pythonManager) {
        pythonManager.stop();
    }
}

module.exports = { activate, deactivate };
