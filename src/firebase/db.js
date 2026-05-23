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
  serverTimestamp,
  Timestamp,
  onSnapshot,
  enableIndexedDbPersistence,
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { app } from './app'
import { auth } from './auth'

const db = getFirestore(app)

const vendasCollection = collection(db, 'vendas')
const portabilidadesCollection = collection(db, 'portabilidades')
const goalsCollection = collection(db, 'goals')
const usersCollection = collection(db, 'users')
const storesCollection = collection(db, 'stores')
const commissionRulesCollection = collection(db, 'commissionRules')
const fiberCoverageCollections = [
  'fiberCoverage',
  'fiberViability',
  'fiberCoverageCities',
  'fiberCities',
  'cidadesFibra',
  'viabilidadeFibra',
]

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

  let lastError = null
  for (const apiUrl of apiUrls) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(`${apiUrl}${path}`, {
        ...options,
        headers,
        signal: options.signal || controller.signal,
      })
      const data = await response.json().catch(() => ({}))
      clearTimeout(timeout)

      if (response.ok) return data

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
  }

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
    || normalizeText(data.portability) === 'sim'
    || normalizeText(data.portabilidade) === 'sim'
    || Boolean(String(data.provisionalNumber || '').trim())
}

async function buildSalePayload(data, includeTimestamp = true) {
  const amount = Number(data.amount || 0)
  const planValue = data.saleType === 'Upgrade'
    ? 0
    : Number(data.planValue !== undefined && data.planValue !== '' ? data.planValue : amount)
  const commissionRate = data.saleType === 'Upgrade' ? 0 : 0.05
  const portabilityCommission = hasPortability(data) ? 2 : 0
  const payload = {
    ...data,
    amount,
    commissionRate,
    commission: Number(((planValue * commissionRate) + portabilityCommission).toFixed(2)),
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
  try {
    return await apiRequest('/api/vendas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (apiError) {
    console.warn('API indisponível para salvar venda. Salvando direto no Firestore.', apiError)
    const payload = removeUndefinedFields(await buildSalePayload(data))
    const ref = await addDoc(vendasCollection, payload)
    await updateDoc(ref, { id: ref.id, updatedAt: serverTimestamp() })
    const snap = await getDoc(ref)
    return serializeClientDoc(snap)
  }
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
  try {
    return await apiRequest(`/api/vendas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (apiError) {
    console.warn('API indisponível para atualizar venda. Atualizando Firestore direto.', apiError)
    const ref = doc(db, 'vendas', id)
    const payload = removeUndefinedFields(await buildSalePayload(data, false))
    await updateDoc(ref, payload)
    const snap = await getDoc(ref)
    return serializeClientDoc(snap)
  }
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

function getFiberCityFromDoc(data = {}) {
  return data.city || data.cidade || data.municipio || data.MUNICIPIO || ''
}

function getFiberUfFromDoc(data = {}) {
  return data.uf || data.UF || data.state || data.estado || ''
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
    complement: data.complement || data.complemento || data.COMPLEMENTO || '',
    neighborhood: data.neighborhood || data.bairro || data.BAIRRO || '',
    households: Number(data.households ?? data.QTD_HH ?? 0) || 0,
    latitude: data.latitude || data.LATITUDE || '',
    longitude: data.longitude || data.LONGITUDE || '',
    viabilityCode: data.viabilityCode || data.viabilidade || data.VIABILIDADE || '',
    viability: data.viability || data.motivo || data.MOTIVO || '',
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
  for (const collectionName of fiberCoverageCollections) {
    try {
      const snap = await getDocs(collection(db, collectionName))
      if (!snap.empty) {
        rows.push(...snap.docs.map(serializeFiberRow))
      }
    } catch (error) {
      console.warn(`Não foi possível ler ${collectionName} no Firestore.`, error)
    }
  }
  return rows
}

export async function getFiberViabilityCities() {
  try {
    const data = await apiRequest('/api/fiber-viability/cities')
    if (Array.isArray(data) && data.length) return data
  } catch (apiError) {
    console.warn('Não foi possível carregar cidades de fibra pela API. Tentando Firestore.', apiError)
  }

  const coverageRows = await getFiberRowsFromFirestore()
  const coverageCities = buildFiberCities(coverageRows)
  if (coverageCities.length) return coverageCities

  const stores = await getStores()
  return buildFiberCities(stores.map((store) => ({
    city: store.city || store.storeCity || store.cidade,
    uf: store.state || store.storeState || store.uf || store.estado,
  })))
}

export async function searchFiberViability(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (String(value || '').trim()) params.set(key, String(value).trim())
  })
  params.set('limit', '150')

  try {
    return await apiRequest(`/api/fiber-viability?${params.toString()}`)
  } catch (apiError) {
    console.warn('Não foi possível consultar viabilidade pela API. Tentando Firestore.', apiError)
  }

  const rows = (await getFiberRowsFromFirestore()).filter((row) => fiberRowMatches(row, filters))
  return {
    rows: rows.slice(0, 150),
    totalMatches: rows.length,
    scannedRows: rows.length,
    limit: 150,
    elapsedMs: 0,
  }
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
  return updateDoc(ref, data)
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
