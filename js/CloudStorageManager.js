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

    // ─── Google Drive'a Kaydet ───────────────────────────────────
    async saveToGoogleDrive() {
        await this._ensureToken();

        const folderId = await this._getOrCreateTomarFolder();
        const data = await this._collectAllData();
        const json = JSON.stringify(data);
        const fileName = 'tomar-notlar.json';

        // Tomar klasörü içindeki varolan dosyayı bul
        const existingFile = await this._findFileInFolder(fileName, folderId);

        const metadata = existingFile
            ? { name: fileName }
            : { name: fileName, parents: [folderId] };

        const blob = new Blob([json], { type: 'application/json' });
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const url = existingFile
            ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        const method = existingFile ? 'PATCH' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { Authorization: `Bearer ${this.gdriveToken}` },
            body: form,
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Google Drive kayıt hatası: ${errText}`);
        }

        return { success: true, message: 'Google Drive / Tomar klasörüne kaydedildi!' };
    }

    // ─── Google Drive'dan Yükle ──────────────────────────────────
    async loadFromGoogleDrive() {
        await this._ensureToken();

        const folderId = await this._getOrCreateTomarFolder();
        const fileName = 'tomar-notlar.json';
        const file = await this._findFileInFolder(fileName, folderId);

        if (!file) {
            return { success: false, message: 'Drive / Tomar klasöründe kayıtlı veri bulunamadı.' };
        }

        const fileRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            { headers: { Authorization: `Bearer ${this.gdriveToken}` } }
        );

        if (!fileRes.ok) throw new Error('Dosya indirilemedi.');

        const data = await fileRes.json();
        await this._applyImportedData(data);
        return { success: true, message: 'Google Drive / Tomar klasöründen yüklenedildi!' };
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

        console.log('[Tomar] Klasör aranıyor...', searchUrl);
        const searchRes = await fetch(searchUrl, { headers });

        if (!searchRes.ok) {
            const errBody = await searchRes.text();
            console.error('[Tomar] Klasör araması başarısız:', searchRes.status, errBody);
            this.gdriveToken = null;
            localStorage.removeItem('tomar_gdrive_token');
            throw new Error(`Google Drive bağlantısı kesildi (${searchRes.status}). Lütfen tekrar deneyin.`);
        }

        const searchData = await searchRes.json();
        console.log('[Tomar] Klasör arama sonucu:', searchData);

        if (searchData.files?.length > 0) {
            console.log('[Tomar] Mevcut klasör bulundu:', searchData.files[0].id);
            return searchData.files[0].id;
        }

        // Yoksa oluştur
        console.log('[Tomar] Klasör bulunamadı, oluşturuluyor...');
        const createRes = await fetch(
            'https://www.googleapis.com/drive/v3/files',
            {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: folderName, mimeType: folderMime })
            }
        );

        if (!createRes.ok) {
            const errBody = await createRes.text();
            console.error('[Tomar] Klasör oluşturma başarısız:', createRes.status, errBody);
            throw new Error(`Tomar klasörü oluşturulamadı (${createRes.status}): ${errBody}`);
        }

        const folder = await createRes.json();
        console.log('[Tomar] Klasör oluşturuldu:', folder.id, folder.name);
        return folder.id;
    }

    // ─── Yardımcı: Klasör içinde dosya ara ───────────────────────
    async _findFileInFolder(fileName, folderId) {
        const headers = { Authorization: `Bearer ${this.gdriveToken}` };
        const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
        const url = 'https://www.googleapis.com/drive/v3/files?' +
            new URLSearchParams({ q: query, fields: 'files(id,name)' }).toString();

        console.log('[Tomar] Dosya aranıyor...', url);
        const res = await fetch(url, { headers });

        if (!res.ok) {
            const errBody = await res.text();
            console.error('[Tomar] Dosya araması başarısız:', res.status, errBody);
            this.gdriveToken = null;
            localStorage.removeItem('tomar_gdrive_token');
            throw new Error(`Google Drive bağlantısı kesildi (${res.status}). Lütfen tekrar deneyin.`);
        }

        const data = await res.json();
        console.log('[Tomar] Dosya arama sonucu:', data);
        return data.files?.[0] || null;
    }

    // ─── Yardımcı: Tüm veriyi topla ─────────────────────────────
    async _collectAllData() {
        const fsm = window.fileSystemManager;
        const boards = await fsm.getItem('wb_boards', []);
        const folders = await fsm.getItem('wb_folders', []);
        const viewSettings = await fsm.getItem('wb_view_settings', {});
        const customCovers = await fsm.getItem('wb_custom_covers', []);

        // Her notun içeriğini de ekle
        const contents = {};
        for (const board of boards) {
            const content = await fsm.getItem(`wb_content_${board.id}`, null);
            if (content !== null) {
                contents[board.id] = content;
            }
        }

        return {
            version: 2,
            exportDate: new Date().toISOString(),
            boards,
            folders,
            viewSettings,
            customCovers,
            contents
        };
    }

    // ─── Yardımcı: İçe aktarılan veriyi uygula ──────────────────
    async _applyImportedData(data) {
        if (!data || !data.version) throw new Error('Geçersiz yedek formatı.');

        const fsm = window.fileSystemManager;

        if (data.boards) await fsm.saveItem('wb_boards', data.boards);
        if (data.folders) await fsm.saveItem('wb_folders', data.folders);
        if (data.viewSettings) await fsm.saveItem('wb_view_settings', data.viewSettings);
        if (data.customCovers) await fsm.saveItem('wb_custom_covers', data.customCovers);

        // İçerikleri kaydet
        if (data.contents) {
            for (const [boardId, content] of Object.entries(data.contents)) {
                await fsm.saveItem(`wb_content_${boardId}`, content);
            }
        }

        // v1 formatı (eski) için geriye uyumluluk
        if (data.notes && !data.boards) {
            await fsm.saveItem('wb_boards', data.notes);
        }
    }
}

// Global olarak register et
window.CloudStorageManager = CloudStorageManager;
