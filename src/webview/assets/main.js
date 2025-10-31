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

// DataFrame pagination state
let dfCurrentPage = 1;
let dfRowsPerPage = 100;
let dfVisibleColumns = null; // null means show all columns
let dfTotalRowCount = 0; // Store total row count for the current DataFrame
let dfSearchTerm = ''; // Current search/filter term
let dfFilteredData = null; // Filtered data (null means no filter active)

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
    const savedPalette = localStorage.getItem('colorPalette') || 'default';
    selectPalette(savedPalette);

    // Load captureMainLocals setting from VS Code configuration
    vscode.postMessage({ command: 'getCaptureMainLocals' });
});

window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'updateVariables') {
        allVariables = message.variables;
        applyFiltersAndUpdate();
    } else if (message.command === 'showDetails') {
        showDetailsModal(message.data);
    } else if (message.command === 'setCaptureMainLocals') {
        document.getElementById('captureMainLocals').checked = message.value;
    }
});

function updateTable(variables) {
    const tbody = document.getElementById('varTableBody');
    const emptyState = document.getElementById('emptyState');
    const tableContainer = document.getElementById('tableContainer');
    tbody.innerHTML = '';

    if (variables.length === 0) {
        // Show empty state, hide table
        emptyState.style.display = 'flex';
        tableContainer.style.display = 'none';
        return;
    }

    // Hide empty state, show table
    emptyState.style.display = 'none';
    tableContainer.style.display = 'block';

    variables.forEach(v => {
        const row = tbody.insertRow();
        const isClickable = isCollectionType(v.type);
        const isLongString = v.type === 'str' && v.value.length > 40;
        const isEditable = isScalarType(v.type) && !isLongString;

        row.innerHTML = `
            <td class="col-name">${v.name}</td>
            <td class="col-type">${v.type}</td>
            <td class="col-size">${v.size}</td>
            <td class="col-value ${getValueClass(v.type)} ${isClickable ? 'clickable' : ''} ${isEditable ? 'editable' : ''} ${isLongString ? 'clickable' : ''}">${v.value}</td>
        `;

        if (isClickable) {
            row.onclick = () => viewDetails(v.name, v.type);
        } else if (isLongString) {
            const valueCell = row.cells[3];
            valueCell.ondblclick = (e) => {
                e.stopPropagation();
                openInEditor(v.name, v.value);
            };
        } else if (isEditable) {
            const valueCell = row.cells[3];
            valueCell.ondblclick = (e) => {
                e.stopPropagation();
                makeEditable(valueCell, v.name, v.type, v.value);
            };
        }
    });
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

function isScalarType(type) {
    const typeLower = type.toLowerCase();
    return typeLower.includes('int') ||
           typeLower.includes('float') ||
           typeLower === 'str' ||
           typeLower === 'bool' ||
           typeLower.includes('complex');
}

function getValueClass(type) {
    const typeLower = type.toLowerCase();

    // Numeric types
    if (typeLower.includes('int') || typeLower.includes('float') || typeLower.includes('complex')) {
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
    if (typeLower.includes('int') || typeLower.includes('float') || typeLower.includes('complex')) {
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

function openInEditor(varName, currentValue) {
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

function displayListData(items, tbody, rootName, currentPath) {
    items.forEach(item => {
        const row = tbody.insertRow();
        const isClickable = isCollectionType(item.type);

        row.innerHTML = `
            <td>${item.index}</td>
            <td>${item.type}</td>
            <td>${item.size}</td>
            <td class="${getValueClass(item.type)} ${isClickable ? 'clickable' : ''}">${item.value}</td>
        `;

        if (isClickable) {
            const valueCell = row.cells[3];
            valueCell.onclick = () => {
                const newPath = [...currentPath, item.index];
                viewDetails(rootName, item.type, newPath);
            };
        }
    });
}

function showDetailsModal(data) {
    const modal = document.getElementById('detailModal');
    const modalTitle = document.getElementById('modalTitle');
    const tbody = document.getElementById('detailTableBody');
    const table = document.getElementById('detailTable');
    const modalFooter = document.getElementById('detailModalFooter');

    // Build breadcrumb navigation
    const path = data.path || [];
    let breadcrumb = data.name;
    if (path.length > 0) {
        breadcrumb += ' → ' + path.join(' → ');
    }

    // Create breadcrumb with clickable parts
    let breadcrumbHTML = `<span class="breadcrumb-item clickable" onclick="viewDetails('${data.name}', '${data.type}')">${data.name}</span>`;
    for (let i = 0; i < path.length; i++) {
        const partialPath = path.slice(0, i + 1);
        breadcrumbHTML += ` → <span class="breadcrumb-item clickable" onclick='viewDetails("${data.name}", "${data.type}", ${JSON.stringify(partialPath)})'>${path[i]}</span>`;
    }
    breadcrumbHTML += ` <span style="color: var(--vscode-descriptionForeground);">- ${data.type}</span>`;

    modalTitle.innerHTML = breadcrumbHTML;
    tbody.innerHTML = '';

    // Store the data for sorting
    modalData = data;

    // Clean up any previous array container before showing new content
    const oldArrayContainer = document.getElementById('arrayContainer');
    if (oldArrayContainer) {
        oldArrayContainer.remove();
    }

    // Ensure table is visible by default (will be hidden if we're showing an array)
    table.style.display = 'table';

    // Hide footer by default (will be shown by DataFrame display if needed)
    modalFooter.style.display = 'none';

    // Hide search box by default (will be shown by DataFrame display if needed)
    const searchContainer = document.getElementById('dfSearchContainer');
    if (searchContainer) {
        searchContainer.style.display = 'none';
    }

    // Handle different data types
    if (data.array_info) {
        displayNumpyArray(data.array_info, data.name);
    } else if (data.dataframe_info) {
        displayDataFrame(data.dataframe_info, tbody);
    } else if (data.items && data.items.length > 0) {
        displayListData(data.items, tbody, data.name, path);
    } else {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">No data available</td></tr>';
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
        if (arrayInfo.ndim === 1) {
            gridHTML += renderArray1D(arrayInfo.data, arrayInfo.is_numeric);
        } else if (arrayInfo.ndim === 2) {
            gridHTML += renderArray2D(arrayInfo.data, arrayInfo.is_numeric);
        } else {
            gridHTML += `<div style="text-align: center; padding: 20px;">Arrays with ${arrayInfo.ndim} dimensions are not yet supported for visualization.</div>`;
        }

        if (arrayInfo.truncated) {
            gridHTML += '<div style="text-align: center; margin-top: 10px; font-style: italic; color: var(--vscode-descriptionForeground);">';
            gridHTML += `Showing first 100×100 elements of ${arrayInfo.shape.join('×')} array`;
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
            html += `<td class="array-cell" style="background-color: ${bgColor}; min-width: ${arrayCellWidth}px; height: ${arrayCellHeight}px;">${formattedValue}</td>`;
        }
    } else {
        for (let col = 0; col < data.length; col++) {
            const value = data[col];
            html += `<td class="array-cell" style="min-width: ${arrayCellWidth}px; height: ${arrayCellHeight}px;">${value}</td>`;
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
                html += `<td class="array-cell" style="background-color: ${bgColor}; min-width: ${arrayCellWidth}px; height: ${arrayCellHeight}px;">${formattedValue}</td>`;
            }
            html += '</tr>';
        }
    } else {
        for (let row = 0; row < data.length; row++) {
            html += '<tr>';
            html += `<th class="array-row-header" data-row="${row}" style="height: ${arrayCellHeight}px;">${row}<div class="array-row-resizer" onmousedown="startArrayResize(event, 'row', ${row})"></div></th>`;
            for (let col = 0; col < data[row].length; col++) {
                const value = data[row][col];
                html += `<td class="array-cell" style="min-width: ${arrayCellWidth}px; height: ${arrayCellHeight}px;">${value}</td>`;
            }
            html += '</tr>';
        }
    }

    html += '</tbody></table></div>';
    return html;
}

function getMinMax(flatData) {
    const numericData = flatData.filter(v => typeof v === 'number' && !isNaN(v));
    if (numericData.length === 0) return { min: 0, max: 1 };
    return {
        min: Math.min(...numericData),
        max: Math.max(...numericData)
    };
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
    if (typeof value !== 'number') return String(value);

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

function displayDataFrame(dfInfo, tbody) {
    const table = document.getElementById('detailTable');
    const thead = table.querySelector('thead tr');

    // Reset pagination, column filter, and search when opening new DataFrame
    dfCurrentPage = 1;
    dfVisibleColumns = null;
    dfSearchTerm = '';
    dfFilteredData = null;

    // Support both old 'head' and new 'data' format
    const dataRows = dfInfo.data || dfInfo.head || [];
    const indexName = dfInfo.index_name || 'Index';
    const hasCustomIndex = dfInfo.has_custom_index || false;

    // Store the total row count for this DataFrame
    dfTotalRowCount = dataRows.length;

    // Show search box for DataFrames
    const searchContainer = document.getElementById('dfSearchContainer');
    const searchInput = document.getElementById('dfSearchInput');
    const clearSearchBtn = document.getElementById('dfClearSearch');

    if (searchContainer) {
        searchContainer.style.display = 'flex';
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';

        // Remove existing event listeners to avoid duplicates
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);

        const newClearBtn = clearSearchBtn.cloneNode(true);
        clearSearchBtn.parentNode.replaceChild(newClearBtn, clearSearchBtn);

        // Add search event listener
        newSearchInput.addEventListener('input', (e) => {
            dfHandleSearch(e.target.value);
        });

        // Add clear button event listener
        newClearBtn.addEventListener('click', () => {
            newSearchInput.value = '';
            dfHandleSearch('');
        });
    }

    // Update headers for DataFrame view
    thead.innerHTML = '';

    // Add index column header with proper name
    const indexHeader = document.createElement('th');
    indexHeader.innerHTML = `<span class="header-text">${indexName}</span>`;
    indexHeader.style.minWidth = '80px';
    indexHeader.style.maxWidth = '200px';
    indexHeader.title = indexName;
    indexHeader.onclick = () => sortDataFrame(-1); // -1 for index column
    indexHeader.style.cursor = 'pointer';
    thead.appendChild(indexHeader);

    // Determine visible columns (all by default)
    const columnsToShow = dfVisibleColumns || dfInfo.columns;

    // Add column headers from DataFrame
    columnsToShow.forEach((col, idx) => {
        const th = document.createElement('th');
        th.innerHTML = `<span class="header-text">${col}</span>`;

        // Calculate width based on column name length
        // Use em units for better scaling with font size
        const baseWidth = Math.max(col.length * 0.6 + 2, 6); // min 6em (~96px)
        const maxWidth = Math.min(baseWidth, 20); // cap at 20em (~320px)

        th.style.width = `${maxWidth}em`;
        th.style.minWidth = `${Math.min(baseWidth, 6)}em`;
        th.style.maxWidth = `${maxWidth}em`;
        th.style.whiteSpace = 'nowrap';
        th.style.overflow = 'hidden';
        th.style.textOverflow = 'ellipsis';

        const dtype = dfInfo.dtypes[col] || 'unknown';
        th.title = `${col}\nType: ${dtype}`; // Tooltip with column name and type
        th.onclick = () => sortDataFrame(idx);
        th.style.cursor = 'pointer';
        thead.appendChild(th);
    });

    // Populate rows with pagination
    if (dataRows && dataRows.length > 0) {
        renderDataFrameRowsPaginated(dfInfo, tbody, dataRows, indexName, hasCustomIndex, columnsToShow);
    } else {
        const emptyRow = tbody.insertRow();
        const emptyCell = emptyRow.insertCell();
        emptyCell.colSpan = columnsToShow.length + 1;
        emptyCell.style.textAlign = 'center';
        emptyCell.style.padding = '20px';
        emptyCell.textContent = 'Empty DataFrame';
    }
}

function renderDataFrameRowsPaginated(dfInfo, tbody, dataRows, indexName, hasCustomIndex, columnsToShow) {
    // Use filtered data if search is active, otherwise use all data
    const displayData = dfFilteredData !== null ? dfFilteredData : dataRows;

    // Calculate pagination
    const totalRows = displayData.length;
    const totalPages = Math.ceil(totalRows / dfRowsPerPage);
    const startIdx = (dfCurrentPage - 1) * dfRowsPerPage;
    const endIdx = Math.min(startIdx + dfRowsPerPage, totalRows);
    const rowsToShow = displayData.slice(startIdx, endIdx);

    // Render rows
    rowsToShow.forEach((row, displayIndex) => {
        const actualRowIndex = startIdx + displayIndex;
        const tr = tbody.insertRow();

        // Add index cell - use custom index if available
        const indexCell = tr.insertCell();
        let indexValue;

        if (hasCustomIndex && row[indexName] !== undefined) {
            // Use the preserved index from reset_index()
            indexValue = row[indexName];
        } else if (row['index'] !== undefined) {
            // Fallback to 'index' column from reset_index()
            indexValue = row['index'];
        } else {
            // Fallback to numeric index
            indexValue = actualRowIndex;
        }

        indexCell.textContent = indexValue;
        indexCell.style.fontWeight = '600';
        indexCell.title = String(indexValue);

        // Add data cells
        columnsToShow.forEach(col => {
            const cell = tr.insertCell();
            const value = row[col];

            // Match header width
            const baseWidth = Math.max(col.length * 0.6 + 2, 6);
            const maxWidth = Math.min(baseWidth, 20);
            cell.style.maxWidth = `${maxWidth}em`;
            cell.style.overflow = 'hidden';
            cell.style.textOverflow = 'ellipsis';
            cell.style.whiteSpace = 'nowrap';

            // Format the value
            let displayValue;
            if (value === null || value === undefined) {
                displayValue = 'NaN';
                cell.style.fontStyle = 'italic';
                cell.style.opacity = '0.6';
            } else if (typeof value === 'number') {
                // Format numbers to reasonable precision
                displayValue = Number.isInteger(value) ? value : value.toFixed(4);
            } else {
                displayValue = String(value);
            }

            cell.textContent = displayValue;
            cell.title = String(value); // Tooltip showing full value

            // Apply color coding based on type
            if (typeof value === 'number') {
                cell.classList.add('value-numeric');
            } else if (typeof value === 'string') {
                cell.classList.add('value-string');
            }
        });
    });

    // Add pagination controls to modal footer
    const modalFooter = document.getElementById('detailModalFooter');

    // Show controls if there's enough data to paginate (>100 rows total)
    // OR if pagination is active (totalPages > 1)
    const needsPagination = dfTotalRowCount > 100 || totalPages > 1;

    if (needsPagination) {
        // Show footer with pagination controls and export button
        modalFooter.style.display = 'flex';
        modalFooter.style.justifyContent = 'space-between';
        modalFooter.innerHTML = `
            <button id="exportCSVBtn" class="pagination-btn" title="Export to CSV" style="padding: 6px;">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.5 3h-11L2 4v8l.5 1h11l.5-1V4l-.5-1zm-.5 9H3V4h10v8z"/>
                    <path d="M8.5 6h-1v3.5L6 8v1l2 1.5L10 9V8L8.5 9.5V6z"/>
                </svg>
            </button>
            <div style="display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; color: var(--vscode-foreground);">
                <button onclick="dfChangePage(1)" ${dfCurrentPage === 1 || totalPages === 1 ? 'disabled' : ''} class="pagination-btn" title="First page">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M2 2v12h2V2H2zm3 0l9 6-9 6V2z"/>
                    </svg>
                </button>
                <button onclick="dfChangePage(${dfCurrentPage - 1})" ${dfCurrentPage === 1 || totalPages === 1 ? 'disabled' : ''} class="pagination-btn" title="Previous page">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11 2L5 8l6 6V2z"/>
                    </svg>
                </button>
                <span style="margin: 0 8px; font-size: 12px; opacity: 0.8;">
                    ${totalPages === 1 ? 'Page 1 / 1' : `${dfCurrentPage} / ${totalPages}`}
                    <span style="opacity: 0.6; margin-left: 4px;">(${startIdx + 1}-${endIdx} of ${totalRows})</span>
                </span>
                <button onclick="dfChangePage(${dfCurrentPage + 1})" ${dfCurrentPage === totalPages || totalPages === 1 ? 'disabled' : ''} class="pagination-btn" title="Next page">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M5 14l6-6-6-6v12z"/>
                    </svg>
                </button>
                <button onclick="dfChangePage(${totalPages})" ${dfCurrentPage === totalPages || totalPages === 1 ? 'disabled' : ''} class="pagination-btn" title="Last page">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M12 2H10v12h2V2zM2 8l9-6v12L2 8z"/>
                    </svg>
                </button>
                <div style="margin-left: 12px; border-left: 1px solid var(--vscode-panel-border); padding-left: 12px;">
                    <select onchange="dfChangeRowsPerPage(this.value)" class="pagination-select">
                        <option value="50" ${dfRowsPerPage === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${dfRowsPerPage === 100 ? 'selected' : ''}>100</option>
                        <option value="250" ${dfRowsPerPage === 250 ? 'selected' : ''}>250</option>
                        <option value="500" ${dfRowsPerPage === 500 ? 'selected' : ''}>500</option>
                        <option value="${totalRows}" ${dfRowsPerPage >= totalRows ? 'selected' : ''}>All</option>
                    </select>
                    <span style="margin-left: 4px; font-size: 11px; opacity: 0.6;">rows</span>
                </div>
            </div>
            <div style="width: 100px;"></div>
        `;
    } else {
        // Show footer with info text and export button for small DataFrames
        modalFooter.style.display = 'flex';
        modalFooter.style.justifyContent = 'space-between';
        modalFooter.innerHTML = `
            <button id="exportCSVBtn" class="pagination-btn" title="Export to CSV" style="padding: 6px;">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.5 3h-11L2 4v8l.5 1h11l.5-1V4l-.5-1zm-.5 9H3V4h10v8z"/>
                    <path d="M8.5 6h-1v3.5L6 8v1l2 1.5L10 9V8L8.5 9.5V6z"/>
                </svg>
            </button>
            <div style="font-style: italic; opacity: 0.7; font-size: 12px;">
                ${totalRows} rows × ${dfInfo.columns.length} columns
            </div>
            <div style="width: 100px;"></div>
        `;
    }

    // Attach event listener to export button after it's added to DOM
    const exportBtn = document.getElementById('exportCSVBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportDataFrameToCSV);
    }
}

function dfChangePage(page) {
    if (!modalData || !modalData.dataframe_info) return;
    dfCurrentPage = page;

    const tbody = document.getElementById('detailTableBody');
    tbody.innerHTML = '';

    const dfInfo = modalData.dataframe_info;
    const dataRows = dfInfo.data || dfInfo.head || [];
    const indexName = dfInfo.index_name || 'Index';
    const hasCustomIndex = dfInfo.has_custom_index || false;
    const columnsToShow = dfVisibleColumns || dfInfo.columns;

    renderDataFrameRowsPaginated(dfInfo, tbody, dataRows, indexName, hasCustomIndex, columnsToShow);
}

function dfChangeRowsPerPage(value) {
    dfRowsPerPage = parseInt(value);
    dfCurrentPage = 1; // Reset to first page
    dfChangePage(1);
}

function renderDataFrameRows(dfInfo, tbody) {
    // Legacy function - kept for backward compatibility
    // Redirect to new paginated version
    const dataRows = dfInfo.head || [];
    const indexName = 'Index';
    const hasCustomIndex = false;
    const columnsToShow = dfInfo.columns;
    renderDataFrameRowsPaginated(dfInfo, tbody, dataRows, indexName, hasCustomIndex, columnsToShow);
}

function sortDataFrame(columnIndex) {
    if (!modalData || !modalData.dataframe_info) return;

    const dfInfo = modalData.dataframe_info;
    const dataRows = dfInfo.data || dfInfo.head || [];
    const indexName = dfInfo.index_name || 'Index';
    const hasCustomIndex = dfInfo.has_custom_index || false;

    // Determine if we're sorting by the same column
    if (modalSortColumn === columnIndex) {
        modalSortAscending = !modalSortAscending;
    } else {
        modalSortColumn = columnIndex;
        modalSortAscending = true;
    }

    updateDataFrameHeaderIndicators();

    // Create a sorted copy of the data
    const sortedData = [...dataRows].sort((a, b) => {
        let valA, valB;

        if (columnIndex === -1) {
            // Sorting by index column
            if (hasCustomIndex && a[indexName] !== undefined) {
                valA = a[indexName];
                valB = b[indexName];
            } else if (a['index'] !== undefined) {
                valA = a['index'];
                valB = b['index'];
            } else {
                valA = dataRows.indexOf(a);
                valB = dataRows.indexOf(b);
            }
        } else {
            // Sorting by a data column
            const colName = dfInfo.columns[columnIndex];
            valA = a[colName];
            valB = b[colName];
        }

        // Handle null/undefined values
        if (valA === null || valA === undefined) return modalSortAscending ? 1 : -1;
        if (valB === null || valB === undefined) return modalSortAscending ? -1 : 1;

        // Numeric comparison
        if (typeof valA === 'number' && typeof valB === 'number') {
            return modalSortAscending ? valA - valB : valB - valA;
        }

        // String comparison
        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        if (strA < strB) return modalSortAscending ? -1 : 1;
        if (strA > strB) return modalSortAscending ? 1 : -1;
        return 0;
    });

    // Update the modalData with sorted data
    const sortedDfInfo = { ...dfInfo, data: sortedData, head: sortedData };

    // Re-render the table
    const tbody = document.getElementById('detailTableBody');
    tbody.innerHTML = '';

    const columnsToShow = dfVisibleColumns || dfInfo.columns;
    renderDataFrameRowsPaginated(sortedDfInfo, tbody, sortedData, indexName, hasCustomIndex, columnsToShow);
}

function updateDataFrameHeaderIndicators() {
    const headers = document.querySelectorAll('#detailTable th');
    headers.forEach((header, index) => {
        const textSpan = header.querySelector('.header-text');
        if (!textSpan) return;

        const text = textSpan.textContent.replace(' ▲', '').replace(' ▼', '');

        // Account for index column being at position -1
        const headerColumnIndex = index - 1;

        if (headerColumnIndex === modalSortColumn) {
            textSpan.textContent = text + (modalSortAscending ? ' ▲' : ' ▼');
        } else {
            textSpan.textContent = text;
        }
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

    // Clean up array container if it exists
    const arrayContainer = document.getElementById('arrayContainer');
    if (arrayContainer) {
        arrayContainer.remove();
    }

    // Show the table again
    const table = document.getElementById('detailTable');
    table.style.display = 'table';

    // Reset headers back to default when closing
    const thead = table.querySelector('thead tr');
    thead.innerHTML = `
        <th style="width: 20%;">
            Key
            <div class="resizer" onmousedown="startResize(event, 0, true)"></div>
        </th>
        <th style="width: 20%;">
            Type
            <div class="resizer" onmousedown="startResize(event, 1, true)"></div>
        </th>
        <th style="width: 15%;">
            Size
            <div class="resizer" onmousedown="startResize(event, 2, true)"></div>
        </th>
        <th style="width: 45%;">
            Value
            <div class="resizer" onmousedown="startResize(event, 3, true)"></div>
        </th>
    `;
}

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

function closeModal() {
    document.getElementById('detailModal').style.display = 'none';
}

function clearVars() {
    console.log('clearVars called');
    vscode.postMessage({ command: 'clearNamespace' });
}

function saveVars() {
    // TODO: Implement save functionality
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
function exportDataFrameToCSV() {
    console.log('Export button clicked!');
    console.log('modalData:', modalData);

    if (!modalData) {
        console.error('modalData is null or undefined');
        return;
    }

    if (!modalData.dataframe_info) {
        console.error('No dataframe_info in modalData');
        console.log('modalData structure:', Object.keys(modalData));
        return;
    }

    const dfInfo = modalData.dataframe_info;
    const data = dfInfo.data || [];
    const columns = dfInfo.columns || [];
    const indexName = dfInfo.index_name || 'Index';
    const hasCustomIndex = dfInfo.has_custom_index || false;

    console.log(`Preparing to export: ${data.length} rows, ${columns.length} columns`);

    if (data.length === 0) {
        console.warn('DataFrame is empty, nothing to export');
        return;
    }

    // Helper function to escape CSV values
    function escapeCSV(value) {
        if (value === null || value === undefined) {
            return '';
        }
        const str = String(value);
        // If value contains comma, quote, or newline, wrap in quotes and escape quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    // Build CSV content
    let csv = '';

    // Add header row
    const headers = [];
    if (hasCustomIndex) {
        headers.push(indexName);
    }
    headers.push(...columns);
    csv += headers.map(escapeCSV).join(',') + '\n';

    // Add data rows
    data.forEach(row => {
        const values = [];

        // Add index value if custom index exists
        if (hasCustomIndex && row[indexName] !== undefined) {
            values.push(escapeCSV(row[indexName]));
        } else if (row['index'] !== undefined) {
            values.push(escapeCSV(row['index']));
        }

        // Add column values
        columns.forEach(col => {
            values.push(escapeCSV(row[col]));
        });

        csv += values.join(',') + '\n';
    });

    // Generate filename from variable name
    const fileName = `${modalData.name || 'dataframe'}_export.csv`;

    // Send CSV data to VS Code extension for file save
    vscode.postMessage({
        command: 'exportCSV',
        fileName: fileName,
        csvData: csv,
        rowCount: data.length,
        columnCount: columns.length
    });

    console.log(`Exported ${data.length} rows to ${fileName}`);
}

// Handle DataFrame search/filter
function dfHandleSearch(searchTerm) {
    if (!modalData || !modalData.dataframe_info) return;

    dfSearchTerm = searchTerm.toLowerCase().trim();
    dfCurrentPage = 1; // Reset to first page when searching

    const dfInfo = modalData.dataframe_info;
    const allData = dfInfo.data || [];

    // Show/hide clear button
    const clearBtn = document.getElementById('dfClearSearch');
    if (clearBtn) {
        clearBtn.style.display = dfSearchTerm ? 'flex' : 'none';
    }

    if (!dfSearchTerm) {
        // No search term - show all data
        dfFilteredData = null;
    } else {
        // Filter data - search across all columns
        dfFilteredData = allData.filter(row => {
            // Search in all column values
            return dfInfo.columns.some(col => {
                const value = row[col];
                if (value === null || value === undefined) return false;
                return String(value).toLowerCase().includes(dfSearchTerm);
            });
        });
    }

    // Re-render the DataFrame with filtered data
    const tbody = document.getElementById('detailTableBody');
    tbody.innerHTML = ''; // Clear existing rows

    // Get the visible columns (same logic as displayDataFrame)
    const columnsToShow = dfVisibleColumns || dfInfo.columns;

    // Re-render with current filter
    renderDataFrameRowsPaginated(dfInfo, tbody, allData, dfInfo.index_name || 'Index', dfInfo.has_custom_index || false, columnsToShow);
}

