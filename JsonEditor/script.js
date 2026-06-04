/**
 * Pro JSON Editor - Core Logic
 */

// --- Configuration & State ---
const STATE = {
    vfs: null,
    openedFiles: [], // Array of file paths
    activeFile: null, // Current active file path
    editor: null,
    contextTarget: null,
};

// --- Virtual File System ---
class VirtualFS {
    constructor() {
        const saved = localStorage.getItem('json_editor_vfs');
        if (saved) {
            this.root = JSON.parse(saved);
        } else {
            this.root = {
                id: 'root',
                name: 'root',
                type: 'folder',
                children: [
                    {
                        id: '1',
                        name: 'example.json',
                        type: 'file',
                        content: JSON.stringify({
                            project: "Pro JSON Editor",
                            version: "1.0.0",
                            features: ["Dark Theme", "Monaco Editor", "VFS"],
                            author: {
                                name: "AI Engineer",
                                role: "Frontend Expert"
                            }
                        }, null, 4)
                    },
                    {
                        id: '2',
                        name: 'configs',
                        type: 'folder',
                        children: [
                            {
                                id: '3',
                                name: 'settings.json',
                                type: 'file',
                                content: JSON.stringify({ theme: "dark", fontSize: 14 }, null, 4)
                            }
                        ]
                    }
                ]
            };
        }
    }

    save() {
        localStorage.setItem('json_editor_vfs', JSON.stringify(this.root));
    }

    findItem(id, node = this.root) {
        if (node.id === id) return node;
        if (node.children) {
            for (const child of node.children) {
                const found = this.findItem(id, child);
                if (found) return found;
            }
        }
        return null;
    }

    findParent(id, node = this.root) {
        if (node.children) {
            for (const child of node.children) {
                if (child.id === id) return node;
                const found = this.findParent(id, child);
                if (found) return found;
            }
        }
        return null;
    }

    createItem(parentId, name, type) {
        const parent = this.findItem(parentId);
        if (!parent || parent.type !== 'folder') return null;

        const newItem = {
            id: Date.now().toString(),
            name,
            type,
            ...(type === 'file' ? { content: '{}' } : { children: [] })
        };
        parent.children.push(newItem);
        this.save();
        return newItem;
    }

    deleteItem(id) {
        const parent = this.findParent(id);
        if (!parent) return false;
        parent.children = parent.children.filter(item => item.id !== id);
        this.save();
        return true;
    }

    renameItem(id, newName) {
        const item = this.findItem(id);
        if (!item) return false;
        item.name = newName;
        this.save();
        return true;
    }

    moveItem(itemId, targetFolderId) {
        const item = this.findItem(itemId);
        const target = this.findItem(targetFolderId);
        if (!item || !target || target.type !== 'folder') return false;
        
        const oldParent = this.findParent(itemId);
        if (oldParent) {
            oldParent.children = oldParent.children.filter(i => i.id !== itemId);
        }
        target.children.push(item);
        this.save();
        return true;
    }

    getPath(id) {
        const path = [];
        let curr = this.findItem(id);
        while (curr && curr.id !== 'root') {
            path.unshift(curr.name);
            curr = this.findParent(curr.id);
        }
        path.unshift('root');
        return path;
    }
}

