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

if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((error) => {
    if (!['failed-precondition', 'unimplemented'].includes(error?.code)) {
      console.warn('Não foi possível ativar persistência local do Firestore.', error)
    }
  })
}

function getDefaultApiUrl() {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:4100`
  }

  return 'http://localhost:4100'
}

const API_URL = (import.meta.env.VITE_API_URL || getDefaultApiUrl()).replace(/\/$/, '')

function getApiUrls() {
  const urls = []
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const { protocol, hostname } = window.location
    urls.push(`${protocol}//${hostname}:4100`)
    urls.push(`${protocol}//${hostname}:4000`)
  } else {
    urls.push('http://localhost:4100')
    urls.push('http://localhost:4000')
  }
  urls.unshift(API_URL)

  return [...new Set(urls.map((url) => url.replace(/\/$/, '')))]
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
  const headers = new Headers(options.headers || {})
  const user = auth.currentUser || await waitForAuthUser()
  const token = user ? await user.getIdToken() : ''

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let lastError = null
  for (const apiUrl of getApiUrls()) {
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

async function buildSalePayload(data, includeTimestamp = true) {
  const amount = Number(data.amount || 0)
  const sellerEmail = data.seller || ''
  const user = await getUserByEmail(sellerEmail)
  const commissionRate = getCommissionRate(user?.role)
  const payload = {
    ...data,
    amount,
    commissionRate,
    commission: Number((amount * commissionRate).toFixed(2)),
  }
  if (includeTimestamp) {
    payload.createdAt = serverTimestamp()
  } else {
    payload.updatedAt = serverTimestamp()
  }
  return payload
}

export async function addVenda(data) {
  return apiRequest('/api/vendas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function getVendas(filter = {}) {
  const params = new URLSearchParams()
  Object.entries(filter).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, value)
  })
  const queryString = params.toString()
  return apiRequest(`/api/vendas${queryString ? `?${queryString}` : ''}`)
}

export async function updateVenda(id, data) {
  return apiRequest(`/api/vendas/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteVenda(id) {
  return apiRequest(`/api/vendas/${id}`, {
    method: 'DELETE',
  })
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
  return apiRequest(`/api/goal-rankings${queryString ? `?${queryString}` : ''}`)
}

export async function distributeStoreGoals(data) {
  return apiRequest('/api/goals/distribute-store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function clearStoreGoalDistribution(data) {
  return apiRequest('/api/goals/distribute-store/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
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
  return apiRequest(`/api/goals/${id}`, {
    method: 'DELETE',
  })
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
  return apiRequest('/api/stores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateStore(id, data) {
  return apiRequest(`/api/stores/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteStore(id, data = {}) {
  return apiRequest(`/api/stores/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
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
  return apiRequest('/api/commission-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateCommissionRule(id, data) {
  return apiRequest(`/api/commission-rules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteCommissionRule(id, data = {}) {
  return apiRequest(`/api/commission-rules/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
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
