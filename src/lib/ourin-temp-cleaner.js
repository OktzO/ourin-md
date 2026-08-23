import fs from 'fs'
import path from 'path'
import { logger } from './ourin-logger.js'

const CLEAN_INTERVAL = 30 * 60 * 1000
const MAX_AGE_MS = 60 * 60 * 1000 // 1 hour
const MIN_AGE_MS = 5 * 60 * 1000   // don't touch files < 5min old

let cleanerTimer = null

function scanDir(dirPath, ageThreshold) {
  let total = 0
  let size = 0
  if (!fs.existsSync(dirPath)) return { total, size }
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      try {
        if (entry.isDirectory()) {
          const sub = scanDir(fullPath, ageThreshold)
          total += sub.total
          size += sub.size
          if (fs.readdirSync(fullPath).length === 0) fs.rmdirSync(fullPath)
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath)
          const age = Date.now() - stat.mtimeMs
          if (age > ageThreshold) {
            size += stat.size
            fs.unlinkSync(fullPath)
            total++
          }
        }
      } catch {}
    }
  } catch {}
  return { total, size }
}

function startTempCleaner() {
  if (cleanerTimer) return
  cleanerTimer = setInterval(() => {
    const now = Date.now()
    const ageThreshold = now - MAX_AGE_MS
    let grandTotal = 0, grandSize = 0
    for (const dir of ['temp', 'tmp']) {
      const dirPath = path.join(process.cwd(), dir)
      if (!fs.existsSync(dirPath)) continue
      const result = scanDir(dirPath, ageThreshold)
      grandTotal += result.total
      grandSize += result.size
    }
    if (grandTotal > 0) {
      const sizeMB = (grandSize / 1024 / 1024).toFixed(2)
      logger.system('temp', `cleaned ${grandTotal} file(s) (${sizeMB}MB)`)
    }
  }, CLEAN_INTERVAL)
  if (cleanerTimer.unref) cleanerTimer.unref()
  logger.success('temp', `auto-clean age >${MAX_AGE_MS/60000}m recursive, every ${CLEAN_INTERVAL/60000}m`)
}

function stopTempCleaner() {
  if (cleanerTimer) { clearInterval(cleanerTimer); cleanerTimer = null }
}

export { startTempCleaner, stopTempCleaner }