// --- UI Controller ---
const UI = {
    treeEl: document.getElementById('file-tree'),
    tabsEl: document.getElementById('tabs-container'),
    breadcrumbsEl: document.getElementById('breadcrumbs'),
    contextMenu: document.getElementById('context-menu'),
    statusValidity: document.getElementById('status-validity'),
    statusCursor: document.getElementById('status-cursor'),

    init() {
        lucide.createIcons();
        this.renderTree();
    },

    renderTree() {
        this.treeEl.innerHTML = '';
        const rootContent = this.createTreeNodes(STATE.vfs.root.children, 0);
        this.treeEl.appendChild(rootContent);
        lucide.createIcons();
    },

    createTreeNodes(items, depth) {
        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            const container = document.createElement('div');
            
            const row = document.createElement('div');
            row.className = `tree-item ${STATE.activeFile === item.id ? 'active' : ''}`;
            row.style.paddingLeft = `${depth * 15 + 12}px`;
            row.dataset.id = item.id;
            row.draggable = true;

            const icon = item.type === 'folder' ? 'folder' : 'file-json';
            row.innerHTML = `<i data-lucide="${icon}"></i> <span>${item.name}</span>`;

            row.onclick = (e) => {
                e.stopPropagation();
                if (item.type === 'folder') {
                    const content = row.nextElementSibling;
                    if (content) content.classList.toggle('collapsed');
                } else {
                    EditorManager.openFile(item.id);
                }
            };

            row.oncontextmenu = (e) => {
                e.preventDefault();
                InteractionManager.showContextMenu(e, item.id);
            };

            row.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', item.id);
            };

            row.ondragover = (e) => {
                if (item.type === 'folder') {
                    e.preventDefault();
                    row.style.backgroundColor = 'var(--bg-hover)';
                }
            };

            row.ondragleave = () => {
                row.style.backgroundColor = '';
            };

            row.ondrop = (e) => {
                e.preventDefault();
                row.style.backgroundColor = '';
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId !== item.id && item.type === 'folder') {
                    if (STATE.vfs.moveItem(draggedId, item.id)) {
                        this.renderTree();
                    }
                }
            };

            container.appendChild(row);

            if (item.type === 'folder' && item.children) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'tree-folder-content';
                childrenContainer.appendChild(this.createTreeNodes(item.children, depth + 1));
                container.appendChild(childrenContainer);
            }

            fragment.appendChild(container);
        });
        return fragment;
    },

    updateTabs() {
        this.tabsEl.innerHTML = '';
        STATE.openedFiles.forEach(filePath => {
            const item = STATE.vfs.findItem(filePath);
            const tab = document.createElement('div');
            tab.className = `tab ${STATE.activeFile === filePath ? 'active' : ''}`;
            tab.innerHTML = `<i data-lucide="file-json"></i> <span>${item.name}</span> <div class="close-tab"><i data-lucide="x" style="width:12px;height:12px"></i></div>`;
            
            tab.onclick = () => EditorManager.openFile(filePath);
            tab.querySelector('.close-tab').onclick = (e) => {
                e.stopPropagation();
                EditorManager.closeFile(filePath);
            };
            this.tabsEl.appendChild(tab);
        });
        lucide.createIcons();
    },

    updateBreadcrumbs() {
        if (!STATE.activeFile) return;
        const path = STATE.vfs.getPath(STATE.activeFile);
        this.breadcrumbsEl.innerHTML = `<i data-lucide="folder"></i>` + 
            path.map((p, i) => `<span class="${i === path.length - 1 ? 'active' : ''}">${p}</span>`).join(' <i data-lucide="chevron-right" style="width:12px"></i> ');
        lucide.createIcons();
    },

    updateStatus(validity, cursor = null) {
        this.statusValidity.innerHTML = `<i data-lucide="info"></i> ${validity}`;
        this.statusValidity.className = `status-item ${validity.includes('Error') ? 'danger' : ''}`;
        if (cursor) {
            this.statusCursor.innerText = `Ln ${cursor.lineNumber}, Col ${cursor.column}`;
        }
        lucide.createIcons();
    }
};

