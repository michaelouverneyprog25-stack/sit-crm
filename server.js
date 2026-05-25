const express = require('express')
const cors = require('cors')
const admin = require('firebase-admin')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const app = express()
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    callback(new Error('Origem não permitida pelo CORS.'))
  },
}))
app.use(express.json())

try {
  const serviceAccountPath = path.resolve(__dirname, 'serviceAccountKey.json')
  const hasServiceAccount = fs.existsSync(serviceAccountPath)
  const serviceAccountFromEnv = process.env.SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.SERVICE_ACCOUNT_JSON)
    : null

  admin.initializeApp({
    credential: serviceAccountFromEnv
      ? admin.credential.cert(serviceAccountFromEnv)
      : hasServiceAccount
      ? admin.credential.cert(require(serviceAccountPath))
      : admin.credential.applicationDefault(),
  })
} catch (err) {
  console.error('Firebase Admin initialization error', err)
  process.exit(1)
}

const db = admin.firestore()

const USER_ROLES = ['Administrador', 'Gestor Master', 'Gerente', 'Vendedor', 'Caixa']
const MANAGER_ASSIGNABLE_USER_ROLES = ['Vendedor', 'Caixa']
const USER_MANAGEMENT_ROLES = ['Administrador', 'Gestor Master', 'Gerente']
const SALES_FULL_ACCESS_ROLES = ['Administrador', 'Gestor Master']
const AUTH_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000
const ID_TOKEN_CACHE_TTL_MS = 2 * 60 * 1000
const AUTH_USERS_CACHE_TTL_MS = 5 * 60 * 1000
const authProfileCache = new Map()
const idTokenCache = new Map()
let authUsersCache = { users: null, expiresAt: 0 }
const DATA_DIR = path.resolve(__dirname, 'data')
const STORES_CACHE_FILE = path.join(DATA_DIR, 'stores-cache.json')
const USERS_CACHE_FILE = path.join(DATA_DIR, 'users-cache.json')
const SALES_CACHE_FILE = path.join(DATA_DIR, 'sales-cache.json')
const GOALS_CACHE_FILE = path.join(DATA_DIR, 'goals-cache.json')
const COMMISSION_RULES_CACHE_FILE = path.join(DATA_DIR, 'commission-rules-cache.json')
const FIBER_COVERAGE_FILE = path.join(DATA_DIR, 'fiber-coverage.csv')
const FIBER_REQUIRED_HEADERS = ['UF', 'MUNICIPIO', 'CEP', 'LOGRADOURO', 'BAIRRO', 'VIABILIDADE']
const FIBER_COVERAGE_COLLECTIONS = [
  'viabilidade_fibra',
  'fiberCoverage',
  'fiberViability',
  'fiberCoverageCities',
  'fiberCities',
  'cidadesFibra',
  'viabilidadeFibra',
]
const FIBER_CANONICAL_HEADERS = [
  'DT_REF',
  'UF',
  'MUNICIPIO',
  'CEP',
  'LOGRADOURO',
  'NUM_LOGRADOURO',
  'COMPLEMENTO',
  'COMPLEMENTO2',
  'COMPLEMENTO3',
  'COMPLEMENTO4',
  'COMPLEMENTO5',
  'BAIRRO',
  'QTD_HH',
  'LATITUDE',
  'LONGITUDE',
  'ID_LOTE',
  'VIABILIDADE',
  'MOTIVO',
  'TIPO_LOTE',
  'QTD_INFRACO',
  'INFRACO_PRINCIPAL',
  'INFRACO_SECUNDÁRIA',
  'INFRACO_TERCIÁRIA',
  'OLT',
  'SEGMENTACAO_OLT',
  'ID_CAPACITY',
  'ORD_INFRACO',
  'BLOQ_CAPACITY',
  'MOTIVO_CAPACITY',
  'AJUSTE_CAPACITY',
]
const FIRESTORE_QUOTA_PAUSE_MS = 5 * 60 * 1000
let firestoreQuotaPausedUntil = 0
let fiberCitiesCache = { mtimeMs: 0, cities: [] }
const ECONOMIC_GROUP_NAME = 'INTERCELL'
const GOAL_TYPES = [
  'Gross',
  'Pós',
  'Controle',
  'Upgrade',
  'Fibra',
  'Receita Total',
  'Aparelhos',
  'Acessórios',
  'PayJoy',
  'Seguros',
  'Portabilidade',
  'DACC',
]
const SALE_SYNCED_GOAL_TYPES = new Set(GOAL_TYPES)
const COMMISSION_SUBCATEGORIES = ['Receita', 'Upgrade', 'Aparelhos', 'Acessórios', 'Portabilidade', 'Seguros']
const UPGRADE_COMMISSION_CATEGORIES = ['Controle', 'Premium', 'Black', 'Família']
const BASIC_CONTROL_PREVIOUS_PLANS = [
  'TIM Pré Boleto A',
  'Controle Ligações Ilimitadas',
  'Controle A Plus',
  'Controle Light Plus',
]
const SMART_CONTROL_PREVIOUS_PLANS = [
  'Controle Smart',
  'Controle B Plus',
  'Controle',
]
const PLUS_SOCIAL_CONTROL_PLANS = [
  'Controle Plus',
  'Controle Plus / Redes Sociais',
  'Redes Sociais',
  'Redes Sociais / Plus',
  'CONTROLE PLUS 2.0',
]
const PREMIUM_CONTROL_PLANS = [
  'Controle Premium',
  'Plano Premium',
  'Premium',
  'CONTROLE PREMIUM 2.0',
]
const BLACK_LIGHT_PREVIOUS_PLANS = [
  'Black A Light',
  'Black B Light',
  'Black C Light',
  'Black A Ligth',
  'Black B Ligth',
  'Black C Ligth',
]
const BLACK_A_PREVIOUS_PLANS = ['Black A']
const BLACK_B_PREVIOUS_PLANS = ['Black B']
const BLACK_C_PREVIOUS_PLANS = ['Black C']
const BLACK_TARGET_PLANS = [
  'Black',
  'Black Plus',
  'Black Premium',
  'BLACK',
  'BLACK PLUS',
  'BLACK PREMIUM',
]
const FAMILY_TARGET_PLANS = [
  'Família',
  'Família Plus',
  'Família Premium',
  'Família VIP',
  'Black Família',
  'Black Família Plus',
  'Black Família Premium',
  'Black Família VIP',
  'BLACK FAMILIA',
  'BLACK FAMILIA PLUS',
  'BLACK FAMILIA PREMIUM',
  'BLACK FAMILIA VIP',
]
const FAMILY_PREVIOUS_PLANS = [
  'Família',
  'Black Família',
  'BLACK FAMILIA',
]
const FAMILY_PLUS_PREVIOUS_PLANS = [
  'Família Plus',
  'Black Família Plus',
  'BLACK FAMILIA PLUS',
]
const FAMILY_PREMIUM_PREVIOUS_PLANS = [
  'Família Premium',
  'Black Família Premium',
  'BLACK FAMILIA PREMIUM',
]

function buildUpgradeRule(planoAnterior, planoNovo, categoria, valorComissao, tipoUpgrade = categoria) {
  return {
    planoAnterior,
    planoNovo,
    tipoUpgrade,
    categoria,
    valorComissao,
    ativo: true,
  }
}

function buildUpgradeRules(previousPlans, newPlans, categoria, valorComissao, tipoUpgrade = categoria) {
  return previousPlans.flatMap((planoAnterior) => (
    newPlans.map((planoNovo) => buildUpgradeRule(planoAnterior, planoNovo, categoria, valorComissao, tipoUpgrade))
  ))
}

const DEFAULT_UPGRADE_COMMISSION_RULES = [
  ...buildUpgradeRules(BASIC_CONTROL_PREVIOUS_PLANS, ['Controle'], 'Controle', 4),
  ...buildUpgradeRules(BASIC_CONTROL_PREVIOUS_PLANS, PLUS_SOCIAL_CONTROL_PLANS, 'Controle', 5),
  ...buildUpgradeRules(BASIC_CONTROL_PREVIOUS_PLANS, PREMIUM_CONTROL_PLANS, 'Premium', 7),
  ...buildUpgradeRules(SMART_CONTROL_PREVIOUS_PLANS, PLUS_SOCIAL_CONTROL_PLANS, 'Controle', 5),
  ...buildUpgradeRules(SMART_CONTROL_PREVIOUS_PLANS, PREMIUM_CONTROL_PLANS, 'Premium', 7),
  ...buildUpgradeRules(PLUS_SOCIAL_CONTROL_PLANS, PREMIUM_CONTROL_PLANS, 'Premium', 7),
  buildUpgradeRule('Controle *', 'Black Família*', 'Família', 15, 'Controle para Família'),
  buildUpgradeRule('Controle *', 'BLACK FAMILIA*', 'Família', 15, 'Controle para Família'),
  buildUpgradeRule('Controle *', 'Black*', 'Black', 10, 'Controle para Black'),
  ...buildUpgradeRules(BLACK_LIGHT_PREVIOUS_PLANS, BLACK_TARGET_PLANS, 'Black', 10),
  ...buildUpgradeRules(BLACK_LIGHT_PREVIOUS_PLANS, FAMILY_TARGET_PLANS, 'Família', 15),
  ...buildUpgradeRules(BLACK_A_PREVIOUS_PLANS, ['Black Plus', 'Black Premium', 'BLACK PLUS', 'BLACK PREMIUM'], 'Black', 10),
  ...buildUpgradeRules(BLACK_A_PREVIOUS_PLANS, FAMILY_TARGET_PLANS, 'Família', 15),
  ...buildUpgradeRules(BLACK_B_PREVIOUS_PLANS, ['Black Premium', 'BLACK PREMIUM'], 'Black', 10),
  ...buildUpgradeRules(BLACK_B_PREVIOUS_PLANS, FAMILY_TARGET_PLANS, 'Família', 15),
  ...buildUpgradeRules(BLACK_C_PREVIOUS_PLANS, FAMILY_TARGET_PLANS, 'Família', 15),
  ...buildUpgradeRules(FAMILY_PREVIOUS_PLANS, ['Família Plus', 'Família Premium', 'Família VIP', 'Black Família Plus', 'Black Família Premium', 'Black Família VIP', 'BLACK FAMILIA PLUS', 'BLACK FAMILIA PREMIUM', 'BLACK FAMILIA VIP'], 'Família', 15),
  ...buildUpgradeRules(FAMILY_PLUS_PREVIOUS_PLANS, ['Família Premium', 'Família VIP', 'Black Família Premium', 'Black Família VIP', 'BLACK FAMILIA PREMIUM', 'BLACK FAMILIA VIP'], 'Família', 15),
  ...buildUpgradeRules(FAMILY_PREMIUM_PREVIOUS_PLANS, ['Família VIP', 'Black Família VIP', 'BLACK FAMILIA VIP'], 'Família', 15),
]
const DEFAULT_STANDARD_COMMISSION_RULES = [
  {
    subcategoria: 'Receita',
    categoria: 'Receita',
    tipoUpgrade: 'Receita',
    planoAnterior: '*',
    planoNovo: '*',
    tipoCalculo: 'percentual_meta',
    percentualComissao: 5,
    percentualComissaoMetaBatida: 10,
    valorComissao: 0,
    ativo: true,
  },
  {
    subcategoria: 'Aparelhos',
    categoria: 'Aparelhos',
    tipoUpgrade: 'Aparelhos',
    planoAnterior: '*',
    planoNovo: '*',
    tipoCalculo: 'percentual',
    percentualComissao: 2,
    percentualLoja: 1.5,
    percentualLojaMetaBatida: 1.5,
    valorComissao: 0,
    ativo: true,
  },
  {
    subcategoria: 'Acessórios',
    categoria: 'Acessórios',
    tipoUpgrade: 'Acessórios',
    planoAnterior: '*',
    planoNovo: '*',
    tipoCalculo: 'percentual_meta',
    percentualComissao: 5,
    percentualComissaoMetaBatida: 10,
    valorComissao: 0,
    ativo: true,
  },
  {
    subcategoria: 'Portabilidade',
    categoria: 'Portabilidade',
    tipoUpgrade: 'Portabilidade',
    planoAnterior: '*',
    planoNovo: '*',
    tipoCalculo: 'fixo',
    valorComissao: 2,
    ativo: true,
  },
  {
    subcategoria: 'Seguros',
    categoria: 'Seguros',
    tipoUpgrade: 'Seguros',
    planoAnterior: '*',
    planoNovo: '*',
    tipoCalculo: 'percentual_meta',
    valorComissao: 0,
    percentualComissao: 5,
    percentualComissaoMetaBatida: 10,
    ativo: true,
  },
]
const DEFAULT_COMMISSION_RULES = [
  ...DEFAULT_STANDARD_COMMISSION_RULES,
  ...DEFAULT_UPGRADE_COMMISSION_RULES.map((rule) => ({ ...rule, subcategoria: 'Upgrade' })),
]
const NATIONAL_FIXED_HOLIDAYS = [
  { date: '01-01', name: 'Confraternização Universal' },
  { date: '04-21', name: 'Tiradentes' },
  { date: '05-01', name: 'Dia do Trabalho' },
  { date: '09-07', name: 'Independência do Brasil' },
  { date: '10-12', name: 'Nossa Senhora Aparecida' },
  { date: '11-02', name: 'Finados' },
  { date: '11-15', name: 'Proclamação da República' },
  { date: '11-20', name: 'Consciência Negra' },
  { date: '12-25', name: 'Natal' },
]
const NATIONAL_MOVABLE_HOLIDAYS = [
  { kind: 'easterOffset', offset: -2, name: 'Sexta-feira Santa' },
]
const STATE_HOLIDAYS = {
  RJ: [
    { kind: 'easterOffset', offset: -47, name: 'Terça-feira de Carnaval' },
    { date: '04-23', name: 'São Jorge' },
  ],
  SP: [
    { date: '07-09', name: 'Revolução Constitucionalista' },
  ],
}
const MUNICIPAL_HOLIDAYS = {
  'nova friburgo|RJ': [
    { kind: 'easterOffset', offset: -47, name: 'Terça-feira de Carnaval' },
    { date: '05-16', name: 'Aniversário de Nova Friburgo' },
    { kind: 'easterOffset', offset: 60, name: 'Corpus Christi' },
    { kind: 'sundayBeforeOrOn', month: 6, day: 24, name: 'São João Batista' },
  ],
  'rio de janeiro|RJ': [
    { date: '01-20', name: 'São Sebastião' },
    { date: '04-23', name: 'São Jorge' },
  ],
  'sao paulo|SP': [
    { date: '01-25', name: 'Aniversário de São Paulo' },
  ],
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function toHolidayKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function removeUndefinedFields(payload) {
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) delete payload[key]
  })
  return payload
}

function isQuotaError(error) {
  return error?.code === 8
    || error?.details === 'Quota exceeded.'
    || String(error?.message || '').toLowerCase().includes('quota exceeded')
}

function isFirestoreQuotaPaused() {
  return Date.now() < firestoreQuotaPausedUntil
}

function rememberQuotaError(error) {
  if (!isQuotaError(error)) return false
  firestoreQuotaPausedUntil = Date.now() + FIRESTORE_QUOTA_PAUSE_MS
  return true
}

function readJsonArray(filePath) {
  try {
    if (!fs.existsSync(filePath)) return []
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch (error) {
    console.warn(`Não foi possível ler cache local ${filePath}:`, error.message || error)
    return []
  }
}

function writeJsonArray(filePath, items) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2))
  } catch (error) {
    console.warn(`Não foi possível salvar cache local ${filePath}:`, error.message || error)
  }
}

function getMergeKey(item) {
  const name = normalizeText(item?.name || item?.storeName)
  if (name) return `name:${name}`
  const id = item?.id || item?.uid
  if (id) return `id:${id}`
  const email = normalizeText(item?.email)
  if (email) return `email:${email}`
  return ''
}

function mergeByIdAndName(primaryItems, fallbackItems) {
  const byKey = new Map()
  ;[...fallbackItems, ...primaryItems].forEach((item) => {
    if (!item) return
    const key = getMergeKey(item)
    if (!key) return
    byKey.set(key, item)
  })
  return [...byKey.values()]
}

function getLocalStores({ includeDeleted = false } = {}) {
  const stores = readJsonArray(STORES_CACHE_FILE)
  return includeDeleted ? stores : stores.filter((store) => !store.pendingDelete)
}

function getStoresFromLocalUsers() {
  const storesByName = new Map()
  getLocalUserProfilesMap().forEach((profile) => {
    const name = String(profile.storeName || profile.store || profile.loja || '').trim()
    if (!name) return

    const city = String(profile.storeCity || profile.city || profile.cidade || '').trim()
    const state = String(profile.storeState || profile.state || profile.estado || '').trim().toUpperCase()
    const normalizedName = normalizeText(name)
    if (!storesByName.has(normalizedName)) {
      storesByName.set(normalizedName, {
        id: `profile-${normalizedName.replace(/[^a-z0-9]+/g, '-')}`,
        name,
        city,
        state,
        normalizedName,
        createdAt: profile.createdAt || '',
        updatedAt: profile.updatedAt || '',
        pendingSync: false,
        pendingDelete: false,
      })
    }
  })
  return [...storesByName.values()]
}

function getCombinedLocalStores({ includeDeleted = false } = {}) {
  return sortStores(mergeByIdAndName(getLocalStores({ includeDeleted }), getStoresFromLocalUsers()))
}

function sortStores(stores) {
  return [...stores].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
}

function saveLocalStores(stores) {
  writeJsonArray(STORES_CACHE_FILE, sortStores(stores))
}

function buildLocalStore(data, id = '') {
  const name = String(data.name || '').trim()
  const city = String(data.city || '').trim()
  const state = String(data.state || '').trim().toUpperCase()
  const now = new Date().toISOString()
  return {
    id: id || `local-${Date.now()}`,
    name,
    city,
    state,
    normalizedName: normalizeText(name),
    createdAt: data.createdAt || now,
    updatedAt: now,
    pendingSync: data.pendingSync === true,
    pendingDelete: data.pendingDelete === true,
  }
}

function dedupeStoreEntriesByName(entries = []) {
  const byName = new Map()
  const duplicateEntries = []
  entries.forEach((entry) => {
    const store = entry.data || entry
    const key = normalizeText(store.name || store.storeName)
    if (!key) return
    const current = byName.get(key)
    const picked = pickCanonicalGoal(current, entry)
    if (current && picked === entry) duplicateEntries.push(current)
    if (current && picked !== entry) duplicateEntries.push(entry)
    byName.set(key, picked)
  })
  return {
    canonicalEntries: [...byName.values()],
    duplicateEntries,
  }
}

function upsertLocalStore(store) {
  const stores = getLocalStores({ includeDeleted: true })
  const nextStore = buildLocalStore(store, store.id)
  const nextStores = mergeByIdAndName([nextStore], stores.filter((item) => item.id !== nextStore.id))
  saveLocalStores(nextStores)
  return nextStore
}

function removeLocalStore(id) {
  const stores = getLocalStores({ includeDeleted: true })
  saveLocalStores(stores.filter((store) => store.id !== id))
}

function getLocalUserProfilesMap() {
  const profiles = readJsonArray(USERS_CACHE_FILE)
  const byUid = new Map()
  profiles.forEach((profile) => {
    if (!profile?.uid && !profile?.id) return
    byUid.set(profile.uid || profile.id, profile)
  })
  return byUid
}

function hasPendingLocalStoreWrites() {
  return getLocalStores({ includeDeleted: true }).some((store) => store.pendingSync || store.pendingDelete)
}

function saveLocalUserProfiles(profiles) {
  writeJsonArray(USERS_CACHE_FILE, [...profiles.values()])
}

function upsertLocalUserProfile(profile) {
  if (!profile?.uid && !profile?.id) return
  const profiles = getLocalUserProfilesMap()
  const uid = profile.uid || profile.id
  profiles.set(uid, {
    ...(profiles.get(uid) || {}),
    ...profile,
    uid,
    id: uid,
    updatedAt: new Date().toISOString(),
  })
  saveLocalUserProfiles(profiles)
}

function buildCachedUserProfile(profile = {}) {
  const uid = profile.uid || profile.id || ''
  return {
    id: uid,
    uid,
    name: profile.name || 'Sem nome',
    email: profile.email || '',
    role: normalizeRole(profile.role || 'Vendedor'),
    storeName: profile.storeName || profile.store || profile.loja || '',
    storeCity: profile.storeCity || profile.city || profile.cidade || '',
    storeState: profile.storeState || profile.state || profile.estado || '',
    registration: profile.registration || profile.matricula || profile.employeeId || '',
    matricula: profile.registration || profile.matricula || profile.employeeId || '',
    photoUrl: profile.photoUrl || '',
    disabled: profile.disabled === true,
    createdAt: profile.createdAt || '',
    updatedAt: profile.updatedAt || '',
  }
}

