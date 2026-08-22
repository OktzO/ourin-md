import fs from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import FormData from "form-data";
import te from "../../src/lib/ourin-error.js";

const config = {
  name: "hd3",
  alias: ["enhance3", "upscale3"],
  category: "tools",
  description: "Enhance gambar jadi HD (BeautyPlus)",
  usage: ".hd3 (reply gambar)",
  example: ".hd3",
  cooldown: 20,
  energi: 2,
  isEnabled: true,
};

const SCENE = "HD";
const RATIO = 2;
const REAL_RATIO = 4;

const UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";
const ORIGIN = "https://www.beautyplus.com";
const REFERER = "https://www.beautyplus.com/id/image-enhancer";

const api = axios.create({
  timeout: 60000,
  validateStatus: () => true,
  headers: {
    "user-agent": UA
  }
});

function randomUid() {
  return `bplus-${crypto.randomBytes(16).toString("hex")}`;
}

function guessMime(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { suffix: "jpg", mime: "image/jpeg" };
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return { suffix: "png", mime: "image/png" };
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return { suffix: "webp", mime: "image/webp" };
  return { suffix: "jpg", mime: "image/jpeg" };
}

function amzDate(d = new Date()) {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function hmac(key, data, enc) {
  return crypto.createHmac("sha256", key).update(data).digest(enc);
}

function getSigningKey(secret, date, region) {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function signPolicy(secret, policy, date, region) {
  return hmac(getSigningKey(secret, date, region), policy, "hex");
}

function headers(uid) {
  return {
    "accept": "application/json, text/plain, */*",
    "x-tenant": "bplus",
    "x-locale": "id",
    "x-anonymous-uid": uid,
    "origin": ORIGIN,
    "referer": REFERER,
    "user-agent": UA
  };
}

async function getPolicy(suffix) {
  const url = `https://strategy.pixocial.com/upload/policy?app=BeautyPlusWeb&suffix=${suffix}&type=tmp-photo`;

  const res = await api.get(url, {
    headers: {
      "accept": "*/*",
      "origin": ORIGIN,
      "referer": `${ORIGIN}/`,
      "user-agent": UA
    }
  });

  if (res.status !== 200 || !Array.isArray(res.data)) {
    throw new Error("policy_failed");
  }

  return res.data[0].oss;
}

async function uploadFile(buffer, suffix, mime, oss) {
  const creds = oss.credentials;
  const now = new Date();
  const xAmzDate = amzDate(now);
  const date = xAmzDate.slice(0, 8);
  const credential = `${creds.access_key}/${date}/${oss.region}/s3/aws4_request`;

  const policyObj = {
    expiration: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    conditions: [
      { bucket: oss.bucket },
      ["starts-with", "$key", "tmp-photo/"],
      ["starts-with", "$Content-Type", "image/"],
      { success_action_status: "200" },
      { "X-Amz-Credential": credential },
      { "X-Amz-Algorithm": "AWS4-HMAC-SHA256" },
      { "X-Amz-Security-Token": creds.session_token },
      { "X-Amz-Date": xAmzDate }
    ]
  };

  const policy = Buffer.from(JSON.stringify(policyObj)).toString("base64");
  const signature = signPolicy(creds.secret_key, policy, date, oss.region);

  const form = new FormData();
  form.append("key", oss.key);
  form.append("Content-Type", mime);
  form.append("success_action_status", "200");
  form.append("X-Amz-Credential", credential);
  form.append("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  form.append("X-Amz-Security-Token", creds.session_token);
  form.append("X-Amz-Date", xAmzDate);
  form.append("Policy", policy);
  form.append("X-Amz-Signature", signature);
  form.append("file", buffer, {
    filename: `image.${suffix}`,
    contentType: mime
  });

  const res = await api.post(`https://${oss.bucket}.oss-ap-southeast-1.aliyuncs.com/`, form, {
    headers: {
      ...form.getHeaders(),
      "origin": ORIGIN,
      "referer": `${ORIGIN}/`,
      "user-agent": UA,
      "accept": "*/*"
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  if (res.status !== 200) {
    throw new Error("upload_failed");
  }

  return oss.data;
}

async function checkQuota(uid) {
  const res = await api.get(`https://www.beautyplus.com/core-api/v1/img-enhancer/quota/info?scene=${SCENE}`, {
    headers: headers(uid)
  });

  if (res.status !== 200) {
    throw new Error("quota_failed");
  }

  if (res.data?.needUpgrade) {
    throw new Error("need_upgrade");
  }

  return res.data;
}

async function createTask(sourceUrl, uid) {
  const res = await api.post("https://www.beautyplus.com/core-api/v2/img-enhancer/task", {
    sourceUrl,
    scene: SCENE,
    ratio: RATIO,
    realRatio: REAL_RATIO,
    functionRatio: null
  }, {
    headers: {
      ...headers(uid),
      "content-type": "application/json"
    }
  });

  if (res.status !== 201 || typeof res.data !== "string") {
    throw new Error("task_failed");
  }

  return res.data;
}

async function getResult(taskId, uid) {
  const res = await api.get(`https://www.beautyplus.com/core-api/v2/img-enhancer/query-sse/${taskId}`, {
    responseType: "stream",
    timeout: 120000,
    headers: {
      ...headers(uid),
      "accept": "text/event-stream",
      "authorization": ""
    }
  });

  if (res.status !== 200) {
    throw new Error("sse_failed");
  }

  return await new Promise((resolve, reject) => {
    let raw = "";
    let finish = false;

    const timer = setTimeout(() => {
      if (!finish) {
        finish = true;
        res.data.destroy();
        reject(new Error("timeout"));
      }
    }, 120000);

    res.data.on("data", chunk => {
      raw += chunk.toString();

      for (const match of raw.matchAll(/^data:\s*(.+)$/gm)) {
        try {
          const data = JSON.parse(match[1]);

          if (data.status === "success" && data.effectUrl) {
            finish = true;
            clearTimeout(timer);
            res.data.destroy();
            resolve(data.effectUrl);
            return;
          }

          if (data.status === "failed" || data.status === "error") {
            finish = true;
            clearTimeout(timer);
            res.data.destroy();
            reject(new Error("process_failed"));
            return;
          }
        } catch {}
      }
    });

    res.data.on("end", () => {
      if (!finish) {
        finish = true;
        clearTimeout(timer);
        reject(new Error("empty_result"));
      }
    });

    res.data.on("error", err => {
      if (!finish) {
        finish = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

async function handler(m, { sock }) {
  const img = m.isImage || (m.quoted && m.quoted.type === "imageMessage");

  if (!img) {
    return m.reply(
      `*🪄 BEAUTYPLUS ENHANCER*\n> Reply gambar untuk di-HD-kan\n\n\`\`\`${m.prefix}hd3\`\`\``
    );
  }

  m.react("🕕");

  try {
    let buffer = m.quoted?.isMedia ? await m.quoted.download() : await m.download();
    
    const uid = randomUid();
    const { suffix, mime } = guessMime(buffer);
    const policy = await getPolicy(suffix);
    const sourceUrl = await uploadFile(buffer, suffix, mime, policy);
    await checkQuota(uid);
    const taskId = await createTask(sourceUrl, uid);
    const resultUrl = await getResult(taskId, uid);

    if (!resultUrl) {
      throw new Error("Gagal melakukan upscale, hasil kosong.");
    }

    m.react("✅");
    await sock.sendMedia(m.chat, resultUrl, null, m, { type: "image" });
  } catch (e) {
    console.error("[HD3]", e.message);
    m.react("☢");
    m.reply(te(m.prefix, m.command, m.pushName));
  }
}

export { config, handler };
