import {
  getFirestore,
  collection,
  setDoc,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  doc,
  getDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  enableIndexedDbPersistence,
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { app } from './app'
import { auth } from './auth'
import { logInternal, reportError } from '../utils/operationLog'
import { attemptClientRecovery } from '../utils/systemErrorReporter'

const db = getFirestore(app)

const vendasCollection = collection(db, 'vendas')
const portabilidadesCollection = collection(db, 'portabilidades')
const goalsCollection = collection(db, 'goals')
const usersCollection = collection(db, 'users')
const storesCollection = collection(db, 'stores')
const commissionRulesCollection = collection(db, 'commissionRules')
const importHistoryCollection = collection(db, 'importHistory')
const systemErrorsCollection = collection(db, 'system_errors')
const fiberCoverageCollections = [
  'viabilidade_fibra',
  'fiberCoverage',
  'fiberViability',
  'fiberCoverageCities',
  'fiberCities',
  'cidadesFibra',
  'viabilidadeFibra',
]
const primaryFiberCoverageCollection = 'viabilidade_fibra'
const API_CACHE_PREFIX = 'sit.apiCache.'
const PENDING_SYNC_KEY = 'sit.pendingSyncQueue'
const FIBER_ROWS_CACHE_KEY = 'sit.fiberRowsCache'
const FIBER_CITIES_CACHE_KEY = 'sit.fiberCitiesCache'
const FIBER_CACHE_TTL_MS = 10 * 60 * 1000

const importTargetCollections = {
  viabilidade_fibra: 'viabilidade_fibra',
  clientes: 'clientes',
  vendas: 'vendas',
  metas: 'goals',
  lojas: 'stores',
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function notifySync(detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('sit:sync-status', { detail }))
}

function readJsonCache(key, fallback = null) {
  if (typeof window === 'undefined') return fallback
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null')
    return parsed || fallback
  } catch {
    return fallback
  }
}

function writeJsonCache(key, value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function readApiCache(path) {
  const cached = readJsonCache(`${API_CACHE_PREFIX}${path}`)
  return cached?.data || null
}

function writeApiCache(path, data) {
  writeJsonCache(`${API_CACHE_PREFIX}${path}`, { data, updatedAt: Date.now() })
}

function readPendingSyncQueue() {
  return readJsonCache(PENDING_SYNC_KEY, [])
}

function writePendingSyncQueue(queue) {
  writeJsonCache(PENDING_SYNC_KEY, queue)
  notifySync({
    status: queue.length ? 'pending' : 'success',
    pending: queue.length,
    message: queue.length ? 'Itens aguardando sincronização' : 'Salvo com sucesso',
  })
}

function enqueuePendingSync(item) {
  const queue = readPendingSyncQueue()
  const nextItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    attempts: 0,
    createdAt: new Date().toISOString(),
    ...item,
  }
  writePendingSyncQueue([...queue, nextItem])
  logInternal('sync.queued', { label: item.label, path: item.path })
}

async function trackedWrite(label, action) {
  notifySync({ status: 'saving', saving: true, message: 'Salvando...', label })
  try {
    const result = await action()
    notifySync({ status: 'success', saving: false, message: 'Salvo com sucesso', label, pending: readPendingSyncQueue().length })
    logInternal('write.success', { label })
    return result
  } catch (error) {
    notifySync({ status: 'error', saving: false, message: 'Erro ao salvar', label, pending: readPendingSyncQueue().length })
    reportError(error, { label, module: label, action: 'salvar', autoFix: true })
    throw error
  }
}

export async function flushPendingSync() {
  const queue = readPendingSyncQueue()
  if (!queue.length) return { flushed: false, remaining: 0 }

  const remaining = []
  for (const item of queue) {
    try {
      await apiRequest(item.path, item.options)
      logInternal('sync.flushed', { label: item.label, path: item.path })
    } catch (error) {
      remaining.push({ ...item, attempts: Number(item.attempts || 0) + 1, lastError: error.message })
    }
  }
  writePendingSyncQueue(remaining)
  return { flushed: true, remaining: remaining.length }
}

if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((error) => {
    if (!['failed-precondition', 'unimplemented'].includes(error?.code)) {
      console.warn('Não foi possível ativar persistência local do Firestore.', error)
    }
  })
}

const CONFIGURED_API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const IS_DEV = import.meta.env.DEV

function getApiUrls() {
  const urls = []

  if (CONFIGURED_API_URL) {
    urls.push(CONFIGURED_API_URL)
  }

  if (IS_DEV) {
    urls.push('http://localhost:4100')
    urls.push('http://localhost:4000')
  }

  return [...new Set(urls.map((url) => url.replace(/\/$/, '')))]
}

function getApiUnavailableError() {
  return new Error(IS_DEV
    ? 'Backend local indisponível. Configure VITE_API_URL ou rode npm run server.'
    : 'Backend não configurado em produção. Configure VITE_API_URL na Vercel ou use os fallbacks do Firestore.')
}

function waitForAuthUser() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser)

  return new Promise((resolve) => {
    let unsubscribe = () => {}
    const timeout = setTimeout(() => {
      unsubscribe()
      resolve(null)
    }, 3000)

    unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(timeout)
      unsubscribe()
      resolve(user)
    }, () => {
      clearTimeout(timeout)
      unsubscribe()
      resolve(null)
    })
  })
}

export async function apiRequest(path, options = {}) {
  const apiUrls = getApiUrls()
  if (!apiUrls.length) {
    throw getApiUnavailableError()
  }

  const headers = new Headers(options.headers || {})
  const user = auth.currentUser || await waitForAuthUser()
  const token = user ? await user.getIdToken() : ''

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const method = String(options.method || 'GET').toUpperCase()
  const maxAttempts = method === 'GET' ? 2 : 3
  let lastError = null

  for (const apiUrl of apiUrls) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 9000)
      try {
        const response = await fetch(`${apiUrl}${path}`, {
          ...options,
          headers,
          signal: options.signal || controller.signal,
        })
        const data = await response.json().catch(() => ({}))
        clearTimeout(timeout)

        if (response.ok) {
          if (method === 'GET') writeApiCache(path, data)
          return data
        }

        const error = new Error(data.message || 'Erro na comunicação com o servidor')
        error.status = response.status
        lastError = error

        if ([400, 401, 403].includes(response.status)) {
          throw error
        }
      } catch (error) {
        clearTimeout(timeout)
        lastError = error
        if (error.status && [400, 401, 403].includes(error.status)) {
          throw error
        }
      }
      if (attempt < maxAttempts) await sleep(350 * attempt)
    }
  }

  if (method === 'GET') {
    const cached = readApiCache(path)
    if (cached) {
      logInternal('api.cache.fallback', { path })
      return cached
    }
  }

  reportError(lastError, { path, method, module: 'api', action: method === 'GET' ? 'consultar dados' : 'salvar dados', autoFix: method !== 'GET' })
  throw lastError || new Error('Erro na comunicação com o servidor')
}

