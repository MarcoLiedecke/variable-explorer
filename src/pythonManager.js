// src/pythonManager.js - Owns the Python backend process and the JSON protocol.
const vscode = require('vscode');
const path = require('path');
const { spawn } = require('child_process');
const { LineSplitter, expandVariables } = require('./utils');
const { resolveInterpreterCandidates, variableContext } = require('./interpreter');

const READY_TIMEOUT_MS = 30000;
const RUN_COMMANDS = new Set(['run_file', 'run_code']);

class PythonManager {
    /**
     * @param {vscode.ExtensionContext} context
     * @param {vscode.OutputChannel} output
     */
    constructor(context, output) {
        this.context = context;
        this.output = output;
        this.process = null;
        this.info = null;
        this.startPromise = null;
        this.pending = new Map();
        this.nextId = 1;
        this.busyCount = 0;
        this.stopping = false;

        this._onMessage = new vscode.EventEmitter();
        /** Fires for every response coming from the backend. */
        this.onMessage = this._onMessage.event;
        this._onStateChange = new vscode.EventEmitter();
        /** Fires when the backend starts/stops or becomes busy/idle. */
        this.onStateChange = this._onStateChange.event;
    }

    log(message) {
        this.output.appendLine(`[backend] ${message}`);
    }

    isRunning() {
        return this.process !== null;
    }

    isBusy() {
        return this.busyCount > 0;
    }

    /**
     * Start the backend if it isn't running. Resolves once the backend has
     * reported that it is ready; rejects (after showing an error) if no
     * interpreter could start it.
     */
    ensureStarted(resource) {
        if (this.process) {
            return Promise.resolve();
        }
        if (!this.startPromise) {
            this.startPromise = this._start(resource).finally(() => {
                this.startPromise = null;
            });
        }
        return this.startPromise;
    }

    /** Backwards compatible alias. */
    start(resource) {
        return this.ensureStarted(resource).catch(() => {});
    }

