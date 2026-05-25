import React, { useEffect, useMemo, useState } from 'react'
import { getMetas, getStores, getUsers, getVendas } from '../firebase/db'
import ChartCard from '../components/ChartCard'
import { useAuth } from '../contexts/AuthContext'
import { appendAoaSheet, createWorkbook, writeWorkbook } from '../utils/excelExport'

const MANAGER_COMMISSION_ROLES = ['Administrador', 'Gestor Master', 'Gerente']

const REPORT_OPTIONS = [
  { key: 'summary', label: 'Resumo' },
  { key: 'hourly', label: 'Hora a Hora' },
  { key: 'monthly', label: 'Receita mensal' },
  { key: 'goals', label: 'Meta x Realizado' },
  { key: 'status', label: 'Status das vendas' },
  { key: 'commission', label: 'Comissão' },
  { key: 'ranking', label: 'Ranking' },
  { key: 'sales', label: 'Lista de vendas' },
]

const DEFAULT_REPORTS = REPORT_OPTIONS.map((item) => item.key)
const SALE_FILTER_OPTIONS = [
  { key: 'fiber', label: 'Fibra' },
  { key: 'portability', label: 'Portabilidade' },
  { key: 'devices', label: 'Aparelhos' },
  { key: 'storeDevice', label: 'Loja' },
  { key: 'timDevice', label: 'TIM' },
  { key: 'accessories', label: 'Acessórios' },
]
const SERVICES = [
  'Gross',
  'Receita Total',
]
const MONEY_SERVICES = new Set(['Receita Total', 'Aparelhos', 'Acessórios', 'PayJoy', 'Seguros'])
const ECONOMIC_GROUP_NAME = 'INTERCELL'
const HOURLY_PARTIAL_START = 9
const HOURLY_PARTIAL_END = 21

