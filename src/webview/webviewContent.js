// src/webview/webviewContent.js
const path = require('path');
const fs = require('fs');
const vscode = require('vscode');

function getWebviewContent(webview, extensionPath) {
    // Read the CSS and JS files
    const stylesPath = path.join(extensionPath, 'src', 'webview', 'assets', 'styles.css');
    const scriptPath = path.join(extensionPath, 'src', 'webview', 'assets', 'main.js');

    const styles = fs.readFileSync(stylesPath, 'utf8');
    const script = fs.readFileSync(scriptPath, 'utf8');

    // Get URI for logo.png
    const logoPath = path.join(extensionPath, 'logo.png');
    const logoUri = webview.asWebviewUri(vscode.Uri.file(logoPath));

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Variable Explorer</title>
        <style>${styles}</style>
    </head>
    <body>
        <div class="toolbar">
            <button onclick="refresh()">
                <svg viewBox="0 0 24 24">
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
                <span class="tooltip">Refresh</span>
            </button>
            <button onclick="clearVars()">
                <svg viewBox="0 0 24 24">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
                <span class="tooltip">Clear</span>
            </button>
            <button onclick="saveVars()">
                <svg viewBox="0 0 24 24">
                    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                </svg>
                <span class="tooltip">Save</span>
            </button>
            <div class="toolbar-spacer"></div>
            <div class="search-container">
                <button onclick="toggleSearch()" id="searchBtn">
                    <svg viewBox="0 0 24 24">
                        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                    </svg>
                    <span class="tooltip">Search</span>
                </button>
                <input type="text" id="searchInput" placeholder="Filter variables..." oninput="filterBySearch()" style="display: none;">
            </div>
            <div class="options-container">
                <button onclick="toggleOptionsMenu()" id="optionsBtn">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                    </svg>
                    <span class="tooltip">Options</span>
                </button>
                <div id="optionsMenu" class="options-menu">
                    <div class="options-section">
                        <div class="options-section-title">Exclude Variables</div>
                        <label class="option-item">
                            <input type="checkbox" id="filterPrivate" onchange="updateFilters()">
                            <span>Private variables (starts with _)</span>
                        </label>
                        <label class="option-item">
                            <input type="checkbox" id="filterUppercase" onchange="updateFilters()">
                            <span>All-uppercase variables</span>
                        </label>
                        <label class="option-item">
                            <input type="checkbox" id="filterCapitalized" onchange="updateFilters()">
                            <span>Capitalized variables</span>
                        </label>
                        <label class="option-item">
                            <input type="checkbox" id="filterUnsupported" onchange="updateFilters()">
                            <span>Unsupported data types</span>
                        </label>
                        <label class="option-item">
                            <input type="checkbox" id="filterCallables" onchange="updateFilters()">
                            <span>Callables</span>
                        </label>
                        <label class="option-item">
                            <input type="checkbox" id="filterModules" onchange="updateFilters()">
                            <span>Modules</span>
                        </label>
                        <div class="options-divider" style="margin: 8px 0;"></div>
                        <label class="option-item">
                            <input type="checkbox" id="captureMainLocals" onchange="updateCaptureMainLocals()">
                            <span>Capture main() locals</span>
                        </label>
                    </div>
                    <div class="options-divider"></div>
                    <div class="options-section">
                        <div class="options-section-title">Color Palette</div>
                        <div class="palette-selector-row">
                            <button class="palette-button" id="paletteDefaultBtn" onclick="selectPalette('default')" aria-label="Default color palette">
                                <div class="palette-swatch" style="background-color: #1a237e;"></div>
                                <div class="palette-swatch" style="background-color: #4a148c;"></div>
                                <div class="palette-swatch" style="background-color: #1b5e20;"></div>
                                <div class="palette-swatch" style="background-color: #e65100;"></div>
                                <div class="palette-swatch" style="background-color: #004d40;"></div>
                            </button>
                            <button class="palette-button" id="paletteWarmBtn" onclick="selectPalette('warm')" aria-label="Warm (Sunset) color palette">
                                <div class="palette-swatch" style="background-color: #8b4513;"></div>
                                <div class="palette-swatch" style="background-color: #6b2d5c;"></div>
                                <div class="palette-swatch" style="background-color: #704214;"></div>
                                <div class="palette-swatch" style="background-color: #d2691e;"></div>
                                <div class="palette-swatch" style="background-color: #8b4726;"></div>
                            </button>
                            <button class="palette-button" id="paletteColdBtn" onclick="selectPalette('cold')" aria-label="Cold (Ocean) color palette">
                                <div class="palette-swatch" style="background-color: #0a1929;"></div>
                                <div class="palette-swatch" style="background-color: #1a237e;"></div>
                                <div class="palette-swatch" style="background-color: #004d40;"></div>
                                <div class="palette-swatch" style="background-color: #0277bd;"></div>
                                <div class="palette-swatch" style="background-color: #004d4d;"></div>
                            </button>
                        </div>
                    </div>
                    <div class="options-divider"></div>
                    <div class="options-section">
                        <div class="options-section-title">Resize</div>
                        <div class="option-item" onclick="resizeRowsToContents()" style="cursor: pointer;">
                            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; margin-right: 8px; fill: currentColor; flex-shrink: 0;">
                                <path d="M8 6h13v2H8zm0 5h13v2H8zm0 5h13v2H8zM4 6h2v2H4zm0 5h2v2H4zm0 5h2v2H4z"/>
                            </svg>
                            <span>Rows to contents</span>
                        </div>
                        <div class="option-item" onclick="resizeColumnsToContents()" style="cursor: pointer;">
                            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; margin-right: 8px; fill: currentColor; flex-shrink: 0;">
                                <path d="M6 3h2v18H6zm5 0h2v18h-2zm5 0h2v18h-2z"/>
                            </svg>
                            <span>Columns to contents</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div id="emptyState" class="empty-state">
            <img src="${logoUri}" class="empty-state-icon" alt="Variable Explorer Logo">
            <p class="empty-state-text">No variables defined</p>
            <p class="empty-state-subtext">Run Python code to see variables</p>
        </div>
        <div class="table-container" id="tableContainer" style="display: none;">
            <table id="varTable">
                <thead>
                    <tr>
                        <th class="col-name" onclick="sortTable(0)">
                            <span class="header-text">Name ▲</span>
                            <div class="resizer" onmousedown="startResize(event, 0)"></div>
                        </th>
                        <th class="col-type" onclick="sortTable(1)">
                            <span class="header-text">Type</span>
                            <div class="resizer" onmousedown="startResize(event, 1)"></div>
                        </th>
                        <th class="col-size" onclick="sortTable(2)">
                            <span class="header-text">Size</span>
                            <div class="resizer" onmousedown="startResize(event, 2)"></div>
                        </th>
                        <th class="col-value" onclick="sortTable(3)">
                            <span class="header-text">Value</span>
                            <div class="resizer" onmousedown="startResize(event, 3)"></div>
                        </th>
                    </tr>
                </thead>
                <tbody id="varTableBody">
                </tbody>
            </table>
        </div>

        <div id="detailModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <span class="modal-title" id="modalTitle">Variable Details</span>
                    <div class="search-container" id="dfSearchContainer" style="display: none;">
                        <input type="text" id="dfSearchInput" placeholder="Search in DataFrame..." class="search-input">
                        <button id="dfClearSearch" class="clear-search-btn" title="Clear search" style="display: none;">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
                            </svg>
                        </button>
                    </div>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <table id="detailTable">
                        <thead>
                            <tr>
                                <th style="width: 20%;" onclick="sortModalTable(0)">
                                    <span class="header-text">Key</span>
                                    <div class="resizer" onmousedown="startResize(event, 0, true)"></div>
                                </th>
                                <th style="width: 20%;" onclick="sortModalTable(1)">
                                    <span class="header-text">Type</span>
                                    <div class="resizer" onmousedown="startResize(event, 1, true)"></div>
                                </th>
                                <th style="width: 15%;" onclick="sortModalTable(2)">
                                    <span class="header-text">Size</span>
                                    <div class="resizer" onmousedown="startResize(event, 2, true)"></div>
                                </th>
                                <th style="width: 45%;" onclick="sortModalTable(3)">
                                    <span class="header-text">Value</span>
                                    <div class="resizer" onmousedown="startResize(event, 3, true)"></div>
                                </th>
                            </tr>
                        </thead>
                        <tbody id="detailTableBody">
                        </tbody>
                    </table>
                </div>
                <div class="modal-footer" id="detailModalFooter" style="display: none;">
                    <!-- DataFrame pagination controls will be inserted here -->
                </div>
            </div>
        </div>

        <div id="editorModal" class="modal">
            <div class="modal-content editor-modal-content">
                <div class="modal-header">
                    <span class="modal-title" id="editorModalTitle">Edit String</span>
                    <button class="modal-close" onclick="closeEditorModal()">&times;</button>
                </div>
                <div class="modal-body editor-modal-body">
                    <textarea id="stringEditor" spellcheck="false"></textarea>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeEditorModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="saveStringEdit()">Save</button>
                </div>
            </div>
        </div>

        <script>${script}</script>
    </body>
    </html>`;
}

module.exports = { getWebviewContent };