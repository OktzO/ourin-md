# Infra — Ourin-MD v3.2.0

## Arsitektur Garis Besar

```
index.js                  → entry point, init semua subsystem
config.js                 → config tunggal + helper functions (isOwner, isPremium, dll)
case/ourin.js             → case-based command handler (minor, ~5 built-in commands)
src/connection.js         → WhatsApp WebSocket connection (Baileys)
src/handler.js            → message router (2234 line, pusat routing)
src/lib/*                 → 68 library modules
src/scraper/*             → 59 scraper modules
plugins/<kategori>/*.js   → 815+ plugin files (34 kategori)
assets/                   → media assets (images, fonts, audio, video)
database/                 → runtime data files (JSON, lowdb)
session/                  → WhatsApp session files
tests/                    → node:test tests
```

## Alur Eksekusi

```
1. index.js: main()
   ├── initDatabase()        → lowdb + Turso
   ├── preloadAssets()       → cache assets ke memory
   ├── loadPlugins()         → scan plugins/*, load + register tiap plugin
   ├── initScheduler()       → cron jobs
   ├── setupAntiCrash()      → global error handlers
   └── startConnection()     → WhatsApp WebSocket
        ├── onRawMessage     → anti-tag status
        ├── onMessage        → messageHandler() (core router)
        ├── onGroupUpdate    → groupHandler()
        ├── onMessageUpdate  → messageUpdateHandler()
        ├── onGroupSettingsUpdate → groupSettingsHandler()
        ├── onStubMessage    → anti-remove
        └── onConnectionUpdate
             └── connection "open" → init scheduler, jadibot restore, monitor, dll
```

## Message Routing (`handler.js`)

```
messageHandler(msg, sock)
  ├── serialize()          → raw WA msg → object `m` (command, args, body, dll)
  ├── filter spam/rate-limit
  ├── case handler (case/ourin.js) — built-in commands
  ├── if handled? → done
  ├── group protection (antilink, antitoxic, antidocument, dll)
  ├── game answer handler (sulap, tictactoe, suitpvp, ulartangga, family100, dll)
  ├── auto AI (auto-chat)
  ├── auto download (detect URL → download)
  ├── smart triggers (auto-reply by keyword)
  ├── sticker command handler
  ├── check permission: owner? premium? banned? group? admin? cooldown? energi?
  ├── getPlugin(command) → lookup di pluginStore
  └── plugin.handler(m, { sock, store, config, plugins })
```

## Plugin System (`src/lib/ourin-plugins.js`)

- **PluginStore**: 3 Maps — `commands` (name→plugin), `aliases` (alias→name), `categories` (kategori→plugin[])
- `loadPlugins(dir)` → scan subdirectory per kategori, `import()` tiap file `.js`, register
- `registerPlugin(plugin)` → masukkan ke store berdasarkan name + alias + category
- `getPlugin(name)` → lookup by name, fallback ke alias
- `hotReloadPlugin(filePath)` → `import()` dengan cache bust, ganti di store
- `unloadPlugin(name)` → hapus dari store
- Setiap plugin wajib export `config` (metadata) + `handler` (async function)

## Dual Routing

1. **Case** — `case/ourin.js`: switch-case sederhana, built-in, di-handle duluan di `messageHandler()`
2. **Plugin** — mayoritas command: lookup by name di `pluginStore`, eksekusi `handler()`

## Database (`src/lib/ourin-database.js`)

- **lowdb** (JSON file) — data utama: users, groups, settings, premium, transaksi, game state
- **Turso** (libsql) — session auth state (WhatsApp credentials)
- **ourin-premium-db.js** — JSON file fallback untuk owner/premium/partner list
- **ourin-jadibot-database.js** — sub-bot session data

## Session & Auth (`src/connection.js`)

- WhatsApp Multi-Device protocol via `ourin-baileys`
- Auth state: Turso (libsql) atau file-based
- Pairing code atau QR code
- Auto-reconnect dengan exponential backoff
- `ourin-reconnect.js` — reconnect logic

## Security

- `config.js`: strict number matching (`matchesNumber`) — mencegah privilege escalation via partial match
- `isOwner()` → cek config owner, DB owner, DB ownerNumbers
- `isPremium()` → owner/partner otomatis premium, cek expiry
- `isBanned()` → owner tidak bisa di-ban
- Middleware di handler: permission check sebelum eksekusi plugin
- Rate limiter (rate-limiter-flexible)
- Group protection: antilink, antitoxic, antispam, antibot, dll

## Key Libraries

| Library | Fungsi |
|---------|--------|
| `ourin-baileys` | WhatsApp MD protocol (fork of @whiskeysockets/baileys) |
| `lowdb` | JSON file database |
| `@libsql/client` | Turso/libsql edge database |
| `@napi-rs/canvas` | Canvas rendering (welcome card, dll) |
| `sharp` | Image processing |
| `fluent-ffmpeg` | Audio/video processing |
| `pino` | Logging (Baileys internal) |
| `cron` | Job scheduling |
| `rate-limiter-flexible` | Rate limiting |
| `node-webpmux` | Webp EXIF (sticker metadata) |
| `lru-cache` | Performance caching |
| `undici` | HTTP client |
| `axios` | HTTP requests |
| `cheerio` | HTML scraping |
| `tesseract.js` | OCR |
| `ssh2` | SSH (VPS management) |

## Direktori Plugin

| Kategori | Jumlah | Fungsi |
|----------|--------|--------|
| owner | 147 | Eval, exec,管理等 |
| group | 101 | Antilink, welcome, mute, dll |
| rpg | 67 | RPG game system |
| tools | 53 | Utility tools |
| cek | 48 | Quiz/check personality |
| ai | 45 | AI chat integration |
| search | 40 | Search engines |
| game | 36 | Interactive games |
| fun | 32 | Fun commands |
| download | 25 | Media downloaders |
| panel | 22 | Hosting panel |
| canvas | 20 | Image generation |
| sticker | 18 | Sticker creation |
| user | 17 | User profile |
| store | 14 | Store system |
| stalker | 14 | Profile stalking |
| random | 12 | Random content |
| clan | 9 | Clan system |
| primbon | 8 | Fortune telling |
| vps | 6 | VPS management |
| religi | 4 | Religious content |
| asupan | 4 | Social media content |
| info | 13 | Information |
| main | 20 | Core commands |
| + others | ~15 | Convert, media, nsfw, jpm, pushkontak, tts, utility, islamic, anime, ephoto |

## Case Commands

Built-in di `case/ourin.js`:
- `cping`, `cspeed`, `clatency` — ping/latency
- `listallcase`, `lcase`, `caselist`, `allcase` — daftar case
- `listallplugin`, `lplugin`, `pluginlist`, `allplugin` — daftar plugin

## Dev Mode

- `NODE_ENV=development` → dev mode aktif
- `config.dev.watchPlugins` → hot-reload plugin saat file berubah
- `config.dev.debugLog` → stack trace di error
- Anti-crash: uncaughtException + unhandledRejection handler
- SIGINT/SIGTERM: save database, exit safe