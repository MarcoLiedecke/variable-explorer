const vscode = acquireVsCodeApi();
let currentVariables = [];
let allVariables = []; // Store all variables before filtering
let sortColumn = 0;
let sortAscending = true;
let modalSortColumn = 0;
let modalSortAscending = true;
let modalData = null; // Store the current modal data
let arrayFormat = '%.4f'; // Default format for array values
let arrayCellWidth = 80; // Default cell width for arrays
let arrayCellHeight = 30; // Default cell height for arrays

// DataFrame viewer state (see displayDataFrame)
let dfState = null;
let dfRowsPerPage = 100;

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Every value coming from Python is untrusted text: escape before using innerHTML.
function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

// Filter state - default: private, callables, and modules are excluded
let filterOptions = {
    private: true,
    uppercase: false,
    capitalized: false,
    unsupported: false,
    callables: true,
    modules: true
};

// Search state
let searchQuery = '';

// Color palette state
let currentPalette = 'default';

// Initialize filter checkboxes and palette on page load
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('filterPrivate').checked = filterOptions.private;
    document.getElementById('filterUppercase').checked = filterOptions.uppercase;
    document.getElementById('filterCapitalized').checked = filterOptions.capitalized;
    document.getElementById('filterUnsupported').checked = filterOptions.unsupported;
    document.getElementById('filterCallables').checked = filterOptions.callables;
    document.getElementById('filterModules').checked = filterOptions.modules;

    // Load saved palette preference
    let savedPalette = 'default';
    try {
        savedPalette = localStorage.getItem('colorPalette') || 'default';
    } catch (e) { /* storage unavailable */ }
    selectPalette(savedPalette);

    // Event delegation for the variable table (one listener instead of one per row)
    const tbody = document.getElementById('varTableBody');
    tbody.addEventListener('click', onVariableTableClick);
    tbody.addEventListener('dblclick', onVariableTableDblClick);

    // Tell the extension we're ready (it replies with settings, status and variables)
    vscode.postMessage({ command: 'ready' });
});

window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'updateVariables') {
        allVariables = message.variables || [];
        applyFiltersAndUpdate();
    } else if (message.command === 'showDetails') {
        showDetailsModal(message.data);
    } else if (message.command === 'setCaptureMainLocals') {
        document.getElementById('captureMainLocals').checked = !!message.value;
    } else if (message.command === 'status') {
        updateStatus(message);
    }
});

function updateStatus(status) {
    const text = document.getElementById('statusText');
    const stopBtn = document.getElementById('interruptBtn');
    if (text) {
        text.textContent = status.busy ? 'Running…' : (status.running ? status.python : 'Backend not started');
        text.title = status.pythonPath || '';
        text.classList.toggle('busy', !!status.busy);
    }
    if (stopBtn) {
        stopBtn.style.display = status.busy ? '' : 'none';
    }
}

function interruptExecution() {
    vscode.postMessage({ command: 'interrupt' });
}

function showOutput() {
    vscode.postMessage({ command: 'showOutput' });
}

function updateTable(variables) {
    const tbody = document.getElementById('varTableBody');
    const emptyState = document.getElementById('emptyState');
    const tableContainer = document.getElementById('tableContainer');

    if (variables.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'flex';
        tableContainer.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    tableContainer.style.display = 'block';

    // Build all rows in one go: much faster than insertRow() per variable.
    const html = new Array(variables.length);
    for (let i = 0; i < variables.length; i++) {
        const v = variables[i];
        const value = String(v.value);
        const isClickable = isCollectionType(v.type);
        const isLongString = v.type === 'str' && value.length > 40;
        const isEditable = isScalarType(v.type) && !isLongString;
        const classes = ['col-value', getValueClass(v.type)];
        if (isClickable || isLongString) classes.push('clickable');
        if (isEditable) classes.push('editable');
        html[i] = `<tr data-index="${i}">` +
            `<td class="col-name">${escapeHtml(v.name)}</td>` +
            `<td class="col-type">${escapeHtml(v.type)}</td>` +
            `<td class="col-size">${escapeHtml(v.size)}</td>` +
            `<td class="${classes.join(' ')}" title="${escapeHtml(value)}">${escapeHtml(value)}</td>` +
            '</tr>';
    }
    tbody.innerHTML = html.join('');
}

function variableForEvent(event) {
    const row = event.target.closest('tr[data-index]');
    if (!row) return null;
    return { row, v: currentVariables[Number(row.dataset.index)] };
}

function onVariableTableClick(event) {
    const hit = variableForEvent(event);
    if (!hit || !hit.v) return;
    if (event.target.closest('input')) return; // editing in progress
    if (isCollectionType(hit.v.type)) {
        viewDetails(hit.v.name, hit.v.type);
    }
}

function onVariableTableDblClick(event) {
    const hit = variableForEvent(event);
    if (!hit || !hit.v) return;
    const v = hit.v;
    const valueCell = hit.row.cells[3];
    if (event.target !== valueCell) return;
    const isLongString = v.type === 'str' && String(v.value).length > 40;
    if (isLongString) {
        openInEditor(v.name);
    } else if (isScalarType(v.type) && !isCollectionType(v.type)) {
        makeEditable(valueCell, v.name, v.type, v.value);
    }
}

function isCollectionType(type) {
    return type.includes('list') ||
            type.includes('tuple') ||
            type.includes('dict') ||
            type.includes('Array') ||
            type.includes('DataFrame') ||
            type.includes('Series') ||
            type.includes('ndarray');
}

// Exact names only: substring checks made e.g. a user class "Point" editable.
const NUMERIC_TYPE_RE = /^(u?int(8|16|32|64)?|intc|longlong|float(16|32|64|128)?|longdouble|complex(64|128|256)?)$/;
const SCALAR_TYPE_RE = /^(u?int(8|16|32|64)?|intc|longlong|float(16|32|64)?|longdouble|complex(64|128)?|str|bool|bool_)$/;

function isScalarType(type) {
    return SCALAR_TYPE_RE.test(String(type).toLowerCase());
}

function getValueClass(type) {
    const typeLower = type.toLowerCase();

    // Numeric types
    if (NUMERIC_TYPE_RE.test(typeLower)) {
        return 'value-numeric';
    }
    // Decimal and Fraction
    else if (typeLower === 'decimal') {
        return 'value-decimal';
    }
    else if (typeLower === 'fraction') {
        return 'value-fraction';
    }
    // String
    else if (typeLower === 'str') {
        return 'value-string';
    }
    // Boolean
    else if (typeLower === 'bool') {
        return 'value-bool';
    }
    // None
    else if (typeLower === 'nonetype') {
        return 'value-none';
    }
    // List
    else if (typeLower === 'list') {
        return 'value-list';
    }
    // Tuple
    else if (typeLower === 'tuple') {
        return 'value-tuple';
    }
    // Set and frozenset
    else if (typeLower === 'set') {
        return 'value-set';
    }
    else if (typeLower === 'frozenset') {
        return 'value-frozenset';
    }
    // Dict and special dicts
    else if (typeLower === 'dict') {
        return 'value-dict';
    }
    else if (typeLower === 'ordereddict') {
        return 'value-ordereddict';
    }
    else if (typeLower === 'defaultdict') {
        return 'value-defaultdict';
    }
    else if (typeLower === 'counter') {
        return 'value-counter';
    }
    // Deque
    else if (typeLower === 'deque') {
        return 'value-deque';
    }
    // NumPy array
    else if (typeLower.includes('ndarray')) {
        return 'value-array';
    }
    // Pandas DataFrame
    else if (typeLower === 'dataframe') {
        return 'value-dataframe';
    }
    // Pandas Series
    else if (typeLower === 'series') {
        return 'value-series';
    }
    // Tensors - PyTorch and TensorFlow
    else if (typeLower === 'tensor') {
        return 'value-tensor';
    }
    // JAX arrays
    else if (typeLower.includes('array') && (typeLower.includes('jax') || typeLower.includes('device'))) {
        return 'value-jax';
    }
    // Other arrays (fallback for numpy-like)
    else if (typeLower.includes('array')) {
        return 'value-array';
    }
    // Datetime types
    else if (typeLower === 'datetime' || typeLower === 'date' || typeLower === 'timedelta') {
        return 'value-datetime';
    }
    // Range and iterators
    else if (typeLower === 'range' || typeLower === 'enumerate' || typeLower === 'zip') {
        return 'value-range';
    }
    // Generators
    else if (typeLower.includes('generator') || typeLower.includes('iterator')) {
        return 'value-generator';
    }
    // Bytes and memoryview
    else if (typeLower === 'bytes' || typeLower === 'bytearray') {
        return 'value-bytes';
    }
    else if (typeLower === 'memoryview') {
        return 'value-memoryview';
    }
    // Path objects
    else if (typeLower.includes('path') || typeLower === 'posixpath' || typeLower === 'windowspath') {
        return 'value-path';
    }
    // UUID
    else if (typeLower === 'uuid') {
        return 'value-uuid';
    }
    // Regex Pattern
    else if (typeLower === 'pattern' || typeLower === 're.pattern') {
        return 'value-pattern';
    }
    // Exceptions
    else if (typeLower.includes('error') || typeLower.includes('exception')) {
        return 'value-exception';
    }
    // Functions
    else if (typeLower.includes('function') || typeLower === 'builtin_function_or_method' ||
             typeLower === 'method' || typeLower.includes('method_')) {
        return 'value-function';
    }
    // Classes
    else if (typeLower === 'type') {
        return 'value-class';
    }
    // Modules
    else if (typeLower === 'module') {
        return 'value-module';
    }
    // Custom objects (Person, etc.)
    else {
        return 'value-custom';
    }
}

function sortTable(col) {
    if (sortColumn === col) {
        sortAscending = !sortAscending;
    } else {
        sortColumn = col;
        sortAscending = true;
    }

    updateHeaderIndicators();

    const sorted = [...currentVariables].sort((a, b) => {
        let valA, valB;
        
        switch(col) {
            case 0:
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
                if (valA < valB) return sortAscending ? -1 : 1;
                if (valA > valB) return sortAscending ? 1 : -1;
                return 0;
                
            case 1:
                valA = a.type.toLowerCase();
                valB = b.type.toLowerCase();
                if (valA < valB) return sortAscending ? -1 : 1;
                if (valA > valB) return sortAscending ? 1 : -1;
                return 0;
                
            case 2:
                valA = parseSizeForSort(a.size);
                valB = parseSizeForSort(b.size);
                
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sortAscending ? valA - valB : valB - valA;
                } else if (typeof valA === 'number') {
                    return sortAscending ? -1 : 1;
                } else if (typeof valB === 'number') {
                    return sortAscending ? 1 : -1;
                }
                
                if (valA < valB) return sortAscending ? -1 : 1;
                if (valA > valB) return sortAscending ? 1 : -1;
                return 0;
                
            case 3:
                valA = parseValueForSort(a.value, a.type);
                valB = parseValueForSort(b.value, b.type);
                
                if (valA.typeOrder !== valB.typeOrder) {
                    return sortAscending ? 
                        valA.typeOrder - valB.typeOrder : 
                        valB.typeOrder - valA.typeOrder;
                }
                
                if (typeof valA.sortValue === 'number' && typeof valB.sortValue === 'number') {
                    return sortAscending ? 
                        valA.sortValue - valB.sortValue : 
                        valB.sortValue - valA.sortValue;
                }
                
                if (valA.sortValue < valB.sortValue) return sortAscending ? -1 : 1;
                if (valA.sortValue > valB.sortValue) return sortAscending ? 1 : -1;
                return 0;
        }
    });

    updateTable(sorted);
}

