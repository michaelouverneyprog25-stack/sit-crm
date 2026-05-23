const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')

const ROOT_DIR = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT_DIR, 'data')
const BACKUP_DIR = path.join(DATA_DIR, 'cleanup-backups')
const GOALS_CACHE_FILE = path.join(DATA_DIR, 'goals-cache.json')
const STORES_CACHE_FILE = path.join(DATA_DIR, 'stores-cache.json')

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return []
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  return Array.isArray(data) ? data : []
}

function writeJsonArray(filePath, items) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2))
}

function backupFile(filePath, timestamp) {
  if (!fs.existsSync(filePath)) return ''
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const backupPath = path.join(BACKUP_DIR, `${timestamp}-${path.basename(filePath)}`)
  fs.copyFileSync(filePath, backupPath)
  return backupPath
}

function getTimestamp(record = {}) {
  const value = record.updatedAt || record.createdAt || ''
  if (value?.seconds) return value.seconds * 1000
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function goalKey(goal = {}) {
  return [
    goal.type || '',
    goal.userId || '',
    goal.storeName || '',
    goal.groupName || '',
    goal.managerId || '',
    goal.year || '',
    goal.month || '',
  ].map(normalizeText).join('|')
}

function storeKey(store = {}) {
  return normalizeText(store.name || store.storeName)
}

function pickCanonical(current, next) {
  if (!current) return next
  const currentData = current.data || current
  const nextData = next.data || next
  const currentHasTarget = Number(currentData.targetValue || 0) > 0
  const nextHasTarget = Number(nextData.targetValue || 0) > 0
  if (nextHasTarget !== currentHasTarget) return nextHasTarget ? next : current
  const currentTime = getTimestamp(currentData)
  const nextTime = getTimestamp(nextData)
  if (nextTime !== currentTime) return nextTime > currentTime ? next : current
  return Number(nextData.currentValue || 0) >= Number(currentData.currentValue || 0) ? next : current
}

function dedupe(items, keyFn) {
  const byKey = new Map()
  const duplicates = []
  items.forEach((item) => {
    const key = keyFn(item.data || item)
    if (!key) return
    const current = byKey.get(key)
    const picked = pickCanonical(current, item)
    if (current && picked === item) duplicates.push(current)
    if (current && picked !== item) duplicates.push(item)
    byKey.set(key, picked)
  })
  return { keep: [...byKey.values()], duplicates }
}

function cleanGoal(goal) {
  const next = {
    ...goal,
    autoSync: true,
    manualRealized: false,
  }
  delete next.manualCurrentValue
  delete next.manualSalesBaseValue
  return next
}

async function initializeAdmin() {
  if (admin.apps.length) return true

  const serviceAccountJson = process.env.SERVICE_ACCOUNT_JSON
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.join(ROOT_DIR, 'serviceAccountKey.json')

  try {
    admin.initializeApp({
      credential: serviceAccountJson
        ? admin.credential.cert(JSON.parse(serviceAccountJson))
        : fs.existsSync(serviceAccountPath)
          ? admin.credential.cert(require(serviceAccountPath))
          : admin.credential.applicationDefault(),
    })
    return true
  } catch (error) {
    console.warn('Firebase Admin indisponivel. Limpando somente cache local:', error.message || error)
    return false
  }
}

async function cleanupFirestoreCollection(db, collectionName, keyFn, cleanFn = (item) => item) {
  const snap = await db.collection(collectionName).get()
  const entries = snap.docs.map((doc) => ({
    ref: doc.ref,
    id: doc.id,
    data: { id: doc.id, ...doc.data() },
  }))
  const { keep, duplicates } = dedupe(entries, keyFn)
  let batch = db.batch()
  let count = 0

  for (const entry of keep) {
    const cleaned = cleanFn(entry.data)
    batch.set(entry.ref, {
      ...cleaned,
      id: entry.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      manualCurrentValue: admin.firestore.FieldValue.delete(),
      manualSalesBaseValue: admin.firestore.FieldValue.delete(),
    }, { merge: true })
    count += 1
    if (count >= 400) {
      await batch.commit()
      batch = db.batch()
      count = 0
    }
  }

  for (const entry of duplicates) {
    batch.delete(entry.ref)
    count += 1
    if (count >= 400) {
      await batch.commit()
      batch = db.batch()
      count = 0
    }
  }

  if (count) await batch.commit()
  return { total: entries.length, kept: keep.length, removed: duplicates.length }
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const goalBackup = backupFile(GOALS_CACHE_FILE, timestamp)
  const storeBackup = backupFile(STORES_CACHE_FILE, timestamp)

  const localGoals = readJsonArray(GOALS_CACHE_FILE)
  const localStores = readJsonArray(STORES_CACHE_FILE)
  const dedupedLocalGoals = dedupe(localGoals.map(cleanGoal), goalKey)
  const dedupedLocalStores = dedupe(localStores, storeKey)
  writeJsonArray(GOALS_CACHE_FILE, dedupedLocalGoals.keep)
  writeJsonArray(STORES_CACHE_FILE, dedupedLocalStores.keep)

  console.log('Cache local limpo:', {
    goals: {
      total: localGoals.length,
      kept: dedupedLocalGoals.keep.length,
      removed: dedupedLocalGoals.duplicates.length,
      backup: goalBackup,
    },
    stores: {
      total: localStores.length,
      kept: dedupedLocalStores.keep.length,
      removed: dedupedLocalStores.duplicates.length,
      backup: storeBackup,
    },
  })

  const hasAdmin = await initializeAdmin()
  if (!hasAdmin) return

  const db = admin.firestore()
  const goalsResult = await cleanupFirestoreCollection(db, 'goals', goalKey, cleanGoal)
  const storesResult = await cleanupFirestoreCollection(db, 'stores', storeKey)
  console.log('Firestore limpo:', {
    goals: goalsResult,
    stores: storesResult,
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
