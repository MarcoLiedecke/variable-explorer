#!/usr/bin/env python3
"""
python/variable_inspector.py - Variable Explorer backend.

Runs as a child process of the VS Code extension and speaks newline-delimited
JSON:

* requests arrive on stdin: ``{"id": 1, "command": "run_file", ...}``
* responses go to stdout:   ``{"id": 1, "command": "run_file", "status": ...}``
* asynchronous events too:  ``{"event": "output", "stream": "stdout", "text": ...}``

User code runs in this process, so the protocol streams are protected:
the real stdin/stdout file descriptors are duplicated for the protocol, fd 0 is
pointed at /dev/null (``input()`` raises EOFError instead of eating protocol
messages) and fd 1 is pointed at stderr (stray output from C extensions or
subprocesses can't corrupt the JSON stream).
"""

import ast
import builtins
import importlib
import io
import linecache
import os
import sys
import textwrap
import threading
import time
import traceback
import types

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

import ve_inspector as inspector  # noqa: E402
from ve_formatters import dumps, safe_str  # noqa: E402

# Our directory must not shadow user modules (e.g. a user's ``inspector.py``).
sys.path[:] = [p for p in sys.path
               if os.path.normcase(os.path.abspath(p or os.curdir)) != os.path.normcase(_BACKEND_DIR)]

PROTOCOL_VERSION = 2

# ---------------------------------------------------------------------------
# Protocol streams
# ---------------------------------------------------------------------------

_write_lock = threading.RLock()
_proto_out = None
_proto_in = None


def _setup_protocol_streams():
    global _proto_out, _proto_in
    try:
        out_fd = os.dup(sys.__stdout__.fileno())
        in_fd = os.dup(sys.__stdin__.fileno())
        os.dup2(sys.__stderr__.fileno(), 1)
        devnull = os.open(os.devnull, os.O_RDONLY)
        os.dup2(devnull, 0)
        os.close(devnull)
        _proto_out = io.open(out_fd, 'w', encoding='utf-8', newline='\n')
        _proto_in = io.open(in_fd, 'r', encoding='utf-8', errors='replace')
    except (OSError, AttributeError, ValueError):
        # Exotic environments without real file descriptors: fall back.
        _proto_out = sys.__stdout__
        _proto_in = sys.__stdin__
    try:
        sys.stdin = io.open(os.devnull, 'r')
    except OSError:
        sys.stdin = io.StringIO('')


def emit(message):
    line = dumps(message) + '\n'
    with _write_lock:
        try:
            _proto_out.write(line)
            _proto_out.flush()
        except (BrokenPipeError, OSError, ValueError):
            # The extension went away - nothing left to do.
            os._exit(0)


class _BufferProxy(object):
    """Minimal ``sys.stdout.buffer`` replacement (bytes -> text)."""

    def __init__(self, stream):
        self._stream = stream

    def write(self, data):
        self._stream.write(bytes(data).decode('utf-8', errors='replace'))
        return len(data)

    def flush(self):
        self._stream.flush()


class OutputStream(io.TextIOBase):
    """Forwards user output to the extension as ``output`` events."""

    def __init__(self, name, fileno):
        super(OutputStream, self).__init__()
        self._name = name
        self._fileno = fileno
        self._parts = []
        self._size = 0
        self._last_flush = time.monotonic()
        self._lock = threading.Lock()
        self.buffer = _BufferProxy(self)

    @property
    def name(self):
        return '<{}>'.format(self._name)

    @property
    def encoding(self):
        return 'utf-8'

    def writable(self):
        return True

    def isatty(self):
        return False

    def fileno(self):
        return self._fileno

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError('write() argument must be str, not {}'.format(type(text).__name__))
        if not text:
            return 0
        with self._lock:
            self._parts.append(text)
            self._size += len(text)
            due = ('\n' in text or self._size > 8192 or
                   time.monotonic() - self._last_flush > 0.1)
        if due:
            self.flush()
        return len(text)

    def flush(self):
        with self._lock:
            if not self._parts:
                return
            text = ''.join(self._parts)
            self._parts = []
            self._size = 0
            self._last_flush = time.monotonic()
        emit({'event': 'output', 'stream': self._name, 'text': text})


