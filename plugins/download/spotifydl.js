import path from "node:path";
import axios from "axios";

const BASE_URL = "https://spotisaver.net";
const LANG = "en";
const FILENAME_TAG = "OURIN";

const MAX_DOWNLOAD_RETRY = 5;
const RETRY_DELAYS = [5000, 8000, 12000, 18000, 25000];
const ua = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";

let cookieStore = {
  "_s-uid": `v_${Math.random().toString(16).slice(2, 16)}.${Math.floor(Math.random() * 100000000)}`,
  lang: LANG
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanInput(input) {
  return String(input || "").trim().replace(/%0A/gi, "").replace(/%0D/gi, "").replace(/\r|\n/g, "");
}

function randomIp() {
  return [
    Math.floor(Math.random() * 223) + 1,
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256)
  ].join(".");
}

function cookieHeader() {
  return Object.entries(cookieStore)
    .filter(([, v]) => v !== undefined && v !== null && String(v).length)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function splitSetCookie(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g);
}

function saveCookies(headers) {
  const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : splitSetCookie(headers.get("set-cookie"));
  for (const item of raw) {
    const part = item.split(";")[0];
    const i = part.indexOf("=");
    if (i > -1) cookieStore[part.slice(0, i)] = part.slice(i + 1);
  }
}

function jsonBase64(data) {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

function parseSpotify(input) {
  const cleaned = cleanInput(input);
  const url = new URL(cleaned);
  const parts = url.pathname.split("/").filter(Boolean);
  return { raw: cleaned, type: parts[0] || "track", id: parts[1] || cleaned };
}

function safeName(name) {
  return String(name || "spotify-audio.mp3").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(Number(bytes))) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function getFilenameFromDisposition(disposition) {
  if (!disposition) return null;
  const utf = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf?.[1]) return decodeURIComponent(utf[1].replace(/^"|"$/g, ""));
  const normal = disposition.match(/filename="([^"]+)"/i);
  if (normal?.[1]) return normal[1];
  return null;
}

function isHtml(text, contentType) {
  return contentType.includes("text/html") || /^\s*<!doctype html|^\s*<html/i.test(text);
}

function parseMaybeJson(buffer, contentType) {
  const text = buffer.toString("utf8");
  let json = null;
  if (contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try { json = JSON.parse(text); } catch { }
  }
  return { text, json };
}

async function warmup(parsed) {
  const urls = [`${BASE_URL}/en1`, `${BASE_URL}/en/${parsed.type}/${parsed.id}/`];
  for (const url of urls) {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(60000),
      headers: {
        "user-agent": ua,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "cookie": cookieHeader()
      }
    }).catch(() => null);
    if (res) {
      saveCookies(res.headers);
      await res.arrayBuffer().catch(() => null);
    }
  }
}

async function requestJson(url, extraHeaders = {}, referer = `${BASE_URL}/en1`) {
  const res = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(60000),
    headers: {
      "user-agent": ua,
      "accept": "application/json",
      "sec-ch-ua-platform": "\"Android\"",
      "sec-ch-ua": "\"Google Chrome\";v=\"147\", \"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"147\"",
      "sec-ch-ua-mobile": "?1",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      "referer": referer,
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "cookie": cookieHeader(),
      "priority": "u=1, i",
      ...extraHeaders
    }
  });
  saveCookies(res.headers);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { }
  return { code: res.status, ok: res.ok, contentType: res.headers.get("content-type") || "", text, data };
}

async function requestDownloadOnce(url, body, referer) {
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(120000),
    headers: {
      "user-agent": ua,
      "sec-ch-ua-platform": "\"Android\"",
      "sec-ch-ua": "\"Google Chrome\";v=\"147\", \"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"147\"",
      "sec-ch-ua-mobile": "?1",
      "content-type": "application/json",
      "accept": "*/*",
      "origin": BASE_URL,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      "referer": referer,
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "cookie": cookieHeader(),
      "priority": "u=1, i"
    },
    body: JSON.stringify(body)
  });
  saveCookies(res.headers);
  const contentType = res.headers.get("content-type") || "";
  const disposition = res.headers.get("content-disposition") || "";
  const buffer = Buffer.from(await res.arrayBuffer());
  const parsed = parseMaybeJson(buffer, contentType);
  return { code: res.status, ok: res.ok, contentType, disposition, buffer, text: parsed.text, json: parsed.json };
}

async function requestDownload(url, body, referer) {
  const attempts = [];
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRY; attempt++) {
    const dl = await requestDownloadOnce(url, body, referer);
    const errorText = dl.json?.error || dl.text.slice(0, 200);
    const noSlots = dl.json?.error === "No available slots" || dl.text.includes("No available slots");
    attempts.push({ Attempt: attempt, Code: dl.code, Content_type: dl.contentType, Error: dl.contentType.includes("audio") ? null : errorText, Retry: noSlots && attempt < MAX_DOWNLOAD_RETRY });
    if (dl.ok && dl.contentType.includes("audio")) return { ...dl, ok: true, attempts };
    if (!noSlots || attempt >= MAX_DOWNLOAD_RETRY) return { ...dl, ok: false, attempts };
    await sleep(RETRY_DELAYS[attempt - 1] || 25000);
  }
  return { code: 500, ok: false, contentType: "application/json", disposition: "", buffer: Buffer.from(JSON.stringify({ error: "Max retry reached" })), text: JSON.stringify({ error: "Max retry reached" }), json: { error: "Max retry reached" }, attempts };
}

