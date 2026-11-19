"""
python/ve_inspector.py - Variable inspection logic.

Everything returned from here must be JSON-serialisable; ``ve_formatters.dumps``
is the final safety net but we try to produce clean data up front.
"""

from collections import deque

from ve_formatters import (
    format_value, get_size, json_scalar, safe_str, np_module, pd_module,
)

DEFAULT_MAX_ITEMS = 5000          # list/dict/set entries in the detail view
DEFAULT_MAX_ROWS = 50000          # DataFrame rows sent to the webview
ARRAY_1D_LIMIT = 1000
MAX_EDITABLE_STRING = 10 * 1024 * 1024
ARRAY_2D_LIMIT = 100


def get_variable_info(name, obj):
    return {
        'name': name,
        'type': type(obj).__name__,
        'size': get_size(obj),
        'value': format_value(obj),
    }


def get_all_variables(namespace):
    """All user-visible variables. Further filtering happens in the webview."""
    variables = []
    # Snapshot: background threads started by user code may mutate the dict.
    for name, obj in list(namespace.items()):
        if name.startswith('__') and name.endswith('__'):
            continue
        if isinstance(obj, type):
            continue
        try:
            variables.append(get_variable_info(name, obj))
        except Exception:
            variables.append({
                'name': name,
                'type': safe_str(type(obj).__name__),
                'size': '1',
                'value': '<could not inspect value>',
            })
    return variables


# ---------------------------------------------------------------------------
# Navigation into nested structures
# ---------------------------------------------------------------------------

def _child(obj, key):
    """Return obj[key] where key is the *string* shown in the detail view."""
    if isinstance(obj, dict):
        try:
            return obj[key]
        except (KeyError, TypeError):
            pass
        # Keys are sent to the webview as strings, so int/tuple/... keys need
        # to be matched by their string form.
        for k, v in obj.items():
            if str(k) == key:
                return v
        raise KeyError(key)
    if isinstance(obj, (list, tuple, deque)):
        return obj[int(key)]
    if isinstance(obj, (set, frozenset)):
        return list(obj)[int(key)]
    raise TypeError('Cannot navigate into {}'.format(type(obj).__name__))


def resolve_path(namespace, var_name, path=None):
    if var_name not in namespace:
        raise KeyError('Variable {} not found'.format(var_name))
    obj = namespace[var_name]
    walked = []
    for key in path or []:
        walked.append(str(key))
        try:
            obj = _child(obj, key)
        except TypeError as e:
            raise KeyError(str(e))
        except (KeyError, IndexError, ValueError):
            raise KeyError('Path not found: {}'.format(' -> '.join(walked)))
    return obj


# ---------------------------------------------------------------------------
# Table conversion (pandas)
# ---------------------------------------------------------------------------

def _label(value):
    if isinstance(value, tuple):
        return ' / '.join(str(v) for v in value)
    return str(value)


def _column_values(series):
    """Convert a pandas Series into a JSON-safe Python list, fast."""
    np = np_module()
    dtype = series.dtype
    if np is not None and isinstance(dtype, np.dtype):
        kind = dtype.kind
        if kind in 'iub':
            values = series.to_numpy().tolist()
            if kind in 'iu':
                limit = 2 ** 53
                if any(v >= limit or v <= -limit for v in values):
                    values = [json_scalar(v) for v in values]
            return values
        if kind == 'f':
            arr = series.to_numpy()
            out = arr.astype(object)
            out[~np.isfinite(arr)] = None
            return out.tolist()
    try:
        mask = series.isna().to_numpy()
    except Exception:
        mask = None
    values = series.to_numpy(dtype=object)
    if mask is None:
        return [json_scalar(v) for v in values]
    return [None if m else json_scalar(v) for v, m in zip(values, mask)]


def dataframe_to_table(df, max_rows=DEFAULT_MAX_ROWS):
    pd = pd_module()
    total_rows = int(df.shape[0])
    sub = df.iloc[:max_rows] if max_rows and total_rows > max_rows else df

    columns = [_label(c) for c in df.columns]
    dtypes = [str(t) for t in df.dtypes]
    col_values = [_column_values(sub.iloc[:, i]) for i in range(sub.shape[1])]
    if col_values:
        data = [list(row) for row in zip(*col_values)]
    else:
        data = [[] for _ in range(len(sub))]

    index = sub.index
    if isinstance(index, pd.MultiIndex):
        index_values = [_label(v) for v in index.tolist()]
        index_name = ' / '.join(str(n) if n is not None else '' for n in index.names).strip(' /') or 'Index'
    else:
        index_values = _column_values(pd.Series(index, copy=False))
        index_name = str(index.name) if index.name is not None else 'Index'

    return {
        'shape': [total_rows, int(df.shape[1])],
        'columns': columns,
        'dtypes': dtypes,
        'index': index_values,
        'index_name': index_name,
        'has_custom_index': not isinstance(index, pd.RangeIndex),
        'data': data,
        'truncated': len(sub) < total_rows,
        'loaded_rows': len(sub),
    }


