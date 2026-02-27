class Dashboard {
    constructor(app) {
        this.app = app;
        app.dashboard = this;
        this.container = document.getElementById('dashboard');
        this.appContainer = document.getElementById('app');
        this.boardGrid = document.getElementById('boardGrid');
        this.btnNewBoard = document.getElementById('btnNewBoard');
        this.btnNewFolder = document.getElementById('btnNewFolder');
        this.breadcrumb = document.querySelector('.breadcrumb');
        this.folderList = document.getElementById('folderList');
        this.searchInput = document.getElementById('searchInput');
        this.mobileSearchInput = document.getElementById('mobileSearchInput');
        this.searchClearBtn = document.getElementById('searchClear');
        this.mobileSearchClearBtn = document.getElementById('mobileSearchClear');
        this.btnEmptyTrash = document.getElementById('btnEmptyTrash');
        this.btnSelectAll = document.getElementById('btnSelectAll');
        this.btnSelectAllMobile = document.getElementById('btnSelectAllMobile');
        this.loader = document.getElementById('dashboardLoader');




        this.currentBoardId = null;
        this.currentView = 'all';
        this.searchTerm = '';
        this.selectedBoards = new Set();
        this.bulkMode = false;
        this.currentView = 'all';
        this.searchTerm = '';


        this.boards = this.loadData('wb_boards', []);
        this.folders = this.loadData('wb_folders', []);
        this.viewSettings = this.loadData('wb_view_settings', {
            gridSize: 'xsmall'
        });
        this.expandedFolders = this.loadData('wb_expanded_folders', []);

        this.defaultCovers = [
            { id: 'c1', bg: '#ff5c5c', texture: 'dots' },
            { id: 'c2', bg: '#ffb85c', texture: 'linear' },
            { id: 'c3', bg: '#ffd900', texture: 'linear' },
            { id: 'c4', bg: '#fab005', texture: 'linear' },
            { id: 'c5', bg: '#5cbd62', texture: 'linear' },
            { id: 'c6', bg: '#5c9bfe', texture: 'dots' },
            { id: 'c7', bg: '#b45cff', texture: 'dots' },
            { id: 'c8', bg: '#313131ff', texture: 'linear' }
        ];
        this.customCovers = []; // Will load in initAsync

        this.initAsync();
    }

    async initAsync() {
        // Initialize FileSystemManager first
        await window.fileSystemManager.init();

        // Now load data using the new async manager
        this.boards = await this.loadDataAsync('wb_boards', []);
        this.folders = await this.loadDataAsync('wb_folders', []);
        this.viewSettings = await this.loadDataAsync('wb_view_settings', { gridSize: 'xsmall' });
        this.expandedFolders = await this.loadDataAsync('wb_expanded_folders', []);
        this.customCovers = await this.loadDataAsync('wb_custom_covers', []);

        this.init();
        this.setupStorageSettings();
    }

    // Sync wrappers for legacy components
    loadData(key, defaultValue) {
        const local = localStorage.getItem(key);
        return local ? JSON.parse(local) : defaultValue;
    }

    saveData(key, value) {
        this.saveDataAsync(key, value);
    }

    init() {
        // Storage Permission Alert handling
        const banner = document.getElementById('storageAlertBanner');
        const btnGrant = document.getElementById('btnGrantStoragePermission');
        if (banner && btnGrant) {
            const hasStored = !!window.fileSystemManager.storedHandle;
            const hasActive = !!window.fileSystemManager.dirHandle;

            if (hasStored && !hasActive) {
                banner.style.display = 'flex';
                btnGrant.onclick = async () => {
                    const success = await window.fileSystemManager.requestStoredPermission();
                    if (success) {
                        banner.style.display = 'none';
                        await this.initAsync();
                    }
                };
            } else {
                banner.style.display = 'none';
            }
        }

        try {
            this.renderSidebar();
            this.renderBoards();

            if (this.btnNewBoard) {
                this.btnNewBoard.onclick = () => {
                    console.log('New Board clicked');
                    this.createNewBoard();
                };

            } else {
                console.warn('btnNewBoard element not found.');
            }

            if (this.btnNewFolder) {
                this.btnNewFolder.onclick = () => {
                    console.log('New Folder clicked');
                    this.createNewFolder();
                };
            }

            // Mobile New Board
            const btnNewBoardMobile = document.getElementById('btnNewBoardMobile');
            if (btnNewBoardMobile) {
                btnNewBoardMobile.onclick = () => this.createNewBoard();
            }

            // PDF Upload
            this.btnUploadPDF = document.getElementById('btnUploadPDF');
            const btnUploadPDFMobile = document.getElementById('btnUploadPDFMobile');
            this.pdfInput = document.getElementById('pdfInput');

            const triggerPDF = () => this.pdfInput.click();

            if (this.btnUploadPDF && this.pdfInput) {
                this.btnUploadPDF.onclick = triggerPDF;
                this.pdfInput.onchange = (e) => this.handlePDFUpload(e);
            }
            if (btnUploadPDFMobile) {
                btnUploadPDFMobile.onclick = triggerPDF;
            }

            // Template Gallery
            this.btnOpenTemplates = document.getElementById('btnOpenTemplates');
            const btnOpenTemplatesMobile = document.getElementById('btnOpenTemplatesMobile');

            const triggerTemplates = () => this.openTemplateGallery();

            if (this.btnOpenTemplates) {
                this.btnOpenTemplates.onclick = triggerTemplates;
            }
            if (btnOpenTemplatesMobile) {
                btnOpenTemplatesMobile.onclick = triggerTemplates;
            }
            if (this.btnEmptyTrash) {
                this.btnEmptyTrash.onclick = () => this.emptyTrash();
            }

            this.setupAppNavigation();
            this.setupViewOptions();
            this.setupSearch();
            this.setupCoverModal();
            this.setupSelectAll();

            this.applyViewSettings();


            document.addEventListener('keydown', (e) => {
                // Ctrl/Cmd + S: Save
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    if (this.currentBoardId) {
                        this.saveCurrentBoard();
                        console.log('Saved!');
                    }
                }

                // Ctrl/Cmd + N: New note
                if ((e.ctrlKey || e.metaKey) && e.key === 'n' && this.container.style.display !== 'none') {
                    e.preventDefault();
                    this.createNewBoard();
                }

                // Ctrl/Cmd + F: Search focus
                if ((e.ctrlKey || e.metaKey) && e.key === 'f' && this.container.style.display !== 'none') {
                    e.preventDefault();
                    const visibleSearch = window.innerWidth <= 768 ? this.mobileSearchInput : this.searchInput;
                    visibleSearch?.focus();
                }

                // Escape: Clear Search or Selection
                if (e.key === 'Escape') {
                    if (this.selectedBoards.size > 0) {
                        this.clearSelection();
                    } else if (this.searchTerm) {
                        this.clearSearch();
                    }
                }

                // Ctrl/Cmd + A: Select All (only if dashboard is visible)
                if ((e.ctrlKey || e.metaKey) && e.key === 'a' && this.container.style.display !== 'none') {
                    const activeElement = document.activeElement;
                    const isInput = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.contentEditable === 'true';

                    if (!isInput) {
                        e.preventDefault();
                        this.toggleSelectAll();
                    }
                }
            });

            // Initialize Bulk Actions Logic
            this.setupBulkActions();

        } catch (err) {
            console.error('Dashboard init error:', err);
        }
    }

    async loadDataAsync(key, defaultValue) {
        return await window.fileSystemManager.getItem(key, defaultValue);
    }

    async saveDataAsync(key, value) {
        await window.fileSystemManager.saveItem(key, value);
    }

    // Keep legacy for now but mark as deprecated
    loadData(key, defaultValue) {
        console.warn('Sync loadData is deprecated. Use loadDataAsync');
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : defaultValue;
    }

    saveData(key, value) {
        console.warn('Sync saveData is deprecated. Use saveDataAsync');
        window.fileSystemManager.saveItem(key, value); // Background fire
    }

    isMobile() {
        return window.innerWidth <= 768;
    }

    toggleFolder(folderId) {
        const index = this.expandedFolders.indexOf(folderId);
        if (index === -1) {
            this.expandedFolders.push(folderId);
        } else {
            this.expandedFolders.splice(index, 1);
        }
        this.saveData('wb_expanded_folders', this.expandedFolders);
        this.renderSidebar();
    }

    showLoading() {
        if (this.loader) this.loader.style.display = 'flex';
    }

    hideLoading() {
        if (this.loader) this.loader.style.display = 'none';
    }

    renderSidebar() {
        this.folderList.innerHTML = '';

        // Listeners for static nav items (Tüm Sayfalar, Son Kullanılanlar, vb.)
        document.querySelectorAll('.nav-item[data-view]').forEach(item => {
            const view = item.dataset.view;
            if (view && !view.startsWith('f_')) {
                item.onclick = () => this.switchView(view);
                item.classList.toggle('active', this.currentView === view);
            }
        });

        // Dynamic Folders Tree
        const rootFolders = this.folders.filter(f => !f.parentId);
        this.renderFolderTree(rootFolders, this.folderList, 0);

        // On mobile, render notes that don't have a folder at the end of the list
        if (this.isMobile()) {
            const orphanNotes = this.boards.filter(b => !b.folderId && !b.deleted);
            if (orphanNotes.length > 0) {
                const orphanSection = document.createElement('div');
                orphanSection.className = 'nav-section';
                orphanSection.innerHTML = '<div class="section-title">DİĞER NOTLAR</div>';

                orphanNotes.forEach(note => {
                    const noteItem = document.createElement('div');
                    noteItem.className = `tree-note-item ${this.currentBoardId === note.id ? 'active' : ''}`;
                    noteItem.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden;">
                            <img src="assets/icons/pages.svg" class="note-icon">
                            <span class="note-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${note.name}</span>
                        </div>
                        <div class="folder-menu-trigger">⋮</div>
                        <div class="folder-dropdown" style="width: 130px;">
                            <div class="dropdown-item" data-action="rename">
                                <img src="assets/icons/text-cursor.svg" style="width: 12px; opacity: 0.6;">
                                İsmi Değiştir
                            </div>
                            <div class="dropdown-item" data-action="delete" style="color: #fa5252;">
                                <img src="assets/icons/trash.svg" style="width: 12px; opacity: 0.6; filter: invert(36%) sepia(84%) saturate(1450%) hue-rotate(338deg) brightness(98%) contrast(98%);">
                                Sil
                            </div>
                        </div>
                    `;

                    noteItem.onclick = (e) => {
                        if (e.target.closest('.folder-menu-trigger') || e.target.closest('.folder-dropdown') || e.target.closest('.note-name[contenteditable="true"]')) return;
                        this.loadBoard(note.id);
                    };

                    const trigger = noteItem.querySelector('.folder-menu-trigger');
                    const dropdown = noteItem.querySelector('.folder-dropdown');
                    const nameEl = noteItem.querySelector('.note-name');

                    trigger.onclick = (e) => {
                        e.stopPropagation();
                        // Close other dropdowns
                        document.querySelectorAll('.folder-dropdown.show').forEach(d => {
                            if (d !== dropdown) d.classList.remove('show');
                        });
                        dropdown.classList.toggle('show');
                    };

                    dropdown.querySelector('[data-action="rename"]').onclick = (e) => {
                        e.stopPropagation();
                        dropdown.classList.remove('show');
                        nameEl.contentEditable = "true";
                        nameEl.focus();
                        document.execCommand('selectAll', false, null);

                        const saveRename = () => {
                            nameEl.contentEditable = "false";
                            this.renameBoard(note.id, nameEl.textContent);
                        };

                        nameEl.onblur = saveRename;
                        nameEl.onkeydown = (ke) => {
                            if (ke.key === 'Enter') { ke.preventDefault(); nameEl.blur(); }
                        };
                    };

                    dropdown.querySelector('[data-action="delete"]').onclick = (e) => {
                        e.stopPropagation();
                        dropdown.classList.remove('show');
                        this.deleteBoardConfirmation(note.id);
                    };

                    orphanSection.appendChild(noteItem);
                });
                this.folderList.appendChild(orphanSection);
            }
        }

        // Global click listener to close dropdowns
        if (!this.dropdownListenerAttached) {
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.folder-menu-trigger')) {
                    document.querySelectorAll('.folder-dropdown.show').forEach(d => d.classList.remove('show'));
                }

                // Close board actions if clicked outside
                if (!e.target.closest('.board-actions')) {
                    document.querySelectorAll('.board-actions.show').forEach(d => {
                        d.classList.remove('show');
                        const card = d.closest('.board-card');
                        if (card) card.classList.remove('actions-open');
                    });
                }
            });
            this.dropdownListenerAttached = true;
        }

        // Re-render when window is resized to handle mobile/desktop switch
        if (!this.resizeListenerAttached) {
            window.addEventListener('resize', () => {
                this.renderSidebar();
                this.renderBoards();
            });
            this.resizeListenerAttached = true;
        }
    }

    renderFolderTree(folders, container, level) {
        folders.forEach(folder => {
            const isExpanded = this.expandedFolders.includes(folder.id);
            const hasChildren = this.folders.some(f => f.parentId === folder.id) || (this.isMobile() && this.boards.some(b => b.folderId === folder.id && !b.deleted));

            const item = document.createElement('div');
            item.className = `nav-item folder-item ${this.currentView === folder.id ? 'active' : ''} ${isExpanded ? 'expanded' : ''}`;
            item.dataset.view = folder.id;
            item.style.paddingLeft = `${12 + level * 20}px`; // Indentation for subfolders

            const folderColor = folder.color || '#ccc';
            item.innerHTML = `
                <div class="folder-content">
                    <img src="assets/icons/arrow-dashboard.svg" class="folder-chevron ${isExpanded ? 'rotated' : ''}" style="width: 6px; opacity: 0.4; transition: transform 0.2s; margin-right: 4px; ${hasChildren ? '' : 'visibility: hidden;'}">
                    <div class="folder-color-bar" style="background: ${folderColor};"></div>
                    <img src="assets/icons/folder.svg" class="folder-icon">
                    <span class="folder-name" spellcheck="false" style="color: ${folderColor === '#ccc' ? 'inherit' : folderColor};">${folder.name}</span>
                </div>
                <div class="folder-menu-trigger">⋮</div>
                <div class="folder-dropdown">
                    <div class="dropdown-item" data-action="addSub">
                        <img src="assets/icons/subfolder.svg" style="width: 12px; opacity: 0.6;">
                        Alt Klasör Ekle
                    </div>
                    ${this.isMobile() ? `
                    <div class="dropdown-item" data-action="addNote">
                        <img src="assets/icons/add-page.svg" style="width: 12px; opacity: 0.6;">
                        Yeni Not Ekle
                    </div>
                    ` : ''}
                    <div class="dropdown-item" data-action="rename">
                        <img src="assets/icons/text-cursor.svg" style="width: 12px; opacity: 0.6;">
                        İsmi Değiştir
                    </div>
                    <div class="dropdown-item" data-action="delete" style="color: #fa5252;">
                        <img src="assets/icons/trash.svg" style="width: 12px; opacity: 0.6; filter: invert(36%) sepia(84%) saturate(1450%) hue-rotate(338deg) brightness(98%) contrast(98%);">
                        Klasörü Sil
                    </div>
                    <div class="folder-color-palette">
                        ${['#ccc', '#b8e994', '#ffbe76', '#ff7979', '#4a90e2', '#862e9c', '#f1c40f', '#1abc9c', '#34495e', '#7f8c8d'].map(c => `
                            <div class="color-option" style="background: ${c}" data-color="${c}" title="Renk Değiştir"></div>
                        `).join('')}
                    </div>
                </div>
            `;

            const chevron = item.querySelector('.folder-chevron');
            if (hasChildren) {
                chevron.onclick = (e) => {
                    e.stopPropagation();
                    this.toggleFolder(folder.id);
                };
            }

            item.onclick = (e) => {
                if (e.target.closest('.folder-menu-trigger') || e.target.closest('.folder-dropdown') || e.target.closest('.folder-chevron')) return;

                // If it's the already active folder, toggle it. Otherwise switch view.
                if (this.currentView === folder.id) {
                    this.toggleFolder(folder.id);
                } else {
                    this.switchView(folder.id);
                    // Also auto-expand when switching to a folder
                    if (!isExpanded) {
                        this.toggleFolder(folder.id);
                    }
                }
            };

            const trigger = item.querySelector('.folder-menu-trigger');
            const dropdown = item.querySelector('.folder-dropdown');
            const nameEl = item.querySelector('.folder-name');

            trigger.onclick = (e) => {
                e.stopPropagation();
                document.querySelectorAll('.folder-dropdown.show').forEach(d => {
                    if (d !== dropdown) d.classList.remove('show');
                });
                dropdown.classList.toggle('show');
            };

            dropdown.querySelector('[data-action="addSub"]').onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.remove('show');
                this.createNewFolder(folder.id);
                // Ensure parent is expanded when adding child
                if (!this.expandedFolders.includes(folder.id)) {
                    this.toggleFolder(folder.id);
                }
            };

            if (this.isMobile()) {
                dropdown.querySelector('[data-action="addNote"]').onclick = (e) => {
                    e.stopPropagation();
                    dropdown.classList.remove('show');
                    this.currentBoardId = null;
                    this.switchView(folder.id);
                    this.createNewBoard();
                    if (!this.expandedFolders.includes(folder.id)) {
                        this.toggleFolder(folder.id);
                    }
                };
            }

            dropdown.querySelector('[data-action="rename"]').onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.remove('show');
                nameEl.contentEditable = "true";
                nameEl.focus();
                document.execCommand('selectAll', false, null);

                nameEl.onblur = () => {
                    nameEl.contentEditable = "false";
                    this.renameFolder(folder.id, nameEl.textContent);
                };
                nameEl.onkeydown = (ke) => {
                    if (ke.key === 'Enter') { ke.preventDefault(); nameEl.blur(); }
                };
            };

            dropdown.querySelector('[data-action="delete"]').onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.remove('show');
                this.deleteFolderConfirmation(folder.id);
            };

            dropdown.querySelectorAll('.color-option').forEach(opt => {
                opt.onclick = (e) => {
                    e.stopPropagation();
                    this.changeFolderColor(folder.id, opt.dataset.color);
                    dropdown.classList.remove('show');
                };
            });

            container.appendChild(item);

            // Container for folder children (subfolders and notes)
            if (isExpanded) {
                const childContainer = document.createElement('div');
                childContainer.className = 'folder-children';
                container.appendChild(childContainer);

                // Render notes under this folder if on mobile
                if (this.isMobile()) {
                    const folderNotes = this.boards.filter(b => b.folderId === folder.id && !b.deleted);
                    folderNotes.forEach(note => {
                        const noteItem = document.createElement('div');
                        noteItem.className = `tree-note-item ${this.currentBoardId === note.id ? 'active' : ''}`;
                        noteItem.style.paddingLeft = `${32 + level * 20}px`;
                        noteItem.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden;">
                                <img src="assets/icons/pages.svg" class="note-icon">
                                <span class="note-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${note.name}</span>
                            </div>
                            <div class="folder-menu-trigger">⋮</div>
                            <div class="folder-dropdown" style="width: 130px;">
                                <div class="dropdown-item" data-action="rename">
                                    <img src="assets/icons/text-cursor.svg" style="width: 10px; opacity: 0.6;">
                                    İsmi Değiştir
                                </div>
                                <div class="dropdown-item" data-action="delete" style="color: #fa5252;">
                                    <img src="assets/icons/trash.svg" style="width: 12px; opacity: 0.6; filter: invert(36%) sepia(84%) saturate(1450%) hue-rotate(338deg) brightness(98%) contrast(98%);">
                                    Sil
                                </div>
                            </div>
                        `;

                        noteItem.onclick = (e) => {
                            if (e.target.closest('.folder-menu-trigger') || e.target.closest('.folder-dropdown') || e.target.closest('.note-name[contenteditable="true"]')) return;
                            this.loadBoard(note.id);
                        };

                        const trigger = noteItem.querySelector('.folder-menu-trigger');
                        const dropdown = noteItem.querySelector('.folder-dropdown');
                        const nameEl = noteItem.querySelector('.note-name');

                        trigger.onclick = (e) => {
                            e.stopPropagation();
                            // Close other dropdowns
                            document.querySelectorAll('.folder-dropdown.show').forEach(d => {
                                if (d !== dropdown) d.classList.remove('show');
                            });
                            dropdown.classList.toggle('show');
                        };

                        dropdown.querySelector('[data-action="rename"]').onclick = (e) => {
                            e.stopPropagation();
                            dropdown.classList.remove('show');
                            nameEl.contentEditable = "true";
                            nameEl.focus();
                            document.execCommand('selectAll', false, null);

                            const saveRename = () => {
                                nameEl.contentEditable = "false";
                                this.renameBoard(note.id, nameEl.textContent);
                            };

                            nameEl.onblur = saveRename;
                            nameEl.onkeydown = (ke) => {
                                if (ke.key === 'Enter') { ke.preventDefault(); nameEl.blur(); }
                            };
                        };

                        dropdown.querySelector('[data-action="delete"]').onclick = (e) => {
                            e.stopPropagation();
                            dropdown.classList.remove('show');
                            this.deleteBoardConfirmation(note.id);
                        };

                        childContainer.appendChild(noteItem);
                    });


                }

                // Render children
                const children = this.folders.filter(f => f.parentId === folder.id);
                if (children.length > 0) {
                    this.renderFolderTree(children, childContainer, level + 1);
                }
            }
        });
    }

    renderBoards() {
        if (!this.boardGrid) return;
        this.boardGrid.innerHTML = '';

        // Refresh data to ensure we have latest states
        const loadedBoards = this.loadData('wb_boards', []);
        this.boards = Array.isArray(loadedBoards) ? loadedBoards : [];

        let filtered = [];

        if (this.currentView === 'trash') {
            filtered = this.boards.filter(b => b.deleted);
        } else {
            // Base filter: non-deleted
            let base = this.boards.filter(b => !b.deleted);

            if (this.currentView === 'all') {
                filtered = base;
            } else if (this.currentView === 'recent') {
                filtered = [...base].sort((a, b) => b.lastModified - a.lastModified);
            } else if (this.currentView === 'favorites') {
                filtered = base.filter(b => b.favorite);
            } else if (this.currentView.startsWith('f_')) {
                filtered = base.filter(b => b.folderId === this.currentView);
            } else {
                filtered = base;
            }
        }

        // Apply Search Filter
        if (this.searchTerm) {
            filtered = filtered.filter(b => b.name.toLowerCase().includes(this.searchTerm));
        }

        this.updateSelectAllButtonState(filtered);


        if (filtered.length === 0 && this.currentView === 'trash') {
            this.boardGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🗑️</div>
                    <h3>Çöp kutusu boş</h3>
                </div>
            `;
            return;
        }

        if (filtered.length === 0 && this.searchTerm) {
            this.boardGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <h3>"${this.searchTerm}" ile eşleşen not bulunamadı</h3>
                    <button class="btn btn-secondary" id="btnClearSearchGeneric">Aramayı Temizle</button>
                </div>
            `;
            this.boardGrid.querySelector('#btnClearSearchGeneric').onclick = () => this.clearSearch();
            return;
        }

        if (filtered.length === 0 && this.currentView !== 'trash') {
            this.boardGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📁</div>
                    <h3>Henüz not yok</h3>
                    <p>Yeni bir not oluşturmak için + butonuna tıklayın</p>
                    <button class="btn btn-primary" id="btnCreateFirstNote">
                        İlk Notunu Oluştur
                    </button>
                </div>
            `;
            const btn = this.boardGrid.querySelector('#btnCreateFirstNote');
            if (btn) btn.onclick = () => this.createNewBoard();
            return;
        }


        filtered.forEach(board => {
            const card = document.createElement('div');
            card.className = `board-card ${this.selectedBoards.has(board.id) ? 'selected' : ''}`;
            card.dataset.id = board.id;

            // Check if recent (last 24 hours)
            const isRecent = (Date.now() - board.lastModified) < (24 * 60 * 60 * 1000);
            if (isRecent && this.currentView === 'all') {
                card.dataset.recent = "true";
            }

            const hasImage = board.coverImage;
            const coverBg = board.coverBg || '#4a90e2';
            const coverTexture = board.coverTexture || 'linear';

            card.innerHTML = `
                <div class="board-selection" onclick="event.stopPropagation()">
                    <input type="checkbox" class="board-checkbox" 
                           ${this.selectedBoards.has(board.id) ? 'checked' : ''}>
                </div>

                <div class="notebook-container">
                    <div class="notebook-cover ${hasImage ? '' : `cover-texture-${coverTexture}`}" 
                         style="background-color: ${coverBg}; ${hasImage ? `background-image: url(${board.coverImage}); background-size: cover; background-position: center;` : ''}">
                        <div class="notebook-spine"></div>
                    </div>
                </div>

                <div class="board-info">
                    <div class="board-title" contenteditable="true" spellcheck="false">${board.name}</div>
                    <div class="board-meta">
                        <span>${new Date(board.lastModified).toLocaleDateString()}</span>
                    </div>
                </div>
            `;

            card.querySelector('.board-checkbox').onchange = (e) => {
                this.toggleBoardSelection(board.id, e.target.checked);
            };

            card.onclick = (e) => {
                // Ignore clicks on title and selection
                if (e.target.classList.contains('board-title') ||
                    e.target.closest('.board-selection')) {
                    return;
                }

                // If in bulk mode (at least one selected), clicking card selects it
                if (this.selectedBoards.size > 0 || e.shiftKey) {
                    this.toggleBoardSelection(board.id, !this.selectedBoards.has(board.id));
                    return;
                }

                this.loadBoard(board.id);
            };

            // Long Press for Mobile Selection
            let pressTimer;
            card.addEventListener('touchstart', (e) => {
                pressTimer = setTimeout(() => {
                    this.toggleBoardSelection(board.id, true);
                    navigator.vibrate?.(50); // Haptic feedback
                }, 600);
            }, { passive: true });

            card.addEventListener('touchend', () => clearTimeout(pressTimer), { passive: true });
            card.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });

            // Title editing
            const titleEl = card.querySelector('.board-title');
            titleEl.onblur = () => this.renameBoard(board.id, titleEl.textContent);
            titleEl.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
            };

            this.boardGrid.appendChild(card);
        });

        this.setupBoardDragDrop();

        // Add "Create New" card at the end
        if (this.currentView !== 'trash' && !this.searchTerm) {
            const createCard = document.createElement('div');
            createCard.className = 'board-card create-new-card';
            createCard.innerHTML = `
                <div class="notebook-container">
                    <div class="notebook-cover-dashed">
                        <span class="dashed-plus-icon">+</span>
                    </div>
                </div>
                <div class="board-info">
                    <div class="board-title" style="color: #999;">Yeni Not</div>
                </div>
            `;
            createCard.onclick = () => {
                this.createNewBoard();
            };
            this.boardGrid.appendChild(createCard);
        }
    }

    switchView(view) {
        this.currentView = view;
        const folder = this.folders.find(f => f.id === view);
        const titles = {
            all: 'Tüm Sayfalar',
            recent: 'Son Kullanılanlar',
            favorites: 'Favoriler',
            trash: 'Çöp Kutusu'
        };
        const title = titles[view] || (folder ? folder.name : 'Klasör');
        this.breadcrumb.textContent = `Tomar / ${title}`;

        // Show/Hide Empty Trash button
        if (this.btnEmptyTrash) {
            this.btnEmptyTrash.style.display = (view === 'trash') ? 'flex' : 'none';
        }

        this.renderSidebar();
        this.renderBoards();
    }

    createNewFolder(parentId = null) {
        const id = 'f_' + Date.now();

        // Find a unique name
        const baseName = 'Yeni Klasör';
        let name = baseName;
        let counter = 1;
        const existingNames = this.folders.map(f => f.name.trim());

        if (existingNames.includes(baseName)) {
            while (existingNames.includes(`${baseName} ${counter}`)) {
                counter++;
            }
            name = `${baseName} ${counter}`;
        }

        const newFolder = {
            id: id,
            name: name,
            created: Date.now(),
            parentId: parentId
        };
        // Position at top of dynamic list
        this.folders.unshift(newFolder);
        this.saveData('wb_folders', this.folders);
        this.switchView(id);

        // Auto focus for renaming
        setTimeout(() => {
            const nameEl = document.querySelector(`.nav-item[data-view="${id}"] .folder-name`);
            if (nameEl) {
                nameEl.contentEditable = "true";
                nameEl.focus();
                document.execCommand('selectAll', false, null);

                nameEl.onblur = () => {
                    nameEl.contentEditable = "false";
                    this.renameFolder(id, nameEl.textContent);
                };
                nameEl.onkeydown = (ke) => {
                    if (ke.key === 'Enter') { ke.preventDefault(); nameEl.blur(); }
                };
            }
        }, 150);
    }

    setupStorageSettings() {
        const btnStorage = document.getElementById('btnStorageSettings');
        const modal = document.getElementById('storageSettingsModal');
        const btnClose = document.getElementById('btnCloseStorageSettingsModal');
        const btnCancel = document.getElementById('btnCancelStorageSettings');
        const btnPick = document.getElementById('btnChangeStorageLocation');
        const btnReset = document.getElementById('btnResetStorageLocation');
        const statusText = document.getElementById('currentStorageLocation');

        if (!btnStorage || !modal) return;

        const updateStatusUI = () => {
            const mode = window.fileSystemManager.mode;
            const hasDir = !!window.fileSystemManager.dirHandle;
            const hasStored = !!window.fileSystemManager.storedHandle;

            if (mode === 'native' && hasDir) {
                statusText.innerHTML = `Mevcut Konum: <strong style="color: #2b8a3e">Yerel Klasör (${window.fileSystemManager.dirHandle.name})</strong>`;
                btnPick.textContent = 'Konumu Değiştir';
                btnPick.className = 'btn btn-primary';
            } else if (mode === 'native' && hasStored) {
                statusText.innerHTML = `Mevcut Konum: <strong style="color: #f08c00">İzin Bekleniyor (${window.fileSystemManager.storedHandle.name})</strong>`;
                btnPick.textContent = 'Erişime İzin Ver';
                btnPick.className = 'btn btn-warning'; // Yellowish to indicate action needed
            } else if (mode === 'native') {
                statusText.innerHTML = `Mevcut Konum: <strong>Tarayıcı Depolaması</strong>`;
                btnPick.textContent = 'Yerel Klasör Seç veya Oluştur';
                btnPick.className = 'btn btn-primary';
            } else {
                statusText.innerHTML = `Mevcut Konum: <strong>Tarayıcı Veritabanı (IndexedDB)</strong>`;
                btnPick.style.display = 'none';
            }

            // Highligh support note for non-chromium
            const supportNote = document.getElementById('folderPickerSupportNote');
            if (supportNote) supportNote.style.display = (mode === 'indexeddb') ? 'block' : 'none';
        };

        btnStorage.onclick = () => {
            console.log('Depolama ayarları butonu tıklandı');
            const innerModal = modal.querySelector('.settings-modal');
            modal.style.display = 'flex';
            modal.classList.add('show');
            if (innerModal) innerModal.classList.add('show');
            updateStatusUI();
        };

        const closeModal = () => {
            const innerModal = modal.querySelector('.settings-modal');
            modal.style.display = 'none';
            modal.classList.remove('show');
            if (innerModal) innerModal.classList.remove('show');
        };
        if (btnClose) btnClose.onclick = closeModal;
        if (btnCancel) btnCancel.onclick = closeModal;
        window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        btnPick.onclick = async () => {
            const success = await window.fileSystemManager.pickStorageFolder();
            if (success) {
                updateStatusUI();
                // Reload data from new folder
                this.initAsync();
            }
        };

        btnReset.onclick = async () => {
            if (confirm('Depolama konumunu tarayıcıya geri döndürmek istediğinize emin misiniz?')) {
                const tx = window.fileSystemManager.db.transaction('settings', 'readwrite');
                tx.objectStore('settings').delete('folder_handle');
                window.fileSystemManager.dirHandle = null;
                updateStatusUI();
                this.initAsync();
            }
        };
    }

    renameFolder(id, newName) {
        const folder = this.folders.find(f => f.id === id);
        if (folder && newName.trim()) {
            folder.name = newName.trim();
            this.saveData('wb_folders', this.folders);
            this.renderSidebar();
            if (this.currentView === id) {
                this.breadcrumb.textContent = `Tomar / ${folder.name}`;
            }
        } else {
            this.renderSidebar(); // Revert UI
        }
    }

    changeFolderColor(id, color) {
        const folder = this.folders.find(f => f.id === id);
        if (folder) {
            folder.color = color;
            this.saveData('wb_folders', this.folders);
            this.renderSidebar();
        }
    }

    deleteFolder(id) {
        // Recursive folder deletion
        const getAllChildren = (folderId) => {
            let result = [folderId];
            this.folders.filter(f => f.parentId === folderId).forEach(child => {
                result = result.concat(getAllChildren(child.id));
            });
            return result;
        };

        const idsToDelete = getAllChildren(id);

        // Delete boards that are in any of these folders
        this.boards = this.boards.filter(b => !idsToDelete.includes(b.folderId));
        this.saveData('wb_boards', this.boards);

        // Delete the folders themselves
        this.folders = this.folders.filter(f => !idsToDelete.includes(f.id));
        this.saveData('wb_folders', this.folders);

        if (idsToDelete.includes(this.currentView)) {
            this.switchView('all');
        } else {
            this.renderSidebar();
            this.renderBoards();
        }
    }

    deleteFolderConfirmation(id) {
        const folder = this.folders.find(f => f.id === id);
        if (!folder) return;

        if (confirm(`'${folder.name}' klasörünü silmek istediğinize emin misiniz? (İçindeki notlar ve alt klasörler silinmez)`)) {
            this.deleteFolder(id);
        }
    }

    deleteBoardConfirmation(id) {
        const board = this.boards.find(b => b.id === id);
        if (!board) return;

        if (board.deleted) {
            if (confirm(`'${board.name}' notunu kalıcı olarak silmek istediğinize emin misiniz?`)) {
                this.deleteBoard(id);
            }
        } else {
            // Soft delete with shorter confirmation/risk
            if (confirm(`'${board.name}' notunu çöp kutusuna taşımak istediğinize emin misiniz?`)) {
                this.deleteBoard(id);
            }
        }
    }

    setupBoardDragDrop() {
        const cards = document.querySelectorAll('.board-card:not(.create-new-card)');
        cards.forEach(card => {
            card.draggable = true;
            card.ondragstart = (e) => {
                e.dataTransfer.setData('boardId', card.dataset.id);
                card.classList.add('dragging');
            };
            card.ondragend = () => card.classList.remove('dragging');
        });

        // Add drop support to folder items in sidebar
        document.querySelectorAll('.folder-item').forEach(folder => {
            folder.ondragover = (e) => {
                e.preventDefault();
                folder.classList.add('drop-target');
            };
            folder.ondragleave = () => folder.classList.remove('drop-target');
            folder.ondrop = (e) => {
                e.preventDefault();
                const boardId = e.dataTransfer.getData('boardId');
                const folderId = folder.dataset.view;
                this.moveBoardToFolder(boardId, folderId);
                folder.classList.remove('drop-target');
            };
        });
    }

    async createNewBoard() {
        console.log('createNewBoard başlatıldı');
        const id = 'b_' + Date.now();

        // Find a unique name like "Not", "Not 1", "Not 2", etc.
        const baseName = 'Not';
        let name = baseName;
        let counter = 1;
        const existingNames = this.boards.filter(b => !b.deleted).map(b => b.name.trim());

        if (existingNames.includes(baseName)) {
            while (existingNames.includes(`${baseName} ${counter}`)) {
                counter++;
            }
            name = `${baseName} ${counter}`;
        }

        const newBoard = {
            id: id,
            name: name,
            lastModified: Date.now(),
            favorite: false,
            deleted: false,
            objectCount: 0,
            preview: null,
            folderId: this.currentView.startsWith('f_') ? this.currentView : null,
            coverBg: '#4a90e2',
            coverTexture: 'linear'
        };

        this.boards.push(newBoard);
        await this.saveDataAsync('wb_boards', this.boards);

        // Refresh dashboard
        this.renderBoards();
        this.renderSidebar();
    }

    async handlePDFUpload(event) {
        const file = event.target.files[0];
        if (!file || file.type !== 'application/pdf') return;

        this.showLoading();

        const id = 'b_' + Date.now();
        const newBoard = {
            id: id,
            name: file.name,
            lastModified: Date.now(),
            favorite: false,
            deleted: false,
            objectCount: 0,
            preview: null,
            folderId: this.currentView.startsWith('f_') ? this.currentView : null,
            coverBg: '#fa5252',
            coverTexture: 'dots',
            isPDF: true
        };

        try {
            // Save to IndexedDB
            await Utils.db.save(id, file);

            this.boards.push(newBoard);
            this.saveData('wb_boards', this.boards);

            this.renderBoards();
            this.renderSidebar();

            // Optionally open immediately if you want, but per user request we stay on dashboard
            // this.loadBoard(id);

            // Clear input
            event.target.value = '';
        } catch (error) {
            console.error('Error saving PDF to IndexedDB:', error);
            alert('PDF kaydedilirken bir hata oluştu.');
        } finally {
            this.hideLoading();
        }
    }

    async loadBoard(id) {
        const board = this.boards.find(b => b.id === id);
        if (!board) return;

        this.showLoading();

        // Transition UI
        this.container.style.display = 'none';
        this.appContainer.style.display = 'flex';

        // Force resize to calculate dimensions now that app is visible
        window.dispatchEvent(new Event('resize'));

        // Use TabManager to open this board as a tab
        if (this.app.tabManager) {
            await this.app.tabManager.openBoard(id, board.name);
        } else {
            // Fallback to old behavior if TabManager not available
            this.currentBoardId = id;
            await this.loadBoardContent(id);
        }

        // Fit to width by default as requested
        if (this.app.zoomManager) {
            setTimeout(() => {
                this.app.zoomManager.fitToWidth(10);
                this.hideLoading();
            }, 100);
            this.hideLoading();
        }
    }

    async loadBoardContent(id) {
        // Clear previous PDF if any
        if (this.app.pdfManager) {
            this.app.pdfManager.clearPDF();
        }

        // Check if there is an associated PDF in IndexedDB
        try {
            const pdfBlob = await Utils.db.get(id);
            if (pdfBlob && this.app.pdfManager) {
                const pdfUrl = URL.createObjectURL(pdfBlob);
                await this.app.pdfManager.loadPDF(pdfUrl);
            }
        } catch (error) {
            console.error('Error loading PDF from DB:', error);
        }

        const savedData = await this.loadDataAsync(`wb_content_${id}`, null);
        if (savedData) {
            let pages = savedData.pages;
            const objects = savedData.objects;

            // INFLATE: Convert [x,y,p,...] back to [{x,y,p},...]
            const inflateObjects = (objs) => {
                if (!objs) return [];
                return objs.map(obj => {
                    if (obj._flat && Array.isArray(obj.points)) {
                        const inflated = [];
                        for (let i = 0; i < obj.points.length; i += 3) {
                            inflated.push({
                                x: obj.points[i],
                                y: obj.points[i + 1],
                                pressure: obj.points[i + 2]
                            });
                        }
                        obj.points = inflated;
                        delete obj._flat;
                    }
                    return obj;
                });
            };

            if (pages) {
                pages.forEach(p => p.objects = inflateObjects(p.objects));
                if (this.app.pageManager) {
                    this.app.pageManager.pages = pages;
                    this.app.pageManager.renderPageList();
                    this.app.pageManager.switchPage(0, true, false);
                    // Re-generate thumbnails since we don't save them anymore
                    setTimeout(() => this.app.pageManager.updateCurrentPageThumbnail(), 500);
                }
            } else {
                this.app.state.objects = inflateObjects(objects);
            }
        } else {
            // New board or no saved content
            this.app.state.objects = [];
            if (this.app.pageManager) {
                // If it was a PDF, pages might have been created by PDFManager.loadPDF
                if (this.app.pageManager.pages.length === 0) {
                    this.app.pageManager.pages = [{
                        id: Date.now(),
                        name: 'Sayfa 1',
                        objects: [],
                        backgroundColor: 'white',
                        backgroundPattern: 'none',
                        thumbnail: null
                    }];
                    this.app.pageManager.renderPageList();
                    // Pass false for shouldSave because it's a new board
                    this.app.pageManager.switchPage(0, true, false);
                }
            }
        }

        this.app.redrawOffscreen();
        this.app.render();
    }

    async saveCurrentBoard() {
        if (!this.currentBoardId) return;

        // Debounce actual saving to prevent file system thrashing
        if (this._saveTimeout) clearTimeout(this._saveTimeout);

        return new Promise((resolve) => {
            this._saveTimeout = setTimeout(async () => {
                // 1. Sync current page state before saving everything
                if (this.app.pageManager) {
                    this.app.pageManager.saveCurrentPageState();
                }

                // Generate preview (thumbnail)
                let preview = null;
                try {
                    preview = this.app.canvas.toDataURL('image/webp', 0.5);
                } catch (error) {
                    console.warn('Could not generate preview due to canvas tainting:', error);
                }

                // Update board meta
                const boardIndex = this.boards.findIndex(b => b.id === this.currentBoardId);
                if (boardIndex !== -1) {
                    this.boards[boardIndex].lastModified = Date.now();
                    if (preview) {
                        this.boards[boardIndex].preview = preview;
                    }
                    this.boards[boardIndex].objectCount = this.app.state.objects.length;
                    await this.saveDataAsync('wb_boards', this.boards);
                }

                // Save content
                if (this.app.pageManager) this.app.pageManager.saveCurrentPageState();

                const optimizedPages = this.app.pageManager ? this.app.pageManager.pages.map(page => {
                    const optimizedPage = Utils.deepClone(page);
                    delete optimizedPage.thumbnail; // Clear huge base64 to save MBs

                    optimizedPage.objects = optimizedPage.objects.map(obj => {
                        // Round basic props
                        if (obj.x !== undefined) obj.x = Math.round(obj.x * 10) / 10;
                        if (obj.y !== undefined) obj.y = Math.round(obj.y * 10) / 10;

                        // FLATTEN: [{x,y,p},...] -> [x,y,p, x,y,p,...]
                        if (obj.points && Array.isArray(obj.points) && !obj._flat) {
                            const simplified = Utils.simplifyPoints(obj.points, 0.5);
                            const flat = [];
                            for (const p of simplified) {
                                flat.push(Math.round(p.x * 10) / 10);
                                flat.push(Math.round(p.y * 10) / 10);
                                flat.push(p.pressure ? (Math.round(p.pressure * 10) / 10) : 0.5);
                            }
                            obj.points = flat;
                            obj._flat = true; // Mark as optimized
                        }
                        return obj;
                    });
                    return optimizedPage;
                }) : null;

                const content = {
                    version: "2.0",
                    pages: optimizedPages,
                    objects: optimizedPages ? null : Utils.deepClone(this.app.state.objects)
                };

                await this.saveDataAsync(`wb_content_${this.currentBoardId}`, content);
                resolve();
            }, 500); // 500ms debounce
        });
    }

    showDashboard() {
        this.saveCurrentBoard();

        // Keep tabs open when returning to dashboard
        // Users can close tabs manually if needed

        this.boards = this.loadData('wb_boards', []); // Refresh
        this.currentBoardId = null;
        this.container.style.display = 'flex';
        this.appContainer.style.display = 'none';
        this.renderSidebar(); // Re-render sidebar to update counts/active
        this.renderBoards();
    }

    deleteBoard(id) {
        const board = this.boards.find(b => b.id === id);
        if (board) {
            if (board.deleted) {
                // Hard delete
                this.boards = this.boards.filter(b => b.id !== id);
                localStorage.removeItem(`wb_content_${id}`);
            } else {
                // Soft delete
                board.deleted = true;
            }

            this.saveData('wb_boards', this.boards);

            // Remove from TabManager if open
            if (this.app.tabManager) {
                this.app.tabManager.closeTab(id);
            }

            this.renderBoards();
        }
    }

    emptyTrash() {
        const trashCount = this.boards.filter(b => b.deleted).length;
        if (trashCount === 0) return;

        if (confirm(`Çöp kutusundaki ${trashCount} öğeyi kalıcı olarak silmek istediğinize emin misiniz?`)) {
            // Permanently delete boards and their content
            this.boards.filter(b => b.deleted).forEach(b => {
                localStorage.removeItem(`wb_content_${b.id}`);
                // Also remove from Utils.db if it's a PDF
                if (b.isPDF) {
                    Utils.db.delete(b.id).catch(err => console.error('Error deleting PDF from DB:', err));
                }
            });

            const idsToClose = this.boards.filter(b => b.deleted).map(b => b.id);
            this.boards = this.boards.filter(b => !b.deleted);
            this.saveData('wb_boards', this.boards);

            // Remove from TabManager if open
            if (this.app.tabManager) {
                idsToClose.forEach(id => this.app.tabManager.closeTab(id));
            }

            this.renderBoards();
        }
    }

    toggleFavorite(id) {
        const board = this.boards.find(b => b.id === id);
        if (board) {
            board.favorite = !board.favorite;
            this.saveData('wb_boards', this.boards);
            this.renderBoards();
        }
    }

    renameBoard(id, newName) {
        const board = this.boards.find(b => b.id === id);
        if (board && newName.trim()) {
            board.name = newName.trim();
            this.saveData('wb_boards', this.boards);

            // Update tab title if this board is open in a tab
            if (this.app.tabManager) {
                this.app.tabManager.updateTabTitle(id, newName.trim());
            }
        }
    }

    moveBoardToFolder(boardId, folderId) {
        const board = this.boards.find(b => b.id === boardId);
        if (board) {
            board.folderId = folderId || null;
            this.saveData('wb_boards', this.boards);
            this.renderBoards();
        }
    }

    updateBoardShape(boardId, shape) {
        const board = this.boards.find(b => b.id === boardId);
        if (board) {
            board.shape = shape;
            this.saveData('wb_boards', this.boards);
            this.renderBoards();
        }
    }

    setupAppNavigation() {
        const logo = document.getElementById('btnHome');
        if (logo) {
            logo.style.pointerEvents = 'auto'; // Force enable
            logo.onclick = () => this.showDashboard();
        }

        const handleSave = () => {
            this.saveCurrentBoard();
            alert('Beyaz tahta kaydedildi!');
            const dropdown = document.getElementById('appMenuDropdown');
            if (dropdown) dropdown.classList.remove('show');
        };

        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) saveBtn.onclick = handleSave;

        const menuSave = document.getElementById('menuSave');
        if (menuSave) menuSave.onclick = handleSave;
    }

    setupViewOptions() {
        const trigger = document.getElementById('btnViewOptions');
        const dropdown = document.getElementById('viewOptionsDropdown');

        if (trigger && dropdown) {
            trigger.onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('show');
            };

            // Size buttons
            dropdown.querySelectorAll('.size-btn').forEach(btn => {
                btn.onclick = () => {
                    this.viewSettings.gridSize = btn.dataset.size;
                    this.saveData('wb_view_settings', this.viewSettings);
                    this.applyViewSettings();

                    dropdown.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                };

                if (btn.dataset.size === this.viewSettings.gridSize) {
                    btn.classList.add('active');
                }
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.view-options-container')) {
                    dropdown.classList.remove('show');
                }
            });
        }
    }

    setupSearch() {
        const handleSearch = (e) => {
            this.searchTerm = e.target.value.toLowerCase().trim();
            const hasTerm = this.searchTerm.length > 0;
            if (this.searchClearBtn) this.searchClearBtn.style.display = hasTerm ? 'block' : 'none';
            if (this.mobileSearchClearBtn) this.mobileSearchClearBtn.style.display = hasTerm ? 'block' : 'none';
            this.renderBoards();
        };

        if (this.searchInput) this.searchInput.oninput = handleSearch;
        if (this.mobileSearchInput) this.mobileSearchInput.oninput = handleSearch;

        if (this.searchClearBtn) this.searchClearBtn.onclick = () => this.clearSearch();
        if (this.mobileSearchClearBtn) this.mobileSearchClearBtn.onclick = () => this.clearSearch();
    }

    clearSearch() {
        this.searchTerm = '';
        if (this.searchInput) this.searchInput.value = '';
        if (this.mobileSearchInput) this.mobileSearchInput.value = '';
        if (this.searchClearBtn) this.searchClearBtn.style.display = 'none';
        if (this.mobileSearchClearBtn) this.mobileSearchClearBtn.style.display = 'none';
        this.renderBoards();
    }

    applyViewSettings() {
        if (!this.boardGrid) return;

        // Reset classes
        this.boardGrid.classList.remove('size-mini', 'size-xsmall', 'size-small', 'size-medium', 'size-large');

        // Apply new classes
        this.boardGrid.classList.add(`size-${this.viewSettings.gridSize}`);
    }

    setupCoverModal() {
        const modal = document.getElementById('coverModal');
        const grid = document.getElementById('coverGrid');
        const closeBtn = document.getElementById('btnCloseCoverModal');
        const addBtn = document.getElementById('btnAddCustomCover');
        const colorInput = document.getElementById('customCoverColor');
        const uploadBtn = document.getElementById('btnUploadCoverImage');
        const fileInput = document.getElementById('customCoverImage');

        if (!modal || !grid || !addBtn || !colorInput) return;

        if (closeBtn) closeBtn.onclick = () => modal.classList.remove('show');
        modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('show'); };

        addBtn.onclick = () => {
            try {
                const color = colorInput.value;
                if (!color) return;

                const newCover = { id: 'custom_' + Date.now(), bg: color, texture: 'linear' };
                this.customCovers = Array.isArray(this.customCovers) ? this.customCovers : [];
                this.customCovers.unshift(newCover);
                this.saveData('wb_custom_covers', this.customCovers);

                if (this.activeBoardForCover) {
                    const board = (this.boards || []).find(b => b.id === this.activeBoardForCover);
                    if (board) {
                        board.coverBg = color;
                        board.coverTexture = 'linear';
                        delete board.coverImage; // Remove image if color selected
                        this.saveData('wb_boards', this.boards);
                        this.renderBoards();
                    }
                } else if (this.selectedBoards && this.selectedBoards.size > 0) {
                    // Bulk mode custom color apply
                    this.selectedBoards.forEach(selId => {
                        const board = (this.boards || []).find(b => b.id === selId);
                        if (board) {
                            board.coverBg = color;
                            board.coverTexture = 'linear';
                            delete board.coverImage;
                        }
                    });
                    this.saveData('wb_boards', this.boards);
                    this.renderBoards();
                    this.clearSelection();
                }
                modal.classList.remove('show');
            } catch (err) {
                console.error('Error in addBtn click handler:', err);
                modal.classList.remove('show');
            }

        };

        if (uploadBtn && fileInput) {
            uploadBtn.onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (re) => {
                    const dataUrl = re.target.result;

                    // Compress image before saving
                    this.compressImage(dataUrl, (compressedUrl) => {
                        const newCover = { id: 'img_' + Date.now(), bg: '#ffffff', image: compressedUrl };
                        this.customCovers = Array.isArray(this.customCovers) ? this.customCovers : [];
                        this.customCovers.unshift(newCover);
                        this.saveData('wb_custom_covers', this.customCovers);

                        if (this.activeBoardForCover) {
                            const board = (this.boards || []).find(b => b.id === this.activeBoardForCover);
                            if (board) {
                                board.coverBg = '#ffffff';
                                board.coverImage = compressedUrl;
                                this.saveData('wb_boards', this.boards);
                                this.renderBoards();
                            }
                        } else if (this.selectedBoards && this.selectedBoards.size > 0) {
                            // Bulk mode custom image apply
                            this.selectedBoards.forEach(selId => {
                                const board = (this.boards || []).find(b => b.id === selId);
                                if (board) {
                                    board.coverBg = '#ffffff';
                                    board.coverImage = compressedUrl;
                                }
                            });
                            this.saveData('wb_boards', this.boards);
                            this.renderBoards();
                            this.clearSelection();
                        }
                        modal.classList.remove('show');
                        fileInput.value = ''; // Reset
                    });
                };

                reader.readAsDataURL(file);
            };
        }
    }

    compressImage(dataUrl, callback) {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDimension = 400;

            if (width > height) {
                if (width > maxDimension) {
                    height *= maxDimension / width;
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width *= maxDimension / height;
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Use JPEG with 0.7 quality to save substantial space
            callback(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = dataUrl;
    }

    openCoverPicker(boardId) {
        this.activeBoardForCover = boardId;
        const modal = document.getElementById('coverModal');

        if (modal) {
            modal.classList.add('show');
            this.renderCoverGrid(boardId);
        } else {
            console.error('Notebook cover modal not found');
        }
    }


    renderCoverGrid(boardId) {
        const grid = document.getElementById('coverGrid');
        const isBulk = !boardId;

        let board = null;
        if (!isBulk) {
            // Use == for type safety (string vs number)
            board = (this.boards || []).find(b => b.id == boardId);
            if (!board) return;
        }
        // Note: In bulk mode, we allow rendering even if selectedBoards is empty
        // User might select boards after opening the modal

        if (!grid) return;
        grid.innerHTML = '';

        const allCovers = [
            ...this.defaultCovers.map(c => ({ ...c, isDefault: true })),
            ...this.customCovers.map(c => ({ ...c, isDefault: false }))
        ];

        allCovers.forEach(cover => {
            const item = document.createElement('div');
            item.className = 'cover-item';

            const isImage = !!cover.image;
            if (!isImage && cover.texture) {
                item.classList.add(`cover-texture-${cover.texture}`);
            }

            if (isImage) {
                item.style.backgroundImage = `url(${cover.image})`;
                item.style.backgroundSize = 'cover';
                item.style.backgroundPosition = 'center';
            } else {
                item.style.backgroundColor = cover.bg;
            }

            // Check active state
            if (!isBulk && board) {
                if (isImage) {
                    if (board.coverImage === cover.image) item.classList.add('active');
                } else {
                    if (board.coverBg === cover.bg && !board.coverImage) item.classList.add('active');
                }
            }

            item.innerHTML = '<div class="mini-spine"></div>' +
                (!cover.isDefault ? `<div class="cover-item-delete" title="Sil">×</div>` : '');

            item.onclick = (e) => {
                // If it's a delete click, the handler below will deal with it
                if (e.target.classList.contains('cover-item-delete')) return;

                console.log('Cover clicked:', cover);
                console.log('isBulk:', isBulk);
                console.log('selectedBoards:', this.selectedBoards);

                const applyCoverToBoard = (target) => {
                    console.log('Applying cover to board:', target.id, 'Cover:', cover);
                    if (isImage) {
                        target.coverBg = '#ffffff';
                        target.coverImage = cover.image;
                        target.coverTexture = 'none';
                    } else {
                        target.coverBg = cover.bg;
                        target.coverTexture = cover.texture || 'linear';
                        target.coverImage = null;
                    }
                    console.log('Board after cover applied:', target);
                };

                if (isBulk) {
                    console.log('Bulk mode - applying to selected boards');
                    this.selectedBoards.forEach(selId => {
                        const targetBoard = this.boards.find(b => b.id == selId);
                        console.log('Found board for ID', selId, ':', targetBoard);
                        if (targetBoard) applyCoverToBoard(targetBoard);
                    });
                } else {
                    console.log('Single mode - applying to board:', board);
                    if (board) applyCoverToBoard(board);
                }

                // CRITICAL: Save BEFORE clearing selection (which triggers render)
                console.log('Saving boards:', this.boards);
                this.saveData('wb_boards', this.boards);

                // Close modal
                document.getElementById('coverModal').classList.remove('show');

                // Clear selection (this will call renderBoards internally)
                if (isBulk) {
                    this.clearSelection();
                } else {
                    this.renderBoards();
                }
            };

            // Set up delete handler
            if (!cover.isDefault) {
                item.querySelector('.cover-item-delete').onclick = (e) => {
                    e.stopPropagation();
                    this.customCovers = this.customCovers.filter(c => c.id !== cover.id);
                    this.saveData('wb_custom_covers', this.customCovers);
                    this.renderCoverGrid(boardId);
                };
            }

            grid.appendChild(item);
        });
    }

    /**
     * Template Gallery Methods
     */
    openTemplateGallery() {
        const modal = document.getElementById('templateGalleryModal');
        if (!modal) return;

        modal.style.display = 'flex';
        this.renderTemplateGallery();
        this.setupTemplateGalleryHandlers();
    }

    closeTemplateGallery() {
        const modal = document.getElementById('templateGalleryModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    setupTemplateGalleryHandlers() {
        // Close button
        const closeBtn = document.getElementById('btnCloseTemplateModal');
        if (closeBtn) {
            closeBtn.onclick = () => this.closeTemplateGallery();
        }

        // Overlay click
        const overlay = document.querySelector('.template-modal-overlay');
        if (overlay) {
            overlay.onclick = () => this.closeTemplateGallery();
        }

        // Tab filtering
        document.querySelectorAll('.template-tab').forEach(tab => {
            tab.onclick = () => {
                // Remove active from all tabs
                document.querySelectorAll('.template-tab').forEach(t => t.classList.remove('active'));
                // Add active to clicked tab
                tab.classList.add('active');

                const category = tab.dataset.category;
                this.renderTemplateGallery(category);
            };
        });

        // Search
        const searchInput = document.getElementById('templateSearchInput');
        if (searchInput) {
            searchInput.oninput = (e) => {
                const query = e.target.value;
                // If searching, show all categories
                this.renderTemplateGallery('Tümü', query);
            };
        }

        // ESC key to close
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeTemplateGallery();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    /**
    * Show confirmation dialog
    */
    showConfirmDialog({ title, message, confirmText = 'Onayla', confirmClass = 'btn-danger', onConfirm, onCancel }) {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-dialog-overlay';
        overlay.innerHTML = `
            <div class="confirm-dialog">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirm-dialog-actions">
                    <button class="btn-cancel">İptal</button>
                    <button class="${confirmClass}">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const dialog = overlay.querySelector('.confirm-dialog');
        const cancelBtn = overlay.querySelector('.btn-cancel');
        const confirmBtn = overlay.querySelector(`.${confirmClass}`);

        cancelBtn.onclick = () => {
            overlay.remove();
            if (onCancel) onCancel();
        };

        confirmBtn.onclick = () => {
            overlay.remove();
            if (onConfirm) onConfirm();
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.remove();
                if (onCancel) onCancel();
            }
        };
    }

    /**
     * Show undo toast notification
     */
    showUndoToast(message, undoCallback) {
        const toast = document.createElement('div');
        toast.className = 'undo-toast';
        toast.innerHTML = `
            <span>${message}</span>
            <button class="btn-undo">Geri Al</button>
        `;
        document.body.appendChild(toast);

        const undoBtn = toast.querySelector('.btn-undo');
        let undoClicked = false;

        undoBtn.onclick = () => {
            undoClicked = true;
            undoCallback();
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        };

        setTimeout(() => toast.classList.add('show'), 10);

        setTimeout(() => {
            if (!undoClicked) {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }

    renderTemplateGallery(category = 'Tümü', searchQuery = '') {
        const grid = document.getElementById('templateGrid');
        if (!grid || !this.app.templateManager) return;

        let templates = [];

        if (searchQuery) {
            templates = this.app.templateManager.searchTemplates(searchQuery);
        } else if (category === 'Favoriler') {
            // Show only favorite templates
            const favoriteIds = this.app.templateManager.favoriteTemplates || [];
            templates = this.app.templateManager.templates.filter(t => favoriteIds.includes(t.id));
        } else if (category && category !== 'Tümü') {
            templates = this.app.templateManager.getTemplatesByCategory(category);
        } else {
            templates = this.app.templateManager.templates;
        }

        grid.innerHTML = '';

        if (templates.length === 0) {
            let emptyMessage, emptyHint, emptyIcon, showButton = false, buttonText = '', buttonAction = null;

            if (category === 'Favoriler') {
                emptyIcon = '⭐';
                emptyMessage = 'Henüz favori şablon eklemediniz';
                emptyHint = 'Şablonları favorilere eklemek için kalp ikonuna tıklayın';
                showButton = true;
                buttonText = 'Tüm Şablonları Gör';
                buttonAction = () => {
                    document.querySelector('[data-category="Tümü"]')?.click();
                };
            } else if (category === 'Kendi Şablonlarım') {
                emptyIcon = '📝';
                emptyMessage = 'Henüz kayıtlı şablonunuz yok';
                emptyHint = 'Bir şablon oluşturmak için:<br>1. İstediğiniz bir notu açın<br>2. Menüden "Şablon Olarak Kaydet" seçin';
                showButton = true;
                buttonText = 'Hazır Şablonlara Göz At';
                buttonAction = () => {
                    document.querySelector('[data-category="Tümü"]')?.click();
                };
            } else if (searchQuery) {
                emptyIcon = '🔍';
                emptyMessage = `"${searchQuery}" ile eşleşen şablon bulunamadı`;
                emptyHint = 'Arama kriterlerinizi değiştirmeyi deneyin';
            } else {
                emptyIcon = '📋';
                emptyMessage = 'Şablon bulunamadı';
                emptyHint = 'Bu kategoride henüz şablon bulunmuyor';
            }

            grid.innerHTML = `
                <div class="template-empty-state">
                    <div class="empty-icon">${emptyIcon}</div>
                    <h3>${emptyMessage}</h3>
                    <p>${emptyHint}</p>
                    ${showButton ? `<button class="btn" id="emptyStateAction">${buttonText}</button>` : ''}
                </div>
            `;

            if (showButton && buttonAction) {
                const btn = grid.querySelector('#emptyStateAction');
                if (btn) btn.onclick = buttonAction;
            }
            return;
        }

        templates.forEach(template => {
            const isFavorite = this.app.templateManager.favoriteTemplates.includes(template.id);
            const isUserTemplate = template.isUserTemplate || false;

            const card = document.createElement('div');
            card.className = 'template-card';
            card.innerHTML = `
                <div class="template-thumbnail" style="${template.thumbnail ? `background-image: url(${template.thumbnail}); background-size: cover; background-position: center;` : ''}">
                    ${!template.thumbnail ? '<div style="font-size: 48px; opacity: 0.3;">📋</div>' : ''}
                </div>
                <button class="template-favorite-btn ${isFavorite ? 'active' : ''}" data-template-id="${template.id}">
                    <svg viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                </button>
                ${isUserTemplate ? `
                <button class="template-delete-btn" data-template-id="${template.id}" title="Şablonu Sil">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
                ` : ''}
                <div class="template-info">
                    <div class="template-name">${template.name}</div>
                    <div class="template-description">${template.description}</div>
                    <span class="template-category-badge">${template.category}</span>
                </div>
            `;

            // Apply template on click
            card.onclick = (e) => {
                if (e.target.closest('.template-favorite-btn') || e.target.closest('.template-delete-btn')) return;
                this.applyTemplateAndCreateBoard(template.id);
            };

            // Favorite toggle
            const favoriteBtn = card.querySelector('.template-favorite-btn');
            favoriteBtn.onclick = (e) => {
                e.stopPropagation();
                this.app.templateManager.toggleFavorite(template.id);
                this.renderTemplateGallery(category, searchQuery);
            };

            // Delete button (for user templates) - WITH CONFIRMATION
            const deleteBtn = card.querySelector('.template-delete-btn');
            if (deleteBtn) {
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();

                    // Show confirmation dialog
                    this.showConfirmDialog({
                        title: 'Şablonu Sil',
                        message: `"${template.name}" şablonunu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
                        confirmText: 'Sil',
                        confirmClass: 'btn-danger',
                        onConfirm: () => {
                            // Store template data for undo
                            const templateData = { ...template };

                            const success = this.app.templateManager.deleteUserTemplate(template.id);
                            if (success) {
                                // Show undo toast
                                this.showUndoToast('Şablon silindi', () => {
                                    // Restore template
                                    this.app.templateManager.templates.push(templateData);
                                    this.app.templateManager.saveTemplates();
                                    this.renderTemplateGallery(category, searchQuery);
                                });

                                this.renderTemplateGallery(category, searchQuery);
                            }
                        }
                    });
                };
            }

            grid.appendChild(card);
        });
    }


    async applyTemplateAndCreateBoard(templateId) {
        // Create a new board first
        const id = 'b_' + Date.now();
        const template = this.app.templateManager.templates.find(t => t.id === templateId);

        const newBoard = {
            id: id,
            name: template ? template.name : 'Yeni Not',
            lastModified: Date.now(),
            favorite: false,
            deleted: false,
            objectCount: 0,
            preview: null,
            folderId: this.currentView.startsWith('f_') ? this.currentView : null,
            coverBg: '#4a90e2',
            coverTexture: 'linear'
        };

        this.boards.push(newBoard);
        this.saveData('wb_boards', this.boards);

        // Close template gallery
        this.closeTemplateGallery();

        // Load the board (now async)
        await this.loadBoard(id);

        // Apply template immediately after board is loaded
        if (this.app.templateManager) {
            this.app.templateManager.applyTemplate(templateId);
        }
    }
    setupBulkActions() {
        this.bulkToolbar = document.getElementById('bulkActionsToolbar');

        document.getElementById('btnBulkCancel')?.addEventListener('click', () => this.clearSelection());

        document.getElementById('btnBulkDelete')?.addEventListener('click', () => {
            if (confirm(`${this.selectedBoards.size} notu silmek istediğinize emin misiniz?`)) {
                this.selectedBoards.forEach(id => this.deleteBoard(id));
                this.clearSelection();
            }
        });

        document.getElementById('btnBulkFavorite')?.addEventListener('click', () => {
            this.selectedBoards.forEach(id => this.toggleFavorite(id));
            this.clearSelection();
        });

        // Kapak Değiştir - Opens cover picker modal immediately
        document.getElementById('btnBulkChangeCover')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openCoverPicker(null); // Null indicates bulk mode
        });

        // Taşı - Opens folder picker modal immediately
        document.getElementById('btnBulkMove')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showFolderPicker((folderId) => {
                const folderIdFinal = folderId === "" ? null : folderId;
                this.selectedBoards.forEach(id => {
                    const board = this.boards.find(b => b.id === id);
                    if (board) board.folderId = folderIdFinal;
                });
                this.saveData('wb_boards', this.boards);
                this.clearSelection();
            });
        });
    }

    toggleBoardSelection(id, isSelected) {
        if (isSelected) {
            this.selectedBoards.add(id);
        } else {
            this.selectedBoards.delete(id);
        }

        // Update UI
        const card = document.querySelector(`.board-card[data-id="${id}"]`);
        if (card) {
            const checkbox = card.querySelector('.board-checkbox');
            if (checkbox) checkbox.checked = isSelected;

            if (isSelected) card.classList.add('selected');
            else card.classList.remove('selected');
        }

        this.updateBulkToolbar();
    }

    clearSelection() {
        this.selectedBoards.clear();
        this.renderBoards(); // Re-render to clear visual states
        this.updateBulkToolbar();
    }

    updateBulkToolbar() {
        if (!this.bulkToolbar) return;

        const count = this.selectedBoards.size;
        this.bulkToolbar.style.display = count > 0 ? 'flex' : 'none';
        this.bulkToolbar.querySelector('.selected-count').textContent = `${count} not seçildi`;
    }

    showFolderPicker(callback) {
        // Ensure folders are up to date
        this.folders = this.loadData('wb_folders', []);

        const overlay = document.createElement('div');
        overlay.className = 'confirm-dialog-overlay';
        overlay.style.zIndex = '10001'; // Ensure it's above dashboard (9000)

        const modal = document.createElement('div');
        modal.className = 'confirm-dialog';
        modal.style.maxWidth = '400px';

        let html = `
            <h3>Klasör Seç</h3>
            <p style="margin-bottom: 16px; color: #666;">Notları taşımak istediğiniz klasörü seçin</p>
            <div style="max-height: 300px; overflow-y: auto; margin-bottom: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <div class="folder-picker-item" data-id="" style="padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.2s; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 18px;">📁</span>
                    <span>Kök Dizin</span>
                </div>
        `;

        const renderOptions = (parentId = null, level = 0) => {
            const children = this.folders.filter(f => (f.parentId || null) === parentId);
            children.forEach(f => {
                const paddingLeft = 16 + (level * 24);
                html += `
                    <div class="folder-picker-item" data-id="${f.id}" style="padding: 12px 16px; padding-left: ${paddingLeft}px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.2s; display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 18px; ${level > 0 ? 'opacity: 0.7;' : ''}">${level > 0 ? '↳ 📁' : '📁'}</span>
                        <div style="display: flex; flex-direction: column; overflow: hidden;">
                            <span style="font-weight: ${level === 0 ? '600' : '500'}; font-size: ${14 - (level * 0.5)}px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${f.name}</span>
                        </div>
                    </div>
                `;
                renderOptions(f.id, level + 1);
            });
        };

        renderOptions();

        html += `
            </div>
            <div class="confirm-dialog-actions">
                <button class="btn-cancel">İptal</button>
            </div>
        `;

        modal.innerHTML = html;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Add hover effects
        modal.querySelectorAll('.folder-picker-item').forEach(item => {
            item.onmouseover = () => item.style.background = '#f8f9fa';
            item.onmouseout = () => item.style.background = 'white';
            item.onclick = () => {
                callback(item.dataset.id || null);
                overlay.remove();
            };
        });

        // Cancel button
        modal.querySelector('.btn-cancel').onclick = () => overlay.remove();

        // Click outside to close
        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
        };
    }

    setupSelectAll() {
        if (this.btnSelectAll) {
            this.btnSelectAll.onclick = () => this.toggleSelectAll();
        }
        if (this.btnSelectAllMobile) {
            this.btnSelectAllMobile.onclick = () => this.toggleSelectAll();
        }
    }

    getFilteredBoards() {
        // Refresh data to ensure we have latest states
        const loadedBoards = this.loadData('wb_boards', []);
        this.boards = Array.isArray(loadedBoards) ? loadedBoards : [];

        let filtered = [];

        if (this.currentView === 'trash') {
            filtered = this.boards.filter(b => b.deleted);
        } else {
            // Base filter: non-deleted
            let base = this.boards.filter(b => !b.deleted);

            if (this.currentView === 'all') {
                filtered = base;
            } else if (this.currentView === 'recent') {
                filtered = [...base].sort((a, b) => b.lastModified - a.lastModified);
            } else if (this.currentView === 'favorites') {
                filtered = base.filter(b => b.favorite);
            } else if (this.currentView.startsWith('f_')) {
                filtered = base.filter(b => b.folderId === this.currentView);
            } else {
                filtered = base;
            }
        }

        // Apply Search Filter
        if (this.searchTerm) {
            filtered = filtered.filter(b => b.name.toLowerCase().includes(this.searchTerm));
        }

        return filtered;
    }

    toggleSelectAll() {
        const filtered = this.getFilteredBoards();
        if (filtered.length === 0) return;

        const allSelected = filtered.every(b => this.selectedBoards.has(b.id));

        if (allSelected) {
            this.clearSelection();
        } else {
            this.selectAll(filtered);
        }
    }

    selectAll(boardsToSelect) {
        boardsToSelect.forEach(b => this.selectedBoards.add(b.id));
        this.renderBoards();
        this.updateBulkToolbar();
    }

    updateSelectAllButtonState(filteredBoards) {
        const desktopBtn = this.btnSelectAll;
        const mobileBtn = this.btnSelectAllMobile;
        if (!desktopBtn && !mobileBtn) return;

        const filtered = filteredBoards || this.getFilteredBoards();
        const noItems = filtered.length === 0;

        [desktopBtn, mobileBtn].forEach(btn => {
            if (!btn) return;
            if (noItems) {
                btn.style.opacity = '0.3';
                btn.style.pointerEvents = 'none';
                btn.title = "Seçilecek not yok";
            } else {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            }
        });

        if (noItems) return;

        const allSelected = filtered.every(b => this.selectedBoards.has(b.id));

        [desktopBtn, mobileBtn].forEach(btn => {
            if (!btn) return;
            if (allSelected) {
                btn.classList.add('active');
                btn.title = "Seçimi Temizle (Ctrl+A)";
            } else {
                btn.classList.remove('active');
                btn.title = "Tümünü Seç (Ctrl+A)";
            }
        });
    }
}
