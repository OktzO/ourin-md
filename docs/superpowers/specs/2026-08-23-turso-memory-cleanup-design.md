# Design: Turso DB+Session, Memory Audit, Deep Cleanup

## Goal
1. Pindah DB + session ke Turso (libsql) — data aman di remote, backup otomatis.
2. Pangkas penggunaan memory tanpa mengubah perilaku 267 plugin.
3. Cleanup lebih dalam yang menjangkau semua titik.

## Non-Goal
- Tidak menulis ulang akses `db.data.*` di 267 plugin — API existing tetap.
- Tidak mengubah logika bisnis bot.

## Constraints
- Pakai `@libsql/client` (native, sudah mature). Client HTTP untuk Turso.
- Fallback: jika Turso tidak dikonfigurasi, jatuh kembali ke file JSON seperti sekarang.
- Semua data harus tetap tersedia di RAM (DB layer tetap in-memory dengan write-behind ke Turso).

---

## 1. Turso — Database Layer

### Pendekatan: JSON blob per store
DB saat ini pakai lowdb (JSON file sync, seluruh store di RAM, flush debounce 5s). 267 plugin akses `db.data.users` dll. langsung.

Solusi: simpan **satu row per store** di Turso.

Schema:
```sql
CREATE TABLE IF NOT EXISTS stores (
  key TEXT PRIMARY KEY,       -- 'users' | 'groups' | 'settings' | 'stats' | 'sewa' | 'premium' | 'owner' | 'partner'
  data TEXT NOT NULL,         -- JSON.stringify(store.data)
  updated_at INTEGER NOT NULL
);
```

`ourin-database.js`:
- `init()`: baca semua store dari Turso. Jika kosong, buat defaults. Juga migrasi: jika file JSON lokal ada dan Turso kosong → seed ke Turso.
- `_asyncWrite(key)`: tulis blob JSON ke Turso (replace ke tabel `stores`). Tidak tulis ke file lagi saat Turso aktif.
- `flushAll()`, `save()`, `backup()`: tetap API yang sama, tapi menulis ke Turso.
- Fallback: `config.turso?.enabled === false` atau error koneksi → mode file JSON (perilaku existing).

### Local JSON file
Ketika Turso aktif:
- File `database/main/*.json` TIDAK lagi ditulis (write-behind ke Turso).
- Data lokal dibiarkan sebagai cadangan, tidak dihapus (safe).

---

## 2. Turso — Session Layer

### Custom `useTursoAuthState()`
Ganti `useMultiFileAuthState()` di:
- `src/connection.js` (bot utama)
- `src/lib/ourin-jadibot-manager.js` (jadibot)

Schema:
```sql
CREATE TABLE IF NOT EXISTS session_creds (
  scope TEXT PRIMARY KEY,     -- 'main' | jadibot jid
  creds TEXT NOT NULL,        -- JSON.stringify(creds)
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_keys (
  scope TEXT NOT NULL,        -- 'main' | jadibot jid
  category TEXT NOT NULL,     -- 'app-state-sync-key', 'session', 'identity-key', dll
  id TEXT NOT NULL,           -- key id
  data TEXT NOT NULL,         -- JSON.stringify(value)
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope, category, id)
);
```

Baileys auth state contract (dari `@whiskeysockets/baileys` / `ourin-baileys`):
- `state.creds` (objek creds)
- `state.keys` dengan method:
  - `get(type, ids)` → Promise<Record<id, value>>
  - `set(data)` → Promise<void>
  - `getMany?` / `getAll?(type)` → baca semua (dipakai signal store untuk index)
- `saveCreds()` — dijalankan saat `creds.update`; menulis creds ke store.

Implementasi `useTursoAuthState(scope)`:
- `creds` di-cache di RAM (LoadStateFromStorage), selalu write-through ke `session_creds`.
- `keys.set`: tulis ke `session_keys` (upsert). Buffer dengan micro-batch? Untuk kesederhanaan, tulis langsung (keys update jarang, burst kecil).
- `keys.get`: cek RAM cache (Map), miss → query Turso, isi cache.
- `keys.getAll`: query semua row untuk kategori itu, kembalikan Map/object.
- Return `{ state: { creds, keys }, saveCreds }`.

### JADIBOT multi-session
- Scope per jadibot: `jadibot:<jid>`.
- Tabel yang sama, beda scope.