function buildDateQuery(collectionRef, filter) {
  const constraints = []
  if (filter.cpf) constraints.push(where('cpf', '==', filter.cpf))
  if (filter.seller) constraints.push(where('seller', '==', filter.seller))
  if (filter.status) constraints.push(where('status', '==', filter.status))
  if (filter.saleType) constraints.push(where('saleType', '==', filter.saleType))
  if (filter.fromDate) {
    const from = Timestamp.fromDate(new Date(filter.fromDate))
    constraints.push(where('createdAt', '>=', from))
  }
  if (filter.toDate) {
    const to = new Date(filter.toDate)
    to.setHours(23, 59, 59, 999)
    const toTimestamp = Timestamp.fromDate(to)
    constraints.push(where('createdAt', '<=', toTimestamp))
  }
  return query(collectionRef, ...constraints, orderBy('createdAt', 'desc'))
}

function serializeClientDoc(docItem) {
  const data = docItem.data()
  return {
    id: docItem.id,
    ...data,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
  }
}

function serializeClientData(id, data = {}) {
  return {
    id,
    ...data,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
  }
}

function removeUndefinedFields(payload) {
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) delete payload[key]
  })
  return payload
}

export const ROLE_COMMISSION_RATES = {
  Administrador: 0.03,
  Executivo: 0.05,
  Gerente: 0.06,
  Vendedor: 0.08,
}

async function fetchCollection(queryRef) {
  const snap = await getDocs(queryRef)
  return snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }))
}

function buildGenericConstraints(filter = {}) {
  const constraints = []
  Object.entries(filter).forEach(([key, value]) => {
    if (value !== undefined && value !== '') constraints.push(where(key, '==', value))
  })
  return constraints
}

async function getCollectionFromFirestore(collectionRef, filter = {}) {
  const constraints = buildGenericConstraints(filter)
  const snap = await getDocs(constraints.length ? query(collectionRef, ...constraints) : query(collectionRef))
  return snap.docs.map(serializeClientDoc)
}

export async function getUserByEmail(email) {
  if (!email) return null
  const q = query(usersCollection, where('email', '==', email))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const docItem = snap.docs[0]
  return { id: docItem.id, ...docItem.data() }
}

export function getCommissionRate(role) {
  return ROLE_COMMISSION_RATES[role] ?? 0.05
}

function hasPortability(data = {}) {
  return data.saleType === 'Portabilidade'
    || normalizeText(data.saleType).includes('portabilidade')
    || (data.saleType === 'Aparelhos' && normalizeText(data.deviceSaleMode).includes('portabilidade'))
    || normalizeText(data.portability) === 'sim'
    || normalizeText(data.portabilidade) === 'sim'
    || Boolean(String(data.provisionalNumber || '').trim())
}

function normalizeSaleText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function normalizePlanName(value) {
  return normalizeText(value)
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
}

function hasWildcardPattern(value) {
  return String(value || '').includes('*')
}

