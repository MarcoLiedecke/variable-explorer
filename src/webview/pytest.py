"""
Comprehensive Python Datatypes Demo
Includes all major Python datatypes and various dataframes
"""

import pandas as pd
import numpy as np
from datetime import datetime, date, time, timedelta
from decimal import Decimal
from fractions import Fraction

# ============================================================================
# BASIC DATATYPES
# ============================================================================

# Numeric Types
integer_var = 42
float_var = 3.14159
complex_var = 3 + 4j
decimal_var = Decimal('10.25')
fraction_var = Fraction(3, 4)

# Boolean
bool_true = True
bool_false = False

# None Type
none_var = None

# String Types
string_var = "Hello, World!"
multiline_string = """This is a
multiline string
with multiple lines"""
raw_string = r"C:\Users\path\to\file"
formatted_string = f"The answer is {integer_var}"

# Bytes
bytes_var = b"Hello bytes"
bytearray_var = bytearray(b"Hello bytearray")

# ============================================================================
# COLLECTION TYPES
# ============================================================================

# List (mutable, ordered)
list_var = [1, 2, 3, 4, 5]
mixed_list = [1, "two", 3.0, True, None, [1, 2, 3]]
nested_list = [[1, 2], [3, 4], [5, 6]]

# Tuple (immutable, ordered)
tuple_var = (1, 2, 3, 4, 5)
single_tuple = (42,)
nested_tuple = ((1, 2), (3, 4), (5, 6))

# Set (mutable, unordered, unique)
set_var = {1, 2, 3, 4, 5}
string_set = {"apple", "banana", "cherry"}

# Frozen Set (immutable set)
frozenset_var = frozenset([1, 2, 3, 4, 5])

# Dictionary (key-value pairs)
dict_var = {"name": "John", "age": 30, "city": "New York"}
nested_dict = {
    "person1": {"name": "Alice", "age": 25},
    "person2": {"name": "Bob", "age": 30}
}
mixed_dict = {
    "int": 42,
    "float": 3.14,
    "list": [1, 2, 3],
    "dict": {"nested": "value"}
}

# ============================================================================
# DATE AND TIME TYPES
# ============================================================================

datetime_var = datetime.now()
date_var = date.today()
time_var = time(14, 30, 0)
timedelta_var = timedelta(days=7, hours=3, minutes=30)

# ============================================================================
# NUMPY ARRAYS
# ============================================================================

# 1D Arrays
numpy_1d = np.array([1, 2, 3, 4, 5])
numpy_zeros = np.zeros(10)
numpy_ones = np.ones(10)
numpy_range = np.arange(0, 100, 5)
numpy_linspace = np.linspace(0, 1, 50)

# 2D Arrays
numpy_2d = np.array([[1, 2, 3], [4, 5, 6], [7, 8, 9]])
numpy_random = np.random.rand(5, 5)
numpy_identity = np.eye(4)

# 3D Array
numpy_3d = np.random.rand(3, 4, 5)

# ============================================================================
# SMALL DATAFRAMES
# ============================================================================

# Tiny DataFrame (3 rows)
df_tiny = pd.DataFrame({
    'id': [1, 2, 3],
    'name': ['Alice', 'Bob', 'Charlie'],
    'score': [85, 92, 78]
})

# Small DataFrame (10 rows)
df_small = pd.DataFrame({
    'product': [f'Product_{i}' for i in range(10)],
    'price': np.random.uniform(10, 100, 10).round(2),
    'quantity': np.random.randint(1, 50, 10),
    'category': np.random.choice(['Electronics', 'Clothing', 'Food'], 10),
    'in_stock': np.random.choice([True, False], 10)
})

# Medium DataFrame (100 rows)
df_medium = pd.DataFrame({
    'employee_id': range(1, 101),
    'name': [f'Employee_{i}' for i in range(1, 101)],
    'department': np.random.choice(['Sales', 'Marketing', 'IT', 'HR', 'Finance'], 100),
    'salary': np.random.uniform(30000, 120000, 100).round(2),
    'years_experience': np.random.randint(0, 20, 100),
    'performance_rating': np.random.uniform(1, 5, 100).round(2),
    'hire_date': pd.date_range(start='2010-01-01', periods=100, freq='M')
})

# ============================================================================
# LARGE DATAFRAMES
# ============================================================================