# ---------------------------------------------------------------------------
# numpy arrays
# ---------------------------------------------------------------------------

def _array_cells(np, sub):
    if sub.dtype.kind == 'f':
        out = sub.astype(object)
        out[~np.isfinite(sub)] = None
        return out.tolist()
    cells = sub.tolist()
    if sub.ndim == 1:
        return [json_scalar(v) for v in cells]
    return [[json_scalar(v) for v in row] for row in cells]


def array_info(np, obj):
    info = {
        'shape': [int(d) for d in obj.shape],
        'dtype': str(obj.dtype),
        'ndim': int(obj.ndim),
        'is_numeric': obj.dtype.kind in 'iuf',
        'truncated': False,
        'data': None,
    }
    arr = obj
    if arr.ndim == 0:
        arr = arr.reshape(1)
    elif arr.ndim > 2:
        # Show the first 2-D slice of higher dimensional arrays.
        arr = arr[(0,) * (arr.ndim - 2)]
        info['slice'] = '[' + ', '.join(['0'] * (obj.ndim - 2) + [':', ':']) + ']'

    if arr.ndim == 1:
        sub = arr[:ARRAY_1D_LIMIT]
        info['truncated'] = arr.shape[0] > ARRAY_1D_LIMIT
        info['display_ndim'] = 1
    else:
        sub = arr[:ARRAY_2D_LIMIT, :ARRAY_2D_LIMIT]
        info['truncated'] = arr.shape[0] > ARRAY_2D_LIMIT or arr.shape[1] > ARRAY_2D_LIMIT
        info['display_ndim'] = 2

    try:
        sub = np.asarray(sub)
        info['data'] = _array_cells(np, sub)
    except Exception:
        info['data'] = None
    return info


# ---------------------------------------------------------------------------
# Detail view
# ---------------------------------------------------------------------------

def _item(index, value):
    return {
        'index': safe_str(index, 200),
        'type': type(value).__name__,
        'size': get_size(value),
        'value': format_value(value),
    }


def get_variable_details(var_name, namespace, path=None,
                         max_items=DEFAULT_MAX_ITEMS, max_rows=DEFAULT_MAX_ROWS):
    try:
        obj = resolve_path(namespace, var_name, path)
    except KeyError as e:
        return {'status': 'error', 'error': e.args[0] if e.args else str(e)}

    details = {
        'name': var_name,
        'type': type(obj).__name__,
        'value': safe_str(obj, 1000),
        'items': [],
        'path': [str(p) for p in (path or [])],
    }

    np = np_module()
    pd = pd_module()

    if pd is not None and isinstance(obj, pd.DataFrame):
        details['dataframe_info'] = dataframe_to_table(obj, max_rows)
    elif pd is not None and isinstance(obj, pd.Series):
        name = obj.name if obj.name is not None else 'value'
        details['dataframe_info'] = dataframe_to_table(obj.to_frame(name=name), max_rows)
    elif np is not None and isinstance(obj, np.ndarray):
        details['array_info'] = array_info(np, obj)
    elif isinstance(obj, dict):
        total = len(obj)
        for i, (key, value) in enumerate(list(obj.items())):
            if i >= max_items:
                break
            details['items'].append(_item(key, value))
        details['total_items'] = total
    elif isinstance(obj, (list, tuple, deque, set, frozenset)):
        total = len(obj)
        for i, value in enumerate(obj):
            if i >= max_items:
                break
            details['items'].append(_item(i, value))
        details['total_items'] = total

    elif isinstance(obj, str) and len(obj) <= MAX_EDITABLE_STRING:
        details['full_value'] = obj

    if 'total_items' in details:
        details['truncated'] = details['total_items'] > len(details['items'])
    return details


def export_csv(var_name, namespace, path, file_path):
    pd = pd_module()
    obj = resolve_path(namespace, var_name, path)
    if pd is None or not isinstance(obj, (pd.DataFrame, pd.Series)):
        raise TypeError('{} is not a pandas DataFrame or Series'.format(var_name))
    write_index = not isinstance(obj.index, pd.RangeIndex)
    obj.to_csv(file_path, index=write_index)
    shape = obj.shape if len(obj.shape) == 2 else (obj.shape[0], 1)
    return {'rows': int(shape[0]), 'columns': int(shape[1]), 'file': file_path}