function getLocalUsersList() {
  return [...getLocalUserProfilesMap().values()]
    .map(buildCachedUserProfile)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
}

function getLocalSales({ includeDeleted = false } = {}) {
  const sales = readJsonArray(SALES_CACHE_FILE)
  return includeDeleted ? sales : sales.filter((sale) => !sale.pendingDelete)
}

function sortSales(sales) {
  return [...sales].sort((a, b) => {
    const dateA = new Date(a.createdAt || `${a.saleDate || ''}T12:00:00`).getTime() || 0
    const dateB = new Date(b.createdAt || `${b.saleDate || ''}T12:00:00`).getTime() || 0
    return dateB - dateA
  })
}

function saveLocalSales(sales) {
  writeJsonArray(SALES_CACHE_FILE, sortSales(sales))
}

function normalizeSaleTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  const hour = Math.min(23, Math.max(0, Number(match[1]) || 0))
  const minute = Math.min(59, Math.max(0, Number(match[2]) || 0))
  return `${pad2(hour)}:${pad2(minute)}`
}

function getSaleDateValue(saleDate, saleTime = '') {
  if (!saleDate) return null
  const time = normalizeSaleTime(saleTime) || '12:00'
  const date = new Date(`${saleDate}T${time}:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizePlanName(value) {
  return normalizeText(value)
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
}

function commissionRuleKey(rule = {}) {
  return `${normalizeText(rule.subcategoria || 'Upgrade')}|${normalizeText(rule.categoria)}|${normalizePlanName(rule.planoAnterior)}|${normalizePlanName(rule.planoNovo)}`
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

function normalizeCommissionCategory(value) {
  const category = String(value || '').trim()
  const found = UPGRADE_COMMISSION_CATEGORIES.find((item) => normalizeText(item) === normalizeText(category))
  const subcategory = COMMISSION_SUBCATEGORIES.find((item) => normalizeText(item) === normalizeText(category))
  return found || subcategory || 'Controle'
}

function buildCommissionRule(data = {}, id = '') {
  const now = new Date().toISOString()
  const planoAnterior = String(data.planoAnterior || '').trim()
  const planoNovo = String(data.planoNovo || '').trim()
  const subcategoria = COMMISSION_SUBCATEGORIES.find((item) => normalizeText(item) === normalizeText(data.subcategoria))
    || (COMMISSION_SUBCATEGORIES.includes(data.categoria) ? data.categoria : '')
    || 'Upgrade'
  const categoria = subcategoria === 'Upgrade'
    ? normalizeCommissionCategory(data.categoria || data.tipoUpgrade)
    : subcategoria
  return {
    id: id || data.id || `local-rule-${Date.now()}`,
    subcategoria,
    planoAnterior,
    planoNovo,
    tipoUpgrade: String(data.tipoUpgrade || categoria).trim() || categoria,
    categoria,
    tipoCalculo: data.tipoCalculo || (subcategoria === 'Upgrade' || data.valorComissao ? 'fixo' : 'percentual'),
    valorComissao: Number(data.valorComissao || 0),
    percentualComissao: Number(data.percentualComissao || 0),
    percentualComissaoMetaBatida: Number(data.percentualComissaoMetaBatida || data.percentualComissao || 0),
    percentualLoja: Number(data.percentualLoja || 0),
    percentualLojaMetaBatida: Number(data.percentualLojaMetaBatida || data.percentualLoja || 0),
    ativo: data.ativo !== false,
    normalizedPreviousPlan: normalizePlanName(planoAnterior),
    normalizedNewPlan: normalizePlanName(planoNovo),
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
    pendingSync: data.pendingSync === true,
    pendingDelete: data.pendingDelete === true,
  }
}

function getLocalCommissionRules({ includeDeleted = false } = {}) {
  const rules = readJsonArray(COMMISSION_RULES_CACHE_FILE).map((rule) => buildCommissionRule(rule, rule.id))
  return includeDeleted ? rules : rules.filter((rule) => !rule.pendingDelete)
}

function sortCommissionRules(rules) {
  return [...rules].sort((a, b) => (
    String(a.categoria || '').localeCompare(String(b.categoria || ''), 'pt-BR')
    || String(a.planoAnterior || '').localeCompare(String(b.planoAnterior || ''), 'pt-BR')
    || String(a.planoNovo || '').localeCompare(String(b.planoNovo || ''), 'pt-BR')
  ))
}

function saveLocalCommissionRules(rules) {
  writeJsonArray(COMMISSION_RULES_CACHE_FILE, sortCommissionRules(rules))
}

function upsertLocalCommissionRule(rule) {
  const rules = getLocalCommissionRules({ includeDeleted: true })
  const nextRule = buildCommissionRule(rule, rule.id)
  saveLocalCommissionRules([
    ...rules.filter((item) => item.id !== nextRule.id),
    nextRule,
  ])
  return nextRule
}

function removeLocalCommissionRule(id) {
  const rules = getLocalCommissionRules({ includeDeleted: true })
  saveLocalCommissionRules(rules.filter((rule) => rule.id !== id))
}

function seedLocalCommissionRulesIfEmpty() {
  const currentRules = getLocalCommissionRules({ includeDeleted: true })
  const byKey = new Map(currentRules.map((rule) => [commissionRuleKey(rule), rule]))
  DEFAULT_COMMISSION_RULES.forEach((rule, index) => {
    const key = commissionRuleKey(rule)
    const existingRule = byKey.get(key)
    byKey.set(key, buildCommissionRule({
      ...existingRule,
      ...rule,
      id: existingRule?.id || `default-upgrade-rule-${index + 1}`,
      ativo: rule.ativo,
      pendingSync: existingRule?.pendingSync === true,
      pendingDelete: existingRule?.pendingDelete === true,
    }, existingRule?.id || `default-upgrade-rule-${index + 1}`))
  })
  saveLocalCommissionRules([...byKey.values()])
}

function buildLocalSale(data, id = '') {
  const now = new Date().toISOString()
  const dependentSale = isDependentSale(data)
  const upgradeSale = data.saleType === 'Upgrade'
  const amount = dependentSale || upgradeSale ? 0 : Number(data.amount || data.accessoryValue || data.planValue || 0)
  const saleTime = normalizeSaleTime(data.saleTime)
  const saleDateValue = getSaleDateValue(data.saleDate, saleTime)
  return {
    ...data,
    id: id || data.id || `local-sale-${Date.now()}`,
    amount,
    planValue: isAccessorySale(data) ? '' : dependentSale || upgradeSale ? 0 : Number(data.planValue || data.amount || 0),
    dependentCount: getDependentCount(data),
    saleTime,
    createdAt: data.createdAt || (saleDateValue ? saleDateValue.toISOString() : now),
    updatedAt: data.updatedAt || now,
    pendingSync: data.pendingSync === true,
    pendingDelete: data.pendingDelete === true,
  }
}

function upsertLocalSale(sale) {
  const sales = getLocalSales({ includeDeleted: true })
  const nextSale = buildLocalSale(sale, sale.id)
  saveLocalSales([
    ...sales.filter((item) => item.id !== nextSale.id),
    nextSale,
  ])
  return nextSale
}

function removeLocalSale(id) {
  const sales = getLocalSales({ includeDeleted: true })
  saveLocalSales(sales.filter((sale) => sale.id !== id))
}

function getLocalGoals({ includeDeleted = false } = {}) {
  const goals = readJsonArray(GOALS_CACHE_FILE)
  return includeDeleted ? goals : goals.filter((goal) => !goal.pendingDelete)
}

function sortGoals(goals) {
  return [...goals].sort((a, b) => (
    (Number(b.year) - Number(a.year))
    || (Number(b.month) - Number(a.month))
    || String(a.type || '').localeCompare(String(b.type || ''), 'pt-BR')
  ))
}

function saveLocalGoals(goals) {
  writeJsonArray(GOALS_CACHE_FILE, sortGoals(goals))
}

function getGoalLocalKey(goal = {}) {
  return [
    goal.type || '',
    goal.userId || '',
    goal.storeName || '',
    goal.groupName || '',
    goal.managerId || '',
    goal.year || '',
    goal.month || '',
  ].map((part) => normalizeText(part)).join('|')
}

function getRecordTimestamp(record = {}) {
  const value = record.updatedAt || record.createdAt || ''
  if (value?.seconds) return value.seconds * 1000
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function pickCanonicalGoal(current, next) {
  if (!current) return next
  const currentGoal = current.data || current
  const nextGoal = next.data || next
  const currentHasTarget = Number(currentGoal.targetValue || 0) > 0
  const nextHasTarget = Number(nextGoal.targetValue || 0) > 0
  if (nextHasTarget !== currentHasTarget) return nextHasTarget ? next : current
  const currentTime = getRecordTimestamp(currentGoal)
  const nextTime = getRecordTimestamp(nextGoal)
  if (nextTime !== currentTime) return nextTime > currentTime ? next : current
  return Number(nextGoal.currentValue || 0) >= Number(currentGoal.currentValue || 0) ? next : current
}

function dedupeGoalsByLogicalKey(goals = []) {
  const byKey = new Map()
  goals.forEach((goal) => {
    const key = getGoalLocalKey(goal)
    if (!key) return
    byKey.set(key, pickCanonicalGoal(byKey.get(key), goal))
  })
  return [...byKey.values()]
}

function dedupeGoalEntriesByLogicalKey(entries = []) {
  const byKey = new Map()
  const duplicateEntries = []
  entries.forEach((entry) => {
    const key = getGoalLocalKey(entry.data)
    if (!key) return
    const current = byKey.get(key)
    const picked = pickCanonicalGoal(current, entry)
    if (current && picked === entry) duplicateEntries.push(current)
    if (current && picked !== entry) duplicateEntries.push(entry)
    byKey.set(key, picked)
  })
  return {
    canonicalEntries: [...byKey.values()],
    duplicateEntries,
  }
}

function buildLocalGoal(data, id = '') {
  const now = new Date().toISOString()
  return {
    ...data,
    id: id || data.id || `local-goal-${Date.now()}-${normalizeText(data.type).replace(/[^a-z0-9]+/g, '-')}`,
    targetValue: Number(data.targetValue || 0),
    currentValue: Number(data.currentValue || 0),
    gapValue: Number(data.gapValue || 0),
    weeklyTarget: Number(data.weeklyTarget || 0),
    dailyTarget: Number(data.dailyTarget || 0),
    businessDaysCount: Number(data.businessDaysCount || 0),
    remainingBusinessDays: Number(data.remainingBusinessDays || 0),
    holidayCount: Number(data.holidayCount || 0),
    holidays: Array.isArray(data.holidays) ? data.holidays : [],
    autoSync: true,
    manualRealized: false,
    manualCurrentValue: undefined,
    manualSalesBaseValue: undefined,
    createdAt: data.createdAt || now,
    updatedAt: now,
    pendingSync: data.pendingSync === true,
    pendingDelete: data.pendingDelete === true,
  }
}

function upsertLocalGoal(goal) {
  const goals = getLocalGoals({ includeDeleted: true })
  const nextGoal = buildLocalGoal(goal, goal.id)
  const nextKey = getGoalLocalKey(nextGoal)
  saveLocalGoals([
    ...goals.filter((item) => item.id !== nextGoal.id && getGoalLocalKey(item) !== nextKey),
    nextGoal,
  ])
  return nextGoal
}

function removeLocalGoal(id) {
  const goals = getLocalGoals({ includeDeleted: true })
  saveLocalGoals(goals.filter((goal) => goal.id !== id))
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function getEasterDate(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addHoliday(holidays, date, name, scope) {
  if (!date || Number.isNaN(date.getTime())) return
  const key = toHolidayKey(date)
  const current = holidays.get(key) || { date: key, names: [], scopes: [] }
  if (name && !current.names.includes(name)) current.names.push(name)
  if (scope && !current.scopes.includes(scope)) current.scopes.push(scope)
  holidays.set(key, current)
}

function resolveHolidayDate(year, holiday) {
  if (holiday.date) {
    const [month, day] = String(holiday.date).split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  if (holiday.kind === 'easterOffset') {
    return addDays(getEasterDate(year), Number(holiday.offset || 0))
  }

  if (holiday.kind === 'sundayBeforeOrOn') {
    let date = new Date(year, Number(holiday.month) - 1, Number(holiday.day))
    while (date.getDay() !== 0) {
      date = addDays(date, -1)
    }
    return date
  }

  return null
}

function addHolidayDefinitions(holidays, year, definitions, scope) {
  definitions.forEach((holiday) => {
    addHoliday(holidays, resolveHolidayDate(year, holiday), holiday.name, scope)
  })
}

function getHolidayMap(year, state = '', city = '', extraHolidays = []) {
  const holidays = new Map()

  addHolidayDefinitions(holidays, year, NATIONAL_FIXED_HOLIDAYS, 'Nacional')
  addHolidayDefinitions(holidays, year, NATIONAL_MOVABLE_HOLIDAYS, 'Nacional')

  const normalizedState = String(state || '').trim().toUpperCase()
  addHolidayDefinitions(holidays, year, STATE_HOLIDAYS[normalizedState] || [], 'Estadual')

  const cityKey = `${normalizeText(city)}|${normalizedState}`
  addHolidayDefinitions(holidays, year, MUNICIPAL_HOLIDAYS[cityKey] || [], 'Municipal')

  extraHolidays.forEach((date) => {
    const holidayDate = typeof date === 'string' ? date : date?.date
    const holidayName = typeof date === 'string' ? 'Feriado adicional' : date?.name || 'Feriado adicional'
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(holidayDate))) {
      const [holidayYear, month, day] = String(holidayDate).split('-').map(Number)
      if (holidayYear === Number(year)) {
        addHoliday(holidays, new Date(holidayYear, month - 1, day), holidayName, 'Adicional')
      }
    }
  })

  return holidays
}

function getHolidaySet(year, state = '', city = '', extraHolidays = []) {
  return new Set(getHolidayMap(year, state, city, extraHolidays).keys())
}

function getMonthHolidayEntries(year, month, state = '', city = '', extraHolidays = []) {
  return [...getHolidayMap(year, state, city, extraHolidays).values()]
    .filter((holiday) => {
      const date = new Date(`${holiday.date}T12:00:00`)
      if (date.getMonth() + 1 !== Number(month)) return false
      return date.getDay() !== 0
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((holiday) => ({
      date: holiday.date,
      name: holiday.names.join(', '),
      scope: holiday.scopes.join(', '),
    }))
}

function getBusinessDays(year, month, state = '', city = '', extraHolidays = []) {
  const holidays = getHolidaySet(year, state, city, extraHolidays)
  const days = []
  const totalDays = new Date(year, month, 0).getDate()

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, month - 1, day)
    const weekday = date.getDay()
    if (weekday === 0) continue
    if (holidays.has(toHolidayKey(date))) continue
    days.push(date)
  }

  return days
}

function getRemainingBusinessDays(year, month, state = '', city = '', extraHolidays = []) {
  const today = new Date()
  const allDays = getBusinessDays(year, month, state, city, extraHolidays)

  if (year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth() + 1)) {
    return 0
  }

  if (year > today.getFullYear() || month > today.getMonth() + 1) {
    return allDays.length
  }

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return allDays.filter((date) => date >= todayStart).length
}

function getGroupCalendarMetrics(year, month, extraHolidays = []) {
  const stores = getCombinedLocalStores()
  const holidayEntriesByDate = new Map()

  stores.forEach((store) => {
    getMonthHolidayEntries(year, month, store.state, store.city, extraHolidays).forEach((holiday) => {
      const existing = holidayEntriesByDate.get(holiday.date)
      if (!existing) {
        holidayEntriesByDate.set(holiday.date, {
          ...holiday,
          stores: [store.name].filter(Boolean),
          city: store.city,
          state: store.state,
        })
        return
      }

      existing.name = [...new Set([...String(existing.name || '').split(', ').filter(Boolean), holiday.name])].join(', ')
      existing.scope = [...new Set([...String(existing.scope || '').split(', ').filter(Boolean), holiday.scope])].join(', ')
      if (store.name && !existing.stores.includes(store.name)) existing.stores.push(store.name)
    })
  })

  const holidayEntries = [...holidayEntriesByDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((holiday) => ({
      date: holiday.date,
      name: holiday.name,
      scope: holiday.scope,
      storeName: holiday.stores.join(', '),
      city: holiday.city,
      state: holiday.state,
    }))
  const holidayDates = new Set(holidayEntries.map((holiday) => holiday.date))
  const days = []
  const totalDays = new Date(year, month, 0).getDate()

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, month - 1, day)
    const weekday = date.getDay()
    if (weekday === 0) continue
    if (holidayDates.has(toHolidayKey(date))) continue
    days.push(date)
  }

  const today = new Date()
  let remainingBusinessDays = days.length
  if (year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth() + 1)) {
    remainingBusinessDays = 0
  } else if (year === today.getFullYear() && month === today.getMonth() + 1) {
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    remainingBusinessDays = days.filter((date) => date >= todayStart).length
  }

  return {
    businessDaysCount: days.length,
    remainingBusinessDays,
    holidays: holidayEntries,
  }
}

function resolveGoalCalendarFields(goal = {}) {
  let storeCity = String(goal.storeCity || '').trim()
  let storeState = String(goal.storeState || '').trim().toUpperCase()

  if ((!storeCity || !storeState) && goal.storeName) {
    const store = getCombinedLocalStores().find((item) => normalizeText(item.name) === normalizeText(goal.storeName))
    storeCity = storeCity || String(store?.city || '').trim()
    storeState = storeState || String(store?.state || '').trim().toUpperCase()
  }

  if ((!storeCity || !storeState) && goal.userId) {
    const user = getLocalUserProfilesMap().get(goal.userId)
    storeCity = storeCity || String(user?.storeCity || user?.city || user?.cidade || '').trim()
    storeState = storeState || String(user?.storeState || user?.state || user?.estado || '').trim().toUpperCase()
  }

  return { storeCity, storeState }
}

function buildGoalMetrics(goal, currentValue) {
  const target = Number(goal.targetValue || 0)
  const current = Number(currentValue || 0)
  const gap = Math.max(0, target - current)

  if (normalizeText(goal.groupName) === normalizeText(ECONOMIC_GROUP_NAME)) {
    const groupCalendar = getGroupCalendarMetrics(Number(goal.year), Number(goal.month), goal.extraHolidays || [])
    const businessDays = groupCalendar.businessDaysCount
    const remainingBusinessDays = groupCalendar.remainingBusinessDays
    const holidays = groupCalendar.holidays
    const remainingWeeks = remainingBusinessDays ? Math.max(1, Math.ceil(remainingBusinessDays / 6)) : 0

    return {
      currentValue: current,
      gapValue: gap,
      weeklyTarget: remainingWeeks ? Number((gap / remainingWeeks).toFixed(2)) : 0,
      dailyTarget: remainingBusinessDays ? Number((gap / remainingBusinessDays).toFixed(2)) : 0,
      businessDaysCount: businessDays,
      remainingBusinessDays,
      holidayCount: holidays.length,
      holidays,
      calendarCity: 'Grupo econômico',
      calendarState: ECONOMIC_GROUP_NAME,
      status: getGoalStatus(current, target),
    }
  }

  const calendarFields = resolveGoalCalendarFields(goal)
  const city = calendarFields.storeCity || goal.storeCity
  const state = calendarFields.storeState || goal.storeState
  const businessDays = getBusinessDays(Number(goal.year), Number(goal.month), state, city, goal.extraHolidays || [])
  const remainingBusinessDays = getRemainingBusinessDays(Number(goal.year), Number(goal.month), state, city, goal.extraHolidays || [])
  const holidays = getMonthHolidayEntries(Number(goal.year), Number(goal.month), state, city, goal.extraHolidays || [])
  const remainingWeeks = remainingBusinessDays ? Math.max(1, Math.ceil(remainingBusinessDays / 6)) : 0

  return {
    currentValue: current,
    gapValue: gap,
    weeklyTarget: remainingWeeks ? Number((gap / remainingWeeks).toFixed(2)) : 0,
    dailyTarget: remainingBusinessDays ? Number((gap / remainingBusinessDays).toFixed(2)) : 0,
    businessDaysCount: businessDays.length,
    remainingBusinessDays,
    holidayCount: holidays.length,
    holidays,
    calendarCity: city || '',
    calendarState: state || '',
    status: getGoalStatus(current, target),
  }
}

function canManageUsers(role) {
  return USER_MANAGEMENT_ROLES.includes(normalizeRole(role))
}

function canAssignUserRole(actorRole, targetRole) {
  const normalizedActorRole = normalizeRole(actorRole)
  const normalizedTargetRole = normalizeRole(targetRole)
  if (!USER_ROLES.includes(normalizedTargetRole)) return false
  if (normalizedActorRole === 'Gerente') {
    return MANAGER_ASSIGNABLE_USER_ROLES.includes(normalizedTargetRole)
  }
  return ['Administrador', 'Gestor Master'].includes(normalizedActorRole)
}

function canChangeUserAccess(role) {
  return ['Administrador', 'Gestor Master'].includes(normalizeRole(role))
}

function canViewAllSales(role) {
  return SALES_FULL_ACCESS_ROLES.includes(normalizeRole(role))
}

function canManageCommissionRules(role) {
  return ['Administrador', 'Gestor Master'].includes(normalizeRole(role))
}

function sanitizeCommissionRulePayload(data = {}) {
  const rule = buildCommissionRule(data, data.id)
  if (!rule.planoAnterior || !rule.planoNovo) {
    throw new Error('planoAnterior and planoNovo are required')
  }
  if (!Number.isFinite(rule.valorComissao) || rule.valorComissao < 0) {
    throw new Error('valorComissao must be zero or greater')
  }
  return rule
}

async function getCommissionRulesFromFirestore() {
  const snap = await db.collection('commissionRules').get()
  return snap.docs.map((docSnap) => buildCommissionRule({ id: docSnap.id, ...docSnap.data() }, docSnap.id))
}

async function ensureDefaultCommissionRules() {
  if (isFirestoreQuotaPaused()) {
    seedLocalCommissionRulesIfEmpty()
    return getLocalCommissionRules()
  }

  const existingSnap = await db.collection('commissionRules').get()
  const existingEntries = existingSnap.docs.map((docSnap) => ({
    ref: docSnap.ref,
    data: buildCommissionRule({ id: docSnap.id, ...docSnap.data() }, docSnap.id),
  }))
  const byKey = new Map(existingEntries.map((entry) => [commissionRuleKey(entry.data), entry]))

  const defaultWrites = DEFAULT_COMMISSION_RULES.map((rule) => {
    const existingEntry = byKey.get(commissionRuleKey(rule))
    return {
      ref: existingEntry?.ref || db.collection('commissionRules').doc(),
      rule: buildCommissionRule({
        ...existingEntry?.data,
        ...rule,
        ativo: rule.ativo,
      }, existingEntry?.data?.id || ''),
      exists: Boolean(existingEntry),
    }
  })

  await commitBatchInChunks(defaultWrites, (batch, item) => {
    batch.set(item.ref, {
      ...item.rule,
      id: item.ref.id,
      createdAt: item.exists ? item.rule.createdAt : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
  })
  return defaultWrites.map((item) => ({ ...item.rule, id: item.ref.id }))
}

async function getActiveUpgradeCommissionRules() {
  try {
    await ensureDefaultCommissionRules()
    if (isFirestoreQuotaPaused()) return getLocalCommissionRules().filter((rule) => rule.ativo)
    const rules = await getCommissionRulesFromFirestore()
    saveLocalCommissionRules(rules)
    return rules.filter((rule) => rule.ativo)
  } catch (error) {
    if (!rememberQuotaError(error)) {
      console.warn('Não foi possível carregar regras de comissão do Firestore. Usando cache local.', error.message || error)
    }
    seedLocalCommissionRulesIfEmpty()
    return getLocalCommissionRules().filter((rule) => rule.ativo)
  }
}

function findUpgradeCommissionRule(sale, rules = []) {
  if (sale.saleType !== 'Upgrade') return null
  const previousPlan = normalizePlanName(sale.previousPlan)
  const newPlan = normalizePlanName(sale.plan)
  if (!previousPlan || !newPlan) return null
  return rules
    .filter((rule) => (
      rule.ativo
      && planPatternMatches(rule.planoAnterior, previousPlan)
      && planPatternMatches(rule.planoNovo, newPlan)
    ))
    .sort((a, b) => getRuleSpecificity(b) - getRuleSpecificity(a) || Number(b.valorComissao || 0) - Number(a.valorComissao || 0))[0] || null
}

function findCommissionRuleBySubcategory(rules = [], subcategoria) {
  return rules.find((rule) => rule.ativo && normalizeText(rule.subcategoria || rule.categoria) === normalizeText(subcategoria)) || null
}

function getCommissionPercent(rule, goalHit = false) {
  if (!rule) return 0
  const percent = goalHit
    ? Number(rule.percentualComissaoMetaBatida || rule.percentualComissao || 0)
    : Number(rule.percentualComissao || 0)
  return Number.isFinite(percent) ? percent / 100 : 0
}

function getStoreCommissionPercent(rule, goalHit = false) {
  if (!rule) return 0
  const percent = goalHit
    ? Number(rule.percentualLojaMetaBatida || rule.percentualLoja || 0)
    : Number(rule.percentualLoja || 0)
  return Number.isFinite(percent) ? percent / 100 : 0
}

function getFixedCommissionValue(rule) {
  if (!rule || rule.ativo === false) return 0
  return roundMoney(rule.valorComissao || 0)
}

function normalizeRole(value) {
  const role = normalizeText(value)
  if (role === 'administrador' || role === 'admin' || role === 'adm') return 'Administrador'
  if (role === 'gestor master' || role === 'gestor marter') return 'Gestor Master'
  if (role === 'gerente') return 'Gerente'
  if (role === 'vendedor') return 'Vendedor'
  if (role === 'caixa') return 'Caixa'
  if (role === 'executivo') return 'Executivo'
  return value || 'Vendedor'
}

function getBearerToken(req) {
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : ''
}

async function verifyIdTokenCached(token) {
  const cached = idTokenCache.get(token)
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.decodedToken

  const decodedToken = await admin.auth().verifyIdToken(token)
  idTokenCache.set(token, {
    decodedToken,
    expiresAt: now + ID_TOKEN_CACHE_TTL_MS,
  })
  return decodedToken
}

async function listAuthUsersCached() {
  const now = Date.now()
  if (authUsersCache.users && authUsersCache.expiresAt > now) {
    return authUsersCache.users
  }

  const authUsers = await admin.auth().listUsers(1000)
  authUsersCache = {
    users: authUsers.users,
    expiresAt: now + AUTH_USERS_CACHE_TTL_MS,
  }
  return authUsers.users
}

function clearAuthUsersCache() {
  authUsersCache = { users: null, expiresAt: 0 }
}

function saleBelongsToUser(sale, user) {
  if (!sale || !user) return false
  const userEmail = normalizeText(user.email)
  return sale.userId === user.uid
    || normalizeText(sale.userEmail) === userEmail
    || normalizeText(sale.seller) === userEmail
}

function getProfileStoreName(profile = {}) {
  return profile.storeName || profile.store || profile.loja || ''
}

function saleBelongsToStore(sale, user, usersIndex = null) {
  const managerStore = normalizeText(getProfileStoreName(user))
  if (!sale || !managerStore) return false
  const sellerUser = usersIndex
    ? usersIndex.byId.get(sale.userId) || usersIndex.byEmail.get(sale.seller) || usersIndex.byEmail.get(sale.userEmail)
    : null
  const saleStore = sale.storeName || getProfileStoreName(sellerUser)
  return normalizeText(saleStore) === managerStore
}

function canAccessSale(req, sale, usersIndex = null) {
  if (canViewAllSales(req.actorRole)) return true
  if (normalizeRole(req.actorRole) === 'Gerente') return saleBelongsToStore(sale, req.currentUser, usersIndex)
  return saleBelongsToUser(sale, req.currentUser)
}

function canManageSale(req, sale, usersIndex = null) {
  return canAccessSale(req, sale, usersIndex)
}

function buildActorSaleBody(req, fallbackSale = {}) {
  const role = normalizeRole(req.actorRole)
  const canUseSubmittedSeller = canViewAllSales(role) || role === 'Gerente'
  return {
    ...req.body,
    seller: canUseSubmittedSeller ? (req.body.seller || fallbackSale.seller || req.currentUser.email || '') : (req.currentUser.email || ''),
    userId: canUseSubmittedSeller ? (req.body.userId || fallbackSale.userId || req.currentUser.uid || '') : (req.currentUser.uid || ''),
    userName: canUseSubmittedSeller ? (req.body.userName || fallbackSale.userName || req.currentUser.name || 'Usuário') : (req.currentUser.name || 'Usuário'),
    userEmail: canUseSubmittedSeller ? (req.body.userEmail || fallbackSale.userEmail || req.currentUser.email || '') : (req.currentUser.email || ''),
  }
}

function canAccessGoalPayload(req, goal = {}) {
  const role = normalizeRole(req.actorRole)
  if (['Administrador', 'Gestor Master'].includes(role)) return true
  if (role === 'Gerente') {
    const managerStore = normalizeText(getProfileStoreName(req.currentUser))
    if (!managerStore || goal.groupName || goal.managerId) return false
    if (goal.storeName) return normalizeText(goal.storeName) === managerStore
    if (goal.userId) {
      const user = getLocalUsersList().find((item) => (item.uid || item.id) === goal.userId)
      return normalizeText(getProfileStoreName(user)) === managerStore
    }
    return false
  }
  return goal.userId === req.currentUser?.uid
    && !goal.storeName
    && !goal.managerId
}

function filterRowsForManagerStore(rows, currentUser) {
  const managerStore = normalizeText(getProfileStoreName(currentUser))
  if (!managerStore) return []
  return rows.filter((row) => normalizeText(row.name || row.storeName || row.loja) === managerStore)
}

function filterUsersForManagerStore(users, currentUser) {
  const managerStore = normalizeText(getProfileStoreName(currentUser))
  if (!managerStore) return []
  return users.filter((user) => {
    const role = normalizeRole(user.role)
    return !['Administrador', 'Gestor Master'].includes(role)
      && normalizeText(getProfileStoreName(user)) === managerStore
  })
}

async function getUserProfileForPermission(uid) {
  let profileData = getLocalUserProfilesMap().get(uid) || {}
  if ((!profileData.uid && !profileData.id) && !isFirestoreQuotaPaused()) {
    try {
      const profile = await db.collection('users').doc(uid).get()
      profileData = profile.exists ? { id: profile.id, ...profile.data() } : profileData
    } catch (error) {
      rememberQuotaError(error)
      console.warn('Não foi possível carregar perfil para validar permissão. Usando cache local.', error.message || error)
    }
  }
  if (!profileData.uid && !profileData.id) {
    const authUser = await admin.auth().getUser(uid)
    return buildUserProfile(authUser, profileData)
  }
  return buildCachedUserProfile(profileData)
}

function managerCanAccessUserProfile(manager, profile) {
  if (['Administrador', 'Gestor Master'].includes(normalizeRole(profile.role))) return false
  return normalizeText(getProfileStoreName(profile)) === normalizeText(getProfileStoreName(manager))
}

function filterGoalsForActor(goals, req) {
  const role = normalizeRole(req.actorRole)
  if (['Administrador', 'Gestor Master'].includes(role)) return goals
  if (role === 'Gerente') {
    const managerStore = normalizeText(getProfileStoreName(req.currentUser))
    if (!managerStore) return []
    const storeUserIds = new Set(
      getLocalUsersList()
        .filter((user) => normalizeText(getProfileStoreName(user)) === managerStore)
        .map((user) => user.uid || user.id)
        .filter(Boolean),
    )
    return goals.filter((goal) => {
      if (goal.groupName || goal.managerId) return false
      if (goal.storeName) return normalizeText(goal.storeName) === managerStore
      return goal.userId && storeUserIds.has(goal.userId)
    })
  }
  return goals.filter((goal) => goal.userId === req.currentUser.uid && !goal.storeName && !goal.groupName)
}

async function authenticateRequest(req, res, next) {
  try {
    const token = getBearerToken(req)
    if (!token) {
      return res.status(401).json({ message: 'Sessão não autenticada.' })
    }

    const decodedToken = await verifyIdTokenCached(token)
    const cachedProfile = authProfileCache.get(decodedToken.uid)
    const now = Date.now()
    let profile = cachedProfile && cachedProfile.expiresAt > now ? cachedProfile.profile : null

    if (!profile) {
      const authUser = await admin.auth().getUser(decodedToken.uid).catch(() => ({
        uid: decodedToken.uid,
        email: decodedToken.email || '',
        displayName: decodedToken.name || '',
        customClaims: decodedToken.role ? { role: decodedToken.role } : {},
        disabled: false,
        metadata: {},
      }))

      let profileData = {}
      const localProfile = getLocalUserProfilesMap().get(decodedToken.uid) || {}
      if (localProfile.uid || localProfile.id) {
        profileData = localProfile
      } else if (!isFirestoreQuotaPaused()) {
        try {
          const profileSnap = await db.collection('users').doc(decodedToken.uid).get()
          profileData = profileSnap.exists ? profileSnap.data() : {}
        } catch (error) {
          rememberQuotaError(error)
          console.warn('Não foi possível carregar perfil do Firestore. Usando dados do Auth.', error.message || error)
        }
      } else {
        profileData = localProfile
      }

      profile = buildUserProfile(authUser, profileData)
      if ((!profile.role || profile.role === 'Vendedor') && decodedToken.role) {
        profile.role = normalizeRole(decodedToken.role)
      }
      authProfileCache.set(decodedToken.uid, {
        profile,
        expiresAt: now + AUTH_PROFILE_CACHE_TTL_MS,
      })
    }

    if (profile.disabled) {
      return res.status(403).json({ message: 'Usuário desativado.' })
    }

    req.currentUser = profile
    req.actorRole = normalizeRole(profile.role)

    if (req.body && typeof req.body === 'object') {
      req.body.actorRole = req.actorRole
    }

    next()
  } catch (error) {
    console.error('Erro ao validar sessão:', error)
    res.status(401).json({ message: 'Sessão inválida ou expirada. Faça login novamente.' })
  }
}

function getGoalStatus(currentValue, targetValue) {
  const target = Number(targetValue || 0)
  const current = Number(currentValue || 0)
  if (!target || current <= 0) return 'abaixo da meta'
  const percent = (current / target) * 100
  if (percent >= 120) return 'super meta'
  if (percent >= 100) return 'meta batida'
  return 'em andamento'
}

function getSaleDateParts(sale) {
  const source = sale.saleDate
    ? new Date(`${sale.saleDate}T12:00:00`)
    : sale.createdAt?.toDate
      ? sale.createdAt.toDate()
      : sale.createdAt
        ? new Date(sale.createdAt)
        : null

  if (!source || Number.isNaN(source.getTime())) return {}
  return { month: source.getMonth() + 1, year: source.getFullYear() }
}

function includesText(value, text) {
  return String(value || '').toLowerCase().includes(text.toLowerCase())
}

function normalizeGoalText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function planStartsWith(sale, prefix) {
  return normalizeGoalText(sale.plan).startsWith(normalizeGoalText(prefix))
}

function planIncludes(sale, text) {
  return normalizeGoalText(sale.plan).includes(normalizeGoalText(text))
}

function isDependentSale(sale) {
  return normalizeGoalText(sale.plan) === 'DEPENDENTE'
}

function getSaleRevenueValue(sale) {
  if (isDependentSale(sale)) return 0
  if (includesText(sale.saleType, 'Acessório')) return 0
  if (sale.saleType === 'Upgrade') return 0
  const planValue = sale.planValue !== undefined && sale.planValue !== ''
    ? Number(sale.planValue || 0)
    : Number(sale.amount || 0)
  return Number.isFinite(planValue) ? planValue : 0
}

function isAccessorySale(sale) {
  return includesText(sale.saleType, 'Acessório')
}

function hasDeviceSale(sale) {
  return sale.saleType === 'Aparelhos'
    || (sale.saleType === 'Upgrade' && includesText(sale.addDeviceToUpgrade, 'Sim'))
    || (sale.saleType === 'Upgrade' && Number(sale.deviceValue || 0) > 0)
}

function validateSalePayload(data) {
  const { saleDate, customer, cpf, seller, saleType, access, plan, planValue } = data
  if (!saleDate || !customer || !cpf || !seller || !saleType) {
    return 'saleDate, customer, cpf, seller and saleType are required'
  }

  if (isAccessorySale(data)) {
    if (!data.accessoryName || data.accessoryValue === '' || data.accessoryValue === undefined) {
      return 'accessoryName and accessoryValue are required for Acessórios sales'
    }
    return ''
  }

  if (!access || !plan || (saleType !== 'Upgrade' && (planValue === '' || planValue === undefined))) {
    return saleType === 'Upgrade' ? 'access and plan are required' : 'access, plan and planValue are required'
  }

  if (saleType === 'Aparelhos' && data.deviceSaleMode === 'Portabilidade' && !data.provisionalNumber) {
    return 'provisionalNumber is required for Aparelhos sales with Portabilidade'
  }

  if (hasDeviceSale(data) && (!data.deviceModel || data.deviceValue === '' || data.deviceValue === undefined || !data.imei || !data.deviceOrigin)) {
    return 'deviceModel, deviceValue, imei and deviceOrigin are required for Aparelhos sales'
  }

  return ''
}

function shouldAutoSyncGoal(goal) {
  return true
}

function getGoalStoredCurrentValue(goal) {
  return Number(goal.currentValue || 0)
}

function calculateGoalCurrentValueWithManualBase(goal, sales, usersIndex) {
  return calculateGoalCurrentValue(goal, sales, usersIndex)
}

function roundMoney(value) {
  return Number((Number(value || 0)).toFixed(2))
}

function isGoalHit(goal) {
  return goal ? ['meta batida', 'super meta'].includes(goal.status) : false
}

function getDependentCount(sale) {
  const count = Math.max(0, Number(sale.dependentCount ?? sale.dependents ?? 0) || 0)
  return count || (isDependentSale(sale) ? 1 : 0)
}

function getAccessoryValue(sale) {
  if (sale.accessoryValue !== undefined && sale.accessoryValue !== '') {
    return Number(sale.accessoryValue || 0)
  }
  if (includesText(sale.saleType, 'Acessório') || includesText(sale.plan, 'Acessório')) {
    return Number(sale.amount || 0)
  }
  return 0
}

function getInsuranceValue(sale) {
  if (sale.insuranceValue !== undefined && sale.insuranceValue !== '') {
    return Number(sale.insuranceValue || 0)
  }
  if (sale.seguroValue !== undefined && sale.seguroValue !== '') {
    return Number(sale.seguroValue || 0)
  }
  return 0
}

function getSaleGoalValue(sale, type) {
  const amount = getSaleRevenueValue(sale)
  const isUpgradeSale = sale.saleType === 'Upgrade'
  switch (type) {
    case 'Receita Total':
      return amount
    case 'Gross':
      return getSaleGoalValue(sale, 'Pós') + getSaleGoalValue(sale, 'Controle')
    case 'Aparelhos':
      return hasDeviceSale(sale) ? Number(sale.deviceValue || 0) : 0
    case 'Controle':
      if (isUpgradeSale) return 0
      return planStartsWith(sale, 'CONTROLE') ? 1 : 0
    case 'Pós':
    case 'Planos Pós':
      if (isUpgradeSale) return 0
      if (isDependentSale(sale)) return getDependentCount(sale)
      return planStartsWith(sale, 'BLACK') ? 1 + getDependentCount(sale) : 0
    case 'Upgrade':
      return isUpgradeSale ? 1 : 0
    case 'Portabilidade':
      return hasPortability(sale) ? 1 : 0
    case 'DACC':
      return sale.dacc === 'Sim' ? 1 : 0
    case 'Fibra':
      return planIncludes(sale, 'Fibra') || includesText(sale.saleType, 'Fibra') || includesText(sale.access, 'Fibra') ? 1 : 0
    case 'Acessórios':
      return getAccessoryValue(sale)
    case 'PayJoy':
      return sale.payJoy === 'Sim' || sale.payjoy === 'Sim' || includesText(sale.saleType, 'PayJoy') ? amount : 0
    case 'Seguros':
      return sale.insurance === 'Sim' || sale.seguro === 'Sim' || includesText(sale.saleType, 'Seguro') ? getInsuranceValue(sale) : 0
    default:
      return 0
  }
}

function hasPortability(sale) {
  return sale.saleType === 'Portabilidade'
    || includesText(sale.saleType, 'Portabilidade')
    || (sale.saleType === 'Aparelhos' && includesText(sale.deviceSaleMode, 'Portabilidade'))
    || includesText(sale.portability, 'Sim')
    || includesText(sale.portabilidade, 'Sim')
    || Boolean(String(sale.provisionalNumber || '').trim())
}

async function getUsersIndex() {
  const localProfiles = getLocalUserProfilesMap()
  if (localProfiles.size && isFirestoreQuotaPaused()) {
    const byId = new Map()
    const byEmail = new Map()
    localProfiles.forEach((profile, uid) => {
      const data = buildCachedUserProfile({ ...profile, uid })
      byId.set(uid, data)
      if (data.uid) byId.set(data.uid, data)
      if (data.email) byEmail.set(data.email, data)
    })
    return { byId, byEmail }
  }

  const snap = await db.collection('users').get()
  const byId = new Map()
  const byEmail = new Map()
  snap.docs.forEach((doc) => {
    const data = { id: doc.id, ...doc.data() }
    byId.set(doc.id, data)
    if (data.uid) byId.set(data.uid, data)
    if (data.email) byEmail.set(data.email, data)
  })
  return { byId, byEmail }
}

function getLocalUserByEmail(email) {
  const normalizedEmail = normalizeText(email)
  if (!normalizedEmail) return null
  for (const profile of getLocalUserProfilesMap().values()) {
    if (normalizeText(profile.email) === normalizedEmail) {
      return buildCachedUserProfile(profile)
    }
  }
  return null
}

function getUsersIndexFromLocal() {
  const byId = new Map()
  const byEmail = new Map()
  getLocalUserProfilesMap().forEach((profile, uid) => {
    const data = buildCachedUserProfile({ ...profile, uid })
    byId.set(uid, data)
    if (data.uid) byId.set(data.uid, data)
    if (data.id) byId.set(data.id, data)
    if (data.email) byEmail.set(data.email, data)
  })
  return { byId, byEmail }
}

function saleMatchesGoal(sale, goal, usersIndex) {
  const { month, year } = getSaleDateParts(sale)
  if (Number(goal.month) !== month || Number(goal.year) !== year) return false
  if (goal.userId && sale.userId !== goal.userId) return false

  if (normalizeText(goal.groupName) === normalizeText(ECONOMIC_GROUP_NAME)) {
    return true
  }

  if (goal.storeName) {
    const sellerUser = usersIndex.byId.get(sale.userId) || usersIndex.byEmail.get(sale.seller) || usersIndex.byEmail.get(sale.userEmail)
    const saleStore = normalizeText(sale.storeName || sellerUser?.storeName || sellerUser?.store || sellerUser?.loja)
    return saleStore === normalizeText(goal.storeName)
  }

  if (goal.managerId) {
    if (sale.managerId === goal.managerId) return true
    const sellerUser = usersIndex.byId.get(sale.userId) || usersIndex.byEmail.get(sale.seller) || usersIndex.byEmail.get(sale.userEmail)
    if (sellerUser?.managerId === goal.managerId) return true
    return sale.userId === goal.managerId
  }

  return true
}

function calculateGoalCurrentValue(goal, sales, usersIndex) {
  return sales.reduce((sum, sale) => {
    if (!saleMatchesGoal(sale, goal, usersIndex)) return sum
    return sum + getSaleGoalValue(sale, goal.type)
  }, 0)
}

function getGoalUser(goal, usersIndex) {
  return usersIndex.byId.get(goal.userId) || null
}

function getGoalUserStoreName(goal, usersIndex) {
  const user = getGoalUser(goal, usersIndex)
  return user?.storeName || user?.store || user?.loja || ''
}

function isSellerGoalUser(goal, usersIndex) {
  const user = getGoalUser(goal, usersIndex)
  const role = normalizeRole(user?.role || '')
  return role === 'Vendedor' || role === 'Executivo'
}

function getStoreSellerGoals(goal, goals, usersIndex) {
  const storeName = normalizeText(goal.storeName)
  if (!storeName) return []

  return goals.filter((sellerGoal) => {
    if (!sellerGoal.userId || sellerGoal.storeName || sellerGoal.groupName) return false
    if (sellerGoal.type !== goal.type) return false
    if (Number(sellerGoal.month) !== Number(goal.month) || Number(sellerGoal.year) !== Number(goal.year)) return false
    if (!isSellerGoalUser(sellerGoal, usersIndex)) return false
    if (normalizeText(getGoalUserStoreName(sellerGoal, usersIndex)) !== storeName) return false
    return true
  })
}

function calculateStoreGoalCurrentValueFromSellerGoals(goal, goals, usersIndex) {
  const storeName = normalizeText(goal.storeName)
  if (!storeName) return getGoalStoredCurrentValue(goal)

  return getStoreSellerGoals(goal, goals, usersIndex).reduce((sum, sellerGoal) => {
    return sum + Number(sellerGoal.currentValue || 0)
  }, 0)
}

function calculateStoreGoalCurrentValue(goal, goals, sales, usersIndex) {
  return calculateGoalCurrentValue(goal, sales, usersIndex)
}

function calculateGroupGoalCurrentValueFromStoreGoals(goal, goals, registeredStoreNames = new Set()) {
  return calculateGroupGoalTotalsFromStoreGoals(goal, goals, registeredStoreNames).currentValue
}

function calculateGroupGoalTotalsFromStoreGoals(goal, goals, registeredStoreNames = new Set()) {
  if (normalizeText(goal.groupName) !== normalizeText(ECONOMIC_GROUP_NAME)) {
    return {
      targetValue: Number(goal.targetValue || 0),
      currentValue: getGoalStoredCurrentValue(goal),
    }
  }

  return goals.reduce((totals, storeGoal) => {
    const storeName = normalizeText(storeGoal.storeName)
    if (!storeName || storeGoal.userId || storeGoal.groupName) return totals
    if (registeredStoreNames.size && !registeredStoreNames.has(storeName)) return totals
    if (storeGoal.type !== goal.type) return totals
    if (Number(storeGoal.month) !== Number(goal.month) || Number(storeGoal.year) !== Number(goal.year)) return totals
    return {
      targetValue: totals.targetValue + Number(storeGoal.targetValue || 0),
      currentValue: totals.currentValue + Number(storeGoal.currentValue || 0),
    }
  }, { targetValue: 0, currentValue: 0 })
}

async function calculateGoalCurrentValueFromFirestore(goal, fallbackValue = 0) {
  if (isFirestoreQuotaPaused()) return Number(fallbackValue || 0)

  const [salesSnap, goalsSnap, storesSnap, usersIndex] = await Promise.all([
    db.collection('vendas').get(),
    db.collection('goals').get(),
    db.collection('stores').get(),
    getUsersIndex(),
  ])
  const sales = [
    ...salesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    ...getLocalSales().filter((sale) => sale.pendingSync),
  ]
  if (goal.storeName || goal.groupName) {
    const goals = goalsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    const registeredStoreNames = new Set(storesSnap.docs.map((doc) => normalizeText(doc.data().name)).filter(Boolean))
    const sellerGoals = goals.map((item) => {
      if (item.storeName || item.groupName || !item.userId) return item
      const currentValue = shouldAutoSyncGoal(item)
        ? calculateGoalCurrentValue(item, sales, usersIndex)
        : calculateGoalCurrentValueWithManualBase(item, sales, usersIndex)
      return { ...item, currentValue, ...buildGoalMetrics(item, currentValue) }
    })
    const storeGoals = goals.map((item) => {
      if (!item.storeName || item.userId || item.groupName) return item
      const currentValue = calculateStoreGoalCurrentValue(item, sellerGoals, sales, usersIndex)
      return { ...item, currentValue, ...buildGoalMetrics(item, currentValue) }
    })
    if (goal.storeName) {
      return calculateStoreGoalCurrentValue(goal, sellerGoals, sales, usersIndex)
    }
    return calculateGroupGoalTotalsFromStoreGoals(goal, storeGoals, registeredStoreNames).currentValue
  }
  if (!shouldAutoSyncGoal(goal)) {
    return calculateGoalCurrentValueWithManualBase(goal, sales, usersIndex)
  }
  return calculateGoalCurrentValue(goal, sales, usersIndex)
}

function getSaleUser(sale, usersIndex) {
  return usersIndex.byId.get(sale.userId) || usersIndex.byEmail.get(sale.seller) || usersIndex.byEmail.get(sale.userEmail) || null
}

function getSaleStoreName(sale, usersIndex) {
  const user = getSaleUser(sale, usersIndex)
  return sale.storeName || user?.storeName || user?.store || user?.loja || ''
}

function goalIndexKey(parts) {
  return parts.map((part) => normalizeText(part)).join('|')
}

function buildGoalIndexes(goals) {
  const seller = new Map()
  const store = new Map()
  const group = new Map()

  goals.forEach((goal) => {
    if (goal.userId) {
      seller.set(goalIndexKey([goal.userId, goal.type, goal.year, goal.month]), goal)
    }
    if (goal.storeName) {
      store.set(goalIndexKey([goal.storeName, goal.type, goal.year, goal.month]), goal)
    }
    if (goal.groupName) {
      group.set(goalIndexKey([goal.groupName, goal.type, goal.year, goal.month]), goal)
    }
  })

  return { seller, store, group }
}

function getGoalForSale(sale, type, usersIndex, goalIndexes, scope = 'any') {
  const { month, year } = getSaleDateParts(sale)
  if (!month || !year) return null

  if (scope !== 'store' && sale.userId) {
    const sellerGoal = goalIndexes.seller.get(goalIndexKey([sale.userId, type, year, month]))
    if (sellerGoal) return sellerGoal
  }

  if (scope !== 'seller') {
    const storeName = getSaleStoreName(sale, usersIndex)
    if (storeName) {
      const storeGoal = goalIndexes.store.get(goalIndexKey([storeName, type, year, month]))
      if (storeGoal) return storeGoal
    }
  }

  if (scope === 'any') {
    const groupGoal = goalIndexes.group?.get(goalIndexKey([ECONOMIC_GROUP_NAME, type, year, month]))
    if (groupGoal) return groupGoal
  }

  return null
}

function calculateSaleCommission(sale, usersIndex, goalIndexes, upgradeCommissionRules = []) {
  const amount = Number(sale.amount || 0)
  const revenueAmount = getSaleRevenueValue(sale)
  const deviceValue = hasDeviceSale(sale) ? Number(sale.deviceValue || 0) : 0
  const accessoryValue = getAccessoryValue(sale)
  const insuranceValue = getInsuranceValue(sale)
  const dependentCount = getDependentCount(sale)
  const upgradeRule = findUpgradeCommissionRule(sale, upgradeCommissionRules)
  const revenueRule = findCommissionRuleBySubcategory(upgradeCommissionRules, 'Receita')
  const accessoryRule = findCommissionRuleBySubcategory(upgradeCommissionRules, 'Acessórios')
  const deviceRule = findCommissionRuleBySubcategory(upgradeCommissionRules, 'Aparelhos')
  const portabilityRule = findCommissionRuleBySubcategory(upgradeCommissionRules, 'Portabilidade')
  const insuranceRule = findCommissionRuleBySubcategory(upgradeCommissionRules, 'Seguros')

  const revenueGoal = getGoalForSale(sale, 'Receita Total', usersIndex, goalIndexes)
  const accessoryGoal = getGoalForSale(sale, 'Acessórios', usersIndex, goalIndexes)
  const insuranceGoal = getGoalForSale(sale, 'Seguros', usersIndex, goalIndexes)
  const storeDeviceGoal = getGoalForSale(sale, 'Aparelhos', usersIndex, goalIndexes, 'store')
  const isUpgradeSale = sale.saleType === 'Upgrade'

  const revenueRate = isGoalHit(revenueGoal) ? 0.10 : 0.05
  const accessoryRate = getCommissionPercent(accessoryRule, isGoalHit(accessoryGoal))
  const insuranceRate = getCommissionPercent(insuranceRule, isGoalHit(insuranceGoal))
  const sellerDeviceRate = getCommissionPercent(deviceRule, false)

  const revenueCommission = isUpgradeSale ? 0 : roundMoney(revenueAmount * revenueRate)
  const portabilityCommission = hasPortability(sale) ? (getFixedCommissionValue(portabilityRule) || 2) : 0
  const accessoryCommission = roundMoney(accessoryValue * accessoryRate)
  const sellerDeviceCommission = roundMoney(deviceValue * sellerDeviceRate)
  const storeDeviceRateFixed = 0.015
  const storeDeviceCommission = roundMoney(deviceValue * storeDeviceRateFixed)
  const dependentCommission = (isDependentSale(sale) || planStartsWith(sale, 'BLACK')) ? roundMoney(dependentCount * 5) : 0
  const upgradeCommission = upgradeRule ? roundMoney(upgradeRule.valorComissao) : 0
  const insuranceCommission = getSaleGoalValue(sale, 'Seguros') > 0 ? roundMoney(insuranceValue * insuranceRate) : 0
  const storePortabilityCommission = hasPortability(sale) ? 1 : 0
  const storeCommission = roundMoney(
    revenueCommission
    + storePortabilityCommission
    + accessoryCommission
    + storeDeviceCommission
    + dependentCommission
    + upgradeCommission
    + insuranceCommission,
  )

  const commission = roundMoney(
    revenueCommission
    + portabilityCommission
    + accessoryCommission
    + sellerDeviceCommission
    + dependentCommission
    + upgradeCommission
    + insuranceCommission,
  )

  return {
    commission,
    commissionRate: isUpgradeSale ? 0 : revenueRate,
    storeCommission,
    commissionDetails: {
      revenue: {
        base: roundMoney(revenueAmount),
        rate: isUpgradeSale ? 0 : revenueRate,
        goalHit: isGoalHit(revenueGoal),
        ruleId: revenueRule?.id || '',
        amount: revenueCommission,
      },
      portability: {
        count: hasPortability(sale) ? 1 : 0,
        ruleId: portabilityRule?.id || '',
        amount: portabilityCommission,
        storeAmount: storePortabilityCommission,
      },
      accessories: {
        base: roundMoney(accessoryValue),
        rate: accessoryRate,
        goalHit: isGoalHit(accessoryGoal),
        ruleId: accessoryRule?.id || '',
        amount: accessoryCommission,
      },
      devices: {
        base: roundMoney(deviceValue),
        sellerRate: sellerDeviceRate,
        sellerAmount: sellerDeviceCommission,
        storeRate: storeDeviceRateFixed,
        storeGoalHit: isGoalHit(storeDeviceGoal),
        ruleId: deviceRule?.id || '',
        storeAmount: storeDeviceCommission,
      },
      insurance: {
        count: getSaleGoalValue(sale, 'Seguros') > 0 ? 1 : 0,
        base: roundMoney(insuranceValue),
        rate: insuranceRate,
        goalHit: isGoalHit(insuranceGoal),
        ruleId: insuranceRule?.id || '',
        amount: insuranceCommission,
      },
      dependents: {
        count: dependentCount,
        amount: dependentCommission,
        storeAmount: dependentCommission,
      },
      upgrade: {
        previousPlan: sale.previousPlan || '',
        newPlan: sale.plan || '',
        ruleId: upgradeRule?.id || '',
        type: upgradeRule?.tipoUpgrade || '',
        category: upgradeRule?.categoria || '',
        amount: upgradeCommission,
        storeAmount: upgradeCommission,
      },
      store: {
        revenueAmount: revenueCommission,
        portabilityAmount: storePortabilityCommission,
        accessoriesAmount: accessoryCommission,
        devicesAmount: storeDeviceCommission,
        dependentsAmount: dependentCommission,
        upgradeAmount: upgradeCommission,
        insuranceAmount: insuranceCommission,
        amount: storeCommission,
      },
    },
  }
}

function hasCommissionChanged(sale, nextCommission) {
  return roundMoney(sale.commission) !== nextCommission.commission
    || roundMoney(sale.storeCommission) !== nextCommission.storeCommission
    || Number(sale.commissionRate || 0) !== nextCommission.commissionRate
    || JSON.stringify(sale.commissionDetails || {}) !== JSON.stringify(nextCommission.commissionDetails)
}

function hasGoalMetricsChanged(goal, metrics) {
  return roundMoney(goal.currentValue) !== roundMoney(metrics.currentValue)
    || roundMoney(goal.gapValue) !== roundMoney(metrics.gapValue)
    || roundMoney(goal.weeklyTarget) !== roundMoney(metrics.weeklyTarget)
    || roundMoney(goal.dailyTarget) !== roundMoney(metrics.dailyTarget)
    || Number(goal.businessDaysCount || 0) !== Number(metrics.businessDaysCount || 0)
    || Number(goal.remainingBusinessDays || 0) !== Number(metrics.remainingBusinessDays || 0)
    || goal.autoSync === false
    || goal.manualRealized === true
    || goal.manualCurrentValue !== undefined
    || goal.manualSalesBaseValue !== undefined
    || goal.status !== metrics.status
}

async function commitBatchInChunks(items, applyWrite) {
  let batch = db.batch()
  let count = 0

  for (const item of items) {
    applyWrite(batch, item)
    count += 1
    if (count >= 450) {
      await batch.commit()
      batch = db.batch()
      count = 0
    }
  }

  if (count) await batch.commit()
}

async function syncGoals() {
  if (isFirestoreQuotaPaused()) {
    return syncLocalGoals()
  }

  try {
    const [goalsSnap, salesSnap, storesSnap, usersIndex, upgradeCommissionRules] = await Promise.all([
      db.collection('goals').get(),
      db.collection('vendas').get(),
      db.collection('stores').get(),
      getUsersIndex(),
      getActiveUpgradeCommissionRules(),
    ])
    const sales = [
      ...salesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      ...getLocalSales().filter((sale) => sale.pendingSync),
    ]
    const goalWrites = []
    const updatedGoals = []
    const registeredStoreNames = new Set(storesSnap.docs.map((doc) => normalizeText(doc.data().name)).filter(Boolean))

    const goalDocsRaw = goalsSnap.docs.map((goalDoc) => ({
      ref: goalDoc.ref,
      id: goalDoc.id,
      data: { id: goalDoc.id, ...goalDoc.data() },
    }))
    const { canonicalEntries: goalDocs, duplicateEntries: duplicateGoalDocs } = dedupeGoalEntriesByLogicalKey(goalDocsRaw)

    function addSyncedGoal(goalEntry, metrics) {
      const goal = goalEntry.data
      const updatedGoal = {
        ...goal,
        ...metrics,
      }
      updatedGoals.push(updatedGoal)
      if (hasGoalMetricsChanged(goal, metrics) || goal.id !== goalEntry.id) {
        goalWrites.push({
          ref: goalEntry.ref,
          data: {
            id: goalEntry.id,
            ...metrics,
            autoSync: true,
            manualRealized: false,
            manualCurrentValue: admin.firestore.FieldValue.delete(),
            manualSalesBaseValue: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        })
      }
    }

    goalDocs.filter((goalEntry) => !goalEntry.data.storeName && !goalEntry.data.groupName).forEach((goalEntry) => {
      const goal = goalEntry.data
      const currentValue = !shouldAutoSyncGoal(goal)
        ? calculateGoalCurrentValueWithManualBase(goal, sales, usersIndex)
        : calculateGoalCurrentValue(goal, sales, usersIndex)
      const metrics = buildGoalMetrics(goal, currentValue)
      addSyncedGoal(goalEntry, metrics)
    })

    goalDocs.filter((goalEntry) => goalEntry.data.storeName).forEach((goalEntry) => {
      const goal = goalEntry.data
      const currentValue = calculateStoreGoalCurrentValue(goal, updatedGoals, sales, usersIndex)
      const metrics = buildGoalMetrics(goal, currentValue)
      addSyncedGoal(goalEntry, metrics)
    })

    goalDocs.filter((goalEntry) => goalEntry.data.groupName).forEach((goalEntry) => {
      const goal = goalEntry.data
      const groupTotals = !shouldAutoSyncGoal(goal)
        ? { targetValue: Number(goal.targetValue || 0), currentValue: getGoalStoredCurrentValue(goal) }
        : calculateGroupGoalTotalsFromStoreGoals(goal, updatedGoals, registeredStoreNames)
      const metrics = buildGoalMetrics({ ...goal, targetValue: groupTotals.targetValue }, groupTotals.currentValue)
      metrics.targetValue = groupTotals.targetValue
      addSyncedGoal(goalEntry, metrics)
    })

    const localGoals = getLocalGoals().filter((goal) => goal.pendingSync)
    localGoals.forEach((goal) => {
      let currentValue = !shouldAutoSyncGoal(goal)
        ? calculateGoalCurrentValueWithManualBase(goal, sales, usersIndex)
        : calculateGoalCurrentValue(goal, sales, usersIndex)
      let goalForMetrics = goal
      if (goal.storeName) {
        currentValue = calculateStoreGoalCurrentValue(goal, updatedGoals, sales, usersIndex)
      } else if (goal.groupName) {
        const groupTotals = calculateGroupGoalTotalsFromStoreGoals(goal, updatedGoals, registeredStoreNames)
        currentValue = groupTotals.currentValue
        goalForMetrics = { ...goal, targetValue: groupTotals.targetValue }
      }
      const metrics = buildGoalMetrics(goalForMetrics, currentValue)
      if (goal.groupName) metrics.targetValue = goalForMetrics.targetValue
      updatedGoals.push({ ...goal, ...metrics })
    })

    const goalIndexes = buildGoalIndexes(updatedGoals)
    const commissionWrites = salesSnap.docs
      .map((saleDoc) => {
        const sale = { id: saleDoc.id, ...saleDoc.data() }
        const commissionPayload = calculateSaleCommission(sale, usersIndex, goalIndexes, upgradeCommissionRules)
        if (!hasCommissionChanged(sale, commissionPayload)) return null
        return {
          ref: saleDoc.ref,
          data: {
            ...commissionPayload,
            updatedCommissionAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        }
      })
      .filter(Boolean)

    const duplicateGoalDeletes = duplicateGoalDocs.map((goalEntry) => ({ ref: goalEntry.ref }))

    await commitBatchInChunks([...goalWrites, ...commissionWrites], (batch, item) => {
      batch.set(item.ref, item.data, { merge: true })
    })
    await commitBatchInChunks(duplicateGoalDeletes, (batch, item) => {
      batch.delete(item.ref)
    })

    syncLocalGoals()
  } catch (error) {
    if (rememberQuotaError(error)) {
      return syncLocalGoals()
    }
    throw error
  }
}

function syncLocalGoals() {
  const goals = getLocalGoals()
  const sales = getLocalSales()
  const usersIndex = getUsersIndexFromLocal()
  seedLocalCommissionRulesIfEmpty()
  const upgradeCommissionRules = getLocalCommissionRules().filter((rule) => rule.ativo)
  const registeredStoreNames = new Set(getCombinedLocalStores().map((store) => normalizeText(store.name)).filter(Boolean))
  const updatedGoals = []

  function buildSyncedLocalGoal(goal, currentValue, extraMetrics = {}) {
    const metrics = buildGoalMetrics(goal, currentValue)
    return buildLocalGoal({
      ...goal,
      ...metrics,
      ...extraMetrics,
      autoSync: shouldAutoSyncGoal(goal),
    }, goal.id)
  }

  goals.filter((goal) => !goal.storeName && !goal.groupName).forEach((goal) => {
    const currentValue = !shouldAutoSyncGoal(goal)
      ? calculateGoalCurrentValueWithManualBase(goal, sales, usersIndex)
      : calculateGoalCurrentValue(goal, sales, usersIndex)
    updatedGoals.push(buildSyncedLocalGoal(goal, currentValue))
  })

  goals.filter((goal) => goal.storeName).forEach((goal) => {
    const currentValue = calculateStoreGoalCurrentValue(goal, updatedGoals, sales, usersIndex)
    updatedGoals.push(buildSyncedLocalGoal(goal, currentValue))
  })

  goals.filter((goal) => goal.groupName).forEach((goal) => {
    const groupTotals = calculateGroupGoalTotalsFromStoreGoals(goal, updatedGoals, registeredStoreNames)
    updatedGoals.push(buildSyncedLocalGoal({ ...goal, targetValue: groupTotals.targetValue }, groupTotals.currentValue, {
      targetValue: groupTotals.targetValue,
    }))
  })
  const goalIndexes = buildGoalIndexes(updatedGoals)
  const updatedSales = sales.map((sale) => {
    const commissionPayload = calculateSaleCommission(sale, usersIndex, goalIndexes, upgradeCommissionRules)
    return buildLocalSale({
      ...sale,
      ...commissionPayload,
      updatedCommissionAt: new Date().toISOString(),
    }, sale.id)
  })

  saveLocalGoals(updatedGoals)
  saveLocalSales(updatedSales)
  return updatedGoals
}

async function getGoalsWithProgress(filter = {}) {
  let firestoreGoals = []
  let firestoreSales = []
  let duplicateGoalEntries = []
  let registeredStoreNames = new Set()
  let usersIndex = getUsersIndexFromLocal()
  const localGoalsSnapshot = getLocalGoals()
  const localSalesSnapshot = getLocalSales()
  const shouldUseLocalFirst = isFirestoreQuotaPaused()
    || localGoalsSnapshot.some((goal) => goal.pendingSync || goal.pendingDelete)
    || localSalesSnapshot.some((sale) => sale.pendingSync || sale.pendingDelete)

  if (!shouldUseLocalFirst) {
    try {
      const [goalsSnap, salesSnap, storesSnap, remoteUsersIndex] = await Promise.all([
        db.collection('goals').get(),
        db.collection('vendas').get(),
        db.collection('stores').get(),
        getUsersIndex(),
      ])
      const goalEntriesRaw = goalsSnap.docs.map((docSnap) => ({
        ref: docSnap.ref,
        id: docSnap.id,
        data: { id: docSnap.id, ...docSnap.data() },
      }))
      const dedupedGoalEntries = dedupeGoalEntriesByLogicalKey(goalEntriesRaw)
      duplicateGoalEntries = dedupedGoalEntries.duplicateEntries
      firestoreGoals = dedupedGoalEntries.canonicalEntries.map((entry) => entry.data)
      firestoreSales = salesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      registeredStoreNames = new Set(storesSnap.docs.map((doc) => normalizeText(doc.data().name)).filter(Boolean))
      usersIndex = remoteUsersIndex
    } catch (error) {
      if (!rememberQuotaError(error)) throw error
      console.warn('Cota do Firestore excedida ao listar metas. Usando cache local.')
    }
  }

  const byKey = new Map()
  firestoreGoals.forEach((goal) => {
    const key = getGoalLocalKey(goal)
    byKey.set(key, pickCanonicalGoal(byKey.get(key), goal))
  })
  localGoalsSnapshot.forEach((goal) => {
    const key = getGoalLocalKey(goal)
    if (goal.pendingSync || !byKey.has(key)) byKey.set(key, pickCanonicalGoal(byKey.get(key), goal))
  })

  const sales = [
    ...firestoreSales,
    ...localSalesSnapshot.filter((sale) => sale.pendingSync || shouldUseLocalFirst),
  ]
  const goalWrites = []
  const allGoals = dedupeGoalsByLogicalKey([...byKey.values()])
  const goalsWithProgress = []

  function buildProgressGoal(goal) {
      const calendarFields = resolveGoalCalendarFields(goal)
      let currentValue = getGoalStoredCurrentValue(goal)
      if (goal.storeName) {
        currentValue = calculateStoreGoalCurrentValue(goal, goalsWithProgress, sales, usersIndex)
      } else if (!shouldAutoSyncGoal(goal)) {
        currentValue = calculateGoalCurrentValueWithManualBase(goal, sales, usersIndex)
      } else if (shouldAutoSyncGoal(goal)) {
        if (goal.groupName) {
          const groupTotals = calculateGroupGoalTotalsFromStoreGoals(goal, goalsWithProgress, registeredStoreNames)
          goal = { ...goal, targetValue: groupTotals.targetValue }
          currentValue = groupTotals.currentValue
        } else if (sales.length) {
          currentValue = calculateGoalCurrentValue(goal, sales, usersIndex)
        }
      }
      const metrics = buildGoalMetrics({ ...goal, ...calendarFields }, currentValue)
      if (!String(goal.id || '').startsWith('local-goal-') && hasGoalMetricsChanged(goal, metrics)) {
        goalWrites.push({
          ref: db.collection('goals').doc(goal.id),
          data: {
            ...metrics,
            autoSync: true,
            manualRealized: false,
            manualCurrentValue: admin.firestore.FieldValue.delete(),
            manualSalesBaseValue: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        })
      }
      return {
        ...goal,
        ...calendarFields,
        ...metrics,
      }
  }

  allGoals.filter((goal) => !goal.storeName && !goal.groupName).forEach((goal) => {
    goalsWithProgress.push(buildProgressGoal(goal))
  })
  allGoals.filter((goal) => goal.storeName).forEach((goal) => {
    goalsWithProgress.push(buildProgressGoal(goal))
  })
  allGoals.filter((goal) => goal.groupName).forEach((goal) => {
    goalsWithProgress.push(buildProgressGoal(goal))
  })

  const goals = goalsWithProgress
    .filter((goal) => {
      if (filter.type && goal.type !== filter.type) return false
      if (filter.userId && goal.userId !== filter.userId) return false
      if (filter.managerId && goal.managerId !== filter.managerId) return false
      if (filter.storeName && normalizeText(goal.storeName) !== normalizeText(filter.storeName)) return false
      if (filter.groupName && normalizeText(goal.groupName) !== normalizeText(filter.groupName)) return false
      if (filter.month && Number(goal.month) !== Number(filter.month)) return false
      if (filter.year && Number(goal.year) !== Number(filter.year)) return false
      return true
    })
    .sort((a, b) => (Number(b.year) - Number(a.year)) || (Number(b.month) - Number(a.month)))

  if (goalWrites.length && !isFirestoreQuotaPaused()) {
    await commitBatchInChunks(goalWrites, (batch, item) => {
      batch.set(item.ref, item.data, { merge: true })
    }).catch((error) => {
      if (!rememberQuotaError(error)) throw error
      syncLocalGoals()
    })
  }
  if (duplicateGoalEntries.length && !isFirestoreQuotaPaused()) {
    await commitBatchInChunks(duplicateGoalEntries, (batch, item) => {
      batch.delete(item.ref)
    }).catch((error) => {
      if (!rememberQuotaError(error)) throw error
      syncLocalGoals()
    })
  }

  return goals
}

function getProjectedGoalPercent(goal = {}) {
  const target = Number(goal.targetValue || 0)
  if (!target) return 0
  const current = Number(goal.currentValue || 0)
  const businessDays = Number(goal.businessDaysCount || 0)
  const remainingBusinessDays = Number(goal.remainingBusinessDays || 0)
  const elapsedBusinessDays = Math.max(0, businessDays - remainingBusinessDays)
  const projectedValue = businessDays > 0 && elapsedBusinessDays > 0
    ? (current / elapsedBusinessDays) * businessDays
    : current
  return Math.round((projectedValue / target) * 100)
}

function getGoalRankTimestamp(goal = {}) {
  const value = goal.updatedAt || goal.createdAt || ''
  if (value?.seconds) return value.seconds * 1000
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function pickRankingGoal(current, next) {
  if (!current) return next
  const currentHasTarget = Number(current.targetValue || 0) > 0
  const nextHasTarget = Number(next.targetValue || 0) > 0
  if (nextHasTarget !== currentHasTarget) return nextHasTarget ? next : current
  const currentTime = getGoalRankTimestamp(current)
  const nextTime = getGoalRankTimestamp(next)
  if (nextTime !== currentTime) return nextTime > currentTime ? next : current
  return getProjectedGoalPercent(next) > getProjectedGoalPercent(current) ? next : current
}

function buildProjectedRanking(goals = [], entityResolver) {
  const grouped = new Map()
  goals.forEach((goal) => {
    if (!GOAL_TYPES.includes(goal.type)) return
    const entity = entityResolver(goal)
    if (!entity?.id) return
    const current = grouped.get(entity.id) || {
      id: entity.id,
      name: entity.name,
      goalsByType: new Map(),
    }
    current.goalsByType.set(goal.type, pickRankingGoal(current.goalsByType.get(goal.type), goal))
    grouped.set(entity.id, current)
  })

  return [...grouped.values()]
    .map((entity) => {
      const goalsByType = entity.goalsByType
      const activeGoals = GOAL_TYPES.map((type) => goalsByType.get(type)).filter((goal) => Number(goal?.targetValue || 0) > 0)
      const projectedPercentSum = GOAL_TYPES.reduce((sum, type) => sum + getProjectedGoalPercent(goalsByType.get(type) || {}), 0)
      const currentPercentSum = GOAL_TYPES.reduce((sum, type) => {
        const goal = goalsByType.get(type) || {}
        const target = Number(goal.targetValue || 0)
        return sum + (target ? Math.round((Number(goal.currentValue || 0) / target) * 100) : 0)
      }, 0)
      return {
        id: entity.id,
        name: entity.name,
        items: GOAL_TYPES.length,
        activeGoals: activeGoals.length,
        achieved: activeGoals.filter((goal) => getProjectedGoalPercent(goal) >= 100).length,
        percent: Math.round(projectedPercentSum / GOAL_TYPES.length),
        currentPercent: Math.round(currentPercentSum / GOAL_TYPES.length),
      }
    })
    .sort((a, b) => b.percent - a.percent || b.achieved - a.achieved || a.name.localeCompare(b.name, 'pt-BR'))
    .map((item, index) => ({ ...item, position: index + 1 }))
}

function buildGoalRankings(goals = [], req) {
  const sellerRanking = buildProjectedRanking(
    goals.filter((goal) => goal.userId && !goal.storeName && !goal.groupName),
    (goal) => ({
      id: goal.userId,
      name: goal.userName || getLocalUserProfilesMap().get(goal.userId)?.name || 'Vendedor',
    }),
  )
  const storeRanking = buildProjectedRanking(
    goals.filter((goal) => goal.storeName && !goal.userId && !goal.groupName),
    (goal) => ({
      id: normalizeText(goal.storeName),
      name: goal.storeName || 'Loja',
    }),
  )
  const groupRanking = buildProjectedRanking(
    goals.filter((goal) => goal.groupName && !goal.userId),
    (goal) => ({
      id: normalizeText(goal.groupName),
      name: goal.groupName || ECONOMIC_GROUP_NAME,
    }),
  )

  if (normalizeRole(req.actorRole) !== 'Vendedor') {
    return {
      sellers: sellerRanking.slice(0, 10),
      stores: storeRanking.slice(0, 10),
      groups: groupRanking.slice(0, 10),
      updatedAt: new Date().toISOString(),
    }
  }

  const ownSellerId = req.currentUser?.uid
  const topThree = sellerRanking.slice(0, 3)
  const ownPosition = sellerRanking.find((item) => item.id === ownSellerId) || null
  const sellers = ownPosition && !topThree.some((item) => item.id === ownPosition.id)
    ? [...topThree, { ...ownPosition, separated: true }]
    : topThree

  return {
    sellers,
    stores: [],
    groups: [],
    ownPosition,
    updatedAt: new Date().toISOString(),
  }
}

function getDistributedGoalTarget(total, count, index) {
  const target = Number(total || 0)
  if (!count) return 0
  const share = Number((target / count).toFixed(2))
  if (index < count - 1) return share
  return Number((target - (share * (count - 1))).toFixed(2))
}

function getLocalSellersForStore(storeName) {
  const storeKey = normalizeText(storeName)
  if (!storeKey) return []
  return getLocalUsersList()
    .filter((user) => !user.disabled && ['Vendedor', 'Executivo'].includes(normalizeRole(user.role)))
    .filter((user) => normalizeText(user.storeName || user.store || user.loja) === storeKey)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
}

async function getSellersForStore(storeName) {
  const storeKey = normalizeText(storeName)
  if (!storeKey) return []
  const byId = new Map()
  getLocalSellersForStore(storeName).forEach((seller) => {
    byId.set(seller.uid || seller.id || seller.email, seller)
  })

  if (!isFirestoreQuotaPaused()) {
    try {
      const snap = await db.collection('users').get()
      snap.docs
        .map((docSnap) => buildCachedUserProfile({ id: docSnap.id, ...docSnap.data() }))
        .filter((user) => !user.disabled && ['Vendedor', 'Executivo'].includes(normalizeRole(user.role)))
        .filter((user) => normalizeText(user.storeName || user.store || user.loja) === storeKey)
        .forEach((seller) => {
          byId.set(seller.uid || seller.id || seller.email, seller)
        })
    } catch (error) {
      rememberQuotaError(error)
      console.warn('Não foi possível carregar vendedores da loja pelo Firestore. Usando cache local.', error.message || error)
    }
  }

  return [...byId.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
}

function getStableGoalId(parts = []) {
  return `local-goal-${parts
    .map((part) => normalizeText(part).replace(/[^a-z0-9]+/g, '-'))
    .filter(Boolean)
    .join('-')}`
}

function findExistingGoal(goals, matcher) {
  return goals.find(matcher) || null
}

async function getUserByEmail(email) {
  if (!email) return null
  const localUser = getLocalUserByEmail(email)
  if (localUser) return localUser
  if (isFirestoreQuotaPaused()) return null

  const snap = await db.collection('users').where('email', '==', email).limit(1).get()
  if (snap.empty) return null
  return snap.docs[0].data()
}

async function buildSalePayload(data, includeTimestamp = true, options = {}) {
  const dependentSale = isDependentSale(data)
  const upgradeSale = data.saleType === 'Upgrade'
  const amount = dependentSale || upgradeSale ? 0 : Number(data.amount || data.accessoryValue || data.planValue || 0)
  const planValue = data.planValue !== undefined && data.planValue !== ''
    ? dependentSale || upgradeSale ? 0 : Number(data.planValue || 0)
    : upgradeSale ? 0 : Number(data.amount || 0)
  const sellerEmail = data.seller || ''
  const user = await getUserByEmail(sellerEmail)
  const saleDate = data.saleDate || ''
  const saleTime = normalizeSaleTime(data.saleTime)
  const saleDateValue = getSaleDateValue(saleDate, saleTime)
  const saleDateTimestamp = saleDateValue && !Number.isNaN(saleDateValue.getTime())
    ? admin.firestore.Timestamp.fromDate(saleDateValue)
    : null
  const now = new Date().toISOString()
  const payload = {
    ...data,
    amount,
    saleTime,
    planValue: isAccessorySale(data) ? '' : Number.isFinite(planValue) ? planValue : 0,
    storeName: data.storeName || user?.storeName || user?.store || user?.loja || '',
    storeCity: data.storeCity || user?.storeCity || user?.city || user?.cidade || '',
    storeState: data.storeState || user?.storeState || user?.state || user?.estado || '',
    sellerRegistration: data.sellerRegistration || data.sellerMatricula || user?.registration || user?.matricula || user?.employeeId || '',
    sellerMatricula: data.sellerRegistration || data.sellerMatricula || user?.registration || user?.matricula || user?.employeeId || '',
    dependentCount: getDependentCount(data),
    commissionRate: Number(data.commissionRate || 0),
    commission: Number(data.commission || 0),
    storeCommission: Number(data.storeCommission || 0),
    commissionDetails: data.commissionDetails || {},
    insuranceValue: data.insurance === 'Sim' || data.seguro === 'Sim' ? Number(data.insuranceValue || data.seguroValue || 0) : '',
  }

  if (options.local) {
    if (includeTimestamp) {
      payload.createdAt = saleDateValue && !Number.isNaN(saleDateValue.getTime()) ? saleDateValue.toISOString() : now
    } else {
      payload.updatedAt = now
    }
  } else if (includeTimestamp) {
    payload.createdAt = saleDateTimestamp || admin.firestore.FieldValue.serverTimestamp()
  } else {
    payload.updatedAt = admin.firestore.FieldValue.serverTimestamp()
  }

  return payload
}

function saleCreatedDate(sale) {
  if (sale.saleDate) {
    const date = new Date(`${sale.saleDate}T12:00:00`)
    if (!Number.isNaN(date.getTime())) return date
  }
  if (sale.createdAt?.toDate) return sale.createdAt.toDate()
  if (sale.createdAt) {
    const date = new Date(sale.createdAt)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

function filterSalesRows(sales, query, req) {
  const { cpf, seller, userId, userEmail, status, saleType, fromDate, toDate } = query
  const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null
  const to = toDate ? new Date(`${toDate}T23:59:59`) : null
  const usersIndex = getUsersIndexFromLocal()

  return sortSales(sales)
    .filter((sale) => {
      const createdAt = saleCreatedDate(sale)
      if (!canAccessSale(req, sale, usersIndex)) return false
      if (cpf && sale.cpf !== cpf) return false
      if (userId || userEmail) {
        const matchesCurrentUser = (userId && sale.userId === userId)
          || (userEmail && (sale.userEmail === userEmail || sale.seller === userEmail))
          || (seller && sale.seller === seller)
        if (!matchesCurrentUser) return false
      } else if (seller && sale.seller !== seller) {
        return false
      }
      if (status && sale.status !== status) return false
      if (saleType && sale.saleType !== saleType) return false
      if (from && (!createdAt || createdAt < from)) return false
      if (to && (!createdAt || createdAt > to)) return false
      return true
    })
}

function serializeDoc(doc) {
  const data = doc.data()
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
  }
}

function parseSemicolonCsvLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ';' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }

    current += char
  }

  values.push(current)
  return values
}

function normalizeSearchValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function mapFiberCoverageRow(headers, values) {
  const row = {}
  headers.forEach((header, index) => {
    row[header] = values[index] || ''
  })

  return {
    referenceDate: row.DT_REF,
    uf: row.UF,
    city: row.MUNICIPIO,
    cep: row.CEP,
    street: row.LOGRADOURO,
    number: row.NUM_LOGRADOURO,
    complement: [
      row.COMPLEMENTO,
      row.COMPLEMENTO2,
      row.COMPLEMENTO3,
      row.COMPLEMENTO4,
      row.COMPLEMENTO5,
    ].filter(Boolean).join(' '),
    neighborhood: row.BAIRRO,
    households: Number(row.QTD_HH || 0),
    latitude: row.LATITUDE,
    longitude: row.LONGITUDE,
    viabilityCode: row.VIABILIDADE,
    viability: row.MOTIVO,
    lotType: row.TIPO_LOTE,
    infraProvider: row.INFRACO_PRINCIPAL,
    olt: row.OLT,
    oltSegmentation: row.SEGMENTACAO_OLT,
    capacityBlocked: row.BLOQ_CAPACITY,
    capacityReason: row.MOTIVO_CAPACITY,
  }
}

function validateFiberCoverageHeaders(headers) {
  const normalized = new Set(headers.map((header) => normalizeSearchValue(header)))
  return FIBER_REQUIRED_HEADERS.filter((header) => !normalized.has(normalizeSearchValue(header)))
}

function getFiberCoverageFileStatus() {
  if (!fs.existsSync(FIBER_COVERAGE_FILE)) {
    return {
      active: false,
      status: 'missing',
      file: FIBER_COVERAGE_FILE,
      message: 'Base de viabilidade de fibra não encontrada no servidor.',
    }
  }

  const stat = fs.statSync(FIBER_COVERAGE_FILE)
  return {
    active: true,
    status: stat.size > 0 ? 'active' : 'empty',
    file: FIBER_COVERAGE_FILE,
    sizeBytes: stat.size,
    updatedAt: stat.mtime.toISOString(),
  }
}

function createFiberLocalBackup(reason = 'manual-clear') {
  const backupStamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(DATA_DIR, 'fiber-backups', backupStamp)
  fs.mkdirSync(backupDir, { recursive: true })
  const manifest = {
    createdAt: new Date().toISOString(),
    reason,
    activeFile: FIBER_COVERAGE_FILE,
    backupFile: '',
    status: 'archived',
  }

  if (fs.existsSync(FIBER_COVERAGE_FILE)) {
    manifest.backupFile = path.join(backupDir, 'fiber-coverage.previous.csv')
    fs.copyFileSync(FIBER_COVERAGE_FILE, manifest.backupFile)
  }
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}

async function deleteCollectionInBatches(collectionName, batchSize = 400) {
  let deleted = 0
  while (true) {
    const snap = await db.collection(collectionName).limit(batchSize).get()
    if (snap.empty) break
    const batch = db.batch()
    snap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref)
    })
    await batch.commit()
    deleted += snap.size
    if (snap.size < batchSize) break
  }
  return deleted
}

function fiberRowMatches(row, filters) {
  if (filters.city && !normalizeSearchValue(row.city).includes(filters.city)) return false
  if (filters.cep && !onlyDigits(row.cep).startsWith(filters.cep)) return false
  if (filters.street && !normalizeSearchValue(row.street).includes(filters.street)) return false
  if (filters.number && onlyDigits(row.number) !== filters.number) return false
  if (filters.neighborhood && !normalizeSearchValue(row.neighborhood).includes(filters.neighborhood)) return false
  return true
}

async function searchFiberCoverage(filters, limit = 100) {
  const fileStatus = getFiberCoverageFileStatus()
  if (!fileStatus.active || fileStatus.status === 'empty') {
    throw new Error(fileStatus.message || 'Base de viabilidade de fibra vazia ou indisponível.')
  }

  const matches = []
  let totalMatches = 0
  let scannedRows = 0
  let headers = []
  const startedAt = Date.now()
  const rl = readline.createInterface({
    input: fs.createReadStream(FIBER_COVERAGE_FILE),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!headers.length) {
      headers = parseSemicolonCsvLine(line).map((header) => header.replace(/^\uFEFF/, ''))
      const missingHeaders = validateFiberCoverageHeaders(headers)
      if (missingHeaders.length) {
        throw new Error(`Base de fibra com colunas obrigatórias ausentes: ${missingHeaders.join(', ')}.`)
      }
      continue
    }

    if (!line.trim()) continue
    scannedRows += 1
    const row = mapFiberCoverageRow(headers, parseSemicolonCsvLine(line))
    if (!fiberRowMatches(row, filters)) continue
    totalMatches += 1
    if (matches.length < limit) matches.push(row)
  }

  return {
    rows: matches,
    totalMatches,
    scannedRows,
    limit,
    elapsedMs: Date.now() - startedAt,
  }
}

async function getFiberCoverageCities() {
  const fileStatus = getFiberCoverageFileStatus()
  if (!fileStatus.active || fileStatus.status === 'empty') {
    throw new Error(fileStatus.message || 'Base de viabilidade de fibra vazia ou indisponível.')
  }

  const stat = fs.statSync(FIBER_COVERAGE_FILE)
  if (fiberCitiesCache.cities.length && fiberCitiesCache.mtimeMs === stat.mtimeMs) {
    return fiberCitiesCache.cities
  }

  const byKey = new Map()
  let headers = []
  const rl = readline.createInterface({
    input: fs.createReadStream(FIBER_COVERAGE_FILE),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!headers.length) {
      headers = parseSemicolonCsvLine(line).map((header) => header.replace(/^\uFEFF/, ''))
      const missingHeaders = validateFiberCoverageHeaders(headers)
      if (missingHeaders.length) {
        throw new Error(`Base de fibra com colunas obrigatórias ausentes: ${missingHeaders.join(', ')}.`)
      }
      continue
    }

    if (!line.trim()) continue
    const values = parseSemicolonCsvLine(line)
    const city = values[headers.indexOf('MUNICIPIO')] || ''
    const uf = values[headers.indexOf('UF')] || ''
    const key = `${normalizeSearchValue(city)}|${normalizeSearchValue(uf)}`
    if (city && !byKey.has(key)) {
      byKey.set(key, { city, uf, label: uf ? `${city} / ${uf}` : city })
    }
  }

  const cities = [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  fiberCitiesCache = { mtimeMs: stat.mtimeMs, cities }
  return cities
}

app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true })
})

app.use('/api', authenticateRequest)

app.get('/api/fiber-viability/cities', async (req, res) => {
  try {
    const cities = await getFiberCoverageCities()
    res.status(200).json(cities)
  } catch (error) {
    console.error('Erro ao carregar cidades de viabilidade de fibra:', error)
    res.status(500).json({ message: error.message || 'Não foi possível carregar as cidades da base de fibra.' })
  }
})

app.get('/api/fiber-viability/diagnostics', async (req, res) => {
  try {
    const fileStatus = getFiberCoverageFileStatus()
    const diagnostics = {
      localBase: fileStatus,
      cachedCities: fiberCitiesCache.cities.length,
      checkedAt: new Date().toISOString(),
    }

    if (fileStatus.active) {
      const rl = readline.createInterface({
        input: fs.createReadStream(FIBER_COVERAGE_FILE),
        crlfDelay: Infinity,
      })
      for await (const line of rl) {
        const headers = parseSemicolonCsvLine(line).map((header) => header.replace(/^\uFEFF/, ''))
        diagnostics.localBase.missingColumns = validateFiberCoverageHeaders(headers)
        diagnostics.localBase.status = diagnostics.localBase.missingColumns.length ? 'invalid-columns' : fileStatus.status
        break
      }
    }

    res.status(200).json(diagnostics)
  } catch (error) {
    console.error('Erro ao diagnosticar base de fibra:', error)
    res.status(500).json({ message: error.message || 'Não foi possível diagnosticar a base de fibra.' })
  }
})

app.post('/api/fiber-viability/clear', async (req, res) => {
  try {
    if (normalizeRole(req.actorRole) !== 'Administrador') {
      return res.status(403).json({ message: 'Apenas Administrador pode limpar a base de fibra.' })
    }

    if (req.body?.confirmation !== 'LIMPAR BASE FIBRA') {
      return res.status(400).json({ message: 'Confirmação inválida. Digite LIMPAR BASE FIBRA para continuar.' })
    }

    const backup = createFiberLocalBackup('admin-clear-fiber-base')
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(FIBER_COVERAGE_FILE, `${FIBER_CANONICAL_HEADERS.join(';')}\n`)
    fiberCitiesCache = { mtimeMs: 0, cities: [] }

    const deletedByCollection = {}
    for (const collectionName of FIBER_COVERAGE_COLLECTIONS) {
      deletedByCollection[collectionName] = await deleteCollectionInBatches(collectionName)
    }

    const totalDeleted = Object.values(deletedByCollection).reduce((sum, value) => sum + value, 0)
    try {
      await db.collection('importHistory').add({
        target: 'viabilidade_fibra',
        targetCollection: 'viabilidade_fibra',
        fileName: 'Limpeza manual da base de fibra',
        userId: req.currentUser.uid || '',
        userName: req.currentUser.name || req.currentUser.email || 'Administrador',
        userEmail: req.currentUser.email || '',
        status: 'base-limpa',
        action: 'clear-fiber-base',
        importedRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicateRows: 0,
        deletedRows: totalDeleted,
        deletedByCollection,
        backup,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        finishedAt: new Date().toISOString(),
      })
    } catch (historyError) {
      console.warn('Base de fibra limpa, mas não foi possível registrar histórico:', historyError.message || historyError)
    }

    res.status(200).json({
      message: 'Base de fibra limpa com backup criado.',
      deletedRows: totalDeleted,
      deletedByCollection,
      backup,
      localBase: getFiberCoverageFileStatus(),
    })
  } catch (error) {
    console.error('Erro ao limpar base de fibra:', error)
    res.status(500).json({ message: error.message || 'Não foi possível limpar a base de fibra.' })
  }
})

app.get('/api/fiber-viability', async (req, res) => {
  try {
    const filters = {
      city: normalizeSearchValue(req.query.city),
      cep: onlyDigits(req.query.cep),
      street: normalizeSearchValue(req.query.street),
      number: onlyDigits(req.query.number),
      neighborhood: normalizeSearchValue(req.query.neighborhood),
    }
    const hasFilter = Object.values(filters).some(Boolean)

    if (!hasFilter) {
      return res.status(200).json({
        rows: [],
        totalMatches: 0,
        scannedRows: 0,
        limit: 100,
        elapsedMs: 0,
        message: 'Informe ao menos cidade, CEP, rua ou número para pesquisar.',
      })
    }

    const limit = Math.min(300, Math.max(1, Number(req.query.limit || 100)))
    const result = await searchFiberCoverage(filters, limit)
    res.status(200).json(result)
  } catch (error) {
    console.error('Erro ao consultar viabilidade de fibra:', error)
    res.status(500).json({ message: error.message || 'Não foi possível consultar a viabilidade de fibra.' })
  }
})

app.get('/api/calendar', async (req, res) => {
  try {
    const {
      month,
      year,
      userId = '',
      storeName = '',
      groupName = '',
      storeCity = '',
      storeState = '',
    } = req.query

    if (!month || !year) {
      return res.status(400).json({ message: 'month and year are required' })
    }

    const calendarFields = resolveGoalCalendarFields({ userId, storeName, groupName, storeCity, storeState })
    const metrics = buildGoalMetrics({
      targetValue: 0,
      currentValue: 0,
      month,
      year,
      groupName,
      ...calendarFields,
    }, 0)

    res.status(200).json({
      month: Number(month),
      year: Number(year),
      userId,
      storeName,
      groupName,
      ...calendarFields,
      businessDaysCount: metrics.businessDaysCount,
      remainingBusinessDays: metrics.remainingBusinessDays,
      holidayCount: metrics.holidayCount,
      holidays: metrics.holidays,
      calendarCity: metrics.calendarCity,
      calendarState: metrics.calendarState,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/commission-rules', async (req, res) => {
  try {
    if (!canManageCommissionRules(req.actorRole)) {
      return res.status(403).json({ message: 'Sem permissão para gerenciar regras de comissão.' })
    }

    if (isFirestoreQuotaPaused()) {
      seedLocalCommissionRulesIfEmpty()
      return res.status(200).json(getLocalCommissionRules())
    }

    await ensureDefaultCommissionRules()
    const rules = await getCommissionRulesFromFirestore()
    saveLocalCommissionRules(rules)
    res.status(200).json(sortCommissionRules(rules))
  } catch (error) {
    if (rememberQuotaError(error)) {
      seedLocalCommissionRulesIfEmpty()
      return res.status(200).json(getLocalCommissionRules())
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/commission-rules', async (req, res) => {
  try {
    if (!canManageCommissionRules(req.body.actorRole || req.actorRole)) {
      return res.status(403).json({ message: 'Sem permissão para cadastrar regras de comissão.' })
    }

    const rule = sanitizeCommissionRulePayload(req.body)
    if (isFirestoreQuotaPaused()) {
      const localRule = upsertLocalCommissionRule({ ...rule, pendingSync: true })
      return res.status(201).json(localRule)
    }

    const ref = db.collection('commissionRules').doc()
    await ref.set({
      ...rule,
      id: ref.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    const snap = await ref.get()
    const savedRule = buildCommissionRule({ id: snap.id, ...snap.data() }, snap.id)
    upsertLocalCommissionRule(savedRule)
    await syncGoals().catch((error) => {
      if (!rememberQuotaError(error)) throw error
      syncLocalGoals()
    })
    res.status(201).json(savedRule)
  } catch (error) {
    if (rememberQuotaError(error)) {
      const localRule = upsertLocalCommissionRule({ ...req.body, pendingSync: true })
      return res.status(201).json(localRule)
    }
    console.error(error)
    res.status(error.message?.includes('required') ? 400 : 500).json({ message: error.message })
  }
})

app.put('/api/commission-rules/:id', async (req, res) => {
  try {
    if (!canManageCommissionRules(req.body.actorRole || req.actorRole)) {
      return res.status(403).json({ message: 'Sem permissão para editar regras de comissão.' })
    }

    const rule = sanitizeCommissionRulePayload({ ...req.body, id: req.params.id })
    if (isFirestoreQuotaPaused() || req.params.id.startsWith('local-rule-') || req.params.id.startsWith('default-upgrade-rule-')) {
      const localRule = upsertLocalCommissionRule({ ...rule, id: req.params.id, pendingSync: true })
      syncLocalGoals()
      return res.status(200).json(localRule)
    }

    const ref = db.collection('commissionRules').doc(req.params.id)
    const snapBefore = await ref.get()
    if (!snapBefore.exists) return res.status(404).json({ message: 'Regra de comissão não encontrada.' })
    await ref.set({
      ...rule,
      id: req.params.id,
      createdAt: snapBefore.data().createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
    const snap = await ref.get()
    const savedRule = buildCommissionRule({ id: snap.id, ...snap.data() }, snap.id)
    upsertLocalCommissionRule(savedRule)
    await syncGoals().catch((error) => {
      if (!rememberQuotaError(error)) throw error
      syncLocalGoals()
    })
    res.status(200).json(savedRule)
  } catch (error) {
    if (rememberQuotaError(error)) {
      const localRule = upsertLocalCommissionRule({ ...req.body, id: req.params.id, pendingSync: true })
      syncLocalGoals()
      return res.status(200).json(localRule)
    }
    console.error(error)
    res.status(error.message?.includes('required') ? 400 : 500).json({ message: error.message })
  }
})

app.delete('/api/commission-rules/:id', async (req, res) => {
  try {
    if (!canManageCommissionRules(req.body.actorRole || req.actorRole)) {
      return res.status(403).json({ message: 'Sem permissão para excluir regras de comissão.' })
    }

    if (isFirestoreQuotaPaused() || req.params.id.startsWith('local-rule-') || req.params.id.startsWith('default-upgrade-rule-')) {
      removeLocalCommissionRule(req.params.id)
      syncLocalGoals()
      return res.status(200).json({ ok: true })
    }

    await db.collection('commissionRules').doc(req.params.id).delete()
    removeLocalCommissionRule(req.params.id)
    await syncGoals().catch((error) => {
      if (!rememberQuotaError(error)) throw error
      syncLocalGoals()
    })
    res.status(200).json({ ok: true })
  } catch (error) {
    if (rememberQuotaError(error)) {
      removeLocalCommissionRule(req.params.id)
      syncLocalGoals()
      return res.status(200).json({ ok: true })
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/vendas', async (req, res) => {
  try {
    if (isFirestoreQuotaPaused() || getLocalSales().length) {
      return res.status(200).json(filterSalesRows(getLocalSales(), req.query, req))
    }

    const snap = await db.collection('vendas').orderBy('createdAt', 'desc').get()
    const rows = filterSalesRows([
      ...snap.docs.map(serializeDoc),
      ...getLocalSales().filter((sale) => sale.pendingSync),
    ], req.query, req)

    res.status(200).json(rows)
  } catch (error) {
    if (rememberQuotaError(error)) {
      console.warn('Cota do Firestore excedida ao listar vendas. Usando cache local.')
      return res.status(200).json(filterSalesRows(getLocalSales(), req.query, req))
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/vendas', async (req, res) => {
  try {
    const requestBody = buildActorSaleBody(req)
    const validationError = validateSalePayload(requestBody)
    if (validationError) return res.status(400).json({ message: validationError })

    if (isFirestoreQuotaPaused()) {
      const payload = await buildSalePayload(requestBody, true, { local: true })
      if (!canManageSale(req, payload)) {
        return res.status(403).json({ message: 'Gerente só pode cadastrar vendas da própria loja.' })
      }
      const sale = upsertLocalSale({ ...payload, pendingSync: true })
      syncLocalGoals()
      const syncedSale = getLocalSales({ includeDeleted: true }).find((item) => item.id === sale.id) || sale
      return res.status(201).json(syncedSale)
    }

    const payload = await buildSalePayload(requestBody)
    if (!canManageSale(req, payload)) {
      return res.status(403).json({ message: 'Gerente só pode cadastrar vendas da própria loja.' })
    }
    const ref = await db.collection('vendas').add(payload)
    let snap = await ref.get()
    let sale = serializeDoc(snap)
    upsertLocalSale(sale)
    await syncGoals().catch((error) => {
      if (!rememberQuotaError(error)) throw error
      console.warn('Venda salva, mas metas foram sincronizadas pelo cache local.', error.message || error)
      syncLocalGoals()
    })
    snap = await ref.get()
    sale = serializeDoc(snap)
    upsertLocalSale(sale)
    res.status(201).json(sale)
  } catch (error) {
    if (rememberQuotaError(error)) {
      const fallbackBody = buildActorSaleBody(req)
      const payload = await buildSalePayload(fallbackBody, true, { local: true })
      if (!canManageSale(req, payload)) {
        return res.status(403).json({ message: 'Gerente só pode cadastrar vendas da própria loja.' })
      }
      const sale = upsertLocalSale({ ...payload, pendingSync: true })
      syncLocalGoals()
      const syncedSale = getLocalSales({ includeDeleted: true }).find((item) => item.id === sale.id) || sale
      return res.status(201).json(syncedSale)
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.put('/api/vendas/:id', async (req, res) => {
  try {
    const localSale = getLocalSales({ includeDeleted: true }).find((sale) => sale.id === req.params.id)
    if (isFirestoreQuotaPaused() || localSale) {
      if (!localSale) {
        return res.status(404).json({ message: 'Venda não encontrada.' })
      }
      if (!canManageSale(req, localSale)) {
        return res.status(403).json({ message: 'Sem permissão para editar esta venda.' })
      }
      const requestBody = buildActorSaleBody(req, localSale)
      const validationError = validateSalePayload(requestBody)
      if (validationError) return res.status(400).json({ message: validationError })
      const payload = await buildSalePayload(requestBody, false, { local: true })
      if (!canManageSale(req, { ...localSale, ...payload })) {
        return res.status(403).json({ message: 'Gerente só pode editar vendas da própria loja.' })
      }
      const sale = upsertLocalSale({
        ...localSale,
        ...payload,
        createdAt: localSale.createdAt,
        pendingSync: true,
      })
      syncLocalGoals()
      const syncedSale = getLocalSales({ includeDeleted: true }).find((item) => item.id === sale.id) || sale
      return res.status(200).json(syncedSale)
    }

    const ref = db.collection('vendas').doc(req.params.id)
    const currentSnap = await ref.get()
    if (!currentSnap.exists) {
      return res.status(404).json({ message: 'Venda não encontrada.' })
    }

    const currentSale = { id: currentSnap.id, ...currentSnap.data() }
    if (!canManageSale(req, currentSale)) {
      return res.status(403).json({ message: 'Sem permissão para editar esta venda.' })
    }

    const requestBody = buildActorSaleBody(req, currentSale)
    const validationError = validateSalePayload(requestBody)
    if (validationError) return res.status(400).json({ message: validationError })

    const payload = await buildSalePayload(requestBody, false)
    if (!canManageSale(req, { ...currentSale, ...payload })) {
      return res.status(403).json({ message: 'Gerente só pode editar vendas da própria loja.' })
    }
    await ref.update(payload)
    let snap = await ref.get()
    let sale = serializeDoc(snap)
    upsertLocalSale(sale)
    await syncGoals().catch((error) => {
      if (!rememberQuotaError(error)) throw error
      syncLocalGoals()
    })
    snap = await ref.get()
    sale = serializeDoc(snap)
    upsertLocalSale(sale)
    res.status(200).json(sale)
  } catch (error) {
    if (rememberQuotaError(error)) {
      const localSale = getLocalSales({ includeDeleted: true }).find((sale) => sale.id === req.params.id)
      if (!localSale) return res.status(404).json({ message: 'Venda não encontrada no cache local.' })
      if (!canManageSale(req, localSale)) {
        return res.status(403).json({ message: 'Sem permissão para editar esta venda.' })
      }
      const payload = await buildSalePayload({ ...localSale, ...req.body }, false, { local: true })
      const sale = upsertLocalSale({ ...localSale, ...payload, createdAt: localSale.createdAt, pendingSync: true })
      syncLocalGoals()
      const syncedSale = getLocalSales({ includeDeleted: true }).find((item) => item.id === sale.id) || sale
      return res.status(200).json(syncedSale)
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.delete('/api/vendas/:id', async (req, res) => {
  try {
    const localSale = getLocalSales({ includeDeleted: true }).find((sale) => sale.id === req.params.id)
    if (isFirestoreQuotaPaused() || localSale) {
      if (localSale && !canManageSale(req, localSale)) {
        return res.status(403).json({ message: 'Sem permissão para excluir esta venda.' })
      }
      removeLocalSale(req.params.id)
      syncLocalGoals()
      return res.status(200).json({ message: 'Venda excluída com sucesso' })
    }

    const ref = db.collection('vendas').doc(req.params.id)
    const currentSnap = await ref.get()
    if (!currentSnap.exists) {
      return res.status(404).json({ message: 'Venda não encontrada.' })
    }

    const currentSale = { id: currentSnap.id, ...currentSnap.data() }
    if (!canManageSale(req, currentSale)) {
      return res.status(403).json({ message: 'Sem permissão para excluir esta venda.' })
    }

    await ref.delete()
    removeLocalSale(req.params.id)
    await syncGoals().catch((error) => {
      if (!rememberQuotaError(error)) throw error
      syncLocalGoals()
    })
    res.status(200).json({ message: 'Venda excluída com sucesso' })
  } catch (error) {
    if (rememberQuotaError(error)) {
      removeLocalSale(req.params.id)
      syncLocalGoals()
      return res.status(200).json({ message: 'Venda excluída do cache local.' })
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/goals', async (req, res) => {
  try {
    const goals = await getGoalsWithProgress(req.query)
    const visibleGoals = filterGoalsForActor(goals, req)
    res.status(200).json(visibleGoals)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/goal-rankings', async (req, res) => {
  try {
    const { month, year } = req.query
    if (!month || !year) {
      return res.status(400).json({ message: 'month and year are required' })
    }
    const goals = filterGoalsForActor(await getGoalsWithProgress({ month, year }), req)
    res.status(200).json(buildGoalRankings(goals, req))
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/goals/distribute-store', async (req, res) => {
  try {
    const {
      month,
      year,
      storeName = '',
      storeCity = '',
      storeState = '',
      rows = [],
    } = req.body

    if (!month || !year || !storeName) {
      return res.status(400).json({ message: 'month, year and storeName are required' })
    }
    if (!canAccessGoalPayload(req, { storeName })) {
      return res.status(403).json({ message: 'Sem permissão para distribuir metas desta loja.' })
    }
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ message: 'Informe as metas para distribuir.' })
    }

    const validRows = rows
      .filter((row) => GOAL_TYPES.includes(row.type))
      .map((row) => ({
        type: row.type,
        targetValue: Number(row.targetValue || 0),
        currentValue: Number(row.currentValue || 0),
      }))

    if (!validRows.length) {
      return res.status(400).json({ message: 'Nenhum tipo de meta válido para distribuir.' })
    }

    const sellers = await getSellersForStore(storeName)
    if (!sellers.length) {
      return res.status(400).json({ message: 'Nenhum vendedor ativo encontrado nessa loja para distribuir as metas.' })
    }

    const existingGoals = await getGoalsWithProgress({ month, year })
    const savedGoals = []

    validRows.forEach((row) => {
      sellers.forEach((seller, index) => {
        const sellerId = seller.uid || seller.id
        const existingGoal = findExistingGoal(existingGoals, (goal) => (
          goal.userId === sellerId
          && goal.type === row.type
          && Number(goal.month) === Number(month)
          && Number(goal.year) === Number(year)
          && !goal.storeName
          && !goal.groupName
        ))
        const targetValue = getDistributedGoalTarget(row.targetValue, sellers.length, index)
        const currentValue = Number(existingGoal?.currentValue || 0)
        const calendarFields = resolveGoalCalendarFields({
          userId: sellerId,
          storeCity: seller.storeCity || seller.city || storeCity,
          storeState: seller.storeState || seller.state || storeState,
        })
        const metrics = buildGoalMetrics({
          type: row.type,
          targetValue,
          currentValue,
          userId: sellerId,
          month: Number(month),
          year: Number(year),
          ...calendarFields,
        }, currentValue)
        const goal = upsertLocalGoal({
          ...(existingGoal || {}),
          id: existingGoal?.id || getStableGoalId([year, month, sellerId, row.type]),
          type: row.type,
          targetValue,
          currentValue: metrics.currentValue,
          gapValue: metrics.gapValue,
          weeklyTarget: metrics.weeklyTarget,
          dailyTarget: metrics.dailyTarget,
          businessDaysCount: metrics.businessDaysCount,
          remainingBusinessDays: metrics.remainingBusinessDays,
          userId: sellerId,
          userName: seller.name || seller.email || 'Vendedor',
          managerId: '',
          managerName: '',
          storeName: '',
          groupName: '',
          storeCity: calendarFields.storeCity,
          storeState: calendarFields.storeState,
          month: Number(month),
          year: Number(year),
          status: metrics.status,
          holidayCount: metrics.holidayCount,
          holidays: metrics.holidays,
          calendarCity: metrics.calendarCity,
          calendarState: metrics.calendarState,
          autoSync: true,
          manualRealized: false,
          pendingSync: true,
        })
        savedGoals.push(goal)
      })

      const existingStoreGoal = findExistingGoal(existingGoals, (goal) => (
        normalizeText(goal.storeName) === normalizeText(storeName)
        && goal.type === row.type
        && Number(goal.month) === Number(month)
        && Number(goal.year) === Number(year)
        && !goal.userId
        && !goal.groupName
      ))
      const storeCurrentValue = Number(row.currentValue || existingStoreGoal?.currentValue || 0)
      const calendarFields = resolveGoalCalendarFields({ storeName, storeCity, storeState })
      const metrics = buildGoalMetrics({
        type: row.type,
        targetValue: row.targetValue,
        currentValue: storeCurrentValue,
        storeName,
        month: Number(month),
        year: Number(year),
        ...calendarFields,
      }, storeCurrentValue)
      const storeGoal = upsertLocalGoal({
        ...(existingStoreGoal || {}),
        id: existingStoreGoal?.id || getStableGoalId([year, month, storeName, row.type]),
        type: row.type,
        targetValue: row.targetValue,
        currentValue: metrics.currentValue,
        gapValue: metrics.gapValue,
        weeklyTarget: metrics.weeklyTarget,
        dailyTarget: metrics.dailyTarget,
        businessDaysCount: metrics.businessDaysCount,
        remainingBusinessDays: metrics.remainingBusinessDays,
        userId: '',
        userName: '',
        managerId: '',
        managerName: '',
        storeName,
        groupName: '',
        storeCity: calendarFields.storeCity,
        storeState: calendarFields.storeState,
        month: Number(month),
        year: Number(year),
        status: metrics.status,
        holidayCount: metrics.holidayCount,
        holidays: metrics.holidays,
        calendarCity: metrics.calendarCity,
        calendarState: metrics.calendarState,
        autoSync: true,
        manualRealized: false,
        pendingSync: true,
      })
      savedGoals.push(storeGoal)
    })

    await syncLocalGoals().catch((error) => {
      if (!rememberQuotaError(error)) throw error
    })

    res.status(200).json({
      message: 'Metas da loja salvas e distribuídas com sucesso.',
      sellersCount: sellers.length,
      goalsCount: savedGoals.length,
      goals: savedGoals,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/goals/distribute-store/clear', async (req, res) => {
  try {
    const { month, year, storeName = '' } = req.body

    if (!month || !year || !storeName) {
      return res.status(400).json({ message: 'month, year and storeName are required' })
    }
    if (!canAccessGoalPayload(req, { storeName })) {
      return res.status(403).json({ message: 'Sem permissão para limpar metas desta loja.' })
    }

    const sellers = await getSellersForStore(storeName)
    const sellerIds = new Set(sellers.map((seller) => seller.uid || seller.id).filter(Boolean))
    const goals = getLocalGoals({ includeDeleted: true })
    const goalsToRemove = goals.filter((goal) => {
      if (Number(goal.month) !== Number(month) || Number(goal.year) !== Number(year)) return false
      if (!GOAL_TYPES.includes(goal.type)) return false

      const isStoreGoal = normalizeText(goal.storeName) === normalizeText(storeName)
        && !goal.userId
        && !goal.groupName
      const isDistributedSellerGoal = sellerIds.has(goal.userId)
        && !goal.storeName
        && !goal.groupName
      return isStoreGoal || isDistributedSellerGoal
    })

    goalsToRemove.forEach((goal) => removeLocalGoal(goal.id))

    await syncLocalGoals().catch((error) => {
      if (!rememberQuotaError(error)) throw error
    })

    res.status(200).json({
      message: `Distribuição limpa com sucesso. ${goalsToRemove.length} metas removidas.`,
      removedCount: goalsToRemove.length,
      sellersCount: sellers.length,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/goals', async (req, res) => {
  try {
    const {
      type,
      targetValue,
      currentValue = 0,
      gapValue,
      userId = '',
      userName = '',
      managerId = '',
      managerName = '',
      storeName = '',
      groupName = '',
      storeCity = '',
      storeState = '',
      extraHolidays = [],
      month,
      year,
    } = req.body

    if (!GOAL_TYPES.includes(type)) {
      return res.status(400).json({ message: 'Tipo de meta inválido.' })
    }
    if (!month || !year) {
      return res.status(400).json({ message: 'type, month and year are required' })
    }
    if (!canAccessGoalPayload(req, { userId, storeName, managerId, groupName })) {
      return res.status(403).json({ message: 'Sem permissão para salvar esta meta.' })
    }
    const storedManualCurrentValue = undefined

    const calendarFields = resolveGoalCalendarFields({ storeName, groupName, storeCity, storeState, userId })
    const target = Number(targetValue || 0)
    const goalForCalculation = {
      type,
      targetValue: target,
      currentValue: Number(currentValue || 0),
      userId,
      userName,
      managerId,
      managerName,
      storeName,
      groupName,
      month: Number(month),
      year: Number(year),
      autoSync: true,
      manualRealized: false,
      manualCurrentValue: storedManualCurrentValue,
      ...calendarFields,
      extraHolidays,
    }
    const manualSalesBaseValue = undefined
    goalForCalculation.manualSalesBaseValue = manualSalesBaseValue
    const current = await calculateGoalCurrentValueFromFirestore(goalForCalculation, currentValue)
    const metrics = buildGoalMetrics(goalForCalculation, current)
    const payload = {
      type,
      targetValue: target,
      currentValue: metrics.currentValue,
      gapValue: metrics.gapValue,
      weeklyTarget: metrics.weeklyTarget,
      dailyTarget: metrics.dailyTarget,
      businessDaysCount: metrics.businessDaysCount,
      remainingBusinessDays: metrics.remainingBusinessDays,
      userId,
      userName,
      managerId,
      managerName,
      storeName,
      groupName,
      storeCity: calendarFields.storeCity,
      storeState: calendarFields.storeState,
      extraHolidays: Array.isArray(extraHolidays) ? extraHolidays : [],
      month: Number(month),
      year: Number(year),
      status: metrics.status,
      holidayCount: metrics.holidayCount,
      holidays: metrics.holidays,
      calendarCity: metrics.calendarCity,
      calendarState: metrics.calendarState,
      autoSync: true,
      manualRealized: false,
      manualCurrentValue: storedManualCurrentValue,
      manualSalesBaseValue,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
    removeUndefinedFields(payload)

    if (isFirestoreQuotaPaused()) {
      const goal = upsertLocalGoal({
        ...payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pendingSync: true,
      })
      syncLocalGoals()
      return res.status(201).json(goal)
    }

    const ref = await db.collection('goals').add(payload)
    await ref.set({ id: ref.id }, { merge: true })
    const snap = await ref.get()
    const goal = serializeDoc(snap)
    upsertLocalGoal(goal)
    await syncGoals().catch((error) => {
      if (!rememberQuotaError(error)) throw error
      syncLocalGoals()
    })
    res.status(201).json(goal)
  } catch (error) {
    if (rememberQuotaError(error)) {
      const calendarFields = resolveGoalCalendarFields(req.body)
      const target = Number(req.body.targetValue || 0)
      const current = Number(req.body.currentValue || 0)
      const manualSalesBaseValue = undefined
      const metrics = buildGoalMetrics({ ...req.body, ...calendarFields, targetValue: target, manualSalesBaseValue }, current)
      const goal = upsertLocalGoal({
        ...req.body,
        ...calendarFields,
        ...metrics,
        targetValue: target,
        currentValue: metrics.currentValue,
        manualSalesBaseValue,
        month: Number(req.body.month),
        year: Number(req.body.year),
        pendingSync: true,
      })
      syncLocalGoals()
      return res.status(201).json(goal)
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.put('/api/goals/:id', async (req, res) => {
  try {
    const localGoal = getLocalGoals({ includeDeleted: true }).find((goal) => goal.id === req.params.id)
    if (isFirestoreQuotaPaused() || localGoal) {
      if (!localGoal) {
        return res.status(404).json({ message: 'Meta não encontrada.' })
      }
      if (!canAccessGoalPayload(req, localGoal)) {
        return res.status(403).json({ message: 'Sem permissão para editar esta meta.' })
      }
      const target = Number(req.body.targetValue || 0)
      const current = Number(req.body.currentValue || 0)
      const storedManualCurrentValue = undefined
      const calendarFields = resolveGoalCalendarFields({ ...localGoal, ...req.body })
      const manualSalesBaseValue = undefined
      const goalForCalculation = {
        ...localGoal,
        ...req.body,
        ...calendarFields,
        targetValue: target,
        manualSalesBaseValue,
      }
      const calculatedCurrent = current
      const metrics = buildGoalMetrics(goalForCalculation, calculatedCurrent)
      const goal = upsertLocalGoal({
        ...localGoal,
        ...req.body,
        ...calendarFields,
        ...metrics,
        targetValue: target,
        currentValue: metrics.currentValue,
        autoSync: true,
        manualRealized: false,
        manualCurrentValue: storedManualCurrentValue,
        manualSalesBaseValue,
        month: Number(req.body.month),
        year: Number(req.body.year),
        pendingSync: true,
      })
      syncLocalGoals()
      return res.status(200).json(goal)
    }

    const ref = db.collection('goals').doc(req.params.id)
    const currentSnap = await ref.get()
    if (!currentSnap.exists) {
      return res.status(404).json({ message: 'Meta não encontrada.' })
    }

    const currentGoal = currentSnap.exists ? currentSnap.data() : {}
    if (currentSnap.exists && !canAccessGoalPayload(req, currentGoal)) {
      return res.status(403).json({ message: 'Sem permissão para editar esta meta.' })
    }

    const target = Number(req.body.targetValue || 0)
    const currentInput = Number(req.body.currentValue || 0)
    const storedManualCurrentValue = undefined

    const calendarFields = resolveGoalCalendarFields({ ...currentGoal, ...req.body })
    const goalForCalculation = {
      ...currentGoal,
      ...req.body,
      ...calendarFields,
      targetValue: target,
      month: Number(req.body.month),
      year: Number(req.body.year),
      autoSync: true,
      manualRealized: false,
      manualCurrentValue: storedManualCurrentValue,
    }
    const manualSalesBaseValue = undefined
    goalForCalculation.manualSalesBaseValue = manualSalesBaseValue
    const current = await calculateGoalCurrentValueFromFirestore(goalForCalculation, currentInput)
    const metrics = buildGoalMetrics(goalForCalculation, current)
    const update = {
      ...req.body,
      ...calendarFields,
      targetValue: target,
      currentValue: metrics.currentValue,
      gapValue: metrics.gapValue,
      weeklyTarget: metrics.weeklyTarget,
      dailyTarget: metrics.dailyTarget,
      businessDaysCount: metrics.businessDaysCount,
      remainingBusinessDays: metrics.remainingBusinessDays,
      holidayCount: metrics.holidayCount,
      holidays: metrics.holidays,
      calendarCity: metrics.calendarCity,
      calendarState: metrics.calendarState,
      month: Number(req.body.month),
      year: Number(req.body.year),
      status: metrics.status,
      autoSync: true,
      manualRealized: false,
      manualCurrentValue: storedManualCurrentValue,
      manualSalesBaseValue,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
    removeUndefinedFields(update)
    update.manualCurrentValue = admin.firestore.FieldValue.delete()
    update.manualSalesBaseValue = admin.firestore.FieldValue.delete()
    delete update.id
    delete update.createdAt
    delete update.actorRole

    await ref.set(update, { merge: true })
    const snap = await ref.get()
    const goal = serializeDoc(snap)
    upsertLocalGoal(goal)
    await syncGoals().catch((error) => {
      if (!rememberQuotaError(error)) throw error
      syncLocalGoals()
    })
    res.status(200).json(goal)
  } catch (error) {
    if (rememberQuotaError(error)) {
      const target = Number(req.body.targetValue || 0)
      const current = Number(req.body.currentValue || 0)
      const calendarFields = resolveGoalCalendarFields(req.body)
      const manualSalesBaseValue = undefined
      const metrics = buildGoalMetrics({ ...req.body, ...calendarFields, targetValue: target, manualSalesBaseValue }, current)
      const goal = upsertLocalGoal({
        ...req.body,
        id: req.params.id,
        ...calendarFields,
        ...metrics,
        targetValue: target,
        currentValue: metrics.currentValue,
        manualSalesBaseValue,
        month: Number(req.body.month),
        year: Number(req.body.year),
        pendingSync: true,
      })
      syncLocalGoals()
      return res.status(200).json(goal)
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.delete('/api/goals/:id', async (req, res) => {
  try {
    const localGoal = getLocalGoals({ includeDeleted: true }).find((goal) => goal.id === req.params.id)
    if (isFirestoreQuotaPaused() || localGoal) {
      if (localGoal && !canAccessGoalPayload(req, localGoal)) {
        return res.status(403).json({ message: 'Sem permissão para excluir esta meta.' })
      }
      removeLocalGoal(req.params.id)
      syncLocalGoals()
      return res.status(200).json({ message: 'Meta excluída com sucesso' })
    }

    const ref = db.collection('goals').doc(req.params.id)
    const currentSnap = await ref.get()
    if (!currentSnap.exists) {
      return res.status(404).json({ message: 'Meta não encontrada.' })
    }

    if (currentSnap.exists && !canAccessGoalPayload(req, currentSnap.data())) {
      return res.status(403).json({ message: 'Sem permissão para excluir esta meta.' })
    }

    await ref.delete()
    removeLocalGoal(req.params.id)
    res.status(200).json({ message: 'Meta excluída com sucesso' })
  } catch (error) {
    if (rememberQuotaError(error)) {
      removeLocalGoal(req.params.id)
      syncLocalGoals()
      return res.status(200).json({ message: 'Meta excluída do cache local.' })
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/stores', async (req, res) => {
  try {
    if (isFirestoreQuotaPaused() || hasPendingLocalStoreWrites()) {
      const stores = getCombinedLocalStores()
      return res.status(200).json(normalizeRole(req.actorRole) === 'Gerente' ? filterRowsForManagerStore(stores, req.currentUser) : stores)
    }

    const snap = await db.collection('stores').get()
    const storeEntriesRaw = snap.docs.map((docSnap) => ({
      ref: docSnap.ref,
      id: docSnap.id,
      data: { id: docSnap.id, ...docSnap.data() },
    }))
    const { canonicalEntries: storeEntries, duplicateEntries: duplicateStoreEntries } = dedupeStoreEntriesByName(storeEntriesRaw)
    const firestoreStores = storeEntries
      .map((entry) => entry.data)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
    if (duplicateStoreEntries.length) {
      await commitBatchInChunks(duplicateStoreEntries, (batch, entry) => {
        batch.delete(entry.ref)
      })
    }
    const pendingStores = getLocalStores().filter((store) => store.pendingSync)
    const localUserStores = getStoresFromLocalUsers()
    const stores = sortStores(mergeByIdAndName(firestoreStores, [...pendingStores, ...localUserStores]))
    saveLocalStores(stores)
    res.status(200).json(normalizeRole(req.actorRole) === 'Gerente' ? filterRowsForManagerStore(stores, req.currentUser) : stores)
  } catch (error) {
    if (rememberQuotaError(error)) {
      console.warn('Cota do Firestore excedida ao listar lojas. Usando cache local.')
      const stores = getCombinedLocalStores()
      return res.status(200).json(normalizeRole(req.actorRole) === 'Gerente' ? filterRowsForManagerStore(stores, req.currentUser) : stores)
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/stores', async (req, res) => {
  try {
    if (!['Administrador', 'Gestor Master'].includes(normalizeRole(req.actorRole || req.body.actorRole))) {
      return res.status(403).json({ message: 'Sem permissão para cadastrar lojas.' })
    }

    const name = String(req.body.name || '').trim()
    const city = String(req.body.city || '').trim()
    const state = String(req.body.state || '').trim().toUpperCase()

    if (!name || !city || !state) {
      return res.status(400).json({ message: 'name, city and state are required' })
    }

    if (isFirestoreQuotaPaused()) {
      const store = upsertLocalStore({
        name,
        city,
        state,
        pendingSync: true,
      })
      return res.status(201).json({
        ...store,
        message: 'Loja salva localmente. A sincronização com Firebase será feita quando a cota liberar.',
      })
    }

    const normalizedName = normalizeText(name)
    const payload = {
      name,
      city,
      state,
      normalizedName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    const existingSnap = await db.collection('stores').where('normalizedName', '==', normalizedName).limit(1).get()
    const ref = existingSnap.empty ? db.collection('stores').doc() : existingSnap.docs[0].ref
    await ref.set({
      ...payload,
      id: ref.id,
      ...(existingSnap.empty ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    }, { merge: true })
    const snap = await ref.get()
    const store = serializeDoc(snap)
    upsertLocalStore(store)
    res.status(existingSnap.empty ? 201 : 200).json(store)
  } catch (error) {
    if (rememberQuotaError(error)) {
      console.warn('Cota do Firestore excedida ao cadastrar loja. Salvando em cache local.')
      const store = upsertLocalStore({
        name: req.body.name,
        city: req.body.city,
        state: req.body.state,
        pendingSync: true,
      })
      return res.status(201).json({
        ...store,
        message: 'Loja salva localmente. A sincronização com Firebase será feita quando a cota liberar.',
      })
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.put('/api/stores/:id', async (req, res) => {
  try {
    if (!['Administrador', 'Gestor Master'].includes(normalizeRole(req.actorRole || req.body.actorRole))) {
      return res.status(403).json({ message: 'Sem permissão para editar lojas.' })
    }

    const name = String(req.body.name || '').trim()
    const city = String(req.body.city || '').trim()
    const state = String(req.body.state || '').trim().toUpperCase()

    if (!name || !city || !state) {
      return res.status(400).json({ message: 'name, city and state are required' })
    }

    const payload = {
      name,
      city,
      state,
      normalizedName: normalizeText(name),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    if (isFirestoreQuotaPaused()) {
      const store = upsertLocalStore({
        id: req.params.id,
        name,
        city,
        state,
        pendingSync: true,
      })
      return res.status(200).json({
        ...store,
        message: 'Loja atualizada localmente. A sincronização com Firebase será feita quando a cota liberar.',
      })
    }

    const ref = db.collection('stores').doc(req.params.id)
    await ref.set(payload, { merge: true })
    const snap = await ref.get()
    const store = serializeDoc(snap)
    upsertLocalStore(store)
    res.status(200).json(store)
  } catch (error) {
    if (rememberQuotaError(error)) {
      console.warn('Cota do Firestore excedida ao editar loja. Atualizando cache local.')
      const store = upsertLocalStore({
        id: req.params.id,
        name: req.body.name,
        city: req.body.city,
        state: req.body.state,
        pendingSync: true,
      })
      return res.status(200).json({
        ...store,
        message: 'Loja atualizada localmente. A sincronização com Firebase será feita quando a cota liberar.',
      })
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.delete('/api/stores/:id', async (req, res) => {
  try {
    if (!['Administrador', 'Gestor Master'].includes(normalizeRole(req.actorRole || req.body.actorRole))) {
      return res.status(403).json({ message: 'Sem permissão para excluir lojas.' })
    }

    if (isFirestoreQuotaPaused()) {
      removeLocalStore(req.params.id)
      return res.status(200).json({ message: 'Loja removida da lista local. A exclusão no Firebase será tentada quando a cota liberar.' })
    }

    await db.collection('stores').doc(req.params.id).delete()
    removeLocalStore(req.params.id)
    res.status(200).json({ message: 'Loja excluída com sucesso' })
  } catch (error) {
    if (rememberQuotaError(error)) {
      console.warn('Cota do Firestore excedida ao excluir loja. Removendo do cache local.')
      removeLocalStore(req.params.id)
      return res.status(200).json({ message: 'Loja removida da lista local. A exclusão no Firebase será tentada quando a cota liberar.' })
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

function buildUserProfile(authUser, profile = {}) {
  const role = normalizeRole(profile.role || authUser.customClaims?.role || 'Vendedor')

  return {
    id: authUser.uid,
    uid: authUser.uid,
    name: profile.name || authUser.displayName || 'Sem nome',
    email: authUser.email || profile.email || '',
    role,
    storeName: profile.storeName || profile.store || profile.loja || '',
    storeCity: profile.storeCity || profile.city || profile.cidade || '',
    storeState: profile.storeState || profile.state || profile.estado || '',
    registration: profile.registration || profile.matricula || profile.employeeId || '',
    matricula: profile.registration || profile.matricula || profile.employeeId || '',
    photoUrl: profile.photoUrl || authUser.photoURL || '',
    disabled: authUser.disabled === true || profile.disabled === true,
    createdAt: profile.createdAt || authUser.metadata?.creationTime || '',
    updatedAt: profile.updatedAt || authUser.metadata?.lastSignInTime || '',
  }
}

app.get('/api/users', async (req, res) => {
  try {
    if (!canManageUsers(req.actorRole)) {
      return res.status(200).json([req.currentUser])
    }

    const localUsers = getLocalUsersList()
    if (localUsers.length) {
      return res.status(200).json(normalizeRole(req.actorRole) === 'Gerente' ? filterUsersForManagerStore(localUsers, req.currentUser) : localUsers)
    }

    const authUsers = await listAuthUsersCached()
    const profilesByUid = getLocalUserProfilesMap()
    if (!isFirestoreQuotaPaused() && profilesByUid.size === 0) {
      try {
        const profilesSnap = await db.collection('users').get()
        profilesSnap.docs.forEach((doc) => {
          const profile = { id: doc.id, ...doc.data() }
          profilesByUid.set(doc.id, profile)
          if (profile.uid) profilesByUid.set(profile.uid, profile)
        })
        saveLocalUserProfiles(profilesByUid)
      } catch (error) {
        rememberQuotaError(error)
        console.warn('Não foi possível carregar perfis do Firestore. Listando usuários do Auth.', error.message || error)
      }
    }

    const users = authUsers
      .map((authUser) => {
        const profile = profilesByUid.get(authUser.uid) || {}
        return buildUserProfile(authUser, profile)
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))

    res.status(200).json(normalizeRole(req.actorRole) === 'Gerente' ? filterUsersForManagerStore(users, req.currentUser) : users)
  } catch (error) {
    if (rememberQuotaError(error)) {
      console.warn('Cota do Firestore excedida ao listar usuários. Usando cache local.')
      const users = getLocalUsersList()
      return res.status(200).json(normalizeRole(req.actorRole) === 'Gerente' ? filterUsersForManagerStore(users, req.currentUser) : users)
    }
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/users/:uid/profile', async (req, res) => {
  try {
    const { uid } = req.params
    if (uid !== req.currentUser.uid && !canManageUsers(req.actorRole)) {
      return res.status(403).json({ message: 'Sem permissão para ver este perfil.' })
    }
    if (uid !== req.currentUser.uid && normalizeRole(req.actorRole) === 'Gerente') {
      const user = getLocalUsersList().find((item) => (item.uid || item.id) === uid)
      if (user && normalizeText(getProfileStoreName(user)) !== normalizeText(getProfileStoreName(req.currentUser))) {
        return res.status(403).json({ message: 'Gerente só pode acessar usuários da própria loja.' })
      }
    }

    let profile = getLocalUserProfilesMap().get(uid) || {}
    if (profile.uid || profile.id) {
      return res.status(200).json(buildCachedUserProfile(profile))
    }

    const authUser = await admin.auth().getUser(uid)
    if (!isFirestoreQuotaPaused() && !profile.uid && !profile.id) {
      try {
        const profileSnap = await db.collection('users').doc(uid).get()
        profile = profileSnap.exists ? profileSnap.data() : profile
      } catch (error) {
        rememberQuotaError(error)
        console.warn('Não foi possível carregar perfil do Firestore. Usando cache local/Auth.', error.message || error)
      }
    }

    const builtProfile = buildUserProfile(authUser, profile)
    if (uid !== req.currentUser.uid && normalizeRole(req.actorRole) === 'Gerente'
      && normalizeText(getProfileStoreName(builtProfile)) !== normalizeText(getProfileStoreName(req.currentUser))) {
      return res.status(403).json({ message: 'Gerente só pode acessar usuários da própria loja.' })
    }

    res.status(200).json(builtProfile)
  } catch (error) {
    console.error(error)
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ message: 'Usuário não encontrado.' })
    }
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/users', async (req, res) => {
  try {
    const { name, password, role } = req.body
    const photoUrl = String(req.body.photoUrl || '').trim()
    const registration = String(req.body.registration || req.body.matricula || req.body.employeeId || '').trim()
    const actorIsManager = normalizeRole(req.actorRole || req.body.actorRole) === 'Gerente'
    const storeName = actorIsManager ? getProfileStoreName(req.currentUser) : String(req.body.storeName || '')
    const storeCity = actorIsManager ? (req.currentUser?.storeCity || '') : String(req.body.storeCity || '')
    const storeState = actorIsManager ? (req.currentUser?.storeState || '') : String(req.body.storeState || '')
    const email = String(req.body.email || '').trim().toLowerCase()
    const active = req.body.active === undefined ? true : !!req.body.active
    if (!canManageUsers(req.body.actorRole)) {
      return res.status(403).json({ message: 'Sem permissão para cadastrar usuários.' })
    }

    if (!email || !password || !name || !role) {
      return res.status(400).json({ message: 'name, email, password and role are required' })
    }

    const normalizedRole = normalizeRole(role)
    if (!canAssignUserRole(req.body.actorRole, normalizedRole)) {
      return res.status(403).json({ message: 'Gerente só pode cadastrar perfis Vendedor ou Caixa.' })
    }
    if (actorIsManager && !storeName) {
      return res.status(403).json({ message: 'Gerente precisa ter loja vinculada para cadastrar usuários.' })
    }

    let user
    let created = false
    let reusedExisting = false

    try {
      user = await admin.auth().createUser({
        email,
        password,
        displayName: name,
      })
      created = true
    } catch (error) {
      if (error.code !== 'auth/email-already-exists') {
        throw error
      }

      user = await admin.auth().getUserByEmail(email)
      reusedExisting = true
    }

    await admin.auth().setCustomUserClaims(user.uid, { role: normalizedRole })
    await admin.auth().updateUser(user.uid, {
      displayName: name,
      disabled: active ? false : true,
    })

    if (!created) {
      user = await admin.auth().getUser(user.uid)
    }

    const userProfile = {
      uid: user.uid,
      id: user.uid,
      name,
      email,
      role: normalizedRole,
      storeName,
      storeCity,
      storeState,
      registration,
      matricula: registration,
      photoUrl,
      disabled: active ? false : true,
      updatedAt: new Date().toISOString(),
      ...(created ? { createdAt: new Date().toISOString() } : {}),
    }
    upsertLocalUserProfile(userProfile)
    authProfileCache.delete(user.uid)
    clearAuthUsersCache()

    const userRef = db.collection('users').doc(user.uid)
    if (!isFirestoreQuotaPaused()) {
      try {
        const existingProfile = await userRef.get()
        const firestoreProfile = {
          uid: user.uid,
          name,
          email,
          role: normalizedRole,
          storeName,
          storeCity,
          storeState,
          registration,
          matricula: registration,
          photoUrl,
          disabled: active ? false : true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(created && !existingProfile.exists ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
        }
        await userRef.set(firestoreProfile, { merge: true })
      } catch (error) {
        if (!rememberQuotaError(error)) throw error
        console.warn('Perfil salvo localmente porque a cota do Firestore foi excedida.', error.message || error)
      }
    }

    res.status(created ? 201 : 200).json({
      uid: user.uid,
      email: user.email,
      role: normalizedRole,
      reused: reusedExisting,
      message: reusedExisting ? 'Este e-mail já existia. O cadastro foi sincronizado sem alterar a senha.' : undefined,
    })
  } catch (error) {
    console.error(error)
    if (error.code === 'auth/invalid-email') {
      return res.status(400).json({ message: 'E-mail inválido.' })
    }
    if (error.code === 'auth/invalid-password') {
      return res.status(400).json({ message: 'Senha inválida. Use no mínimo 6 caracteres.' })
    }
    res.status(500).json({ message: error.message })
  }
})

app.put('/api/users/:uid', async (req, res) => {
  try {
    const { uid } = req.params
    const { name, role, active } = req.body
    const photoUrl = String(req.body.photoUrl || '').trim()
    const registration = String(req.body.registration || req.body.matricula || req.body.employeeId || '').trim()
    const actorIsManager = normalizeRole(req.actorRole || req.body.actorRole) === 'Gerente'
    const storeName = actorIsManager ? getProfileStoreName(req.currentUser) : String(req.body.storeName || '')
    const storeCity = actorIsManager ? (req.currentUser?.storeCity || '') : String(req.body.storeCity || '')
    const storeState = actorIsManager ? (req.currentUser?.storeState || '') : String(req.body.storeState || '')
    const email = String(req.body.email || '').trim().toLowerCase()
    if (!canManageUsers(req.body.actorRole)) {
      return res.status(403).json({ message: 'Sem permissão para editar usuários.' })
    }

    if (!name || !role || !email) {
      return res.status(400).json({ message: 'name, email and role are required' })
    }

    const normalizedRole = normalizeRole(role)
    if (!canAssignUserRole(req.body.actorRole, normalizedRole)) {
      return res.status(403).json({ message: 'Gerente só pode editar perfis Vendedor ou Caixa.' })
    }
    if (actorIsManager) {
      const currentTarget = await getUserProfileForPermission(uid)
      if (!managerCanAccessUserProfile(req.currentUser, currentTarget)) {
        return res.status(403).json({ message: 'Gerente só pode editar perfis Vendedor ou Caixa da própria loja.' })
      }
      if (!storeName) {
        return res.status(403).json({ message: 'Gerente precisa ter loja vinculada para editar usuários.' })
      }
    }

    await admin.auth().setCustomUserClaims(uid, { role: normalizedRole })
    await admin.auth().updateUser(uid, {
      email,
      displayName: name,
      ...(active !== undefined ? { disabled: active ? false : true } : {}),
    })

    const userProfile = {
      uid,
      id: uid,
      name,
      email,
      role: normalizedRole,
      storeName,
      storeCity,
      storeState,
      registration,
      matricula: registration,
      photoUrl,
      ...(active !== undefined ? { disabled: active ? false : true } : {}),
      updatedAt: new Date().toISOString(),
    }
    upsertLocalUserProfile(userProfile)
    authProfileCache.delete(uid)
    clearAuthUsersCache()

    if (!isFirestoreQuotaPaused()) {
      try {
        await db.collection('users').doc(uid).set({
          ...userProfile,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
      } catch (error) {
        if (!rememberQuotaError(error)) throw error
        console.warn('Usuário atualizado localmente porque a cota do Firestore foi excedida.', error.message || error)
      }
    }

    res.status(200).json({ uid, name, email, role: normalizedRole, active })
  } catch (error) {
    console.error(error)
    if (error.code === 'auth/invalid-email') {
      return res.status(400).json({ message: 'E-mail inválido.' })
    }
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ message: 'Este e-mail já está cadastrado em outro usuário.' })
    }
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/users/:uid/reset-password', async (req, res) => {
  try {
    const { uid } = req.params
    const { password } = req.body
    if (!canManageUsers(req.body.actorRole)) {
      return res.status(403).json({ message: 'Sem permissão para redefinir senha de usuários.' })
    }
    if (normalizeRole(req.actorRole || req.body.actorRole) === 'Gerente') {
      const targetProfile = await getUserProfileForPermission(uid)
      if (!managerCanAccessUserProfile(req.currentUser, targetProfile)) {
        return res.status(403).json({ message: 'Gerente só pode redefinir senha de Vendedor ou Caixa da própria loja.' })
      }
    }

    if (password) {
      await admin.auth().updateUser(uid, { password })
      return res.status(200).json({ message: 'Password updated successfully' })
    }

    const user = await admin.auth().getUser(uid)
    const link = await admin.auth().generatePasswordResetLink(user.email)
    res.status(200).json({ link })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

app.delete('/api/users/:uid', async (req, res) => {
  try {
    const { uid } = req.params
    if (!canChangeUserAccess(req.body.actorRole)) {
      return res.status(403).json({ message: 'Sem permissão para inativar usuários.' })
    }

    if (uid === req.currentUser?.uid) {
      return res.status(400).json({ message: 'Você não pode inativar o próprio usuário.' })
    }

    let profileData = getLocalUserProfilesMap().get(uid) || {}
    if (!isFirestoreQuotaPaused()) {
      try {
        const profile = await db.collection('users').doc(uid).get()
        profileData = profile.exists ? profile.data() : profileData
      } catch (error) {
        rememberQuotaError(error)
        console.warn('Não foi possível carregar perfil antes de inativar. Usando cache local.', error.message || error)
      }
    }
    if (normalizeRole(profileData.role) === 'Administrador') {
      return res.status(403).json({ message: 'Não é permitido inativar usuário administrador.' })
    }

    await admin.auth().updateUser(uid, { disabled: true }).catch((error) => {
      console.warn('Não foi possível desativar no Firebase Auth. Perfil será inativado no CRM.', error.message || error)
    })
    upsertLocalUserProfile({ uid, disabled: true, accessRemoved: true })
    authProfileCache.delete(uid)
    clearAuthUsersCache()
    if (!isFirestoreQuotaPaused()) {
      try {
        await db.collection('users').doc(uid).set({
          disabled: true,
          accessRemoved: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
      } catch (error) {
        if (!rememberQuotaError(error)) throw error
        console.warn('Usuário inativado apenas localmente porque a cota do Firestore foi excedida.', error.message || error)
      }
    }
    res.status(200).json({ message: 'Usuário removido/inativado com sucesso' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Não foi possível remover/inativar o usuário.' })
  }
})

app.delete('/api/users/:uid/permanent', async (req, res) => {
  try {
    const { uid } = req.params
    if (!canChangeUserAccess(req.body.actorRole)) {
      return res.status(403).json({ message: 'Sem permissão para inativar usuários.' })
    }

    if (uid === req.currentUser?.uid) {
      return res.status(400).json({ message: 'Você não pode inativar o próprio usuário.' })
    }

    let profileData = getLocalUserProfilesMap().get(uid) || {}
    if (!isFirestoreQuotaPaused()) {
      try {
        const profile = await db.collection('users').doc(uid).get()
        profileData = profile.exists ? profile.data() : profileData
      } catch (error) {
        rememberQuotaError(error)
        console.warn('Não foi possível carregar perfil antes de inativar. Usando cache local.', error.message || error)
      }
    }
    if (normalizeRole(profileData.role) === 'Administrador') {
      return res.status(403).json({ message: 'Não é permitido inativar usuário administrador.' })
    }

    await admin.auth().updateUser(uid, { disabled: true }).catch((error) => {
      console.warn('Não foi possível desativar no Firebase Auth. Perfil será inativado no CRM.', error.message || error)
    })
    upsertLocalUserProfile({ uid, disabled: true, accessRemoved: true })
    authProfileCache.delete(uid)
    clearAuthUsersCache()
    if (!isFirestoreQuotaPaused()) {
      try {
        await db.collection('users').doc(uid).set({
          disabled: true,
          accessRemoved: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
      } catch (error) {
        if (!rememberQuotaError(error)) throw error
        console.warn('Usuário inativado apenas localmente porque a cota do Firestore foi excedida.', error.message || error)
      }
    }
    res.status(200).json({ message: 'Usuário removido/inativado com sucesso' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Não foi possível remover/inativar o usuário.' })
  }
})

app.post('/api/users/:uid/enable', async (req, res) => {
  try {
    const { uid } = req.params
    if (!canChangeUserAccess(req.body.actorRole)) {
      return res.status(403).json({ message: 'Sem permissão para reativar usuários.' })
    }

    await admin.auth().updateUser(uid, { disabled: false }).catch((error) => {
      console.warn('Não foi possível reativar no Firebase Auth. Perfil será reativado no CRM.', error.message || error)
    })
    upsertLocalUserProfile({ uid, disabled: false, accessRemoved: false })
    authProfileCache.delete(uid)
    clearAuthUsersCache()
    if (!isFirestoreQuotaPaused()) {
      try {
        await db.collection('users').doc(uid).set({
          disabled: false,
          accessRemoved: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
      } catch (error) {
        if (!rememberQuotaError(error)) throw error
        console.warn('Usuário reativado apenas localmente/Auth porque a cota do Firestore foi excedida.', error.message || error)
      }
    }
    res.status(200).json({ message: 'Usuário reativado com sucesso' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

const port = process.env.PORT || 4000
app.listen(port, () => {
  console.log(`Auth server listening on port ${port}`)
})
