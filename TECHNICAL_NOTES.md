# Teknik Dokümantasyon - Tomar JS

Bu belge, uygulamada kullanılan teknik yaklaşımları ve her aracın nasıl çalıştığını açıklar.

## 📋 İçindekiler
1. [Basınç Hassasiyeti Sistemi](#basınç-hassasiyeti-sistemi)
2. [Araç Detayları](#araç-detayları)
3. [Rendering Yaklaşımları](#rendering-yaklaşımları)

---

## 🎨 Basınç Hassasiyeti Sistemi

### Genel Bakış
Basınç hassasiyeti, stylus/kalem girişlerinde basınç değerini algılayarak çizgi kalınlığını dinamik olarak ayarlar.

### Basınç Normalizasyonu
**Dosya:** `js/utils.js`

```javascript
normalizePressure(pressure) {
    // Fare kullanıyorsa 0.5, stylus kullanıyorsa gerçek basınç
    return pressure || 0.5;
}
```

### Basınca Göre Kalınlık Hesaplama
**Dosya:** `js/utils.js`

```javascript
getPressureWidth(baseWidth, pressure) {
    // Çok geniş aralık: 0.2x ile 2.2x arası
    return baseWidth * (0.2 + pressure * 2.0);
}
```

**Formül:**
- Minimum: `baseWidth * 0.2` (basınç = 0)
- Maksimum: `baseWidth * 2.2` (basınç = 1)
- Varsayılan: `baseWidth * 1.2` (basınç = 0.5, fare kullanımı)

### Basınç Yumuşatma
**Dosya:** `js/utils.js`

İki geçişli Gaussian-benzeri ağırlıklı ortalama:
```javascript
smoothPressure(points) {
    // İki geçiş
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < smoothed.length - 1; i++) {
            // Ağırlıklı ortalama: (prev + curr*4 + next) / 6
            smoothed[i].pressure = (prev + curr * 4 + next) / 6;
        }
    }
}
```

---

## 🛠️ Araç Detayları

### 1. Pen Tool (Kalem)
**Dosya:** `js/PenTool.js`

#### Rendering Yöntemi: Overlapping Circles
**Neden bu yöntem?**
- Polygon-based rendering basınç değişimlerinde uçlarda deformasyon yaratıyordu
- Arc-based cap'ler düzgün kapanmıyordu
- Overlapping circles doğal olarak mükemmel yuvarlak uçlar oluşturur

**Nasıl Çalışır:**
1. Her noktada basınca göre ayarlanmış bir daire çizilir
2. Noktalar arası boşlukları doldurmak için interpolasyon yapılır
3. Temporary canvas kullanılarak opacity birikimine engel olunur

```javascript
// Her pixel için bir daire
const steps = Math.ceil(dist / 1);

// Interpolasyon
for (let j = 1; j <= steps; j++) {
    const t = j / steps;
    const interpPressure = prevP.pressure + (p.pressure - prevP.pressure) * t;
    const interpRadius = Utils.getPressureWidth(object.width, interpPressure) / 2;
    
    tempCtx.arc(interpX, interpY, interpRadius, 0, Math.PI * 2);
}
```

#### Son Nokta Taper Efekti
**Problem:** Hızlı çizimde stylus kalkınca son nokta çok düşük basınçla kaydediliyor → yuvarlak bitiş

**Çözüm:** Son noktanın basıncını önceki noktaların ortalamasının **çeyreğine** (0.25) ayarla

```javascript
// Son nokta için taper
const avgPressure = (prevPoint1.pressure + prevPoint2.pressure) / 2;
lastPoint.pressure = avgPressure * 0.25;  // Çeyrek
```

**Sonuç:**
- ✅ Doğal incelme (taper) efekti
- ✅ Gerçek kalem gibi organik bitiş
- ✅ Hızlı çizimde bile tutarlı sonuç

#### Nokta Toplama
- **minDistance:** 1 pixel (çok smooth çizgi için)
- **Smoothing:** Weighted moving average (4:2:1 oranı)

### 2. Highlighter Tool (Vurgulayıcı)
**Dosya:** `js/PenTool.js` (PenTool'u yeniden kullanır)

#### Özellikler:
- **Sabit kalınlık:** Basınç hassasiyeti yok
- **Opacity:** Varsayılan 0.7 (70%)
- **Cap style:** Round veya Butt (kullanıcı seçimi)
- **Rendering:** Single continuous path (opacity birikimini önler)

```javascript
if (object.isHighlighter) {
    ctx.lineWidth = object.width;  // Sabit
    ctx.lineCap = object.cap || 'round';
    ctx.globalAlpha = object.opacity || 0.7;
    
    // Smooth bezier curves
    ctx.quadraticCurveTo(cp1x, cp1y, midX, midY);
}
```

### 3. Line Tool (Çizgi)
**Dosya:** `js/LineTool.js`

#### Özellikler:
- Başlangıç ve bitiş noktası ile düz çizgi
- Basınç hassasiyeti: Kapalı (shapes için)
- Line styles: Solid, Dashed, Dotted, Dash-dot, Wavy

### 4. Rectangle Tool (Dikdörtgen)
**Dosya:** `js/RectangleTool.js`

#### Özellikler:
- Basınç hassasiyeti: Kapalı
- Fill/Stroke seçenekleri

### 5. Ellipse Tool (Elips)
**Dosya:** `js/EllipseTool.js`

#### Özellikler:
- Basınç hassasiyeti: Kapalı
- Fill/Stroke seçenekleri

### 6. Arrow Tool (Ok)
**Dosya:** `js/ArrowTool.js`

#### Özellikler:
- **Basınç hassasiyeti:** Kapalı
- **Ok Uçları:** Başlangıç ve bitiş için ayrı ayrı seçilebilir (None, Triangle, Line, Circle, Square, Bar)
- **Yol Tipleri:** Düz (Straight), Eğri (Curved), Dirsek (Elbow)
- **Çizgi Stilleri:** Düz, Kesik, Noktalı, Dalgalı (Wavy)

#### Eğri Ok Matematiği
Eğri oklar **Dairesel Yay (Circular Arc)** geometrisi kullanır.

1.  **Kontrol Noktası:**
    - Yay üzerindeki tepe noktayı temsil eder.
    - Her zaman başlangıç ve bitiş noktalarının **orta dikmesi (perpendicular bisector)** üzerinde kısıtlıdır.
    - Bu sayede yay her zaman simetrik kalır.

2.  **Amplified Constrained Dragging (Hızlandırılmış Sürükleme):**
    - Kullanıcı kontrol noktasını sürüklerken, fare hareketi orta dikme vektörü üzerine iz düşürülür.
    - Bu iz düşüm **4.0x** çarpanı ile genişletilir.
    - Sonuç: Küçük fare hareketleri kavis yarıçapında büyük ve akıcı değişimler yaratır.

3.  **Teğet Ok Başları:**
    - Ok başları, yayın uç noktalarındaki teğet (tangent) açısına göre döndürülür.

### 7. Eraser Tool (Silgi)
**Dosya:** `js/EraserTool.js`

#### Çalışma Prensibi:
- Hit detection ile nesneleri tespit eder
- Tıklanan nesneyi siler

### 8. Select Tool (Seçim)
**Dosya:** `js/SelectTool.js`

#### Özellikler:
- Tek tıklama ile seçim
- Rubber band selection (sürükle-seç)
- Grup/Ungroup
- Transform (taşı, döndür, ölçekle)

---

## 🎯 Rendering Yaklaşımları

### 1. Overlapping Circles (Pen Tool)
**Kullanım:** Basınç hassasiyetli çizimler

**Avantajlar:**
- Mükemmel yuvarlak uçlar
- Smooth geçişler
- Opacity kontrolü

**Dezavantajlar:**
- Daha fazla daire çizimi (performans)

### 2. Single Path (Highlighter)
**Kullanım:** Sabit kalınlık, transparent çizgiler

**Avantajlar:**
- Hızlı rendering
- Opacity birikimi yok

### 3. Standard Canvas API (Shapes)
**Kullanım:** Geometrik şekiller

**Avantajlar:**
- Basit ve hızlı
- Tarayıcı optimizasyonu

---

## 🔧 Performans Optimizasyonları

### 1. Temporary Canvas
Overlapping circles yönteminde opacity birikimini önlemek için:
```javascript
const tempCanvas = document.createElement('canvas');
const tempCtx = tempCanvas.getContext('2d');
// Tüm çizimler tempCanvas'a
ctx.drawImage(tempCanvas, 0, 0);  // Tek seferde ana canvas'a
```

### 2. Point Simplification
Gereksiz noktaları azaltmak için Douglas-Peucker benzeri algoritma

### 3. Minimum Distance
Çok yakın noktaları filtreleyerek nokta sayısını azaltma

---

## 📊 Durum Yönetimi

### Global State
**Dosya:** `js/app.js`

```javascript
this.state = {
    currentTool: 'pen',
    strokeColor: '#000000',
    strokeWidth: 2,
    lineStyle: 'solid',
    opacity: 1.0,
    pressureEnabled: true,  // Pen için varsayılan: true
    highlighterCap: 'round',
    arrowStartStyle: 'none',
    arrowEndStyle: 'triangle',
    arrowPathType: 'straight',
    objects: []
};
```

### Tool-Specific Defaults
- **Pen:** `pressureEnabled: true`, `opacity: 1.0`
- **Highlighter:** `pressureEnabled: false`, `opacity: 0.7`
- **Shapes:** `pressureEnabled: false`, `opacity: 1.0`

---

## 🎨 UI Davranışları

### Basınç Hassasiyeti Butonu
**Dosya:** `js/PropertiesSidebar.js`

- Pen tool seçildiğinde: Otomatik aktif
- Shape tools seçildiğinde: Otomatik pasif
- Manuel toggle: Her zaman mümkün

### Opacity Slider
- Highlighter: 70% varsayılan
- Diğerleri: 100% varsayılan
- Seçili nesnelere uygulanabilir

### Arrow Settings (Ok Ayarları)
**Yapı:** Sidebar + Popover Menüler
- Sidebar genişliğini korumak için seçenekler sidebar içinde değil, yan tarafta açılan **Popover (Modal)** menülerde sunulur.
- Tetikleyici butonlar ikon bazlıdır.
- `overflow: visible` CSS özelliği sayesinde menüler sidebar sınırlarının dışına taşabilir.

---

## 🔮 Gelecek Geliştirmeler İçin Notlar

### Basınç Hassasiyeti
- Taper miktarı kullanıcı ayarlanabilir yapılabilir (0.25 şu an sabit)
- Başlangıç noktası için de taper eklenebilir
- Farklı taper profilleri (linear, exponential, vb.)

### Rendering
- WebGL rendering için hazırlık
- Brush texture desteği
- Daha fazla brush tip (airbrush, watercolor, vb.)

### Performans
- Web Worker ile arka plan rendering
- Canvas pooling
- Lazy rendering (viewport dışı nesneler)

### iconlar

---

**Son Güncelleme:** 2025-12-12
**Versiyon:** 1.0
