"""
python/inspector.py - Variable inspection logic
"""

import numpy as np
import pandas as pd
from formatters import format_value, get_item_size


def get_variable_info(name, obj):
    """Extract information about a variable"""
    import json

    var_type = type(obj).__name__
    
    # Get size
    if isinstance(obj, (list, tuple, dict, set)):
        size = len(obj)
    elif isinstance(obj, np.ndarray):
        size = f"{obj.shape}"
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
    """Get all variables from the execution namespace"""
    variables = []
    
    for name, obj in namespace.items():
        # Skip private/magic variables
        if name.startswith('_'):
            continue
        
        obj_type = type(obj).__name__
        
        # Skip modules
        if obj_type == 'module':
            continue
        
        # Skip types/classes themselves (but not instances of those classes)
        if obj_type == 'type':
            continue
        
        # Skip functions (but not their results)
        if obj_type in ('function', 'builtin_function_or_method', 'method'):
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
        if obj.ndim == 1:
            for i, item in enumerate(obj):
                item_info = {
                    'index': str(i),
                    'type': str(obj.dtype),
                    'size': '1',
                    'value': str(item)
                }
                details['items'].append(item_info)
        elif obj.ndim == 2:
            for i in range(obj.shape[0]):
                item_info = {
                    'index': str(i),
                    'type': f'array[{obj.shape[1]}]',
                    'size': str(obj.shape[1]),
                    'value': str(obj[i].tolist())
                }
                details['items'].append(item_info)
    
    # Handle pandas DataFrame
    elif isinstance(obj, pd.DataFrame):
        details['dataframe_info'] = {
            'shape': obj.shape,
            'columns': obj.columns.tolist(),
            'dtypes': {str(k): str(v) for k, v in obj.dtypes.to_dict().items()},
            'head': obj.head(100).to_dict('records')
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