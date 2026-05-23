import React, { useEffect, useMemo, useState } from 'react'
import { getVendas, updateVenda } from '../firebase/db'
import { useAuth } from '../contexts/AuthContext'
import { appendJsonSheet, createWorkbook, writeWorkbook } from '../utils/excelExport'

const STATUS_OPTIONS = ['Aprovisionamento', 'Instalado', 'Cancelado', 'Reagendado']
const FULL_ACCESS_ROLES = ['Administrador', 'Gestor Master', 'Gerente']

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function isFiberSale(sale) {
  return normalize(sale.saleType).includes('fibra') || normalize(sale.plan).includes('fibra')
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('pt-BR')
}

function formatCep(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length !== 8) return value || '-'
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

function getAddress(sale) {
  const base = [sale.fiberInstallationAddress, sale.fiberInstallationNumber].filter(Boolean).join(', ')
  const complement = sale.fiberInstallationComplement ? ` - ${sale.fiberInstallationComplement}` : ''
  return `${base}${complement}` || '-'
}

function normalizeFiberStatus(status) {
  return status === 'Em andamento' ? 'Aprovisionamento' : status || 'Aprovisionamento'
}

function getStatusDetail(sale) {
  const status = normalizeFiberStatus(sale.fiberStatus)
  if (status === 'Instalado') return formatDate(sale.fiberCompletionDate)
  if (status === 'Cancelado') return sale.fiberCancelReason || '-'
  if (status === 'Reagendado') return sale.fiberCancelReason || '-'
  return 'Aguardando instalação'
}

function buildExportRows(sales) {
  return sales.map((sale) => {
    const status = normalizeFiberStatus(sale.fiberStatus)
    return {
      Contrato: sale.access || '',
      Cliente: sale.customer || '',
      Vendedor: sale.userName || sale.seller || '',
      CEP: formatCep(sale.fiberCep),
      'Endereco instalacao': getAddress(sale),
      Bairro: sale.fiberNeighborhood || '',
      Cidade: sale.fiberCity || '',
      Contato: sale.fiberClientContact || '',
      'Data instalacao': formatDate(sale.fiberInstallationDate),
      Status: status,
      'Nova data instalacao': status === 'Reagendado' ? formatDate(sale.fiberRescheduledDate) : '',
      'Conclusao / motivo': getStatusDetail(sale),
    }
  })
}