function planPatternMatches(pattern, plan) {
  const normalizedPattern = normalizePlanName(pattern)
  const normalizedPlan = normalizePlanName(plan)
  if (!normalizedPattern || !normalizedPlan) return false
  if (!hasWildcardPattern(pattern)) return normalizedPattern === normalizedPlan

  const escaped = normalizedPattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${escaped}$`).test(normalizedPlan)
}

function getRuleSpecificity(rule = {}) {
  const previous = normalizePlanName(rule.planoAnterior)
  const next = normalizePlanName(rule.planoNovo)
  const wildcardPenalty = (hasWildcardPattern(rule.planoAnterior) ? 1000 : 0) + (hasWildcardPattern(rule.planoNovo) ? 1000 : 0)
  return previous.length + next.length - wildcardPenalty
}

function isDependentSale(data = {}) {
  return normalizeSaleText(data.plan) === 'DEPENDENTE'
}

function hasDeviceSale(data = {}) {
  return data.saleType === 'Aparelhos'
    || (data.saleType === 'Upgrade' && normalizeText(data.addDeviceToUpgrade) === 'sim')
    || (data.saleType === 'Upgrade' && Number(data.deviceValue || 0) > 0)
}

function getDependentCount(data = {}) {
  const count = Math.max(0, Number(data.dependentCount ?? data.dependents ?? 0) || 0)
  return count || (isDependentSale(data) ? 1 : 0)
}

async function getCommissionRulesForFallback() {
  try {
    const snap = await getDocs(commissionRulesCollection)
    return snap.docs.map(serializeClientDoc).filter((rule) => rule.ativo !== false)
  } catch (error) {
    console.warn('Não foi possível carregar regras para cálculo local de comissão.', error)
    return []
  }
}

function findUpgradeCommissionRuleForSale(sale, rules = []) {
  if (sale.saleType !== 'Upgrade') return null
  const previousPlan = normalizePlanName(sale.previousPlan)
  const newPlan = normalizePlanName(sale.plan)
  if (!previousPlan || !newPlan) return null

  return rules
    .filter((rule) => (
      normalizeText(rule.subcategoria || rule.categoria) === 'upgrade'
      && planPatternMatches(rule.planoAnterior, previousPlan)
      && planPatternMatches(rule.planoNovo, newPlan)
    ))
    .sort((a, b) => getRuleSpecificity(b) - getRuleSpecificity(a) || Number(b.valorComissao || 0) - Number(a.valorComissao || 0))[0] || null
}

function findCommissionRuleBySubcategoryForFallback(rules = [], subcategoria) {
  return rules.find((rule) => normalizeText(rule.subcategoria || rule.categoria) === normalizeText(subcategoria)) || null
}

function getCommissionPercentForFallback(rule, fallbackPercent) {
  const percent = Number(rule?.percentualComissao || fallbackPercent || 0)
  return Number.isFinite(percent) ? percent / 100 : 0
}

function getStoreCommissionPercentForFallback(rule, fallbackPercent) {
  const percent = Number(rule?.percentualLoja || fallbackPercent || 0)
  return Number.isFinite(percent) ? percent / 100 : 0
}

async function buildSalePayload(data, includeTimestamp = true) {
  const commissionRules = await getCommissionRulesForFallback()
  const upgradeRule = findUpgradeCommissionRuleForSale(data, commissionRules)
  const deviceRule = findCommissionRuleBySubcategoryForFallback(commissionRules, 'Aparelhos')
  const upgradeSale = data.saleType === 'Upgrade'
  const amount = upgradeSale ? 0 : Number(data.amount || 0)
  const planValue = data.saleType === 'Upgrade'
    ? 0
    : isDependentSale(data)
      ? 0
      : Number(data.planValue !== undefined && data.planValue !== '' ? data.planValue : amount)
  const commissionRate = data.saleType === 'Upgrade' ? 0 : 0.05
  const portabilityCommission = hasPortability(data) ? 2 : 0
  const dependentCommission = getDependentCount(data) * 5
  const storePortabilityCommission = hasPortability(data) ? 1 : 0
  const upgradeCommission = upgradeSale && upgradeRule ? Number(Number(upgradeRule.valorComissao || 0).toFixed(2)) : 0
  const sellerDeviceRate = getCommissionPercentForFallback(deviceRule, 2)
  const storeDeviceRate = getStoreCommissionPercentForFallback(deviceRule, 1.5)
  const sellerDeviceCommission = hasDeviceSale(data)
    ? Number((Number(data.deviceValue || amount || 0) * sellerDeviceRate).toFixed(2))
    : 0
  const storeDeviceCommission = hasDeviceSale(data)
    ? Number((Number(data.deviceValue || amount || 0) * storeDeviceRate).toFixed(2))
    : 0
  const payload = {
    ...data,
    amount: isDependentSale(data) ? 0 : amount,
    dependentCount: getDependentCount(data),
    commissionRate,
    commission: Number(((planValue * commissionRate) + portabilityCommission + dependentCommission + sellerDeviceCommission + upgradeCommission).toFixed(2)),
    storeCommission: Number(((planValue * commissionRate) + storePortabilityCommission + dependentCommission + storeDeviceCommission + upgradeCommission).toFixed(2)),
    commissionDetails: {
      ...(data.commissionDetails || {}),
      revenue: {
        base: planValue,
        rate: commissionRate,
        amount: Number((planValue * commissionRate).toFixed(2)),
      },
      portability: {
        count: hasPortability(data) ? 1 : 0,
        amount: portabilityCommission,
        storeAmount: storePortabilityCommission,
      },
      dependents: {
        count: getDependentCount(data),
        amount: dependentCommission,
        storeAmount: dependentCommission,
      },
      devices: {
        base: Number(data.deviceValue || 0),
        sellerRate: sellerDeviceRate,
        sellerAmount: sellerDeviceCommission,
        storeRate: storeDeviceRate,
        ruleId: deviceRule?.id || '',
        storeAmount: storeDeviceCommission,
      },
      upgrade: {
        previousPlan: data.previousPlan || '',
        newPlan: data.plan || '',
        ruleId: upgradeRule?.id || '',
        type: upgradeRule?.tipoUpgrade || '',
        category: upgradeRule?.categoria || '',
        amount: upgradeCommission,
        storeAmount: upgradeCommission,
      },
    },
  }
  if (includeTimestamp) {
    payload.createdAt = serverTimestamp()
  } else {
    payload.updatedAt = serverTimestamp()
  }
  return payload
}

export async function addVenda(data) {
  return trackedWrite('venda', async () => {
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
    try {
      return await apiRequest('/api/vendas', options)
    } catch (apiError) {
      console.warn('API indisponível para salvar venda. Salvando direto no Firestore.', apiError)
      const payload = removeUndefinedFields(await buildSalePayload(data))
      const ref = await addDoc(vendasCollection, payload)
      await updateDoc(ref, { id: ref.id, updatedAt: serverTimestamp() })
      enqueuePendingSync({ label: 'venda', path: '/api/vendas', options })
      const snap = await getDoc(ref)
      return serializeClientDoc(snap)
    }
  })
}

export async function getVendas(filter = {}) {
  const params = new URLSearchParams()
  Object.entries(filter).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, value)
  })
  const queryString = params.toString()
  try {
    return await apiRequest(`/api/vendas${queryString ? `?${queryString}` : ''}`)
  } catch (apiError) {
    console.warn('API indisponível para carregar vendas. Tentando Firestore direto.', apiError)
    const q = buildDateQuery(vendasCollection, filter)
    return fetchCollection(q)
  }
}

export async function updateVenda(id, data) {
  return trackedWrite('venda', async () => {
    const options = {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
    try {
      return await apiRequest(`/api/vendas/${id}`, options)
    } catch (apiError) {
      console.warn('API indisponível para atualizar venda. Atualizando Firestore direto.', apiError)
      const ref = doc(db, 'vendas', id)
      const payload = removeUndefinedFields(await buildSalePayload(data, false))
      await updateDoc(ref, payload)
      enqueuePendingSync({ label: 'venda', path: `/api/vendas/${id}`, options })
      const snap = await getDoc(ref)
      return serializeClientDoc(snap)
    }
  })
}

export async function deleteVenda(id) {
  try {
    return await apiRequest(`/api/vendas/${id}`, {
      method: 'DELETE',
    })
  } catch (apiError) {
    console.warn('API indisponível para excluir venda. Excluindo Firestore direto.', apiError)
    await deleteDoc(doc(db, 'vendas', id))
    return { message: 'Venda excluída com sucesso' }
  }
}

export async function addPortabilidade(data) {
  const payload = { ...data, createdAt: serverTimestamp() }
  return addDoc(portabilidadesCollection, payload)
}

export async function getPortabilidades(filter = {}) {
  const q = buildDateQuery(portabilidadesCollection, filter)
  return fetchCollection(q)
}

export async function updatePortabilidade(id, data) {
  const ref = doc(db, 'portabilidades', id)
  return updateDoc(ref, data)
}

export async function deletePortabilidade(id) {
  const ref = doc(db, 'portabilidades', id)
  return deleteDoc(ref)
}

export async function addMeta(data) {
  return addGoal(data)
}

export async function getMetas(filter = {}) {
  return getGoals(filter)
}

export async function updateMeta(id, data) {
  return updateGoal(id, data)
}

export async function deleteMeta(id) {
  return deleteGoal(id)
}

export async function addGoal(data) {
  return trackedWrite('meta', async () => {
    const user = auth.currentUser || await waitForAuthUser()
    const payload = {
      ...data,
      userId: data.userId || user?.uid || '',
      userName: data.userName || user?.displayName || user?.email || '',
      targetValue: Number(data.targetValue || 0),
      currentValue: Number(data.currentValue || 0),
      month: Number(data.month),
      year: Number(data.year),
      autoSync: true,
      manualRealized: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    delete payload.actorRole
    delete payload.skipApiSync
    delete payload.manualCurrentValue
    delete payload.manualSalesBaseValue
    removeUndefinedFields(payload)

    try {
      const ref = await addDoc(goalsCollection, payload)
      await updateDoc(ref, { id: ref.id, updatedAt: serverTimestamp() })
      if (data.skipApiSync) {
        const snap = await getDoc(ref)
        return serializeClientDoc(snap)
      }
      try {
        return await apiRequest(`/api/goals/${ref.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, id: ref.id }),
        })
      } catch (syncError) {
        enqueuePendingSync({
          label: 'meta',
          path: `/api/goals/${ref.id}`,
          options: {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, id: ref.id }),
          },
        })
        console.warn('Meta salva no Firestore, mas a API não recalculou o realizado agora.', syncError)
      }
      const snap = await getDoc(ref)
      return serializeClientDoc(snap)
    } catch (firestoreError) {
      console.warn('Não foi possível salvar meta direto no Firestore. Tentando API.', firestoreError)
      return apiRequest('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    }
  })
}

