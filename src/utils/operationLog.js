import { captureMonitoringError } from './monitoring'

const LOG_KEY = 'sit.internalLogs'
const MAX_LOGS = 120

function readLogs() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOG_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLogs(logs) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)))
}

export function logInternal(event, details = {}) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    event,
    details,
    createdAt: new Date().toISOString(),
  }
  writeLogs([entry, ...readLogs()])

  if (import.meta.env.DEV) {
    console.info('[SIT]', event, details)
  }

  return entry
}

export function getInternalLogs() {
  return readLogs()
}

export function reportError(error, context = {}) {
  const details = {
    message: error?.message || String(error || 'Erro desconhecido'),
    code: error?.code || '',
    status: error?.status || '',
    context,
  }
  logInternal('error', details)
  captureMonitoringError(error, context)
  console.error('[SIT]', details.message, details)
}
