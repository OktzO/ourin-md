import { logger } from './ourin-logger.js'
const INACTIVE_THRESHOLD = 14 * 24 * 60 * 60 * 1000
const PRUNE_INTERVAL = 6 * 60 * 60 * 1000

let prunerTimer = null

function startDailyPruner() {
    if (prunerTimer) return

    prunerTimer = setInterval(() => {
        try {
            
            const db = getDatabase()
            if (!db || !db.db?.data) return

            const now = Date.now()
            const threshold = now - INACTIVE_THRESHOLD
            let prunedUsers = 0
            let prunedGroups = 0
            let prunedPremium = 0
            let prunedPartner = 0

            const users = db.db.data.users
            if (users && typeof users === 'object') {
                for (const [jid, user] of Object.entries(users)) {
                    const isProtected =
                        user.premium ||
                        user.owner ||
                        user.partner ||
                        user.banned

                    if (!isProtected && user.lastSeen && user.lastSeen < threshold) {
                        delete users[jid]
                        prunedUsers++
                    }
                }
            }

            const groups = db.db.data.groups
            if (groups && typeof groups === 'object') {
                for (const [jid, group] of Object.entries(groups)) {
                    if (group.lastActivity && group.lastActivity < threshold) {
                        delete groups[jid]
                        prunedGroups++
                    }
                }
            }

            if (Array.isArray(db.db.data.premium)) {
                const preLen = db.db.data.premium.length;
                db.db.data.premium = db.db.data.premium.filter(p => {
                    if (typeof p === 'string') return true;
                    const expire = p.expired || (p.expiredAt ? new Date(p.expiredAt).getTime() : 0);
                    return !expire || expire > now;
                });
                prunedPremium += preLen - db.db.data.premium.length;
            }
            if (Array.isArray(db.db.data.partner)) {
                const partLen = db.db.data.partner.length;
                db.db.data.partner = db.db.data.partner.filter(p => {
                    if (typeof p === 'string') return true;
                    const expire = p.expired || (p.expiredAt ? new Date(p.expiredAt).getTime() : 0);
                    return !expire || expire > now;
                });
                prunedPartner += partLen - db.db.data.partner.length;
            }

            if (prunedUsers > 0 || prunedGroups > 0 || prunedPremium > 0 || prunedPartner > 0) {
                db.save()
                logger.system('pruner', `removed ${prunedUsers} users, ${prunedGroups} groups, ${prunedPremium} premium, ${prunedPartner} partner (>${INACTIVE_THRESHOLD / 86400000}d inactive)`)
            }
        } catch (error) {
            logger.error('pruner', error.message)
        }
    }, PRUNE_INTERVAL)

    if (prunerTimer.unref) prunerTimer.unref()
    logger.success('pruner', `auto-prune >${INACTIVE_THRESHOLD / 86400000}d inactive, every ${PRUNE_INTERVAL / 3600000}h`)
}

function stopDailyPruner() {
    if (prunerTimer) {
        clearInterval(prunerTimer)
        prunerTimer = null
    }
}

export { startDailyPruner, stopDailyPruner }