export async function getGoals(filter = {}) {
  const params = new URLSearchParams()
  Object.entries(filter).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, value)
  })
  const queryString = params.toString()

  try {
    return apiRequest(`/api/goals${queryString ? `?${queryString}` : ''}`)
  } catch (apiError) {
    console.warn('Não foi possível carregar metas pela API. Tentando Firestore direto.', apiError)
    return getGoalsFromFirestore(filter)
  }
}

export async function getGoalRankings(filter = {}) {
  const params = new URLSearchParams()
  Object.entries(filter).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, value)
  })
  const queryString = params.toString()
  try {
    return await apiRequest(`/api/goal-rankings${queryString ? `?${queryString}` : ''}`)
  } catch (apiError) {
    console.warn('API indisponível para ranking de metas. Usando ranking vazio.', apiError)
    return { sellers: [], stores: [], groups: [], ownPosition: null }
  }
}

function getDistributedTarget(total, count, index) {
  const target = Number(total || 0)
  if (!count) return 0
  const share = Number((target / count).toFixed(2))
  if (index < count - 1) return share
  return Number((target - (share * (count - 1))).toFixed(2))
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function sanitizeDocId(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/\\#?\[\]]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 140) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getFiberCityFromDoc(data = {}) {
  return data.city || data.cidade || data.municipio || data.MUNICIPIO || ''
}

function getFiberUfFromDoc(data = {}) {
  return data.uf || data.UF || data.state || data.estado || ''
}

function getFiberViabilityCodeFromDoc(data = {}) {
  if (data.viabilityCode || data.viabilidade || data.VIABILIDADE) {
    return data.viabilityCode || data.viabilidade || data.VIABILIDADE || ''
  }
  const value = String(data.viability || '').trim()
  return /^\d+$/.test(value) ? value : ''
}

function getFiberViabilityReasonFromDoc(data = {}) {
  const value = String(data.viability || '').trim()
  if (value && !/^\d+$/.test(value)) return value
  return data.motivo || data.MOTIVO || data.status || data.situacao || ''
}

function serializeFiberRow(docItem) {
  const data = docItem.data ? docItem.data() : docItem
  return {
    id: docItem.id || data.id || '',
    referenceDate: data.referenceDate || data.DT_REF || '',
    uf: getFiberUfFromDoc(data),
    city: getFiberCityFromDoc(data),
    cep: data.cep || data.CEP || '',
    street: data.street || data.rua || data.logradouro || data.LOGRADOURO || '',
    number: data.number || data.numero || data.numLogradouro || data.NUM_LOGRADOURO || '',
    complement: [
      data.complement || data.complemento || data.COMPLEMENTO,
      data.complement2 || data.COMPLEMENTO2,
      data.complement3 || data.COMPLEMENTO3,
      data.complement4 || data.COMPLEMENTO4,
      data.complement5 || data.COMPLEMENTO5,
    ].filter(Boolean).join(' '),
    neighborhood: data.neighborhood || data.bairro || data.BAIRRO || '',
    households: Number(data.households ?? data.QTD_HH ?? 0) || 0,
    latitude: data.latitude || data.LATITUDE || '',
    longitude: data.longitude || data.LONGITUDE || '',
    viabilityCode: getFiberViabilityCodeFromDoc(data),
    viability: getFiberViabilityReasonFromDoc(data),
    lotType: data.lotType || data.TIPO_LOTE || '',
    infraProvider: data.infraProvider || data.INFRACO_PRINCIPAL || '',
    olt: data.olt || data.OLT || '',
    oltSegmentation: data.oltSegmentation || data.SEGMENTACAO_OLT || '',
    capacityBlocked: data.capacityBlocked || data.BLOQ_CAPACITY || '',
    capacityReason: data.capacityReason || data.MOTIVO_CAPACITY || '',
  }
}

function buildFiberCities(rows = []) {
  const byKey = new Map()
  rows.forEach((row) => {
    const city = getFiberCityFromDoc(row)
    const uf = getFiberUfFromDoc(row)
    const key = `${normalizeText(city)}|${normalizeText(uf)}`
    if (!city || byKey.has(key)) return
    byKey.set(key, {
      city,
      uf,
      label: uf ? `${city} / ${uf}` : city,
    })
  })
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

function fiberRowKey(row = {}) {
  return [
    row.uf,
    row.city,
    row.cep,
    row.street,
    row.number,
    row.complement,
    row.neighborhood,
  ].map((value) => normalizeText(value)).join('|')
}

function mergeFiberRows(...rowGroups) {
  const byKey = new Map()
  rowGroups.flat().forEach((row) => {
    const key = fiberRowKey(row)
    if (!key.replace(/\|/g, '')) return
    if (!byKey.has(key)) byKey.set(key, row)
  })
  return [...byKey.values()]
}

function mergeFiberCities(...cityGroups) {
  const byKey = new Map()
  cityGroups.flat().forEach((item) => {
    const city = item.city || item.cidade || item.municipio || ''
    const uf = item.uf || item.UF || item.state || item.estado || ''
    const key = `${normalizeText(city)}|${normalizeText(uf)}`
    if (!city || byKey.has(key)) return
    byKey.set(key, {
      city,
      uf,
      label: item.label || (uf ? `${city} / ${uf}` : city),
    })
  })
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

async function getStaticFiberCities() {
  if (typeof fetch === 'undefined') return []
  try {
    const response = await fetch('/fiber-cities.json', { cache: 'no-store' })
    if (!response.ok) return []
    const data = await response.json()
    return mergeFiberCities(Array.isArray(data?.cities) ? data.cities : [])
  } catch (error) {
    console.warn('Não foi possível carregar cidades estáticas de fibra.', error)
    return []
  }
}

async function getStaticFiberIndex() {
  if (typeof fetch === 'undefined') return null
  try {
    const response = await fetch('/fiber-index/index.json', { cache: 'no-store' })
    if (!response.ok) return null
    return response.json()
  } catch (error) {
    console.warn('Não foi possível carregar índice estático de fibra.', error)
    return null
  }
}

function mapStaticFiberRow(columns = [], values = [], cityInfo = {}) {
  const get = (column) => values[columns.indexOf(column)] ?? ''
  return {
    uf: cityInfo.uf || '',
    city: cityInfo.city || '',
    cep: get('cep'),
    street: get('street'),
    number: get('number'),
    complement: get('complement'),
    neighborhood: get('neighborhood'),
    households: Number(get('households')) || 0,
    viabilityCode: get('viabilityCode'),
    viability: get('viability'),
    olt: get('olt'),
    capacityReason: get('capacityReason'),
  }
}

async function getStaticFiberRowsForCity(cityInfo) {
  if (!cityInfo?.file || typeof fetch === 'undefined') return []
  const response = await fetch(`/fiber-index/${cityInfo.file}`)
  if (!response.ok) return []
  const data = await response.json()
  const columns = Array.isArray(data?.columns) ? data.columns : []
  const rows = Array.isArray(data?.rows) ? data.rows : []
  return rows.map((values) => mapStaticFiberRow(columns, values, cityInfo))
}

async function searchStaticFiberViability(filters = {}, limit = 150) {
  const startedAt = Date.now()
  const index = await getStaticFiberIndex()
  const cityEntries = Array.isArray(index?.cities) ? index.cities : []
  if (!cityEntries.length) return null

  const selectedCity = normalizeText(filters.city)
  const cepDigits = onlyDigits(filters.cep)
  const cepPrefix = cepDigits.length >= 5 ? cepDigits.slice(0, 5) : ''
  const selectedCities = selectedCity
    ? cityEntries.filter((item) => normalizeText(item.city) === selectedCity)
    : cityEntries
  const citiesToSearch = cepPrefix
    ? selectedCities.filter((item) => Array.isArray(item.cepPrefixes) && item.cepPrefixes.includes(cepPrefix))
    : selectedCities

  if (!citiesToSearch.length) {
    return {
      rows: [],
      totalMatches: 0,
      scannedRows: 0,
      limit,
      elapsedMs: Date.now() - startedAt,
      source: 'static',
    }
  }

  const matches = []
  let totalMatches = 0
  let scannedRows = 0

  for (const cityInfo of citiesToSearch) {
    const rows = await getStaticFiberRowsForCity(cityInfo)
    scannedRows += rows.length
    rows.forEach((row) => {
      if (!fiberRowMatches(row, filters)) return
      totalMatches += 1
      if (matches.length < limit) matches.push(row)
    })
  }

  return {
    rows: matches,
    totalMatches,
    scannedRows,
    limit,
    elapsedMs: Date.now() - startedAt,
    source: 'static',
  }
}

function fiberRowMatches(row, filters = {}) {
  if (filters.city && !normalizeText(row.city).includes(normalizeText(filters.city))) return false
  if (filters.cep && !onlyDigits(row.cep).startsWith(onlyDigits(filters.cep))) return false
  if (filters.street && !normalizeText(row.street).includes(normalizeText(filters.street))) return false
  if (filters.number && onlyDigits(row.number) !== onlyDigits(filters.number)) return false
  if (filters.neighborhood && !normalizeText(row.neighborhood).includes(normalizeText(filters.neighborhood))) return false
  return true
}

async function getFiberRowsFromFirestore() {
  const rows = []
  const diagnostics = []
  for (const collectionName of fiberCoverageCollections) {
    try {
      const snap = await getDocs(collection(db, collectionName))
      diagnostics.push({
        collection: collectionName,
        status: snap.empty ? 'empty' : 'ok',
        rows: snap.size,
        primary: collectionName === primaryFiberCoverageCollection,
      })
      if (!snap.empty) {
        rows.push(...snap.docs.map(serializeFiberRow))
      }
    } catch (error) {
      diagnostics.push({ collection: collectionName, status: error?.code || 'error', rows: 0, message: error.message })
      console.warn(`Não foi possível ler ${collectionName} no Firestore.`, error)
    }
  }
  const mergedRows = mergeFiberRows(rows)
  if (mergedRows.length) {
    writeJsonCache(FIBER_ROWS_CACHE_KEY, { rows: mergedRows, diagnostics, updatedAt: Date.now() })
  } else {
    const cached = readJsonCache(FIBER_ROWS_CACHE_KEY)
    if (cached?.rows?.length) {
      logInternal('fiber.cache.fallback', { rows: cached.rows.length })
      return cached.rows
    }
  }
  return mergedRows
}

export async function getFiberViabilityCities() {
  const cached = readJsonCache(FIBER_CITIES_CACHE_KEY)

  let apiCities = []
  try {
    const data = await apiRequest('/api/fiber-viability/cities')
    if (Array.isArray(data) && data.length) {
      apiCities = data
    }
  } catch (apiError) {
    console.warn('Não foi possível carregar cidades de fibra pela API. Tentando fallback estático.', apiError)
  }

  if (apiCities.length) {
    const normalizedApiCities = mergeFiberCities(apiCities)
    writeJsonCache(FIBER_CITIES_CACHE_KEY, { cities: normalizedApiCities, updatedAt: Date.now(), source: 'api' })
    return normalizedApiCities
  }

  const staticCities = await getStaticFiberCities()
  if (staticCities.length) {
    writeJsonCache(FIBER_CITIES_CACHE_KEY, { cities: staticCities, updatedAt: Date.now(), source: 'static' })
    return staticCities
  }

  const coverageRows = await getFiberRowsFromFirestore()
  const coverageCities = buildFiberCities(coverageRows)
  if (coverageCities.length) {
    writeJsonCache(FIBER_CITIES_CACHE_KEY, { cities: coverageCities, updatedAt: Date.now(), source: 'firestore' })
    return coverageCities
  }

  if (cached?.cities?.length && Date.now() - Number(cached.updatedAt || 0) < FIBER_CACHE_TTL_MS) {
    return cached.cities
  }

  const stores = await getStores()
  const storeCities = buildFiberCities(stores.map((store) => ({
    city: store.city || store.storeCity || store.cidade,
    uf: store.state || store.storeState || store.uf || store.estado,
  })))
  writeJsonCache(FIBER_CITIES_CACHE_KEY, { cities: storeCities, updatedAt: Date.now(), source: 'stores' })
  return storeCities
}

export async function searchFiberViability(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (String(value || '').trim()) params.set(key, String(value).trim())
  })
  params.set('limit', '150')

  let apiResult = null
  try {
    apiResult = await apiRequest(`/api/fiber-viability?${params.toString()}`)
  } catch (apiError) {
    console.warn('Não foi possível consultar viabilidade pela API. Tentando base estática.', apiError)
  }

  if (apiResult?.rows?.length || Number(apiResult?.totalMatches || 0) > 0) {
    return apiResult
  }

  const staticResult = await searchStaticFiberViability(filters, 150)
  if (staticResult?.rows?.length || Number(staticResult?.totalMatches || 0) > 0) {
    return staticResult
  }

  const rows = (await getFiberRowsFromFirestore()).filter((row) => fiberRowMatches(row, filters))
  if (apiResult?.rows?.length) {
    const mergedRows = mergeFiberRows(apiResult.rows, rows)
    return {
      rows: mergedRows.slice(0, 150),
      totalMatches: Math.max(Number(apiResult.totalMatches || 0), apiResult.rows.length) + rows.length,
      scannedRows: Number(apiResult.scannedRows || 0) + rows.length,
      limit: 150,
      elapsedMs: Number(apiResult.elapsedMs || 0),
    }
  }

  return {
    rows: rows.slice(0, 150),
    totalMatches: rows.length,
    scannedRows: rows.length,
    limit: 150,
    elapsedMs: 0,
  }
}

export async function diagnoseFiberViability() {
  let localBase = null
  let staticCitiesCount = 0
  try {
    const apiDiagnostics = await apiRequest('/api/fiber-viability/diagnostics')
    localBase = apiDiagnostics?.localBase || null
  } catch (apiError) {
    console.warn('Diagnóstico local de fibra indisponível. Tentando Firestore/cache.', apiError)
  }

  try {
    staticCitiesCount = (await getStaticFiberCities()).length
  } catch {
    staticCitiesCount = 0
  }

  const diagnostics = []
  for (const collectionName of fiberCoverageCollections) {
    try {
      const snap = await getDocs(collection(db, collectionName))
      diagnostics.push({
        collection: collectionName,
        status: snap.empty ? 'empty' : 'ok',
        rows: snap.size,
      })
    } catch (error) {
      diagnostics.push({
        collection: collectionName,
        status: error?.code === 'permission-denied' ? 'permission-denied' : 'error',
        rows: 0,
        message: error.message,
      })
    }
  }
  const cachedRows = readJsonCache(FIBER_ROWS_CACHE_KEY)?.rows || []
  return {
    localBase,
    collections: diagnostics,
    cachedRows: cachedRows.length,
    staticCities: staticCitiesCount,
    primaryCollectionActive: diagnostics.some((item) => item.collection === primaryFiberCoverageCollection && item.rows > 0),
    hasData: localBase?.status === 'active' || diagnostics.some((item) => item.rows > 0) || cachedRows.length > 0 || staticCitiesCount > 0,
    checkedAt: new Date().toISOString(),
  }
}

export function subscribeImportHistory(onChange, onError) {
  return onSnapshot(query(importHistoryCollection, orderBy('createdAt', 'desc')), (snap) => {
    onChange(snap.docs.map(serializeClientDoc))
  }, onError)
}

export function subscribeSystemErrors(onChange, onError) {
  return onSnapshot(query(systemErrorsCollection, orderBy('createdAt', 'desc')), (snap) => {
    onChange(snap.docs.map(serializeClientDoc))
  }, onError)
}

export async function updateSystemError(id, data) {
  const ref = doc(db, 'system_errors', id)
  await updateDoc(ref, removeUndefinedFields({
    ...data,
    updatedAt: serverTimestamp(),
  }))
}

export async function retrySystemErrorRecovery(errorRecord) {
  const result = await attemptClientRecovery(errorRecord)
  await updateSystemError(errorRecord.id, {
    status: result.status,
    autoFixAttempted: true,
    autoFixStatus: result.autoFixStatus,
    autoFixMessage: result.autoFixMessage,
    lastAutoFixAt: new Date().toISOString(),
  })
  return result
}

export async function importBaseRows({
  target,
  rows,
  fileName,
  actor = {},
  stats = {},
}) {
  const collectionName = importTargetCollections[target]
  if (!collectionName) throw new Error('Tipo de base inválido para importação.')
  if (!Array.isArray(rows) || !rows.length) throw new Error('Nenhuma linha válida para importar.')

  return trackedWrite('importacao-base', async () => {
    const historyRef = doc(importHistoryCollection)
    const startedAt = new Date().toISOString()
    const commonHistory = {
      target,
      targetCollection: collectionName,
      fileName: fileName || 'planilha',
      userId: actor.uid || '',
      userName: actor.name || actor.email || 'Administrador',
      userEmail: actor.email || '',
      totalRows: Number(stats.totalRows || rows.length),
      validRows: rows.length,
      invalidRows: Number(stats.invalidRows || 0),
      duplicateRows: Number(stats.duplicateRows || 0),
      errors: Array.isArray(stats.errors) ? stats.errors.slice(0, 80) : [],
      status: 'processando',
      startedAt,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    await setDoc(historyRef, commonHistory)

    try {
      let committed = 0
      for (let start = 0; start < rows.length; start += 400) {
        const batch = writeBatch(db)
        rows.slice(start, start + 400).forEach((row) => {
          const docId = sanitizeDocId(row._docId || row.id)
          const ref = doc(db, collectionName, docId)
          const payload = removeUndefinedFields({
            ...row,
            id: docId,
            importId: historyRef.id,
            importFileName: fileName || '',
            importedBy: actor.email || actor.uid || '',
            updatedAt: serverTimestamp(),
            createdAt: row.createdAt || serverTimestamp(),
          })
          delete payload._docId
          batch.set(ref, payload, { merge: true })
        })
        await batch.commit()
        committed += rows.slice(start, start + 400).length
        logInternal('import.batch.committed', { target, committed, total: rows.length })
      }

      const result = {
        id: historyRef.id,
        ...commonHistory,
        importedRows: committed,
        status: 'concluido',
        finishedAt: new Date().toISOString(),
      }

      await updateDoc(historyRef, {
        importedRows: committed,
        status: 'concluido',
        finishedAt: result.finishedAt,
        updatedAt: serverTimestamp(),
      })

      if (target === 'viabilidade_fibra') {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(FIBER_ROWS_CACHE_KEY)
          window.localStorage.removeItem(FIBER_CITIES_CACHE_KEY)
        }
      }

      return result
    } catch (error) {
      await updateDoc(historyRef, {
        status: 'erro',
        errorMessage: error.message || 'Erro ao importar planilha.',
        updatedAt: serverTimestamp(),
        finishedAt: new Date().toISOString(),
      })
      throw error
    }
  })
}

export async function clearFiberCoverageBase({ confirmation } = {}) {
  if (confirmation !== 'LIMPAR BASE FIBRA') {
    throw new Error('Confirmação inválida para limpar a base de fibra.')
  }

  const result = await apiRequest('/api/fiber-viability/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation }),
  })

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(FIBER_ROWS_CACHE_KEY)
    window.localStorage.removeItem(FIBER_CITIES_CACHE_KEY)
  }

  return result
}

