import axios from 'axios'
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLE_EMOJI_JSON_URL   = 'https://media.githubusercontent.com/media/Ditzzx-vibecoder/entahlah/main/emoji-apple.json';

const pluginConfig = {
    name: "iqc",
    alias: ["qc2"],
    category: "canvas",
    description: "Membuat Fake Quote iOS style.",
    usage: ".iqc [text/reply]",
    isOwner: false,
    isPremium: false,
    isGroup: false,
    isPrivate: false,
    cooldown: 5,
    energi: 2,
    isEnabled: true,
};

let appleEmojiMap = null;
let fontsLoaded = false;
const emojiImageCache = new Map();
let bgImgBuffer = null;

async function downloadFile(url) {
    const res = await axios.get(url, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 5 });
    return Buffer.from(res.data);
}

function emojiToUnicode(emoji) {
    return [...emoji].map(c => c.codePointAt(0).toString(16).padStart(4, '0')).join('-');
}

async function loadAppleEmojiMap() {
    if (appleEmojiMap) return appleEmojiMap;
    const buf = await downloadFile(APPLE_EMOJI_JSON_URL);
    appleEmojiMap = JSON.parse(buf.toString('utf-8'));
    return appleEmojiMap;
}

async function getEmojiImage(emoji) {
    if (emojiImageCache.has(emoji)) return emojiImageCache.get(emoji);
    const map = await loadAppleEmojiMap();
    const base = emojiToUnicode(emoji);
    const variants = [
        base,
        base.replace(/-fe0f/gi, ''),
        `${base.replace(/-fe0f/gi, '')}-fe0f`,
        base.toUpperCase(),
        base.replace(/-fe0f/gi, '').toUpperCase(),
        base.replace(/-fe0f/gi, '').toUpperCase() + '-FE0F',
    ];
    let b64 = null;
    for (const v of variants) {
        if (map[v]) { b64 = map[v]; break; }
    }
    if (!b64) return null;
    const buf = Buffer.from(b64, 'base64');
    const img = await loadImage(buf);
    emojiImageCache.set(emoji, img);
    return img;
}

async function drawAppleEmoji(ctx, emoji, x, y, size) {
    const img = await getEmojiImage(emoji);
    if (!img) {
        ctx.fillText(emoji, x, y);
        return;
    }
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}

const EMOJI_REGEX = /(\p{Emoji_Modifier_Base}\p{Emoji_Modifier}|\p{Emoji_Presentation}\uFE0F?|\p{Emoji}\uFE0F|[\u{1F1E0}-\u{1F1FF}]{2}|\p{Extended_Pictographic}\uFE0F?)/gu;

function measureTextCustom(ctx, text, fontSize) {
    const parts = text.split(EMOJI_REGEX);
    let totalWidth = 0;
    for (const part of parts) {
        if (!part) continue;
        EMOJI_REGEX.lastIndex = 0;
        if (EMOJI_REGEX.test(part)) {
            totalWidth += fontSize * 1.05;
        } else {
            totalWidth += ctx.measureText(part).width;
        }
        EMOJI_REGEX.lastIndex = 0;
    }
    return totalWidth;
}

async function drawTextWithEmojis(ctx, text, x, y, fontSize) {
    const parts = text.split(EMOJI_REGEX);
    let currentX = x;
    for (const part of parts) {
        if (!part) continue;
        EMOJI_REGEX.lastIndex = 0;
        if (EMOJI_REGEX.test(part)) {
            const emojiSize = fontSize * 1.05;
            const emojiCX = currentX + emojiSize / 2;
            const emojiCY = y;
            await drawAppleEmoji(ctx, part, emojiCX, emojiCY, emojiSize);
            currentX += emojiSize;
        } else {
            ctx.fillText(part, currentX, y);
            currentX += ctx.measureText(part).width;
        }
        EMOJI_REGEX.lastIndex = 0;
    }
}

function wrapText(ctx, text, maxWidth, fontSize) {
    ctx.font = `${fontSize}px InterRegular`;
    const words = text.split(" ");
    const lines = [];
    let cur = "";
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (word.includes('\n')) {
            const parts = word.split('\n');
            for (let j = 0; j < parts.length; j++) {
                const test = cur + (cur ? " " : "") + parts[j];
                if (measureTextCustom(ctx, test, fontSize) > maxWidth && cur) {
                    lines.push(cur); cur = parts[j];
                } else { cur = test; }
                if (j < parts.length - 1) { lines.push(cur); cur = ""; }
            }
            continue;
        }
        const test = cur + (cur ? " " : "") + word;
        if (measureTextCustom(ctx, test, fontSize) > maxWidth && i > 0) {
            lines.push(cur); cur = word;
        } else { cur = test; }
    }
    if (cur) lines.push(cur);
    return lines;
}

