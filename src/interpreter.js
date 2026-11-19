// src/interpreter.js - Figure out which Python interpreter the backend should use.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { expandVariables } = require('./utils');

const IS_WINDOWS = process.platform === 'win32';

function variableContext(resource) {
    const folders = (vscode.workspace.workspaceFolders || []).map(f => ({ name: f.name, path: f.uri.fsPath }));
    const folder = resource ? vscode.workspace.getWorkspaceFolder(resource) : undefined;
    return { workspaceFolder: folder ? folder.uri.fsPath : (folders[0] && folders[0].path), workspaceFolders: folders };
}

function withTimeout(promise, ms) {
    let timer;
    return Promise.race([
        promise,
        new Promise(resolve => { timer = setTimeout(() => resolve(undefined), ms); })
    ]).finally(() => clearTimeout(timer));
}

/**
 * Ask the Python extension (ms-python.python) for the interpreter the user
 * selected for this resource. This is the same interpreter that "Run Python
 * File" uses in the terminal, so variables match what the user expects.
 */
async function getPythonExtensionApi() {
    const ext = vscode.extensions.getExtension('ms-python.python');
    if (!ext) {
        return undefined;
    }
    try {
        return ext.isActive ? ext.exports : await withTimeout(Promise.resolve(ext.activate()), 15000);
    } catch (e) {
        return undefined;
    }
}

async function getPythonExtensionInterpreter(resource) {
    const api = await getPythonExtensionApi();
    if (!api) {
        return undefined;
    }
    try {
        if (api.environments && typeof api.environments.getActiveEnvironmentPath === 'function') {
            const envPath = api.environments.getActiveEnvironmentPath(resource);
            if (envPath) {
                let resolved;
                if (typeof api.environments.resolveEnvironment === 'function') {
                    resolved = await withTimeout(Promise.resolve(api.environments.resolveEnvironment(envPath)), 10000);
                }
                const exe = resolved && resolved.executable && resolved.executable.uri && resolved.executable.uri.fsPath;
                if (exe) {
                    return exe;
                }
                if (envPath.path && !isDirectory(envPath.path)) {
                    return envPath.path;
                }
            }
        }
        // Older versions of the Python extension
        if (api.settings && typeof api.settings.getExecutionDetails === 'function') {
            const details = api.settings.getExecutionDetails(resource);
            if (details && Array.isArray(details.execCommand) && details.execCommand[0]) {
                return details.execCommand[0];
            }
        }
    } catch (e) {
        // fall through to other strategies
    }
    return undefined;
}

/**
 * Subscribe to interpreter changes made through the Python extension.
 * @returns {Promise<vscode.Disposable | undefined>}
 */
async function onDidChangeInterpreter(listener) {
    const api = await getPythonExtensionApi();
    if (api && api.environments && typeof api.environments.onDidChangeActiveEnvironmentPath === 'function') {
        return api.environments.onDidChangeActiveEnvironmentPath(listener);
    }
    return undefined;
}

function isDirectory(p) {
    try {
        return fs.statSync(p).isDirectory();
    } catch (e) {
        return false;
    }
}

function isFile(p) {
    try {
        return fs.statSync(p).isFile();
    } catch (e) {
        return false;
    }
}

/** If the user pointed at a venv/conda folder instead of the executable, find it. */
function normalizeInterpreterPath(p) {
    if (!p || !isDirectory(p)) {
        return p;
    }
    const candidates = IS_WINDOWS
        ? ['python.exe', path.join('Scripts', 'python.exe')]
        : [path.join('bin', 'python3'), path.join('bin', 'python')];
    for (const c of candidates) {
        const full = path.join(p, c);
        if (isFile(full)) {
            return full;
        }
    }
    return p;
}

function looksLikePath(p) {
    return path.isAbsolute(p) || p.includes('/') || p.includes('\\');
}

function localVenvInterpreters(resource) {
    const folders = [];
    const folder = resource ? vscode.workspace.getWorkspaceFolder(resource) : undefined;
    if (folder) {
        folders.push(folder.uri.fsPath);
    }
    for (const f of vscode.workspace.workspaceFolders || []) {
        if (!folders.includes(f.uri.fsPath)) {
            folders.push(f.uri.fsPath);
        }
    }
    const found = [];
    for (const root of folders) {
        for (const name of ['.venv', 'venv', 'env']) {
            const exe = IS_WINDOWS
                ? path.join(root, name, 'Scripts', 'python.exe')
                : path.join(root, name, 'bin', 'python');
            if (isFile(exe)) {
                found.push(exe);
            }
        }
    }
    return found;
}

/**
 * Ordered list of interpreters to try. The PythonManager tries them in order
 * and uses the first one that actually starts the backend.
 *
 * @returns {Promise<{path: string, source: string}[]>}
 */
async function resolveInterpreterCandidates(resource, log = () => {}) {
    const candidates = [];
    const ctx = variableContext(resource);
    const add = (p, source) => {
        if (!p || typeof p !== 'string') {
            return;
        }
        let resolved = normalizeInterpreterPath(expandVariables(p.trim(), ctx));
        if (!resolved) {
            return;
        }
        if (resolved.includes('${')) {
            log(`Ignoring ${source} "${p}": contains an unsupported variable.`);
            return;
        }
        if (looksLikePath(resolved)) {
            if (!path.isAbsolute(resolved) && ctx.workspaceFolder) {
                resolved = path.resolve(ctx.workspaceFolder, resolved);
            }
            if (!isFile(resolved)) {
                log(`Ignoring ${source} "${p}": ${resolved} does not exist.`);
                return;
            }
        }
        if (!candidates.some(c => c.path === resolved)) {
            candidates.push({ path: resolved, source });
        }
    };

    // 1. Explicit setting for this extension always wins.
    add(vscode.workspace.getConfiguration('variableExplorer', resource).get('pythonPath'), 'variableExplorer.pythonPath');
    // 2. The interpreter selected in the Python extension.
    add(await getPythonExtensionInterpreter(resource), 'Python extension');
    // 3. python.defaultInterpreterPath (only used by the Python extension as an initial default).
    const defaultPath = vscode.workspace.getConfiguration('python', resource).get('defaultInterpreterPath');
    if (defaultPath && defaultPath !== 'python') {
        add(defaultPath, 'python.defaultInterpreterPath');
    }
    // 4. A virtual environment inside the workspace (uv, venv, poetry in-project, ...).
    for (const exe of localVenvInterpreters(resource)) {
        add(exe, 'workspace virtual environment');
    }
    // 5. Whatever is on PATH.
    const fallbacks = IS_WINDOWS ? ['python', 'py', 'python3'] : ['python3', 'python'];
    for (const exe of fallbacks) {
        add(exe, 'PATH');
    }
    return candidates;
}

module.exports = { resolveInterpreterCandidates, onDidChangeInterpreter, variableContext };
