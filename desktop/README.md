# Personal Agentic Chat — Proje Dokümantasyonu

> **Proje Amacı:** İnternet bağlantısı gerektirmeyen, buluta hiçbir veri göndermeyen, tamamen yerel çalışan bir kişisel yapay zeka asistan. WhatsApp konuşma geçmişiniz, notlarınız ve e-postalarınız üzerinde doğal dilde soru sormanıza olanak tanır.

---

## Teknoloji Yığını (Tech Stack)

| Katman | Teknoloji |
|---|---|
| **Arayüz & Sunucu** | Next.js 16 (App Router, TypeScript) |
| **LLM (Sohbet)** | Ollama → `gemma4` |
| **Embedding (Vektörleştirme)** | Ollama → `embeddinggemma` |
| **Vektör Veritabanı** | LanceDB (`.lancedb/` dizininde yerel) |
| **İlişkisel Veritabanı** | SQLite via `better-sqlite3` (`assistant.db`) |

---

## Veri Boru Hattı (Data Pipeline)

Bir WhatsApp `.txt` dosyası yüklediğinizde, arka planda şu 4 adımlı süreç işler:

```
WhatsApp .txt Dosyası
       │
       ▼
  1. PARSE (Ayrıştırma)
  whatsappParser.ts
       │
       ▼
  2. CHUNK (Parçalama)
  chunking.ts
       │
       ▼
  3. EMBED (Vektörleştirme)
  embedding.ts → Ollama (embeddinggemma)
       │
       ▼
  4. STORE (Kaydetme)
  LanceDB (vektörler) + SQLite (ham mesajlar + checkpoint)
```

---

## Adım 1: Parse — Mesajları Okuma

**Dosya:** `src/lib/whatsappParser.ts`

WhatsApp iki farklı tarih formatıyla dışa aktarır. Parser her iki formatı destekler:

```
Format 1 (iOS / Yeni):   [23.12.2023 14:30:15] Eray ÖZ: Merhaba!
Format 2 (Android):       23/12/2023, 14:30 - Eray ÖZ: Merhaba!
```

**Nasıl çalışır?**
- Dosya satır satır okunur.
- Her satır regex ile eşleştirilir: `^\[?(.*?)(?:\]| -) (.*?): (.*)`
- Eşleşen satır `{ date, sender, content }` nesnesine dönüştürülür.
- Eşleşmeyen satır (çok satırlı mesaj gövdesi) bir önceki mesajın `content` alanına eklenir.

---

## Adım 2: Chunk — Konuşmaları Parçalara Bölme

**Dosya:** `src/lib/chunking.ts`

Mesajlar doğrudan yapay zekaya gönderilemez; binlerce satırlık konuşma bir modelin bağlam penceresini doldurur ve anlamsal odak dağılır. Bu yüzden mesajlar anlamsal bütünlüğü koruyacak küçük **chunk**'lara bölünür.

### Parametreler

| Parametre | Değer | Açıklama |
|---|---|---|
| `maxGapMinutes` | **60 dk** | İki mesaj arasındaki süre 60 dakikayı geçerse yeni chunk başlar. |
| `windowSize` | **10 mesaj** | Bir chunk'ta en fazla 10 mesaj bulunabilir. |
| `overlapSize` | **2 mesaj** | Chunk sınırında bağlamı korumak için bir önceki chunk'ın son 2 mesajı yeni chunk'a da eklenir. |
| `maxCharsPerChunk` | **600 karakter** | Karaktere göre üst limit — kod bloğu veya uzun paragraf içeren mesajlar için güvenlik kapısı. |

### Kaç Chunk Oluşturulur?