---

## 3. Memory Audit

### Store messages (connection.js)
- `messages` Map cap 200/chat → turun ke **50/chat** (cukup untuk `getMessage` callback dan anti-del).
- `chats` Map: batasi 500 entries, evict LRU (Map insertion order — hapus yang lama).
- `contacts` object: batasi 500 entries.

### Cache
- `groupCache` NodeCache TTL 5m → **3m**.
- `msgRetryCounterCache` TTL 60s — sudah ok.
- Lid-cache (`ourin-context.js`) — cek TTL dan cap.

### Lazy load audit
- Sudah: sharp, tesseract, skia→@napi-rs/canvas.
- Audit sisa: `ourin-agent.js` (di-load di boot `index.js` line 38 — `.catch(()=>{})`, cek apakah bisa didefer sampai command dipakai).
- Modul berat lain (cheerio, jsdom, katex) di-load per-plugin saat dibutuhkan — verifikasi tidak ada import top-level berat di `handler.js`.

### Timer unref
- Semua `setInterval` yang `unref` sudah. Audit yang belum: flush timer DB, pruner, temp cleaner, memory monitor.

### GC
- Setelah `flushAll()` di timer flush, panggil `global.gc?.()` saat RSS > 700MB saja (tidak tiap flush).

---

## 4. Deep Cleanup

### Temp cleaner (perbaikan)
- Scan **recursive** (bukan hanya flat).
- Hapus file berumur > `MAX_AGE_MS` (default 1 jam), bukan semua file.
- Tulis total ukuran yang dibersihkan ke log.
- Jangan hapus file dalam 5 menit terakhir (masih mungkin dipakai).

### Data pruner (perluasan)
- Users: hapus non-aktif >14 hari (existing) — pertahankan.
- Groups: hapus non-aktif >14 hari (existing) — pertahankan.
- **Baru**: expired premium/partner entries — hapus dari array `db.data.premium`/`partner`.
- **Baru**: chat history stale — store messages Map, hapus jid yang tidak aktif.
- **Baru**: orphan jadibot sessions (tidak aktif >30 hari) — hapus dari Turso session_keys scope jadibot.

### Auto-backup (perluasan)
- `ourin-backup.js` — jika Turso aktif, snapshot ke Turso (tabel `backup_snapshots`).
- Simpan juga sebagai file local (existing behavior) — dual.

---

## 5. Config Baru

```js
turso: {
  url: "libsql://whatsapp-oktzo.aws-ap-northeast-1.turso.io",
  authToken: "<JWT dari user>",
  syncInterval: 5000, // ms — write-behind DB
  enabled: true,
},
```

`enabled: false` → semua fitur Turso mati, fallback ke file JSON + file session.

---

## 6. Error Handling
- Semua panggilan Turso dibungkus try/catch. Jika gagal:
  - DB: fallback ke file JSON untuk store itu, log warn.
  - Session: fallback ke `useMultiFileAuthState`, log warn.
- Boot tidak pernah crash karena Turso mati.

## 7. Testing
- `npm test` (existing) tetap pass.
- Boot bot (timeout 25s) — 791 plugin load, tidak ada error import.
- Satu test kecil: `tests/turso-db.test.mjs` — verifikasi in-memory store API (tanpa koneksi Turso nyata; mock atau mode offline). Gunakan `node:test` (sudah dipakai).

## Files Affected
- `package.json` — tambah `@libsql/client`.
- `config.js` — blok `turso`.
- `src/lib/ourin-database.js` — backend Turso.
- `src/lib/ourin-turso.js` (baru) — client + helper (migrasi, backup snapshot).
- `src/lib/ourin-turso-session.js` (baru) — `useTursoAuthState`.
- `src/connection.js` — pakai Turso session.
- `src/lib/ourin-jadibot-manager.js` — pakai Turso session (scope jadibot).
- `src/lib/ourin-memory-monitor.js` — GC threshold.
- `src/lib/ourin-temp-cleaner.js` — recursive + age filter.
- `src/lib/ourin-data-pruner.js` — expired premium, orphan jadibot.
- `index.js` (boot) — init turso session.

## Rollback
- `config.turso.enabled = false` → kembali ke file JSON + file session penuh.
- File lokal tidak pernah dihapus saat migrasi, jadi rollback aman.
