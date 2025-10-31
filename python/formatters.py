"""
python/formatters.py - Value formatting and display functions
"""

import numpy as np
import pandas as pd
import json
from pathlib import Path, PurePath
from decimal import Decimal
from fractions import Fraction
from uuid import UUID
from collections import OrderedDict, defaultdict, Counter, deque
import re

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
        # NumPy arrays
        if isinstance(obj, np.ndarray):
            if obj.size <= 10:
                return str(obj.tolist())
            else:
                return f"ndarray object of numpy module"

        # PyTorch tensors
        elif 'torch' in str(type(obj)) and hasattr(obj, 'shape'):
            return f"Tensor{tuple(obj.shape)}"

        # TensorFlow tensors
        elif 'tensorflow' in str(type(obj)) and hasattr(obj, 'shape'):
            return f"Tensor{tuple(obj.shape)}"

        # JAX arrays
        elif 'jax' in str(type(obj)) and hasattr(obj, 'shape'):
            return f"Array{tuple(obj.shape)}"

        # Pandas
        elif isinstance(obj, pd.DataFrame):
            cols = ', '.join(obj.columns.tolist())
            return f"Column names: {cols}"

        # Path objects
        elif isinstance(obj, (Path, PurePath)):
            return str(obj)

        # UUID
        elif isinstance(obj, UUID):
            return str(obj)

        # Decimal and Fraction
        elif isinstance(obj, Decimal):
            return str(obj)
        elif isinstance(obj, Fraction):
            return str(obj)

        # Regex patterns
        elif isinstance(obj, re.Pattern):
            return f"Pattern: {obj.pattern}"

        # Collections
        elif isinstance(obj, deque):
            if len(obj) <= 10:
                return f"deque({list(obj)})"
            else:
                preview = list(obj)[:3]
                return f"deque([{', '.join(map(str, preview))}, ...])"
        elif isinstance(obj, Counter):
            if len(obj) <= 5:
                return str(dict(obj))
            else:
                return f"Counter with {len(obj)} items"
        elif isinstance(obj, (OrderedDict, defaultdict)):
            if len(obj) <= 5:
                return str(dict(obj))
            else:
                return f"{type(obj).__name__} with {len(obj)} items"

        # Lists and tuples
        elif isinstance(obj, (list, tuple)):
            if len(obj) <= 10:
                return str(obj)
            else:
                preview = str(obj[:3])[:-1] + ', ...]'
                return preview

        # Dicts and sets
        elif isinstance(obj, dict):
            if len(obj) <= 5:
                return str(obj)
            else:
                return f"dict with {len(obj)} items"
        elif isinstance(obj, (set, frozenset)):
            if len(obj) <= 5:
                return str(obj)
            else:
                return f"{type(obj).__name__} with {len(obj)} items"

        # Generators
        elif hasattr(obj, '__next__') and hasattr(obj, '__iter__'):
            return f"<generator object>"

        # Memoryview
        elif isinstance(obj, memoryview):
            return f"<memory at {hex(id(obj))}>"

        # Strings
        elif isinstance(obj, str):
            if len(obj) > 100:
                return obj[:97] + '...'
            return obj

        # Basic types
        elif isinstance(obj, (int, float, complex, bool)):
            return str(obj)

        # Exceptions
        elif isinstance(obj, BaseException):
            return f"{type(obj).__name__}: {str(obj)}"

        # Default
        else:
            result = str(obj)
            if len(result) > 100:
                return result[:97] + '...'
            return result
    except Exception as e:
        return f"<Error displaying value: {str(e)}>"


def get_item_size(item):
    """Get size of an item for detail view"""
    if isinstance(item, (list, tuple, dict, set, frozenset, deque, Counter, OrderedDict, defaultdict)):
        return str(len(item))
    elif isinstance(item, np.ndarray):
        return str(item.shape)
    elif 'torch' in str(type(item)) and hasattr(item, 'shape'):
        return str(tuple(item.shape))
    elif 'tensorflow' in str(type(item)) and hasattr(item, 'shape'):
        return str(tuple(item.shape))
    elif 'jax' in str(type(item)) and hasattr(item, 'shape'):
        return str(tuple(item.shape))
    elif isinstance(item, pd.DataFrame):
        return f"({item.shape[0]}, {item.shape[1]})"
    else:
        return '1'