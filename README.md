# 🎨 Tomar JS - Modern Dijital Beyaz Tahta

Tomar JS, modern web teknolojileri ile geliştirilmiş, kullanıcı dostu ve yüksek performanslı bir dijital beyaz tahta uygulamasıdır. Hem bireysel not alma hem de yaratıcı süreçler için geniş bir araç yelpazesi sunar.

---

## 🚀 Proje Briefi
Bu uygulama, tarayıcı üzerinde çalışan ancak masaüstü kalitesinde bir çizim deneyimi sunan bir platformdur. Kullanıcılar boş tuval üzerine çizim yapabilir, şekiller ekleyebilir, PDF'lerini içe aktarıp üzerinde notlar alabilir ve tüm çalışmalarını düzenli bir dashboard üzerinden yönetebilir.

---

## 🛠️ Kullanılan Araçlar

### 🎨 Çizim ve Yazım
- **Kalem (Pen):** Basınç hassasiyeti desteği, yumuşatma algoritmaları ve doğal bitiş (taper) efekti ile gerçekçi bir yazım deneyimi.
- **Vurgulayıcı (Highlighter):** Saydamlık desteği ile metinlerin veya çizimlerin üzerinden geçmek için ideal.
- **Metin Aracı (Text):** Tuvalin her yerine zengin metin kutuları ekleme.
- **Silgi (Eraser):** Hem nesne bazlı (tıklanan objeyi silen) hem de piksel bazlı silme seçenekleri.

### 📐 Şekiller ve Şemalar
- **Gelişmiş Şekiller:** Dikdörtgen, Elips, Üçgen, Yıldız, Kalp, Bulut, Karo ve daha fazlası.
- **Akıllı Oklar:** Düz, eğri veya dirsek tipinde; uçları özelleştirilebilir (ok, daire, kare vb.) bağlantı okları.
- **Tablolar:** Dinamik olarak genişletilebilen, satır/sütun eklenebilen akıllı tablolar.

### 🎭 Dekorasyon ve Medya
- **Stickerlar:** Hazır ikonlar ve çıkartmalarla notları görselleştirme.
- **Dekoratif Bantlar (Tape):** Farklı desenlerde (çizgili, noktalı, kareli) dekoratif bantlar.
- **Resim Ekleme:** Tuvale resim sürükleyip bırakma ve düzenleme.

### 📂 Dosya ve PDF Yönetimi
- **PDF Desteği:** PDF dosyalarını içe aktarma, sayfalar arası geçiş ve üzerinde çizim yapma.
- **Export:** Çalışmaları resim veya PDF olarak dışa aktarma.
- **Dashboard:** Notları klasörler halinde düzenleme, favorilere ekleme ve çöp kutusu yönetimi.

---

## 🏗️ Uygulama Mimarisi

Uygulama, sürdürülebilirlik için **modüler bir yapı** üzerine inşa edilmiştir:

1.  **Merkezi Durum Yönetimi (app.js):** Uygulamanın o anki aracını, aktif rengini, sayfa yapısını ve nesne listesini yönetir.
2.  **Araç Sistemi (js/Tools/):** Her araç (PenTool, ShapeTool, ArrowTool vb.) bağımsız bir sınıf olarak tasarlanmıştır. Bu sayede yeni araçlar eklemek oldukça kolaydır.
3.  **Yöneticiler (Managers):**
    - `HistoryManager`: Sınırsız geri/ileri al (Undo/Redo) desteği sağlar.
    - `PageManager`: Çok sayfalı sistemin koordinasyonunu sağlar.
    - `ZoomManager`: Tuval üzerinde kaydırma ve yakınlaştırma işlemlerini yönetir.
4.  **Rendering Katmanı:** HTML5 Canvas API kullanılır. Pen gibi karmaşık araçlarda performans için `Temporary Canvas` teknikleri uygulanır.
5.  **Basınç Sistemi:** Stylus/Kalem girişlerinde basınç verisini normalleştirip (Utils.js) çizgi kalınlığına dönüştüren özel bir motor bulunur.

---

## 🛠️ Teknoloji Yığını
- **Çekirdek:** HTML5, Modern CSS (Vanilla), JavaScript (ES6+).
- **PDF İşleme:** [PDF.js](https://mozilla.github.io/pdf.js/) ve [jsPDF](https://rawgit.com/MrRio/jsPDF/master/docs/index.html).
- **İkonlar:** [Lucide Icons](https://lucide.dev/).
- **Altyapı:** PWA (Progressive Web App) desteği ile çevrimdışı kullanım ve masaüstüne kurulum.

---

## 🔮 Gelecek Planları
- **WebGL Rendering:** Binlerce nesnenin bulunduğu çok büyük tuvallerde performansı maksimize etmek.
- **Fırça Çeşitliliği:** Sulu boya, karakalem ve fırça efektleri gibi sanatsal fırçalar.
- **Bulut Senkronizasyonu:** Notların cihazlar arası senkronize edilmesi.
- **Canlı İşbirliği (Collaboration):** Birden fazla kullanıcının aynı tahta üzerinde gerçek zamanlı çalışması.
- **AI Entegrasyonu:** El yazısını metne çevirme (OCR) ve şekil düzeltme asistanı.

---

## 🚀 Başlarken
Projeyi çalıştırmak için herhangi bir build adımına gerek yoktur:
1. Proje dizininde bir yerel sunucu başlatın (örn. `Live Server` veya `python -m http.server`).
2. `index.html` dosyasını tarayıcınızda açın.

---
*Bu proje, yaratıcılığınızı kısıtlamadan dijital not alma deneyimini geliştirmek için sürekli güncellenmektedir.*
