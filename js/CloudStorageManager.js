// ============================================================
// CloudStorageManager.js  v2.0
//
// Google Drive yapısı:
//   Tomar/
//     .settings/
//       tomar-manifest.json   ← Seçenek A: JSON yedek + meta
//     Klasör Adı/             ← Gerçek Drive klasörleri
//       Alt Klasör/
//         not-adı.tom
//       not-adı.tom
//     köksüz-not.tom          ← Klasörsüz boardlar kök dizinde
// ============================================================

class CloudStorageManager {
    constructor(app) {
        this.app = app;
        this.GOOGLE_CLIENT_ID = '915367935470-6ok8pt4dhr4thmmf4g4n2v112tksehds.apps.googleusercontent.com';
        this.GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file';
        this.gisLoaded = false;
        this.gdriveToken = localStorage.getItem('tomar_gdrive_token');
        this.isSyncing = false;

        // Drive klasör ID önbelleği: path → driveId
        // Örn: "Tomar" → "1abc...", "Tomar/Proje" → "2def..."
        this._folderIdCache = {};
    }

    // ─── Platform Tespiti ────────────────────────────────────────
    static detect() {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isAndroid = /Android/.test(ua);
        const hasFileSystem = 'showDirectoryPicker' in window;
        return { isIOS, isAndroid, isMobile: isIOS || isAndroid, hasFileSystem };
    }

