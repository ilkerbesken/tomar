// ============================================================
// CloudStorageManager.js
// Masaüstü'ndeki mevcut depolamaya dokunmaz.
// Mobil/tablet için ek seçenekler sunar.
// ============================================================

class CloudStorageManager {
    constructor(app) {
        this.app = app;
        this.GOOGLE_CLIENT_ID = '915367935470-6ok8pt4dhr4thmmf4g4n2v112tksehds.apps.googleusercontent.com';
        this.GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file';
        this.gisLoaded = false;
        this.gdriveToken = null;

        // Restore saved token if any
        const saved = localStorage.getItem('tomar_gdrive_token');
        if (saved) this.gdriveToken = saved;
    }

    // ─── Platform Tespiti ───────────────────────────────────────
    static detect() {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isAndroid = /Android/.test(ua);
        const hasFileSystem = 'showDirectoryPicker' in window;
        return { isIOS, isAndroid, isMobile: isIOS || isAndroid, hasFileSystem };
    }

    // ─── JSON Export ─────────────────────────────────────────────
    /**
     * Tüm notları ve klasörleri JSON dosyası olarak indirir.
     * iPad'de Dosyalar uygulamasına / iCloud Drive'a taşınabilir.
     */
    async exportToFile() {
        try {
            const data = await this._collectAllData();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `tomar-yedek-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            return { success: true, message: 'Dosya indirildi. Dosyalar uygulamasından iCloud\'a taşıyabilirsiniz.' };
        } catch (err) {
            console.error('Export hatası:', err);
            return { success: false, message: err.message };
        }
    }

    // ─── JSON Import ─────────────────────────────────────────────
    async importFromFile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return resolve({ success: false, message: 'Dosya seçilmedi.' });

                const reader = new FileReader();
                reader.onload = async (ev) => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        await this._applyImportedData(data);
                        resolve({ success: true, message: 'Veriler başarıyla yüklendi!' });
                    } catch (err) {
                        resolve({ success: false, message: 'Geçersiz dosya formatı: ' + err.message });
                    }
                };
                reader.onerror = () => resolve({ success: false, message: 'Dosya okunamadı.' });
                reader.readAsText(file);
            };

            // iOS/iPadOS'ta input.click() için body'e eklemek gerekebilir
            document.body.appendChild(input);
            input.click();
            document.body.removeChild(input);
        });
    }

    // ─── Google Drive: GIS Script Yükle ──────────────────────────
    async _initGIS() {
        if (this.gisLoaded) return;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = () => {
                this.gisLoaded = true;
                resolve();
            };
            script.onerror = () => reject(new Error('Google Identity Services yüklenemedi.'));
            document.head.appendChild(script);
        });
    }

    async signInGoogle() {
        await this._initGIS();

        return new Promise((resolve, reject) => {
            // eslint-disable-next-line no-undef
            const client = google.accounts.oauth2.initTokenClient({
                client_id: this.GOOGLE_CLIENT_ID,
                scope: this.GOOGLE_SCOPES,
                callback: (response) => {
                    if (response.error) return reject(new Error(response.error));
                    this.gdriveToken = response.access_token;
                    localStorage.setItem('tomar_gdrive_token', response.access_token);
                    resolve(response.access_token);
                },
            });
            client.requestAccessToken();
        });
    }

    async signOutGoogle() {
        if (this.gdriveToken && typeof google !== 'undefined') {
            // eslint-disable-next-line no-undef
            google.accounts.oauth2.revoke(this.gdriveToken);
        }
        this.gdriveToken = null;
        localStorage.removeItem('tomar_gdrive_token');
    }

    async _ensureToken() {
        if (!this.gdriveToken) {
            await this.signInGoogle();
        }
    }

    // ─── Google Drive: Senkronizasyon (Incremental) ──────────────
    /**
     * Yerel veritabanındaki (IndexedDB) her notu Drive ile senkronize eder.
     */
    async syncWithGoogleDrive() {
        await this._ensureToken();
        const fsm = window.fileSystemManager;
        const folderId = await this._getOrCreateTomarFolder();

        // 1. Temel verileri senkronize et (boards, folders, settings)
        // Bunlar küçük olduğu için tek bir "manifest" dosyasında tutabiliriz veya ayrı ayrı.
        // Şimdilik board listesini ve klasörleri toplu senkronize edelim.
        await this._syncManifest(folderId);

        // 2. Her board içeriğini tek tek kontrol et
        const boards = await fsm.getItem('wb_boards', []);
        let syncCount = 0;

        for (const board of boards) {
            const meta = await fsm.getSyncMetadata(board.id);
            if (!meta) continue;

            const needsUpload = !meta.googleDriveFileId || (meta.lastModifiedLocally > meta.lastSyncedTime);

            if (needsUpload) {
                console.log(`[Sync] Uploading board: ${board.name} (${board.id})`);
                const content = await fsm.getItem(`wb_content_${board.id}`, null);
                if (!content) continue;

                const fileId = await this._uploadBoardToDrive(board, content, folderId, meta.googleDriveFileId);

                await fsm.setSyncMetadata(board.id, {
                    googleDriveFileId: fileId,
                    lastSyncedTime: Date.now()
                });
                syncCount++;
            }
        }

        return { success: true, message: syncCount > 0 ? `${syncCount} not güncellendi.` : 'Her şey güncel.' };
    }

    async _syncManifest(folderId) {
        const fsm = window.fileSystemManager;
        const manifest = {
            boards: await fsm.getItem('wb_boards', []),
            folders: await fsm.getItem('wb_folders', []),
            viewSettings: await fsm.getItem('wb_view_settings', {}),
            customCovers: await fsm.getItem('wb_custom_covers', [])
        };
        const fileName = 'tomar-manifest.json';
        const existing = await this._findFileInFolder(fileName, folderId);
        await this._uploadToDrive(fileName, manifest, folderId, existing?.id);
    }

    async _uploadBoardToDrive(board, content, folderId, existingFileId) {
        const fileName = `board_${board.id}.json`;
        return await this._uploadToDrive(fileName, content, folderId, existingFileId);
    }

    async _uploadToDrive(fileName, data, folderId, existingFileId) {
        const metadata = existingFileId ? { name: fileName } : { name: fileName, parents: [folderId] };
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const url = existingFileId
            ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        const res = await fetch(url, {
            method: existingFileId ? 'PATCH' : 'POST',
            headers: { Authorization: `Bearer ${this.gdriveToken}` },
            body: form,
        });

        if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
        const result = await res.json();
        return result.id;
    }

    // --- Legacy methods updated to use the new logic or kept for compatibility ---
    async saveToGoogleDrive() {
        return this.syncWithGoogleDrive();
    }

    async loadFromGoogleDrive() {
        await this._ensureToken();
        const folderId = await this._getOrCreateTomarFolder();

        // 1. Manifest yükle
        const manifestFile = await this._findFileInFolder('tomar-manifest.json', folderId);
        if (!manifestFile) return { success: false, message: 'Drive\'da yedek bulunamadı.' };

        const manifestRes = await fetch(`https://www.googleapis.com/drive/v3/files/${manifestFile.id}?alt=media`, {
            headers: { Authorization: `Bearer ${this.gdriveToken}` }
        });
        const manifest = await manifestRes.json();

