import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} from "ourin";
import te from "../../src/lib/ourin-error.js";
import { f } from "../../src/lib/ourin-http.js";

const pluginConfig = {
  name: "pin2",
  alias: ["pinterest2"],
  category: "search",
  description: "Cari satu gambar acak di Pinterest dengan tombol next",
  usage: ".pin2 <query>",
  example: ".pin2 anime",
  isOwner: false,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 5,
  energi: 1,
  isEnabled: true,
};

async function handler(m, { sock }) {
  const query = m.text?.trim();

  if (!query) {
    return m.reply(`❌ Masukkan kata kunci pencarian.\n\nContoh: \`${m.prefix}pin2 kucing\``);
  }

  await m.react("🕕");

  try {
    const data = await f(
      `https://api.cuki.biz.id/api/search/pinterest?apikey=cuki-x&query=${encodeURIComponent(query)}&type=image`
    );

    const results = data?.data?.results?.filter(item => item.image_url);
    if (!results || results.length === 0) {
      await m.react("❌");
      return m.reply(`❌ Waduh, pencarian untuk *${query}* tidak ditemukan. Coba kata kunci lain.`);
    }

    const randomItem = results[Math.floor(Math.random() * results.length)];
    const imageUrl = randomItem.image_url;

    if (!imageUrl) {
      await m.react("❌");
      return m.reply("⚠️ Gambar tidak tersedia.");
    }

    const mediaMessage = await prepareWAMessageMedia({
      image: { url: imageUrl }
    }, { upload: sock.waUploadToServer });

    const msg = generateWAMessageFromContent(m.chat, {
      viewOnceMessage: {
        message: {
          messageContextInfo: {},
          interactiveMessage: {
            header: {
              title: "",
              subtitle: "",
              hasMediaAttachment: true,
              imageMessage: mediaMessage.imageMessage
            },
            footer: {
              text: "Klik tombol di bawah untuk gambar lain 👇"
            },
            body: {
              text: `📸 *PINTEREST SEARCH*\n\n> Pencarian: *${query}*`
            },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: "🔁 Next",
                    id: `${m.prefix}pin2 ${query}`
                  })
                }
              ]
            }
          }
        }
      }
    }, { quoted: m, userJid: sock.user.jid });

    await sock.relayMessage(m.chat, msg.message, {
      messageId: msg.key.id,
    });

    await m.react("✅");

  } catch (error) {
    console.error("[PIN2 Search]", error.message);
    await m.react("☢");
    m.reply("😔 Gagal memuat pencarian Pinterest. Server mungkin sedang bermasalah.");
  }
}

export { pluginConfig as config, handler };