# Large DataFrame (1,000 rows)
np.random.seed(42)
df_large = pd.DataFrame({
    'transaction_id': range(1, 1001),
    'customer_id': np.random.randint(1, 200, 1000),
    'product_id': np.random.randint(1, 50, 1000),
    'amount': np.random.uniform(5, 500, 1000).round(2),
    'quantity': np.random.randint(1, 10, 1000),
    'date': pd.date_range(start='2023-01-01', periods=1000, freq='h'),
    'payment_method': np.random.choice(['Credit Card', 'Debit Card', 'Cash', 'PayPal'], 1000),
    'status': np.random.choice(['Completed', 'Pending', 'Cancelled'], 1000, p=[0.8, 0.15, 0.05])
})

# Very Large DataFrame (10,000 rows)
df_very_large = pd.DataFrame({
    'id': range(1, 10001),
    'timestamp': pd.date_range(start='2020-01-01', periods=10000, freq='min'),
    'sensor_1': np.random.normal(25, 5, 10000).round(2),
    'sensor_2': np.random.normal(50, 10, 10000).round(2),
    'sensor_3': np.random.exponential(2, 10000).round(2),
    'sensor_4': np.random.uniform(0, 100, 10000).round(2),
    'category': np.random.choice(['A', 'B', 'C', 'D'], 10000),
    'is_anomaly': np.random.choice([True, False], 10000, p=[0.05, 0.95])
})

# ============================================================================
# SPECIALIZED DATAFRAMES
# ============================================================================

# DataFrame with missing values
df_with_nulls = pd.DataFrame({
    'col1': [1, 2, np.nan, 4, 5],
    'col2': ['a', None, 'c', 'd', 'e'],
    'col3': [1.1, 2.2, 3.3, np.nan, 5.5]
})

# DataFrame with datetime index
df_timeseries = pd.DataFrame({
    'value': np.random.randn(100).cumsum(),
    'volume': np.random.randint(100, 1000, 100)
}, index=pd.date_range('2024-01-01', periods=100, freq='D'))

# DataFrame with MultiIndex
arrays = [
    ['A', 'A', 'B', 'B', 'C', 'C'],
    ['X', 'Y', 'X', 'Y', 'X', 'Y']
]
df_multiindex = pd.DataFrame(
    np.random.randn(6, 3),
    index=pd.MultiIndex.from_arrays(arrays, names=['first', 'second']),
    columns=['col1', 'col2', 'col3']
)

# DataFrame with various data types
df_mixed_types = pd.DataFrame({
    'integers': [1, 2, 3, 4, 5],
    'floats': [1.1, 2.2, 3.3, 4.4, 5.5],
    'strings': ['a', 'b', 'c', 'd', 'e'],
    'booleans': [True, False, True, False, True],
    'dates': pd.date_range('2024-01-01', periods=5),
    'categories': pd.Categorical(['cat1', 'cat2', 'cat1', 'cat3', 'cat2'])
})

# ============================================================================
# PRINT SUMMARY
# ============================================================================

if __name__ == "__main__":
    print("=" * 80)
    print("PYTHON DATATYPES DEMO")
    print("=" * 80)
    
    print("\n📊 DATAFRAMES CREATED:")
    print(f"  - df_tiny: {df_tiny.shape} - Small sample dataset")
    print(f"  - df_small: {df_small.shape} - Product inventory")
    print(f"  - df_medium: {df_medium.shape} - Employee records")
    print(f"  - df_large: {df_large.shape} - Transaction data")
    print(f"  - df_very_large: {df_very_large.shape} - Sensor readings")
    print(f"  - df_with_nulls: {df_with_nulls.shape} - Contains missing values")
    print(f"  - df_timeseries: {df_timeseries.shape} - Time series with datetime index")
    print(f"  - df_multiindex: {df_multiindex.shape} - MultiIndex example")
    print(f"  - df_mixed_types: {df_mixed_types.shape} - Various data types")
    
    print("\n🔢 BASIC TYPES:")
    print(f"  - Integers, Floats, Complex, Decimal, Fraction")
    print(f"  - Strings, Bytes, Boolean, None")
    
    print("\n📦 COLLECTIONS:")
    print(f"  - Lists, Tuples, Sets, FrozenSets, Dictionaries")
    
    print("\n🔬 NUMPY ARRAYS:")
    print(f"  - 1D, 2D, and 3D arrays")
    
    print("\n📅 DATE/TIME:")
    print(f"  - datetime, date, time, timedelta")
    
    print("\n" + "=" * 80)
    print("\nExample - View tiny dataframe:")
    print(df_tiny)
    
    print("\nExample - View first 5 rows of large dataframe:")
    print(df_large.head())
    
    print("\nExample - DataFrame info:")
    print(df_medium.info())