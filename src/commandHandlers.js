// src/commandHandlers.js
const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 * @param {() => any} getPanel
 * @param {import('./pythonManager').PythonManager} pythonManager
 * @param {import('./runner').Runner} runner
 * @param {vscode.OutputChannel} output
 */
function registerCommands(context, getPanel, pythonManager, runner, output) {
    const activePythonEditor = () => {
        const editor = vscode.window.activeTextEditor;
        return editor && editor.document.languageId === 'python' ? editor : undefined;
    };

    const register = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));

    register('variableExplorer.show', () => {
        const panel = getPanel();
        if (panel) {
            panel.reveal();
        }
    });

    register('variableExplorer.refresh', () => {
        getPanel();
        // Starts the backend if necessary instead of complaining that it isn't running.
        pythonManager.getVariables().catch(() => {});
    });

    register('variableExplorer.runFile', async (resource) => {
        if (resource instanceof vscode.Uri && resource.scheme === 'file') {
            const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === resource.toString());
            return doc ? runner.runDocument(doc) : runner.runFile(resource.fsPath);
        }
        const editor = activePythonEditor();
        if (!editor) {
            vscode.window.showErrorMessage('Please open a Python file first.');
            return undefined;
        }
        return runner.runDocument(editor.document);
    });

    register('variableExplorer.runSelection', () => {
        const editor = activePythonEditor();
        if (!editor) {
            return undefined;
        }
        const code = editor.selections
            .map(sel => sel.isEmpty ? editor.document.lineAt(sel.active.line).text : editor.document.getText(sel))
            .join('\n');
        return runner.runCode(code, editor.document);
    });

    register('variableExplorer.runFileInTerminal', async (resource) => {
        let document;
        if (resource instanceof vscode.Uri) {
            document = vscode.workspace.textDocuments.find(d => d.uri.toString() === resource.toString()) ||
                await vscode.workspace.openTextDocument(resource);
        } else {
            const editor = activePythonEditor();
            document = editor && editor.document;
        }
        if (!document) {
            vscode.window.showErrorMessage('Please open a Python file first.');
            return;
        }
        if (document.isUntitled) {
            vscode.window.showErrorMessage('Please save the file first.');
            return;
        }
        if (document.isDirty) {
            await document.save();
        }
        const filePath = document.uri.fsPath;

        // Start the terminal run first so the terminal monitor sees our run
        // and doesn't trigger a second one.
        const explorerRun = runner.runFile(filePath, { shadow: true });
        try {
            await vscode.commands.executeCommand('python.execInTerminal', document.uri);
        } catch (e) {
            output.appendLine(`Could not run in terminal (is the Python extension installed?): ${e.message}`);
        }
        await explorerRun;
    });

    register('variableExplorer.restartBackend', async () => {
        try {
            await pythonManager.restart();
            vscode.window.showInformationMessage(
                `Variable Explorer: backend restarted (Python ${pythonManager.info ? pythonManager.info.version : ''}).`);
            pythonManager.getVariables().catch(() => {});
        } catch (e) {
            // already reported
        }
    });

    register('variableExplorer.interrupt', async () => {
        if (!pythonManager.isBusy()) {
            return;
        }
        if (!pythonManager.interrupt()) {
            const choice = await vscode.window.showWarningMessage(
                'Variable Explorer: interrupting is not supported on Windows. Restart the backend? All variables will be lost.',
                { modal: true }, 'Restart');
            if (choice === 'Restart') {
                await vscode.commands.executeCommand('variableExplorer.restartBackend');
            }
        }
    });

    register('variableExplorer.showOutput', () => output.show(true));

    register('variableExplorer.support', () => {
        vscode.env.openExternal(vscode.Uri.parse('https://buymeacoffee.com/marcoliedecke'));
    });
}

module.exports = { registerCommands };
