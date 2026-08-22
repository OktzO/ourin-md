import { getDatabase } from "../../src/lib/ourin-database.js";
import { addExpWithLevelCheck } from "../../src/lib/ourin-level.js";

const pluginConfig = {
  name: "arena",
  alias: ["pvp", "battle", "fight"],
  category: "rpg",
  description: "Bertarung di arena PvP",
  usage: ".arena <@user>",
  example: ".arena @user",
  isOwner: false,
  isPremium: false,
  isGroup: true,
  isPrivate: false,
  cooldown: 180,
  energi: 1,
  isEnabled: true,
};

async function handler(m, { sock }) {
  const db = getDatabase();
  const user = db.getUser(m.sender);

  if (!user.rpg) user.rpg = {};
  if (!user.inventory) user.inventory = {};

  const mentioned = m.mentionedJid?.[0] || m.quoted?.sender;
  if (!mentioned) {
    let txt = `⚔️ *ARENA GLADIATOR* ⚔️\n\n`;
    txt += `Ayo tantang teman kamu untuk duel di arena kak!\n\n`;
    txt += `*Cara Menantang:*\n`;
    txt += `🗡️ \`${m.prefix}arena @user\`\n`;
    txt += `🗡️ Atau reply pesan dia dengan \`${m.prefix}arena\`\n\n`;
    txt += `> _⚠️ Hati-hati kak, kalau kalah koin kamu bakal berkurang 20%!_`;
    return m.reply(txt);
  }

  if (mentioned === m.sender) {
    return m.reply(`Aduh kak, masa kamu mau mukulin diri sendiri? Cari lawan yang lain yuk! 😂`);
  }

  const opponent = db.getUser(mentioned);
  if (!opponent) {
    return m.reply(`Lawan yang kamu tag belum terdaftar di database kita nih kak!`);
  }

  if (!opponent.rpg) opponent.rpg = {};

  const myHealth = user.rpg.health || 100;
  const myAttack = (user.rpg.attack || 10) + (user.level || 1) * 2;
  const myDefense = (user.rpg.defense || 5) + (user.level || 1);

  const oppHealth = opponent.rpg.health || 100;
  const oppAttack = (opponent.rpg.attack || 10) + (opponent.level || 1) * 2;
  const oppDefense = (opponent.rpg.defense || 5) + (opponent.level || 1);

  await m.react("⚔️");
  await m.reply(`⚔️ *PERTARUNGAN DIMULAI!* ⚔️\n\n@${m.sender.split("@")[0]} menerjang ke arah @${mentioned.split("@")[0]}!\nSemoga berhasil ya kak! 🔥`, { mentions: [m.sender, mentioned] });
  await new Promise((r) => setTimeout(r, 2000));

  let myHp = myHealth;
  let oppHp = oppHealth;
  let round = 0;
  let battleLog = [];

  while (myHp > 0 && oppHp > 0 && round < 10) {
    round++;

    const myDmg = Math.max(5, myAttack - oppDefense + Math.floor(Math.random() * 10));
    oppHp -= myDmg;
    battleLog.push(`🔥 Kamu melancarkan serangan kuat: *-${myDmg} HP*`);

    if (oppHp <= 0) break;

    const oppDmg = Math.max(5, oppAttack - myDefense + Math.floor(Math.random() * 10));
    myHp -= oppDmg;
    battleLog.push(`💢 Lawan membalas dengan keras: *-${oppDmg} HP*`);
  }

  const isWin = myHp > oppHp;

  let txt = `⚔️ *HASIL PERTARUNGAN* ⚔️\n\n`;
  txt += `*📊 Kondisi Akhir:*\n`;
  txt += `🧑 Kamu: *${Math.max(0, myHp)}/${myHealth} HP*\n`;
  txt += `👤 Lawan: *${Math.max(0, oppHp)}/${oppHealth} HP*\n`;
  txt += `🔄 Durasi: *${round} Ronde*\n\n`;

  txt += `📜 *Cuplikan Pertarungan:*\n`;
  txt += battleLog
    .slice(-6)
    .map((l) => `> ${l}`)
    .join("\n");
  txt += `\n\n`;

  if (isWin) {
    const expReward = 300 + (opponent.level || 1) * 50;
    const goldReward = Math.floor((opponent.koin || 0) * 0.1);

    user.koin = (user.koin || 0) + goldReward;
    opponent.koin = Math.max(0, (opponent.koin || 0) - goldReward);

    await addExpWithLevelCheck(sock, m, db, user, expReward);

    txt += `🏆 *KEMENANGAN TELAH DIRAIH!* 🎉\n`;
    txt += `Wah hebat banget kak! Ini hadiah dari arena:\n`;
    txt += `✨ EXP: *+${expReward}*\n`;
    txt += `💰 Koin Jarahan: *+Rp ${goldReward.toLocaleString()}*`;

    await m.react("🏆");
  } else {
    const goldLoss = Math.floor((user.koin || 0) * 0.2);
    user.koin = Math.max(0, (user.koin || 0) - goldLoss);

    txt += `💀 *SAYANG SEKALI, KAMU KALAH...* 💔\n`;
    txt += `Jangan sedih kak, nanti coba lagi ya!\n`;
    txt += `💸 Koin Terjatuh: *-Rp ${goldLoss.toLocaleString()}*`;

    await m.react("💀");
  }

  db.setUser(m.sender, user);
  db.setUser(mentioned, opponent);
  db.save();

  return m.reply(txt, { mentions: [m.sender, mentioned] });
}

export { pluginConfig as config, handler };
