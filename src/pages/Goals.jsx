import React, { useEffect, useMemo, useState } from 'react'
import { addGoal, clearStoreGoalDistribution, distributeStoreGoals as distributeStoreGoalsApi, getCalendar, getGoals, getStores, getUsers, subscribeGoals, updateGoal } from '../firebase/db'
import { useAuth } from '../contexts/AuthContext'

const SERVICES = [
  'Pós',
  'Controle',
  'Fibra',
  'Upgrade',
  'Receita Total',
  'Gross',
  'Portabilidade',
  'Aparelhos',
  'Acessórios',
  'DACC',
  'Seguros',
  'PayJoy',
  'Dependentes',
]
const MONEY_SERVICES = new Set(['Receita Total', 'Aparelhos', 'Acessórios', 'PayJoy', 'Seguros', 'DACC'])
const SELLER_GOAL_ROLES = ['Vendedor', 'Executivo']
const ECONOMIC_GROUP_NAME = 'INTERCELL'
const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

function calculateBusinessDayFallback(month, year) {
  const monthIndex = Number(month) - 1
  const numericYear = Number(year)
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11 || !numericYear) {
    return {
      businessDaysCount: '',
      remainingBusinessDays: '',
      holidayCount: '',
      holidays: [],
    }
  }

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === numericYear && today.getMonth() === monthIndex
  const lastDay = new Date(numericYear, monthIndex + 1, 0).getDate()
  let businessDaysCount = 0
  let remainingBusinessDays = 0

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(numericYear, monthIndex, day)
    if (date.getDay() === 0) continue
    businessDaysCount += 1

    if (!isCurrentMonth || day >= today.getDate()) {
      remainingBusinessDays += 1
    }
  }

  if (!isCurrentMonth && new Date(numericYear, monthIndex, lastDay) < today) {
    remainingBusinessDays = 0
  }

  return {
    businessDaysCount,
    remainingBusinessDays,
    holidayCount: 0,
    holidays: [],
  }
}

function withCalendarFallback(calendarData, period) {
  const fallback = calculateBusinessDayFallback(period.month, period.year)
  return {
    ...fallback,
    ...calendarData,
    businessDaysCount: calendarData?.businessDaysCount || fallback.businessDaysCount,
    remainingBusinessDays: calendarData?.remainingBusinessDays || fallback.remainingBusinessDays,
    holidayCount: calendarData?.holidayCount ?? fallback.holidayCount,
    holidays: Array.isArray(calendarData?.holidays) ? calendarData.holidays : fallback.holidays,
  }
}

function defaultPeriod() {
  const now = new Date()
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    userId: '',
    userName: '',
    managerId: '',
    managerName: '',
    storeName: '',
    groupName: '',
    storeCity: '',
    storeState: '',
    scope: '',
  }
}

function emptyRows() {
  return SERVICES.map((service) => ({
    type: service,
    id: '',
    targetValue: '',
    currentValue: '',
    gapValue: '',
    weeklyTarget: '',
    dailyTarget: '',
    businessDaysCount: '',
    remainingBusinessDays: '',
    holidayCount: '',
    holidays: [],
    calendarCity: '',
    calendarState: '',
    status: 'abaixo da meta',
    autoSync: true,
  }))
}

function toInputValue(value) {
  if (value === undefined || value === null || value === '') return ''
  return String(value)
}

