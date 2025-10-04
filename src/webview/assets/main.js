const vscode = acquireVsCodeApi();
let currentVariables = [];
let sortColumn = 0;
let sortAscending = true;
let modalSortColumn = 0;
let modalSortAscending = true;
let modalData = null; // Store the current modal data

window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'updateVariables') {
        currentVariables = message.variables;
        updateTable(message.variables);
    } else if (message.command === 'showDetails') {
        showDetailsModal(message.data);
    }
});

function updateTable(variables) {
    const tbody = document.getElementById('varTableBody');
    tbody.innerHTML = '';

    if (variables.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">No variables</td></tr>';
        return;
    }

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
            type.includes('Series');
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
    // String
    else if (typeLower === 'str') {
        return 'value-string';
    }
    // Boolean
    else if (typeLower === 'bool') {
        return 'value-bool';
    }
    // List
    else if (typeLower === 'list') {
        return 'value-list';
    }
    // Tuple
    else if (typeLower === 'tuple') {
        return 'value-tuple';
    }
    // Set
    else if (typeLower === 'set' || typeLower === 'frozenset') {
        return 'value-set';
    }
    // Dict
    else if (typeLower === 'dict') {
        return 'value-dict';
    }
    // NumPy array
    else if (typeLower.includes('ndarray') || typeLower.includes('array')) {
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
    // Datetime types
    else if (typeLower === 'datetime' || typeLower === 'date' || typeLower === 'timedelta') {
        return 'value-datetime';
    }
    // Range and iterators
    else if (typeLower === 'range' || typeLower === 'enumerate' || typeLower === 'zip' || typeLower.includes('iterator')) {
        return 'value-range';
    }
    // Bytes
    else if (typeLower === 'bytes' || typeLower === 'bytearray') {
        return 'value-bytes';
    }
    // Functions
    else if (typeLower.includes('function') || typeLower === 'builtin_function_or_method') {
        return 'value-function';
    }
    // Classes
    else if (typeLower === 'type') {
        return 'value-class';
    }
    // None
    else if (typeLower === 'nonetype') {
        return 'value-none';
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

    if (typeLower.includes('int') || typeLower.includes('float') || typeLower.includes('complex')) {
        typeOrder = 1;
        sortValue = parseFloat(value);
    } else if (typeLower === 'bool') {
        typeOrder = 2;
        sortValue = value;
    } else if (typeLower === 'str') {
        typeOrder = 3;
        sortValue = value;
    } else if (typeLower === 'tuple') {
        typeOrder = 4;
        sortValue = value;
    } else if (typeLower === 'list') {
        typeOrder = 5;
        sortValue = value;
    } else if (typeLower === 'set' || typeLower === 'frozenset') {
        typeOrder = 6;
        sortValue = value;
    } else if (typeLower === 'dict') {
        typeOrder = 7;
        sortValue = value;
    } else if (typeLower.includes('ndarray') || typeLower.includes('array')) {
        typeOrder = 8;
        sortValue = value;
    } else if (typeLower === 'series') {
        typeOrder = 9;
        sortValue = value;
    } else if (typeLower === 'dataframe') {
        typeOrder = 10;
        sortValue = value;
    } else if (typeLower === 'datetime' || typeLower === 'date' || typeLower === 'timedelta') {
        typeOrder = 11;
        sortValue = value;
    } else if (typeLower === 'range' || typeLower === 'enumerate' || typeLower === 'zip') {
        typeOrder = 12;
        sortValue = value;
    } else if (typeLower === 'bytes' || typeLower === 'bytearray') {
        typeOrder = 13;
        sortValue = value;
    } else {
        typeOrder = 14;  // Custom objects
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

    // Handle DataFrame differently
    if (data.dataframe_info) {
        displayDataFrame(data.dataframe_info, tbody);
    } else if (data.items && data.items.length > 0) {
        displayListData(data.items, tbody, data.name, path);
    } else {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">No data available</td></tr>';
    }

    modal.style.display = 'block';
}

function displayDataFrame(dfInfo, tbody) {
    const table = document.getElementById('detailTable');
    const thead = table.querySelector('thead tr');

    // Update headers for DataFrame view
    thead.innerHTML = '';

    // Add index column (sticky)
    const indexHeader = document.createElement('th');
    indexHeader.innerHTML = '<span class="header-text">Index</span>';
    indexHeader.style.minWidth = '80px';
    indexHeader.style.maxWidth = '120px';
    indexHeader.onclick = () => sortDataFrame(-1); // -1 for index column
    indexHeader.style.cursor = 'pointer';
    thead.appendChild(indexHeader);

    // Add column headers from DataFrame
    dfInfo.columns.forEach((col, idx) => {
        const th = document.createElement('th');
        th.innerHTML = `<span class="header-text">${col}</span>`;
        th.style.minWidth = '120px';
        th.style.maxWidth = '300px';
        th.title = col; // Tooltip showing full column name
        th.onclick = () => sortDataFrame(idx);
        th.style.cursor = 'pointer';
        thead.appendChild(th);
    });
    
    // Populate rows
    if (dfInfo.head && dfInfo.head.length > 0) {
        renderDataFrameRows(dfInfo, tbody);
        
        /// Add info row if truncated
        if (dfInfo.shape[0] > dfInfo.head.length) {
            const infoRow = tbody.insertRow();
            const infoCell = infoRow.insertCell();
            infoCell.colSpan = dfInfo.columns.length + 1;
            infoCell.style.textAlign = 'center';
            infoCell.style.fontStyle = 'italic';
            infoCell.style.padding = '10px';
            infoCell.style.position = 'static'; // Override sticky positioning
            infoCell.textContent = 'Showing ' + dfInfo.head.length + ' of ' + dfInfo.shape[0] + ' rows x ' + dfInfo.columns.length + ' columns';               }
    } else {
        const emptyRow = tbody.insertRow();
        const emptyCell = emptyRow.insertCell();
        emptyCell.colSpan = dfInfo.columns.length + 1;
        emptyCell.style.textAlign = 'center';
        emptyCell.style.padding = '20px';
        emptyCell.textContent = 'Empty DataFrame';
    }
}

function renderDataFrameRows(dfInfo, tbody) {
    dfInfo.head.forEach((row, rowIndex) => {
        const tr = tbody.insertRow();

        // Add index cell (sticky)
        const indexCell = tr.insertCell();
        indexCell.textContent = rowIndex;
        indexCell.style.fontWeight = '600';

        // Add data cells
        dfInfo.columns.forEach(col => {
            const cell = tr.insertCell();
            const value = row[col];

            // Format the value
            let displayValue;
            if (value === null || value === undefined) {
                displayValue = 'NaN';
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
}

function sortDataFrame(columnIndex) {
    if (!modalData || !modalData.dataframe_info) return;

    const dfInfo = modalData.dataframe_info;

    // Determine if we're sorting by the same column
    if (modalSortColumn === columnIndex) {
        modalSortAscending = !modalSortAscending;
    } else {
        modalSortColumn = columnIndex;
        modalSortAscending = true;
    }

    updateDataFrameHeaderIndicators();

    // Create a sorted copy of the data
    const sortedHead = [...dfInfo.head].sort((a, b) => {
        let valA, valB;

        if (columnIndex === -1) {
            // Sorting by index - use the array index
            valA = dfInfo.head.indexOf(a);
            valB = dfInfo.head.indexOf(b);
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
    const sortedDfInfo = { ...dfInfo, head: sortedHead };

    // Re-render the table
    const tbody = document.getElementById('detailTableBody');
    tbody.innerHTML = '';
    renderDataFrameRows(sortedDfInfo, tbody);

    // Re-add the info row if needed
    if (dfInfo.shape[0] > dfInfo.head.length) {
        const infoRow = tbody.insertRow();
        const infoCell = infoRow.insertCell();
        infoCell.colSpan = dfInfo.columns.length + 1;
        infoCell.style.textAlign = 'center';
        infoCell.style.fontStyle = 'italic';
        infoCell.style.padding = '10px';
        infoCell.style.position = 'static';
        infoCell.textContent = 'Showing ' + dfInfo.head.length + ' of ' + dfInfo.shape[0] + ' rows x ' + dfInfo.columns.length + ' columns';
    }
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
    
    // Reset headers back to default when closing
    const table = document.getElementById('detailTable');
    const thead = table.querySelector('thead tr');
    thead.innerHTML = `
        <th style="width: 20%;">
            Index
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

