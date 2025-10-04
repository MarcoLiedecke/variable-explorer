"""
python/formatters.py - Value formatting and display functions
"""

import numpy as np
import pandas as pd
import json

def is_json_string(obj):
    """Check if a string contains valid JSON"""
    if not isinstance(obj, str):
        return False
    try:
        json.loads(obj)
        return True
    except:
        return False

def format_value(obj, var_type):
    """Get string representation of variable value"""
    try:
        if isinstance(obj, np.ndarray):
            if obj.size <= 10:
                return str(obj.tolist())
            else:
                return f"ndarray object of numpy module"
        elif isinstance(obj, pd.DataFrame):
            cols = ', '.join(obj.columns.tolist())
            return f"Column names: {cols}"
        elif isinstance(obj, (list, tuple)):
            if len(obj) <= 10:
                return str(obj)
            else:
                preview = str(obj[:3])[:-1] + ', ...]'
                return preview
        elif isinstance(obj, dict):
            if len(obj) <= 5:
                return str(obj)
            else:
                return f"dict with {len(obj)} items"
        elif isinstance(obj, str):
            if len(obj) > 100:
                return obj[:97] + '...'
            return obj
        elif isinstance(obj, (int, float, complex, bool)):
            return str(obj)
        else:
            result = str(obj)
            if len(result) > 100:
                return result[:97] + '...'
            return result
    except Exception as e:
        return f"<Error displaying value: {str(e)}>"


def get_item_size(item):
    """Get size of an item for detail view"""
    if isinstance(item, (list, tuple, dict, set)):
        return str(len(item))
    elif isinstance(item, np.ndarray):
        return str(item.shape)
    elif isinstance(item, pd.DataFrame):
        return f"({item.shape[0]}, {item.shape[1]})"
    else:
        return '1'