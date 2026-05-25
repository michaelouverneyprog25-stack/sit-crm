import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  TerminalSquare,
  Wrench,
} from 'lucide-react'
import { MetricCard, PageHeader, SkeletonRows } from '../components/ui'
import { retrySystemErrorRecovery, subscribeSystemErrors, updateSystemError } from '../firebase/db'
import { getInternalLogs, reportError } from '../utils/operationLog'
import { flushQueuedSystemErrors, getQueuedSystemErrorCount } from '../utils/systemErrorReporter'

const PAGE_SIZE = 12

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('pt-BR')
}

function statusClass(status) {
  if (status === 'resolvido' || status === 'resolvido_automaticamente') return 'border-emerald-300/30 bg-emerald-500/15 text-emerald-100'
  if (status === 'critico' || status === 'precisa_intervencao_admin') return 'border-red-300/30 bg-red-500/15 text-red-100'
  return 'border-amber-300/30 bg-amber-500/15 text-amber-100'
}

function severityClass(severity) {
  if (severity === 'critico') return 'text-red-200'
  if (severity === 'medio') return 'text-amber-200'
  return 'text-slate-300'
}

function toCsv(rows) {
  const headers = ['data', 'usuario', 'perfil', 'loja', 'modulo', 'acao', 'gravidade', 'status', 'codigo', 'mensagem']
  const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const lines = rows.map((row) => [
    row.occurredAt || row.createdAt,
    row.userEmail || row.userName,
    row.userRole,
    row.storeName,
    row.module,
    row.action,
    row.severity,
    row.status,
    row.code || row.httpStatus,
    row.message,
  ].map(escapeCell).join(';'))
  return [headers.join(';'), ...lines].join('\n')
}

