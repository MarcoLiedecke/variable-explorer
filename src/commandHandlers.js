// src/commandHandlers.js
const vscode = require('vscode');

function registerCommands(context, getPanel, pythonManager) {
    
    const showExplorer = vscode.commands.registerCommand('variableExplorer.show', () => {
        const panel = getPanel();
        if (panel) {
            panel.reveal();
        }
    });

    const refreshVars = vscode.commands.registerCommand('variableExplorer.refresh', () => {
        const panel = getPanel();
        if (panel) {
            pythonManager.getVariables();
        }
    });

    const runFile = vscode.commands.registerCommand('variableExplorer.runFile', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'python') {
            const panel = getPanel();
            if (!panel) {
                vscode.commands.executeCommand('variableExplorer.show');
                setTimeout(() => {
                    pythonManager.runFile(editor.document.uri.fsPath);
                }, 500);
            } else {
                pythonManager.runFile(editor.document.uri.fsPath);
            }
        } else {
            vscode.window.showErrorMessage('Please open a Python file first.');
        }
    });

    const runSelection = vscode.commands.registerCommand('variableExplorer.runSelection', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'python') {
            const panel = getPanel();
            if (!panel) {
                vscode.commands.executeCommand('variableExplorer.show');
                setTimeout(() => {
                    executeSelection(editor, pythonManager);
                }, 1000);
            } else {
                executeSelection(editor, pythonManager);
            }
        }
    });

    context.subscriptions.push(showExplorer, refreshVars, runFile, runSelection);
}

function executeSelection(editor, pythonManager) {
    const selection = editor.selection;
    let code;
    
    if (selection.isEmpty) {
        const lineNumber = selection.active.line;
        code = editor.document.lineAt(lineNumber).text;
    } else {
        code = editor.document.getText(selection);
    }
    
    if (code.trim()) {
        pythonManager.runCode(code);
    }
}

module.exports = { registerCommands };