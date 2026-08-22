import axios from "axios";
import { AIRich } from "../../src/lib/ourin-builder.js";

async function tiktokDl(url) {
  function formatNumber(integer) {
    let numb = parseInt(integer);
    return Number(numb).toLocaleString().replace(/,/g, ".");
  }

  function formatDate(n, locale = "en") {
    let d = new Date(n);
    return d.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  }

  let data = [];
  const domain = "https://www.tikwm.com/api/";
  const res = (
    await axios.post(
      domain,
      {},
      {
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: "https://www.tikwm.com",
          Referer: "https://www.tikwm.com/",
          "Sec-Ch-Ua": '"Not)A;Brand" ;v="24" , "Chromium" ;v="116"',
          "Sec-Ch-Ua-Mobile": "?1",
          "Sec-Ch-Ua-Platform": "Android",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
          "X-Requested-With": "XMLHttpRequest",
        },
        params: { url, count: 12, cursor: 0, web: 1, hd: 1 },
      },
    )
  ).data.data;

  if (res?.duration == 0) {
    res.images.forEach((v) => data.push({ type: "photo", url: v }));
  } else {
    data.push(
      {
        type: "watermark",
        url: "https://www.tikwm.com" + res?.wmplay || "/undefined",
      },
      {
        type: "nowatermark",
        url: "https://www.tikwm.com" + res?.play || "/undefined",
      },
      {
        type: "nowatermark_hd",
        url: "https://www.tikwm.com" + res?.hdplay || "/undefined",
      },
    );
  }

  return {
    status: true,
    title: res.title,
    taken_at: formatDate(res.create_time).replace("1970", ""),
    region: res.region,
    id: res.id,
    durations: res.duration,
    duration: res.duration + " Seconds",
    cover: "https://www.tikwm.com" + res.cover,
    size_wm: res.wm_size,
    size_nowm: res.size,
    size_nowm_hd: res.hd_size,
    data,
    music_info: {
      id: res.music_info.id,
      title: res.music_info.title,
      author: res.music_info.author,
      album: res.music_info.album || null,
      url: "https://www.tikwm.com" + res.music || res.music_info.play,
    },
    stats: {
      views: formatNumber(res.play_count),
      likes: formatNumber(res.digg_count),
      comment: formatNumber(res.comment_count),
      share: formatNumber(res.share_count),
      download: formatNumber(res.download_count),
    },
    author: {
      id: res.author.id,
      fullname: res.author.unique_id,
      nickname: res.author.nickname,
      avatar: "https://www.tikwm.com" + res.author.avatar,
    },
  };
}

const pluginConfig = {
  name: ["tiktok", "tt", "ttmp4"],
  alias: ["tiktokdl", "ttdown"],
  category: "download",
  description: "Download video/slide TikTok tanpa watermark",
  usage: ".tiktok <url>",
  example: ".tiktok https://vt.tiktok.com/xxx",
  isOwner: false,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 10,
  energi: 1,
  isEnabled: true,
};

async function handler(m, { sock }) {
  const text = m.text?.trim();
  const prefix = m.prefix;
  const command = m?.command;
  if (!text) {
    m.react("❌");
    return m.reply(
      `📌 Contoh: *${prefix + command} https://vt.tiktok.com/...*`,
    );
  }
  m.react("🕕");
  try {
    const result = await tiktokDl(text);
    const builder = new AIRich(sock);

    if (result.durations > 0 && result.duration !== "0 Seconds") {
      const builder = new AIRich(sock);
      let zann = await result.data.find(
        (e) => e.type == "nowatermark_hd" || e.type == "nowatermark",
      );
      builder.addVideo(zann.url);

      const authorText = `> 👤 *Author:* ${result.author.nickname} (@${result.author.fullname})\n`;
      const descText = `> 📝 *Caption:* ${result.title || "-"}\n`;
      const musicText = `> 🎵 *Music:* ${result.music_info.title} - ${result.music_info.author}\n`;
      const durationText = result.durations > 0 ? `> ⏱️ *Duration:* ${result.duration}\n` : "";
      const infoText = `> 📅 *Uploaded:* ${result.taken_at}\n${durationText}> 🌎 *Region:* ${result.region}`;
      builder.addText("# TIKTOK DOWNLOADER\n\n" + authorText + descText + musicText + infoText);

      builder.addTable([
        ["👀 Views", "❤️ Likes", "💬 Comments", "🔁 Shares", "📥 Downloads"],
        [result.stats.views, result.stats.likes, result.stats.comment, result.stats.share, result.stats.download]
      ]);

      const aiMsg = await builder.send(m.chat, { quoted: m });

      await sock.sendMessage(
        m.chat,
        {
          footer: "> 🌿 Mau dapetin audio nya juga? kalau mau bisa tekan tombol dibawah",
          text: "",
          interactiveButtons: [
            {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                title: "📩 Unduh Audionya",
                id: `${m.prefix}ttmp3 ${text}`,
              }),
            },
          ],
        },
        { quoted: m }
      );
    } else {
      const sabila = result.data?.map((zan) => ({
        image: { url: zan.url },
      }));
      await sock.sendMessage(
        m.chat,
        {
          albumMessage: sabila,
        },
        { quoted: m },
      );
    }
    m.react("✅");
  } catch (e) {
    console.error(e);
    m.react("❌");
    m.reply("Coba lagi nanti, atau bisa coba " + m.prefix + "tt2");
  }
}

export { pluginConfig as config, handler };