    async _start(resource) {
        if (!resource && vscode.window.activeTextEditor) {
            resource = vscode.window.activeTextEditor.document.uri;
        }
        const candidates = await resolveInterpreterCandidates(resource, msg => this.log(msg));
        const failures = [];
        for (const candidate of candidates) {
            try {
                await this._spawn(candidate, resource);
                return;
            } catch (e) {
                failures.push(`  • ${candidate.path} (${candidate.source}): ${e.message}`);
                this.log(`Could not start with ${candidate.path}: ${e.message}`);
            }
        }
        const detail = failures.join('\n') || '  (no interpreter candidates found)';
        this.output.appendLine(`Variable Explorer could not start a Python backend. Tried:\n${detail}`);
        vscode.window.showErrorMessage(
            'Variable Explorer: could not start Python. Select an interpreter with "Python: Select Interpreter" ' +
            'or set "variableExplorer.pythonPath".',
            'Show Output', 'Open Settings'
        ).then(choice => {
            if (choice === 'Show Output') {
                this.output.show(true);
            } else if (choice === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'variableExplorer.pythonPath');
            }
        });
        throw new Error('Could not start the Python backend');
    }

    _spawn(candidate, resource) {
        return new Promise((resolve, reject) => {
            const script = path.join(this.context.extensionPath, 'python', 'variable_inspector.py');
            const ctx = variableContext(resource);
            const cwd = ctx.workspaceFolder || undefined;
            const env = Object.assign({}, process.env, {
                PYTHONIOENCODING: 'utf-8',
                PYTHONUNBUFFERED: '1'
            });

            this.log(`Starting ${candidate.path} (${candidate.source})`);
            let proc;
            try {
                proc = spawn(candidate.path, ['-u', script], { cwd, env, windowsHide: true });
            } catch (e) {
                reject(e);
                return;
            }

            let settled = false;
            let stderrTail = '';
            const fail = (err) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                try {
                    proc.kill();
                } catch (e) { /* already gone */ }
                const tail = stderrTail.trim().split(/\r?\n/).slice(-6).join('\n');
                reject(new Error(tail ? `${err.message}\n${tail}` : err.message));
            };
            const timer = setTimeout(() => fail(new Error(`no response after ${READY_TIMEOUT_MS / 1000}s`)), READY_TIMEOUT_MS);

            const splitter = new LineSplitter(line => {
                let msg;
                try {
                    msg = JSON.parse(line);
                } catch (e) {
                    this.log(`Ignoring malformed message (${line.length} chars): ${line.substring(0, 120)}`);
                    return;
                }
                if (msg.event === 'ready' && !settled) {
                    settled = true;
                    clearTimeout(timer);
                    this.process = proc;
                    this.info = msg;
                    this.log(`Python ${msg.version} ready (${msg.python}, pid ${msg.pid})`);
                    this.configure();
                    this._onStateChange.fire();
                    resolve();
                    return;
                }
                this._handleMessage(msg);
            });

            proc.stdout.setEncoding('utf8');
            proc.stdout.on('data', chunk => splitter.push(chunk));
            proc.stderr.setEncoding('utf8');
            proc.stderr.on('data', chunk => {
                stderrTail = (stderrTail + chunk).slice(-4000);
                this.output.append(chunk);
            });
            // Never let a broken pipe crash the extension host.
            proc.stdin.on('error', err => this.log(`stdin error: ${err.message}`));

            proc.on('error', err => {
                if (!settled) {
                    fail(err.code === 'ENOENT' ? new Error('not found') : err);
                } else {
                    this.log(`process error: ${err.message}`);
                }
            });
            proc.on('exit', (code, signal) => {
                if (!settled) {
                    fail(new Error(`exited with ${signal ? 'signal ' + signal : 'code ' + code}`));
                    return;
                }
                this._handleExit(proc, code, signal);
            });
        });
    }

    _handleMessage(msg) {
        if (msg.event === 'output') {
            this.output.append(msg.text);
            return;
        }
        if (msg.id !== undefined && this.pending.has(msg.id)) {
            const entry = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (RUN_COMMANDS.has(entry.command)) {
                this._setBusy(-1);
            }
            entry.resolve(msg);
        }
        this._onMessage.fire(msg);
    }

    _handleExit(proc, code, signal) {
        if (proc !== this.process) {
            return;
        }
        this.process = null;
        this.info = null;
        for (const entry of this.pending.values()) {
            entry.reject(new Error('Python backend exited'));
        }
        this.pending.clear();
        this.busyCount = 0;
        this._onStateChange.fire();

        const expected = this.stopping;
        this.stopping = false;
        this.log(`Backend exited (${signal ? 'signal ' + signal : 'code ' + code})`);
        if (!expected) {
            vscode.window.showWarningMessage(
                `Variable Explorer: the Python backend stopped unexpectedly (${signal || 'code ' + code}). ` +
                'It will restart automatically on the next run; variables were lost.',
                'Show Output'
            ).then(choice => {
                if (choice === 'Show Output') {
                    this.output.show(true);
                }
            });
        }
    }

    _setBusy(delta) {
        this.busyCount = Math.max(0, this.busyCount + delta);
        this._onStateChange.fire();
    }

    /**
     * Send a command and wait for its response. Starts the backend if needed.
     * @returns {Promise<object>} the response (status may be 'error')
     */
    async request(command, payload = {}, resource) {
        await this.ensureStarted(resource);
        const proc = this.process;
        if (!proc) {
            throw new Error('Python backend is not running');
        }
        const id = this.nextId++;
        const message = Object.assign({}, payload, { command, id });
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject, command });
            if (RUN_COMMANDS.has(command)) {
                this._setBusy(1);
            }
            try {
                proc.stdin.write(JSON.stringify(message) + '\n');
            } catch (e) {
                this.pending.delete(id);
                if (RUN_COMMANDS.has(command)) {
                    this._setBusy(-1);
                }
                reject(e);
            }
        });
    }

    /** Fire-and-forget variant; responses still arrive through onMessage. */
    sendCommand(command) {
        const { command: name, ...payload } = command;
        this.request(name, payload).catch(e => this.log(`${name} failed: ${e.message}`));
        return true;
    }

    configure() {
        if (!this.process) {
            return;
        }
        const cfg = vscode.workspace.getConfiguration('variableExplorer');
        const ctx = variableContext();
        const extraPaths = (cfg.get('extraPaths') || [])
            .filter(p => typeof p === 'string' && p.trim())
            .map(p => {
                const expanded = expandVariables(p.trim(), ctx);
                return path.isAbsolute(expanded) || !ctx.workspaceFolder ? expanded : path.resolve(ctx.workspaceFolder, expanded);
            });
        const message = {
            command: 'configure',
            id: this.nextId++,
            workspace_folders: (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath),
            extra_paths: extraPaths,
            reload_modules: cfg.get('reloadUserModules', true),
            max_rows: cfg.get('maxDataFrameRows', 50000)
        };
        try {
            this.process.stdin.write(JSON.stringify(message) + '\n');
        } catch (e) {
            this.log(`configure failed: ${e.message}`);
        }
    }

    // ----- convenience wrappers (all return promises of the response) -----

    runFile(filePath, options = {}) {
        return this.request('run_file', Object.assign({ file: filePath }, options), vscode.Uri.file(filePath));
    }

    runCode(code, options = {}) {
        return this.request('run_code', Object.assign({ code }, options));
    }

    getVariables() {
        return this.request('get_variables');
    }

    getDetails(varName, varPath = null) {
        return this.request('get_details', varPath ? { name: varName, path: varPath } : { name: varName });
    }

    updateVariable(varName, varType, newValue) {
        return this.request('update_variable', { name: varName, type: varType, value: newValue });
    }

    clearNamespace() {
        return this.request('clear_namespace');
    }

    saveSession(filePath) {
        return this.request('save_session', { file: filePath });
    }

    loadSession(filePath) {
        return this.request('load_session', { file: filePath });
    }

    exportCsv(varName, varPath, filePath) {
        return this.request('export_csv', { name: varName, path: varPath || [], file: filePath });
    }

    /**
     * Interrupt running code (KeyboardInterrupt). Returns false when the
     * platform can't deliver SIGINT to the child (Windows).
     */
    interrupt() {
        if (!this.process || !this.isBusy()) {
            return true;
        }
        if (process.platform === 'win32') {
            return false;
        }
        try {
            this.process.kill('SIGINT');
            return true;
        } catch (e) {
            return false;
        }
    }

    stop() {
        if (this.process) {
            this.stopping = true;
            const proc = this.process;
            try {
                proc.stdin.end();
            } catch (e) { /* ignore */ }
            const killTimer = setTimeout(() => {
                try {
                    proc.kill();
                } catch (e) { /* ignore */ }
            }, 1000);
            proc.once('exit', () => clearTimeout(killTimer));
            if (this.isBusy()) {
                proc.kill();
            }
        }
    }

    async restart(resource) {
        if (this.process) {
            const proc = this.process;
            const exited = new Promise(resolve => proc.once('exit', resolve));
            this.stop();
            await exited;
        }
        await this.ensureStarted(resource);
    }

    dispose() {
        this.stop();
        this._onMessage.dispose();
        this._onStateChange.dispose();
    }
}

module.exports = { PythonManager };