Tamamen konuşma yoğunluğuna bağlıdır:
- Kısa ve sık mesajlaşma: Her 5-8 mesajda bir chunk (windowSize'a ulaşmadan önce charlar dolabilir)
- Seyrek ve uzun mesajlar: Tek bir uzun mesaj kendi chunk'ına girer
- 39.000 mesajlık büyük bir geçmiş → yaklaşık **39.000–50.000 chunk** arası

### Neden Küçük Chunk?

RAG'in altın kuralı: **chunk ne kadar spesifik, vektör o kadar isabetli.**

600 karakter ≈ 5-8 normal WhatsApp mesajı için bir üst sınır. Bu boyutta chunk'ın vektörü tek bir konuya sıkı sıkıya odaklanır. Mesela "Fixdual alerji hapı" içeren bir mesaj kendi chunk'ında oturur ve vektörü o anlamı doğrudan temsil eder — yüzlerce kelimeye karışıp seyrelmez.

### Sliding Window + Overlap

```
Mesajlar:   1  2  3  4  5  6  7  8  9  10  11  12  ...
                                                         
Chunk 1:   [1  2  3  4  5  6  7  8  9  10]
                                   │
Overlap:                    [9  10] (son 2 mesaj kopyalanır)
                                   ▼
Chunk 2:                    [9  10  11  12  ...]
```

---

## Adım 3: Embed — Vektöre Çevirme

**Dosya:** `src/lib/embedding.ts`

Her chunk metni Ollama'nın yerel `embeddinggemma` modeline gönderilir. Model bu metni **768 boyutlu** bir sayı dizisine çevirir.

```
"Fixdual alerji hapı" → [0.023, -0.412, 0.887, ...] (768 sayı)
```

Anlamca yakın metinler uzayda birbirine yakın noktalarda durur. Bu yüzden `"ilaç"` sorusu `"hap"` mesajını bulabilir.

**Güvenlik önlemleri:**
- Embedding'e gönderilmeden önce metin 800 karakterde kırpılır (model context limitini aşmamak için)
- Ollama geçici olarak çökerse 3 kez yeniden denenir (2s → 4s → 6s bekleme süresiyle)

---

## Adım 3.5: Checkpoint — Kaldığı Yerden Devam

**Dosya:** `src/lib/db.ts` + `upload/route.ts`

39.000 chunk'lık büyük dosyaları embed etmek saatler sürebilir. Süreç yarıda kesilirse (Ollama crash, elektrik, vs.) sıfırdan başlamamak için **checkpoint** sistemi entegre edildi.

**Nasıl çalışır?**
1. Yüklenen dosyanın MD5 hash'i hesaplanır.
2. `embedding_jobs` tablosuna `{ file_hash, total_chunks, completed_chunks }` kaydedilir.
3. Her **500 chunk**'ta bir LanceDB'ye yazılır ve `completed_chunks` güncellenir.
4. Hata durumunda aynı dosyayı tekrar yüklerseniz sistem şunu söyler:
   ```
   🔄 Checkpoint found! Resuming from chunk 18500/39000 (47% already done)...
   ```

**Sonuç:** En kötü senaryoda yalnızca son 500 chunk (kaydetmeden önceki batch) yeniden hesaplanır.

---

## Adım 4: Agentic RAG — Soru Sorma Süreci

**Dosya:** `src/app/api/whatsapp/chat/route.ts`

### 4a. Query Expansion (Sorgu Genişletme)

Soru önce `gemma4` modeline gönderilir, Türkçe eş anlamlılar üretilir:

```
Soru:           "İlaçlarla ilgili mesaj var mı?"
Gemma üretir:   "hap, şurup, reçete, eczane, tedavi"
Süper Sorgu:    "İlaçlarla ilgili mesaj var mı? hap, şurup, reçete, eczane, tedavi"
```

Bu teknik RAG literatüründe **HyDE (Hypothetical Document Expansion)** veya **Agentic RAG** olarak geçer.

### 4b. Vektör Araması

Süper sorgu `embeddinggemma` ile vektöre çevrilir. LanceDB bu vektörün en yakın **25 komşusunu** (chunk'ını) bulur.

### 4c. Cevap Üretme

Bulunan 25 chunk bağlam olarak `gemma4`'e aktarılır. Model yalnızca bu bağlama dayanarak yanıt üretir ve yanıt **akış (stream)** olarak tarayıcıya iletilir.

---

## Veritabanı Mimarisi

### SQLite (`assistant.db`)

```sql
-- Ham WhatsApp mesajları
CREATE TABLE whatsapp_messages (
  id, message_date, sender, content, created_at
);

-- Embedding job durumu (checkpoint için)
CREATE TABLE embedding_jobs (
  file_hash TEXT UNIQUE,   -- MD5 hash, hangi dosya olduğunu tanır
  total_chunks INTEGER,
  completed_chunks INTEGER, -- kaçıncı chunk'ta kaldık
  status TEXT              -- 'in_progress' | 'done'
);

-- Çoklu sohbet oturumları (tüm modüller için)
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  module TEXT,             -- 'whatsapp', 'notes', 'gmail' vs.
  title TEXT,
  created_at, updated_at
);

-- Her oturumdaki kullanıcı & agent mesajları
CREATE TABLE chat_messages (
  session_id TEXT,
  role TEXT,               -- 'user' | 'agent'
  content TEXT,
  created_at
);
```

### LanceDB (`.lancedb/`)

```
{
  vector: float32[768],
  text: string,
  sessionId: string,
  startTime: string,
  endTime: string,
  messageCount: number
}
```

---

## Proje Dizin Yapısı

```
desktop/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chats/
│   │   │   │   ├── route.ts                  # Sohbet listele / yarat
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts              # İsim değiştir / sil
│   │   │   │       └── messages/
│   │   │   │           └── route.ts          # Mesajları oku / kaydet
│   │   │   └── whatsapp/
│   │   │       ├── chat/route.ts             # Agentic RAG sohbet
│   │   │       ├── upload/route.ts           # Dosya yükle, embed et, checkpoint
│   │   │       ├── status/route.ts           # DB dolu mu?
│   │   │       └── search/route.ts           # Ham vektör araması
│   │   └── whatsapp/
│   │       └── page.tsx                      # WhatsApp modülü arayüzü (ChatGPT tarzı)
│   └── lib/
│       ├── whatsappParser.ts                 # Mesaj ayrıştırıcı (regex, çok satır desteği)
│       ├── chunking.ts                       # Sliding Window Chunker (10 msg, 600 char)
│       ├── embedding.ts                      # Ollama Embedding istemcisi (embeddinggemma)
│       ├── llm.ts                            # Ollama LLM istemcisi (stream + completion)
│       ├── vectorDb.ts                       # LanceDB bağlantı yöneticisi
│       └── db.ts                             # SQLite başlatıcı (4 tablo)
├── .lancedb/                                 # Vektör veritabanı (gitignore'd)
└── assistant.db                              # SQLite veritabanı (gitignore'd)
```

---

## Gizlilik Garantisi

Hiçbir veri internet üzerinden gönderilmez:

```
Kullanıcı Verisi → Ollama (localhost:11434) → Yerel Disk
                         ↑
                   Tamamen Offline
```

- `embeddinggemma` ve `gemma4` modelleri bilgisayarınızda yerel çalışır.
- `.lancedb/` ve `assistant.db` yalnızca yerel diskinizde bulunur, `.gitignore` ile commit edilmez.

---

## Sonraki Adımlar

- [ ] **Apple Notes Modülü** — Mac'teki notları aynı RAG hattına eklemek
- [ ] **Gmail Modülü** — E-postaları okuyup indekslemek
- [ ] **Agentic Router** — Kullanıcının sorusuna göre hangi modülü kullanacağını seçen yönlendirici katman
