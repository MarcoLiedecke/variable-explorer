# Variable Explorer for VS Code

A powerful variable inspection and editing tool for Python development in Visual Studio Code, inspired by Spyder's Variable Explorer.

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-yellow.svg?style=for-the-badge&logo=buy-me-a-coffee)](https://buymeacoffee.com/marcoliedecke)

## Features

### Variable Inspection
- **Real-time variable tracking**: Automatically displays all variables in your Python namespace
- **Type information**: Shows the type, size, and value of each variable
- **Collection support**: Inspect lists, tuples, dicts, DataFrames, Series, and more
- **Sortable columns**: Click column headers to sort by name, type, size, or value
- **Smart filtering**: Filter variables by name with the built-in search function
- **Exclude patterns**: Hide private variables, uppercase constants, and more with customizable filters

### Interactive Data Views
- **List and Tuple exploration**: Click on any list or tuple to view its contents in a detailed modal
- **Dictionary navigation**: Click through nested dictionaries to explore complex JSON-like structures
- **Advanced DataFrame viewer**: Professional table view for pandas DataFrames with:
  - **Custom index preservation**: Named, numeric, and datetime indices display correctly
  - **Smart pagination**: Handle DataFrames with thousands of rows (50/100/250/500/All rows per page)
  - **Real-time search/filter**: Search across all columns as you type to filter rows instantly
  - **CSV export**: Export DataFrames (or filtered results) to CSV with one click
  - **Auto-sizing columns**: Column widths adapt to header text length for better readability
  - **Type tooltips**: Hover over column headers to see data types
  - **Sortable columns**: Click any column (including index) to sort
  - **NaN styling**: Missing values are clearly marked with italic + dimmed style
- **NumPy array visualization**: Interactive heatmap visualization for 1D and 2D arrays with customizable formatting
- **Breadcrumb navigation**: Track your path through nested structures with clickable breadcrumbs

### Inline Editing
- **Scalar editing**: Double-click numbers, strings, and booleans to edit them inline
- **Long string editor**: Strings longer than 40 characters open in a modal text editor
- **Type-safe updates**: Automatic type validation when editing variables
- **Real-time updates**: Changes are immediately reflected in your Python namespace

### Modern Interface
- **VSCode theme integration**: Automatically matches your VSCode theme
- **Color-coded types**: 33 distinct colors for different data types with 3 beautiful themes (Default, Warm, Cold)
- **Resizable columns**: Drag column borders to resize or auto-fit to content
- **Modal popups**: Clean, focused views for exploring complex data
- **Custom branding**: Beautiful logo integration in empty states and tab icons
- **Empty state**: Clean, minimalist view when no variables are defined

## Installation

1. Install from the VS Code Marketplace
2. Search for "Variable Explorer" in the Extensions view
3. Click Install

## Usage

### Opening the Variable Explorer

Use the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:
- **"Show Variable Explorer"** - Opens the Variable Explorer panel

### Running Python Code

The Variable Explorer works with Python code executed through:
- **Run File**: Execute an entire Python file (F5)
- **Run Code**: Execute selected Python code (F9 or Shift+Enter)
- The extension maintains a persistent Python namespace across executions

### Inspecting Variables

**View all variables:**
- All variables in the current namespace are displayed in the main table
- Click the refresh button to update the variable list

**Search and filter:**
- Click the search icon to filter variables by name
- Use the options menu to exclude private variables, uppercase constants, callables, modules, and more
- Choose from 3 color themes (Default, Warm Sunset, Cold Ocean) to match your preference

**Explore collections:**
- **Lists/Tuples**: Click on the value to see all items
- **Dictionaries**: Click to view key-value pairs, then click nested values to drill down
- **DataFrames**: Click to see a professional table view with:
  - Custom indices (named, datetime, numeric) preserved and displayed
  - Pagination controls for large DataFrames (up to thousands of rows)
  - Column headers that auto-size to their content
  - Sortable columns including the index column
  - Data type information on hover
- **NumPy Arrays**: Click to view interactive heatmap visualization with color-coded values
- **Nested structures**: Use breadcrumb navigation to move back up the hierarchy

**Sort data:**
- Click any column header in the main table or modals to sort
- Click again to toggle between ascending/descending order

**Resize columns:**
- Drag column borders to manually resize
- Use the options menu to auto-fit rows or columns to content

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
| Run Python file | `F5` |
| Run selection/line | `F9` or `Shift+Enter` |
| Save inline edit | `Enter` |
| Cancel inline edit | `Escape` |
| Close modal | `Escape` or click outside |
| Save in text editor | `Cmd+S` / `Ctrl+S` |

## Data Type Support

Variable Explorer supports 33+ data types with distinct color coding:

### Basic Types
- `int`, `float`, `complex` - Numeric values
- `Decimal`, `Fraction` - High-precision numbers
- `str` - Strings
- `bool` - Booleans
- `NoneType` - None values

### Collection Types
- `list`, `tuple` - Sequences
- `dict`, `OrderedDict`, `defaultdict`, `Counter` - Dictionaries (with nested navigation)
- `set`, `frozenset` - Sets
- `deque` - Double-ended queues

### Scientific Computing
- `numpy.ndarray` - NumPy arrays (with heatmap visualization)
- `pandas.DataFrame` - DataFrames (with table view)
- `pandas.Series` - Series
- `torch.Tensor` - PyTorch tensors
- `tensorflow.Tensor` - TensorFlow tensors
- JAX arrays

### Special Types
- `Path`, `PurePath` - File paths
- `UUID` - Unique identifiers
- `Pattern` - Regex patterns
- `datetime`, `date`, `timedelta` - Date/time objects
- `range`, `enumerate`, `zip` - Iterables
- Generator objects
- `bytes`, `bytearray`, `memoryview` - Binary data
- Exception types
- Functions, classes, and modules

## Configuration

The extension uses your default Python interpreter configured in VS Code:
```json
{
  "python.defaultInterpreterPath": "/path/to/python"
}
```

## Tips & Tricks

1. **DataFrame Search**: Type in the search box to instantly filter DataFrame rows across all columns
2. **Export Filtered Data**: Search for specific rows, then click the export icon to save only those rows to CSV
3. **Nested dictionaries**: Click through JSON-like structures by clicking on dict/list values in the modal
4. **DataFrames with custom indices**: Use `df.set_index('column_name')` and the index will be preserved with the correct name
5. **Large DataFrames**: All rows and columns are loaded - use pagination to navigate or search to filter
6. **Wide DataFrames**: Scroll horizontally to see all columns, or use search to find specific data
7. **DataFrame navigation**: Change rows per page (50/100/250/500/All) using the dropdown in pagination controls
8. **main() function locals**: Enable "Capture main() locals" in settings to inspect variables inside your main() function
9. **Large strings**: Use the modal editor for multi-line strings and better formatting
10. **Type preservation**: Edited values maintain their original type
11. **Breadcrumbs**: Click any part of the path to jump back to that level
12. **Variable Search**: Use the main search function to quickly find specific variables in large namespaces
13. **Filters**: Exclude private variables and other patterns to focus on relevant data
14. **Color Themes**: Choose from 3 visual color palette themes to personalize your type color-coding

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

- Visual Studio Code 1.80.0 or higher
- Python 3.6 or higher
- pandas (for DataFrame support)
- numpy (for NumPy array support)

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - See LICENSE file for details

## Changelog

### Version 0.1.9 (Latest)
- **Critical Backend Fix**: Fixed "Python backend not started" error when refreshing Variable Explorer
- **Backend Persistence**: Python backend now persists when webview panel is closed
- **Improved Error Handling**: Better error messages and status checks in refresh command
- **Race Condition Prevention**: Enhanced synchronization when running code before backend fully starts
- **Auto-Recovery**: Refresh now automatically attempts to restart backend if it's not running
- **UI Fix**: Corrected search button placement in toolbar header

### Version 0.1.8
- **UI Fix**: Fixed search button placement in toolbar header

### Version 0.1.7
- **DataFrame Search/Filter**: Real-time search across all DataFrame columns with instant filtering as you type
- **CSV Export**: Export entire DataFrames or filtered results to CSV files with one click
- **Performance Improvements**: Optimized JSON handling for DataFrames with 1000+ columns
- **Visual Enhancements**: New color palette selector with visual swatches instead of text labels
- **Fixed Modal Footer**: Pagination controls now stay visible in a fixed footer, not affected by horizontal scrolling
- **Improved UX**: All rows and columns are now loaded by default (no artificial limits)
- **Bug Fixes**: Fixed buffer overflow issues with very wide DataFrames

### Version 0.1.6
- **DataFrame Index Preservation**: Custom indices (named, numeric, datetime) are now correctly preserved and displayed
- **Index Name Display**: Index column header shows the actual index name instead of always "Index"
- **Unlimited Rows**: Removed 100-row limit for DataFrames - now supports thousands of rows with smart pagination
- **Smart Pagination**: Navigate large DataFrames with First/Prev/Next/Last buttons and adjustable rows per page (50/100/250/500/All)
- **Auto-sizing Column Headers**: Column widths automatically adapt to header text length for better readability
- **Improved NaN Display**: NaN values now styled with italic text and dimmed opacity for clarity
- **Column Type Tooltips**: Hover over DataFrame column headers to see data types
- **Enhanced Sorting**: Sort by any column including custom index columns
- **Subtle Pagination UI**: Redesigned pagination controls with minimal, VS Code-native styling
- **main() Locals Capture**: New setting to expose local variables from main() function (disabled by default)
- **Performance**: Optimized rendering for wide DataFrames with 50+ columns

### Version 0.1.5
- **Sponsorship Support**: Added Buy Me a Coffee integration for users who want to support development
- **Sponsor Command**: New "Support Variable Explorer" command accessible via Command Palette
- **Enhanced Documentation**: Updated README with support badges and links

### Version 0.1.4
- **Enhanced Type Support**: Added support for 33+ data types including PyTorch/TensorFlow tensors, Path objects, UUID, Decimal, Fraction, and more
- **Color Themes**: Three beautiful color palettes (Default, Warm Sunset, Cold Ocean) for type color-coding
- **NumPy Array Visualization**: Interactive heatmap viewer for 1D and 2D arrays with customizable formatting
- **Improved Branding**: Updated logo integration in empty states and tab icons
- **Bug Fixes**: Fixed modal display issues when switching between DataFrames and arrays
- **Performance**: Optimized type detection and color application

### Version 0.1.3
- Added extension icon and branding
- Improved marketplace presence

### Version 0.1.2
- Initial marketplace release
- Core variable inspection and editing features

## Support

If you find Variable Explorer useful, consider supporting its development:

<a href="https://buymeacoffee.com/marcoliedecke" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

Your support helps maintain and improve this extension!

## Acknowledgments

Inspired by the Spyder Variable Explorer, bringing similar functionality to VS Code.