async function handler(m, { sock, text }) {
    try {
        const targetText = text || (m.quoted && m.quoted.text ? m.quoted.text : "");
        
        let targetImgBuffer = null;
        try {
            if (m.quoted && typeof m.quoted.download === 'function') {
                targetImgBuffer = await m.quoted.download();
            } else if (typeof m.download === 'function' && (m.isMedia || m.mtype === 'imageMessage' || m.type === 'imageMessage')) {
                targetImgBuffer = await m.download();
            }
        } catch (e) {}
        
        if (!targetText && !targetImgBuffer) {
            return m.reply(
                `💬 *FITUR FAKE QUOTE iOS*\n\n` +
                `Sistem ini akan mengubah teks yang kamu berikan menjadi gambar *quote* bergaya iOS yang sangat elegan dan modern.\n\n` +
                `*CARA PENGGUNAAN:*\n` +
                `- Ketik \`${m.prefix}iqc <teks kamu>\`\n` +
                `- Atau balas (*reply*) pesan orang lain dengan perintah \`${m.prefix}iqc\`\n\n` +
                `_Pesan yang dibalas akan otomatis diubah menjadi quote menggunakan nama dan foto profil pembuat pesan tersebut!_`
            );
        }

        let ts = m.messageTimestamp;
        if (ts && typeof ts === 'object' && ts.low !== undefined) ts = ts.low;
        ts = Number(ts) * 1000;
        const date = isNaN(ts) ? new Date() : new Date(ts);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const timeStr = `${hours}.${minutes}`;

        let imgUrl = "";
        let caption = "";
        const tmpImgPath = join(process.cwd(), 'temp', `iqc_${Date.now()}.png`);

        if (targetImgBuffer) {
            await writeFile(tmpImgPath, targetImgBuffer);
            imgUrl = tmpImgPath;
            caption = targetText || "";
        }
        
        const txt = targetText || "";
        let emojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

        await m.react('🕕');

        const RIN_BG_URL = 'https://cdn.jsdelivr.net/gh/ryyntwx/allimagerin@main/iqc-hytam.png'
        const RIN_TMP = join(process.cwd(), 'temp')

        const RIN_FONTS = [
            { url: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2', file: 'Inter-Regular.ttf' }
        ]

        const BG_W = 941
        const BG_H = 1671


        await mkdir(RIN_TMP, { recursive: true })

        async function rinDownload(url, isJson = false) {
            const res = await axios.get(url, { responseType: isJson ? 'json' : 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 5 })
            return isJson ? res.data : Buffer.from(res.data)
        }

        if (!fontsLoaded) {
            for (const f of RIN_FONTS) {
                GlobalFonts.register(await rinDownload(f.url), 'InterRegular')
            }
            fontsLoaded = true;
        }

        if (!bgImgBuffer) {
            bgImgBuffer = await rinDownload(RIN_BG_URL)
        }

        await loadAppleEmojiMap();

        const canvas = createCanvas(BG_W, BG_H)
        const ctx = canvas.getContext('2d')
        const bgImg = await loadImage(bgImgBuffer)
        ctx.drawImage(bgImg, 0, 0, BG_W, BG_H)

        const PERMANENT_TIME_X = 463;
        const PERMANENT_TIME_Y = 8;
        const PERMANENT_TIME_SIZE = 27;

        ctx.fillStyle = "#ffffff";
        ctx.font = `${PERMANENT_TIME_SIZE}px InterRegular`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(timeStr, PERMANENT_TIME_X, PERMANENT_TIME_Y);

        const chatFontSize = 30;
        const maxWidthLimit = 530;
        const minBubbleWidth = 280;
        const lineHeight = chatFontSize + 14;
        const paddingX = 30;
        const paddingY = 20;
        const rad = 28;
        const fixedX = 35;
        const fixedBaseY = 946;

        ctx.font = `22px InterRegular`;
        const timeWidth = ctx.measureText(timeStr).width;

        let finalY, finalBubbleHeight, bubbleW;

        if (!imgUrl) {
            ctx.font = `${chatFontSize}px InterRegular`;
            const chatLines = wrapText(ctx, txt, maxWidthLimit, chatFontSize);

            let longestW = 0;
            chatLines.forEach(l => {
                const w = measureTextCustom(ctx, l.trim(), chatFontSize);
                if (w > longestW) longestW = w;
            });

            bubbleW = longestW + (paddingX * 2);
            bubbleW = Math.max(bubbleW, timeWidth + 75);
            bubbleW = Math.max(bubbleW, 180);

            const spaceTimeY = 12;
            finalBubbleHeight = (chatLines.length * lineHeight) + paddingY + spaceTimeY + 22;
            finalY = fixedBaseY - finalBubbleHeight;

            ctx.fillStyle = "#1c1c1e";
            ctx.beginPath();
            ctx.moveTo(fixedX + rad, finalY);
            ctx.lineTo(fixedX + bubbleW - rad, finalY);
            ctx.quadraticCurveTo(fixedX + bubbleW, finalY, fixedX + bubbleW, finalY + rad);
            ctx.lineTo(fixedX + bubbleW, finalY + finalBubbleHeight - rad);
            ctx.quadraticCurveTo(fixedX + bubbleW, finalY + finalBubbleHeight, fixedX + bubbleW - rad, finalY + finalBubbleHeight);
            ctx.lineTo(fixedX + rad, finalY + finalBubbleHeight);
            ctx.quadraticCurveTo(fixedX + 8, finalY + finalBubbleHeight, fixedX + 8, finalY + finalBubbleHeight - 8);
            ctx.lineTo(fixedX + 8, finalY + rad);
            ctx.quadraticCurveTo(fixedX + 8, finalY, fixedX + rad, finalY);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(fixedX + 12, finalY + finalBubbleHeight - 20);
            ctx.quadraticCurveTo(fixedX - 2, finalY + finalBubbleHeight - 4, fixedX - 8, finalY + finalBubbleHeight);
            ctx.quadraticCurveTo(fixedX + 6, finalY + finalBubbleHeight, fixedX + 22, finalY + finalBubbleHeight - 2);
            ctx.closePath();
            ctx.fill();

            ctx.save();
            ctx.fillStyle = "#ffffff";
            ctx.font = `${chatFontSize}px InterRegular`;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            for (let i = 0; i < chatLines.length; i++) {
                const lineY = finalY + paddingY + (i * lineHeight) + (chatFontSize / 2);
                await drawTextWithEmojis(ctx, chatLines[i].trim(), fixedX + paddingX, lineY, chatFontSize);
            }
            ctx.restore();

            ctx.fillStyle = "#727278";
            ctx.font = `22px InterRegular`;
            ctx.textAlign = "right";
            ctx.textBaseline = "top";
            ctx.fillText(timeStr, fixedX + bubbleW - 22, finalY + finalBubbleHeight - 38);

        } else {
            const imgBuf = imgUrl.startsWith('http')
                ? await rinDownload(imgUrl)
                : await readFile(imgUrl)
            const imgObj = await loadImage(imgBuf)

            const imgAspect = imgObj.width / imgObj.height
            bubbleW = Math.min(Math.max(imgObj.width, minBubbleWidth), maxWidthLimit)
            let imgDrawH = Math.round(bubbleW / imgAspect)
            bubbleW = Math.max(bubbleW, timeWidth + 75);

            let captionLines = [];
            if (caption) {
                ctx.font = `${chatFontSize}px InterRegular`;
                captionLines = wrapText(ctx, caption, bubbleW - paddingX * 2, chatFontSize);
            }

            const captionH = captionLines.length > 0
                ? paddingY + (captionLines.length * lineHeight)
                : 0;
            const timeRowH = 28;
            finalBubbleHeight = imgDrawH + captionH + timeRowH + (captionLines.length > 0 ? 4 : 0);
            finalY = fixedBaseY - finalBubbleHeight;

            ctx.fillStyle = "#1c1c1e";
            ctx.beginPath();
            ctx.moveTo(fixedX + rad, finalY);
            ctx.lineTo(fixedX + bubbleW - rad, finalY);
            ctx.quadraticCurveTo(fixedX + bubbleW, finalY, fixedX + bubbleW, finalY + rad);
            ctx.lineTo(fixedX + bubbleW, finalY + finalBubbleHeight - rad);
            ctx.quadraticCurveTo(fixedX + bubbleW, finalY + finalBubbleHeight, fixedX + bubbleW - rad, finalY + finalBubbleHeight);
            ctx.lineTo(fixedX + rad, finalY + finalBubbleHeight);
            ctx.quadraticCurveTo(fixedX + 8, finalY + finalBubbleHeight, fixedX + 8, finalY + finalBubbleHeight - 8);
            ctx.lineTo(fixedX + 8, finalY + rad);
            ctx.quadraticCurveTo(fixedX + 8, finalY, fixedX + rad, finalY);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(fixedX + 12, finalY + finalBubbleHeight - 20);
            ctx.quadraticCurveTo(fixedX - 2, finalY + finalBubbleHeight - 4, fixedX - 8, finalY + finalBubbleHeight);
            ctx.quadraticCurveTo(fixedX + 6, finalY + finalBubbleHeight, fixedX + 22, finalY + finalBubbleHeight - 2);
            ctx.closePath();
            ctx.fill();

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(fixedX + rad, finalY);
            ctx.lineTo(fixedX + bubbleW - rad, finalY);
            ctx.quadraticCurveTo(fixedX + bubbleW, finalY, fixedX + bubbleW, finalY + rad);
            ctx.lineTo(fixedX + bubbleW, finalY + imgDrawH);
            ctx.lineTo(fixedX + 8, finalY + imgDrawH);
            ctx.lineTo(fixedX + 8, finalY + rad);
            ctx.quadraticCurveTo(fixedX + 8, finalY, fixedX + rad, finalY);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(imgObj, fixedX, finalY, bubbleW, imgDrawH);
            ctx.beginPath();
            ctx.moveTo(fixedX + 8, finalY + imgDrawH);
            ctx.lineTo(fixedX + 8, finalY + rad);
            ctx.quadraticCurveTo(fixedX + 8, finalY, fixedX + rad, finalY);
            ctx.lineTo(fixedX + bubbleW - rad, finalY);
            ctx.quadraticCurveTo(fixedX + bubbleW, finalY, fixedX + bubbleW, finalY + rad);
            ctx.lineTo(fixedX + bubbleW, finalY + imgDrawH);
            ctx.strokeStyle = "#1c1c1e";
            ctx.lineWidth = 18;
            ctx.stroke();
            ctx.restore();

            if (captionLines.length > 0) {
                ctx.save();
                ctx.fillStyle = "#ffffff";
                ctx.font = `${chatFontSize}px InterRegular`;
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                for (let i = 0; i < captionLines.length; i++) {
                    const lineY = finalY + imgDrawH + paddingY + (i * lineHeight) + (chatFontSize / 2);
                    await drawTextWithEmojis(ctx, captionLines[i].trim(), fixedX + paddingX, lineY, chatFontSize);
                }
                ctx.restore();
            }

            ctx.fillStyle = "#727278";
            ctx.font = `22px InterRegular`;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText(timeStr, fixedX + bubbleW - 22, finalY + finalBubbleHeight - timeRowH);
        }

        const emojiSize = Math.round(54 * 1.03);
        const emCardH = emojiSize + Math.round(44 * 1.03);
        const emCardW = Math.round(530 * 1.03);
        const emCardX = fixedX + 8;
        const emCardY = finalY - emCardH - 18;

        ctx.fillStyle = "#1c1c1e";
        ctx.beginPath();
        ctx.roundRect(emCardX, emCardY, emCardW, emCardH, [emCardH / 2]);
        ctx.fill();

        const startX = emCardX + 55;
        const spacingX = 76;
        const emojiCY = emCardY + (emCardH / 2) + 2;

        for (let i = 0; i < Math.min(emojis.length, 6); i++) {
            await drawAppleEmoji(ctx, emojis[i], startX + (i * spacingX), emojiCY, emojiSize);
        }

        ctx.fillStyle = "#8e8e93";
        ctx.font = `${Math.round(36 * 1.03)}px InterRegular`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("+", startX + (6 * spacingX) - 8, emCardY + (emCardH / 2) - 2);

        const rinOut = join(process.cwd(), 'temp', `rinchat-${Date.now()}.png`);
        await writeFile(rinOut, await canvas.encode('png'));

        await sock.sendMessage(m.chat, { image: { url: rinOut } }, { quoted: m });
        
        if (existsSync(rinOut)) fs.unlinkSync(rinOut);
        if (imgUrl && existsSync(imgUrl)) fs.unlinkSync(imgUrl);
        await m.react('✅');

    } catch (error) {
        bgImgBuffer = null;
        fontsLoaded = false;
        appleEmojiMap = null;
        console.error(error)
        await m.react('❌')
        m.reply(`❌ *GAGAL MEMPROSES QUOTE*\n\nMaaf, terjadi kesalahan saat mencoba membuat gambar quote. Silakan coba lagi beberapa saat.`)
    }
}

export { pluginConfig as config, handler };