# ---------------------------------------------------------------------------
# Execution state
# ---------------------------------------------------------------------------

# User code runs in a real module registered as ``__main__`` so pickling,
# dataclasses, multiprocessing and ``if __name__ == '__main__'`` all behave as
# they would for ``python script.py``.
sys.modules['_variable_explorer_backend'] = sys.modules.get(__name__)
_user_main = types.ModuleType('__main__')
exec_namespace = _user_main.__dict__


def _reset_namespace_builtins():
    exec_namespace['__name__'] = '__main__'
    exec_namespace['__builtins__'] = builtins
    exec_namespace['__ve_capture_locals__'] = _capture_locals


def _capture_locals(local_vars):
    for key, value in list(local_vars.items()):
        if not key.startswith('_'):
            exec_namespace[key] = value


_config = {
    'workspace_folders': [],
    'extra_paths': [],
    'reload_modules': True,
    'max_rows': inspector.DEFAULT_MAX_ROWS,
    'max_items': inspector.DEFAULT_MAX_ITEMS,
}
_added_script_dir = None
_added_extra_paths = []


def _norm(path):
    return os.path.normcase(os.path.abspath(path))


def _set_script_dir(script_dir):
    """Mimic ``python script.py``: the script's directory is sys.path[0]."""
    global _added_script_dir
    if _added_script_dir is not None:
        try:
            sys.path.remove(_added_script_dir)
        except ValueError:
            pass
        _added_script_dir = None
    if script_dir:
        sys.path.insert(0, script_dir)
        _added_script_dir = script_dir


def _apply_extra_paths(paths):
    global _added_extra_paths
    for p in _added_extra_paths:
        try:
            sys.path.remove(p)
        except ValueError:
            pass
    _added_extra_paths = []
    insert_at = 1 if _added_script_dir else 0
    for p in reversed([p for p in paths if p]):
        sys.path.insert(insert_at, p)
        _added_extra_paths.append(p)


def _is_library_path(path):
    parts = path.replace('\\', '/').split('/')
    return 'site-packages' in parts or 'dist-packages' in parts


def _reload_user_modules(script_dir):
    """Forget modules that live in the user's project (like Spyder's UMR).

    Without this, editing a helper module and re-running the main script
    would keep using the stale, cached version of the helper.
    """
    roots = [_norm(r) for r in list(_config['workspace_folders']) + [script_dir] if r]
    if not roots:
        return
    excluded = {_norm(p) for p in (sys.prefix, sys.base_prefix, sys.exec_prefix, _BACKEND_DIR)}
    removed = []
    for name, module in list(sys.modules.items()):
        if name == '__main__' or module is None:
            continue
        filename = getattr(module, '__file__', None)
        if not filename or not isinstance(filename, str):
            continue
        filename = _norm(filename)
        if _is_library_path(filename):
            continue
        if any(filename.startswith(e + os.sep) for e in excluded):
            continue
        if any(filename.startswith(r + os.sep) for r in roots):
            removed.append(name)
    for name in removed:
        sys.modules.pop(name, None)
    if removed:
        importlib.invalidate_caches()


def _wrap_main_capture(tree):
    """Make ``def main()`` copy its locals into the namespace when it exits."""
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == 'main':
            call = ast.Expr(value=ast.Call(
                func=ast.Name(id='__ve_capture_locals__', ctx=ast.Load()),
                args=[ast.Call(func=ast.Name(id='locals', ctx=ast.Load()), args=[], keywords=[])],
                keywords=[],
            ))
            node.body = [ast.Try(body=node.body, handlers=[], orelse=[], finalbody=[call])]
    return ast.fix_missing_locations(tree)


def _format_user_traceback(exc):
    """Traceback without the backend's own frames."""
    tb = exc.__traceback__
    own_file = _norm(__file__)
    while tb is not None and _norm(tb.tb_frame.f_code.co_filename) == own_file:
        tb = tb.tb_next
    return ''.join(traceback.format_exception(type(exc), exc, tb))


