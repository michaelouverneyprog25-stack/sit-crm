import React, { useEffect, useMemo, useState } from 'react'
import { getUsers, getVendas } from '../firebase/db'
import { appendJsonSheet, createWorkbook, writeWorkbook } from '../utils/excelExport'

function parseDate(value) {
  if (!value) return null
  if (value.toDate) return value.toDate()
  if (value.seconds) return new Date(value.seconds * 1000)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateTime(value) {
  const date = parseDate(value)
  return date ? date.toLocaleString('pt-BR') : ''
}

function formatSaleDate(sale) {
  if (sale.saleDate) {
    const date = new Date(`${sale.saleDate}T12:00:00`)
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('pt-BR')
  }

  const fallback = parseDate(sale.createdAt)
  return fallback ? fallback.toLocaleDateString('pt-BR') : ''
}

function formatCurrency(value) {
  if (value === '' || value === null || value === undefined) return ''
  const amount = Number(value)
  if (!Number.isFinite(amount)) return ''
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function numberOrBlank(value) {
  if (value === '' || value === null || value === undefined) return ''
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : ''
}

function firstFilled(...values) {
  return values.find((value) => value !== '' && value !== null && value !== undefined)
}

function getSaleRevenueValue(sale) {
  if (normalize(sale.plan) === 'dependente') return 0
  if (normalize(sale.saleType).includes('acessorio')) return 0
  if (sale.saleType === 'Upgrade') return 0
  const value = sale.planValue !== undefined && sale.planValue !== ''
    ? Number(sale.planValue || 0)
    : Number(sale.amount || 0)
  return Number.isFinite(value) ? value : 0
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function getUserForSale(sale, users) {
  return users.find((user) => (
    user.uid === sale.userId
    || user.id === sale.userId
    || normalize(user.email) === normalize(sale.seller)
    || normalize(user.email) === normalize(sale.userEmail)
  ))
}

function getSellerName(sale, users) {
  const user = getUserForSale(sale, users)
  return user?.name || sale.userName || sale.sellerName || 'Sem vendedor'
}

function getSellerEmail(sale, users) {
  const user = getUserForSale(sale, users)
  return user?.email || sale.seller || sale.userEmail || ''
}

function getStoreField(sale, users, fieldName) {
  const user = getUserForSale(sale, users)
  if (fieldName === 'name') return sale.storeName || user?.storeName || user?.store || user?.loja || ''
  if (fieldName === 'city') return sale.storeCity || user?.storeCity || user?.city || user?.cidade || ''
  if (fieldName === 'state') return sale.storeState || user?.storeState || user?.state || user?.estado || ''
  return ''
}

function getFields(users) {
  return [
    { label: 'Data da venda', value: formatSaleDate },
    { label: 'Cliente', value: (sale) => sale.customer || '' },
    { label: 'CPF', value: (sale) => sale.cpf || '' },
    { label: 'Modalidade', value: (sale) => sale.saleType || '' },
    { label: 'Acesso', value: (sale) => sale.access || '' },
    { label: 'Plano', value: (sale) => sale.plan || '' },
    { label: 'Valor do plano', value: (sale) => formatCurrency(firstFilled(sale.planValue, sale.amount)), excelValue: (sale) => numberOrBlank(firstFilled(sale.planValue, sale.amount)) },
    { label: 'Receita', value: (sale) => formatCurrency(getSaleRevenueValue(sale)), excelValue: (sale) => numberOrBlank(getSaleRevenueValue(sale)) },
    { label: 'DACC', value: (sale) => sale.dacc || '' },
    { label: 'Seguro', value: (sale) => sale.insurance || sale.seguro || '' },
    { label: 'Valor do seguro', value: (sale) => formatCurrency(sale.insuranceValue ?? sale.seguroValue), excelValue: (sale) => numberOrBlank(sale.insuranceValue ?? sale.seguroValue) },
    { label: 'Esteira', value: (sale) => sale.status || '' },
    { label: 'Numero provisorio', value: (sale) => sale.provisionalNumber || '' },
    { label: 'Plano anterior', value: (sale) => sale.previousPlan || '' },
    { label: 'Modelo do aparelho', value: (sale) => sale.deviceModel || '' },
    { label: 'Valor do aparelho', value: (sale) => formatCurrency(sale.deviceValue), excelValue: (sale) => numberOrBlank(sale.deviceValue) },
    { label: 'IMEI', value: (sale) => sale.imei || '' },
    { label: 'Origem do aparelho', value: (sale) => sale.deviceOrigin || '' },
    { label: 'Loja', value: (sale) => getStoreField(sale, users, 'name') },
    { label: 'Cidade da loja', value: (sale) => getStoreField(sale, users, 'city') },
    { label: 'UF da loja', value: (sale) => getStoreField(sale, users, 'state') },
    { label: 'Vendedor', value: (sale) => getSellerName(sale, users) },
    { label: 'Nome do usuario logado', value: (sale) => sale.userName || getSellerName(sale, users) },
    { label: 'Email do usuario logado', value: (sale) => sale.userEmail || sale.seller || getSellerEmail(sale, users) },
    { label: 'Comissao vendedor', value: (sale) => formatCurrency(sale.commission), excelValue: (sale) => numberOrBlank(sale.commission) },
    { label: 'Comissao upgrade', value: (sale) => formatCurrency(sale.commissionDetails?.upgrade?.amount), excelValue: (sale) => numberOrBlank(sale.commissionDetails?.upgrade?.amount) },
    { label: 'Comissao seguro', value: (sale) => formatCurrency(sale.commissionDetails?.insurance?.amount), excelValue: (sale) => numberOrBlank(sale.commissionDetails?.insurance?.amount) },
    { label: 'Comissao loja', value: (sale) => formatCurrency(sale.storeCommission), excelValue: (sale) => numberOrBlank(sale.storeCommission) },
    { label: 'Percentual comissao', value: (sale) => sale.commissionRate ? `${Number(sale.commissionRate * 100).toFixed(2)}%` : '', excelValue: (sale) => numberOrBlank(sale.commissionRate) },
    { label: 'Criado em', value: (sale) => formatDateTime(sale.createdAt) },
    { label: 'Atualizado em', value: (sale) => formatDateTime(sale.updatedAt) },
  ]
}

export default function AllSalesReport() {
  const [sales, setSales] = useState([])
  const [users, setUsers] = useState([])
  const [filters, setFilters] = useState({ search: '', fromDate: '', toDate: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadSales(nextFilters = filters) {
    setLoading(true)
    setError('')

    try {
      const [salesData, usersData] = await Promise.all([
        getVendas({
          fromDate: nextFilters.fromDate || undefined,
          toDate: nextFilters.toDate || undefined,
        }),
        getUsers(),
      ])
      setSales(Array.isArray(salesData) ? salesData : [])
      setUsers(Array.isArray(usersData) ? usersData : [])
    } catch (err) {
      console.error('Erro ao carregar relatorio geral de vendas:', err)
      setError('Nao foi possivel carregar o relatorio geral de vendas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSales()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fields = useMemo(() => getFields(users), [users])

  const filteredSales = useMemo(() => {
    const text = normalize(filters.search)
    if (!text) return sales

    return sales.filter((sale) => {
      return fields.some((field) => normalize(field.value(sale)).includes(text))
    })
  }, [fields, filters.search, sales])

  const totals = useMemo(() => {
    return filteredSales.reduce((acc, sale) => ({
      amount: acc.amount + getSaleRevenueValue(sale),
      commission: acc.commission + Number(sale.commission || 0),
      storeCommission: acc.storeCommission + Number(sale.storeCommission || 0),
    }), { amount: 0, commission: 0, storeCommission: 0 })
  }, [filteredSales])

  function changeFilter(e) {
    const { name, value } = e.target
    setFilters((current) => ({ ...current, [name]: value }))
  }

  function buildExcelRows() {
    return filteredSales.map((sale) => {
      const row = {}
      fields.forEach((field) => {
        row[field.label] = field.excelValue ? field.excelValue(sale) : field.value(sale)
      })
      return row
    })
  }

  async function exportExcel() {
    const workbook = await createWorkbook()
    const rows = buildExcelRows()
    await appendJsonSheet(workbook, 'Todas as vendas', rows, fields.map((field) => field.label))
    await writeWorkbook(workbook, 'relatorio-geral-vendas.xlsx')
  }

  async function exportPdf() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    doc.setFontSize(16)
    doc.text('Relatorio geral de vendas', 40, 40)
    doc.setFontSize(10)
    doc.text(`Total de vendas: ${filteredSales.length}`, 40, 58)
    doc.text(`Receita total: ${formatCurrency(totals.amount)}`, 40, 74)

    if (!filteredSales.length) {
      doc.text('Nenhuma venda encontrada para os filtros atuais.', 40, 104)
      doc.save('relatorio-geral-vendas.pdf')
      return
    }

    let cursor = 104
    filteredSales.forEach((sale, index) => {
      if (cursor > 700) {
        doc.addPage()
        cursor = 40
      }

      doc.setFontSize(11)
      doc.text(`Venda ${index + 1} - ${sale.customer || 'Sem cliente'}`, 40, cursor)
      autoTable(doc, {
        startY: cursor + 10,
        head: [['Campo', 'Informacao']],
        body: fields.map((field) => [field.label, field.value(sale)]),
        theme: 'striped',
        headStyles: { fillColor: [30, 64, 175] },
        styles: { fontSize: 7, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 150 },
          1: { cellWidth: 360 },
        },
        margin: { left: 40, right: 40 },
      })
      cursor = doc.lastAutoTable.finalY + 24
    })

    doc.save('relatorio-geral-vendas.pdf')
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl">Relatorio geral de vendas</h1>
          <p className="text-sm text-gray-400">Todas as vendas cadastradas com as informacoes lancadas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => loadSales()} disabled={loading} className="bg-gray-700 px-4 py-2 rounded hover:bg-gray-600 disabled:opacity-50">Atualizar</button>
          <button onClick={exportPdf} disabled={loading} className="bg-blue-600 px-4 py-2 rounded hover:bg-blue-500 disabled:opacity-50">Imprimir PDF</button>
          <button onClick={exportExcel} disabled={loading} className="bg-green-600 px-4 py-2 rounded hover:bg-green-500 disabled:opacity-50">Exportar Excel</button>
        </div>
      </div>

      {error && <div className="mb-4 bg-red-600 text-white p-3 rounded">{error}</div>}

      <div className="grid gap-3 md:grid-cols-4 mb-4">
        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-400">Vendas no relatorio</div>
          <div className="text-2xl font-semibold">{filteredSales.length}</div>
        </div>
        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-400">Receita total</div>
          <div className="text-2xl font-semibold">{formatCurrency(totals.amount)}</div>
        </div>
        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-400">Comissao vendedor</div>
          <div className="text-2xl font-semibold">{formatCurrency(totals.commission)}</div>
        </div>
        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-400">Comissao loja</div>
          <div className="text-2xl font-semibold">{formatCurrency(totals.storeCommission)}</div>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded mb-4">
        <div className="grid gap-2 md:grid-cols-4">
          <input
            name="search"
            value={filters.search}
            onChange={changeFilter}
            placeholder="Buscar por cliente, CPF, vendedor, loja..."
            className="p-2 bg-gray-700 rounded md:col-span-2"
          />
          <input name="fromDate" type="date" value={filters.fromDate} onChange={changeFilter} className="p-2 bg-gray-700 rounded" />
          <input name="toDate" type="date" value={filters.toDate} onChange={changeFilter} className="p-2 bg-gray-700 rounded" />
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" onClick={() => loadSales()} disabled={loading} className="bg-blue-600 px-3 py-2 rounded disabled:opacity-50">Aplicar periodo</button>
          <button
            type="button"
            onClick={() => {
              const resetFilters = { search: '', fromDate: '', toDate: '' }
              setFilters(resetFilters)
              loadSales(resetFilters)
            }}
            className="bg-gray-700 px-3 py-2 rounded"
          >
            Limpar filtros
          </button>
        </div>
      </div>

      <div className="bg-gray-800 rounded overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl">Vendas geradas</h2>
          {loading && <div className="text-sm text-gray-400 mt-1">Carregando vendas...</div>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1900px] border-collapse text-sm">
            <thead className="bg-gray-900 text-left text-gray-300">
              <tr>
                {fields.map((field) => (
                  <th key={field.label} className="p-3 whitespace-nowrap">{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="border-t border-gray-700 hover:bg-gray-900/70">
                  {fields.map((field) => (
                    <td key={field.label} className="p-3 align-top whitespace-nowrap">{field.value(sale)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !filteredSales.length && (
            <div className="p-4 text-gray-400">Nenhuma venda encontrada.</div>
          )}
        </div>
      </div>
    </div>
  )
}