        const fsm = window.fileSystemManager;
        await fsm.saveItem('wb_boards', manifest.boards);
        await fsm.saveItem('wb_folders', manifest.folders);
        await fsm.saveItem('wb_view_settings', manifest.viewSettings);
        await fsm.saveItem('wb_custom_covers', manifest.customCovers);

        // 2. Board içeriklerini yükle (Lazy or Immediate?)
        // Şimdilik basitleştirelim ve tümünü çekelim
        for (const board of manifest.boards) {
            const boardFile = await this._findFileInFolder(`board_${board.id}.json`, folderId);
            if (boardFile) {
                const res = await fetch(`https://www.googleapis.com/drive/v3/files/${boardFile.id}?alt=media`, {
                    headers: { Authorization: `Bearer ${this.gdriveToken}` }
                });
                const content = await res.json();
                await fsm.saveItem(`wb_content_${board.id}`, content);
                await fsm.setSyncMetadata(board.id, {
                    googleDriveFileId: boardFile.id,
                    lastSyncedTime: Date.now()
                });
            }
        }

        return { success: true, message: 'Tüm veriler Drive\'dan geri yüklendi.' };
    }

    // ─── Yardımcı: Tomar klasörünü bul veya oluştur ───────────────
    async _getOrCreateTomarFolder() {
        const headers = { Authorization: `Bearer ${this.gdriveToken}` };
        const folderName = 'Tomar';
        const folderMime = 'application/vnd.google-apps.folder';

        // Önce mevcut Tomar klasörünü ara
        const searchQuery = `name='${folderName}' and mimeType='${folderMime}' and trashed=false`;
        const searchUrl = 'https://www.googleapis.com/drive/v3/files?' +
            new URLSearchParams({ q: searchQuery, fields: 'files(id,name)' }).toString();

        const searchRes = await fetch(searchUrl, { headers });

        if (!searchRes.ok) {
            this.gdriveToken = null;
            localStorage.removeItem('tomar_gdrive_token');
            throw new Error(`Google Drive bağlantısı kesildi. Lütfen tekrar deneyin.`);
        }

        const searchData = await searchRes.json();
        if (searchData.files?.length > 0) return searchData.files[0].id;

        // Yoksa oluştur
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: folderName, mimeType: folderMime })
        });
        const folder = await createRes.json();
        return folder.id;
    }

    // ─── Yardımcı: Klasör içinde dosya ara ───────────────────────
    async _findFileInFolder(fileName, folderId) {
        const headers = { Authorization: `Bearer ${this.gdriveToken}` };
        const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
        const url = 'https://www.googleapis.com/drive/v3/files?' +
            new URLSearchParams({ q: query, fields: 'files(id,name)' }).toString();

        const res = await fetch(url, { headers });
        if (!res.ok) return null;

        const data = await res.json();
        return data.files?.[0] || null;
    }

    // ─── Yardımcı: Tüm veriyi topla ─────────────────────────────
    async _collectAllData() {
        const fsm = window.fileSystemManager;
        const boards = await fsm.getItem('wb_boards', []);
        const folders = await fsm.getItem('wb_folders', []);
        const viewSettings = await fsm.getItem('wb_view_settings', {});
        const customCovers = await fsm.getItem('wb_custom_covers', []);
        const contents = {};
        for (const board of boards) {
            const content = await fsm.getItem(`wb_content_${board.id}`, null);
            if (content) contents[board.id] = content;
        }
        return { version: 2, boards, folders, viewSettings, customCovers, contents };
    }

    // ─── Yardımcı: İçe aktarılan veriyi uygula ──────────────────
    async _applyImportedData(data) {
        const fsm = window.fileSystemManager;
        if (data.boards) await fsm.saveItem('wb_boards', data.boards);
        if (data.folders) await fsm.saveItem('wb_folders', data.folders);
        if (data.viewSettings) await fsm.saveItem('wb_view_settings', data.viewSettings);
        if (data.contents) {
            for (const [boardId, content] of Object.entries(data.contents)) {
                await fsm.saveItem(`wb_content_${boardId}`, content);
            }
        }
    }
}

// Global olarak register et
window.CloudStorageManager = CloudStorageManager;
