// Drives the real extension modules (PythonManager, Runner, panel) against the
// real Python backend, with a mocked `vscode` API.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMock, installMock } = require('./mockVscode');

const { vscode, state } = createMock();
installMock(vscode);

const { PythonManager } = require('../../src/pythonManager');
const { Runner } = require('../../src/runner');
const { VariableExplorerPanel } = require('../../src/webview/variableExplorerPanel');

const ROOT = path.resolve(__dirname, '..', '..');
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

function setup() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 've-int-'));
    state.workspaceFolders = [{ name: 'ws', uri: vscode.Uri.file(tmp) }];
    state.config = { 'variableExplorer.pythonPath': PYTHON, 'variableExplorer.showOutputOnRun': false };
    state.messages = [];
    state.posted = [];
    state.output = [];
    const context = { extensionPath: ROOT, subscriptions: [] };
    const output = vscode.window.createOutputChannel();
    const pm = new PythonManager(context, output);
    let panel = null;
    const getPanel = () => {
        if (!panel) {
            panel = new VariableExplorerPanel(context, pm, () => { panel = null; });
        }
        return panel;
    };
    const runner = new Runner(pm, getPanel, output);
    return { tmp, pm, runner, getPanel, cleanup: () => { pm.dispose(); fs.rmSync(tmp, { recursive: true, force: true }); } };
}

const lastPosted = (command) => [...state.posted].reverse().find(m => m.command === command);
const waitFor = async (pred, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = pred();
        if (v) {
            return v;
        }
        await new Promise(r => setTimeout(r, 20));
    }
    throw new Error('timeout');
};

test('runs a file that imports a sibling module (#5, #7) and shows variables', async () => {
    const { tmp, runner, cleanup } = setup();
    try {
        fs.mkdirSync(path.join(tmp, 'src'));
        fs.writeFileSync(path.join(tmp, 'src', 'config.py'), 'NAME = "cfg"\n');
        fs.writeFileSync(path.join(tmp, 'src', 'main.py'), 'from config import NAME\nimport os\nx = NAME\ncwd = os.getcwd()\nprint("hi from script")\n');
        const r = await runner.runFile(path.join(tmp, 'src', 'main.py'));
        assert.strictEqual(r.status, 'success', r.error);
        const vars = lastPosted('updateVariables').variables;
        const byName = Object.fromEntries(vars.map(v => [v.name, v]));
        assert.strictEqual(byName.x.value, 'cfg');
        // cwd follows the Python extension's default: the workspace folder
        assert.strictEqual(fs.realpathSync(byName.cwd.value), fs.realpathSync(tmp));
        assert.ok(state.output.join('').includes('hi from script'));
        assert.deepStrictEqual(state.messages.filter(m => m.level === 'error'), []);
    } finally {
        cleanup();
    }
});

test('workspace-relative ${workspaceFolder} python path is expanded (#7)', async () => {
    const { tmp, pm, cleanup } = setup();
    try {
        // Point at a fake venv layout that symlinks the real interpreter
        const which = require('child_process').execFileSync(PYTHON, ['-c', 'import sys; print(sys.executable)']).toString().trim();
        const bin = path.join(tmp, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin');
        fs.mkdirSync(bin, { recursive: true });
        const exe = path.join(bin, process.platform === 'win32' ? 'python.exe' : 'python');
        fs.symlinkSync(which, exe);
        state.config['variableExplorer.pythonPath'] = '${workspaceFolder}/.venv/' + (process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
        await pm.ensureStarted();
        assert.ok(pm.isRunning());
        assert.ok(state.output.join('').includes(`Starting ${exe}`));
    } finally {
        cleanup();
    }
});

test('falls back to the next interpreter when the configured one is missing', async () => {
    const { pm, cleanup } = setup();
    try {
        state.config['variableExplorer.pythonPath'] = '/definitely/not/python';
        await pm.ensureStarted();
        assert.ok(pm.isRunning());
        assert.ok(state.output.join('').includes('does not exist'));
    } finally {
        cleanup();
    }
});

test('sys.exit in user code keeps the backend alive', async () => {
    const { tmp, runner, pm, cleanup } = setup();
    try {
        fs.writeFileSync(path.join(tmp, 'exit.py'), 'a = 1\nimport sys\nsys.exit()\n');
        const r = await runner.runFile(path.join(tmp, 'exit.py'));
        assert.strictEqual(r.status, 'success');
        assert.ok(pm.isRunning());
        const v = await pm.getVariables();
        assert.ok(v.variables.some(x => x.name === 'a'));
    } finally {
        cleanup();
    }
});

test('webview round trip: details, edit, export, dedupe', async () => {
    const { tmp, runner, getPanel, pm, cleanup } = setup();
    try {
        getPanel();
        await runner.runCode('d = {1: "one", "k": [1, 2, 3]}\nlong = "z" * 500\nn = 5');
        state.sendFromWebview({ command: 'viewVariable', name: 'd', path: ['k'] });
        const details = await waitFor(() => lastPosted('showDetails'));
        assert.deepStrictEqual(details.data.items.map(i => i.value), ['1', '2', '3']);

        state.sendFromWebview({ command: 'viewVariable', name: 'long' });
        const full = await waitFor(() => state.posted.find(m => m.command === 'showDetails' && m.data.name === 'long'));
        assert.strictEqual(full.data.full_value.length, 500);

        state.sendFromWebview({ command: 'updateVariable', name: 'n', type: 'int', value: '7' });
        await waitFor(() => {
            const u = lastPosted('updateVariables');
            return u && u.variables.find(v => v.name === 'n' && v.value === '7');
        });

        // Two triggers for the same file within a few seconds -> one run
        fs.writeFileSync(path.join(tmp, 'count.py'), 'try:\n    runs += 1\nexcept NameError:\n    runs = 1\n');
        const file = path.join(tmp, 'count.py');
        await Promise.all([runner.runFile(file, { shadow: true }), runner.runFile(file, { shadow: true, dedupe: true })]);
        const v = await pm.getVariables();
        assert.strictEqual(v.variables.find(x => x.name === 'runs').value, '1');
    } finally {
        cleanup();
    }
});

test('backend crash is reported and the next run restarts it', async () => {
    const { runner, pm, cleanup } = setup();
    try {
        await runner.runCode('import os\nos._exit(3)');
        await waitFor(() => !pm.isRunning());
        assert.ok(state.messages.some(m => m.level === 'warning' && m.text.includes('stopped unexpectedly')));
        const r = await runner.runCode('b = 2');
        assert.strictEqual(r.status, 'success');
        assert.ok(pm.isRunning());
    } finally {
        cleanup();
    }
});

test('CSV export writes all rows via pandas', async (t) => {
    const { tmp, runner, getPanel, cleanup } = setup();
    try {
        getPanel();
        const r = await runner.runCode('import pandas as pd\ndf = pd.DataFrame({"a": range(2000), "t": pd.date_range("2024", periods=2000, freq="h")})');
        if (r.status === 'error' && /No module named/.test(r.error)) {
            t.skip('pandas not installed');
            return;
        }
        const out = path.join(tmp, 'out.csv');
        state.dialogs.save = vscode.Uri.file(out);
        state.sendFromWebview({ command: 'exportCSV', name: 'df', path: [] });
        await waitFor(() => state.messages.find(m => m.level === 'info' && m.text.startsWith('Exported')));
        assert.strictEqual(fs.readFileSync(out, 'utf8').trim().split('\n').length, 2001);
    } finally {
        cleanup();
    }
});
