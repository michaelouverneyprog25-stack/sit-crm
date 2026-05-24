import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
} from 'firebase/firestore'
import { auth } from '../firebase/auth'
import { app } from '../firebase/app'

const db = getFirestore(app)
const COLLECTION_NAME = 'system_errors'
const QUEUE_KEY = 'sit.pendingSystemErrors'
const MAX_QUEUE = 80

function readQueue() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(queue) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)))
}

function getDeviceInfo() {
  if (typeof window === 'undefined') return {}
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    online: navigator.onLine,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    path: window.location.pathname,
  }
}

function normalizeSeverity(error, context = {}) {
  const code = String(error?.code || context.code || '').toLowerCase()
  const message = String(error?.message || context.message || '').toLowerCase()
  if (context.severity) return context.severity
  if (code.includes('permission') || message.includes('permission') || message.includes('permiss')) return 'critico'
  if (code.includes('unavailable') || message.includes('network') || message.includes('offline') || message.includes('conex')) return 'medio'
  if (context.source === 'ErrorBoundary') return 'critico'
  return 'baixo'
}

function normalizeModule(context = {}) {
  const source = String(context.source || context.module || context.label || context.path || '').toLowerCase()
  if (source.includes('fiber') || source.includes('fibra')) return 'viabilidade fibra'
  if (source.includes('import')) return 'importacao excel'
  if (source.includes('goal') || source.includes('meta')) return 'metas'
  if (source.includes('dashboard')) return 'dashboard'
  if (source.includes('commission') || source.includes('comissao')) return 'comissao'
  if (source.includes('auth') || source.includes('login')) return 'login'
  if (source.includes('venda')) return 'salvamento'
  if (source.includes('api') || source.includes('/api/')) return 'api'
  if (source.includes('errorboundary')) return 'react'
  return 'sistema'
}

async function getCurrentProfile(user) {
  if (!user) return null
  try {
    const snap = await getDoc(doc(db, 'users', user.uid))
    return snap.exists() ? snap.data() : null
  } catch {
    return null
  }
}

async function buildErrorPayload(error, context = {}) {
  const user = auth.currentUser
  const profile = await getCurrentProfile(user)
  const severity = normalizeSeverity(error, context)
  const module = normalizeModule(context)
  const canAutoFix = ['medio', 'baixo'].includes(severity)

  return {
    createdAt: serverTimestamp(),
    occurredAt: new Date().toISOString(),
    userId: user?.uid || '',
    userEmail: user?.email || context.userEmail || '',
    userName: profile?.name || user?.displayName || context.userName || '',
    userRole: profile?.role || context.userRole || '',
    storeName: profile?.storeName || context.storeName || '',
    screen: context.screen || context.path || getDeviceInfo().path || '',
    action: context.action || context.label || context.source || 'acao-nao-informada',
    module,
    message: error?.message || context.message || String(error || 'Erro desconhecido'),
    code: error?.code || context.code || '',
    httpStatus: error?.status || context.status || '',
    status: canAutoFix ? 'pendente' : 'precisa_intervencao_admin',
    severity,
    autoFixAttempted: false,
    autoFixStatus: canAutoFix ? 'aguardando' : 'nao_aplicavel',
    device: getDeviceInfo(),
    context: {
      ...context,
      componentStack: context.componentStack ? String(context.componentStack).slice(0, 1200) : '',
    },
  }
}

export async function reportSystemError(error, context = {}) {
  const payload = await buildErrorPayload(error, context)
  if (!auth.currentUser) {
    writeQueue([...readQueue(), { ...payload, createdAt: undefined }])
    return { queued: true }
  }
  const ref = await addDoc(collection(db, COLLECTION_NAME), payload)
  return { id: ref.id, queued: false }
}

export async function flushQueuedSystemErrors() {
  if (!auth.currentUser) return { flushed: 0, remaining: readQueue().length }
  const queue = readQueue()
  if (!queue.length) return { flushed: 0, remaining: 0 }

  const remaining = []
  let flushed = 0
  for (const item of queue) {
    try {
      await addDoc(collection(db, COLLECTION_NAME), {
        ...item,
        createdAt: serverTimestamp(),
        flushedAt: new Date().toISOString(),
      })
      flushed += 1
    } catch {
      remaining.push(item)
    }
  }
  writeQueue(remaining)
  return { flushed, remaining: remaining.length }
}

export function getQueuedSystemErrorCount() {
  return readQueue().length
}

export function notifyAutoRecovery(message, status = 'pending') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('sit:support-status', {
    detail: { message, status, updatedAt: new Date().toISOString() },
  }))
}

export async function attemptClientRecovery(errorRecord = {}) {
  notifyAutoRecovery('Estamos tentando corrigir automaticamente', 'pending')
  try {
    if (typeof window !== 'undefined') {
      const corruptedKeys = ['sit.fiberRowsCache', 'sit.fiberCitiesCache']
      corruptedKeys.forEach((key) => {
        try {
          JSON.parse(window.localStorage.getItem(key) || 'null')
        } catch {
          window.localStorage.removeItem(key)
        }
      })
    }

    const { flushPendingSync } = await import('../firebase/db')
    await flushPendingSync()
    notifyAutoRecovery('Erro resolvido com sucesso', 'resolved')
    return {
      status: 'resolvido_automaticamente',
      autoFixStatus: 'sucesso',
      autoFixMessage: 'Cache verificado e fila de sincronização reenviada.',
    }
  } catch (error) {
    notifyAutoRecovery('Não foi possível corrigir automaticamente. O suporte foi notificado.', 'failed')
    return {
      status: errorRecord.severity === 'critico' ? 'precisa_intervencao_admin' : 'pendente',
      autoFixStatus: 'falhou',
      autoFixMessage: error.message || 'Falha na recuperação automática.',
    }
  }
}