export async function distributeStoreGoals(data) {
  try {
    return await apiRequest('/api/goals/distribute-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (apiError) {
    console.warn('API indisponível para distribuir metas. Salvando distribuição direto no Firestore.', apiError)
    const users = await getUsers()
    const storeKey = normalizeText(data.storeName)
    const sellers = users.filter((user) => {
      const role = String(user.role || '')
      const storeName = user.storeName || user.store || user.loja || ''
      return !user.disabled && ['Vendedor', 'Executivo'].includes(role) && normalizeText(storeName) === storeKey
    })
    if (!sellers.length) throw new Error('Nenhum vendedor ativo encontrado nessa loja para distribuir as metas.')

    const rows = Array.isArray(data.rows) ? data.rows : []
    const existingGoals = await getGoalsFromFirestore({ month: data.month, year: data.year })
    const writes = []
    const saveGoal = (payload, matcher) => {
      const existing = existingGoals.find(matcher)
      const nextPayload = {
        ...payload,
        month: Number(data.month),
        year: Number(data.year),
        skipApiSync: true,
      }
      writes.push(existing?.id ? updateGoal(existing.id, nextPayload) : addGoal(nextPayload))
    }
    rows.forEach((row) => {
      sellers.forEach((seller, index) => {
        const sellerId = seller.uid || seller.id
        saveGoal({
          ...row,
          targetValue: getDistributedTarget(row.targetValue, sellers.length, index),
          currentValue: 0,
          userId: sellerId,
          userName: seller.name || seller.email || 'Vendedor',
          storeName: '',
          groupName: '',
          storeCity: seller.storeCity || data.storeCity || '',
          storeState: seller.storeState || data.storeState || '',
        }, (goal) => (
          goal.userId === sellerId
          && goal.type === row.type
          && !goal.storeName
          && !goal.groupName
        ))
      })
      saveGoal({
        ...row,
        currentValue: Number(row.currentValue || 0),
        userId: '',
        userName: '',
        storeName: data.storeName,
        groupName: '',
        storeCity: data.storeCity || '',
        storeState: data.storeState || '',
      }, (goal) => (
        normalizeText(goal.storeName) === storeKey
        && goal.type === row.type
        && !goal.userId
        && !goal.groupName
      ))
    })
    const goals = await Promise.all(writes)
    return { message: 'Metas salvas no Firestore.', sellersCount: sellers.length, goalsCount: goals.length, goals }
  }
}

export async function clearStoreGoalDistribution(data) {
  try {
    return await apiRequest('/api/goals/distribute-store/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (apiError) {
    console.warn('API indisponível para limpar distribuição. Limpando Firestore direto.', apiError)
    const users = await getUsers()
    const storeKey = normalizeText(data.storeName)
    const sellerIds = new Set(users
      .filter((user) => normalizeText(user.storeName || user.store || user.loja) === storeKey)
      .map((user) => user.uid || user.id)
      .filter(Boolean))
    const goals = await getGoalsFromFirestore({ month: data.month, year: data.year })
    const toDelete = goals.filter((goal) => {
      const isStoreGoal = normalizeText(goal.storeName) === storeKey && !goal.userId && !goal.groupName
      const isSellerGoal = sellerIds.has(goal.userId) && !goal.storeName && !goal.groupName
      return isStoreGoal || isSellerGoal
    })
    await Promise.all(toDelete.map((goal) => deleteDoc(doc(db, 'goals', goal.id))))
    return { message: `Distribuição limpa com sucesso. ${toDelete.length} metas removidas.`, removedCount: toDelete.length }
  }
}

function buildGoalConstraints(filter = {}) {
  const constraints = []
  if (filter.type) constraints.push(where('type', '==', filter.type))
  if (filter.userId) constraints.push(where('userId', '==', filter.userId))
  if (filter.managerId) constraints.push(where('managerId', '==', filter.managerId))
  if (filter.storeName) constraints.push(where('storeName', '==', filter.storeName))
  if (filter.groupName) constraints.push(where('groupName', '==', filter.groupName))
  if (filter.month) constraints.push(where('month', '==', Number(filter.month)))
  if (filter.year) constraints.push(where('year', '==', Number(filter.year)))
  return constraints
}

export async function getGoalsFromFirestore(filter = {}) {
  const snap = await getDocs(query(goalsCollection, ...buildGoalConstraints(filter)))
  return snap.docs.map(serializeClientDoc)
}

export function subscribeGoals(filter = {}, onChange, onError) {
  const q = query(goalsCollection, ...buildGoalConstraints(filter))
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map(serializeClientDoc))
  }, onError)
}