_mpl_state = {}
_streams = ()


def _enter_shadow_mode():
    """The same file is also running in a terminal: avoid duplicate plot windows."""
    _mpl_state.clear()
    _mpl_state['env'] = os.environ.get('MPLBACKEND')
    plt = sys.modules.get('matplotlib.pyplot')
    if plt is None:
        os.environ['MPLBACKEND'] = 'Agg'
    else:
        _mpl_state['show'] = plt.show
        plt.show = lambda *args, **kwargs: None


def _exit_shadow_mode():
    if 'env' not in _mpl_state:
        return
    if _mpl_state['env'] is None:
        os.environ.pop('MPLBACKEND', None)
    else:
        os.environ['MPLBACKEND'] = _mpl_state['env']
    plt = sys.modules.get('matplotlib.pyplot')
    if plt is not None and 'show' in _mpl_state:
        plt.show = _mpl_state['show']
    _mpl_state.clear()


def _execute(source, filename, request, is_file):
    script_dir = request.get('script_dir')
    if is_file and not script_dir:
        script_dir = os.path.dirname(os.path.abspath(filename))
    cwd = request.get('cwd')

    _set_script_dir(script_dir)
    _apply_extra_paths(_config['extra_paths'])
    if cwd:
        try:
            os.chdir(cwd)
        except OSError:
            pass
    if is_file and _config['reload_modules']:
        _reload_user_modules(script_dir)

    _reset_namespace_builtins()
    shadow = bool(request.get('shadow'))
    if shadow:
        _enter_shadow_mode()

    old_argv = sys.argv
    if is_file:
        exec_namespace['__file__'] = filename
        sys.argv = [filename] + [str(a) for a in (request.get('args') or [])]

    response = {'status': 'success'}
    started = time.monotonic()
    try:
        tree = ast.parse(source, filename)
        if request.get('capture_main_locals'):
            tree = _wrap_main_capture(tree)
        last_expr = None
        if not is_file and tree.body and isinstance(tree.body[-1], ast.Expr):
            # Like a REPL / Jupyter: show the value of a trailing expression.
            last_expr = ast.Expression(body=tree.body.pop().value)
        exec(compile(tree, filename, 'exec', dont_inherit=True), exec_namespace)
        if last_expr is not None:
            value = eval(compile(last_expr, filename, 'eval', dont_inherit=True), exec_namespace)
            if value is not None:
                exec_namespace['_'] = value
                sys.stdout.write(_display(value))
                sys.stdout.write('\n')
    except SystemExit as e:
        if e.code not in (None, 0):
            response = {'status': 'error', 'error': 'SystemExit: {}'.format(e.code)}
    except KeyboardInterrupt:
        response = {'status': 'error', 'error': 'Execution interrupted', 'interrupted': True}
        sys.stderr.write('KeyboardInterrupt\n')
    except BaseException as e:  # noqa: B902 - user code can raise anything
        tb_text = _format_user_traceback(e)
        sys.stderr.write(tb_text)
        response = {
            'status': 'error',
            'error': '{}: {}'.format(type(e).__name__, safe_str(e, 500)),
            'traceback': tb_text,
        }
    finally:
        sys.argv = old_argv
        if shadow:
            _exit_shadow_mode()
        for stream in (sys.stdout, sys.stderr):
            try:
                stream.flush()
            except Exception:
                pass
        # User code may have replaced sys.stdout/stderr and not restored them.
        if _streams:
            sys.stdout, sys.stderr = _streams
            sys.stdout.flush()
            sys.stderr.flush()

    response['duration'] = round(time.monotonic() - started, 3)
    response['variables'] = inspector.get_all_variables(exec_namespace)
    return response


def _display(value):
    try:
        text = repr(value)
    except Exception as e:
        text = '<repr failed: {}>'.format(e)
    if len(text) > 20000:
        text = text[:20000] + '...'
    return text


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

