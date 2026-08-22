import config from '../../config.js'
import path from 'path'
import fs from 'fs'
import { AIRich } from '../../src/lib/ourin-builder.js'
const pluginConfig = {
    name: 'tqto',
    alias: ['thanksto', 'credits', 'kredit'],
    category: 'main',
    description: 'Menampilkan daftar kontributor bot',
    usage: '.tqto',
    example: '.tqto',
    isOwner: false,
    isPremium: false,
    isGroup: false,
    isPrivate: false,
    cooldown: 5,
    energi: 0,
    isEnabled: true
}

async function handler(m, { sock }) {
    const botName = config.bot?.name || 'Ourin-AI'
    const version = config.bot?.version || '1.0.0'
    const developer = config.bot?.developer || 'Lucky Archz'

    const credits = [
        { name: 'hyuuOkkotsuX', role: 'Lead Staff', icon: '👨‍💻' },
        { name: 'Zann', role: 'Creator Ourin MD dan APK Stardem Ourin', icon: '👨‍💻' },
        { name: 'SenzOkkotsu', role: 'Developer', icon: '👨‍💻' },
        { name: 'Ell', role: 'Developer', icon: '👨‍💻' },
        { name: 'Aqell', role: 'Developer SC BUG Ourin Glitch', icon: '👨‍💻' },
        { name: 'Mobbc', role: 'Staff', icon: '👨‍💻' },
        { name: 'Raka', role: 'Staff', icon: '👨‍💻' },
        { name: 'Sanxz', role: 'Tangan Kanan', icon: '👨‍💻' },
        { name: 'Dinz', role: 'Tangan Kanan', icon: '👨‍💻' },
        { name: 'Forone Store', role: 'Tangan Kanan', icon: '🛒' },
        { name: 'Fahmi', role: 'Tangan Kanan', icon: '👨‍💻' },
        { name: 'Sabila', role: 'Tangan Kanan', icon: '👩‍💻' },
        { name: 'Syura Store', role: 'Tangan Kanan', icon: '👩‍💻' },
        { name: 'Xero', role: 'Tangan Kanan', icon: '👩‍💻' },
        { name: 'Lyoraaa', role: 'Owner', icon: '👩‍💻' },
        { name: 'Danzzz', role: 'Owner', icon: '👨‍💻' },
        { name: 'Muzan', role: 'Owner', icon: '👨‍💻' },
        { name: 'Gray', role: 'Owner', icon: '👨‍💻' },
        { name: 'Baim', role: 'Moderator', icon: '👨‍💻' },
        { name: 'Vadel', role: 'Moderator', icon: '👨‍💻' },
        { name: 'Fikzz', role: 'Moderator', icon: '🛒' },
        { name: 'Caca', role: 'Moderator', icon: '👨‍💻' },
        { name: 'panceo', role: 'Partner', icon: '🛒' },
        { name: 'KingSatzID', role: 'Partner', icon: '🛒' },
        { name: 'Dashxz', role: 'Partner', icon: '🛒' },
        { name: 'This JanzZ', role: 'Partner', icon: '🛒' },
        { name: 'Ahmad', role: 'Partner', icon: '🛒' },
        { name: 'nopal', role: 'Partner', icon: '🛒' },
        { name: 'tuadit', role: 'Partner', icon: '🛒' },
        { name: 'andry', role: 'Partner', icon: '🛒' },
        { name: 'kingdanz', role: 'Partner', icon: '🛒' },
        { name: 'patih', role: 'Partner', icon: '🛒' },
        { name: 'Ryuu', role: 'Partner', icon: '🛒' },
        { name: 'Pororo', role: 'Partner', icon: '🛒' },
        { name: 'Janzz', role: 'Partner', icon: '🛒' },
        { name: 'Morvic', role: 'Partner', icon: '🛒' },
        { name: 'zylnzee', role: 'Partner', icon: '🛒' },
        { name: 'Farhan', role: 'Partner', icon: '🛒' },
        { name: 'Alizz', role: 'Partner', icon: '🛒' },
        { name: 'Kiram', role: 'Partner', icon: '🛒' },
        { name: 'Minerva', role: 'Partner', icon: '🛒' },
        { name: 'HanzPiw', role: 'Partner', icon: '🛒' },
        { name: 'Ryuzen', role: 'Partner', icon: '🛒' },
        { name: 'Ahmad', role: 'Partner', icon: '🛒' },
        { name: 'Riam', role: 'Partner', icon: '🛒' },
        { name: 'Febri', role: 'Partner', icon: '🛒' },
        { name: 'Kuze', role: 'Partner', icon: '🛒' },
        { name: 'Oscar Dani', role: 'Partner', icon: '🛒' },
        { name: 'Udun', role: 'Partner', icon: '🛒' },
        { name: 'Zanspiw', role: 'Youtuber', icon: '🌐' },
        { name: 'Danzz Nano', role: 'Youtuber', icon: '🌐' },
        { name: 'Youtuber Lain yang udah review', role: 'Youtuber', icon: '🌐' },
        { name: 'Kalian Semua', role: 'Best', icon: '🌐' },
        { name: 'Open Source Community', role: 'Libraries & Tools', icon: '🌐' },

    ]

    const headers = ['No', 'Nama', 'Role / Tier']
    const rows = credits.map((c, i) => [i + 1, c.name, c.role])

    await m.reply(`🍟 *Berikut ini adalah orang orang yang sudah berkontribusi di bot ${config.bot.name}*
        
${credits.map((c, i) => `*${i + 1}*. *${c.name}* [ ${c.icon} ${c.role} ]`).join('\n')}}`)
}

export { pluginConfig as config, handler }