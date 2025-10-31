"""
python/inspector.py - Variable inspection logic
"""

import numpy as np
import pandas as pd
from formatters import format_value, get_item_size
from pathlib import Path, PurePath
from collections import OrderedDict, defaultdict, Counter, deque


def get_variable_info(name, obj):
    """Extract information about a variable"""
    import json

    var_type = type(obj).__name__

    # Get size
    if isinstance(obj, (list, tuple, dict, set, frozenset, deque, Counter, OrderedDict, defaultdict)):
        size = len(obj)
    elif isinstance(obj, np.ndarray):
        size = f"{obj.shape}"
    elif 'torch' in str(type(obj)) and hasattr(obj, 'shape'):
        size = f"{tuple(obj.shape)}"
    elif 'tensorflow' in str(type(obj)) and hasattr(obj, 'shape'):
        size = f"{tuple(obj.shape)}"
    elif 'jax' in str(type(obj)) and hasattr(obj, 'shape'):
        size = f"{tuple(obj.shape)}"
    elif isinstance(obj, pd.DataFrame):
        size = f"({obj.shape[0]}, {obj.shape[1]})"
    else:
        size = 1

    # Get value representation
    value = format_value(obj, var_type)

    return {
        'name': name,
        'type': var_type,
        'size': str(size),
        'value': value
    }


def get_all_variables(namespace):
    """Get all variables from the execution namespace

    Note: Filtering is now handled client-side for better user control.
    This function returns all variables except truly internal ones.
    """
    variables = []

    for name, obj in namespace.items():
        # Only skip double-underscore (truly internal) variables
        if name.startswith('__') and name.endswith('__'):
            continue

        obj_type = type(obj).__name__

        # Skip type objects themselves (but not instances)
        if obj_type == 'type':
            continue

        try:
            var_info = get_variable_info(name, obj)
            variables.append(var_info)
        except Exception as e:
            # If we can't inspect it, skip it
            continue

    return variables


def get_variable_details(var_name, namespace, path=None):
    """Get detailed information about a specific variable

    Args:
        var_name: The root variable name
        namespace: The execution namespace
        path: Optional list of keys/indices to navigate into nested structures
    """
    if var_name not in namespace:
        return {'error': f'Variable {var_name} not found'}

    obj = namespace[var_name]

    # Navigate to nested path if provided
    current_path = []
    if path:
        for key in path:
            current_path.append(key)
            try:
                if isinstance(obj, dict):
                    obj = obj[key]
                elif isinstance(obj, (list, tuple)):
                    obj = obj[int(key)]
                else:
                    return {'error': f'Cannot navigate into {type(obj).__name__}'}
            except (KeyError, IndexError, ValueError) as e:
                return {'error': f'Path not found: {" -> ".join(str(p) for p in current_path)}'}

    details = {
        'name': var_name,
        'type': type(obj).__name__,
        'value': str(obj),
        'items': [],
        'path': path or []
    }
    
    # Handle list/tuple
    if isinstance(obj, (list, tuple)):
        for i, item in enumerate(obj):
            item_info = {
                'index': str(i),
                'type': type(item).__name__,
                'size': get_item_size(item),
                'value': format_value(item, type(item).__name__)
            }
            details['items'].append(item_info)
    
    # Handle dict
    elif isinstance(obj, dict):
        for key, value in obj.items():
            item_info = {
                'index': str(key),
                'type': type(value).__name__,
                'size': get_item_size(value),
                'value': format_value(value, type(value).__name__)
            }
            details['items'].append(item_info)
    
    # Handle numpy array
    elif isinstance(obj, np.ndarray):
        # Add array-specific info for heatmap visualization
        details['array_info'] = {
            'shape': obj.shape,
            'dtype': str(obj.dtype),
            'ndim': obj.ndim
        }

        if obj.ndim == 1:
            # For 1D arrays, send as a single row for heatmap
            details['array_info']['data'] = obj.tolist()[:1000]  # Limit to 1000 elements
            details['array_info']['is_numeric'] = np.issubdtype(obj.dtype, np.number)
        elif obj.ndim == 2:
            # For 2D arrays, send the full grid data (limited to reasonable size)
            max_rows = min(obj.shape[0], 100)
            max_cols = min(obj.shape[1], 100)
            details['array_info']['data'] = obj[:max_rows, :max_cols].tolist()
            details['array_info']['is_numeric'] = np.issubdtype(obj.dtype, np.number)
            details['array_info']['truncated'] = (obj.shape[0] > max_rows) or (obj.shape[1] > max_cols)
        else:
            # For 3D+ arrays, show shape info only
            details['array_info']['data'] = None
    
    # Handle pandas DataFrame
    elif isinstance(obj, pd.DataFrame):
        # Load ALL columns and ALL rows
        # Pagination is handled client-side in JavaScript
        df_to_send = obj
        all_columns = obj.columns.tolist()

        # Preserve the index by resetting it (adds index as a column)
        df_with_index = df_to_send.reset_index()

        details['dataframe_info'] = {
            'shape': obj.shape,  # Original shape
            'columns': all_columns,  # All columns
            'dtypes': {str(k): str(v) for k, v in obj.dtypes.to_dict().items()},
            'data': df_with_index.to_dict('records'),
            'index_name': obj.index.name if obj.index.name else 'Index',
            'has_custom_index': not isinstance(obj.index, pd.RangeIndex)
        }
    
    # Handle pandas Series
    elif isinstance(obj, pd.Series):
        for i, (idx, value) in enumerate(obj.items()):
            item_info = {
                'index': str(idx),
                'type': type(value).__name__,
                'size': '1',
                'value': str(value)
            }
            details['items'].append(item_info)
    
    return details