def cmd_configure(request):
    for key in ('workspace_folders', 'extra_paths'):
        if isinstance(request.get(key), list):
            _config[key] = [str(p) for p in request[key] if p]
    for key in ('reload_modules',):
        if key in request:
            _config[key] = bool(request[key])
    for key in ('max_rows', 'max_items'):
        if isinstance(request.get(key), int) and request[key] > 0:
            _config[key] = request[key]
    _apply_extra_paths(_config['extra_paths'])
    return {'status': 'success'}


def _read_source(file_path):
    # Read bytes: compile() honours PEP 263 coding cookies and defaults to
    # UTF-8, independent of the OS locale (cp1252 on many Windows machines).
    with open(file_path, 'rb') as f:
        return f.read()


def cmd_run_file(request):
    file_path = os.path.abspath(request['file'])
    try:
        source = _read_source(file_path)
    except OSError as e:
        return {'status': 'error', 'error': 'Cannot read {}: {}'.format(file_path, e),
                'variables': inspector.get_all_variables(exec_namespace)}
    return _execute(source, file_path, request, is_file=True)


def cmd_run_code(request):
    code = request.get('code') or ''
    # Allow running an indented block selected from inside a function/loop.
    code = textwrap.dedent(code)
    filename = '<selection>'
    # Register the source so tracebacks can show the offending lines.
    linecache.cache[filename] = (len(code), None, code.splitlines(True), filename)
    return _execute(code, filename, request, is_file=False)


def cmd_get_variables(request):
    return {'status': 'success', 'variables': inspector.get_all_variables(exec_namespace)}


def cmd_get_details(request):
    details = inspector.get_variable_details(
        request['name'], exec_namespace, request.get('path'),
        max_items=_config['max_items'], max_rows=_config['max_rows'])
    details.setdefault('status', 'success')
    return details


def _convert_value(var_type, new_value, original):
    type_lower = (var_type or '').lower()
    np = sys.modules.get('numpy')
    if type_lower in ('bool', 'bool_'):
        lowered = new_value.strip().lower()
        if lowered in ('true', '1', 'yes'):
            value = True
        elif lowered in ('false', '0', 'no'):
            value = False
        else:
            raise ValueError('Invalid boolean value: {}'.format(new_value))
    elif type_lower in ('int', 'int8', 'int16', 'int32', 'int64',
                        'uint8', 'uint16', 'uint32', 'uint64', 'intc', 'longlong'):
        value = int(new_value.strip())
    elif type_lower in ('float', 'float16', 'float32', 'float64', 'longdouble'):
        value = float(new_value.strip())
    elif type_lower in ('complex', 'complex64', 'complex128'):
        value = complex(new_value.strip().replace(' ', ''))
    elif type_lower == 'str':
        return new_value
    else:
        raise TypeError('Type {} is not editable'.format(var_type))
    # Preserve numpy scalar types (np.float32 stays np.float32).
    if np is not None and isinstance(original, np.generic):
        return type(original)(value)
    return value


def cmd_update_variable(request):
    name = request['name']
    if name not in exec_namespace:
        return {'status': 'error', 'error': 'Variable {} not found'.format(name)}
    try:
        exec_namespace[name] = _convert_value(request.get('type'), str(request.get('value', '')),
                                              exec_namespace[name])
    except (ValueError, TypeError, OverflowError) as e:
        return {'status': 'error',
                'error': 'Invalid value for type {}: {}'.format(request.get('type'), e),
                'variables': inspector.get_all_variables(exec_namespace)}
    return {'status': 'success', 'variables': inspector.get_all_variables(exec_namespace)}


def cmd_clear_namespace(request):
    for key in [k for k in exec_namespace if not k.startswith('_')]:
        del exec_namespace[key]
    return {'status': 'success', 'message': 'Namespace cleared', 'variables': []}


def _serializer():
    try:
        import dill
        return dill, 'dill'
    except ImportError:
        import pickle
        return pickle, 'pickle'