function parseSizeForSort(size) {
    const num = parseInt(size);
    if (!isNaN(num) && size === num.toString()) {
        return num;
    }
    return size;
}

function parseValueForSort(value, type) {
    let typeOrder;
    let sortValue;

    const typeLower = type.toLowerCase();

    // Basic numeric types
    if (NUMERIC_TYPE_RE.test(typeLower)) {
        typeOrder = 1;
        sortValue = parseFloat(value);
    } else if (typeLower === 'decimal' || typeLower === 'fraction') {
        typeOrder = 2;
        sortValue = parseFloat(value);
    } else if (typeLower === 'bool') {
        typeOrder = 3;
        sortValue = value;
    } else if (typeLower === 'str') {
        typeOrder = 4;
        sortValue = value;
    } else if (typeLower === 'nonetype') {
        typeOrder = 5;
        sortValue = 'None';
    }
    // Collections
    else if (typeLower === 'tuple') {
        typeOrder = 6;
        sortValue = value;
    } else if (typeLower === 'list') {
        typeOrder = 7;
        sortValue = value;
    } else if (typeLower === 'set') {
        typeOrder = 8;
        sortValue = value;
    } else if (typeLower === 'frozenset') {
        typeOrder = 9;
        sortValue = value;
    } else if (typeLower === 'dict' || typeLower === 'ordereddict' || typeLower === 'defaultdict') {
        typeOrder = 10;
        sortValue = value;
    } else if (typeLower === 'counter') {
        typeOrder = 11;
        sortValue = value;
    } else if (typeLower === 'deque') {
        typeOrder = 12;
        sortValue = value;
    }
    // Scientific arrays
    else if (typeLower.includes('ndarray') || (typeLower.includes('array') && !typeLower.includes('bytearray'))) {
        typeOrder = 13;
        sortValue = value;
    } else if (typeLower === 'tensor') {
        typeOrder = 14;
        sortValue = value;
    } else if (typeLower === 'series') {
        typeOrder = 15;
        sortValue = value;
    } else if (typeLower === 'dataframe') {
        typeOrder = 16;
        sortValue = value;
    }
    // Date/time
    else if (typeLower === 'datetime' || typeLower === 'date' || typeLower === 'timedelta') {
        typeOrder = 17;
        sortValue = value;
    }
    // Iterables
    else if (typeLower === 'range' || typeLower === 'enumerate' || typeLower === 'zip') {
        typeOrder = 18;
        sortValue = value;
    } else if (typeLower.includes('generator') || typeLower.includes('iterator')) {
        typeOrder = 19;
        sortValue = value;
    }
    // Binary/bytes
    else if (typeLower === 'bytes' || typeLower === 'bytearray') {
        typeOrder = 20;
        sortValue = value;
    } else if (typeLower === 'memoryview') {
        typeOrder = 21;
        sortValue = value;
    }
    // Special types
    else if (typeLower.includes('path')) {
        typeOrder = 22;
        sortValue = value;
    } else if (typeLower === 'uuid') {
        typeOrder = 23;
        sortValue = value;
    } else if (typeLower === 'pattern') {
        typeOrder = 24;
        sortValue = value;
    }
    // Callables
    else if (typeLower.includes('function') || typeLower.includes('method')) {
        typeOrder = 25;
        sortValue = value;
    } else if (typeLower === 'type') {
        typeOrder = 26;
        sortValue = value;
    } else if (typeLower === 'module') {
        typeOrder = 27;
        sortValue = value;
    }
    // Exceptions
    else if (typeLower.includes('error') || typeLower.includes('exception')) {
        typeOrder = 28;
        sortValue = value;
    }
    // Custom objects
    else {
        typeOrder = 29;
        sortValue = String(value);
    }

    return { typeOrder, sortValue };
}

