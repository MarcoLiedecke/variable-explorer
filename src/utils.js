// src/utils.js - Pure helpers (no `vscode` dependency, so they can be unit tested)
const os = require('os');
const path = require('path');

/**
 * Splits a stream of text chunks into lines.
 *
 * Only the newly received chunk is scanned for newlines and partial lines are
 * kept as an array of pieces, so a multi-megabyte JSON message (a large
 * DataFrame) costs O(n) instead of O(n^2) string concatenation + rescanning.
 */
class LineSplitter {
    constructor(onLine) {
        this.onLine = onLine;
        this.pending = [];
    }

    push(chunk) {
        let start = 0;
        let idx;
        while ((idx = chunk.indexOf('\n', start)) !== -1) {
            let piece = chunk.substring(start, idx);
            if (this.pending.length > 0) {
                this.pending.push(piece);
                piece = this.pending.join('');
                this.pending = [];
            }
            if (piece.endsWith('\r')) {
                piece = piece.slice(0, -1);
            }
            if (piece.length > 0) {
                this.onLine(piece);
            }
            start = idx + 1;
        }
        if (start < chunk.length) {
            this.pending.push(chunk.substring(start));
        }
    }

    reset() {
        this.pending = [];
    }
}

/**
 * Expands the VS Code style variables people put into interpreter settings,
 * e.g. "${workspaceFolder}/.venv/bin/python" or "~/envs/x/bin/python".
 *
 * @param {string} value
 * @param {{workspaceFolder?: string, workspaceFolders?: {name: string, path: string}[], env?: object, home?: string}} ctx
 */
function expandVariables(value, ctx = {}) {
    if (typeof value !== 'string' || value.length === 0) {
        return value;
    }
    const env = ctx.env || process.env;
    const home = ctx.home || os.homedir();
    const folders = ctx.workspaceFolders || [];
    const workspaceFolder = ctx.workspaceFolder || (folders[0] && folders[0].path) || '';

    let result = value.replace(/\$\{([^}]+)\}/g, (match, name) => {
        if (name === 'workspaceFolder' || name === 'workspaceRoot') {
            return workspaceFolder || match;
        }
        if (name === 'workspaceFolderBasename') {
            return workspaceFolder ? path.basename(workspaceFolder) : match;
        }
        if (name === 'userHome') {
            return home;
        }
        if (name.startsWith('workspaceFolder:')) {
            const wanted = name.substring('workspaceFolder:'.length);
            const folder = folders.find(f => f.name === wanted);
            return folder ? folder.path : match;
        }
        if (name.startsWith('env:')) {
            const v = env[name.substring(4)];
            return v !== undefined ? v : '';
        }
        return match;
    });

    if (result === '~' || result.startsWith('~/') || result.startsWith('~\\')) {
        result = path.join(home, result.substring(1));
    }
    return result;
}

/**
 * Splits a shell command line into tokens, honouring single/double quotes.
 */
function tokenize(command) {
    const tokens = [];
    const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(command)) !== null) {
        tokens.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
    }
    return tokens;
}

const PYTHON_EXE_RE = /(^|[\\/])(python(\d+(\.\d+)*)?|py|pythonw)(\.exe)?$/i;

/**
 * Detects "run this python file" commands typed (or sent) into a terminal.
 * Handles quoted paths with spaces, PowerShell's `& "C:/.../python.exe" "x.py"`
 * and `uv run`/`poetry run`/`conda run` wrappers. Returns the script path or null.
 */
function parsePythonRunCommand(command) {
    if (!command || typeof command !== 'string') {
        return null;
    }
    const tokens = tokenize(command.trim());
    let i = 0;
    while (i < tokens.length && (tokens[i] === '&' || tokens[i] === '.')) {
        i++;
    }
    // Wrappers such as `uv run python x.py`, `uv run x.py`, `poetry run python x.py`
    if (i < tokens.length && /^(uv|poetry|pipenv|conda|pdm|hatch|rye)$/i.test(path.basename(tokens[i])) && tokens[i + 1] === 'run') {
        i += 2;
        while (i < tokens.length && tokens[i].startsWith('-')) {
            // conda run -n env python x.py
            if (tokens[i] === '-n' || tokens[i] === '--name' || tokens[i] === '-p' || tokens[i] === '--prefix') {
                i++;
            }
            i++;
        }
        if (i < tokens.length && /\.pyw?$/i.test(tokens[i])) {
            return tokens[i];
        }
    }
    if (i >= tokens.length || !PYTHON_EXE_RE.test(tokens[i])) {
        return null;
    }
    i++;
    for (; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok === '-m' || tok === '-c') {
            return null; // module / inline code, not a file
        }
        if (tok.startsWith('-')) {
            continue; // interpreter flags such as -u, -X dev
        }
        return /\.pyw?$/i.test(tok) ? tok : null;
    }
    return null;
}

module.exports = { LineSplitter, expandVariables, parsePythonRunCommand, tokenize };