function downloadCsv(rows) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `erros-crm-sit-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function SupportMonitor() {
  const [errors, setErrors] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [notice, setNotice] = useState('')
  const [filters, setFilters] = useState({
    search: '',
    module: '',
    severity: '',
    status: '',
    from: '',
    to: '',
  })
  const [page, setPage] = useState(1)

  useEffect(() => {
    setLogs(getInternalLogs())
    const unsubscribe = subscribeSystemErrors((rows) => {
      setErrors(rows)
      setLoading(false)
    }, (error) => {
      setLoading(false)
      setNotice('Não foi possível carregar a base de suporte.')
      reportError(error, { source: 'SupportMonitor', action: 'carregar erros', severity: 'critico', autoFix: false })
    })
    flushQueuedSystemErrors().catch(() => {})
    return unsubscribe
  }, [])

  const modules = useMemo(() => [...new Set(errors.map((item) => item.module).filter(Boolean))].sort(), [errors])
  const severities = useMemo(() => [...new Set(errors.map((item) => item.severity).filter(Boolean))].sort(), [errors])
  const statuses = useMemo(() => [...new Set(errors.map((item) => item.status).filter(Boolean))].sort(), [errors])

  const filteredErrors = useMemo(() => {
    return errors.filter((item) => {
      const haystack = normalize([item.userEmail, item.userName, item.storeName, item.module, item.action, item.message, item.code].join(' '))
      if (filters.search && !haystack.includes(normalize(filters.search))) return false
      if (filters.module && item.module !== filters.module) return false
      if (filters.severity && item.severity !== filters.severity) return false
      if (filters.status && item.status !== filters.status) return false
      const time = new Date(item.occurredAt || item.createdAt || 0).getTime()
      if (filters.from && time < new Date(`${filters.from}T00:00:00`).getTime()) return false
      if (filters.to && time > new Date(`${filters.to}T23:59:59`).getTime()) return false
      return true
    })
  }, [errors, filters])

  const totals = useMemo(() => ({
    total: errors.length,
    critical: errors.filter((item) => item.severity === 'critico').length,
    pending: errors.filter((item) => ['pendente', 'precisa_intervencao_admin'].includes(item.status)).length,
    resolved: errors.filter((item) => ['resolvido', 'resolvido_automaticamente'].includes(item.status)).length,
  }), [errors])

  const pageCount = Math.max(1, Math.ceil(filteredErrors.length / PAGE_SIZE))
  const pageRows = filteredErrors.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
    setPage(1)
  }

  async function markResolved(item) {
    setSavingId(item.id)
    setNotice('')
    try {
      await updateSystemError(item.id, {
        status: 'resolvido',
        resolvedAt: new Date().toISOString(),
      })
      setNotice('Erro marcado como resolvido.')
    } catch (error) {
      setNotice(error.message || 'Não foi possível atualizar o erro.')
    } finally {
      setSavingId('')
    }
  }

  async function retryFix(item) {
    setSavingId(item.id)
    setNotice('Estamos tentando corrigir automaticamente.')
    try {
      const result = await retrySystemErrorRecovery(item)
      setNotice(result.autoFixStatus === 'sucesso'
        ? 'Erro resolvido com sucesso.'
        : 'Não foi possível corrigir automaticamente. O suporte foi notificado.')
    } catch (error) {
      setNotice(error.message || 'Não foi possível tentar a correção automática.')
    } finally {
      setSavingId('')
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Suporte"
        title="Monitoramento de Erros"
        description="Base ADM para acompanhar falhas do SIT.LUMX CRM, acionar recuperação automática e exportar evidências para suporte."
        action={(
          <button
            type="button"
            onClick={() => downloadCsv(filteredErrors)}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
          >
            <Download className="h-4 w-4" />
            Exportar relatório
          </button>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Erros registrados" value={totals.total} icon={Activity} tone="cyan" />
        <MetricCard label="Críticos" value={totals.critical} icon={ShieldAlert} tone="rose" />
        <MetricCard label="Pendentes" value={totals.pending} icon={AlertTriangle} tone="amber" />
        <MetricCard label="Resolvidos" value={totals.resolved} icon={CheckCircle2} tone="green" helper={`${getQueuedSystemErrorCount()} pendente(s) locais`} />
      </div>

      {notice && (
        <div className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
          {notice}
        </div>
      )}

      <section className="rounded-xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl">
        <div className="mb-4 flex items-center gap-2 text-white">
          <Filter className="h-5 w-5 text-cyan-200" />
          <h2 className="text-lg font-semibold">Diagnóstico automático</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              placeholder="Buscar usuário, loja, erro"
              className="w-full rounded-lg border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white"
            />
          </div>
          <select value={filters.module} onChange={(event) => updateFilter('module', event.target.value)} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
            <option value="">Todos os módulos</option>
            {modules.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={filters.severity} onChange={(event) => updateFilter('severity', event.target.value)} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
            <option value="">Gravidade</option>
            {severities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
            <option value="">Status</option>
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} className="min-w-0 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
            <input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} className="min-w-0 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl">
        {loading ? <SkeletonRows rows={8} /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Data</th>
                    <th className="px-3 py-3">Usuário</th>
                    <th className="px-3 py-3">Módulo</th>
                    <th className="px-3 py-3">Gravidade</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Mensagem</th>
                    <th className="px-3 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {pageRows.map((item) => (
                    <tr key={item.id} className="align-top hover:bg-white/[0.03]">
                      <td className="px-3 py-3 text-slate-300">{formatDate(item.occurredAt || item.createdAt)}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-white">{item.userName || item.userEmail || '-'}</div>
                        <div className="text-xs text-slate-400">{[item.userRole, item.storeName].filter(Boolean).join(' · ') || '-'}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-300">{item.module || '-'}</td>
                      <td className={`px-3 py-3 font-semibold ${severityClass(item.severity)}`}>{item.severity || '-'}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full border px-2 py-1 text-xs font-medium ${statusClass(item.status)}`}>{item.status || 'pendente'}</span>
                      </td>
                      <td className="max-w-[330px] px-3 py-3">
                        <div className="line-clamp-2 text-slate-200">{item.message || '-'}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.code || item.httpStatus || item.screen || ''}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={savingId === item.id}
                            onClick={() => retryFix(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/25 px-2.5 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-50"
                          >
                            <Wrench className="h-3.5 w-3.5" />
                            Tentar corrigir
                          </button>
                          <button
                            type="button"
                            disabled={savingId === item.id}
                            onClick={() => markResolved(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/25 px-2.5 py-1.5 text-xs text-emerald-100 hover:bg-emerald-400/10 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Resolvido
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!pageRows.length && (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-slate-400">Nenhum erro encontrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-slate-400">{filteredErrors.length} registro(s) filtrado(s)</div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 disabled:opacity-40">Anterior</button>
                <span className="text-sm text-slate-400">Página {page} de {pageCount}</span>
                <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 disabled:opacity-40">Próxima</button>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white">
            <TerminalSquare className="h-5 w-5 text-cyan-200" />
            <h2 className="text-lg font-semibold">Logs do Sistema</h2>
          </div>
          <button type="button" onClick={() => setLogs(getInternalLogs())} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
        <div className="grid gap-2">
          {logs.slice(0, 12).map((log) => (
            <div key={log.id} className="rounded-lg border border-white/10 bg-slate-950/60 p-3 text-sm">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <span className="font-semibold text-slate-100">{log.event}</span>
                <span className="text-xs text-slate-500">{formatDate(log.createdAt)}</span>
              </div>
              <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-xs text-slate-400">{JSON.stringify(log.details || {}, null, 2)}</pre>
            </div>
          ))}
          {!logs.length && <div className="rounded-lg bg-slate-950/60 p-4 text-sm text-slate-400">Nenhum log local registrado.</div>}
        </div>
      </section>
    </div>
  )
}
