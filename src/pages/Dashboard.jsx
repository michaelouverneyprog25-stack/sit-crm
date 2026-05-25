import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Clock3, RefreshCw, ShoppingBag } from 'lucide-react'
import { getGoalRankings, getGoals, getStores, getUsers, getVendas } from '../firebase/db'
import { useAuth } from '../contexts/AuthContext'
import { MetricCard, PageHeader } from '../components/ui'
import Logo from '../components/Logo'

const SERVICES = [
  'Gross',
  'Receita Total',
]
const MONEY_SERVICES = new Set(['Receita Total', 'Aparelhos', 'Acessórios', 'PayJoy', 'Seguros'])
const RANKING_GOAL_TYPES = new Set(SERVICES)
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const ECONOMIC_GROUP_NAME = 'INTERCELL'
const HOURLY_PARTIAL_START = 9
const HOURLY_PARTIAL_END = 21

function defaultFilters() {
  const now = new Date()
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    scope: '',
    storeName: '',
    groupName: '',
    userId: '',
    userName: '',
  }
}

function numberValue(value) {
  return Number(value || 0)
}

function formatNumber(value) {
  return numberValue(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatQuantity(value) {
  return numberValue(value).toLocaleString('pt-BR', {
    maximumFractionDigits: 0,
  })
}

function formatGoalValue(type, value) {
  const formatted = formatNumber(value)
  return MONEY_SERVICES.has(type) ? `R$ ${formatted}` : formatted
}

function getMonthName(month) {
  return MONTH_NAMES[Number(month) - 1] || 'Mês'
}

function goalPercent(goal) {
  const target = numberValue(goal.targetValue)
  if (!target) return 0
  return Math.round((numberValue(goal.currentValue) / target) * 100)
}

function isGoalAchieved(goal) {
  return ['meta batida', 'super meta'].includes(goal?.status)
}

function getGoalTimestamp(goal) {
  const value = goal?.updatedAt || goal?.createdAt || ''
  if (value?.seconds) return value.seconds * 1000
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function pickRankingGoal(current, next) {
  if (!current) return next
  const currentHasTarget = numberValue(current.targetValue) > 0
  const nextHasTarget = numberValue(next.targetValue) > 0
  if (nextHasTarget !== currentHasTarget) return nextHasTarget ? next : current
  const currentTime = getGoalTimestamp(current)
  const nextTime = getGoalTimestamp(next)
  if (nextTime !== currentTime) return nextTime > currentTime ? next : current
  return goalPercent(next) > goalPercent(current) ? next : current
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeRole(value) {
  const role = normalize(value)
  if (role === 'administrador' || role === 'admin' || role === 'adm') return 'Administrador'
  if (role === 'gestor master' || role === 'gestor marter') return 'Gestor Master'
  if (role === 'gerente') return 'Gerente'
  if (role === 'vendedor') return 'Vendedor'
  if (role === 'executivo') return 'Executivo'
  return value || ''
}

function normalizePlan(value) {
  return normalize(value).toUpperCase()
}

function planStartsWith(sale, prefix) {
  return normalizePlan(sale.plan).startsWith(normalizePlan(prefix))
}

function planIncludes(sale, text) {
  return normalizePlan(sale.plan).includes(normalizePlan(text))
}

function isDependentSale(sale) {
  return normalizePlan(sale.plan) === 'DEPENDENTE'
}

function hasDeviceSale(sale) {
  return sale.saleType === 'Aparelhos'
    || (sale.saleType === 'Upgrade' && normalize(sale.addDeviceToUpgrade).includes('sim'))
    || (sale.saleType === 'Upgrade' && Number(sale.deviceValue || 0) > 0)
}

function hasPortability(sale) {
  return sale.saleType === 'Portabilidade'
    || normalize(sale.saleType).includes('portabilidade')
    || (sale.saleType === 'Aparelhos' && normalize(sale.deviceSaleMode).includes('portabilidade'))
    || normalize(sale.portability).includes('sim')
    || normalize(sale.portabilidade).includes('sim')
    || Boolean(String(sale.provisionalNumber || '').trim())
}

function getSaleRevenueValue(sale) {
  if (isDependentSale(sale)) return 0
  if (normalize(sale.saleType).includes('acessorio')) return 0
  if (sale.saleType === 'Upgrade') return 0
  const value = sale.planValue !== undefined && sale.planValue !== ''
    ? Number(sale.planValue || 0)
    : Number(sale.amount || 0)
  return Number.isFinite(value) ? value : 0
}

function getSaleRevenueCategory(sale) {
  if (planStartsWith(sale, 'BLACK')) return 'pos'
  if (planStartsWith(sale, 'CONTROLE')) return 'controle'
  if (planIncludes(sale, 'FIBRA') || normalize(sale.saleType).includes('fibra')) return 'fibra'
  return 'outras'
}

function getDependentCount(sale) {
  const count = Math.max(0, Number(sale.dependentCount ?? sale.dependents ?? 0) || 0)
  return count || (isDependentSale(sale) ? 1 : 0)
}

function getAccessoryValue(sale) {
  if (sale.accessoryValue !== undefined && sale.accessoryValue !== '') {
    return Number(sale.accessoryValue || 0)
  }
  if (normalize(sale.saleType).includes('acessorio') || normalize(sale.plan).includes('acessorio')) {
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
      if (isUpgradeSale) return 0
      if (isDependentSale(sale)) return getDependentCount(sale) || 1
      return planStartsWith(sale, 'BLACK') ? 1 + getDependentCount(sale) : 0
    case 'Upgrade':
      return isUpgradeSale ? 1 : 0
    case 'Portabilidade':
      return hasPortability(sale) ? 1 : 0
    case 'DACC':
      return sale.dacc === 'Sim' ? 1 : 0
    case 'Fibra':
      return planIncludes(sale, 'FIBRA') || normalize(sale.saleType).includes('fibra') || normalize(sale.access).includes('fibra') ? 1 : 0
    case 'Acessórios':
      return getAccessoryValue(sale)
    case 'PayJoy':
      return sale.payJoy === 'Sim' || sale.payjoy === 'Sim' || normalize(sale.saleType).includes('payjoy') ? amount : 0
    case 'Seguros':
      return sale.insurance === 'Sim' || sale.seguro === 'Sim' || normalize(sale.saleType).includes('seguro') ? getInsuranceValue(sale) : 0
    default:
      return 0
  }
}

function statusFromValues(currentValue, targetValue) {
  const current = numberValue(currentValue)
  const target = numberValue(targetValue)
  if (!target) return 'sem meta'
  if (current >= target * 1.1) return 'super meta'
  if (current >= target) return 'meta batida'
  if (current > 0) return 'em andamento'
  return 'abaixo da meta'
}

function getUserId(user = {}) {
  return user.uid || user.id || ''
}

function getSaleDate(sale) {
  const value = sale.saleDate || sale.createdAt
  if (!value) return null
  const date = sale.saleDate ? new Date(`${sale.saleDate}T12:00:00`) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getSaleSellerLabel(sale, users) {
  const user = users.find((item) => item.uid === sale.userId || item.id === sale.userId || item.email === sale.seller || item.email === sale.userEmail)
  return user?.name || sale.userName || 'Sem vendedor'
}

function getUserStoreName(user = {}) {
  return user.storeName || user.store || user.loja || ''
}

function getSaleUser(sale, users) {
  return users.find((item) => item.uid === sale.userId || item.id === sale.userId || item.email === sale.seller || item.email === sale.userEmail)
}

function getSaleStoreName(sale, users) {
  const user = getSaleUser(sale, users)
  return sale.storeName || getUserStoreName(user) || ''
}

function saleBelongsToCurrentUser(sale, currentUser) {
  return sale.userId === currentUser?.uid
    || sale.seller === currentUser?.email
    || sale.userEmail === currentUser?.email
}

function saleMatchesEntity(sale, filters, users, currentUser, isSeller) {
  if (isSeller) {
    return saleBelongsToCurrentUser(sale, currentUser)
  }

  if (filters.scope === 'seller' && filters.userId) {
    const user = users.find((item) => item.uid === filters.userId || item.id === filters.userId)
    return sale.userId === filters.userId || (user?.email && (sale.seller === user.email || sale.userEmail === user.email))
  }

  if (filters.scope === 'store' && filters.storeName) {
    return normalize(getSaleStoreName(sale, users)) === normalize(filters.storeName)
  }

  if (filters.scope === 'group' && filters.groupName) {
    return true
  }

  return true
}

function goalMatchesPeriod(goal, filters) {
  return Number(goal.month) === Number(filters.month)
    && Number(goal.year) === Number(filters.year)
}

function getRevenueFromGoals(goals, filters, users, currentUser, currentUserProfile, registeredStoreKeys) {
  const revenueGoals = goals.filter((goal) => goal.type === 'Receita Total' && goalMatchesPeriod(goal, filters))
  const role = normalizeRole(currentUser?.role)

  if (role === 'Vendedor') {
    const goal = revenueGoals.find((item) => item.userId === currentUser?.uid && !item.storeName && !item.groupName)
    return goal ? numberValue(goal.currentValue) : null
  }

  if (role === 'Gerente') {
    const managerStore = normalize(getUserStoreName(currentUserProfile))
    if (!managerStore) return null
    const storeGoal = revenueGoals.find((item) => normalize(item.storeName) === managerStore && !item.userId && !item.groupName)
    if (storeGoal) return numberValue(storeGoal.currentValue)

    return revenueGoals
      .filter((goal) => {
        if (!goal.userId || goal.storeName || goal.groupName) return false
        const user = users.find((item) => getUserId(item) === goal.userId)
        return normalize(getUserStoreName(user)) === managerStore
      })
      .reduce((sum, goal) => sum + numberValue(goal.currentValue), 0)
  }

  if (role === 'Gestor Master') {
    const storeGoals = revenueGoals.filter((goal) => {
      if (!goal.storeName || goal.userId || goal.groupName) return false
      if (!registeredStoreKeys.size) return true
      return registeredStoreKeys.has(normalize(goal.storeName))
    })
    if (storeGoals.length) {
      return storeGoals.reduce((sum, goal) => sum + numberValue(goal.currentValue), 0)
    }

    const groupGoal = revenueGoals.find((goal) => normalize(goal.groupName) === normalize(ECONOMIC_GROUP_NAME))
    return groupGoal ? numberValue(groupGoal.currentValue) : null
  }

  return null
}

function saleInChartPeriod(sale, filters, chartPeriod) {
  const date = getSaleDate(sale)
  if (!date || date.getFullYear() !== Number(filters.year)) return false
  if (chartPeriod === 'monthly') return true
  return date.getMonth() + 1 === Number(filters.month)
}

function saleInSelectedMonth(sale, filters) {
  const date = getSaleDate(sale)
  return !!date && date.getMonth() + 1 === Number(filters.month) && date.getFullYear() === Number(filters.year)
}

function getSaleDateTime(sale) {
  if (sale.saleDate && sale.saleTime) {
    const time = String(sale.saleTime).slice(0, 5)
    const date = new Date(`${sale.saleDate}T${time}:00`)
    if (!Number.isNaN(date.getTime())) return date
  }
  if (sale.createdAt?.toDate) return sale.createdAt.toDate()
  if (sale.createdAt) {
    const date = new Date(sale.createdAt)
    if (!Number.isNaN(date.getTime())) return date
  }
  return getSaleDate(sale)
}

function buildHourlyPartialRows(sales) {
  const rows = Array.from({ length: HOURLY_PARTIAL_END - HOURLY_PARTIAL_START + 1 }, (_, index) => {
    const hour = HOURLY_PARTIAL_START + index
    return {
      hour,
      label: `${String(hour).padStart(2, '0')}h`,
      gross: 0,
      upgrade: 0,
      portability: 0,
      fiber: 0,
      revenue: 0,
    }
  })
  const rowsByHour = new Map(rows.map((row) => [row.hour, row]))

  sales.forEach((sale) => {
    const date = getSaleDateTime(sale)
    if (!date) return
    const row = rowsByHour.get(date.getHours())
    if (!row) return
    row.gross += getSaleGoalValue(sale, 'Pós') + getSaleGoalValue(sale, 'Controle')
    row.upgrade += getSaleGoalValue(sale, 'Upgrade')
    row.portability += getSaleGoalValue(sale, 'Portabilidade')
    row.fiber += getSaleGoalValue(sale, 'Fibra')
    row.revenue += getSaleGoalValue(sale, 'Receita Total')
  })

  return rows
}

function getHourlyPartialTotals(rows) {
  return rows.reduce((totals, row) => ({
    gross: totals.gross + row.gross,
    upgrade: totals.upgrade + row.upgrade,
    portability: totals.portability + row.portability,
    fiber: totals.fiber + row.fiber,
    revenue: totals.revenue + row.revenue,
  }), { gross: 0, upgrade: 0, portability: 0, fiber: 0, revenue: 0 })
}

function buildEmptySeries(chartPeriod, filters) {
  if (chartPeriod === 'monthly') {
    return MONTH_LABELS.map((label, index) => ({ label, index, amount: 0, count: 0 }))
  }

  if (chartPeriod === 'weekly') {
    return Array.from({ length: 5 }, (_, index) => ({
      label: `Sem ${index + 1}`,
      index,
      amount: 0,
      count: 0,
    }))
  }

  const days = new Date(Number(filters.year), Number(filters.month), 0).getDate()
  return Array.from({ length: days }, (_, index) => ({
    label: String(index + 1).padStart(2, '0'),
    index,
    amount: 0,
    count: 0,
  }))
}

function buildPerformanceSeries(sales, chartPeriod, filters) {
  const series = buildEmptySeries(chartPeriod, filters)
  sales
    .filter((sale) => saleInChartPeriod(sale, filters, chartPeriod))
    .forEach((sale) => {
      const date = getSaleDate(sale)
      if (!date) return
      const index = getSeriesIndex(date, chartPeriod)
      if (!series[index]) return
      series[index].amount += getSaleRevenueValue(sale)
      series[index].count += 1
    })
  return series
}

function getSeriesIndex(date, chartPeriod) {
  if (chartPeriod === 'monthly') return date.getMonth()
  if (chartPeriod === 'weekly') return Math.min(4, Math.floor((date.getDate() - 1) / 7))
  return date.getDate() - 1
}

function BarChart({ title, subtitle, rows, emptyText }) {
  const max = Math.max(...rows.map((item) => item.amount), 0)

  return (
    <div className="rounded-lg border border-white/10 bg-gray-800 p-5">
      <div className="mb-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle && <div className="text-sm text-gray-400">{subtitle}</div>}
      </div>
      <div className="space-y-3">
        {rows.map((item) => {
          const width = max ? Math.max(3, (item.amount / max) * 100) : 0
          return (
            <div key={item.label}>
              <div className="flex justify-between gap-3 text-sm text-gray-300 mb-1">
                <span>{item.label}</span>
                <span>R$ {formatNumber(item.amount)} • {item.count} vendas</span>
              </div>
              <div className="h-3 bg-gray-700 rounded overflow-hidden">
                <div className="h-full rounded bg-cyan-300" style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
        {!rows.length && <div className="text-gray-400">{emptyText || 'Sem dados para o período.'}</div>}
      </div>
    </div>
  )
}

function GoalRankingCard({ title, subtitle, rows, emptyText, showSeparator = false }) {
  return (
    <div className="bg-gray-800 rounded p-5">
      <div className="mb-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle && <div className="text-sm text-gray-400">{subtitle}</div>}
      </div>
      <div className="space-y-2">
        {rows.map((item) => (
          <div key={`${item.id}-${item.position}`} className={`bg-gray-900 p-3 rounded border ${item.separated && showSeparator ? 'border-cyan-300/50' : 'border-white/10'}`}>
            {item.separated && showSeparator && (
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">Sua colocação</div>
            )}
            <div className="flex justify-between gap-3">
              <div>
                <div className="font-semibold">{item.position}. {item.name}</div>
                <div className="text-xs text-gray-400">
                  Projeção: {item.achieved} de {item.items} metas no ritmo atual
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{item.percent}%</div>
                <div className="text-xs text-gray-500">atual {item.currentPercent}%</div>
              </div>
            </div>
            <div className="h-2 bg-gray-700 rounded mt-2 overflow-hidden">
              <div className="h-full bg-cyan-300 rounded" style={{ width: `${Math.min(100, item.percent)}%` }} />
            </div>
          </div>
        ))}
        {!rows.length && <div className="text-gray-400">{emptyText || 'Sem ranking para o período selecionado.'}</div>}
      </div>
    </div>
  )
}

function CompactColumnChart({ title, subtitle, rows, emptyText }) {
  const visibleRows = rows.filter((item) => item.amount || item.count)
  const max = Math.max(...visibleRows.map((item) => item.amount), 0)

  return (
    <div className="rounded-lg border border-white/10 bg-gray-800 p-5">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle && <div className="text-sm text-gray-400">{subtitle}</div>}
      </div>
      {visibleRows.length ? (
        <div className="flex h-64 items-end gap-2 overflow-x-auto pb-1">
          {visibleRows.map((item) => {
            const height = max ? Math.max(8, (item.amount / max) * 100) : 0
            return (
              <div key={item.label} className="flex min-w-[42px] flex-1 flex-col items-center gap-2">
                <div className="flex h-44 w-full items-end rounded bg-gray-900/80 px-1">
                  <div
                    className="w-full rounded-t bg-cyan-300 transition-all"
                    style={{ height: `${height}%` }}
                    title={`${item.label}: R$ ${formatNumber(item.amount)} em ${item.count} vendas`}
                  />
                </div>
                <div className="text-center text-xs text-gray-400">{item.label}</div>
                <div className="text-center text-[11px] text-gray-500">{item.count}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded bg-gray-900/70 text-gray-400">
          {emptyText || 'Sem dados para o período.'}
        </div>
      )}
    </div>
  )
}

function HourlyPartialTable({ title, subtitle, rows, totals }) {
  return (
    <section className="rounded-lg border border-white/10 bg-gray-800 p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <div className="text-sm text-gray-400">{subtitle}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          <div className="rounded border border-white/10 bg-gray-900 px-3 py-2">
            <div className="text-gray-400">Gross</div>
            <div className="font-semibold">{formatQuantity(totals.gross)}</div>
          </div>
          <div className="rounded border border-white/10 bg-gray-900 px-3 py-2">
            <div className="text-gray-400">Upgrade</div>
            <div className="font-semibold">{formatQuantity(totals.upgrade)}</div>
          </div>
          <div className="rounded border border-white/10 bg-gray-900 px-3 py-2">
            <div className="text-gray-400">Portabilidade</div>
            <div className="font-semibold">{formatQuantity(totals.portability)}</div>
          </div>
          <div className="rounded border border-white/10 bg-gray-900 px-3 py-2">
            <div className="text-gray-400">Fibra</div>
            <div className="font-semibold">{formatQuantity(totals.fiber)}</div>
          </div>
          <div className="rounded border border-white/10 bg-gray-900 px-3 py-2">
            <div className="text-gray-400">Receita</div>
            <div className="font-semibold">R$ {formatNumber(totals.revenue)}</div>
          </div>
        </div>
      </div>
      <div className="max-h-[460px] overflow-auto rounded border border-white/10">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="sticky top-0 bg-gray-900 text-left text-xs uppercase text-gray-400">
            <tr>
              <th className="p-3">Hora</th>
              <th className="p-3">Gross</th>
              <th className="p-3">Upgrade</th>
              <th className="p-3">Portabilidade</th>
              <th className="p-3">Fibra</th>
              <th className="p-3">Receita</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.hour} className="border-t border-white/10">
                <td className="p-3 font-semibold text-gray-200">{row.label}</td>
                <td className="p-3">{formatQuantity(row.gross)}</td>
                <td className="p-3">{formatQuantity(row.upgrade)}</td>
                <td className="p-3">{formatQuantity(row.portability)}</td>
                <td className="p-3">{formatQuantity(row.fiber)}</td>
                <td className="p-3">R$ {formatNumber(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function getSeriesTotals(rows) {
  return rows.reduce((totals, row) => ({
    amount: totals.amount + numberValue(row.amount),
    count: totals.count + numberValue(row.count),
  }), { amount: 0, count: 0 })
}

function getActiveRows(rows) {
  return rows.filter((row) => row.amount || row.count)
}

function getBestRow(rows) {
  return getActiveRows(rows).sort((a, b) => b.amount - a.amount || b.count - a.count)[0] || null
}

function compareRows(current, previous) {
  if (!current || !previous) return null
  const diff = numberValue(current.amount) - numberValue(previous.amount)
  const percent = previous.amount ? Math.round((diff / previous.amount) * 100) : null
  return { diff, percent }
}

function buildFeedbackText(comparison) {
  if (!comparison) return 'Ainda não há base anterior suficiente para comparar.'
  if (comparison.diff > 0) {
    return comparison.percent === null
      ? 'Avançou em relação ao período anterior.'
      : `Cresceu ${comparison.percent}% em relação ao período anterior.`
  }
  if (comparison.diff < 0) {
    return comparison.percent === null
      ? 'Ficou abaixo do período anterior.'
      : `Caiu ${Math.abs(comparison.percent)}% em relação ao período anterior.`
  }
  return 'Manteve o mesmo resultado do período anterior.'
}

export default function Dashboard() {
  const { currentUser, authError } = useAuth()
  const [filters, setFilters] = useState(defaultFilters)
  const [sales, setSales] = useState([])
  const [users, setUsers] = useState([])
  const [stores, setStores] = useState([])
  const [selectedGoals, setSelectedGoals] = useState([])
  const [rankingGoals, setRankingGoals] = useState([])
  const [goalRankings, setGoalRankings] = useState({ sellers: [], stores: [], groups: [], ownPosition: null })
  const [dashboardRevenue, setDashboardRevenue] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const currentUserRole = normalizeRole(currentUser?.role)
  const isSeller = currentUserRole === 'Vendedor'
  const isManager = currentUserRole === 'Gerente'
  const canViewStoreComparison = ['Administrador', 'Gestor Master'].includes(currentUserRole)
  const canViewHourlyPartial = ['Administrador', 'Gestor Master', 'Gerente'].includes(currentUserRole)
  const canSelectScope = !isSeller
  const sellers = users
    .filter((user) => !user.disabled && getUserId(user))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
  const storeNames = useMemo(() => {
    const byName = new Map()
    stores.forEach((store) => {
      const name = store.name
      const key = normalize(name)
      if (key) byName.set(key, name)
    })
    users.forEach((user) => {
      const name = user.storeName || user.store || user.loja
      const key = normalize(name)
      if (key && !byName.has(key)) byName.set(key, name)
    })
    return [...byName.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [stores, users])
  const currentUserProfile = useMemo(() => {
    return users.find((user) => getUserId(user) === currentUser?.uid || user.email === currentUser?.email) || currentUser || {}
  }, [users, currentUser])
  const registeredStoreKeys = useMemo(() => {
    const keys = stores
      .map((store) => normalize(store.name))
      .filter(Boolean)
    return new Set(keys.length ? keys : storeNames.map(normalize).filter(Boolean))
  }, [stores, storeNames])

  const hasGoalSelection = (isSeller && filters.userId) || (filters.scope === 'store' && filters.storeName) || (filters.scope === 'seller' && filters.userId) || (filters.scope === 'group' && filters.groupName)

  async function loadDashboardRevenue({ usersData = [], storesData = [] } = {}) {
    const role = currentUserRole
    const month = filters.month
    const year = filters.year

    if (role === 'Vendedor') {
      const goals = await getGoals({ month, year, userId: currentUser?.uid })
      const revenueGoal = goals.find((goal) => goal.type === 'Receita Total' && !goal.storeName && !goal.groupName)
      return revenueGoal ? numberValue(revenueGoal.currentValue) : null
    }

    if (role === 'Gerente') {
      const profile = usersData.find((user) => getUserId(user) === currentUser?.uid || user.email === currentUser?.email) || currentUser || {}
      const storeName = getUserStoreName(profile)
      if (!storeName) return null

      const storeGoals = await getGoals({ month, year, storeName })
      const storeRevenueGoal = storeGoals.find((goal) => goal.type === 'Receita Total' && normalize(goal.storeName) === normalize(storeName))
      if (storeRevenueGoal) return numberValue(storeRevenueGoal.currentValue)

      const allGoals = await getGoals({ month, year })
      return allGoals
        .filter((goal) => {
          if (goal.type !== 'Receita Total' || !goal.userId || goal.storeName || goal.groupName) return false
          const seller = usersData.find((user) => getUserId(user) === goal.userId)
          return normalize(getUserStoreName(seller)) === normalize(storeName)
        })
        .reduce((sum, goal) => sum + numberValue(goal.currentValue), 0)
    }

    if (role === 'Gestor Master') {
      const allGoals = await getGoals({ month, year })
      const storeKeys = new Set(storesData.map((store) => normalize(store.name)).filter(Boolean))
      const storeRevenueGoals = allGoals.filter((goal) => {
        if (goal.type !== 'Receita Total' || !goal.storeName || goal.userId || goal.groupName) return false
        return !storeKeys.size || storeKeys.has(normalize(goal.storeName))
      })

      if (storeRevenueGoals.length) {
        return storeRevenueGoals.reduce((sum, goal) => sum + numberValue(goal.currentValue), 0)
      }

      const groupRevenueGoal = allGoals.find((goal) => goal.type === 'Receita Total' && normalize(goal.groupName) === normalize(ECONOMIC_GROUP_NAME))
      return groupRevenueGoal ? numberValue(groupRevenueGoal.currentValue) : null
    }

    return null
  }

  useEffect(() => {
    if (!isSeller || !currentUser?.uid) return
    setFilters((current) => ({
      ...current,
      scope: 'seller',
      userId: currentUser.uid,
      userName: currentUser.name || '',
      storeName: '',
    }))
  }, [isSeller, currentUser?.uid, currentUser?.name, currentUser?.email])

  useEffect(() => {
    if (!isManager) return
    const storeName = getUserStoreName(currentUserProfile)
    if (!storeName) return
    setFilters((current) => {
      if (current.scope === 'store' && normalize(current.storeName) === normalize(storeName)) return current
      return {
        ...current,
        scope: 'store',
        storeName,
        groupName: '',
        userId: '',
        userName: '',
      }
    })
  }, [isManager, currentUserProfile])

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')

    try {
      const usersRequest = isSeller
        ? Promise.resolve([{
            uid: currentUser?.uid,
            id: currentUser?.uid,
            name: currentUser?.name,
            email: currentUser?.email,
            role: currentUser?.role,
          }])
        : getUsers().catch((err) => {
            console.error('Erro ao carregar usuários:', err)
            return []
          })

      const storesRequest = isSeller
        ? Promise.resolve([])
        : getStores().catch((err) => {
            console.error('Erro ao carregar lojas:', err)
            return []
          })

      const selectedGoalFilter = {
        month: filters.month,
        year: filters.year,
        userId: filters.scope === 'seller' || isSeller ? filters.userId || currentUser?.uid : undefined,
        storeName: filters.scope === 'store' ? filters.storeName : undefined,
        groupName: filters.scope === 'group' ? filters.groupName : undefined,
      }

      const [salesData, usersData, storesData, selectedGoalData, rankingGoalData, goalRankingData] = await Promise.all([
        getVendas(isSeller ? { seller: currentUser?.email } : {}).catch((err) => {
          console.error('Erro ao carregar vendas:', err)
          return []
        }),
        usersRequest,
        storesRequest,
        hasGoalSelection ? getGoals(selectedGoalFilter).catch((err) => {
          console.error('Erro ao carregar metas selecionadas:', err)
          return []
        }) : Promise.resolve([]),
        getGoals({
          month: filters.month,
          year: filters.year,
          userId: isSeller ? currentUser?.uid : undefined,
        }).catch((err) => {
          console.error('Erro ao carregar ranking:', err)
          return []
        }),
        getGoalRankings({
          month: filters.month,
          year: filters.year,
        }).catch((err) => {
          console.error('Erro ao carregar ranking de atingimento:', err)
          return { sellers: [], stores: [], groups: [], ownPosition: null }
        }),
      ])
      const loadedUsers = Array.isArray(usersData) ? usersData : []
      const loadedStores = Array.isArray(storesData) ? storesData : []
      const revenueValue = await loadDashboardRevenue({ usersData: loadedUsers, storesData: loadedStores }).catch((err) => {
        console.error('Erro ao carregar receita do dashboard:', err)
        return null
      })

      setSales(Array.isArray(salesData) ? salesData : [])
      setUsers(loadedUsers)
      setStores(loadedStores)
      setSelectedGoals(Array.isArray(selectedGoalData) ? selectedGoalData : [])
      setRankingGoals(Array.isArray(rankingGoalData) ? rankingGoalData : [])
      setGoalRankings(goalRankingData || { sellers: [], stores: [], groups: [], ownPosition: null })
      setDashboardRevenue(revenueValue)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err)
      setError('Não foi possível carregar os dados do dashboard.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [currentUser?.email, currentUser?.name, currentUser?.role, currentUser?.uid, filters.month, filters.year, filters.scope, filters.storeName, filters.groupName, filters.userId, hasGoalSelection, isSeller])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    const interval = setInterval(() => {
      loadDashboard({ silent: true })
    }, 30000)

    return () => clearInterval(interval)
  }, [loadDashboard])

  function changeFilter(e) {
    const { name, value } = e.target
    if (name === 'scope') {
      setFilters((current) => ({ ...current, scope: value, storeName: '', groupName: value === 'group' ? ECONOMIC_GROUP_NAME : '', userId: '', userName: '' }))
      return
    }
    if (name === 'userId') {
      const user = users.find((item) => getUserId(item) === value)
      setFilters((current) => ({ ...current, userId: value, userName: user?.name || '', storeName: '', groupName: '' }))
      return
    }
    if (name === 'storeName') {
      setFilters((current) => ({ ...current, storeName: value, groupName: '', userId: '', userName: '' }))
      return
    }
    setFilters((current) => ({ ...current, [name]: value }))
  }

  const dashboardSales = useMemo(() => {
    const role = currentUserRole

    if (role === 'Vendedor') {
      return sales.filter((sale) => saleBelongsToCurrentUser(sale, currentUser))
    }

    if (role === 'Gerente') {
      const managerStore = normalize(getUserStoreName(currentUserProfile))
      if (!managerStore) return []
      return sales.filter((sale) => normalize(getSaleStoreName(sale, users)) === managerStore)
    }

    if (role === 'Gestor Master') {
      if (!registeredStoreKeys.size) return sales
      return sales.filter((sale) => registeredStoreKeys.has(normalize(getSaleStoreName(sale, users))))
    }

    return sales
  }, [sales, users, currentUser, currentUserProfile, registeredStoreKeys, currentUserRole])
  const dashboardPeriodSales = useMemo(() => {
    return dashboardSales.filter((sale) => saleInSelectedMonth(sale, filters))
  }, [dashboardSales, filters])
  const revenueBreakdown = useMemo(() => {
    return dashboardPeriodSales.reduce((totals, sale) => {
      const amount = getSaleRevenueValue(sale)
      const category = getSaleRevenueCategory(sale)
      totals[category] += amount
      totals.total += amount
      return totals
    }, { total: 0, pos: 0, controle: 0, fibra: 0, outras: 0 })
  }, [dashboardPeriodSales])
  const revenueFromGoals = useMemo(() => {
    return getRevenueFromGoals(rankingGoals, filters, users, currentUser, currentUserProfile, registeredStoreKeys)
  }, [rankingGoals, filters, users, currentUser, currentUserProfile, registeredStoreKeys])
  const totalRevenue = useMemo(() => {
    if (dashboardRevenue !== null) return dashboardRevenue
    if (revenueFromGoals !== null) return revenueFromGoals
    return revenueBreakdown.total
  }, [revenueFromGoals, dashboardRevenue, revenueBreakdown.total])
  const totalSales = dashboardPeriodSales.length
  const recent = dashboardSales.slice(0, 5)
  const revenueScopeLabel = currentUserRole === 'Vendedor'
    ? 'Receita total do vendedor'
    : currentUserRole === 'Gerente'
      ? 'Receita total da loja'
      : currentUserRole === 'Gestor Master'
        ? 'Receita total das lojas'
        : 'Receita total'
  const revenueCards = [
    { label: 'Receita Pós', value: revenueBreakdown.pos },
    { label: 'Receita Controle', value: revenueBreakdown.controle },
    { label: 'Receita Fibra', value: revenueBreakdown.fibra },
  ]
  const hourlyPartialRows = useMemo(() => buildHourlyPartialRows(dashboardPeriodSales), [dashboardPeriodSales])
  const hourlyPartialTotals = useMemo(() => getHourlyPartialTotals(hourlyPartialRows), [hourlyPartialRows])
  const hourlyPartialScopeLabel = currentUserRole === 'Gerente'
    ? `Loja ${getUserStoreName(currentUserProfile) || 'do gerente'}`
    : currentUserRole === 'Gestor Master'
      ? 'Todas as lojas cadastradas'
      : 'Todas as lojas'

  const selectedPeriodSales = useMemo(() => {
    return sales
      .filter((sale) => saleMatchesEntity(sale, filters, users, currentUser, isSeller))
      .filter((sale) => saleInSelectedMonth(sale, filters))
  }, [sales, filters, users, currentUser, isSeller])

  const realizedByGoalType = useMemo(() => {
    return selectedPeriodSales.reduce((totals, sale) => {
      SERVICES.forEach((service) => {
        totals.set(service, numberValue(totals.get(service)) + getSaleGoalValue(sale, service))
      })
      return totals
    }, new Map())
  }, [selectedPeriodSales])

  const goalRows = useMemo(() => {
    return SERVICES.map((service) => {
      const goal = selectedGoals.find((item) => item.type === service)
      const targetValue = goal?.targetValue || 0
      const currentValue = realizedByGoalType.get(service) ?? goal?.currentValue ?? 0
      const gapValue = Math.max(0, numberValue(targetValue) - numberValue(currentValue))
      const status = statusFromValues(currentValue, targetValue)
      return {
        type: service,
        targetValue,
        weeklyTarget: goal?.weeklyTarget || 0,
        dailyTarget: goal?.dailyTarget || 0,
        currentValue,
        gapValue,
        status,
        percent: targetValue ? Math.round((numberValue(currentValue) / numberValue(targetValue)) * 100) : 0,
      }
    })
  }, [selectedGoals, realizedByGoalType])

  const selectedSummary = useMemo(() => {
    const activeGoals = goalRows.filter((goal) => numberValue(goal.targetValue) > 0)
    const averagePercent = activeGoals.length
      ? Math.round(activeGoals.reduce((sum, goal) => sum + goal.percent, 0) / activeGoals.length)
      : 0
    const achieved = activeGoals.filter(isGoalAchieved).length
    return { averagePercent, achieved, total: activeGoals.length }
  }, [goalRows])

  const sellerPeriodSummary = useMemo(() => {
    const revenueGoal = goalRows.find((goal) => goal.type === 'Receita Total') || {}
    const grossGoal = goalRows.find((goal) => goal.type === 'Gross') || {}
    const grossTarget = numberValue(grossGoal.targetValue)
    const grossCurrent = numberValue(grossGoal.currentValue)
    const grossGap = Math.max(0, grossTarget - grossCurrent)
    return {
      revenue: {
        target: numberValue(revenueGoal.targetValue),
        current: numberValue(revenueGoal.currentValue),
        gap: Math.max(0, numberValue(revenueGoal.targetValue) - numberValue(revenueGoal.currentValue)),
        percent: numberValue(revenueGoal.targetValue)
          ? Math.round((numberValue(revenueGoal.currentValue) / numberValue(revenueGoal.targetValue)) * 100)
          : 0,
      },
      gross: {
        target: grossTarget,
        current: grossCurrent,
        gap: grossGap,
        percent: grossTarget ? Math.round((grossCurrent / grossTarget) * 100) : 0,
      },
    }
  }, [goalRows])

  const sellerRanking = useMemo(() => {
    const grouped = new Map()
    rankingGoals
      .filter((goal) => goal.userId && RANKING_GOAL_TYPES.has(goal.type))
      .forEach((goal) => {
        const key = goal.userId
        const current = grouped.get(key) || {
          id: key,
          name: goal.userName || 'Vendedor',
          goalsByType: new Map(),
        }
        current.goalsByType.set(goal.type, pickRankingGoal(current.goalsByType.get(goal.type), goal))
        grouped.set(key, current)
      })

    return [...grouped.values()]
      .map((seller) => {
        const goals = SERVICES.map((service) => seller.goalsByType.get(service)).filter(Boolean)
        const percentSum = SERVICES.reduce((sum, service) => sum + goalPercent(seller.goalsByType.get(service) || {}), 0)
        return {
          id: seller.id,
          name: seller.name,
          items: SERVICES.length,
          achieved: goals.filter(isGoalAchieved).length,
          percent: Math.round(percentSum / SERVICES.length),
        }
      })
      .sort((a, b) => b.percent - a.percent || b.achieved - a.achieved || a.name.localeCompare(b.name))
      .slice(0, 10)
  }, [rankingGoals])

  const scopedSales = useMemo(() => {
    return sales
      .filter((sale) => saleMatchesEntity(sale, filters, users, currentUser, isSeller))
  }, [sales, filters, users, currentUser, isSeller])

  const dailyPerformanceSeries = useMemo(() => {
    return buildPerformanceSeries(scopedSales, 'daily', filters)
  }, [scopedSales, filters])

  const weeklyPerformanceSeries = useMemo(() => {
    return buildPerformanceSeries(scopedSales, 'weekly', filters)
  }, [scopedSales, filters])

  const monthlyPerformanceSeries = useMemo(() => {
    return buildPerformanceSeries(scopedSales, 'monthly', filters)
  }, [scopedSales, filters])

  const performanceFeedback = useMemo(() => {
    const dailyActiveRows = getActiveRows(dailyPerformanceSeries)
    const latestDay = dailyActiveRows[dailyActiveRows.length - 1] || null
    const previousDay = dailyActiveRows[dailyActiveRows.length - 2] || null
    const currentWeek = getActiveRows(weeklyPerformanceSeries).slice(-1)[0] || null
    const previousWeek = getActiveRows(weeklyPerformanceSeries).slice(-2)[0] || null
    const currentMonth = monthlyPerformanceSeries[Number(filters.month) - 1] || null
    const previousMonth = monthlyPerformanceSeries[Number(filters.month) - 2] || null
    const dailyTotals = getSeriesTotals(dailyPerformanceSeries)
    const bestDay = getBestRow(dailyPerformanceSeries)
    const bestWeek = getBestRow(weeklyPerformanceSeries)

    return {
      dailyTotals,
      bestDay,
      bestWeek,
      dailyComparison: compareRows(latestDay, previousDay),
      weeklyComparison: compareRows(currentWeek, previousWeek),
      monthlyComparison: compareRows(currentMonth, previousMonth),
      latestDay,
      currentWeek,
      currentMonth,
    }
  }, [dailyPerformanceSeries, weeklyPerformanceSeries, monthlyPerformanceSeries, filters.month])

  const periodSales = useMemo(() => {
    return scopedSales.filter((sale) => saleInSelectedMonth(sale, filters))
  }, [scopedSales, filters])

  const sellerComparison = useMemo(() => {
    const grouped = new Map()
    periodSales
      .filter((sale) => filters.scope !== 'store' || saleMatchesEntity(sale, filters, users, currentUser, isSeller))
      .forEach((sale) => {
        if (isSeller && !saleMatchesEntity(sale, filters, users, currentUser, isSeller)) return
        const label = getSaleSellerLabel(sale, users)
        const current = grouped.get(label) || { label, amount: 0, count: 0 }
        current.amount += getSaleRevenueValue(sale)
        current.count += 1
        grouped.set(label, current)
      })

    return [...grouped.values()]
      .sort((a, b) => b.amount - a.amount || b.count - a.count)
      .slice(0, 10)
  }, [periodSales, filters, users, currentUser, isSeller])

  const storeComparison = useMemo(() => {
    if (isSeller) return []
    const grouped = new Map()
    periodSales.forEach((sale) => {
      const user = users.find((item) => item.uid === sale.userId || item.id === sale.userId || item.email === sale.seller || item.email === sale.userEmail)
      const label = sale.storeName || user?.storeName || user?.store || user?.loja || 'Sem loja'
      if (filters.scope === 'seller' && !saleMatchesEntity(sale, filters, users, currentUser, isSeller)) return
      const current = grouped.get(label) || { label, amount: 0, count: 0 }
      current.amount += getSaleRevenueValue(sale)
      current.count += 1
      grouped.set(label, current)
    })

    return [...grouped.values()]
      .sort((a, b) => b.amount - a.amount || b.count - a.count)
      .slice(0, 10)
  }, [periodSales, filters, users, currentUser, isSeller])

  const projectedSellerRanking = Array.isArray(goalRankings.sellers) ? goalRankings.sellers : []
  const projectedStoreRanking = Array.isArray(goalRankings.stores) ? goalRankings.stores : []
  const projectedGroupRanking = Array.isArray(goalRankings.groups) ? goalRankings.groups : []

  const selectedLabel = isSeller
    ? currentUser?.name || 'Minha meta'
    : filters.scope === 'store'
      ? filters.storeName
      : filters.scope === 'group'
        ? ECONOMIC_GROUP_NAME
        : filters.userName

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        eyebrow="Visão geral"
        title="Dashboard Executivo"
        description="Acompanhamento em tempo real de vendas, metas, ranking, projeção e performance por loja e vendedor."
        action={(
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Logo variant="full" size="sm" className="hidden md:inline-flex" />
            <button onClick={() => loadDashboard()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold"><RefreshCw className="h-4 w-4" />Atualizar</button>
          </div>
        )}
      />

      <div className="rounded-xl border border-sky-300/15 bg-gray-800/95 p-4 shadow-lg shadow-blue-950/20">
        <div className="grid gap-2 md:grid-cols-5">
          <label className="flex flex-col gap-1 text-sm text-gray-300">
            <span>Mês</span>
            <select name="month" value={filters.month} onChange={changeFilter} className="h-11 bg-gray-700 px-3 rounded">
              {MONTH_NAMES.map((month, index) => (
                <option key={month} value={index + 1}>{month}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-300">
            <span>Ano</span>
            <input name="year" type="number" value={filters.year} onChange={changeFilter} className="h-11 bg-gray-700 px-3 rounded" />
          </label>
          {canSelectScope ? (
            <label className="flex flex-col gap-1 text-sm text-gray-300">
              <span>Visualizar por</span>
              <select name="scope" value={filters.scope} onChange={changeFilter} className="h-11 bg-gray-700 px-3 rounded">
                <option value="">Selecione loja, grupo ou vendedor</option>
                <option value="store">Loja</option>
                <option value="group">Grupo econômico</option>
                <option value="seller">Vendedor</option>
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm text-gray-300">
              <span>Vendedor</span>
              <input value={currentUser?.name || 'Usuário'} disabled className="h-11 bg-gray-700 px-3 rounded opacity-80" />
            </label>
          )}
          {canSelectScope && filters.scope === 'store' && (
            <label className="flex flex-col gap-1 text-sm text-gray-300 md:col-span-2">
              <span>Loja</span>
              <select name="storeName" value={filters.storeName} onChange={changeFilter} className="h-11 bg-gray-700 px-3 rounded">
                <option value="">Selecione a loja</option>
                {storeNames.map((store) => <option key={store} value={store}>{store}</option>)}
              </select>
            </label>
          )}
          {canSelectScope && filters.scope === 'group' && (
            <label className="flex flex-col gap-1 text-sm text-gray-300 md:col-span-2">
              <span>Nome do grupo econômico</span>
              <input value={ECONOMIC_GROUP_NAME} disabled className="h-11 bg-gray-700 px-3 rounded opacity-80" />
            </label>
          )}
          {canSelectScope && filters.scope === 'seller' && (
            <label className="flex flex-col gap-1 text-sm text-gray-300 md:col-span-2">
              <span>Vendedor</span>
              <select name="userId" value={filters.userId} onChange={changeFilter} className="h-11 bg-gray-700 px-3 rounded">
                <option value="">Selecione o vendedor</option>
                {sellers.map((user) => <option key={getUserId(user)} value={getUserId(user)}>{user.name || 'Sem nome'}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label={revenueScopeLabel}
          value={`R$ ${formatNumber(totalRevenue)}`}
          helper="Base do mês selecionado"
          tone="cyan"
          icon={BarChart3}
        />
        <MetricCard
          label="Vendas cadastradas"
          value={totalSales}
          helper={`${getMonthName(filters.month)} de ${filters.year}`}
          tone="emerald"
          icon={ShoppingBag}
        />
        <MetricCard
          label="Atualização"
          value={lastUpdated ? lastUpdated.toLocaleTimeString('pt-BR') : '-'}
          helper="automática a cada 30s"
          tone="violet"
          icon={Clock3}
        />
      </div>

      {authError && <div className="rounded border border-yellow-300/30 bg-yellow-600/20 p-3 text-sm text-yellow-100">{authError}</div>}
      {error && <div className="rounded border border-red-300/30 bg-red-600/20 p-3 text-sm text-red-100">{error}</div>}
      {loading && <div className="text-sm text-gray-400">Carregando dados...</div>}

      <div className="grid gap-4 md:grid-cols-3">
        {revenueCards.map((card) => (
          <div key={card.label} className="p-5 bg-gray-800 rounded border border-white/10">
            <div className="text-sm text-gray-400">{card.label}</div>
            <div className="text-2xl font-semibold">R$ {formatNumber(card.value)}</div>
          </div>
        ))}
      </div>

      {canViewHourlyPartial && (
        <HourlyPartialTable
          title="Parcial hora a hora"
          subtitle={`${hourlyPartialScopeLabel} - ${getMonthName(filters.month)} de ${filters.year}`}
          rows={hourlyPartialRows}
          totals={hourlyPartialTotals}
        />
      )}

      {isSeller && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-5">
            <div className="text-sm text-cyan-100">Atingimento receita</div>
            <div className="mt-1 text-3xl font-semibold text-white">{sellerPeriodSummary.revenue.percent}%</div>
            <div className="mt-3 grid gap-2 text-sm text-cyan-50 sm:grid-cols-3">
              <div>
                <div className="text-cyan-100/70">Realizado</div>
                <div className="font-semibold">{formatGoalValue('Receita Total', sellerPeriodSummary.revenue.current)}</div>
              </div>
              <div>
                <div className="text-cyan-100/70">Meta</div>
                <div className="font-semibold">{formatGoalValue('Receita Total', sellerPeriodSummary.revenue.target)}</div>
              </div>
              <div>
                <div className="text-cyan-100/70">Gap</div>
                <div className="font-semibold">{formatGoalValue('Receita Total', sellerPeriodSummary.revenue.gap)}</div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-5">
            <div className="text-sm text-emerald-100">Atingimento Gross</div>
            <div className="mt-1 text-3xl font-semibold text-white">{sellerPeriodSummary.gross.percent}%</div>
            <div className="mt-3 grid gap-2 text-sm text-emerald-50 sm:grid-cols-3">
              <div>
                <div className="text-emerald-100/70">Realizado</div>
                <div className="font-semibold">{formatQuantity(sellerPeriodSummary.gross.current)}</div>
              </div>
              <div>
                <div className="text-emerald-100/70">Meta</div>
                <div className="font-semibold">{formatQuantity(sellerPeriodSummary.gross.target)}</div>
              </div>
              <div>
                <div className="text-emerald-100/70">Gap</div>
                <div className="font-semibold">{formatQuantity(sellerPeriodSummary.gross.gap)}</div>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-gray-800 p-5">
          <div>
            <h2 className="text-xl font-semibold">Gráficos de desempenho</h2>
            <div className="text-sm text-gray-400">
              Diária, fechamento semanal, visão mensal e feedback automático para {selectedLabel || 'a seleção atual'}.
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4">
            <div className="text-sm text-cyan-100">Diária</div>
            <div className="mt-1 text-2xl font-semibold text-white">R$ {formatNumber(performanceFeedback.dailyTotals.amount)}</div>
            <div className="mt-2 text-sm text-cyan-50">
              {buildFeedbackText(performanceFeedback.dailyComparison)}
            </div>
          </div>
          <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
            <div className="text-sm text-emerald-100">Melhor dia</div>
            <div className="mt-1 text-2xl font-semibold text-white">
              {performanceFeedback.bestDay ? `${performanceFeedback.bestDay.label}/${String(filters.month).padStart(2, '0')}` : '-'}
            </div>
            <div className="mt-2 text-sm text-emerald-50">
              {performanceFeedback.bestDay
                ? `R$ ${formatNumber(performanceFeedback.bestDay.amount)} em ${performanceFeedback.bestDay.count} vendas.`
                : 'Sem vendas no período selecionado.'}
            </div>
          </div>
          <div className="rounded-lg border border-violet-300/20 bg-violet-300/10 p-4">
            <div className="text-sm text-violet-100">Ritmo semanal e mensal</div>
            <div className="mt-1 text-2xl font-semibold text-white">
              {performanceFeedback.bestWeek ? performanceFeedback.bestWeek.label : '-'}
            </div>
            <div className="mt-2 text-sm text-violet-50">
              Semana: {buildFeedbackText(performanceFeedback.weeklyComparison)} Mês: {buildFeedbackText(performanceFeedback.monthlyComparison)}
            </div>
          </div>
        </div>

        <CompactColumnChart
          title="Diária"
          subtitle={`${getMonthName(filters.month)} de ${filters.year} - receita e quantidade por dia`}
          rows={dailyPerformanceSeries}
          emptyText="Sem vendas diárias para a seleção atual."
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <BarChart
            title="Desempenho semanal"
            subtitle="Comparativo por semanas do mês selecionado"
            rows={weeklyPerformanceSeries.filter((item) => item.amount || item.count)}
            emptyText="Sem vendas semanais para a seleção atual."
          />
          <BarChart
            title="Desempenho mensal"
            subtitle={`Comparativo mês a mês em ${filters.year}`}
            rows={monthlyPerformanceSeries.filter((item) => item.amount || item.count)}
            emptyText="Sem vendas mensais para a seleção atual."
          />
        </div>
      </section>

      {!hasGoalSelection ? (
        <div className="bg-gray-800 p-6 rounded text-gray-300">
          Selecione uma loja, grupo econômico ou vendedor para ver a planilha de atingimento das metas.
        </div>
      ) : (
        <div className="bg-gray-800 rounded overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <h2 className="text-xl">Atingimento das metas</h2>
              <div className="text-sm text-gray-400">{selectedLabel} - {getMonthName(filters.month)} de {filters.year}</div>
            </div>
            <div className="text-sm text-gray-300">{selectedSummary.averagePercent}% médio - {selectedSummary.achieved} de {selectedSummary.total} metas batidas</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead className="bg-gray-900 text-left text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="p-3">Serviço</th>
                  <th className="p-3">Meta</th>
                  <th className="p-3">Meta semanal</th>
                  <th className="p-3">Meta diária</th>
                  <th className="p-3">Realizado</th>
                  <th className="p-3">Gap</th>
                  <th className="p-3">Atingimento</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {goalRows.map((row) => (
                  <tr key={row.type} className="border-t border-gray-700">
                    <td className="p-3 font-semibold">{row.type}</td>
                    <td className="p-3">{formatGoalValue(row.type, row.targetValue)}</td>
                    <td className="p-3">{formatGoalValue(row.type, row.weeklyTarget)}</td>
                    <td className="p-3">{formatGoalValue(row.type, row.dailyTarget)}</td>
                    <td className="p-3">{formatGoalValue(row.type, row.currentValue)}</td>
                    <td className="p-3">{formatGoalValue(row.type, row.gapValue)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 bg-gray-700 rounded overflow-hidden">
                          <div className="h-full bg-green-500 rounded" style={{ width: `${Math.min(100, row.percent)}%` }} />
                        </div>
                        <span>{row.percent}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-sm text-gray-300 capitalize">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={`grid gap-4 ${isSeller ? 'lg:grid-cols-1' : canViewStoreComparison ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
        {!isSeller && (
          <>
            <BarChart
              title="Comparativo de vendedores"
              subtitle="Desempenho por receita no mês selecionado"
              rows={sellerComparison}
              emptyText="Sem vendedores com vendas nesse período."
            />
            {canViewStoreComparison && (
              <BarChart
                title="Comparativo de lojas"
                subtitle="Desempenho por receita no mês selecionado"
                rows={storeComparison}
                emptyText="Sem lojas com vendas nesse período."
              />
            )}
          </>
        )}
      </div>

      <section className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-gray-800 p-5">
          <h2 className="text-xl font-semibold">Ranking de atingimento projetado</h2>
          <div className="text-sm text-gray-400">
            Considera o realizado até hoje e projeta o fechamento das metas até o final de {getMonthName(filters.month)}.
          </div>
        </div>
        <div className={`grid gap-4 ${isSeller ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
          <GoalRankingCard
            title="Ranking de vendedores"
            subtitle={isSeller ? 'Top 3 e sua colocação no mês' : 'Top 10 por atingimento projetado'}
            rows={projectedSellerRanking}
            showSeparator={isSeller}
            emptyText="Sem ranking de vendedores para o período."
          />
          {!isSeller && (
            <>
              <GoalRankingCard
                title="Ranking de lojas"
                subtitle="Top 10 por atingimento projetado"
                rows={projectedStoreRanking}
                emptyText="Sem ranking de lojas para o período."
              />
              <GoalRankingCard
                title="Grupo econômico"
                subtitle="Atingimento projetado do grupo"
                rows={projectedGroupRanking}
                emptyText="Sem meta do grupo econômico para o período."
              />
            </>
          )}
          {isSeller && goalRankings.ownPosition && !projectedSellerRanking.some((item) => item.separated) && (
            <GoalRankingCard
              title="Minha colocação"
              subtitle="Sua posição no ranking geral"
              rows={[goalRankings.ownPosition]}
              emptyText="Sua posição ainda não foi encontrada."
            />
          )}
        </div>
      </section>

      {currentUserRole !== 'Gestor Master' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="bg-gray-800 rounded p-5">
            <h2 className="text-xl font-semibold mb-3">Performance recente</h2>
            <div className="space-y-3">
              {recent.map((item) => (
                <div key={item.id} className="p-3 bg-gray-900 rounded border border-white/10 flex justify-between gap-3">
                  <div>
                    <div className="font-semibold">{item.customer}</div>
                    <div className="text-sm text-gray-400">{getSaleSellerLabel(item, users)} - {item.saleType || 'Venda'}</div>
                  </div>
                  <div className="font-semibold">R$ {formatNumber(getSaleRevenueValue(item))}</div>
                </div>
              ))}
              {!recent.length && <div className="text-gray-400">Sem vendas recentes</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
