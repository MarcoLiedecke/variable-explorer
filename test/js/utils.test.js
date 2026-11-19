// Run with: node --test test/js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { LineSplitter, expandVariables, parsePythonRunCommand } = require('../../src/utils');

test('LineSplitter handles lines split across chunks', () => {
    const lines = [];
    const s = new LineSplitter(l => lines.push(l));
    s.push('{"a":');
    s.push('1}\n{"b"');
    s.push(':2}\r\n\n{"c":3}');
    assert.deepStrictEqual(lines, ['{"a":1}', '{"b":2}']);
    s.push('\n');
    assert.deepStrictEqual(lines, ['{"a":1}', '{"b":2}', '{"c":3}']);
});

test('LineSplitter is linear for huge messages', () => {
    let got = null;
    const s = new LineSplitter(l => { got = l; });
    const chunk = 'x'.repeat(65536);
    const start = Date.now();
    for (let i = 0; i < 800; i++) {
        s.push(chunk);
    }
    s.push('\n');
    assert.strictEqual(got.length, 65536 * 800);
    assert.ok(Date.now() - start < 2000);
});

test('expandVariables', () => {
    const ctx = {
        workspaceFolder: '/ws/proj',
        workspaceFolders: [{ name: 'proj', path: '/ws/proj' }, { name: 'other', path: '/ws/other' }],
        env: { VENV: '/opt/venv' },
        home: '/home/me'
    };
    assert.strictEqual(expandVariables('${workspaceFolder}/.venv/bin/python', ctx), '/ws/proj/.venv/bin/python');
    assert.strictEqual(expandVariables('${workspaceFolder:other}/x', ctx), '/ws/other/x');
    assert.strictEqual(expandVariables('${env:VENV}/bin/python', ctx), '/opt/venv/bin/python');
    assert.strictEqual(expandVariables('~/py/bin/python', ctx), path.join('/home/me', 'py/bin/python'));
    assert.strictEqual(expandVariables('${userHome}/p', ctx), '/home/me/p');
    assert.strictEqual(expandVariables('python3', ctx), 'python3');
    assert.strictEqual(expandVariables('${unknown}', ctx), '${unknown}');
});

test('parsePythonRunCommand', () => {
    const cases = [
        ['python main.py', 'main.py'],
        ['python3 -u src/main.py arg', 'src/main.py'],
        ['/home/u/.venv/bin/python /home/u/proj/main.py', '/home/u/proj/main.py'],
        ['& "C:/Program Files/Python310/python.exe" "c:/Users/John Doe/my script.py"', 'c:/Users/John Doe/my script.py'],
        ['& c:/proj/.venv/Scripts/python.exe c:/proj/app.py', 'c:/proj/app.py'],
        ['py -3.11 app.py', 'app.py'],
        ['uv run main.py', 'main.py'],
        ['uv run python main.py', 'main.py'],
        ['conda run -n myenv python main.py', 'main.py'],
        ['python -m pytest', null],
        ['python -c "print(1)"', null],
        ['ls -la', null],
        ['pythonista foo.py', null],
        ['', null]
    ];
    for (const [cmd, expected] of cases) {
        assert.strictEqual(parsePythonRunCommand(cmd), expected, cmd);
    }
});
