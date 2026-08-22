import axios from "axios";
import config from "../../config.js";
import { ImageUploadService } from "node-upload-images";

const OBS_KEY = config.APIkey.obscura;

async function uploadBuf(buf) {
  const service = new ImageUploadService("pixhost.to");
  const { directLink } = await service.uploadFromBinary(buf, "img.jpg");
  return directLink;
}

async function live3d(
  imageBuffer,
  prompt = "Make this person the skin is very black, but skin tone still natural",
) {
  const imgUrl = await uploadBuf(imageBuffer);
  const r = await axios.get(
    `https://api-faa.my.id/faa/nano-banana?url=${encodeURIComponent(imgUrl)}&prompt=${encodeURIComponent(prompt)}`,
    {
      responseType: "arraybuffer",
      timeout: 120000,
    },
  );
  const image = Buffer.from(r.data);
  return { image };
}

async function fluxImage(message, ratio = "1:1") {
  const r = await axios.post(
    "https://api.yuulabs.web.id/api/ai/flux-img",
    {
      message,
      ratio,
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 120000,
    },
  );

  const data = r.data;
  if (!data?.status || !data?.result?.url) {
    throw new Error(data?.message || data?.error || "Gagal membuat gambar");
  }

  return data.result;
}

export { live3d, fluxImage };
