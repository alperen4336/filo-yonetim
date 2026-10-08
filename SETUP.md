# Filo Yönetim V2 — Adım 2

Bu sürüm Supabase'e bağlanır ve ilk gerçek CRUD modülünü çalıştırır: **Araçlar**.

## 1) Projeyi çalıştır

Node.js 20.19+ veya 22.12+ kurulu olsun.

```bash
npm install
npm run dev
```

## 2) Supabase bağlantısını ekle

Proje klasöründe `.env.local` oluştur:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Değerleri Supabase Dashboard > Connect bölümünden al.

## 3) İlk kullanım

1. Uygulamayı aç.
2. Hesap oluştur.
3. Giriş yap.
4. Uygulama ilk şirket kaydını otomatik oluşturur.
5. Sağ üstten **Araç Ekle**.
6. Araç bilgilerini doldur ve oluştur.
7. Araç Supabase `vehicles` tablosuna kaydedilir.
8. Düzenle/Sil işlemleri de gerçek veritabanında yapılır.

## Önemli

- `filo-takip-v1-backup.html` eski sürümün yedeğidir.
- `.env.local` dosyasını Git'e veya ZIP'e koyma.
- Supabase SQL şemasını Adım 1'de zaten çalıştırmış olmalısın.