function updateHeaderIndicators() {
    const headers = document.querySelectorAll('#varTable th');
    headers.forEach((header, index) => {
        const textSpan = header.querySelector('.header-text');
        if (!textSpan) return;
        
        const text = textSpan.textContent.replace(' ▲', '').replace(' ▼', '');
        
        if (index === sortColumn) {
            textSpan.textContent = text + (sortAscending ? ' ▲' : ' ▼');
        } else {
            textSpan.textContent = text;
        }
    });
}

function makeEditable(cell, varName, varType, currentValue) {
    // Save original content and background
    const originalContent = cell.textContent;
    const originalBackground = cell.style.backgroundColor;

    // Set grey background for editing mode
    cell.style.backgroundColor = 'var(--vscode-input-background)';

    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.style.width = '100%';
    input.style.padding = '4px';
    input.style.border = 'none';
    input.style.backgroundColor = 'transparent';
    input.style.color = 'var(--vscode-input-foreground)';
    input.style.fontFamily = 'inherit';
    input.style.fontSize = 'inherit';
    input.style.outline = 'none';

    // Replace cell content with input
    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    // Function to restore cell appearance
    const restoreCell = () => {
        cell.style.backgroundColor = originalBackground;
    };

    // Function to save changes
    const saveEdit = () => {
        const newValue = input.value;
        if (newValue !== currentValue) {
            // Send update to backend
            vscode.postMessage({
                command: 'updateVariable',
                name: varName,
                type: varType,
                value: newValue
            });
        }
        // Restore original content temporarily (will be updated after backend responds)
        cell.textContent = newValue;
        restoreCell();
    };

    // Function to cancel editing
    const cancelEdit = () => {
        cell.textContent = originalContent;
        restoreCell();
    };

    // Handle Enter key to save
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });

    // Handle blur to save
    input.addEventListener('blur', () => {
        saveEdit();
    });
}

let currentEditingVar = null;
let pendingStringEdit = null;

// The table only holds a truncated preview of long strings, so fetch the
// full value first - saving the preview would silently truncate the variable.
function openInEditor(varName) {
    pendingStringEdit = varName;
    viewDetails(varName, 'str');
}

function openEditorWithValue(varName, currentValue) {
    currentEditingVar = varName;

    const modal = document.getElementById('editorModal');
    const modalTitle = document.getElementById('editorModalTitle');
    const editor = document.getElementById('stringEditor');

    modalTitle.textContent = `Edit String: ${varName}`;
    editor.value = currentValue;

    modal.style.display = 'block';

    // Focus and select all after a brief delay to ensure modal is visible
    setTimeout(() => {
        editor.focus();
        editor.select();
    }, 100);
}

function closeEditorModal() {
    const modal = document.getElementById('editorModal');
    modal.style.display = 'none';
    currentEditingVar = null;
}

function saveStringEdit() {
    if (!currentEditingVar) return;

    const editor = document.getElementById('stringEditor');
    const newValue = editor.value;

    vscode.postMessage({
        command: 'updateVariable',
        name: currentEditingVar,
        type: 'str',
        value: newValue
    });

    closeEditorModal();
}

function refresh() {
    vscode.postMessage({ command: 'refresh' });
}

function viewDetails(name, type, path = null) {
    vscode.postMessage({ command: 'viewVariable', name: name, type: type, path: path });
}

const DETAIL_HEADERS = ['Key', 'Type', 'Size', 'Value'];
const DETAIL_WIDTHS = ['20%', '20%', '15%', '45%'];

// Restore the Key/Type/Size/Value header (the DataFrame view replaces it).
function resetDetailHeaders() {
    const thead = document.querySelector('#detailTable thead tr');
    thead.innerHTML = DETAIL_HEADERS.map((label, i) =>
        `<th style="width: ${DETAIL_WIDTHS[i]};" onclick="sortModalTable(${i})">` +
        `<span class="header-text">${label}</span>` +
        `<div class="resizer" onmousedown="startResize(event, ${i}, true)"></div></th>`
    ).join('');
}

