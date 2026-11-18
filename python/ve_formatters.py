"""
python/ve_formatters.py - Value formatting and JSON-safety helpers.

numpy / pandas are *optional*: they are never imported here. Instead we look
them up in ``sys.modules`` at call time. If the user's code never imported
numpy, no object in the namespace can be an ndarray, so there is nothing to
check. This keeps backend start-up fast and lets the backend run on
interpreters that don't have the scientific stack installed.
"""

import sys
import math
import json
import re
import reprlib
from collections import deque

MAX_VALUE_LEN = 100
MAX_JS_SAFE_INT = 2 ** 53

_PATTERN_TYPE = type(re.compile(''))
_TENSOR_MODULES = ('torch', 'tensorflow', 'jax', 'jaxlib')

_repr = reprlib.Repr()
_repr.maxlevel = 3
_repr.maxlist = 10
_repr.maxtuple = 10
_repr.maxdeque = 10
_repr.maxdict = 5
_repr.maxset = 5
_repr.maxfrozenset = 5
_repr.maxstring = 60
_repr.maxlong = 40
_repr.maxother = 60


def np_module():
    return sys.modules.get('numpy')


def pd_module():
    return sys.modules.get('pandas')


def truncate(text, limit=MAX_VALUE_LEN):
    if len(text) > limit:
        return text[:limit - 3] + '...'
    return text


def safe_str(obj, limit=MAX_VALUE_LEN):
    """str(obj), truncated, and never raising."""
    try:
        text = str(obj)
    except Exception:
        try:
            text = repr(obj)
        except Exception:
            text = '<unprintable {} object>'.format(type(obj).__name__)
    return truncate(text, limit)


def short_repr(obj, limit=MAX_VALUE_LEN):
    """Bounded repr for containers (doesn't build the full string first)."""
    try:
        return truncate(_repr.repr(obj), limit)
    except Exception:
        return safe_str(obj, limit)


def is_tensor(obj):
    module = getattr(type(obj), '__module__', '') or ''
    return module.split('.', 1)[0] in _TENSOR_MODULES and hasattr(obj, 'shape')


def _shape_str(obj):
    try:
        return str(tuple(int(d) if d is not None else None for d in obj.shape))
    except Exception:
        return '1'


def get_size(obj):
    """Size column for the variable table."""
    pd = pd_module()
    if pd is not None:
        if isinstance(obj, pd.DataFrame):
            return '({}, {})'.format(obj.shape[0], obj.shape[1])
        if isinstance(obj, (pd.Series, pd.Index)):
            return '({},)'.format(len(obj))
    np = np_module()
    if np is not None and isinstance(obj, np.ndarray):
        return str(obj.shape)
    if is_tensor(obj):
        return _shape_str(obj)
    if isinstance(obj, (list, tuple, dict, set, frozenset, deque, range, str, bytes, bytearray)):
        try:
            return str(len(obj))
        except Exception:
            return '1'
    return '1'


# Kept for backwards compatibility with the old module name.
get_item_size = get_size


def format_value(obj, var_type=None):
    """Short, single-line string representation of a value."""
    try:
        np = np_module()
        pd = pd_module()

        if np is not None and isinstance(obj, np.ndarray):
            if obj.size <= 10:
                return safe_str(obj.tolist())
            return "ndarray object of numpy module"

        if is_tensor(obj):
            prefix = 'Array' if type(obj).__module__.startswith('jax') else 'Tensor'
            return prefix + _shape_str(obj)

        if pd is not None:
            if isinstance(obj, pd.DataFrame):
                cols = [str(c) for c in obj.columns[:30]]
                text = 'Column names: ' + ', '.join(cols)
                if len(obj.columns) > 30:
                    text += ', ...'
                return truncate(text)
            if isinstance(obj, pd.Series):
                if obj.name is not None:
                    return truncate('Series {!s} ({})'.format(obj.name, obj.dtype))
                return 'Series ({})'.format(obj.dtype)

        if isinstance(obj, str):
            return truncate(obj)

        if isinstance(obj, (bool, int, float, complex)):
            return safe_str(obj)

        if isinstance(obj, _PATTERN_TYPE):
            return truncate('Pattern: ' + str(obj.pattern))

        # Collections (dict subclasses such as Counter/OrderedDict/defaultdict
        # are covered by the dict branch).
        if isinstance(obj, deque):
            return short_repr(obj)
        if isinstance(obj, dict):
            if len(obj) <= 5:
                return short_repr(dict(obj) if type(obj) is not dict else obj)
            return '{} with {} items'.format(type(obj).__name__, len(obj))
        if isinstance(obj, (set, frozenset)):
            if len(obj) <= 5:
                return short_repr(obj)
            return '{} with {} items'.format(type(obj).__name__, len(obj))
        if isinstance(obj, (list, tuple)):
            return short_repr(obj)

        if isinstance(obj, memoryview):
            return '<memory at {}>'.format(hex(id(obj)))

        if isinstance(obj, BaseException):
            return truncate('{}: {}'.format(type(obj).__name__, safe_str(obj, 1000)))

        # Generators / iterators: don't consume them.
        if hasattr(obj, '__next__') and hasattr(obj, '__iter__'):
            return '<{} object>'.format(type(obj).__name__)

        return safe_str(obj)
    except Exception as e:
        return '<Error displaying value: {}>'.format(safe_str(e, 80))


# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------

def json_scalar(value):
    """Convert one cell value into something JSON (and JavaScript) can hold.

    NaN/inf become None (JSON has no NaN); everything exotic (Timestamp, UUID,
    Decimal, complex, ...) becomes its string form.
    """
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return value if -MAX_JS_SAFE_INT < value < MAX_JS_SAFE_INT else str(value)
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    np = np_module()
    if np is not None and isinstance(value, np.generic):
        if isinstance(value, np.bool_):
            return bool(value)
        if isinstance(value, np.integer):
            return json_scalar(int(value))
        if isinstance(value, np.floating):
            return json_scalar(float(value))
    return safe_str(value, 1000)


def _sanitize(obj, depth=0):
    if depth > 50:
        return safe_str(obj)
    if isinstance(obj, dict):
        return {str(k): _sanitize(v, depth + 1) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v, depth + 1) for v in obj]
    return json_scalar(obj)


def _json_default(obj):
    return json_scalar(obj) if not isinstance(obj, (dict, list, tuple)) else _sanitize(obj)


def dumps(obj):
    """json.dumps that never produces invalid JSON (NaN) and never raises."""
    try:
        return json.dumps(obj, allow_nan=False, default=_json_default)
    except (ValueError, TypeError):
        return json.dumps(_sanitize(obj), allow_nan=False, default=str)
