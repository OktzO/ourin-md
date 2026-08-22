import axios from "axios";
import te from "../../src/lib/ourin-error.js";
import cfg from "../../config.js";
import { ImageUploadService } from "node-upload-images";

const config = {
  name: "remini",
  alias: ["hd", "enhance", "upscale"],
  category: "tools",
  description: "Enhance gambar jadi HD",
  usage: ".remini (reply gambar)",
  example: ".remini",
  cooldown: 15,
  energi: 1,
  isEnabled: true,
};

async function ul(buf) {
  const service = new ImageUploadService("new.fastpic.org");
  const { directLink } = await service.uploadFromBinary(buf, "img.png");
  return directLink;
}

async function handler(m, { sock }) {
  const img = m.isImage || (m.quoted && m.quoted.type === "imageMessage");

  if (!img) {
    return m.reply(
      `*🪁 HD IMAGE*\n> Reply gambar\n\n\`\`\`${m.prefix}remini\`\`\``,
    );
  }

  m.react("🕕");

  try {
    let b = m.quoted?.isMedia ? await m.quoted.download() : await m.download();

    const u = await ul(b);
    let resultUrl = null;

    try {
      const apiUrl = `https://api-faa.my.id/faa/hdv2?url=${encodeURIComponent(u)}`;
      const res = await axios.get(apiUrl);
      if (res.data.status && res.data.result) {
        resultUrl = res.data.result;
      } else {
        throw new Error("API Faa response invalid");
      }
    } catch (err) {
      throw new Error("Gagal melakukan upscale, coba lagi.");
    }

    if (!resultUrl) {
      throw new Error("Gagal melakukan upscale, coba lagi.");
    }

    m.react("✅");
    await sock.sendMedia(m.chat, resultUrl, null, m, { type: "image" });
  } catch (e) {
    console.log(e);
    m.react("☢");
    m.reply(te(m.prefix, m.command, m.pushName));
  }
}

export { config, handler };
