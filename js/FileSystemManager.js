/**
 * FileSystemManager - Handles persistent storage using local folders (File System Access API)
 * or falls back to IndexedDB for universal support (Firefox, Safari, Mobile).
 */
class FileSystemManager {
    constructor() {
        this.mode = 'native'; // 'native' (folder) or 'indexeddb' (fallback)
        this.dirHandle = null;
        this.db = null;
        this._initialized = false;
        this.onStorageChange = null;
    }

    async init() {
        if (this._initialized) return;

        // 1. Check if Native File System is supported
        if (!window.showDirectoryPicker) {
            this.mode = 'indexeddb';
        }

        // 2. Initialize Internal DB to store the folder handle (so user doesn't pick every time)
        this.db = await this._initMetaDB();

        if (this.mode === 'native') {
            const savedHandle = await this._getStoredHandle();
            if (savedHandle) {
                this.storedHandle = savedHandle; // Keep it even if permission is not granted yet
                // Check if we still have permission
                if (await this._verifyPermission(savedHandle)) {
                    this.dirHandle = savedHandle;
                }
            }
        }

        this._initialized = true;
        console.log(`Storage initialized in [${this.mode}] mode.`);
    }

    async _initMetaDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('wb_storage_meta', 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
                if (!db.objectStoreNames.contains('fallback_data')) db.createObjectStore('fallback_data');
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.error);
        });
    }

    async _getStoredHandle() {
        return new Promise((resolve) => {
            const tx = this.db.transaction('settings', 'readonly');
            const req = tx.objectStore('settings').get('folder_handle');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    }

    async _verifyPermission(handle) {
        const options = { mode: 'readwrite' };
        if ((await handle.queryPermission(options)) === 'granted') return true;
        // We don't call requestPermission here automatically as it needs user gesture
        return false;
    }

    /**
     * Re-requests permission for a stored handle.
     * Must be called from a user gesture.
     */
    async requestStoredPermission() {
        if (!this.storedHandle) return false;

        try {
            const options = { mode: 'readwrite' };
            const status = await this.storedHandle.requestPermission(options);
            if (status === 'granted') {
                this.dirHandle = this.storedHandle;
                if (this.onStorageChange) this.onStorageChange();
                return true;
            }
            return false;
        } catch (e) {
            console.error('Permission request failed', e);
            return false;
        }
    }

    /**
     * Triggers the folder picker dialog
     */
    async pickStorageFolder() {
        if (this.mode === 'indexeddb') {
            alert('Tarayıcınız yerel klasör erişimini desteklemiyor. Verileriniz güvenli bir şekilde tarayıcı veritabanında (IndexedDB) tutulmaya devam edecek.');
            return false;
        }

        // If we already have a stored handle but no permission, try to request it first
        if (this.storedHandle && !this.dirHandle) {
            const success = await this.requestStoredPermission();
            if (success) return true;
        }

        try {
            const handle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });

            // Store handle in MetaDB
            const tx = this.db.transaction('settings', 'readwrite');
            tx.objectStore('settings').put(handle, 'folder_handle');

            this.dirHandle = handle;
            this.storedHandle = handle;

            // Sync current items if user switched to a folder
            await this.syncFromLocalStorageToFolder();

            if (this.onStorageChange) this.onStorageChange();
            return true;
        } catch (e) {
            console.error('Folder pick failed', e);
            return false;
        }
    }

    async syncFromLocalStorageToFolder() {
        if (!this.dirHandle) return;

        // Keys to sync
        const keys = ['wb_boards', 'wb_folders', 'wb_view_settings', 'wb_expanded_folders'];
        for (const key of keys) {
            const val = localStorage.getItem(key);
            if (val) await this.saveItem(key, JSON.parse(val));
        }

        // Boards content
        const boards = JSON.parse(localStorage.getItem('wb_boards') || '[]');
        for (const b of boards) {
            const contentKey = `wb_content_${b.id}`;
            const content = localStorage.getItem(contentKey);
            if (content) await this.saveItem(contentKey, JSON.parse(content));
        }
    }

    async saveItem(key, value) {
        // ALWAYS update localStorage as a synchronous bridge for legacy parts of the app
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn('LocalStorage mirror failed');
        }

        if (this.mode === 'native' && this.dirHandle) {
            try {
                const fileName = `${key}.json`;
                const fileHandle = await this.dirHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(value));
                await writable.close();
                return;
            } catch (e) {
                console.error('Native save failed', e);
            }
        }

        // Fallback to IndexedDB
        return new Promise((resolve) => {
            const tx = this.db.transaction('fallback_data', 'readwrite');
            tx.objectStore('fallback_data').put(value, key);
            tx.oncomplete = () => resolve();
        });
    }

    async getItem(key, defaultValue) {
        // 1. Try LocalStorage first for instant (sync) result
        const local = localStorage.getItem(key);
        let finalVal = local ? JSON.parse(local) : defaultValue;

        // 2. Refresh from Native Folder/IndexedDB in background or if local is empty
        if (this.mode === 'native' && this.dirHandle) {
            try {
                const fileHandle = await this.dirHandle.getFileHandle(`${key}.json`);
                const file = await fileHandle.getFile();
                const text = await file.text();
                const nativeVal = JSON.parse(text);
                // Sync back to local if they differ
                if (text !== local) {
                    localStorage.setItem(key, text);
                }
                return nativeVal;
            } catch (e) {
                if (e.name !== 'NotFoundError') console.error('Native read error', e);
            }
        }

        return new Promise((resolve) => {
            const tx = this.db.transaction('fallback_data', 'readonly');
            const req = tx.objectStore('fallback_data').get(key);
            req.onsuccess = () => {
                if (req.result !== undefined) {
                    const dbVal = req.result;
                    // Sync to local
                    localStorage.setItem(key, JSON.stringify(dbVal));
                    resolve(dbVal);
                } else {
                    resolve(finalVal);
                }
            };
            req.onerror = () => resolve(finalVal);
        });
    }

    async removeItem(key) {
        if (this.mode === 'native' && this.dirHandle) {
            try {
                await this.dirHandle.removeEntry(`${key}.json`);
            } catch (e) { }
        }

        const tx = this.db.transaction('fallback_data', 'readwrite');
        tx.objectStore('fallback_data').delete(key);
        localStorage.removeItem(key);
    }
}

window.fileSystemManager = new FileSystemManager();