// --- Editor Manager ---
const EditorManager = {
    async init() {
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' }});
        require(['vs/editor/editor.main'], () => {
            STATE.editor = monaco.editor.create(document.getElementById('editor-container'), {
                value: '',
                language: 'json',
                theme: 'vs-dark',
                automaticLayout: true,
                fontSize: 14,
                minimap: { enabled: false },
                padding: { top: 10 }
            });

            STATE.editor.onDidChangeModelContent(() => {
                if (STATE.activeFile) {
                    const item = STATE.vfs.findItem(STATE.activeFile);
                    item.content = STATE.editor.getValue();
                    STATE.vfs.save();
                    this.validate();
                }
            });

            STATE.editor.onDidChangeCursorPosition(e => {
                UI.updateStatus(UI.statusValidity.innerText, e.position);
            });
        });
    },

    openFile(id) {
        const item = STATE.vfs.findItem(id);
        if (!item || item.type !== 'file') return;

        if (!STATE.openedFiles.includes(id)) {
            STATE.openedFiles.push(id);
        }
        STATE.activeFile = id;
        STATE.editor.setValue(item.content);
        
        UI.updateTabs();
        UI.updateBreadcrumbs();
        UI.renderTree();
        this.validate();
    },

    closeFile(id) {
        STATE.openedFiles = STATE.openedFiles.filter(f => f !== id);
        if (STATE.activeFile === id) {
            STATE.activeFile = STATE.openedFiles.length > 0 ? STATE.openedFiles[STATE.openedFiles.length - 1] : null;
            if (STATE.activeFile) this.openFile(STATE.activeFile);
            else STATE.editor.setValue('');
        }
        UI.updateTabs();
        UI.updateBreadcrumbs();
    },

    validate() {
        const content = STATE.editor.getValue();
        try {
            JSON.parse(content);
            UI.updateStatus('Valid JSON');
        } catch (e) {
            UI.updateStatus(`Error: ${e.message}`);
        }
    },

    format(minify = false) {
        try {
            const obj = JSON.parse(STATE.editor.getValue());
            const formatted = minify ? JSON.stringify(obj) : JSON.stringify(obj, null, 4);
            STATE.editor.setValue(formatted);
        } catch (e) {
            alert('Invalid JSON: Cannot format');
        }
    }
};

// --- Interaction Manager ---
const InteractionManager = {
    init() {
        document.addEventListener('click', () => UI.contextMenu.classList.add('hidden'));
        
        document.getElementById('new-file-btn').onclick = () => this.promptCreate('file');
        document.getElementById('new-folder-btn').onclick = () => this.promptCreate('folder');
        
        document.getElementById('btn-prettify').onclick = () => EditorManager.format(false);
        document.getElementById('btn-minify').onclick = () => EditorManager.format(true);
        document.getElementById('btn-validate').onclick = () => EditorManager.validate();

        UI.contextMenu.addEventListener('click', (e) => {
            const action = e.target.closest('.menu-item')?.dataset.action;
            if (!action) return;

            const id = STATE.contextTarget;
            if (action === 'new-file') this.promptCreate('file', id);
            if (action === 'new-folder') this.promptCreate('folder', id);
            if (action === 'rename') {
                const name = prompt('Enter new name:', STATE.vfs.findItem(id).name);
                if (name) {
                    STATE.vfs.renameItem(id, name);
                    UI.renderTree();
                }
            }
            if (action === 'delete') {
                if (confirm('Delete this item?')) {
                    STATE.vfs.deleteItem(id);
                    if (STATE.activeFile === id) EditorManager.closeFile(id);
                    UI.renderTree();
                }
            }
        });
    },

    showContextMenu(e, id) {
        STATE.contextTarget = id;
        UI.contextMenu.classList.remove('hidden');
        UI.contextMenu.style.left = `${e.clientX}px`;
        UI.contextMenu.style.top = `${e.clientY}px`;
    },

    promptCreate(type, parentId = 'root') {
        const name = prompt(`Enter ${type === 'file' ? 'file' : 'folder'} name:`);
        if (name) {
            STATE.vfs.createItem(parentId, name, type);
            UI.renderTree();
        }
    }
};

// --- App Bootstrap ---
window.onload = () => {
    STATE.vfs = new VirtualFS();
    UI.init();
    EditorManager.init();
    InteractionManager.init();
};