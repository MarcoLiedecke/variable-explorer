// Minimal stand-in for the `vscode` module so extension code can run under plain Node.
const path = require('path');
const Module = require('module');

class EventEmitter {
    constructor() {
        this.listeners = [];
        this.event = (fn) => {
            this.listeners.push(fn);
            return { dispose: () => { this.listeners = this.listeners.filter(l => l !== fn); } };
        };
    }
    fire(value) {
        for (const l of [...this.listeners]) {
            l(value);
        }
    }
    dispose() {
        this.listeners = [];
    }
}

const Uri = {
    file: (p) => ({ fsPath: p, scheme: 'file', path: p, toString: () => 'file://' + p }),
    joinPath: (base, ...parts) => Uri.file(path.join(base.fsPath, ...parts)),
    parse: (s) => ({ toString: () => s })
};

function createMock() {
    const state = {
        config: {},
        messages: [],        // [{level, text}]
        posted: [],          // messages posted to the webview
        commands: new Map(),
        workspaceFolders: [],
        output: [],
        dialogs: { save: null, open: null }
    };
    const notify = level => (text, ...items) => {
        state.messages.push({ level, text, items });
        return Promise.resolve(undefined);
    };
    const configChanged = new EventEmitter();

    const vscode = {
        EventEmitter,
        Uri,
        ViewColumn: { One: 1, Two: 2 },
        StatusBarAlignment: { Left: 1, Right: 2 },
        ConfigurationTarget: { Global: 1 },
        workspace: {
            get workspaceFolders() {
                return state.workspaceFolders;
            },
            getWorkspaceFolder: (uri) => state.workspaceFolders.find(f => uri.fsPath.startsWith(f.uri.fsPath + path.sep)),
            getConfiguration: (section) => ({
                get: (key, def) => {
                    const v = state.config[`${section}.${key}`];
                    return v === undefined ? def : v;
                },
                update: async (key, value) => { state.config[`${section}.${key}`] = value; }
            }),
            onDidChangeConfiguration: configChanged.event,
            onDidChangeWorkspaceFolders: new EventEmitter().event,
            textDocuments: [],
            openTextDocument: async () => { throw new Error('not supported in mock'); },
            fs: { writeFile: async () => {} }
        },
        window: {
            activeTextEditor: undefined,
            showErrorMessage: notify('error'),
            showWarningMessage: notify('warning'),
            showInformationMessage: notify('info'),
            showSaveDialog: async () => state.dialogs.save,
            showOpenDialog: async () => state.dialogs.open,
            createOutputChannel: () => ({
                append: t => state.output.push(t),
                appendLine: t => state.output.push(t + '\n'),
                show: () => {},
                dispose: () => {}
            }),
            createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
            createWebviewPanel: () => {
                const received = new EventEmitter();
                const disposed = new EventEmitter();
                const panel = {
                    viewColumn: 2,
                    webview: {
                        html: '',
                        cspSource: 'mock',
                        asWebviewUri: u => u,
                        postMessage: m => { state.posted.push(m); return Promise.resolve(true); },
                        onDidReceiveMessage: received.event
                    },
                    reveal() {},
                    onDidDispose: disposed.event,
                    dispose: () => disposed.fire()
                };
                state.panel = panel;
                state.sendFromWebview = m => received.fire(m);
                return panel;
            },
            onDidOpenTerminal: new EventEmitter().event,
            onDidCloseTerminal: new EventEmitter().event
        },
        extensions: { getExtension: () => undefined },
        commands: {
            registerCommand: (id, fn) => { state.commands.set(id, fn); return { dispose() {} }; },
            executeCommand: async (id, ...args) => {
                const fn = state.commands.get(id);
                return fn ? fn(...args) : undefined;
            }
        },
        env: { openExternal: async () => true }
    };
    return { vscode, state, fireConfigChange: e => configChanged.fire(e) };
}

/** Make require('vscode') return the given mock. */
function installMock(vscode) {
    const originalLoad = Module._load;
    Module._load = function (request, ...rest) {
        if (request === 'vscode') {
            return vscode;
        }
        return originalLoad.call(this, request, ...rest);
    };
}

module.exports = { createMock, installMock };