export default function FiberContracts() {
  const { currentUser } = useAuth()
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const canViewAll = FULL_ACCESS_ROLES.includes(currentUser?.role)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await getVendas({
        saleType: 'Fibra',
        seller: canViewAll ? undefined : currentUser?.email || undefined,
        userId: canViewAll ? undefined : currentUser?.uid || undefined,
        userEmail: canViewAll ? undefined : currentUser?.email || undefined,
      })
      setSales(Array.isArray(data) ? data.filter(isFiberSale) : [])
    } catch (err) {
      console.error('Erro ao carregar contratos de fibra:', err)
      setError('Não foi possível carregar os contratos de fibra.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [canViewAll, currentUser?.email, currentUser?.uid])

  const summary = useMemo(() => {
    return sales.reduce((totals, sale) => {
      const status = normalizeFiberStatus(sale.fiberStatus)
      totals.total += 1
      if (status === 'Instalado') totals.installed += 1
      if (status === 'Aprovisionamento') totals.provisioning += 1
      if (status === 'Cancelado') totals.canceled += 1
      if (status === 'Reagendado') totals.rescheduled += 1
      return totals
    }, { total: 0, installed: 0, provisioning: 0, canceled: 0, rescheduled: 0 })
  }, [sales])

  async function saveContract(sale, patch) {
    const nextSale = {
      ...sale,
      ...patch,
    }

    if (patch.fiberStatus === 'Instalado') {
      nextSale.fiberCancelReason = ''
      nextSale.fiberRescheduledDate = ''
    }
    if (patch.fiberStatus === 'Cancelado') {
      nextSale.fiberCompletionDate = ''
      nextSale.fiberRescheduledDate = ''
    }
    if (patch.fiberStatus === 'Aprovisionamento') {
      nextSale.fiberCompletionDate = ''
      nextSale.fiberCancelReason = ''
      nextSale.fiberRescheduledDate = ''
    }
    if (patch.fiberStatus === 'Reagendado') {
      nextSale.fiberCompletionDate = ''
    }

    setSavingId(sale.id)
    setError('')
    setSuccess('')
    try {
      const saved = await updateVenda(sale.id, nextSale)
      setSales((current) => current.map((item) => (item.id === sale.id ? { ...item, ...saved } : item)))
      setSuccess('Contrato de fibra atualizado.')
    } catch (err) {
      console.error('Erro ao atualizar contrato de fibra:', err)
      setError(err.message || 'Não foi possível atualizar o contrato de fibra.')
    } finally {
      setSavingId('')
    }
  }

  async function exportExcel() {
    const workbook = await createWorkbook()
    const rows = buildExportRows(sales)
    const headers = [
      'Contrato',
      'Cliente',
      'Vendedor',
      'CEP',
      'Endereco instalacao',
      'Bairro',
      'Cidade',
      'Contato',
      'Data instalacao',
      'Status',
      'Nova data instalacao',
      'Conclusao / motivo',
    ]
    await appendJsonSheet(workbook, 'Contratos fibra', rows, headers)
    await writeWorkbook(workbook, 'contratos-fibra.xlsx')
  }

  async function exportPdf() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
    const rows = buildExportRows(sales)
    const headers = [
      'Contrato',
      'Cliente',
      'CEP',
      'Endereco',
      'Bairro',
      'Cidade',
      'Contato',
      'Instalacao',
      'Status',
      'Nova data',
      'Conclusao / motivo',
    ]

    doc.setFontSize(16)
    doc.text('Contratos Fibra', 40, 40)
    doc.setFontSize(10)
    doc.text(`Total de contratos: ${sales.length}`, 40, 58)
    doc.text(`Aprovisionamento: ${summary.provisioning} | Instalados: ${summary.installed} | Cancelados: ${summary.canceled} | Reagendados: ${summary.rescheduled}`, 40, 74)

    if (!rows.length) {
      doc.text('Nenhum contrato de fibra encontrado.', 40, 104)
      doc.save('contratos-fibra.pdf')
      return
    }

    autoTable(doc, {
      startY: 96,
      head: [headers],
      body: rows.map((row) => [
        row.Contrato,
        row.Cliente,
        row.CEP,
        row['Endereco instalacao'],
        row.Bairro,
        row.Cidade,
        row.Contato,
        row['Data instalacao'],
        row.Status,
        row['Nova data instalacao'],
        row['Conclusao / motivo'],
      ]),
      theme: 'striped',
      headStyles: { fillColor: [8, 145, 178] },
      styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      margin: { left: 28, right: 28 },
    })

    doc.save('contratos-fibra.pdf')
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Fibra</p>
          <h1 className="mt-1 text-3xl font-semibold">Contratos Fibra</h1>
          <p className="mt-1 text-sm text-gray-400">Acompanhe instalação, cancelamento e dados residenciais dos contratos lançados em Nova venda.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportPdf} disabled={loading} className="rounded bg-blue-600 px-4 py-2.5 font-semibold disabled:opacity-50">
            Imprimir PDF
          </button>
          <button onClick={exportExcel} disabled={loading} className="rounded bg-green-600 px-4 py-2.5 font-semibold disabled:opacity-50">
            Exportar Excel
          </button>
          <button onClick={load} disabled={loading} className="rounded bg-cyan-600 px-4 py-2.5 font-semibold disabled:opacity-50">
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {error && <div className="rounded border border-red-300/30 bg-red-600/20 p-3 text-sm text-red-100">{error}</div>}
      {success && <div className="rounded border border-emerald-300/30 bg-emerald-600/20 p-3 text-sm text-emerald-100">{success}</div>}

      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded bg-gray-800 p-4">
          <div className="text-sm text-gray-400">Contratos</div>
          <div className="text-2xl font-semibold">{summary.total}</div>
        </div>
        <div className="rounded bg-gray-800 p-4">
          <div className="text-sm text-gray-400">Aprovisionamento</div>
          <div className="text-2xl font-semibold text-yellow-200">{summary.provisioning}</div>
        </div>
        <div className="rounded bg-gray-800 p-4">
          <div className="text-sm text-gray-400">Instalados</div>
          <div className="text-2xl font-semibold text-emerald-200">{summary.installed}</div>
        </div>
        <div className="rounded bg-gray-800 p-4">
          <div className="text-sm text-gray-400">Cancelados</div>
          <div className="text-2xl font-semibold text-red-200">{summary.canceled}</div>
        </div>
        <div className="rounded bg-gray-800 p-4">
          <div className="text-sm text-gray-400">Reagendados</div>
          <div className="text-2xl font-semibold text-cyan-200">{summary.rescheduled}</div>
        </div>
      </div>

      <div className="rounded bg-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse">
            <thead className="bg-gray-900 text-left text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="p-3">Contrato</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">CEP</th>
                <th className="p-3">Endereço instalação</th>
                <th className="p-3">Bairro</th>
                <th className="p-3">Cidade</th>
                <th className="p-3">Contato</th>
                <th className="p-3">Data instalação</th>
                <th className="p-3">Status</th>
                <th className="p-3">Nova data instalação</th>
                <th className="p-3">Conclusão / motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {sales.map((sale) => {
                const status = normalizeFiberStatus(sale.fiberStatus)
                return (
                  <tr key={sale.id} className="hover:bg-white/[0.03]">
                    <td className="p-3 font-semibold text-white">{sale.access || '-'}</td>
                    <td className="p-3 text-gray-300">
                      <div>{sale.customer || '-'}</div>
                      <div className="text-xs text-gray-500">{sale.userName || sale.seller || ''}</div>
                    </td>
                    <td className="p-3 text-gray-300">{formatCep(sale.fiberCep)}</td>
                    <td className="p-3 text-gray-300">{getAddress(sale)}</td>
                    <td className="p-3 text-gray-300">{sale.fiberNeighborhood || '-'}</td>
                    <td className="p-3 text-gray-300">{sale.fiberCity || '-'}</td>
                    <td className="p-3 text-gray-300">{sale.fiberClientContact || '-'}</td>
                    <td className="p-3 text-gray-300">{formatDate(sale.fiberInstallationDate)}</td>
                    <td className="p-3">
                      <select
                        value={status}
                        disabled={savingId === sale.id}
                        onChange={(event) => saveContract(sale, { fiberStatus: event.target.value })}
                        className="h-10 rounded bg-gray-700 px-3 text-sm"
                      >
                        {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </td>
                    <td className="p-3">
                      {status === 'Reagendado' ? (
                        <input
                          type="date"
                          value={sale.fiberRescheduledDate || ''}
                          disabled={savingId === sale.id}
                          onChange={(event) => saveContract(sale, { fiberRescheduledDate: event.target.value })}
                          className="h-10 rounded bg-gray-700 px-3 text-sm"
                        />
                      ) : (
                        <span className="text-sm text-gray-500">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      {status === 'Instalado' && (
                        <input
                          type="date"
                          value={sale.fiberCompletionDate || ''}
                          disabled={savingId === sale.id}
                          onChange={(event) => saveContract(sale, { fiberCompletionDate: event.target.value })}
                          className="h-10 rounded bg-gray-700 px-3 text-sm"
                        />
                      )}
                      {status === 'Cancelado' && (
                        <input
                          value={sale.fiberCancelReason || ''}
                          disabled={savingId === sale.id}
                          onChange={(event) => saveContract(sale, { fiberCancelReason: event.target.value })}
                          placeholder="Motivo do cancelamento"
                          className="h-10 w-full min-w-[260px] rounded bg-gray-700 px-3 text-sm"
                        />
                      )}
                      {status === 'Reagendado' && (
                        <input
                          value={sale.fiberCancelReason || ''}
                          disabled={savingId === sale.id}
                          onChange={(event) => saveContract(sale, { fiberCancelReason: event.target.value })}
                          placeholder="Motivo do reagendamento"
                          className="h-10 w-full min-w-[260px] rounded bg-gray-700 px-3 text-sm"
                        />
                      )}
                      {status === 'Aprovisionamento' && <span className="text-sm text-gray-400">Aguardando instalação</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!loading && !sales.length && (
          <div className="p-6 text-gray-400">Nenhum contrato de fibra encontrado.</div>
        )}
      </div>
    </div>
  )
}
