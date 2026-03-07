/**
 * FileSystemManager - Handles persistent storage using IndexedDB (via Dexie.js)
 * This is a Local-First architecture, suitable for iPad/Mobile and Desktop.
 * Native File System Access API is now an optional backup/sync destination.
 */
class FileSystemManager {
    constructor() {
        this.mode = 'indexeddb';
        this.db = null;
        this._initialized = false;
        this.onStorageChange = null;
        this.dirHandle = null;
    }

    async init() {
        if (this._initialized) return;

        // Initialize Dexie
        this.db = new Dexie("TomarDB");
        this.db.version(1).stores({
            settings: 'key',
            data: 'key'
        });

        // Version 2: Add metadata for cloud sync if needed
        this.db.version(2).stores({
            settings: 'key',
            data: 'key',
            syncMetadata: 'id' // { id, lastModifiedLocally, googleDriveFileId, lastSyncedTime }
        }).upgrade(tx => {
            // Future migrations
        });

        await this.db.open();

        // 3. Request persistent storage (crucial for iPad/Safari)
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persist();
            console.log(`[FileSystemManager] Persistent storage: ${isPersisted}`);
        }

        // Check for stored native handle (legacy or optional backup)
        if (window.showDirectoryPicker) {
            const savedHandle = await this.db.settings.get('folder_handle');
            if (savedHandle) {
                this.storedHandle = savedHandle.value;
                if (await this._verifyPermission(this.storedHandle)) {
                    this.dirHandle = this.storedHandle;
                    this.mode = 'native';
                }
            }
        }

        this._initialized = true;
        console.log(`[FileSystemManager] Initialized in ${this.mode} mode.`);

        // Initial sync from localStorage if first time
        await this._checkInitialMigration();
    }

    async _checkInitialMigration() {
        const migrated = await this.db.settings.get('migrated_from_local');
        if (!migrated) {
            console.log('[FileSystemManager] Performing initial migration from localStorage...');
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('wb_') || key.startsWith('tomar_')) {
                    try {
                        const val = JSON.parse(localStorage.getItem(key));
                        await this.saveItem(key, val, true); // skip sync during migration
                    } catch (e) {
                        // Not JSON, skip
                    }
                }
            }
            await this.db.settings.put({ key: 'migrated_from_local', value: true });
        }
    }

    async _verifyPermission(handle) {
        try {
            const options = { mode: 'readwrite' };
            return (await handle.queryPermission(options)) === 'granted';
        } catch (e) { return false; }
    }

    async requestStoredPermission() {
        if (!this.storedHandle) return false;
        try {
            const status = await this.storedHandle.requestPermission({ mode: 'readwrite' });
            if (status === 'granted') {
                this.dirHandle = this.storedHandle;
                this.mode = 'native';
                if (this.onStorageChange) this.onStorageChange();
                return true;
            }
            return false;
        } catch (e) { return false; }
    }

    async pickStorageFolder() {
        if (!window.showDirectoryPicker) {
            alert('Tarayıcınız yerel klasör erişimini desteklemiyor. Dexie/IndexedDB kullanılmaya devam edilecek.');
            return false;
        }
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await this.db.settings.put({ key: 'folder_handle', value: handle });
            this.dirHandle = handle;
            this.storedHandle = handle;
            this.mode = 'native';

            // Sync current items to NEW folder
            await this.syncToFolder();

            if (this.onStorageChange) this.onStorageChange();
            return true;
        } catch (e) { return false; }
    }

    async syncToFolder() {
        if (!this.dirHandle) return;
        const allData = await this.db.data.toArray();
        for (const item of allData) {
            await this._saveToNative(item.key, item.value);
        }
    }

    async saveItem(key, value, skipNative = false) {
        // 1. Always save to Dexie (Primary)
        await this.db.data.put({ key, value });

        // 2. Metadata update for sync (if it's a board or board content)
        if (key.startsWith('wb_content_')) {
            const boardId = key.replace('wb_content_', '');
            await this.updateSyncMetadata(boardId);
        }

        // 3. Mirror to LocalStorage for legacy sync access (optional, but keeps app working)
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { }

        // 4. Save to Native folder if active
        if (!skipNative && this.mode === 'native' && this.dirHandle) {
            await this._saveToNative(key, value);
        }
    }

    async _saveToNative(key, value) {
        try {
            const fileHandle = await this.dirHandle.getFileHandle(`${key}.json`, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(value));
            await writable.close();
        } catch (e) {
            console.warn('[FileSystemManager] Native save failed, using IndexedDB only.');
        }
    }

    async getItem(key, defaultValue) {
        // Try Dexie first
        const item = await this.db.data.get(key);
        if (item !== undefined) {
            // Also update localStorage mirror
            localStorage.setItem(key, JSON.stringify(item.value));
            return item.value;
        }

        // Fallback to legacy LocalStorage if not in Dexie (unlikely after migration)
        const local = localStorage.getItem(key);
        if (local) {
            const val = JSON.parse(local);
            await this.db.data.put({ key, value: val });
            return val;
        }

        return defaultValue;
    }

    async removeItem(key) {
        await this.db.data.delete(key);
        localStorage.removeItem(key);
        if (this.mode === 'native' && this.dirHandle) {
            try {
                await this.dirHandle.removeEntry(`${key}.json`);
            } catch (e) { }
        }
    }

    // --- Sync Metadata Helpers ---
    async updateSyncMetadata(boardId) {
        const meta = await this.db.syncMetadata.get(boardId) || {
            id: boardId,
            googleDriveFileId: null,
            lastSyncedTime: 0
        };
        meta.lastModifiedLocally = Date.now();
        await this.db.syncMetadata.put(meta);
    }

    async getSyncMetadata(boardId) {
        return await this.db.syncMetadata.get(boardId);
    }

    async setSyncMetadata(boardId, data) {
        const current = await this.getSyncMetadata(boardId) || { id: boardId };
        await this.db.syncMetadata.put({ ...current, ...data });
    }
}

window.fileSystemManager = new FileSystemManager();