function displayListData(items, tbody, rootName, currentPath, data) {
    const fragment = document.createDocumentFragment();
    items.forEach(item => {
        const row = document.createElement('tr');
        const isClickable = isCollectionType(item.type);
        row.innerHTML =
            `<td>${escapeHtml(item.index)}</td>` +
            `<td>${escapeHtml(item.type)}</td>` +
            `<td>${escapeHtml(item.size)}</td>` +
            `<td class="${getValueClass(item.type)} ${isClickable ? 'clickable' : ''}" title="${escapeHtml(item.value)}">${escapeHtml(item.value)}</td>`;
        if (isClickable) {
            row.cells[3].onclick = () => viewDetails(rootName, item.type, [...currentPath, item.index]);
        }
        fragment.appendChild(row);
    });
    if (data && data.truncated) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="4" class="truncation-note">Showing first ${items.length.toLocaleString()} of ${Number(data.total_items).toLocaleString()} items</td>`;
        fragment.appendChild(row);
    }
    tbody.appendChild(fragment);
}

function buildBreadcrumb(data) {
    const title = document.getElementById('modalTitle');
    title.textContent = '';
    const path = data.path || [];
    const addCrumb = (label, crumbPath) => {
        const span = document.createElement('span');
        span.className = 'breadcrumb-item clickable';
        span.textContent = label;
        span.onclick = () => viewDetails(data.name, data.type, crumbPath);
        title.appendChild(span);
    };
    addCrumb(data.name, null);
    path.forEach((part, i) => {
        title.appendChild(document.createTextNode(' → '));
        addCrumb(part, path.slice(0, i + 1));
    });
    const typeSpan = document.createElement('span');
    typeSpan.style.color = 'var(--vscode-descriptionForeground)';
    typeSpan.textContent = ` - ${data.type}`;
    title.appendChild(typeSpan);
}

function showDetailsModal(data) {
    // A full string requested for the string editor, not for the detail view.
    if (pendingStringEdit && data.name === pendingStringEdit && data.type === 'str' && !(data.path && data.path.length)) {
        pendingStringEdit = null;
        if (data.full_value === undefined) {
            return;
        }
        openEditorWithValue(data.name, data.full_value);
        return;
    }

    const modal = document.getElementById('detailModal');
    const tbody = document.getElementById('detailTableBody');
    const table = document.getElementById('detailTable');
    const modalFooter = document.getElementById('detailModalFooter');
    const path = data.path || [];

    buildBreadcrumb(data);
    tbody.innerHTML = '';
    modalData = data;
    dfState = null;
    modalSortColumn = 0;
    modalSortAscending = true;

    const oldArrayContainer = document.getElementById('arrayContainer');
    if (oldArrayContainer) {
        oldArrayContainer.remove();
    }
    table.style.display = 'table';
    modalFooter.style.display = 'none';
    const searchContainer = document.getElementById('dfSearchContainer');
    if (searchContainer) {
        searchContainer.style.display = 'none';
    }

    if (data.array_info) {
        displayNumpyArray(data.array_info, data.name);
    } else if (data.dataframe_info) {
        displayDataFrame(data.dataframe_info, tbody);
    } else {
        resetDetailHeaders();
        if (data.items && data.items.length > 0) {
            displayListData(data.items, tbody, data.name, path, data);
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">No data available</td></tr>';
        }
    }

    modal.style.display = 'block';
}

function displayNumpyArray(arrayInfo, arrayName) {
    const modalBody = document.querySelector('#detailModal .modal-body');

    // Hide the default table and create custom array view
    document.getElementById('detailTable').style.display = 'none';

    // Create array controls toolbar
    let controlsHTML = '<div class="array-controls">';

    if (arrayInfo.is_numeric) {
        controlsHTML += '<button class="array-btn" onclick="showFormatDialog()">Format</button>';
    }
    controlsHTML += '<button class="array-btn" onclick="autoResizeArray()">Resize</button>';
    controlsHTML += '</div>';

    // Create array grid container
    let gridHTML = '<div class="array-grid-container">';

    if (arrayInfo.data && arrayInfo.data.length > 0) {
        const displayNdim = arrayInfo.display_ndim || arrayInfo.ndim;
        if (arrayInfo.slice) {
            gridHTML += `<div class="truncation-note">Showing slice ${escapeHtml(arrayInfo.slice)} of ${arrayInfo.shape.join('×')} array</div>`;
        }
        if (displayNdim === 1) {
            gridHTML += renderArray1D(arrayInfo.data, arrayInfo.is_numeric);
        } else {
            gridHTML += renderArray2D(arrayInfo.data, arrayInfo.is_numeric);
        }

        if (arrayInfo.truncated) {
            gridHTML += '<div style="text-align: center; margin-top: 10px; font-style: italic; color: var(--vscode-descriptionForeground);">';
            gridHTML += (arrayInfo.display_ndim || arrayInfo.ndim) === 1
                ? `Showing first ${arrayInfo.data.length} of ${arrayInfo.shape[arrayInfo.shape.length - 1]} elements`
                : `Showing first 100×100 elements of ${arrayInfo.shape.join('×')} array`;
            gridHTML += '</div>';
        }
    } else {
        gridHTML += '<div style="text-align: center; padding: 20px;">No data available</div>';
    }

    gridHTML += '</div>';

    // Add to modal
    const arrayContainer = document.createElement('div');
    arrayContainer.id = 'arrayContainer';
    arrayContainer.innerHTML = controlsHTML + gridHTML;
    modalBody.appendChild(arrayContainer);
}

function renderArray1D(data, isNumeric) {
    let html = '<div class="array-grid" style="overflow-x: auto;"><table class="array-table"><thead><tr>';

    // Column headers (indices)
    for (let col = 0; col < data.length; col++) {
        html += `<th class="array-col-header" data-col="${col}" style="min-width: ${arrayCellWidth}px;">${col}<div class="array-resizer" onmousedown="startArrayResize(event, 'col', ${col})"></div></th>`;
    }
    html += '</tr></thead><tbody><tr>';

    // Data cells
    if (isNumeric) {
        const { min, max } = getMinMax(data);
        for (let col = 0; col < data.length; col++) {
            const value = data[col];
            const formattedValue = formatArrayValue(value);
            const bgColor = getHeatmapColor(value, min, max);
            const missing = value === null ? ' color: var(--vscode-descriptionForeground); font-style: italic;' : '';
            html += `<td class="array-cell" style="background-color: ${bgColor}; min-width: ${arrayCellWidth}px; height: ${arrayCellHeight}px;${missing}">${formattedValue}</td>`;
        }
    } else {
        for (let col = 0; col < data.length; col++) {
            const value = data[col];
            html += `<td class="array-cell" style="min-width: ${arrayCellWidth}px; height: ${arrayCellHeight}px;">${escapeHtml(value)}</td>`;
        }
    }

    html += '</tr></tbody></table></div>';
    return html;
}

function renderArray2D(data, isNumeric) {
    let html = '<div class="array-grid" style="overflow: auto; max-height: 600px;"><table class="array-table"><thead><tr>';

    // Column headers (indices)
    html += '<th class="array-corner"></th>'; // Corner cell
    for (let col = 0; col < data[0].length; col++) {
        html += `<th class="array-col-header" data-col="${col}" style="min-width: ${arrayCellWidth}px;">${col}<div class="array-resizer" onmousedown="startArrayResize(event, 'col', ${col})"></div></th>`;
    }
    html += '</tr></thead><tbody>';

    // Data rows
    if (isNumeric) {
        const flatData = data.flat();
        const { min, max } = getMinMax(flatData);

        for (let row = 0; row < data.length; row++) {
            html += '<tr>';
            html += `<th class="array-row-header" data-row="${row}" style="height: ${arrayCellHeight}px;">${row}<div class="array-row-resizer" onmousedown="startArrayResize(event, 'row', ${row})"></div></th>`;
            for (let col = 0; col < data[row].length; col++) {
                const value = data[row][col];
                const formattedValue = formatArrayValue(value);
                const bgColor = getHeatmapColor(value, min, max);
                const missing = value === null ? ' color: var(--vscode-descriptionForeground); font-style: italic;' : '';
                html += `<td class="array-cell" style="background-color: ${bgColor}; min-width: ${arrayCellWidth}px; height: ${arrayCellHeight}px;${missing}">${formattedValue}</td>`;
            }
            html += '</tr>';
        }
    } else {
        for (let row = 0; row < data.length; row++) {
            html += '<tr>';
            html += `<th class="array-row-header" data-row="${row}" style="height: ${arrayCellHeight}px;">${row}<div class="array-row-resizer" onmousedown="startArrayResize(event, 'row', ${row})"></div></th>`;
            for (let col = 0; col < data[row].length; col++) {
                const value = data[row][col];
                html += `<td class="array-cell" style="min-width: ${arrayCellWidth}px; height: ${arrayCellHeight}px;">${escapeHtml(value)}</td>`;
            }
            html += '</tr>';
        }
    }

    html += '</tbody></table></div>';
    return html;
}

function getMinMax(flatData) {
    // A plain loop: Math.min(...bigArray) overflows the call stack on large arrays.
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < flatData.length; i++) {
        const v = flatData[i];
        if (typeof v === 'number' && !isNaN(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }
    return min === Infinity ? { min: 0, max: 1 } : { min, max };
}

function getHeatmapColor(value, min, max) {
    if (typeof value !== 'number' || isNaN(value)) {
        return 'var(--vscode-editor-background)';
    }

    // Normalize value between 0 and 1
    const normalized = max === min ? 0.5 : (value - min) / (max - min);

    // Use a blue-white-red color scheme
    let r, g, b;
    if (normalized < 0.5) {
        // Blue to white
        const t = normalized * 2;
        r = Math.round(100 + t * 155);
        g = Math.round(149 + t * 106);
        b = Math.round(237 + t * 18);
    } else {
        // White to red
        const t = (normalized - 0.5) * 2;
        r = Math.round(255);
        g = Math.round(255 - t * 100);
        b = Math.round(255 - t * 100);
    }

    return `rgb(${r}, ${g}, ${b})`;
}

function formatArrayValue(value) {
    if (value === null || value === undefined) return 'nan'; // NaN/inf are sent as null
    if (typeof value !== 'number') return escapeHtml(value);

    // Parse printf-style format
    const match = arrayFormat.match(/%(\d*)(\.(\d+))?([fdeg])/);
    if (!match) return value.toFixed(4);

    const decimals = match[3] ? parseInt(match[3]) : 4;
    const type = match[4];

    switch(type) {
        case 'f':
            return value.toFixed(decimals);
        case 'd':
            return Math.round(value).toString();
        case 'e':
            return value.toExponential(decimals);
        case 'g':
            return value.toPrecision(decimals);
        default:
            return value.toFixed(decimals);
    }
}

function showFormatDialog() {
    const currentFormat = arrayFormat;
    const newFormat = prompt('Enter array format (printf-style: %.4f, %.2e, %d, etc.):', currentFormat);

    if (newFormat && newFormat !== currentFormat) {
        arrayFormat = newFormat;
        // Refresh the array display
        refreshArrayDisplay();
    }
}

function autoResizeArray() {
    // Auto-calculate optimal cell sizes based on content
    const cells = document.querySelectorAll('.array-cell');
    if (cells.length === 0) return;

    // Sample first 20 cells to determine optimal width
    let maxWidth = 50;
    const testDiv = document.createElement('div');
    testDiv.style.position = 'absolute';
    testDiv.style.visibility = 'hidden';
    testDiv.style.whiteSpace = 'nowrap';
    testDiv.style.fontFamily = getComputedStyle(cells[0]).fontFamily;
    testDiv.style.fontSize = getComputedStyle(cells[0]).fontSize;
    document.body.appendChild(testDiv);

    for (let i = 0; i < Math.min(20, cells.length); i++) {
        testDiv.textContent = cells[i].textContent;
        maxWidth = Math.max(maxWidth, testDiv.offsetWidth + 20);
    }
    document.body.removeChild(testDiv);

    arrayCellWidth = Math.min(maxWidth, 200); // Cap at 200px
    arrayCellHeight = 30;

    // Refresh the array display
    refreshArrayDisplay();
}

function refreshArrayDisplay() {
    if (!modalData || !modalData.array_info) return;

    // Remove old array container
    const oldContainer = document.getElementById('arrayContainer');
    if (oldContainer) {
        oldContainer.remove();
    }

    // Re-render the array
    displayNumpyArray(modalData.array_info, modalData.name);
}

// ---------------------------------------------------------------------------
// DataFrame / Series viewer
//
// The backend sends   { columns: [...], dtypes: [...], index: [...], data: [[row], ...] }
// Rows are kept as {pos, idx, v} so sorting/searching never loses the index.
// ---------------------------------------------------------------------------

function dfColumnWidthEm(label) {
    const baseWidth = Math.max(String(label).length * 0.6 + 2, 6);
    return Math.min(baseWidth, 20);
}

function displayDataFrame(dfInfo, tbody) {
    const columns = dfInfo.columns || [];
    const data = dfInfo.data || [];
    const index = dfInfo.index || [];
    const rows = new Array(data.length);
    for (let i = 0; i < data.length; i++) {
        rows[i] = { pos: i, idx: index.length ? index[i] : i, v: data[i] };
    }

    dfState = {
        info: dfInfo,
        columns,
        rows,            // current (possibly sorted) order
        filtered: null,  // rows matching the search, or null
        searchTerm: '',
        sortColumn: null, // -1 = index, 0..n-1 = column
        sortAscending: true,
        page: 1
    };

    // Search box
    const searchContainer = document.getElementById('dfSearchContainer');
    if (searchContainer) {
        const searchInput = document.getElementById('dfSearchInput');
        const clearSearchBtn = document.getElementById('dfClearSearch');
        searchContainer.style.display = 'flex';
        // Replace nodes to drop listeners from a previously shown DataFrame
        const newSearchInput = searchInput.cloneNode(true);
        newSearchInput.value = '';
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        const newClearBtn = clearSearchBtn.cloneNode(true);
        newClearBtn.style.display = 'none';
        clearSearchBtn.parentNode.replaceChild(newClearBtn, clearSearchBtn);

        let searchTimer = null;
        newSearchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            const value = e.target.value;
            // Debounce: searching 50k rows on every keystroke feels sluggish
            searchTimer = setTimeout(() => dfHandleSearch(value), rows.length > 5000 ? 200 : 0);
        });
        newClearBtn.addEventListener('click', () => {
            newSearchInput.value = '';
            dfHandleSearch('');
        });
    }

    // Header
    const thead = document.querySelector('#detailTable thead tr');
    thead.innerHTML = '';
    const indexName = dfInfo.index_name || 'Index';
    const indexHeader = document.createElement('th');
    indexHeader.innerHTML = '<span class="header-text"></span>';
    indexHeader.querySelector('.header-text').textContent = indexName;
    // Size the index column to its labels instead of letting it take all spare width.
    let longestIndex = indexName.length;
    for (let i = 0; i < index.length && i < 5000; i++) {
        const len = index[i] === null || index[i] === undefined ? 3 : String(index[i]).length;
        if (len > longestIndex) longestIndex = len;
    }
    const indexWidth = `${Math.min(Math.max(longestIndex * 0.6 + 2, 4), 16)}em`;
    indexHeader.style.width = indexWidth;
    indexHeader.style.minWidth = indexWidth;
    indexHeader.style.maxWidth = indexWidth;
    indexHeader.style.whiteSpace = 'nowrap';
    indexHeader.style.overflow = 'hidden';
    indexHeader.style.textOverflow = 'ellipsis';
    indexHeader.title = indexName;
    indexHeader.style.cursor = 'pointer';
    indexHeader.onclick = () => sortDataFrame(-1);
    thead.appendChild(indexHeader);

    columns.forEach((col, idx) => {
        const th = document.createElement('th');
        th.innerHTML = '<span class="header-text"></span>';
        th.querySelector('.header-text').textContent = col;
        const width = dfColumnWidthEm(col);
        th.style.width = `${width}em`;
        th.style.minWidth = `${Math.min(width, 6)}em`;
        th.style.maxWidth = `${width}em`;
        th.style.whiteSpace = 'nowrap';
        th.style.overflow = 'hidden';
        th.style.textOverflow = 'ellipsis';
        const dtype = (dfInfo.dtypes && dfInfo.dtypes[idx]) || 'unknown';
        th.title = `${col}\nType: ${dtype}`;
        th.style.cursor = 'pointer';
        th.onclick = () => sortDataFrame(idx);
        thead.appendChild(th);
    });

    if (rows.length === 0) {
        const emptyRow = tbody.insertRow();
        const emptyCell = emptyRow.insertCell();
        emptyCell.colSpan = columns.length + 1;
        emptyCell.style.textAlign = 'center';
        emptyCell.style.padding = '20px';
        emptyCell.textContent = 'Empty DataFrame';
        renderDataFrameFooter(0, 0, 0, 1);
        return;
    }
    renderDataFramePage();
}

function formatDataFrameCell(cell, value) {
    if (value === null || value === undefined) {
        cell.textContent = 'NaN';
        cell.className = 'value-none';
        cell.style.fontStyle = 'italic';
        cell.style.opacity = '0.6';
        return;
    }
    if (typeof value === 'number') {
        cell.textContent = Number.isInteger(value) ? String(value) : value.toFixed(4);
        cell.className = 'value-numeric';
    } else if (typeof value === 'boolean') {
        cell.textContent = value ? 'True' : 'False';
        cell.className = 'value-bool';
    } else {
        cell.textContent = String(value);
        cell.className = 'value-string';
    }
    cell.title = String(value);
}

function renderDataFramePage() {
    if (!dfState) return;
    const tbody = document.getElementById('detailTableBody');
    tbody.innerHTML = '';

    const displayRows = dfState.filtered !== null ? dfState.filtered : dfState.rows;
    const totalRows = displayRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / dfRowsPerPage));
    dfState.page = Math.min(Math.max(1, dfState.page), totalPages);
    const startIdx = (dfState.page - 1) * dfRowsPerPage;
    const endIdx = Math.min(startIdx + dfRowsPerPage, totalRows);
    const widths = dfState.columns.map(c => `${dfColumnWidthEm(c)}em`);

    const fragment = document.createDocumentFragment();
    for (let r = startIdx; r < endIdx; r++) {
        const row = displayRows[r];
        const tr = document.createElement('tr');
        const indexCell = tr.insertCell();
        const indexValue = row.idx === null || row.idx === undefined ? 'NaN' : String(row.idx);
        indexCell.textContent = indexValue;
        indexCell.title = indexValue;
        indexCell.style.fontWeight = '600';
        for (let c = 0; c < dfState.columns.length; c++) {
            const cell = tr.insertCell();
            cell.style.maxWidth = widths[c];
            cell.style.overflow = 'hidden';
            cell.style.textOverflow = 'ellipsis';
            cell.style.whiteSpace = 'nowrap';
            formatDataFrameCell(cell, row.v[c]);
        }
        fragment.appendChild(tr);
    }
    tbody.appendChild(fragment);

    if (totalRows === 0) {
        const tr = tbody.insertRow();
        const td = tr.insertCell();
        td.colSpan = dfState.columns.length + 1;
        td.style.textAlign = 'center';
        td.style.padding = '20px';
        td.textContent = 'No matching rows';
    }

    renderDataFrameFooter(totalRows, startIdx, endIdx, totalPages);
}

function renderDataFrameFooter(totalRows, startIdx, endIdx, totalPages) {
    const modalFooter = document.getElementById('detailModalFooter');
    const info = dfState.info;
    const page = dfState.page;
    const exportButton = `
        <button id="exportCSVBtn" class="pagination-btn" title="Export all rows to CSV" style="padding: 6px;">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.5 3h-11L2 4v8l.5 1h11l.5-1V4l-.5-1zm-.5 9H3V4h10v8z"/>
                <path d="M8.5 6h-1v3.5L6 8v1l2 1.5L10 9V8L8.5 9.5V6z"/>
            </svg>
        </button>`;
    const fullShape = info.shape || [dfState.rows.length, dfState.columns.length];
    const truncationNote = info.truncated
        ? `<div class="truncation-note">Loaded first ${Number(info.loaded_rows).toLocaleString()} of ${Number(fullShape[0]).toLocaleString()} rows (setting: variableExplorer.maxDataFrameRows)</div>`
        : '';

    modalFooter.style.display = 'flex';
    modalFooter.style.justifyContent = 'space-between';
    modalFooter.style.flexWrap = 'wrap';

    if (dfState.rows.length > 100 || totalPages > 1) {
        const firstDisabled = page === 1 ? 'disabled' : '';
        const lastDisabled = page === totalPages ? 'disabled' : '';
        const options = [50, 100, 250, 500].map(n =>
            `<option value="${n}" ${dfRowsPerPage === n ? 'selected' : ''}>${n}</option>`).join('');
        const allSelected = ![50, 100, 250, 500].includes(dfRowsPerPage) ? 'selected' : '';
        modalFooter.innerHTML = `
            ${exportButton}
            <div style="display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; color: var(--vscode-foreground);">
                <button onclick="dfChangePage(1)" ${firstDisabled} class="pagination-btn" title="First page">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2v12h2V2H2zm3 0l9 6-9 6V2z"/></svg>
                </button>
                <button onclick="dfChangePage(${page - 1})" ${firstDisabled} class="pagination-btn" title="Previous page">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11 2L5 8l6 6V2z"/></svg>
                </button>
                <span style="margin: 0 8px; font-size: 12px; opacity: 0.8;">
                    ${page} / ${totalPages}
                    <span style="opacity: 0.6; margin-left: 4px;">(${totalRows ? startIdx + 1 : 0}-${endIdx} of ${totalRows.toLocaleString()})</span>
                </span>
                <button onclick="dfChangePage(${page + 1})" ${lastDisabled} class="pagination-btn" title="Next page">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5 14l6-6-6-6v12z"/></svg>
                </button>
                <button onclick="dfChangePage(${totalPages})" ${lastDisabled} class="pagination-btn" title="Last page">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M12 2H10v12h2V2zM2 8l9-6v12L2 8z"/></svg>
                </button>
                <div style="margin-left: 12px; border-left: 1px solid var(--vscode-panel-border); padding-left: 12px;">
                    <select onchange="dfChangeRowsPerPage(this.value)" class="pagination-select">
                        ${options}
                        <option value="all" ${allSelected}>All</option>
                    </select>
                    <span style="margin-left: 4px; font-size: 11px; opacity: 0.6;">rows</span>
                </div>
            </div>
            <div style="width: 100px;"></div>
            ${truncationNote}`;
    } else {
        modalFooter.innerHTML = `
            ${exportButton}
            <div style="font-style: italic; opacity: 0.7; font-size: 12px;">
                ${Number(fullShape[0]).toLocaleString()} rows × ${dfState.columns.length} columns
            </div>
            <div style="width: 100px;"></div>
            ${truncationNote}`;
    }

    const exportBtn = document.getElementById('exportCSVBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportDataFrameToCSV);
    }
}

function dfChangePage(page) {
    if (!dfState) return;
    dfState.page = page;
    renderDataFramePage();
}

function dfChangeRowsPerPage(value) {
    dfRowsPerPage = value === 'all' ? Number.MAX_SAFE_INTEGER : parseInt(value, 10);
    if (dfState) {
        dfState.page = 1;
        renderDataFramePage();
    }
}

function compareDataFrameValues(a, b) {
    const aMissing = a === null || a === undefined;
    const bMissing = b === null || b === undefined;
    if (aMissing || bMissing) {
        return aMissing === bMissing ? 0 : (aMissing ? 1 : -1);
    }
    if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
    }
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function sortDataFrame(columnIndex) {
    if (!dfState) return;
    if (dfState.sortColumn === columnIndex) {
        dfState.sortAscending = !dfState.sortAscending;
    } else {
        dfState.sortColumn = columnIndex;
        dfState.sortAscending = true;
    }
    const dir = dfState.sortAscending ? 1 : -1;
    const get = columnIndex === -1 ? (row => row.idx) : (row => row.v[columnIndex]);
    dfState.rows.sort((ra, rb) => {
        const a = get(ra);
        const b = get(rb);
        // Missing values always go last, whatever the direction
        const aMissing = a === null || a === undefined;
        const bMissing = b === null || b === undefined;
        if (aMissing || bMissing) {
            return aMissing === bMissing ? ra.pos - rb.pos : (aMissing ? 1 : -1);
        }
        return (compareDataFrameValues(a, b) * dir) || (ra.pos - rb.pos);
    });
    if (dfState.searchTerm) {
        dfState.filtered = filterDataFrameRows(dfState.rows, dfState.searchTerm);
    }
    dfState.page = 1;
    updateDataFrameHeaderIndicators();
    renderDataFramePage();
}

function updateDataFrameHeaderIndicators() {
    const headers = document.querySelectorAll('#detailTable thead th');
    headers.forEach((header, index) => {
        const textSpan = header.querySelector('.header-text');
        if (!textSpan) return;
        const text = textSpan.textContent.replace(/ [▲▼]$/, '');
        const headerColumnIndex = index - 1; // the index column is -1
        textSpan.textContent = headerColumnIndex === dfState.sortColumn
            ? text + (dfState.sortAscending ? ' ▲' : ' ▼')
            : text;
    });
}

function filterDataFrameRows(rows, term) {
    return rows.filter(row => {
        if (row.idx !== null && row.idx !== undefined && String(row.idx).toLowerCase().includes(term)) {
            return true;
        }
        const values = row.v;
        for (let c = 0; c < values.length; c++) {
            const value = values[c];
            if (value !== null && value !== undefined && String(value).toLowerCase().includes(term)) {
                return true;
            }
        }
        return false;
    });
}

function dfHandleSearch(searchTerm) {
    if (!dfState) return;
    dfState.searchTerm = String(searchTerm || '').toLowerCase().trim();
    dfState.page = 1;
    const clearBtn = document.getElementById('dfClearSearch');
    if (clearBtn) {
        clearBtn.style.display = dfState.searchTerm ? 'flex' : 'none';
    }
    dfState.filtered = dfState.searchTerm ? filterDataFrameRows(dfState.rows, dfState.searchTerm) : null;
    renderDataFramePage();
}

// Without a search, the CSV is written by pandas in the backend, so it
// contains every row (not just the rows loaded into the viewer).
function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return /[",\n\r]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}

function exportDataFrameToCSV() {
    if (!modalData || !modalData.dataframe_info) return;
    if (dfState && dfState.filtered !== null) {
        // Search active: export just the matching rows, as shown.
        const info = dfState.info;
        const lines = [[info.index_name || 'Index', ...dfState.columns].map(csvEscape).join(',')];
        for (const row of dfState.filtered) {
            lines.push([row.idx, ...row.v].map(csvEscape).join(','));
        }
        vscode.postMessage({
            command: 'exportCSV',
            name: modalData.name,
            csvData: lines.join('\n') + '\n',
            rowCount: dfState.filtered.length,
            columnCount: dfState.columns.length
        });
        return;
    }
    vscode.postMessage({
        command: 'exportCSV',
        name: modalData.name,
        path: modalData.path || []
    });
}

function sortModalTable(col) {
    if (!modalData) return;
    
    if (modalSortColumn === col) {
        modalSortAscending = !modalSortAscending;
    } else {
        modalSortColumn = col;
        modalSortAscending = true;
    }
    
    updateModalHeaderIndicators();
    
    // Only sort list/dict items, not DataFrames
    if (modalData.items && modalData.items.length > 0) {
        const sorted = [...modalData.items].sort((a, b) => {
            let valA, valB;
            
            switch(col) {
                case 0: // Index
                    valA = isNaN(a.index) ? a.index : Number(a.index);
                    valB = isNaN(b.index) ? b.index : Number(b.index);
                    break;
                case 1: // Type
                    valA = a.type.toLowerCase();
                    valB = b.type.toLowerCase();
                    break;
                case 2: // Size
                    valA = parseSizeForSort(a.size);
                    valB = parseSizeForSort(b.size);
                    break;
                case 3: // Value
                    const parsedA = parseValueForSort(a.value, a.type);
                    const parsedB = parseValueForSort(b.value, b.type);
                    valA = parsedA;
                    valB = parsedB;
                    
                    if (valA.typeOrder !== valB.typeOrder) {
                        return modalSortAscending ? 
                            valA.typeOrder - valB.typeOrder : 
                            valB.typeOrder - valA.typeOrder;
                    }
                    valA = valA.sortValue;
                    valB = valB.sortValue;
                    break;
            }
            
            // Numeric comparison
            if (typeof valA === 'number' && typeof valB === 'number') {
                return modalSortAscending ? valA - valB : valB - valA;
            }
            
            // String comparison
            if (valA < valB) return modalSortAscending ? -1 : 1;
            if (valA > valB) return modalSortAscending ? 1 : -1;
            return 0;
        });

        const tbody = document.getElementById('detailTableBody');
        tbody.innerHTML = '';
        displayListData(sorted, tbody, modalData.name, modalData.path || []);
    }
}

function updateModalHeaderIndicators() {
    const headers = document.querySelectorAll('#detailTable th');
    headers.forEach((header, index) => {
        const textSpan = header.querySelector('.header-text');
        if (!textSpan) return;
        
        const text = textSpan.textContent.replace(' ▲', '').replace(' ▼', '');
        
        if (index === modalSortColumn) {
            textSpan.textContent = text + (modalSortAscending ? ' ▲' : ' ▼');
        } else {
            textSpan.textContent = text;
        }
    });
}

function closeModal() {
    const modal = document.getElementById('detailModal');
    modal.style.display = 'none';

    const arrayContainer = document.getElementById('arrayContainer');
    if (arrayContainer) {
        arrayContainer.remove();
    }
    document.getElementById('detailTable').style.display = 'table';
    document.getElementById('detailTableBody').innerHTML = '';
    resetDetailHeaders();
    dfState = null;
    modalData = null;
}

// Close modals with Escape
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (document.getElementById('editorModal').style.display === 'block') {
        closeEditorModal();
    } else if (document.getElementById('detailModal').style.display === 'block') {
        closeModal();
    }
});

// Handle clicking outside modals to close them
window.onclick = function(event) {
    const detailModal = document.getElementById('detailModal');
    const editorModal = document.getElementById('editorModal');

    if (event.target == detailModal) {
        closeModal();
    } else if (event.target == editorModal) {
        closeEditorModal();
    }
}

// Resize variables - declare at top level
let isResizing = false;
let currentColumn = null;
let startX = 0;
let startWidth = 0;
let isModalTable = false;

// Attach resize listeners at document level (runs once on page load)
document.addEventListener('mousemove', doResize);
document.addEventListener('mouseup', stopResize);

function startResize(e, columnIndex, isModal = false) {
    e.stopPropagation();
    e.preventDefault();
    
    isResizing = true;
    isModalTable = isModal;
    currentColumn = columnIndex;
    startX = e.pageX;
    
    const table = isModal ? document.getElementById('detailTable') : document.getElementById('varTable');
    const th = table.querySelectorAll('th')[columnIndex];
    startWidth = th.offsetWidth;
    
    // Prevent the click event from bubbling up to trigger sorting
    return false;
}

function doResize(e) {
    if (!isResizing) return;
    
    const table = isModalTable ? document.getElementById('detailTable') : document.getElementById('varTable');
    const th = table.querySelectorAll('th')[currentColumn];
    const width = startWidth + (e.pageX - startX);
    
    if (width > 50) {
        th.style.width = width + 'px';
        
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cell = row.cells[currentColumn];
            if (cell) {
                cell.style.width = width + 'px';
            }
        });
    }
}

function stopResize() {
    isResizing = false;
    currentColumn = null;
}

// Array-specific resizing
let isResizingArray = false;
let arrayResizeType = null; // 'col' or 'row'
let arrayResizeIndex = null;
let arrayResizeStart = 0;
let arrayResizeStartSize = 0;

function startArrayResize(e, type, index) {
    e.stopPropagation();
    e.preventDefault();

    isResizingArray = true;
    arrayResizeType = type;
    arrayResizeIndex = index;

    if (type === 'col') {
        arrayResizeStart = e.pageX;
        const th = document.querySelector(`.array-col-header[data-col="${index}"]`);
        arrayResizeStartSize = th.offsetWidth;
    } else {
        arrayResizeStart = e.pageY;
        const th = document.querySelector(`.array-row-header[data-row="${index}"]`);
        arrayResizeStartSize = th.offsetHeight;
    }

    return false;
}

function doArrayResize(e) {
    if (!isResizingArray) return;

    if (arrayResizeType === 'col') {
        const delta = e.pageX - arrayResizeStart;
        const newWidth = Math.max(50, arrayResizeStartSize + delta);

        const headers = document.querySelectorAll(`.array-col-header[data-col="${arrayResizeIndex}"]`);
        headers.forEach(th => {
            th.style.minWidth = newWidth + 'px';
            th.style.width = newWidth + 'px';
        });

        const cells = document.querySelectorAll(`.array-table tbody tr td:nth-child(${arrayResizeIndex + 2})`);
        cells.forEach(td => {
            td.style.minWidth = newWidth + 'px';
            td.style.width = newWidth + 'px';
        });
    } else {
        const delta = e.pageY - arrayResizeStart;
        const newHeight = Math.max(20, arrayResizeStartSize + delta);

        const header = document.querySelector(`.array-row-header[data-row="${arrayResizeIndex}"]`);
        if (header) {
            header.style.height = newHeight + 'px';
            const row = header.parentElement;
            if (row) {
                const cells = row.querySelectorAll('td');
                cells.forEach(td => {
                    td.style.height = newHeight + 'px';
                });
            }
        }
    }
}

function stopArrayResize() {
    isResizingArray = false;
    arrayResizeType = null;
    arrayResizeIndex = null;
}

// Add array resize listeners
document.addEventListener('mousemove', doArrayResize);
document.addEventListener('mouseup', stopArrayResize);

function clearVars() {
    console.log('clearVars called');
    vscode.postMessage({ command: 'clearNamespace' });
}

function saveVars() {
    vscode.postMessage({ command: 'saveSession' });
}

function loadVars() {
    vscode.postMessage({ command: 'loadSession' });
}

// Options menu functions
function toggleOptionsMenu() {
    const menu = document.getElementById('optionsMenu');
    menu.classList.toggle('show');
}

// Close options menu when clicking outside
window.addEventListener('click', (event) => {
    const optionsContainer = document.querySelector('.options-container');
    const optionsBtn = document.getElementById('optionsBtn');
    const optionsMenu = document.getElementById('optionsMenu');

    if (!optionsContainer.contains(event.target)) {
        optionsMenu.classList.remove('show');
    }
});

function updateFilters() {
    filterOptions.private = document.getElementById('filterPrivate').checked;
    filterOptions.uppercase = document.getElementById('filterUppercase').checked;
    filterOptions.capitalized = document.getElementById('filterCapitalized').checked;
    filterOptions.unsupported = document.getElementById('filterUnsupported').checked;
    filterOptions.callables = document.getElementById('filterCallables').checked;
    filterOptions.modules = document.getElementById('filterModules').checked;

    applyFiltersAndUpdate();
}

function applyFiltersAndUpdate() {
    const filtered = allVariables.filter(variable => {
        const name = variable.name;
        const type = variable.type.toLowerCase();

        // Filter by search query
        if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) {
            return false;
        }

        // Filter private variables (starts with _)
        if (filterOptions.private && name.startsWith('_')) {
            return false;
        }

        // Filter all-uppercase variables
        if (filterOptions.uppercase && name === name.toUpperCase() && name !== name.toLowerCase()) {
            return false;
        }

        // Filter capitalized variables (starts with capital letter)
        if (filterOptions.capitalized && name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()) {
            return false;
        }

        // Filter unsupported data types
        if (filterOptions.unsupported) {
            const unsupportedTypes = ['memoryview', 'bytearray', 'bytes', 'ellipsis', 'notimplemented'];
            if (unsupportedTypes.includes(type)) {
                return false;
            }
        }

        // Filter callables (functions, methods, etc.)
        if (filterOptions.callables) {
            const callableTypes = ['function', 'builtin_function_or_method', 'method', 'method_descriptor',
                                   'builtin_method', 'wrapper_descriptor', 'method_wrapper'];
            if (callableTypes.includes(type)) {
                return false;
            }
        }

        // Filter modules
        if (filterOptions.modules && type === 'module') {
            return false;
        }

        return true;
    });

    currentVariables = filtered;
    updateTable(filtered);
}

function resizeRowsToContents() {
    const table = document.getElementById('varTable');
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach(row => {
        // Reset height to auto to calculate natural height
        row.style.height = 'auto';

        // Get the tallest cell in the row
        let maxHeight = 0;
        Array.from(row.cells).forEach(cell => {
            const cellHeight = cell.scrollHeight;
            maxHeight = Math.max(maxHeight, cellHeight);
        });

        // Set row height to accommodate content
        row.style.height = maxHeight + 'px';
    });
}

function resizeColumnsToContents() {
    const table = document.getElementById('varTable');
    const headers = table.querySelectorAll('th');

    headers.forEach((header, index) => {
        // Reset width constraints
        header.style.width = 'auto';
        header.style.minWidth = 'auto';

        // Calculate maximum content width for this column
        let maxWidth = header.scrollWidth;

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cell = row.cells[index];
            if (cell) {
                maxWidth = Math.max(maxWidth, cell.scrollWidth);
            }
        });

        // Add some padding and set the width
        const finalWidth = maxWidth + 20;
        header.style.width = finalWidth + 'px';
        header.style.minWidth = finalWidth + 'px';

        // Apply to all cells in this column
        rows.forEach(row => {
            const cell = row.cells[index];
            if (cell) {
                cell.style.width = finalWidth + 'px';
            }
        });
    });
}

// Search functions
function toggleSearch() {
    const searchInput = document.getElementById('searchInput');
    const isHidden = searchInput.style.display === 'none';

    if (isHidden) {
        searchInput.style.display = 'block';
        searchInput.focus();
    } else {
        searchInput.style.display = 'none';
        searchInput.value = '';
        searchQuery = '';
        applyFiltersAndUpdate();
    }
}

function filterBySearch() {
    const searchInput = document.getElementById('searchInput');
    searchQuery = searchInput.value;
    applyFiltersAndUpdate();
}

// Update captureMainLocals setting
function updateCaptureMainLocals() {
    const captureMainLocals = document.getElementById('captureMainLocals').checked;
    vscode.postMessage({
        command: 'updateCaptureMainLocals',
        value: captureMainLocals
    });
}

// Color palette switching
function selectPalette(palette) {
    currentPalette = palette;

    // Remove all palette attributes
    document.body.removeAttribute('data-palette');

    // Apply the selected palette (if not default)
    if (palette !== 'default') {
        document.body.setAttribute('data-palette', palette);
    }

    // Update button active states
    document.getElementById('paletteDefaultBtn').classList.remove('active');
    document.getElementById('paletteWarmBtn').classList.remove('active');
    document.getElementById('paletteColdBtn').classList.remove('active');

    // Set the active button
    const buttonId = `palette${palette.charAt(0).toUpperCase() + palette.slice(1)}Btn`;
    const activeButton = document.getElementById(buttonId);
    if (activeButton) {
        activeButton.classList.add('active');
    }

    // Save preference to localStorage
    try {
        localStorage.setItem('colorPalette', palette);
    } catch (e) {
        // localStorage might not be available in some contexts
        console.log('Could not save palette preference:', e);
    }
}

// Legacy function for backward compatibility
function changeColorPalette(palette) {
    selectPalette(palette);
}

// Export DataFrame to CSV