def cmd_save_session(request):
    serializer, serializer_name = _serializer()
    saved, skipped = {}, []
    for name, value in list(exec_namespace.items()):
        if name.startswith('_'):
            continue
        if isinstance(value, (type, types.ModuleType)) or \
                (callable(value) and serializer_name != 'dill'):
            skipped.append({'name': name, 'reason': 'callable/type/module'})
            continue
        try:
            serializer.dumps(value)
            saved[name] = value
        except Exception as e:
            skipped.append({'name': name, 'reason': safe_str(e, 80)})

    if not saved:
        return {'status': 'error',
                'error': 'No variables could be saved. All variables are either internal or not serializable.'}

    file_path = request['file']
    tmp_path = file_path + '.tmp'
    try:
        with open(tmp_path, 'wb') as f:
            serializer.dump(saved, f)
        os.replace(tmp_path, file_path)  # never leave a half-written session
    except Exception as e:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        return {'status': 'error', 'error': 'Failed to save session: {}'.format(e)}

    return {'status': 'success', 'saved_count': len(saved), 'saved_vars': list(saved),
            'skipped_vars': skipped, 'serializer': serializer_name}


def cmd_load_session(request):
    serializer, serializer_name = _serializer()
    try:
        with open(request['file'], 'rb') as f:
            loaded = serializer.load(f)
    except Exception as e:
        return {'status': 'error', 'error': 'Failed to load session: {}'.format(e)}
    if not isinstance(loaded, dict):
        return {'status': 'error',
                'error': 'Invalid session file format. Expected a dictionary of variables.'}
    for name, value in loaded.items():
        exec_namespace[str(name)] = value
    return {'status': 'success', 'loaded_count': len(loaded), 'loaded_vars': [str(k) for k in loaded],
            'variables': inspector.get_all_variables(exec_namespace), 'serializer': serializer_name}


def cmd_export_csv(request):
    result = inspector.export_csv(request['name'], exec_namespace, request.get('path'), request['file'])
    result['status'] = 'success'
    return result


def cmd_ping(request):
    return {'status': 'success'}


HANDLERS = {
    'configure': cmd_configure,
    'run_file': cmd_run_file,
    'run_code': cmd_run_code,
    'get_variables': cmd_get_variables,
    'get_details': cmd_get_details,
    'update_variable': cmd_update_variable,
    'clear_namespace': cmd_clear_namespace,
    'save_session': cmd_save_session,
    'load_session': cmd_load_session,
    'export_csv': cmd_export_csv,
    'ping': cmd_ping,
}


def handle_request(request):
    name = request.get('command')
    handler = HANDLERS.get(name)
    if handler is None:
        response = {'status': 'error', 'error': 'Unknown command: {}'.format(name)}
    else:
        try:
            response = handler(request)
        except KeyboardInterrupt:
            response = {'status': 'error', 'error': 'Interrupted', 'interrupted': True}
        except Exception as e:
            response = {'status': 'error', 'error': '{}: {}'.format(type(e).__name__, safe_str(e, 500)),
                        'traceback': traceback.format_exc()}
    response['command'] = name
    if 'id' in request:
        response['id'] = request['id']
    return response


def main():
    global _streams
    _setup_protocol_streams()
    sys.stdout = OutputStream('stdout', 1)
    sys.stderr = OutputStream('stderr', 2)
    _streams = (sys.stdout, sys.stderr)
    sys.modules['__main__'] = _user_main
    _reset_namespace_builtins()

    emit({
        'event': 'ready',
        'protocol': PROTOCOL_VERSION,
        'python': sys.executable,
        'version': '.'.join(str(v) for v in sys.version_info[:3]),
        'pid': os.getpid(),
    })

    import json
    while True:
        try:
            line = _proto_in.readline()
        except KeyboardInterrupt:
            continue  # interrupt arrived while idle
        if not line:
            break  # extension closed the pipe
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError('request must be a JSON object')
        except ValueError as e:
            emit({'status': 'error', 'error': 'Invalid request: {}'.format(e)})
            continue
        try:
            emit(handle_request(request))
        except KeyboardInterrupt:
            emit({'status': 'error', 'error': 'Interrupted', 'interrupted': True,
                  'command': request.get('command'), 'id': request.get('id')})


if __name__ == '__main__':
    main()