function formatter(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`
}

function numberFormatter(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function formatGoalValue(type, value) {
  return MONEY_SERVICES.has(type) ? formatter(value) : numberFormatter(value)
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeGoalText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function getDateValue(date) {
  if (!date) return null
  if (date.toDate) return date.toDate()
  if (date.seconds) return new Date(date.seconds * 1000)
  return new Date(date)
}

function getSaleDate(sale) {
  if (sale.saleDate) {
    const date = new Date(`${sale.saleDate}T12:00:00`)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return getDateValue(sale.createdAt)
}

function getSaleDateTime(sale) {
  if (sale.saleDate && sale.saleTime) {
    const time = String(sale.saleTime).slice(0, 5)
    const date = new Date(`${sale.saleDate}T${time}:00`)
    if (!Number.isNaN(date.getTime())) return date
  }
  return getDateValue(sale.createdAt) || getSaleDate(sale)
}

function getSaleRevenueValue(sale) {
  if (normalize(sale.plan) === 'dependente') return 0
  if (sale.saleType === 'Upgrade') return 0
  if (normalize(sale.saleType).includes('acessorio')) return 0
  const value = sale.planValue !== undefined && sale.planValue !== ''
    ? Number(sale.planValue || 0)
    : Number(sale.amount || 0)
  return Number.isFinite(value) ? value : 0
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

function getDependentCount(sale) {
  const count = Math.max(0, Number(sale.dependentCount ?? sale.dependents ?? 0) || 0)
  return count || (isDependentSale(sale) ? 1 : 0)
}

function hasPortability(sale) {
  return sale.saleType === 'Portabilidade'
    || normalize(sale.saleType).includes('portabilidade')
    || (sale.saleType === 'Aparelhos' && normalize(sale.deviceSaleMode).includes('portabilidade'))
    || normalize(sale.portability).includes('sim')
    || normalize(sale.portabilidade).includes('sim')
    || Boolean(String(sale.provisionalNumber || '').trim())
}

function hasDeviceSale(sale) {
  return sale.saleType === 'Aparelhos'
    || (sale.saleType === 'Upgrade' && normalize(sale.addDeviceToUpgrade) === 'sim')
    || (sale.saleType === 'Upgrade' && Number(sale.deviceValue || 0) > 0)
}

function saleMatchesTypeFilters(sale, selectedFilters = []) {
  if (!selectedFilters.length) return true
  return selectedFilters.some((filter) => {
    if (filter === 'fiber') return getSaleGoalValue(sale, 'Fibra') > 0
    if (filter === 'portability') return hasPortability(sale)
    if (filter === 'devices') return hasDeviceSale(sale)
    if (filter === 'storeDevice') return hasDeviceSale(sale) && normalize(sale.deviceOrigin || 'Loja') === 'loja'
    if (filter === 'timDevice') return hasDeviceSale(sale) && normalize(sale.deviceOrigin) === 'tim'
    if (filter === 'accessories') return normalize(sale.saleType).includes('acessorio')
    return true
  })
}

function getSaleGoalValue(sale, type) {
  const isUpgradeSale = sale.saleType === 'Upgrade'
  switch (type) {
    case 'Receita Total':
      return getSaleRevenueValue(sale)
    case 'Gross':
      return getSaleGoalValue(sale, 'Pós') + getSaleGoalValue(sale, 'Controle')
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
    case 'Fibra':
      return planIncludes(sale, 'FIBRA') || normalize(sale.saleType).includes('fibra') || normalize(sale.access).includes('fibra') ? 1 : 0
    default:
      return 0
  }
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

function getUserForSale(sale, users) {
  return users.find((user) => (
    user.uid === sale.userId
    || user.id === sale.userId
    || user.email === sale.seller
    || user.email === sale.userEmail
  ))
}

function getSaleStoreName(sale, users) {
  const user = getUserForSale(sale, users)
  return sale.storeName || user?.storeName || user?.store || user?.loja || ''
}

function getCanonicalStoreName(name, storeMap) {
  return storeMap.get(normalize(name)) || name || ''
}

function getSellerName(sale, users) {
  const user = getUserForSale(sale, users)
  return user?.name || sale.userName || 'Sem vendedor'
}

function getSellerRegistration(sale, users) {
  const user = getUserForSale(sale, users)
  return sale.sellerRegistration || sale.sellerMatricula || user?.registration || user?.matricula || ''
}

function reportSelected(selectedReports, key) {
  return selectedReports.includes(key)
}

export default function Reports() {
  const { currentUser } = useAuth()
  const [sales, setSales] = useState([])
  const [metas, setMetas] = useState([])
  const [users, setUsers] = useState([])
  const [stores, setStores] = useState([])
  const [filters, setFilters] = useState({ scope: '', storeName: '', sellerKey: '', groupName: '', saleFilters: [] })
  const [selectedReports, setSelectedReports] = useState(DEFAULT_REPORTS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.allSettled([getVendas(), getMetas(), getUsers(), getStores()])
      .then(([salesResult, metasResult, usersResult, storesResult]) => {
        const salesData = salesResult.status === 'fulfilled' && Array.isArray(salesResult.value) ? salesResult.value : []
        const metasData = metasResult.status === 'fulfilled' && Array.isArray(metasResult.value) ? metasResult.value : []
        const usersData = usersResult.status === 'fulfilled' && Array.isArray(usersResult.value) ? usersResult.value : []
        const storesData = storesResult.status === 'fulfilled' && Array.isArray(storesResult.value) ? storesResult.value : []
        setSales(salesData)
        setMetas(metasData)
        setUsers(usersData)
        setStores(storesData)
        if (storesResult.status === 'rejected' && !salesData.length && !usersData.length) {
          setError('Não foi possível carregar as lojas. Verifique a conexão com o Firebase/API.')
        }
        if (salesResult.status === 'rejected' || metasResult.status === 'rejected' || usersResult.status === 'rejected') {
          console.warn('Carregamento parcial dos relatórios:', { salesResult, metasResult, usersResult, storesResult })
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar relatórios:', err)
        setError('Não foi possível carregar os relatórios.')
      })
      .finally(() => setLoading(false))
  }, [])

  const storeOptions = useMemo(() => {
    const byName = new Map()
    const addStore = (name) => {
      const key = normalize(name)
      if (key && !byName.has(key)) byName.set(key, name)
    }
    stores.forEach((store) => addStore(store.name || store.storeName || store.loja))
    users.forEach((user) => addStore(user.storeName || user.store || user.loja))
    sales.forEach((sale) => addStore(getSaleStoreName(sale, users)))
    return [...byName.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [sales, stores, users])
  const storeNameMap = useMemo(() => {
    return new Map(storeOptions.map((store) => [normalize(store), store]))
  }, [storeOptions])

  const sellerOptions = useMemo(() => {
    const byKey = new Map()

    users.forEach((user) => {
      const key = user.uid || user.id || user.email
      if (!key || user.disabled) return
      byKey.set(key, {
        key,
        userId: user.uid || user.id || '',
        email: user.email || '',
        label: user.name || 'Sem nome',
      })
    })

    sales.forEach((sale) => {
      const email = sale.seller || sale.userEmail
      if (!email) return
      const user = getUserForSale(sale, users)
      const key = user?.uid || user?.id || email
      if (byKey.has(key)) return
      byKey.set(key, {
        key,
        userId: user?.uid || user?.id || sale.userId || '',
        email,
        label: user?.name || sale.userName || 'Sem vendedor',
      })
    })

    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }, [sales, users])

  const selectedSeller = useMemo(() => {
    return sellerOptions.find((seller) => seller.key === filters.sellerKey)
  }, [filters.sellerKey, sellerOptions])

  const hasSelection = (filters.scope === 'store' && filters.storeName) || (filters.scope === 'seller' && filters.sellerKey) || (filters.scope === 'group' && filters.groupName)
  const hasSelectedReports = selectedReports.length > 0
  const canViewManagerCommission = MANAGER_COMMISSION_ROLES.includes(currentUser?.role)
  const selectedLabel = filters.scope === 'store'
    ? filters.storeName
    : filters.scope === 'group'
      ? ECONOMIC_GROUP_NAME
      : selectedSeller?.label || ''

  const filteredSales = useMemo(() => {
    if (!hasSelection) return []

    return sales.filter((sale) => {
      if (!saleMatchesTypeFilters(sale, filters.saleFilters)) return false

      if (filters.scope === 'store') {
        return normalize(getCanonicalStoreName(getSaleStoreName(sale, users), storeNameMap)) === normalize(filters.storeName)
      }

      if (filters.scope === 'group') {
        return true
      }

      if (filters.scope === 'seller' && selectedSeller) {
        return sale.userId === selectedSeller.userId
          || sale.seller === selectedSeller.email
          || sale.userEmail === selectedSeller.email
      }

      return false
    })
  }, [filters.scope, filters.storeName, filters.saleFilters, hasSelection, sales, selectedSeller, storeNameMap, users])

  const filteredMetas = useMemo(() => {
    if (!hasSelection) return []

    return metas.filter((meta) => {
      if (filters.scope === 'store') {
        return normalize(getCanonicalStoreName(meta.storeName, storeNameMap)) === normalize(filters.storeName)
      }

      if (filters.scope === 'group') {
        return normalize(meta.groupName) === normalize(ECONOMIC_GROUP_NAME)
      }

      if (filters.scope === 'seller' && selectedSeller) {
        return meta.userId === selectedSeller.userId
          || normalize(meta.userName) === normalize(selectedSeller.label)
      }

      return false
    })
  }, [filters.scope, filters.storeName, hasSelection, metas, selectedSeller, storeNameMap])

  const summary = useMemo(() => {
    const revenue = filteredSales.reduce((acc, sale) => acc + getSaleRevenueValue(sale), 0)
    const closed = filteredSales.filter((sale) => sale.status === 'Fechada' || sale.status === 'Sim').length
    const pending = filteredSales.filter((sale) => sale.status === 'Pendente' || sale.status === 'Não').length
    const lost = filteredSales.filter((sale) => sale.status === 'Perdida').length
    return { revenue, closed, pending, lost }
  }, [filteredSales])

  const hourlyPartialRows = useMemo(() => buildHourlyPartialRows(filteredSales), [filteredSales])

  const statusData = useMemo(() => {
    const counts = {}
    filteredSales.forEach((sale) => {
      const status = sale.status || 'Sem status'
      counts[status] = (counts[status] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [filteredSales])

  const monthlyRevenue = useMemo(() => {
    const byMonth = {}

    filteredSales.forEach((sale) => {
      const date = getSaleDate(sale)
      if (!date) return
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const monthLabel = `${date.toLocaleString('pt-BR', { month: 'short' })} ${date.getFullYear()}`
      if (!byMonth[key]) {
        byMonth[key] = { month: monthLabel, revenue: 0, timestamp: date.getTime() }
      }
      byMonth[key].revenue += getSaleRevenueValue(sale)
    })

    return Object.values(byMonth)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ month, revenue }) => ({ month, revenue }))
  }, [filteredSales])

  const sellerRevenue = useMemo(() => {
    const totals = {}
    filteredSales.forEach((sale) => {
      const seller = getSellerName(sale, users)
      totals[seller] = (totals[seller] || 0) + getSaleRevenueValue(sale)
    })
    return Object.entries(totals).sort((a, b) => b[1] - a[1])
  }, [filteredSales, users])

  const totalCommission = useMemo(() => {
    return filteredSales.reduce((sum, sale) => sum + Number(sale.commission || 0), 0)
  }, [filteredSales])

  const sellerCommission = useMemo(() => {
    const totals = {}
    filteredSales.forEach((sale) => {
      const seller = getSellerName(sale, users)
      totals[seller] = (totals[seller] || 0) + Number(sale.commission || 0)
    })
    return Object.entries(totals).sort((a, b) => b[1] - a[1])
  }, [filteredSales, users])

  const metasProgress = useMemo(() => {
    return SERVICES.map((service) => {
      const meta = filteredMetas.find((item) => item.type === service)
      const target = Number(meta?.targetValue ?? meta?.target ?? 0)
      const achieved = Number(meta?.currentValue ?? 0)

      return {
        id: meta?.id || service,
        type: service,
        label: service,
        target,
        progress: target ? Math.min(100, Math.round((achieved / target) * 100)) : 0,
        achieved,
      }
    })
  }, [filteredMetas])

  function changeFilter(e) {
    const { name, value } = e.target
    if (name === 'scope') {
      setFilters((current) => ({ ...current, scope: value, storeName: '', sellerKey: '', groupName: value === 'group' ? ECONOMIC_GROUP_NAME : '' }))
      return
    }
    setFilters((current) => ({ ...current, [name]: value }))
  }

  function toggleReport(key) {
    setSelectedReports((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ))
  }

  function toggleSaleFilter(key) {
    setFilters((current) => ({
      ...current,
      saleFilters: current.saleFilters.includes(key)
        ? current.saleFilters.filter((item) => item !== key)
        : [...current.saleFilters, key],
    }))
  }

  function addPdfTable(doc, autoTable, cursor, title, head, body) {
    let startY = cursor
    if (startY > 690) {
      doc.addPage()
      startY = 40
    }

    doc.setFontSize(12)
    doc.text(title, 40, startY)
    autoTable(doc, {
      startY: startY + 12,
      head,
      body: body.length ? body : [['Sem dados']],
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175] },
      styles: { fontSize: 8 },
    })

    return doc.lastAutoTable.finalY + 22
  }

  async function exportPdf() {
    if (!hasSelection || !hasSelectedReports) return

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    const doc = new jsPDF({ unit: 'pt', format: 'letter' })
    doc.setFontSize(16)
    doc.text('Relatório SIT.LUMX', 40, 40)
    doc.setFontSize(10)
    const filterType = filters.scope === 'store' ? 'Loja' : filters.scope === 'group' ? 'Grupo econômico' : 'Vendedor'
    doc.text(`Filtro: ${filterType} - ${selectedLabel}`, 40, 58)

    let cursor = 86

    if (reportSelected(selectedReports, 'summary')) {
      cursor = addPdfTable(doc, autoTable, cursor, 'Resumo', [['Indicador', 'Valor']], [
        ['Receita Total', formatter(summary.revenue)],
        ['Vendas fechadas/esteira sim', String(summary.closed)],
        ['Pendentes/esteira não', String(summary.pending)],
        ['Perdidas', String(summary.lost)],
        ['Comissão vendedor', formatter(totalCommission)],
        ['Metas definidas', String(filteredMetas.length)],
      ])
    }

    if (reportSelected(selectedReports, 'monthly')) {
      cursor = addPdfTable(doc, autoTable, cursor, 'Receita mensal', [['Mês', 'Receita']], monthlyRevenue.map((item) => [item.month, formatter(item.revenue)]))
    }

    if (reportSelected(selectedReports, 'hourly')) {
      cursor = addPdfTable(doc, autoTable, cursor, 'Hora a Hora', [['Hora', 'Gross', 'Upgrade', 'Portabilidade', 'Fibra', 'Receita']], hourlyPartialRows.map((row) => [
        row.label,
        numberFormatter(row.gross),
        numberFormatter(row.upgrade),
        numberFormatter(row.portability),
        numberFormatter(row.fiber),
        formatter(row.revenue),
      ]))
    }

    if (reportSelected(selectedReports, 'goals')) {
      cursor = addPdfTable(doc, autoTable, cursor, 'Meta x Realizado', [['Serviço', 'Realizado', 'Meta', 'Atingimento']], metasProgress.map((meta) => [
        meta.label,
        formatGoalValue(meta.type, meta.achieved),
        formatGoalValue(meta.type, meta.target),
        `${meta.progress}%`,
      ]))
    }

    if (reportSelected(selectedReports, 'status')) {
      cursor = addPdfTable(doc, autoTable, cursor, 'Status das vendas', [['Status', 'Quantidade']], statusData.map(([status, count]) => [status, String(count)]))
    }

    if (reportSelected(selectedReports, 'commission')) {
      cursor = addPdfTable(doc, autoTable, cursor, 'Comissão por vendedor', [['Vendedor', 'Comissão']], sellerCommission.map(([seller, commission]) => [seller, formatter(commission)]))
    }

    if (reportSelected(selectedReports, 'ranking')) {
      cursor = addPdfTable(doc, autoTable, cursor, 'Ranking', [['Vendedor', 'Receita']], sellerRevenue.map(([seller, total]) => [seller, formatter(total)]))
    }

    if (reportSelected(selectedReports, 'sales')) {
      addPdfTable(doc, autoTable, cursor, 'Lista de vendas', [['Cliente', 'CPF', 'Vendedor', 'Matrícula', 'Status', 'Valor', 'Comissão']], filteredSales.map((sale) => [
        sale.customer || '',
        sale.cpf || '',
        getSellerName(sale, users),
        getSellerRegistration(sale, users),
        sale.status || '',
        formatter(sale.amount),
        formatter(sale.commission || 0),
      ]))
    }

    doc.save('relatorio-filtrado.pdf')
  }

  async function exportExcel() {
    if (!hasSelection || !hasSelectedReports) return

    const workbook = await createWorkbook()
    const appendSheet = async (name, rows) => {
      await appendAoaSheet(workbook, name, rows)
    }

    if (reportSelected(selectedReports, 'summary')) {
      await appendSheet('Resumo', [
        ['Receita Total', 'Vendas fechadas/esteira sim', 'Pendentes/esteira não', 'Perdidas', 'Comissão vendedor', 'Metas definidas'],
        [summary.revenue, summary.closed, summary.pending, summary.lost, totalCommission, filteredMetas.length],
      ])
    }

    if (reportSelected(selectedReports, 'monthly')) {
      const monthHeaders = monthlyRevenue.length ? monthlyRevenue.map((item) => item.month) : ['Sem dados']
      const monthValues = monthlyRevenue.length ? monthlyRevenue.map((item) => item.revenue) : [0]
      await appendSheet('Receita mensal', [monthHeaders, monthValues])
    }

    if (reportSelected(selectedReports, 'hourly')) {
      await appendSheet('Hora a Hora', [
        ['Hora', 'Gross', 'Upgrade', 'Portabilidade', 'Fibra', 'Receita'],
        ...hourlyPartialRows.map((row) => [row.label, row.gross, row.upgrade, row.portability, row.fiber, row.revenue]),
      ])
    }

    if (reportSelected(selectedReports, 'goals')) {
      await appendSheet('Metas', [
        ['Campo', ...metasProgress.map((meta) => meta.label)],
        ['Realizado', ...metasProgress.map((meta) => meta.achieved)],
        ['Meta', ...metasProgress.map((meta) => meta.target)],
        ['Tipo', ...metasProgress.map((meta) => (MONEY_SERVICES.has(meta.type) ? 'Monetário' : 'Quantidade'))],
        ['Atingimento', ...metasProgress.map((meta) => `${meta.progress}%`)],
      ])
    }

    if (reportSelected(selectedReports, 'status')) {
      const statusHeaders = statusData.length ? statusData.map(([status]) => status) : ['Sem dados']
      const statusValues = statusData.length ? statusData.map(([, count]) => count) : [0]
      await appendSheet('Status', [statusHeaders, statusValues])
    }

    if (reportSelected(selectedReports, 'commission')) {
      const commissionHeaders = sellerCommission.length ? sellerCommission.map(([seller]) => seller) : ['Sem dados']
      const commissionValues = sellerCommission.length ? sellerCommission.map(([, commission]) => commission) : [0]
      await appendSheet('Comissão', [commissionHeaders, commissionValues])
    }

    if (reportSelected(selectedReports, 'ranking')) {
      const rankingHeaders = sellerRevenue.length ? sellerRevenue.map(([seller]) => seller) : ['Sem dados']
      const rankingValues = sellerRevenue.length ? sellerRevenue.map(([, total]) => total) : [0]
      await appendSheet('Ranking', [rankingHeaders, rankingValues])
    }

    if (reportSelected(selectedReports, 'sales')) {
      const hasSales = filteredSales.length > 0
      const saleHeaders = hasSales ? filteredSales.map((sale, index) => sale.customer || `Venda ${index + 1}`) : ['Sem vendas']
      const saleValues = hasSales ? filteredSales : [{}]
      await appendSheet('Vendas', [
        ['Campo', ...saleHeaders],
        ['Data', ...saleValues.map((sale) => getSaleDate(sale)?.toLocaleDateString('pt-BR') || '')],
        ['Cliente', ...saleValues.map((sale) => sale.customer || '')],
        ['CPF', ...saleValues.map((sale) => sale.cpf || '')],
        ['Vendedor', ...saleValues.map((sale) => (hasSales ? getSellerName(sale, users) : ''))],
        ['Matrícula do Vendedor', ...saleValues.map((sale) => (hasSales ? getSellerRegistration(sale, users) : ''))],
        ['Status', ...saleValues.map((sale) => sale.status || '')],
        ['Valor', ...saleValues.map((sale) => (hasSales ? Number(sale.amount || 0) : ''))],
        ['Comissão vendedor', ...saleValues.map((sale) => (hasSales ? Number(sale.commission || 0) : ''))],
        ...(canViewManagerCommission ? [
          ['Comissão Gerente', ...saleValues.map((sale) => (hasSales ? Number(sale.storeCommission || 0) : ''))],
        ] : []),
      ])
    }

    await writeWorkbook(workbook, 'relatorio-filtrado.xlsx')
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl">Relatórios</h1>
          <p className="text-sm text-gray-400">Selecione uma loja, grupo econômico ou vendedor e marque os blocos para imprimir.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!hasSelection || !hasSelectedReports} onClick={exportPdf} className="bg-blue-600 px-4 py-2 rounded hover:bg-blue-500 disabled:opacity-50">Imprimir PDF</button>
          <button disabled={!hasSelection || !hasSelectedReports} onClick={exportExcel} className="bg-green-600 px-4 py-2 rounded hover:bg-green-500 disabled:opacity-50">Exportar Excel</button>
        </div>
      </div>

      {error && <div className="mb-4 bg-red-600 text-white p-3 rounded">{error}</div>}
      {loading && <div className="mb-4 text-sm text-gray-400">Carregando relatórios...</div>}

      <div className="rounded-xl border border-white/10 bg-gray-800 p-4 mb-4">
        <div className="grid gap-3 md:grid-cols-3 mb-4">
          <label className="flex flex-col gap-1 text-sm text-gray-300">
            <span>Visão</span>
            <select name="scope" value={filters.scope} onChange={changeFilter} className="h-11 bg-gray-700 px-3 rounded">
              <option value="">Selecione loja, grupo ou vendedor</option>
              <option value="store">Loja</option>
              <option value="group">Grupo econômico</option>
              <option value="seller">Vendedor</option>
            </select>
          </label>
          {filters.scope === 'group' && (
            <label className="flex flex-col gap-1 text-sm text-gray-300 md:col-span-2">
              <span>Nome do grupo econômico</span>
              <input value={ECONOMIC_GROUP_NAME} disabled className="h-11 bg-gray-700 px-3 rounded opacity-80" />
            </label>
          )}

          {filters.scope === 'store' && (
            <label className="flex flex-col gap-1 text-sm text-gray-300 md:col-span-2">
              <span>Loja</span>
              <select name="storeName" value={filters.storeName} onChange={changeFilter} className="h-11 bg-gray-700 px-3 rounded">
                <option value="">Selecione a loja</option>
                {storeOptions.map((store) => <option key={store} value={store}>{store}</option>)}
              </select>
            </label>
          )}

          {filters.scope === 'seller' && (
            <label className="flex flex-col gap-1 text-sm text-gray-300 md:col-span-2">
              <span>Vendedor</span>
              <select name="sellerKey" value={filters.sellerKey} onChange={changeFilter} className="h-11 bg-gray-700 px-3 rounded">
                <option value="">Selecione o vendedor</option>
                {sellerOptions.map((seller) => <option key={seller.key} value={seller.key}>{seller.label}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="mb-4 rounded-lg border border-white/10 bg-gray-900/70 p-3">
          <div className="mb-2 text-sm font-semibold text-gray-200">Filtros de venda</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            {SALE_FILTER_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] p-2 text-sm text-gray-200">
                <input type="checkbox" checked={filters.saleFilters.includes(option.key)} onChange={() => toggleSaleFilter(option.key)} className="h-4 w-4 accent-cyan-300" />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <button type="button" onClick={() => setSelectedReports(DEFAULT_REPORTS)} className="px-3 py-2 bg-gray-700 rounded">Marcar todos</button>
          <button type="button" onClick={() => setSelectedReports([])} className="px-3 py-2 bg-gray-700 rounded">Limpar</button>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          {REPORT_OPTIONS.map((option) => (
            <label key={option.key} className="flex items-center gap-2 bg-gray-900 rounded p-2 text-sm">
              <input type="checkbox" checked={selectedReports.includes(option.key)} onChange={() => toggleReport(option.key)} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {!hasSelection ? (
        <div className="bg-gray-800 p-6 rounded text-gray-300">
          Os relatórios ficam ocultos até você selecionar uma loja ou vendedor.
        </div>
      ) : !hasSelectedReports ? (
        <div className="bg-gray-800 p-6 rounded text-gray-300">
          Marque pelo menos um bloco de relatório para visualizar e imprimir.
        </div>
      ) : (
        <>
          {reportSelected(selectedReports, 'summary') && (
            <div className="grid gap-4 md:grid-cols-4 mb-4">
              <ChartCard title="Receita Total" value={formatter(summary.revenue)} percent={Math.min(100, summary.revenue / 1000)} label={selectedLabel} />
              <ChartCard title="Vendas Fechadas" value={summary.closed} percent={summary.closed ? Math.min(100, (summary.closed / Math.max(1, filteredSales.length)) * 100) : 0} label="Fechadas ou esteira sim" />
              <ChartCard title="Comissão Total" value={formatter(totalCommission)} percent={Math.min(100, totalCommission / Math.max(1, summary.revenue))} label="Comissões calculadas por serviço" />
              <ChartCard title="Meta definida" value={`${filteredMetas.length}`} percent={filteredMetas.length ? 100 : 0} label="Metas no filtro selecionado" />
            </div>
          )}

          {reportSelected(selectedReports, 'hourly') && (
            <div className="bg-gray-800 rounded overflow-hidden mb-4">
              <div className="p-4 border-b border-gray-700">
                <h2 className="text-xl">Hora a Hora</h2>
                <div className="text-sm text-gray-400">{selectedLabel}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead className="bg-gray-900 text-left text-sm text-gray-300">
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
                    {hourlyPartialRows.map((row) => (
                      <tr key={row.hour} className="border-t border-gray-700">
                        <td className="p-3 font-semibold">{row.label}</td>
                        <td className="p-3">{numberFormatter(row.gross)}</td>
                        <td className="p-3">{numberFormatter(row.upgrade)}</td>
                        <td className="p-3">{numberFormatter(row.portability)}</td>
                        <td className="p-3">{numberFormatter(row.fiber)}</td>
                        <td className="p-3">{formatter(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            {reportSelected(selectedReports, 'monthly') && (
              <div className="bg-gray-800 p-4 rounded">
                <h2 className="text-xl mb-3">Receita mensal</h2>
                <div className="space-y-3">
                  {monthlyRevenue.length ? monthlyRevenue.map((item) => (
                    <div key={item.month} className="space-y-1">
                      <div className="flex justify-between text-sm text-gray-300"><span>{item.month}</span><span>{formatter(item.revenue)}</span></div>
                      <div className="h-3 bg-gray-700 rounded overflow-hidden">
                        <div className="h-full bg-blue-500 rounded" style={{ width: `${Math.min(100, (item.revenue / Math.max(...monthlyRevenue.map((month) => month.revenue), 1)) * 100)}%` }} />
                      </div>
                    </div>
                  )) : <div className="text-gray-400">Não há vendas por mês nesse filtro.</div>}
                </div>
              </div>
            )}

            {reportSelected(selectedReports, 'goals') && (
              <div className="bg-gray-800 p-4 rounded">
                <h2 className="text-xl mb-3">Meta x Realizado</h2>
                <div className="space-y-3">
                  {metasProgress.length ? metasProgress.map((meta) => (
                    <div key={meta.id} className="space-y-2 bg-gray-900 p-3 rounded">
                      <div className="flex items-center justify-between text-sm text-gray-300">
                        <span>{meta.label}</span>
                        <span>{meta.progress}%</span>
                      </div>
                      <div className="h-3 bg-gray-700 rounded overflow-hidden">
                        <div className="h-full bg-green-500 rounded" style={{ width: `${meta.progress}%` }} />
                      </div>
                      <div className="text-xs text-gray-400">Realizado: {formatGoalValue(meta.type, meta.achieved)} / Meta: {formatGoalValue(meta.type, meta.target)}</div>
                    </div>
                  )) : <div className="text-gray-400">Nenhuma meta cadastrada para esse filtro.</div>}
                </div>
              </div>
            )}
          </div>

          {reportSelected(selectedReports, 'status') && (
            <div className="bg-gray-800 p-4 rounded mb-4">
              <h2 className="text-xl mb-3">Status das vendas</h2>
              <div className="grid gap-3 md:grid-cols-3">
                {statusData.length ? statusData.map(([status, count]) => (
                  <div key={status} className="bg-gray-900 p-4 rounded">
                    <div className="text-sm text-gray-400 mb-2">{status}</div>
                    <div className="text-3xl font-semibold">{count}</div>
                    <div className="h-2 bg-gray-700 rounded mt-3 overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded" style={{ width: `${filteredSales.length ? (count / filteredSales.length) * 100 : 0}%` }} />
                    </div>
                  </div>
                )) : <div className="text-gray-400">Sem vendas para esse filtro.</div>}
              </div>
            </div>
          )}

          {reportSelected(selectedReports, 'commission') && (
            <div className="bg-gray-800 p-4 rounded mb-4">
              <h2 className="text-xl mb-3">Comissão por vendedor</h2>
              <div className="space-y-3">
                {sellerCommission.length ? sellerCommission.map(([seller, commission]) => (
                  <div key={seller} className="bg-gray-900 p-3 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span>{seller}</span>
                      <span className="text-sm text-gray-400">{formatter(commission)}</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded overflow-hidden">
                      <div className="h-full bg-yellow-500 rounded" style={{ width: `${totalCommission ? (commission / totalCommission) * 100 : 0}%` }} />
                    </div>
                  </div>
                )) : <div className="text-gray-400">Ainda não há comissão nesse filtro.</div>}
              </div>
            </div>
          )}

          {reportSelected(selectedReports, 'ranking') && (
            <div className="bg-gray-800 p-4 rounded mb-4">
              <h2 className="text-xl mb-3">Ranking</h2>
              <div className="space-y-3">
                {sellerRevenue.length ? sellerRevenue.map(([seller, total], index) => (
                  <div key={seller} className="bg-gray-900 p-3 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span>{index + 1}. {seller}</span>
                      <span className="text-sm text-gray-400">{formatter(total)}</span>
                    </div>
                    <div className="h-3 bg-gray-700 rounded overflow-hidden">
                      <div className="h-full bg-teal-500 rounded" style={{ width: `${summary.revenue ? (total / summary.revenue) * 100 : 0}%` }} />
                    </div>
                  </div>
                )) : <div className="text-gray-400">Ainda não há vendas registradas nesse filtro.</div>}
              </div>
            </div>
          )}

          {reportSelected(selectedReports, 'sales') && (
            <div className="bg-gray-800 rounded overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <h2 className="text-xl">Lista de vendas</h2>
                <div className="text-sm text-gray-400">{selectedLabel}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead className="bg-gray-900 text-left text-sm text-gray-300">
                    <tr>
                      <th className="p-3">Data</th>
                      <th className="p-3">Cliente</th>
                      <th className="p-3">CPF</th>
                      <th className="p-3">Vendedor</th>
                      <th className="p-3">Matrícula</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Valor</th>
                      <th className="p-3">Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map((sale) => (
                      <tr key={sale.id} className="border-t border-gray-700">
                        <td className="p-3">{getSaleDate(sale)?.toLocaleDateString('pt-BR') || '-'}</td>
                        <td className="p-3">{sale.customer || '-'}</td>
                        <td className="p-3">{sale.cpf || '-'}</td>
                        <td className="p-3">{getSellerName(sale, users)}</td>
                        <td className="p-3">{getSellerRegistration(sale, users) || '-'}</td>
                        <td className="p-3">{sale.status || '-'}</td>
                        <td className="p-3">{formatter(sale.amount)}</td>
                        <td className="p-3">{formatter(sale.commission || 0)}</td>
                      </tr>
                    ))}
                    {!filteredSales.length && (
                      <tr>
                        <td className="p-4 text-gray-400" colSpan="8">Sem vendas para esse filtro.</td>
                      </tr>
                    )}
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