async function getSignature(action, ctxPayload, referer) {
  const ctx = jsonBase64(ctxPayload);
  const url = `${BASE_URL}/api/get_signature.php?action=${encodeURIComponent(action)}&ctx=${encodeURIComponent(ctx)}`;
  return await requestJson(url, {}, referer);
}

const pluginConfig = {
  name: "spotifydl",
  alias: ["spdl", "spotify-dl", "spotdl"],
  category: "download",
  description: "Unduh lagu favoritmu langsung dari Spotify tanpa ribet!",
  usage: ".spdl <link>",
  example: ".spdl https://open.spotify.com/track/...",
  cooldown: 15,
  energi: 1,
  isEnabled: true,
};

async function handler(m, { sock }) {
  const text = m.text?.trim();

  if (!text || !/open\.spotify\.com\/track/i.test(text)) {
    return m.reply("❌ *Waduh, link Spotify-nya mana nih atau kurang tepat!*\n\nKamu harus memasukkan tautan (link) lagu dari Spotify yang valid. Pastikan itu adalah link ke track/lagu ya! \n\nContoh: `.spdl https://open.spotify.com/track/3RY0NyQQXxuAiyk5eAS4fC`");
  }

  await m.react("🕕");

  try {
    const parsed = parseSpotify(text);
    const cleanUrl = parsed.raw;
    const pageReferer = `${BASE_URL}/en/${parsed.type}/${parsed.id}/`;
    const autoIp = randomIp();

    await warmup(parsed);

    const playlistSig = await getSignature("get_playlist", {
      id: parsed.id,
      type: parsed.type,
      lang: LANG
    }, pageReferer);

    if (!playlistSig.ok || !playlistSig.data?.success || !playlistSig.data?.token || !playlistSig.data?.exp) {
      await m.react("❌");
      return m.reply("⚠️ *Gagal memverifikasi sesi Spotify!* \n\nMohon pastikan tautan yang kamu berikan valid atau coba beberapa saat lagi ya.");
    }

    const playlistUrl = `${BASE_URL}/api/get_playlist.php?id=${encodeURIComponent(parsed.id)}&type=${encodeURIComponent(parsed.type)}&lang=${encodeURIComponent(LANG)}`;
    const playlist = await requestJson(playlistUrl, { "x-pe": String(playlistSig.data.exp), "x-pt": String(playlistSig.data.token) }, pageReferer);

    if (!playlist.ok || !playlist.data?.tracks?.length) {
      await m.react("❌");
      return m.reply("⚠️ *Waduh, lagu tidak ditemukan!* \n\nSepertinya lagu tersebut tidak tersedia atau tautan salah.");
    }

    const info = playlist.data.playlist_info || {};
    const track = playlist.data.tracks[0];
    const realTrackId = track.id || parsed.id;
    const realReferer = `${BASE_URL}/en/track/${realTrackId}/`;

    const downloadCtx = { lang: LANG, id: String(realTrackId), name: String(track.name || ""), duration_ms: String(track.duration_ms || "") };
    const downloadSig = await getSignature("download_track", downloadCtx, realReferer);

    if (!downloadSig.ok || !downloadSig.data?.success || !downloadSig.data?.token || !downloadSig.data?.exp) {
      await m.react("❌");
      return m.reply("⚠️ *Gagal meminta kunci unduhan!* \n\nServer kami sedang sibuk, mohon coba lagi ya.");
    }

    const sigPayload = jsonBase64({ token: String(downloadSig.data.token), exp: String(downloadSig.data.exp) });
    const dlUrl = `${BASE_URL}/api/download_track.php?sig=${encodeURIComponent(sigPayload)}`;

    const body = { track, download_dir: "downloads", filename_tag: FILENAME_TAG, user_ip: autoIp, is_premium: false, lang: LANG };
    const dl = await requestDownload(dlUrl, body, realReferer);

    if (!dl.ok || !dl.contentType.includes("audio")) {
      await m.react("❌");
      return m.reply("😔 *Gagal mengunduh audio.* \n\nMungkin ada batasan dari server atau lagu tidak tersedia untuk diunduh.");
    }

    const headerName = getFilenameFromDisposition(dl.disposition);
    const filename = safeName(headerName || `${track.artists?.join(", ") || info.owner || "Spotify"} - ${track.name || info.name || realTrackId} (${FILENAME_TAG}).mp3`);

    await sock.sendMessage(m.chat, {
      audio: dl.buffer,
      mimetype: "audio/mpeg",
      fileName: filename,
      ptt: false
    }, { quoted: m });

    await m.react("✅");

  } catch (error) {
    console.error(error);
    await m.react("❌");
    m.reply("😔 *Terjadi kesalahan sistem saat memproses tautan Spotify tersebut.* Mohon coba lagi nanti ya!");
  }
}

export { pluginConfig as config, handler };
