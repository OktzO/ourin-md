import axios from "axios";
import ytdl from "../../src/scraper/ytdl.js";
import config from "../../config.js";
const pluginConfig = {
  name: "ytmp4",
  alias: ["youtubemp4", "ytvideo"],
  category: "download",
  description: "Download video YouTube",
  usage: ".ytmp4 <url>",
  example: ".ytmp4 https://youtube.com/watch?v=xxx",
  cooldown: 20,
  energi: 2,
  isEnabled: true,
};


async function getVideoDownloadUrl(url) {
  try {
    const { data } = await axios.get(
      `https://firefly.maiku.my.id/api/ytdown?apikey=${config.APIkey.firefly}&url=${encodeURIComponent(url)}`
    );

    if (data?.status && data?.data?.mediaItems) {
      const mediaItems = data.data.mediaItems;
      const video = mediaItems.find(m => m.type === "Video" && m.mediaQuality === "HD") ||
        mediaItems.find(m => m.type === "Video" && m.mediaQuality === "SD") ||
        mediaItems.find(m => m.type === "Video");

      if (video && video.mediaUrl) {
        let attempts = 0;
        while (attempts < 10) {
          const { data: fileData } = await axios.get(video.mediaUrl);
          if (fileData?.status === "completed" && fileData?.fileUrl) {
            return fileData.fileUrl;
          }
          await new Promise(resolve => setTimeout(resolve, 3000));
          attempts++;
        }
        throw new Error("Timeout processing video");
      }
    }
  } catch { }

  const fallback = await ytdl(url, "mp4");
  if (fallback?.status && fallback?.dl) {
    return fallback.dl;
  }

  throw new Error(fallback?.mess || "Gagal mendapatkan video download URL");
}

async function handler(m, { sock }) {
  const url = m.text?.trim();
  if (!url)
    return m.reply(`Contoh: ${m.prefix}ytmp4 https://youtube.com/watch?v=xxx`);
  if (!url.includes("youtube.com") && !url.includes("youtu.be"))
    return m.reply("❌ URL harus YouTube");

  m.react("🕕");

  try {
    const downloadUrl = await getVideoDownloadUrl(url);

    await sock.sendMedia(m.chat, downloadUrl, null, m, {
      type: "video",
    });
    m.react("✅");
  } catch (err) {
    console.error("[YTMP4]", err);
    m.react("❌");
    m.reply("Gagal mengunduh video.");
  }
}

export { pluginConfig as config, handler };