export async function updateGoal(id, data) {
  return trackedWrite('meta', async () => {
    const ref = doc(db, 'goals', id)
    const payload = {
      ...data,
      targetValue: Number(data.targetValue || 0),
      currentValue: Number(data.currentValue || 0),
      month: Number(data.month),
      year: Number(data.year),
      autoSync: true,
      manualRealized: false,
      updatedAt: serverTimestamp(),
    }
    delete payload.id
    delete payload.createdAt
    delete payload.actorRole
    delete payload.skipApiSync
    delete payload.manualCurrentValue
    delete payload.manualSalesBaseValue
    removeUndefinedFields(payload)

    try {
      await updateDoc(ref, payload)
      if (data.skipApiSync) {
        const snap = await getDoc(ref)
        return serializeClientDoc(snap)
      }
      try {
        return await apiRequest(`/api/goals/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      } catch (syncError) {
        enqueuePendingSync({
          label: 'meta',
          path: `/api/goals/${id}`,
          options: {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          },
        })
        console.warn('Meta atualizada no Firestore, mas a API não recalculou o realizado agora.', syncError)
      }
      const snap = await getDoc(ref)
      return serializeClientDoc(snap)
    } catch (firestoreError) {
      console.warn('Não foi possível atualizar meta direto no Firestore. Tentando API.', firestoreError)
      return apiRequest(`/api/goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    }
  })
}

export async function deleteGoal(id) {
  try {
    return await apiRequest(`/api/goals/${id}`, {
      method: 'DELETE',
    })
  } catch (apiError) {
    console.warn('API indisponível para excluir meta. Excluindo Firestore direto.', apiError)
    await deleteDoc(doc(db, 'goals', id))
    return { message: 'Meta excluída com sucesso' }
  }
}

export async function getCalendar(filter = {}) {
  const params = new URLSearchParams()
  Object.entries(filter).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, value)
  })
  const queryString = params.toString()
  return apiRequest(`/api/calendar${queryString ? `?${queryString}` : ''}`)
}

