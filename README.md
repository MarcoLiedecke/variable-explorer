# Variable Explorer for VS Code

A powerful variable inspection and editing tool for Python development in Visual Studio Code, inspired by Spyder's Variable Explorer.

## Features

### =
 Variable Inspection
- **Real-time variable tracking**: Automatically displays all variables in your Python namespace
- **Type information**: Shows the type, size, and value of each variable
- **Collection support**: Inspect lists, tuples, dicts, DataFrames, Series, and more
- **Sortable columns**: Click column headers to sort by name, type, size, or value

### =� Interactive Data Views
- **List and Tuple exploration**: Click on any list or tuple to view its contents in a detailed modal
- **Dictionary navigation**: Click through nested dictionaries to explore complex JSON-like structures
- **DataFrame viewer**: Beautiful table view for pandas DataFrames with sortable columns
- **Breadcrumb navigation**: Track your path through nested structures with clickable breadcrumbs

###  Inline Editing
- **Scalar editing**: Double-click numbers, strings, and booleans to edit them inline
- **Long string editor**: Strings longer than 40 characters open in a modal text editor
- **Type-safe updates**: Automatic type validation when editing variables
- **Real-time updates**: Changes are immediately reflected in your Python namespace

### <� Modern Interface
- **VSCode theme integration**: Automatically matches your VSCode theme
- **Resizable columns**: Drag column borders to resize
- **Modal popups**: Clean, focused views for exploring complex data
- **Syntax highlighting**: Color-coded values by type

## Installation

1. Clone this repository into your VS Code extensions folder:
   ```bash
   git clone https://github.com/MarcoLiedecke/variable-explorer ~/.vscode/extensions/variable-explorer
   ```

2. Install dependencies:
   ```bash
   cd ~/.vscode/extensions/variable-explorer
   npm install
   ```

3. Reload VS Code

## Usage

### Opening the Variable Explorer

Use the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:
- **"Show Variable Explorer"** - Opens the Variable Explorer panel

### Running Python Code

The Variable Explorer works with Python code executed through:
- **Run File**: Execute an entire Python file
- **Run Code**: Execute selected Python code
- The extension maintains a persistent Python namespace across executions

### Inspecting Variables

**View all variables:**
- All variables in the current namespace are displayed in the main table
- Click the refresh button to update the variable list

**Explore collections:**
- **Lists/Tuples**: Click on the value to see all items
- **Dictionaries**: Click to view key-value pairs, then click nested values to drill down
- **DataFrames**: Click to see a tabular view with sortable columns
- **Nested structures**: Use breadcrumb navigation to move back up the hierarchy

**Sort data:**
- Click any column header in the main table or modals to sort
- Click again to toggle between ascending/descending order

### Editing Variables

**Short strings, numbers, and booleans:**
1. Double-click the value cell
2. Edit the value inline (cell turns grey)
3. Press `Enter` to save or `Escape` to cancel

**Long strings (>40 characters):**
1. Double-click the value cell
2. Edit in the modal text editor
3. Click "Save" or press `Cmd+S` / `Ctrl+S`

**Supported types for editing:**
- `int`, `float`, `complex` - Any numeric value
- `bool` - `true`, `false`, `1`, `0`, `yes`, `no`
- `str` - Any text value

### Managing Variables

**Clear all variables:**
- Click the trash icon in the toolbar to clear the namespace
- This removes all user-defined variables (built-ins are preserved)

**Refresh:**
- Click the refresh icon to update the variable list

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Save inline edit | `Enter` |
| Cancel inline edit | `Escape` |
| Close modal | `Escape` or click outside |
| Save in text editor | `Cmd+S` / `Ctrl+S` |

## Data Type Support

### Scalar Types
- `int`, `float`, `complex` - Numeric values
- `str` - Strings
- `bool` - Booleans
- `NoneType` - None values

### Collection Types
- `list`, `tuple` - Sequences
- `dict` - Dictionaries (with nested navigation)
- `set`, `frozenset` - Sets
- `pandas.DataFrame` - DataFrames
- `pandas.Series` - Series
- `numpy.ndarray` - NumPy arrays

## Configuration

The extension uses your default Python interpreter configured in VS Code:
```json
{
  "python.defaultInterpreterPath": "/path/to/python"
}
```

## Tips & Tricks

1. **Nested dictionaries**: Click through JSON-like structures by clicking on dict/list values in the modal
2. **DataFrames**: Shows the first 100 rows. Click column headers to sort
3. **Large strings**: Use the modal editor for multi-line strings and better formatting
4. **Type preservation**: Edited values maintain their original type
5. **Breadcrumbs**: Click any part of the path to jump back to that level

## Troubleshooting

**Variables not showing:**
- Ensure you've run Python code first
- Click the refresh button
- Check that Python is properly configured

**Edit not working:**
- Verify the variable type is supported for editing
- Check for validation errors in VS Code notifications

**Modal not closing:**
- Click outside the modal or press `Escape`
- Click the X button in the modal header

## Requirements

- Visual Studio Code 1.60.0 or higher
- Python 3.6 or higher
- pandas (for DataFrame support)
- numpy (for NumPy array support)

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - See LICENSE file for details

## Acknowledgments

Inspired by the Spyder Variable Explorer, bringing similar functionality to VS Code.
