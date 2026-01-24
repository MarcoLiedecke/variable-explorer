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
            // Ensure backend is started before refreshing
            if (!pythonManager.isRunning()) {
                vscode.window.showWarningMessage('Python backend is not running. Please run some Python code first.');
                return;
            }
            pythonManager.getVariables();
        }
    });

    const runFile = vscode.commands.registerCommand('variableExplorer.runFile', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'python') {
            const panel = getPanel();
            panel.reveal(); // Ensure panel is visible

            // Wait for backend to be ready if panel was just created
            const executeRun = () => {
                if (pythonManager.isRunning()) {
                    pythonManager.runFile(editor.document.uri.fsPath);
                } else {
                    // Backend should be starting, wait a bit longer
                    setTimeout(() => {
                        if (pythonManager.isRunning()) {
                            pythonManager.runFile(editor.document.uri.fsPath);
                        } else {
                            vscode.window.showErrorMessage('Failed to start Python backend. Please check your Python installation.');
                        }
                    }, 1000);
                }
            };

            executeRun();
        } else {
            vscode.window.showErrorMessage('Please open a Python file first.');
        }
    });

    const runSelection = vscode.commands.registerCommand('variableExplorer.runSelection', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'python') {
            const panel = getPanel();
            panel.reveal(); // Ensure panel is visible

            // Wait for backend to be ready if panel was just created
            const executeRun = () => {
                if (pythonManager.isRunning()) {
                    executeSelection(editor, pythonManager);
                } else {
                    // Backend should be starting, wait a bit longer
                    setTimeout(() => {
                        if (pythonManager.isRunning()) {
                            executeSelection(editor, pythonManager);
                        } else {
                            vscode.window.showErrorMessage('Failed to start Python backend. Please check your Python installation.');
                        }
                    }, 1000);
                }
            };

            executeRun();
        }
    });

    const support = vscode.commands.registerCommand('variableExplorer.support', () => {
        vscode.env.openExternal(vscode.Uri.parse('https://buymeacoffee.com/marcoliedecke'));
    });

    // New command: Run file in both terminal AND Variable Explorer
    const runFileInTerminal = vscode.commands.registerCommand('variableExplorer.runFileInTerminal', async (resource) => {
        // Get the file to run
        let filePath;
        if (resource && resource.fsPath) {
            filePath = resource.fsPath;
        } else {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'python') {
                filePath = editor.document.uri.fsPath;
            }
        }

        if (!filePath) {
            vscode.window.showErrorMessage('Please open a Python file first.');
            return;
        }

        // Run in Variable Explorer
        const panel = getPanel();
        panel.reveal();

        const executeInExplorer = () => {
            if (pythonManager.isRunning()) {
                pythonManager.runFile(filePath);
            } else {
                setTimeout(() => {
                    if (pythonManager.isRunning()) {
                        pythonManager.runFile(filePath);
                    }
                }, 1000);
            }
        };
        executeInExplorer();

        // Also run in terminal using Python extension
        try {
            await vscode.commands.executeCommand('python.execInTerminal', vscode.Uri.file(filePath));
        } catch (e) {
            // Python extension might not be installed, that's OK
            console.log('Could not execute python.execInTerminal:', e.message);
        }
    });

    context.subscriptions.push(showExplorer, refreshVars, runFile, runSelection, support, runFileInTerminal);
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