export async function getStores() {
  try {
    return await apiRequest('/api/stores')
  } catch (apiError) {
    console.warn('Não foi possível carregar lojas pela API. Tentando Firestore direto.', apiError)
    const snap = await getDocs(storesCollection)
    return snap.docs.map(serializeClientDoc)
  }
}

export async function addStore(data) {
  try {
    return await apiRequest('/api/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (apiError) {
    console.warn('API indisponível para salvar loja. Salvando Firestore direto.', apiError)
    const payload = removeUndefinedFields({ ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    const ref = await addDoc(storesCollection, payload)
    await updateDoc(ref, { id: ref.id, updatedAt: serverTimestamp() })
    const snap = await getDoc(ref)
    return serializeClientDoc(snap)
  }
}

export async function updateStore(id, data) {
  try {
    return await apiRequest(`/api/stores/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (apiError) {
    console.warn('API indisponível para atualizar loja. Atualizando Firestore direto.', apiError)
    const ref = doc(db, 'stores', id)
    const payload = removeUndefinedFields({ ...data, updatedAt: serverTimestamp() })
    await updateDoc(ref, payload)
    const snap = await getDoc(ref)
    return serializeClientDoc(snap)
  }
}

export async function deleteStore(id, data = {}) {
  try {
    return await apiRequest(`/api/stores/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (apiError) {
    console.warn('API indisponível para excluir loja. Excluindo Firestore direto.', apiError)
    await deleteDoc(doc(db, 'stores', id))
    return { message: 'Loja excluída com sucesso' }
  }
}

export async function getCommissionRules() {
  try {
    return await apiRequest('/api/commission-rules')
  } catch (apiError) {
    console.warn('Não foi possível carregar regras de comissão pela API. Tentando Firestore direto.', apiError)
    const snap = await getDocs(commissionRulesCollection)
    return snap.docs.map(serializeClientDoc)
  }
}

export async function addCommissionRule(data) {
  try {
    return await apiRequest('/api/commission-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (apiError) {
    console.warn('API indisponível para salvar regra. Salvando Firestore direto.', apiError)
    const payload = removeUndefinedFields({ ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    const ref = await addDoc(commissionRulesCollection, payload)
    await updateDoc(ref, { id: ref.id, updatedAt: serverTimestamp() })
    const snap = await getDoc(ref)
    return serializeClientDoc(snap)
  }
}

export async function updateCommissionRule(id, data) {
  try {
    return await apiRequest(`/api/commission-rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (apiError) {
    console.warn('API indisponível para atualizar regra. Atualizando Firestore direto.', apiError)
    const ref = doc(db, 'commissionRules', id)
    const payload = removeUndefinedFields({ ...data, updatedAt: serverTimestamp() })
    await updateDoc(ref, payload)
    const snap = await getDoc(ref)
    return serializeClientDoc(snap)
  }
}

export async function deleteCommissionRule(id, data = {}) {
  try {
    return await apiRequest(`/api/commission-rules/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (apiError) {
    console.warn('API indisponível para excluir regra. Excluindo Firestore direto.', apiError)
    await deleteDoc(doc(db, 'commissionRules', id))
    return { message: 'Regra excluída com sucesso' }
  }
}

export async function getUsers() {
  try {
    return await apiRequest('/api/users')
  } catch (apiError) {
    console.warn('Não foi possível carregar usuários pela API. Tentando Firestore direto.', apiError)
    const snap = await getDocs(usersCollection)
    return snap.docs.map(serializeClientDoc)
  }
}

export async function disableUserAccess(uid, actorRole = '') {
  try {
    const result = await apiRequest(`/api/users/${uid}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorRole }),
    })
    return result || { message: 'Usuário removido/inativado com sucesso' }
  } catch (apiError) {
    console.warn('API indisponível para inativar usuário. Marcando perfil como inativo no Firestore.', apiError)
    const ref = doc(db, 'users', uid)
    await updateDoc(ref, {
      disabled: true,
      accessRemoved: true,
      updatedAt: serverTimestamp(),
    })
    return { message: 'Usuário removido/inativado com sucesso' }
  }
}

export async function enableUserAccess(uid, actorRole = '') {
  try {
    const result = await apiRequest(`/api/users/${uid}/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorRole }),
    })
    return result || { message: 'Usuário reativado com sucesso' }
  } catch (apiError) {
    console.warn('API indisponível para reativar usuário. Reativando perfil no Firestore.', apiError)
    const ref = doc(db, 'users', uid)
    await updateDoc(ref, {
      disabled: false,
      accessRemoved: false,
      updatedAt: serverTimestamp(),
    })
    return { message: 'Usuário reativado com sucesso' }
  }
}

export async function getUserProfile(uid) {
  try {
    return await apiRequest(`/api/users/${uid}/profile`)
  } catch (apiError) {
    console.warn('Não foi possível carregar perfil pela API. Tentando Firestore direto.', apiError)
  }

  const ref = doc(db, 'users', uid)
  try {
    const snap = await getDoc(ref)
    if (snap.exists()) return { id: snap.id, ...snap.data() }
  } catch (error) {
    console.warn('Não foi possível carregar perfil direto do Firestore.', error)
  }

  throw new Error('Não foi possível carregar o perfil do usuário.')
}

export async function createUserProfile(uid, data) {
  const ref = doc(db, 'users', uid)
  return setDoc(ref, { uid, ...data })
}

export async function updateUserProfile(docId, data) {
  const ref = doc(db, 'users', docId)
  return updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function disableUserProfile(docId) {
  const ref = doc(db, 'users', docId)
  return updateDoc(ref, { disabled: true })
}

// Backwards compatible helpers for existing pages
export const salesCollection = vendasCollection
export const getSales = getVendas
export const addSale = addVenda
export const updateSale = updateVenda
export const deleteSale = deleteVenda

export { db }
