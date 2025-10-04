// src/webview/webviewContent.js
const path = require('path');
const fs = require('fs');

function getWebviewContent(webview, extensionPath) {
    // Read the CSS and JS files
    const stylesPath = path.join(extensionPath, 'src', 'webview', 'assets', 'styles.css');
    const scriptPath = path.join(extensionPath, 'src', 'webview', 'assets', 'main.js');
    
    const styles = fs.readFileSync(stylesPath, 'utf8');
    const script = fs.readFileSync(scriptPath, 'utf8');

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
        </div>
        <div class="table-container">
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
                    <tr><td colspan="4" style="text-align: center; padding: 20px;">No variables to display. Run Python code to see variables.</td></tr>
                </tbody>
            </table>
        </div>

        <div id="detailModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <span class="modal-title" id="modalTitle">Variable Details</span>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <table id="detailTable">
                        <thead>
                            <tr>
                                <th style="width: 20%;" onclick="sortModalTable(0)">
                                    <span class="header-text">Index</span>
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