function toNumber(value) {
  if (value === '' || value === undefined || value === null) return 0
  const normalized = String(value).replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatValue(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatGoalValue(type, value) {
  const formatted = formatValue(value)
  return MONEY_SERVICES.has(type) ? `R$ ${formatted}` : formatted
}

function statusFrom(row) {
  const target = toNumber(row.targetValue)
  const current = toNumber(row.currentValue)
  if (!target || current <= 0) return 'abaixo da meta'
  const percent = (current / target) * 100
  if (percent >= 120) return 'super meta'
  if (percent >= 100) return 'meta batida'
  return 'em andamento'
}

function statusFromValues(currentValue, targetValue) {
  const target = Number(targetValue || 0)
  const current = Number(currentValue || 0)
  if (!target || current <= 0) return 'abaixo da meta'
  const percent = (current / target) * 100
  if (percent >= 120) return 'super meta'
  if (percent >= 100) return 'meta batida'
  return 'em andamento'
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`
}

function getProgressPercent(currentValue, targetValue) {
  const target = toNumber(targetValue)
  if (!target) return 0
  return Math.min(140, (toNumber(currentValue) / target) * 100)
}

function getAchievementPercent(currentValue, targetValue) {
  const target = toNumber(targetValue)
  if (!target) return 0
  return (toNumber(currentValue) / target) * 100
}

function getAchievementColor(currentValue, targetValue) {
  return getAchievementPercent(currentValue, targetValue) >= 100
    ? 'bg-green-500'
    : 'bg-red-500'
}

function getAchievementTextColor(currentValue, targetValue) {
  return getAchievementPercent(currentValue, targetValue) >= 100
    ? 'text-green-200'
    : 'text-red-200'
}

function getStatusClass(status) {
  if (status === 'super meta') return 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/30'
  if (status === 'meta batida') return 'bg-green-400/15 text-green-200 ring-green-300/30'
  if (status === 'em andamento') return 'bg-sky-400/15 text-sky-200 ring-sky-300/30'
  return 'bg-amber-400/15 text-amber-100 ring-amber-300/30'
}

function getStatusLabel(status) {
  if (status === 'super meta') return 'Super meta'
  if (status === 'meta batida') return 'Meta batida'
  if (status === 'em andamento') return 'Em andamento'
  return 'Abaixo da meta'
}

function calculatePaceMetrics(targetValue, currentValue, remainingBusinessDays) {
  const target = Number(targetValue || 0)
  const current = Number(currentValue || 0)
  const remainingDays = Number(remainingBusinessDays || 0)
  const gap = Math.max(0, target - current)
  const remainingWeeks = remainingDays ? Math.max(1, Math.ceil(remainingDays / 6)) : 0

  return {
    gapValue: gap,
    weeklyTarget: remainingWeeks ? Number((gap / remainingWeeks).toFixed(2)) : 0,
    dailyTarget: remainingDays ? Number((gap / remainingDays).toFixed(2)) : 0,
  }
}

function pickCalendarValue(goal, calendarData, key) {
  return goal?.[key] ?? calendarData?.[key] ?? ''
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeRole(value) {
  const role = normalizeText(value)
  if (role === 'administrador' || role === 'admin' || role === 'adm') return 'Administrador'
  if (role === 'gestor master' || role === 'gestor marter') return 'Gestor Master'
  if (role === 'gerente') return 'Gerente'
  if (role === 'vendedor') return 'Vendedor'
  if (role === 'executivo') return 'Executivo'
  return value || ''
}

function getUserId(user = {}) {
  return user.uid || user.id || ''
}

function getUserStoreName(user = {}) {
  return user.storeName || user.store || user.loja || ''
}

function getUserStoreKey(user = {}) {
  const storeName = normalizeText(getUserStoreName(user))
  if (storeName) return storeName
  return [user.storeCity || user.city || user.cidade, user.storeState || user.state || user.estado]
    .map(normalizeText)
    .filter(Boolean)
    .join('|')
}

function isGoalSeller(user = {}) {
  return SELLER_GOAL_ROLES.includes(user.role)
}

function findSellerGoal(goals, userId, type, month, year) {
  return goals.find((goal) => goal.userId === userId
    && goal.type === type
    && Number(goal.month) === Number(month)
    && Number(goal.year) === Number(year)
    && !goal.storeName
    && !goal.groupName)
}

function getDistributedTarget(total, count, index) {
  const target = toNumber(total)
  if (!count) return 0
  const share = Number((target / count).toFixed(2))
  if (index < count - 1) return share
  return Number((target - (share * (count - 1))).toFixed(2))
}

function getStoreSellerIds(usersList, storeName) {
  const storeKey = normalizeText(storeName)
  if (!storeKey) return new Set()
  return new Set(usersList
    .filter((user) => !user.disabled && isGoalSeller(user) && normalizeText(getUserStoreName(user)) === storeKey)
    .map(getUserId)
    .filter(Boolean))
}

function getStoreRealizedByType(goals, usersList, storeName, month, year) {
  const sellerIds = getStoreSellerIds(usersList, storeName)
  const totals = new Map()
  goals.forEach((goal) => {
    if (!sellerIds.has(goal.userId)) return
    if (goal.storeName || goal.groupName) return
    if (Number(goal.month) !== Number(month) || Number(goal.year) !== Number(year)) return
    totals.set(goal.type, Number((totals.get(goal.type) || 0) + Number(goal.currentValue || 0)))
  })
  return totals
}

function getRegisteredStoreKeys(storesList) {
  return new Set(storesList
    .map((store) => normalizeText(store.name))
    .filter(Boolean))
}

function getGroupTotalsByType(goals, storesList, month, year) {
  const storeKeys = getRegisteredStoreKeys(storesList)
  const totals = new Map()
  goals.forEach((goal) => {
    const storeKey = normalizeText(goal.storeName)
    if (!storeKey) return
    if (goal.userId || goal.groupName) return
    if (storeKeys.size && !storeKeys.has(storeKey)) return
    if (Number(goal.month) !== Number(month) || Number(goal.year) !== Number(year)) return
    const current = totals.get(goal.type) || { targetValue: 0, currentValue: 0 }
    totals.set(goal.type, {
      targetValue: current.targetValue + Number(goal.targetValue || 0),
      currentValue: current.currentValue + Number(goal.currentValue || 0),
    })
  })
  return totals
}

export default function Goals() {
  const { currentUser } = useAuth()
  const [period, setPeriod] = useState(defaultPeriod)
  const [rows, setRows] = useState(emptyRows)
  const [serviceFilter, setServiceFilter] = useState('')
  const [users, setUsers] = useState([])
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearingDistribution, setClearingDistribution] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState('sheet')
  const [distributeStoreGoals, setDistributeStoreGoals] = useState(true)

  const currentUserRole = normalizeRole(currentUser?.role)
  const isSeller = SELLER_GOAL_ROLES.includes(currentUserRole)
  const canSelectGroup = !isSeller
  const canSelectStore = !isSeller
  const canSelectSeller = !isSeller
  const sellers = users
    .filter((user) => !user.disabled && isGoalSeller(user) && getUserId(user))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
  const storeNames = useMemo(() => {
    const byName = new Map()
    stores.forEach((store) => {
      const name = store.name
      const key = normalizeText(name)
      if (key) byName.set(key, name)
    })
    users.forEach((user) => {
      const name = getUserStoreName(user)
      const key = normalizeText(name)
      if (key && !byName.has(key)) byName.set(key, name)
    })
    return [...byName.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [stores, users])
  const storeGoalSellers = useMemo(() => {
    if (period.scope !== 'store' || !period.storeName) return []
    const storeKey = normalizeText(period.storeName)
    return users
      .filter((user) => !user.disabled && isGoalSeller(user) && getUserId(user))
      .filter((user) => normalizeText(getUserStoreName(user)) === storeKey)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
  }, [period.scope, period.storeName, users])
  const canShowSpreadsheet = (isSeller && period.userId)
    || (period.scope === 'store' && period.storeName.trim())
    || (period.scope === 'seller' && period.userId)
    || (period.scope === 'group' && period.groupName)

  function buildGoalFilter() {
    return {
      month: period.month,
      year: period.year,
      userId: period.scope === 'seller' || isSeller ? period.userId : undefined,
      storeName: period.scope === 'store' ? period.storeName.trim() : undefined,
      groupName: period.scope === 'group' ? period.groupName : undefined,
    }
  }

  function applyGoalsToRows(goalsData, calendarData = {}, allGoalsData = goalsData, usersList = users, storesList = stores) {
    const goals = Array.isArray(goalsData) ? goalsData : []
    const storeRealizedByType = period.scope === 'store'
      ? getStoreRealizedByType(Array.isArray(allGoalsData) ? allGoalsData : [], usersList, period.storeName, period.month, period.year)
      : new Map()
    const groupTotalsByType = period.scope === 'group'
      ? getGroupTotalsByType(Array.isArray(allGoalsData) ? allGoalsData : [], storesList, period.month, period.year)
      : new Map()
    setRows(SERVICES.map((service) => {
      const goal = goals.find((item) => item.type === service)
      if (!goal) {
        const current = period.scope === 'group'
          ? Number(groupTotalsByType.get(service)?.currentValue || 0)
          : Number(storeRealizedByType.get(service) || 0)
        const target = period.scope === 'group'
          ? Number(groupTotalsByType.get(service)?.targetValue || 0)
          : 0
        const paceMetrics = calculatePaceMetrics(target, current, calendarData.remainingBusinessDays)
        return {
          type: service,
          id: '',
          targetValue: toInputValue(target),
          currentValue: toInputValue(current),
          gapValue: toInputValue(paceMetrics.gapValue),
          weeklyTarget: toInputValue(paceMetrics.weeklyTarget),
          dailyTarget: toInputValue(paceMetrics.dailyTarget),
          businessDaysCount: toInputValue(calendarData.businessDaysCount),
          remainingBusinessDays: toInputValue(calendarData.remainingBusinessDays),
          holidayCount: toInputValue(calendarData.holidayCount),
          holidays: Array.isArray(calendarData.holidays) ? calendarData.holidays : [],
          calendarCity: calendarData.calendarCity || calendarData.storeCity || '',
          calendarState: calendarData.calendarState || calendarData.storeState || '',
        status: statusFromValues(current, target),
          autoSync: true,
          manualRealized: false,
      }
      }

      const currentValue = period.scope === 'store'
        ? Number(goal.currentValue ?? storeRealizedByType.get(service) ?? 0)
        : period.scope === 'group'
          ? Number(groupTotalsByType.get(service)?.currentValue || 0)
          : Number(goal.currentValue || 0)
      const targetValue = period.scope === 'group'
        ? Number(groupTotalsByType.get(service)?.targetValue || 0)
        : Number(goal.targetValue || 0)
      const businessDaysCount = pickCalendarValue(goal, calendarData, 'businessDaysCount')
      const remainingBusinessDays = pickCalendarValue(goal, calendarData, 'remainingBusinessDays')
      const holidayCount = pickCalendarValue(goal, calendarData, 'holidayCount')
      const paceMetrics = period.scope === 'store' || period.scope === 'group'
        ? calculatePaceMetrics(targetValue, currentValue, remainingBusinessDays)
        : {
          gapValue: Math.max(0, targetValue - currentValue),
          weeklyTarget: goal.weeklyTarget,
          dailyTarget: goal.dailyTarget,
        }
      return {
        type: service,
        id: goal.id || '',
        targetValue: toInputValue(targetValue),
        currentValue: toInputValue(currentValue),
        gapValue: toInputValue(paceMetrics.gapValue),
        weeklyTarget: toInputValue(paceMetrics.weeklyTarget),
        dailyTarget: toInputValue(paceMetrics.dailyTarget),
        businessDaysCount: toInputValue(businessDaysCount),
        remainingBusinessDays: toInputValue(remainingBusinessDays),
        holidayCount: toInputValue(holidayCount),
        holidays: Array.isArray(calendarData.holidays) ? calendarData.holidays : Array.isArray(goal.holidays) ? goal.holidays : [],
        calendarCity: calendarData.calendarCity || calendarData.storeCity || goal.calendarCity || goal.storeCity || '',
        calendarState: calendarData.calendarState || calendarData.storeState || goal.calendarState || goal.storeState || '',
        status: period.scope === 'store' || period.scope === 'group' ? statusFromValues(currentValue, targetValue) : goal.status || 'abaixo da meta',
        autoSync: true,
        manualRealized: false,
      }
    }))
  }

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true)
    setError('')
    setSuccess('')

    try {
      const [usersResult, storesResult] = await Promise.allSettled([getUsers(), getStores()])
      let loadedUsers = users
      let loadedStores = stores
      if (usersResult.status === 'fulfilled') {
        loadedUsers = Array.isArray(usersResult.value) ? usersResult.value : []
        setUsers(loadedUsers)
      } else {
        console.error('Erro ao carregar usuários:', usersResult.reason)
      }
      if (storesResult.status === 'fulfilled') {
        loadedStores = Array.isArray(storesResult.value) ? storesResult.value : []
        setStores(loadedStores)
      } else {
        console.error('Erro ao carregar lojas:', storesResult.reason)
      }

      if (!canShowSpreadsheet) {
        setRows(emptyRows())
        return
      }

      const calendarData = await getCalendar({
        month: period.month,
        year: period.year,
        userId: period.scope === 'seller' || isSeller ? period.userId : undefined,
        storeName: period.scope === 'store' ? period.storeName.trim() : undefined,
        groupName: period.scope === 'group' ? period.groupName : undefined,
        storeCity: period.storeCity.trim(),
        storeState: period.storeState.trim().toUpperCase(),
      }).catch((err) => {
        console.error('Erro ao carregar calendário:', err)
        return {}
      })

      const goalsData = await getGoals(buildGoalFilter())
      const allGoalsData = period.scope === 'store' || period.scope === 'group'
        ? await getGoals({ month: period.month, year: period.year })
        : goalsData
      applyGoalsToRows(goalsData, withCalendarFallback(calendarData, period), allGoalsData, loadedUsers, loadedStores)
    } catch (err) {
      console.error(err)
      setError('Não foi possível carregar a planilha de metas.')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [period.month, period.year, period.userId, period.storeName, period.storeCity, period.storeState, period.scope, canShowSpreadsheet])

  useEffect(() => {
    if (!canShowSpreadsheet) return undefined
    if (period.scope !== 'store' && period.scope !== 'group') return undefined

    const interval = setInterval(() => {
      load({ silent: true })
    }, 60000)

    return () => clearInterval(interval)
  }, [period.month, period.year, period.storeName, period.groupName, period.scope, canShowSpreadsheet])

  useEffect(() => {
    if (!canShowSpreadsheet) return undefined
    if (period.scope === 'store' || period.scope === 'group') return undefined
    if (period.scope === 'store' && !users.length) return undefined
    if (period.scope === 'group' && !stores.length) return undefined

    const subscriptionFilter = period.scope === 'store' || period.scope === 'group'
      ? { month: period.month, year: period.year }
      : buildGoalFilter()

    return subscribeGoals(subscriptionFilter, (goals) => {
      const visibleGoals = period.scope === 'store'
        ? goals.filter((goal) => normalizeText(goal.storeName) === normalizeText(period.storeName))
        : period.scope === 'group'
          ? goals.filter((goal) => normalizeText(goal.groupName) === normalizeText(period.groupName))
          : goals
      applyGoalsToRows(visibleGoals, withCalendarFallback({}, period), goals, users, stores)
    }, (err) => {
      console.warn('Sincronização em tempo real indisponível. Mantendo carregamento pela API/Firestore.', err)
      setError(err.message || 'Sincronização em tempo real indisponível.')
    })
  }, [period.month, period.year, period.userId, period.storeName, period.groupName, period.scope, canShowSpreadsheet, users, stores])

  useEffect(() => {
    if (!isSeller || !currentUser?.uid) return
    setPeriod((current) => ({
      ...current,
      scope: 'seller',
      userId: currentUser.uid,
      userName: currentUser.name || '',
      storeName: '',
      groupName: '',
      storeCity: currentUser.storeCity || '',
      storeState: currentUser.storeState || '',
    }))
  }, [isSeller, currentUser?.uid, currentUser?.name, currentUser?.email])

  useEffect(() => {
    if (activeTab === 'distribution' && period.scope !== 'store') {
      setActiveTab('sheet')
    }
  }, [activeTab, period.scope])

  function changePeriod(e) {
    const { name, value } = e.target
    if (name === 'scope') {
      if (value === 'group' && !canSelectGroup) return
      setPeriod((current) => ({
        ...current,
        scope: value,
        userId: '',
        userName: '',
        storeName: '',
        groupName: value === 'group' ? ECONOMIC_GROUP_NAME : '',
        storeCity: '',
        storeState: '',
      }))
      return
    }
    if (name === 'userId') {
      const user = users.find((item) => getUserId(item) === value)
      setPeriod((current) => ({
        ...current,
        scope: value ? 'seller' : '',
        userId: value,
        userName: user?.name || '',
        storeName: '',
        groupName: '',
        storeCity: user?.storeCity || '',
        storeState: user?.storeState || '',
      }))
      return
    }
    if (name === 'storeName') {
      const savedStore = stores.find((store) => normalizeText(store.name) === normalizeText(value))
      const userFromStore = users.find((user) => normalizeText(user.storeName || user.store || user.loja) === normalizeText(value))
      setPeriod((current) => ({
        ...current,
        scope: value ? 'store' : '',
        storeName: savedStore?.name || value,
        storeCity: savedStore?.city || userFromStore?.storeCity || current.storeCity,
        storeState: savedStore?.state || userFromStore?.storeState || current.storeState,
        userId: '',
        userName: '',
        groupName: '',
      }))
      return
    }
    if (name === 'groupName') {
      if (!canSelectGroup) return
      setPeriod((current) => ({
        ...current,
        scope: value ? 'group' : '',
        groupName: value,
        userId: '',
        userName: '',
        storeName: '',
        storeCity: '',
        storeState: '',
      }))
      return
    }
    setPeriod((current) => ({ ...current, [name]: value }))
  }

  function changeRow(type, field, value) {
    setRows((current) => current.map((row) => {
      if (row.type !== type) return row
      const next = { ...row, [field]: value }
      if (field === 'targetValue' || field === 'currentValue') {
        next.gapValue = String(Math.max(0, toNumber(next.targetValue) - toNumber(next.currentValue)))
      }
      return { ...next, status: statusFrom(next) }
    }))
  }

  function fillGaps() {
    setRows((current) => current.map((row) => {
      const gapValue = Math.max(0, toNumber(row.targetValue) - toNumber(row.currentValue))
      const next = { ...row, gapValue: String(gapValue) }
      return { ...next, status: statusFrom(next) }
    }))
  }

  async function saveSpreadsheet(e) {
    e.preventDefault()
    if (!canShowSpreadsheet) {
      setError('Selecione uma loja ou vendedor antes de salvar.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const allGroupGoals = period.scope === 'group'
        ? await getGoals({ month: period.month, year: period.year })
        : []
      const groupTotalsByType = period.scope === 'group'
        ? getGroupTotalsByType(allGroupGoals, stores, period.month, period.year)
        : new Map()

      if (period.scope === 'store' && distributeStoreGoals && !storeGoalSellers.length) {
        throw new Error('Nenhum vendedor ativo encontrado nessa loja para distribuir as metas.')
      }

      if (period.scope === 'store' && distributeStoreGoals) {
        const result = await distributeStoreGoalsApi({
          month: Number(period.month),
          year: Number(period.year),
          storeName: period.storeName.trim(),
          storeCity: period.storeCity.trim(),
          storeState: period.storeState.trim().toUpperCase(),
          rows: rows.map((row) => ({
            type: row.type,
            targetValue: toNumber(row.targetValue),
            currentValue: toNumber(row.currentValue),
          })),
        })

        setSuccess(`Meta da loja salva e distribuída igualmente para ${result.sellersCount || storeGoalSellers.length} vendedores.`)
        await load()
        return
      }

      const writes = []

      rows.forEach((row) => {
        const basePayload = {
          type: row.type,
          targetValue: toNumber(row.targetValue),
          managerId: '',
          managerName: '',
          month: Number(period.month),
          year: Number(period.year),
          actorRole: currentUser?.role,
        }

        const payload = {
          ...basePayload,
          currentValue: period.scope === 'store'
            ? toNumber(row.currentValue)
            : period.scope === 'group'
              ? toNumber(row.currentValue)
              : toNumber(row.currentValue),
          gapValue: period.scope === 'store' || period.scope === 'group'
            ? Math.max(0, (period.scope === 'group' ? Number(groupTotalsByType.get(row.type)?.targetValue || 0) : toNumber(row.targetValue)) - toNumber(row.currentValue))
            : toNumber(row.gapValue),
          userId: period.scope === 'seller' || isSeller ? period.userId : '',
          userName: period.scope === 'seller' || isSeller ? period.userName : '',
          storeName: period.scope === 'store' ? period.storeName.trim() : '',
          groupName: period.scope === 'group' ? period.groupName : '',
          storeCity: period.storeCity.trim(),
          storeState: period.storeState.trim().toUpperCase(),
          autoSync: true,
          manualRealized: false,
        }

        if (period.scope === 'group') {
          payload.targetValue = Number(groupTotalsByType.get(row.type)?.targetValue || 0)
        }

        writes.push(row.id ? updateGoal(row.id, payload) : addGoal(payload))
      })

      await Promise.all(writes)

      setSuccess('Planilha de metas salva com sucesso.')
      await load()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Não foi possível salvar a planilha de metas.')
    } finally {
      setSaving(false)
    }
  }

  async function clearDistribution() {
    if (!period.storeName || !period.month || !period.year) {
      setError('Selecione a loja e o período antes de limpar a distribuição.')
      return
    }

    const confirmed = window.confirm(`Limpar a distribuição de metas de ${period.storeName} em ${MONTHS[Number(period.month) - 1] || period.month}/${period.year}?`)
    if (!confirmed) return

    setClearingDistribution(true)
    setError('')
    setSuccess('')

    try {
      const result = await clearStoreGoalDistribution({
        month: Number(period.month),
        year: Number(period.year),
        storeName: period.storeName.trim(),
      })
      setRows(emptyRows())
      setSuccess(result.message || 'Distribuição de metas limpa com sucesso.')
      await load()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Não foi possível limpar a distribuição.')
    } finally {
      setClearingDistribution(false)
    }
  }

  const visibleRows = useMemo(() => {
    if (!serviceFilter) return rows
    return rows.filter((row) => row.type === serviceFilter)
  }, [rows, serviceFilter])

  const totals = useMemo(() => {
    return visibleRows.reduce((acc, row) => {
      acc.target += toNumber(row.targetValue)
      acc.current += toNumber(row.currentValue)
      acc.gap += toNumber(row.gapValue)
      return acc
    }, { target: 0, current: 0, gap: 0 })
  }, [visibleRows])
  const totalProgress = getProgressPercent(totals.current, totals.target)
  const selectedScopeLabel = isSeller
    ? (period.userName || currentUser?.name || 'Vendedor')
    : period.scope === 'group'
      ? `Grupo econômico ${ECONOMIC_GROUP_NAME}`
      : period.scope === 'store'
        ? period.storeName || 'Loja'
        : period.scope === 'seller'
          ? period.userName || 'Vendedor'
          : 'Nenhum selecionado'

  const projectionRows = useMemo(() => {
    return visibleRows.map((row) => {
      const target = toNumber(row.targetValue)
      const current = toNumber(row.currentValue)
      const businessDays = Number(row.businessDaysCount || 0)
      const remainingDays = Number(row.remainingBusinessDays || 0)
      const elapsedDays = Math.max(0, businessDays - remainingDays)
      const dailyAverage = elapsedDays > 0 ? current / elapsedDays : current
      const projectedValue = businessDays > 0 && elapsedDays > 0 ? dailyAverage * businessDays : current
      const projectedGap = Math.max(0, target - projectedValue)
      const neededPerDay = remainingDays > 0 ? Math.max(0, target - current) / remainingDays : 0
      const projectedPercent = target ? Math.round((projectedValue / target) * 100) : 0

      return {
        ...row,
        target,
        current,
        businessDays,
        remainingDays,
        holidayCount: Number(row.holidayCount || 0),
        holidays: Array.isArray(row.holidays) ? row.holidays : [],
        elapsedDays,
        dailyAverage,
        projectedValue,
        projectedGap,
        neededPerDay,
        projectedPercent,
        projectedStatus: statusFromValues(projectedValue, target),
      }
    })
  }, [visibleRows])

  const projectionSummary = useMemo(() => {
    const withTarget = projectionRows.filter((row) => row.target > 0)
    const projectedHit = withTarget.filter((row) => row.projectedPercent >= 100).length
    const averagePercent = withTarget.length
      ? Math.round(withTarget.reduce((sum, row) => sum + row.projectedPercent, 0) / withTarget.length)
      : 0
    const projectedValue = projectionRows.reduce((sum, row) => sum + Number(row.projectedValue || 0), 0)
    const neededPerDay = projectionRows.reduce((sum, row) => sum + Number(row.neededPerDay || 0), 0)
    const businessDays = projectionRows.find((row) => row.businessDays > 0)?.businessDays || 0
    const remainingDays = projectionRows.find((row) => row.businessDays > 0)?.remainingDays || 0

    return {
      total: withTarget.length,
      projectedHit,
      averagePercent,
      projectedValue,
      neededPerDay,
      businessDays,
      remainingDays,
    }
  }, [projectionRows])

  const distributionRows = useMemo(() => {
    return visibleRows.map((row) => ({
      ...row,
      storeTarget: toNumber(row.targetValue),
      sellerTarget: getDistributedTarget(row.targetValue, storeGoalSellers.length, 0),
      sellersCount: storeGoalSellers.length,
    }))
  }, [visibleRows, storeGoalSellers.length])

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/20">
        <div className="border-b border-white/10 bg-slate-900/80 px-5 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">SIT.LUMX CRM</p>
              <h1 className="mt-1 text-3xl font-semibold text-white">Metas</h1>
              <p className="mt-1 text-sm text-slate-300">
                Painel mensal por serviço, com realizado sincronizado por vendedor, loja e grupo econômico.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200">
                {MONTHS[Number(period.month) - 1] || `Mês ${period.month}`} / {period.year}
              </span>
              {(loading || saving) && (
                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-sm text-cyan-100">
                  {saving ? 'Salvando...' : 'Carregando...'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-[1.4fr_1fr]">
          <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Filtro da planilha</h2>
                <p className="text-sm text-slate-400">Escolha o período, a visão e filtre serviços sem remover metas salvas.</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                <span>Mês</span>
                <input name="month" type="number" min="1" max="12" value={period.month} onChange={changePeriod} className="h-11 rounded-md border border-white/10 bg-slate-800 px-3 text-white outline-none transition focus:border-cyan-300" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                <span>Ano</span>
                <input name="year" type="number" value={period.year} onChange={changePeriod} className="h-11 rounded-md border border-white/10 bg-slate-800 px-3 text-white outline-none transition focus:border-cyan-300" />
              </label>
              {isSeller ? (
                <label className="flex flex-col gap-1 text-sm text-slate-300 md:col-span-2">
                  <span>Vendedor</span>
                  <input value={period.userName || currentUser?.name || 'Usuário'} disabled className="h-11 rounded-md border border-white/10 bg-slate-800 px-3 text-slate-300 opacity-80" />
                </label>
              ) : (
                <>
                  {canSelectStore && (
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      <span>Loja</span>
                      <select
                        name="storeName"
                        value={period.scope === 'store' ? period.storeName : ''}
                        onChange={changePeriod}
                        className="h-11 rounded-md border border-white/10 bg-slate-800 px-3 text-white outline-none transition focus:border-cyan-300"
                      >
                        <option value="">Todas / selecione</option>
                        {storeNames.map((store) => <option key={store} value={store}>{store}</option>)}
                      </select>
                    </label>
                  )}
                  {canSelectSeller && (
                    <label className="flex flex-col gap-1 text-sm text-slate-300">
                      <span>Vendedor</span>
                      <select
                        name="userId"
                        value={period.scope === 'seller' ? period.userId : ''}
                        onChange={changePeriod}
                        className="h-11 rounded-md border border-white/10 bg-slate-800 px-3 text-white outline-none transition focus:border-cyan-300"
                      >
                        <option value="">Todos / selecione</option>
                        {sellers.map((user) => <option key={getUserId(user)} value={getUserId(user)}>{user.name || 'Sem nome'}</option>)}
                      </select>
                    </label>
                  )}
                </>
              )}
              {canSelectGroup && (
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  <span>Grupo</span>
                  <select
                    name="groupName"
                    value={period.scope === 'group' ? period.groupName : ''}
                    onChange={changePeriod}
                    className="h-11 rounded-md border border-white/10 bg-slate-800 px-3 text-white outline-none transition focus:border-cyan-300"
                  >
                    <option value="">Todos / selecione</option>
                    <option value={ECONOMIC_GROUP_NAME}>{ECONOMIC_GROUP_NAME}</option>
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                <span>Serviços</span>
                <select
                  value={serviceFilter}
                  onChange={(event) => setServiceFilter(event.target.value)}
                  className="h-11 rounded-md border border-white/10 bg-slate-800 px-3 text-white outline-none transition focus:border-cyan-300"
                >
                  <option value="">Todos os serviços</option>
                  {SERVICES.filter((service) => service !== 'Gross').map((service) => (
                    <option key={service} value={service}>{service}</option>
                  ))}
                  <option value="Gross">Gross</option>
                </select>
              </label>
              {!isSeller && period.scope === 'store' && (
                <>
                  <label className="flex flex-col gap-1 text-sm text-slate-300">
                    <span>Cidade</span>
                    <input name="storeCity" placeholder="Cidade da loja" value={period.storeCity} onChange={changePeriod} className="h-11 rounded-md border border-white/10 bg-slate-800 px-3 text-white outline-none transition focus:border-cyan-300" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-slate-300">
                    <span>UF</span>
                    <input name="storeState" placeholder="UF" value={period.storeState} onChange={changePeriod} maxLength={2} className="h-11 rounded-md border border-white/10 bg-slate-800 px-3 uppercase text-white outline-none transition focus:border-cyan-300" />
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
            <div>
              <p className="text-sm text-slate-400">Resumo do período</p>
              <h2 className="mt-1 break-words text-lg font-semibold text-white md:text-xl">{selectedScopeLabel}</h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="min-w-0 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3">
                <div className="flex items-center justify-between gap-3 text-sm text-cyan-50">
                  <span>Atingimento</span>
                  <span className="font-semibold">{formatPercent(totalProgress)}</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${Math.min(100, totalProgress)}%` }} />
                </div>
              </div>
              <div className="min-w-0 rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-sm text-slate-400">Meta</p>
                <p className="mt-1 break-words text-lg font-semibold text-white">{formatValue(totals.target)}</p>
              </div>
              <div className="min-w-0 rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-sm text-slate-400">Realizado / Gap</p>
                <p className="mt-1 break-words text-lg font-semibold text-white">{formatValue(totals.current)} / {formatValue(totals.gap)}</p>
              </div>
              <div className="min-w-0 rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-sm text-slate-400">Projeção / Necessário dia</p>
                <p className="mt-1 break-words text-lg font-semibold text-white">{formatValue(projectionSummary.projectedValue)} / {formatValue(projectionSummary.neededPerDay)}</p>
              </div>
              <div className="min-w-0 rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-sm text-slate-400">Dias úteis / Restantes</p>
                <p className="mt-1 break-words text-lg font-semibold text-white">{projectionSummary.businessDays || '-'} / {projectionSummary.remainingDays || 0}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && <div className="rounded-lg border border-red-300/30 bg-red-500/15 p-3 text-sm text-red-100">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/15 p-3 text-sm text-emerald-100">{success}</div>}

      {!canShowSpreadsheet ? (
        <div className="rounded-xl border border-white/10 bg-slate-900 p-8 text-slate-300">
          Selecione uma loja, grupo econômico ou vendedor para abrir a planilha de metas.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-900 p-3 md:flex-row md:items-center md:justify-between">
            <div className="flex w-full flex-wrap rounded-lg bg-slate-950 p-1 md:w-fit">
              <button
                type="button"
                onClick={() => setActiveTab('sheet')}
                className={`min-w-0 flex-1 rounded-md px-3 py-2 text-sm font-medium transition md:flex-none md:px-4 ${activeTab === 'sheet' ? 'bg-cyan-300 text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}
              >
                Planilha
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('projection')}
                className={`min-w-0 flex-1 rounded-md px-3 py-2 text-sm font-medium transition md:flex-none md:px-4 ${activeTab === 'projection' ? 'bg-cyan-300 text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}
              >
                Projeção
              </button>
              {period.scope === 'store' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('distribution')}
                  className={`min-w-0 flex-1 rounded-md px-3 py-2 text-sm font-medium transition md:flex-none md:px-4 ${activeTab === 'distribution' ? 'bg-cyan-300 text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}
                >
                  Distribuição
                </button>
              )}
            </div>
            {period.scope === 'group' && (
              <p className="text-sm text-slate-400">
                O grupo econômico soma automaticamente as metas e realizados das lojas cadastradas.
              </p>
            )}
            {period.scope === 'store' && (
              <p className="text-sm text-slate-400">
                Cadastre a meta da loja e distribua automaticamente para os vendedores vinculados.
              </p>
            )}
          </div>

          {activeTab === 'distribution' ? (
            <form onSubmit={saveSpreadsheet} className="overflow-hidden rounded-xl border border-white/10 bg-slate-900">
              <div className="border-b border-white/10 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Distribuição da meta da loja</h2>
                    <p className="mt-1 max-w-3xl text-sm text-slate-400">
                      Informe a meta total na planilha. Ao salvar, o sistema mantém a meta da loja e divide o mesmo objetivo igualmente entre os vendedores ativos de {period.storeName || 'esta loja'}.
                    </p>
                  </div>
                  <label className="flex w-fit items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={distributeStoreGoals}
                      onChange={(e) => setDistributeStoreGoals(e.target.checked)}
                      className="h-4 w-4 accent-cyan-300"
                    />
                    Distribuir ao salvar
                  </label>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="min-w-0 rounded-lg border border-white/10 bg-slate-950 p-4">
                    <p className="text-sm text-slate-400">Vendedores ativos</p>
                    <p className="mt-1 break-words text-xl font-semibold text-white md:text-2xl">{storeGoalSellers.length}</p>
                  </div>
                  <div className="min-w-0 rounded-lg border border-white/10 bg-slate-950 p-4">
                    <p className="text-sm text-slate-400">Meta total da loja</p>
                    <p className="mt-1 break-words text-xl font-semibold text-white md:text-2xl">{formatValue(totals.target)}</p>
                  </div>
                  <div className="min-w-0 rounded-lg border border-white/10 bg-slate-950 p-4">
                    <p className="text-sm text-slate-400">Média por vendedor</p>
                    <p className="mt-1 break-words text-xl font-semibold text-white md:text-2xl">
                      {formatValue(storeGoalSellers.length ? totals.target / storeGoalSellers.length : 0)}
                    </p>
                  </div>
                </div>
                {!storeGoalSellers.length && (
                  <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                    Nenhum vendedor ativo foi encontrado nessa loja. Verifique o cadastro dos vendedores e o nome da loja.
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-separate border-spacing-0">
                  <thead className="bg-slate-950 text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="w-56 px-4 py-3">Serviço</th>
                      <th className="min-w-[180px] px-4 py-3">Meta da loja</th>
                      <th className="min-w-[170px] px-4 py-3">Por vendedor</th>
                      <th className="min-w-[120px] px-4 py-3">Vendedores</th>
                      <th className="min-w-[180px] px-4 py-3">Realizado da loja</th>
                      <th className="min-w-[170px] px-4 py-3">Gap da loja</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {distributionRows.map((row) => (
                      <tr key={row.type} className="transition hover:bg-white/[0.03]">
                        <td className="px-4 py-3 font-semibold text-white">{row.type}</td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-[160px] flex-nowrap items-center gap-2 rounded-lg border border-white/10 bg-slate-800 px-3">
                            {MONEY_SERVICES.has(row.type) && <span className="shrink-0 whitespace-nowrap text-sm text-slate-400">R$</span>}
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.targetValue}
                              onChange={(e) => changeRow(row.type, 'targetValue', e.target.value)}
                              className="h-11 min-w-0 flex-1 whitespace-nowrap bg-transparent text-white outline-none"
                            />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-cyan-100">{formatGoalValue(row.type, row.sellerTarget)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-300">{row.sellersCount}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatGoalValue(row.type, row.currentValue)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatGoalValue(row.type, row.gapValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4">
                <p className="text-sm text-slate-400">
                  A divisão usa os vendedores ativos que têm a mesma loja no cadastro.
                </p>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    disabled={saving || clearingDistribution}
                    type="button"
                    onClick={clearDistribution}
                    className="w-full rounded-md border border-red-300/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-5"
                  >
                    {clearingDistribution ? 'Limpando...' : 'Limpar distribuição'}
                  </button>
                  <button disabled={saving || clearingDistribution || !distributeStoreGoals || !storeGoalSellers.length} type="submit" className="w-full rounded-md bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-5">
                    {saving ? 'Salvando...' : 'Salvar e distribuir'}
                  </button>
                </div>
              </div>
            </form>
          ) : activeTab === 'sheet' ? (
            <form onSubmit={saveSpreadsheet} className="overflow-hidden rounded-xl border border-white/10 bg-slate-900">
              <div className="border-b border-white/10 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Planilha completa de metas</h2>
                    <p className="text-sm text-slate-400">
                      Visão ampla com meta, realizado, gap, percentual, projeção, médias e dias úteis na mesma tabela.
                    </p>
                  </div>
                  <span className="w-fit rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-sm font-semibold text-cyan-100">
                    Projeção média {projectionSummary.averagePercent}%
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1540px] border-separate border-spacing-0">
                  <thead className="bg-slate-950 text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="w-48 px-4 py-3">Serviço</th>
                      <th className="min-w-[180px] px-4 py-3">Meta</th>
                      <th className="min-w-[160px] px-4 py-3">Realizado</th>
                      <th className="min-w-[150px] px-4 py-3">Gap</th>
                      <th className="min-w-[120px] px-4 py-3">%</th>
                      <th className="min-w-[150px] px-4 py-3">Projeção</th>
                      <th className="min-w-[150px] px-4 py-3">Média atual</th>
                      <th className="min-w-[150px] px-4 py-3">Necessário/dia</th>
                      <th className="min-w-[120px] px-4 py-3">Dias úteis</th>
                      <th className="min-w-[120px] px-4 py-3">Restante</th>
                      <th className="min-w-[220px] px-4 py-3">Evolução</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {projectionRows.map((row) => {
                      const progress = getProgressPercent(row.current, row.target)
                      const achievement = getAchievementPercent(row.current, row.target)
                      const progressColor = getAchievementColor(row.current, row.target)
                      const progressTextColor = getAchievementTextColor(row.current, row.target)
                      return (
                        <tr key={row.type} className="transition hover:bg-white/[0.03]">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-white">{row.type}</div>
                          </td>
                          <td className="px-4 py-3">
                            {period.scope === 'store' ? (
                              <div className="h-10 min-w-[150px] whitespace-nowrap rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-300">
                                {formatGoalValue(row.type, row.target)}
                              </div>
                            ) : (
                              <div className="flex min-w-[150px] flex-nowrap items-center gap-2 rounded-lg border border-white/10 bg-slate-800 px-3">
                                {MONEY_SERVICES.has(row.type) && <span className="shrink-0 whitespace-nowrap text-sm text-slate-400">R$</span>}
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.targetValue}
                                  onChange={(e) => changeRow(row.type, 'targetValue', e.target.value)}
                                  className="h-11 min-w-0 flex-1 whitespace-nowrap bg-transparent text-white outline-none"
                                />
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-200">{formatGoalValue(row.type, row.current)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">{formatGoalValue(row.type, row.gapValue)}</td>
                          <td className={`whitespace-nowrap px-4 py-3 text-sm font-semibold ${progressTextColor}`}>{formatPercent(achievement)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-white">{formatGoalValue(row.type, row.projectedValue)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">{formatGoalValue(row.type, row.dailyAverage)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">{formatGoalValue(row.type, row.neededPerDay)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">{row.businessDays || '-'}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">{row.remainingDays || 0}</td>
                          <td className="px-4 py-3">
                            <div className="min-w-[190px]">
                              <div className="mb-1.5 flex items-center justify-between gap-3">
                                <span className="text-xs font-semibold text-slate-300">
                                  {getStatusLabel(row.status)}
                                </span>
                                <span className={`text-xs font-semibold ${progressTextColor}`}>
                                  {formatPercent(achievement)}
                                </span>
                              </div>
                              <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                                <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${Math.min(100, progress)}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4">
                <p className="text-sm text-slate-400">
                  {period.scope === 'store'
                    ? 'Metas de loja são editadas somente na aba Distribuição.'
                    : 'Alterações são salvas no Firestore e sincronizadas em tempo real.'}
                </p>
                {period.scope !== 'store' && (
                  <button disabled={saving} type="submit" className="rounded-md bg-cyan-300 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? 'Salvando...' : 'Salvar planilha'}
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900">
              <div className="border-b border-white/10 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Projeção de atingimento</h2>
                    <div className="text-sm text-slate-400">
                      {projectionSummary.projectedHit} de {projectionSummary.total} metas com tendência de batimento - {projectionSummary.averagePercent}% médio projetado
                    </div>
                    <div className="text-sm text-slate-400">
                      Calendário: {period.scope === 'group' ? `Grupo econômico ${ECONOMIC_GROUP_NAME}` : `${period.storeCity || projectionRows[0]?.calendarCity || 'cidade'} / ${period.storeState || projectionRows[0]?.calendarState || 'UF'}`} - domingos e feriados excluídos, sábados considerados.
                    </div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200">
                    Média projetada {projectionSummary.averagePercent}%
                  </span>
                </div>
                {projectionRows[0]?.holidays?.length > 0 && (
                  <div className="mt-2 text-xs text-slate-400">
                    Feriados do mês: {projectionRows[0].holidays.map((holiday) => `${holiday.date}${holiday.storeName ? ` ${holiday.storeName}` : ''} - ${holiday.name}`).join(' | ')}
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1280px] border-collapse">
                  <thead className="bg-slate-950 text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="p-3 w-52">Serviço</th>
                      <th className="p-3">Meta</th>
                      <th className="p-3">Realizado</th>
                      <th className="p-3">Média diária</th>
                      <th className="p-3">Dias úteis</th>
                      <th className="p-3">Feriados</th>
                      <th className="p-3">Dias restantes</th>
                      <th className="p-3">Projeção final</th>
                      <th className="p-3">Gap projetado</th>
                      <th className="p-3">Necessário/dia</th>
                      <th className="p-3">Atingimento</th>
                      <th className="p-3">Tendência</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {projectionRows.map((row) => (
                      <tr key={row.type} className="transition hover:bg-white/[0.03]">
                        <td className="p-3 font-semibold text-white">{row.type}</td>
                        <td className="p-3 text-slate-300">{formatGoalValue(row.type, row.target)}</td>
                        <td className="p-3 text-slate-300">{formatGoalValue(row.type, row.current)}</td>
                        <td className="p-3 text-slate-300">{formatGoalValue(row.type, row.dailyAverage)}</td>
                        <td className="p-3 text-slate-300">{row.businessDays || '-'}</td>
                        <td className="p-3 text-sm text-slate-300" title={row.holidays.map((holiday) => `${holiday.date}${holiday.storeName ? ` ${holiday.storeName}` : ''} - ${holiday.name}`).join('\n')}>
                          {row.holidayCount || 0}
                        </td>
                        <td className="p-3 text-slate-300">{row.remainingDays || 0}</td>
                        <td className="p-3 font-semibold text-white">{formatGoalValue(row.type, row.projectedValue)}</td>
                        <td className="p-3 text-slate-300">{formatGoalValue(row.type, row.projectedGap)}</td>
                        <td className="p-3 text-slate-300">{formatGoalValue(row.type, row.neededPerDay)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded bg-slate-800">
                              <div className="h-full rounded bg-cyan-300" style={{ width: `${Math.min(100, row.projectedPercent)}%` }} />
                            </div>
                            <span className="text-sm text-slate-200">{row.projectedPercent}%</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusClass(row.projectedStatus)}`}>
                            {getStatusLabel(row.projectedStatus)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