    // ─── JSON Export ─────────────────────────────────────────────
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
            return { success: true };
        } catch (err) {
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
                        resolve({ success: false, message: 'Geçersiz dosya: ' + err.message });
                    }
                };
                reader.onerror = () => resolve({ success: false, message: 'Dosya okunamadı.' });
                reader.readAsText(file);
            };
            document.body.appendChild(input);
            input.click();
            document.body.removeChild(input);
        });
    }

    // ─── Google Identity Services ────────────────────────────────
    async _initGIS() {
        if (this.gisLoaded) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = () => { this.gisLoaded = true; resolve(); };
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
        if (!this.gdriveToken) await this.signInGoogle();
    }

    // ─── Ana Senkronizasyon ───────────────────────────────────────
    async syncWithGoogleDrive() {
        if (this.isSyncing) return { success: false, message: 'Senkronizasyon zaten sürüyor.' };
        this.isSyncing = true;
        this._folderIdCache = {}; // Her sync'te önbelleği sıfırla

        try {
            await this._ensureToken();
            const fsm = window.fileSystemManager;

            // Kök "Tomar" klasörünü al/oluştur
            const tomarFolderId = await this._getOrCreateDriveFolder('Tomar', null);

            // ── PULL: Drive'daki .settings/tomar-manifest.json'u oku ──
            let syncCount = 0;
            const settingsFolderId = await this._getOrCreateDriveFolder('.settings', tomarFolderId);
            const remoteManifestFile = await this._findFileInFolder('tomar-manifest.json', settingsFolderId);

            let localBoards = await fsm.getItem('wb_boards', []);
            let localFolders = await fsm.getItem('wb_folders', []);
            const locallyDeletedIds = await fsm.getItem('wb_deleted_ids', []);

            if (remoteManifestFile) {
                try {
                    const res = await fetch(
                        `https://www.googleapis.com/drive/v3/files/${remoteManifestFile.id}?alt=media`,
                        { headers: { Authorization: `Bearer ${this.gdriveToken}` } }
                    );
                    if (res.ok) {
                        const remoteManifest = await res.json();
                        const remoteBoards = remoteManifest.boards || [];
                        const remoteFolders = remoteManifest.folders || [];

                        // 1. Klasörleri Senkronize Et (Merge)
                        for (const rf of remoteFolders) {
                            const lfIndex = localFolders.findIndex(f => f.id === rf.id);
                            if (lfIndex === -1) {
                                // Yeni klasör (remote'da var, yerelde yok)
                                localFolders.push(rf);
                                syncCount++;
                            } else {
                                // Mevcut klasör - Güncelleme kontrolü (isim/renk değişmiş olabilir)
                                // Not: Klasörlerin lastModified özelliği yoksa isim kontrolü yapabiliriz
                                if (rf.name !== localFolders[lfIndex].name || rf.color !== localFolders[lfIndex].color || rf.parentId !== localFolders[lfIndex].parentId) {
                                    localFolders[lfIndex] = rf;
                                    syncCount++;
                                }
                            }
                        }

                        // 2. Boardları Senkronize Et (Download & Update)
                        const boardsToSync = [];
                        for (const rb of remoteBoards) {
                            const lb = localBoards.find(b => b.id === rb.id);
                            const meta = await fsm.getSyncMetadata(rb.id);

                            if (!lb) {
                                // Yerelde yok. Acaba silindiği için mi yok yoksa yeni mi?
                                if (meta && meta.googleDriveFileId) {
                                    // Daha önce senkronize edilmiş ama yerelde yok -> Yerelde silinmiş.
                                    continue;
                                } else if (locallyDeletedIds.includes(rb.id)) {
                                    // Yerelde az önce silindi, manifest henüz güncellenmedi
                                    continue;
                                } else {
                                    // Tamamen yeni bir board (başka cihazdan)
                                    boardsToSync.push(rb);
                                }
                            } else if (rb.lastModified > (lb.lastModified || 0)) {
                                // Remote daha güncel
                                boardsToSync.push(rb);
                            }
                        }

                        for (const rb of boardsToSync) {
                            const tomContent = await this._downloadBoardTom(rb, remoteFolders, tomarFolderId);
                            if (tomContent) {
                                await fsm.saveItem(`wb_content_${rb.id}`, tomContent, true);
                                // Local listeyi güncelle/ekle
                                const idx = localBoards.findIndex(b => b.id === rb.id);
                                if (idx !== -1) {
                                    localBoards[idx] = rb;
                                } else {
                                    localBoards.push(rb);
                                }
                                syncCount++;
                            }
                        }

                        // 3. Uzaktan Silinenleri Yerelde Sil
                        const remoteBoardIds = new Set(remoteBoards.map(b => b.id));
                        const localBoardsAfterPull = [];
                        for (const lb of localBoards) {
                            const meta = await fsm.getSyncMetadata(lb.id);
                            if (meta && meta.googleDriveFileId && !remoteBoardIds.has(lb.id)) {
                                // Daha önce senkronize edilmiş ama artık remote manifest'te yok -> Remote'da silinmiş.
                                console.log(`[CloudSync] Uzaktan silinmiş, yerelden kaldırılıyor: ${lb.name}`);
                                await fsm.removeItem(`wb_content_${lb.id}`);
                                syncCount++;
                                continue;
                            }
                            localBoardsAfterPull.push(lb);
                        }
                        localBoards = localBoardsAfterPull;

                        // 4. Değişiklikleri Kaydet
                        if (syncCount > 0) {
                            await fsm.saveItem('wb_boards', localBoards, true);
                            await fsm.saveItem('wb_folders', localFolders, true);
                            if (remoteManifest.viewSettings) {
                                await fsm.saveItem('wb_view_settings', remoteManifest.viewSettings, true);
                            }
                        }
                    }
                } catch (e) {
                    console.error('[CloudSync] Pull hatası:', e);
                }
            }

            // ── PUSH: Yereldeki değişiklikleri Drive'a yükle ──
            // localBoards ve localFolders güncel hallerini kullan
            const boards = localBoards;
            const folders = localFolders;

            // Uygulama klasör yapısını Drive'da yansıt
            await this._ensureDriveFolders(folders, tomarFolderId);

            for (const board of boards) {
                let meta = await fsm.getSyncMetadata(board.id);
                if (!meta) {
                    await fsm.updateSyncMetadata(board.id);
                    meta = await fsm.getSyncMetadata(board.id);
                }

                const needsUpload = !meta.googleDriveFileId ||
                    (meta.lastModifiedLocally > (meta.lastSyncedTime || 0));

                if (needsUpload) {
                    const content = await fsm.getItem(`wb_content_${board.id}`, null);
                    if (content) {
                        const driveFileId = await this._uploadBoardTom(board, content, folders, tomarFolderId, meta.googleDriveFileId);
                        await fsm.setSyncMetadata(board.id, {
                            googleDriveFileId: driveFileId,
                            lastSyncedTime: Date.now()
                        });
                        syncCount++;
                    }
                }
            }

            // ── Manifest Güncelleme ──
            // PUSH sonrası manifesti tekrar güncelle ki son haller (ID'ler vb) Drive'da olsun
            await this._syncManifest(settingsFolderId);

            // ── ÇÖP TOPLAMA (Garbage Collection) ──────────────────
            await this._garbageCollect(tomarFolderId, boards, folders, locallyDeletedIds);

            // ── Temizlik: Artık silindiği kesinleşen ID'leri listeden çıkar ──
            if (locallyDeletedIds.length > 0) {
                // Garbage collect sonrası yereldeki listeyi temizle
                await fsm.saveItem('wb_deleted_ids', [], true);
            }

            return {
                success: true,
                message: syncCount > 0 ? `${syncCount} değişiklik işlendi.` : 'Her şey güncel.',
                syncCount: syncCount
            };

        } catch (err) {
            console.error('[CloudSync] Genel hata:', err);
            if (err.message?.includes('401') || err.message?.includes('token')) {
                this.gdriveToken = null;
                localStorage.removeItem('tomar_gdrive_token');
            }
            return { success: false, message: err.message };
        } finally {
            this.isSyncing = false;
        }
    }

    async saveToGoogleDrive() {
        return this.syncWithGoogleDrive();
    }

    async loadFromGoogleDrive() {
        return this.syncWithGoogleDrive();
    }

    // ─── Drive Klasör Yönetimi ────────────────────────────────────

    /**
     * Drive'da tek bir klasör bul veya oluştur.
     * @param {string} name  Klasör adı
     * @param {string|null} parentId  Üst klasör Drive ID'si (null → root)
     */
    async _getOrCreateDriveFolder(name, parentId, appFolderId = null) {
        const cacheKey = appFolderId ? appFolderId : (parentId ? `${parentId}/${name}` : name);
        if (this._folderIdCache[cacheKey]) return this._folderIdCache[cacheKey];

        const headers = { Authorization: `Bearer ${this.gdriveToken}` };
        const folderMime = 'application/vnd.google-apps.folder';

        // Önce ID ile ara (eğer varsa, rename durumunu yakalamak için)
        if (appFolderId) {
            const qId = `appProperties has { key='folderId' and value='${appFolderId}' } and trashed=false`;
            const resId = await fetch('https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({ q: qId, fields: 'files(id,name,parents)' }).toString(), { headers });
            if (resId.ok) {
                const dataId = await resId.json();
                if (dataId.files?.length > 0) {
                    const driveFolder = dataId.files[0];
                    // Eğer isim değişmişse veya klasör taşınmışsa güncelle
                    const nameChanged = driveFolder.name !== name;
                    const parentChanged = parentId && !driveFolder.parents?.includes(parentId);

                    if (nameChanged || parentChanged) {
                        let patchUrl = `https://www.googleapis.com/drive/v3/files/${driveFolder.id}?`;
                        const params = new URLSearchParams();
                        if (parentChanged) {
                            params.append('addParents', parentId);
                            if (driveFolder.parents?.[0]) params.append('removeParents', driveFolder.parents[0]);
                        }
                        
                        await fetch(patchUrl + params.toString(), {
                            method: 'PATCH',
                            headers: { ...headers, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name })
                        });
                    }
                    this._folderIdCache[cacheKey] = driveFolder.id;
                    return driveFolder.id;
                }
            }
        }

        // Klasik isimle arama (fallback)
        let q = `name='${name.replace(/'/g, "\\'")}' and mimeType='${folderMime}' and trashed=false`;
        if (parentId) q += ` and '${parentId}' in parents`;

        const searchUrl = 'https://www.googleapis.com/drive/v3/files?' +
            new URLSearchParams({ q, fields: 'files(id,name)' }).toString();

        const searchRes = await fetch(searchUrl, { headers });
        if (!searchRes.ok) {
            if (searchRes.status === 401) {
                this.gdriveToken = null;
                localStorage.removeItem('tomar_gdrive_token');
            }
            throw new Error(`Drive bağlantı hatası: ${searchRes.status}`);
        }

        const data = await searchRes.json();
        if (data.files?.length > 0) {
            this._folderIdCache[cacheKey] = data.files[0].id;
            return data.files[0].id;
        }

        // Oluştur
        const body = { 
            name, 
            mimeType: folderMime, 
            appProperties: { type: 'folder' } 
        };
        if (appFolderId) body.appProperties.folderId = appFolderId;
        if (parentId) body.parents = [parentId];

        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!createRes.ok) throw new Error(`Klasör oluşturulamadı: ${name}`);
        const folder = await createRes.json();
        this._folderIdCache[cacheKey] = folder.id;
        return folder.id;
    }

    /**
     * Uygulama klasör hiyerarşisini Drive'da yansıt.
     * Her uygulama klasörü → Drive'da bir alt klasör.
     * Sonuç: { appFolderId → driveId } haritası döner.
     */
    async _ensureDriveFolders(folders, tomarFolderId) {
        const appFolderToDriveId = {}; // appFolderId → driveId

        // Kök klasörler önce, sonra alt klasörler (parentId zincirini çözmek için)
        const sorted = this._sortFoldersByDepth(folders);

        for (const folder of sorted) {
            const safeName = this._sanitizeName(folder.name) || folder.id;
            let parentDriveId = tomarFolderId;

            if (folder.parentId && appFolderToDriveId[folder.parentId]) {
                parentDriveId = appFolderToDriveId[folder.parentId];
            }

            const driveId = await this._getOrCreateDriveFolder(safeName, parentDriveId, folder.id);
            appFolderToDriveId[folder.id] = driveId;
        }

        return appFolderToDriveId;
    }

    /**
     * Klasörleri derinliğe göre sırala (üstten alta doğru).
     */
    _sortFoldersByDepth(folders) {
        const getDepth = (folder, visited = new Set()) => {
            if (!folder.parentId || visited.has(folder.id)) return 0;
            visited.add(folder.id);
            const parent = folders.find(f => f.id === folder.parentId);
            return parent ? 1 + getDepth(parent, visited) : 0;
        };
        return [...folders].sort((a, b) => getDepth(a) - getDepth(b));
    }

    // ─── .tom Dosyası Yükleme (PUSH) ─────────────────────────────

    /**
     * Bir board'un içeriğini .tom formatında Drive'a yükle.
     * Board'un klasörüne göre doğru Drive alt klasörünü kullanır.
     */
    async _uploadBoardTom(board, content, folders, tomarFolderId, existingFileId) {
        // Hedef Drive klasörünü bul
        const targetFolderId = await this._getDriveTargetFolder(board, folders, tomarFolderId);

        const safeName = this._sanitizeName(board.name) || board.id;
        const fileName = board.isPDF ? `${safeName}.pdf.tom` : `${safeName}.tom`;

        // .tom formatında sıkıştır (pako/gzip)
        const tomBytes = await this._contentToTom(content);

        const appProperties = { boardId: board.id, type: 'board' };
        return await this._uploadRawToDrive(fileName, tomBytes, 'application/octet-stream', targetFolderId, existingFileId, appProperties);
    }

    /**
     * Board'un Drive'daki hedef klasör ID'sini döndür.
     */
    async _getDriveTargetFolder(board, folders, tomarFolderId) {
        if (!board.folderId) return tomarFolderId;

        // Klasör zincirini çöz
        const folderPath = this._getFolderPathNames(board.folderId, folders);
        let currentParent = tomarFolderId;
        for (const name of folderPath) {
            currentParent = await this._getOrCreateDriveFolder(name, currentParent);
        }
        return currentParent;
    }

    /**
     * Klasörün adını (ve üstlerinin adlarını) döndür.
     * @returns {string[]} ['Proje', 'Alt Klasör']
     */
    _getFolderPathNames(folderId, folders) {
        const folder = folders.find(f => f.id === folderId);
        if (!folder) return [];
        const safeName = this._sanitizeName(folder.name) || folderId;
        if (!folder.parentId) return [safeName];
        return [...this._getFolderPathNames(folder.parentId, folders), safeName];
    }

    /**
     * Board içeriğini .tom (gzip) byte dizisine dönüştür.
     */
    async _contentToTom(content) {
        // pako beklenmiyorsa yükle
        if (typeof pako === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }

        const jsonStr = JSON.stringify({
            version: content.version || '2.1',
            format: 'tom',
            savedAt: new Date().toISOString(),
            pages: content.pages || null,
            objects: content.objects || null
        });

        return pako.gzip(jsonStr);
    }

    // ─── .tom Dosyası İndirme (PULL) ─────────────────────────────

    /**
     * Bir board'un .tom dosyasını Drive'dan indir ve içeriği parse et.
     */
    async _downloadBoardTom(boardMeta, folders, tomarFolderId) {
        try {
            // Önce .tom dosyasını ara
            const targetFolderId = await this._getDriveTargetFolder(boardMeta, folders, tomarFolderId);
            const safeName = this._sanitizeName(boardMeta.name) || boardMeta.id;
            const fileName = boardMeta.isPDF ? `${safeName}.pdf.tom` : `${safeName}.tom`;

            const fileInfo = await this._findFileInFolder(fileName, targetFolderId);
            if (!fileInfo) return null;

            const res = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileInfo.id}?alt=media`,
                { headers: { Authorization: `Bearer ${this.gdriveToken}` } }
            );

            const arrayBuffer = await res.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);

            // pako ile decompress
            if (typeof pako === 'undefined') {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js';
                    s.onload = resolve; s.onerror = reject;
                    document.head.appendChild(s);
                });
            }

            let jsonStr;
            if (uint8[0] === 0x1f && uint8[1] === 0x8b) {
                jsonStr = pako.inflate(uint8, { to: 'string' });
            } else {
                jsonStr = new TextDecoder().decode(uint8);
            }

            return JSON.parse(jsonStr);
        } catch (e) {
            console.warn('[CloudSync] .tom indirme hatası:', e);
            return null;
        }
    }

    // ─── Seçenek A: Manifest ──────────────────────────────────────

    /**
     * .settings/tomar-manifest.json'u güncelle.
     * Board listesi, klasör yapısı, ve tüm meta verileri içerir.
     */
    async _syncManifest(settingsFolderId) {
        const fsm = window.fileSystemManager;
        const manifest = {
            version: 2,
            syncedAt: new Date().toISOString(),
            boards: await fsm.getItem('wb_boards', []),
            folders: await fsm.getItem('wb_folders', []),
            viewSettings: await fsm.getItem('wb_view_settings', {}),
            customCovers: await fsm.getItem('wb_custom_covers', [])
        };

        const fileName = 'tomar-manifest.json';
        const existing = await this._findFileInFolder(fileName, settingsFolderId);
        const jsonBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
        await this._uploadRawToDrive(fileName, jsonBytes, 'application/json', settingsFolderId, existing?.id);
    }

    // ─── Drive Dosya İşlemleri (Düşük Seviye) ────────────────────

    /**
     * Bir klasör içinde dosya ara.
     */
    async _findFileInFolder(fileName, folderId) {
        const headers = { Authorization: `Bearer ${this.gdriveToken}` };
        const q = `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`;
        const url = 'https://www.googleapis.com/drive/v3/files?' +
            new URLSearchParams({ q, fields: 'files(id,name)' }).toString();

        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        const data = await res.json();
        return data.files?.[0] || null;
    }

    /**
     * Ham byte dizisini Drive'a yükle (multipart upload).
     * @returns {string} Drive file ID
     */
    async _uploadRawToDrive(fileName, bytes, mimeType, folderId, existingFileId, appProperties = {}) {
        const metadata = existingFileId
            ? { name: fileName, appProperties }
            : { name: fileName, parents: [folderId], appProperties };

        let url = existingFileId
            ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        // Eğer mevcut dosya varsa ve klasörü değişmişse taşı
        if (existingFileId && folderId) {
            try {
                const headRes = await fetch(`https://www.googleapis.com/drive/v3/files/${existingFileId}?fields=parents`, {
                    headers: { Authorization: `Bearer ${this.gdriveToken}` }
                });
                if (headRes.ok) {
                    const fileInfo = await headRes.json();
                    const currentParent = fileInfo.parents?.[0];
                    if (currentParent && currentParent !== folderId) {
                        url += `&addParents=${folderId}&removeParents=${currentParent}`;
                    }
                }
            } catch (e) { console.warn('[CloudSync] Taşıma kontrolü hatası:', e); }
        }

        const blob = new Blob([bytes], { type: mimeType });
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const res = await fetch(url, {
            method: existingFileId ? 'PATCH' : 'POST',
            headers: { Authorization: `Bearer ${this.gdriveToken}` },
            body: form
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Drive yükleme hatası (${res.status}): ${err.slice(0, 200)}`);
        }

        const result = await res.json();
        return result.id;
    }

    // ─── Garbage Collection ──────────────────────────────────────

    /**
     * Drive'daki dosyaları ve klasörleri kontrol ederek manifest'te olmayanları siler.
     */
    async _garbageCollect(tomarFolderId, localBoards, localFolders, locallyDeletedIds = []) {
        try {
            const headers = { Authorization: `Bearer ${this.gdriveToken}` };
            
            // App tarafından oluşturulan TÜM dosyaları listele
            // (trashed=false ve parents kısıtlaması olmadan, drive.file scope sayesinde sadece kendi dosyalarımızı görürüz)
            const listUrl = 'https://www.googleapis.com/drive/v3/files?' +
                new URLSearchParams({ 
                    q: "trashed=false", 
                    fields: 'files(id,name,appProperties,mimeType,parents,createdTime)' 
                }).toString();

            const res = await fetch(listUrl, { headers });
            if (!res.ok) return;
            const data = await res.json();
            
            const boardIds = new Set(localBoards.map(b => b.id));
            const folderIds = new Set(localFolders.map(f => f.id));
            
            for (const file of (data.files || [])) {
                // Sadece Tomar klasörü altındakileri kontrol et (manifest hariç)
                if (file.name === 'tomar-manifest.json') continue;
                
                const type = file.appProperties?.type;
                const boardId = file.appProperties?.boardId;
                const folderId = file.appProperties?.folderId;

                let shouldDelete = false;

                const createdTime = new Date(file.createdTime).getTime();
                const now = Date.now();
                const isNew = (now - createdTime < 120000);

                if (type === 'board') {
                    // Sadece 'boardId'si olan ve listede olmayanları sil
                    if (boardId) {
                        if (!boardIds.has(boardId)) {
                            // İstisna: Eğer yerelde az önce sildiğimizi biliyorsak 2 dk kuralını atla
                            if (locallyDeletedIds.includes(boardId)) {
                                shouldDelete = true;
                            } else if (!isNew) {
                                shouldDelete = true;
                            }
                        }
                    }
                } else if (type === 'folder') {
                    // Sadece 'folderId'si olan ve listede olmayanları sil (Önemli klasörleri koru)
                    if (folderId && file.name !== 'Tomar' && file.name !== '.settings') {
                        if (!folderIds.has(folderId)) {
                            // İstisna: Yerelde az önce silindiyse anında sil
                            if (locallyDeletedIds.includes(folderId)) {
                                shouldDelete = true;
                            } else if (!isNew) {
                                shouldDelete = true;
                            }
                        }
                    }
                }

                if (shouldDelete) {
                    console.log(`[CloudSync] Garbage Collection: Siliniyor -> ${file.name}`);
                    await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
                        method: 'DELETE',
                        headers
                    });
                }
            }
        } catch (e) {
            console.warn('[CloudSync] Garbage Collection hatası:', e);
        }
    }

    // ─── Yardımcı Metotlar ────────────────────────────────────────

    _sanitizeName(name) {
        if (!name) return '';
        return name
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100);
    }

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

    async _applyImportedData(data) {
        const fsm = window.fileSystemManager;
        if (data.boards) await fsm.saveItem('wb_boards', data.boards);
        if (data.folders) await fsm.saveItem('wb_folders', data.folders);
        if (data.viewSettings) await fsm.saveItem('wb_view_settings', data.viewSettings);
        if (data.customCovers) await fsm.saveItem('wb_custom_covers', data.customCovers);
        if (data.contents) {
            for (const [boardId, content] of Object.entries(data.contents)) {
                await fsm.saveItem(`wb_content_${boardId}`, content);
            }
        }
    }
}

window.CloudStorageManager = CloudStorageManager;
