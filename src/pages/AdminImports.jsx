import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  History,
  Loader2,
  Search,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from 'lucide-react'
import { importBaseRows, subscribeImportHistory } from '../firebase/db'
import { useAuth } from '../contexts/AuthContext'
import { MetricCard, PageHeader, SkeletonRows } from '../components/ui'
import { reportError } from '../utils/operationLog'

const ACCEPTED_EXTENSIONS = ['xlsx', 'xls', 'csv']
const PAGE_SIZE = 8

const targetConfigs = {
  viabilidade_fibra: {
    label: 'Viabilidade Fibra',
    description: 'Cidade, bairro, CEP, logradouro e status de viabilidade.',
    collectionLabel: '/viabilidade_fibra',
    required: ['city', 'neighborhood', 'cep', 'viability'],
    aliases: {
      city: ['cidade', 'municipio', 'localidade', 'city'],
      neighborhood: ['bairro', 'neighborhood'],
      cep: ['cep', 'codigo postal', 'cod postal'],
      viability: ['viabilidade', 'status', 'motivo', 'situacao'],
      uf: ['uf', 'estado'],
      street: ['logradouro', 'rua', 'endereco', 'street'],
      number: ['numero', 'num', 'numero endereco'],
      complement: ['complemento', 'compl'],
      latitude: ['latitude', 'lat'],
      longitude: ['longitude', 'lng', 'long'],
    },
  },
  clientes: {
    label: 'Clientes',
    description: 'Base de clientes para consulta e relacionamento.',
    collectionLabel: '/clientes',
    required: ['name'],
    aliases: {
      name: ['nome', 'cliente', 'nome cliente', 'name'],
      cpf: ['cpf', 'documento', 'doc'],
      phone: ['telefone', 'celular', 'contato', 'phone'],
      email: ['email', 'e-mail'],
      city: ['cidade', 'municipio'],
      storeName: ['loja', 'store', 'storeName'],
    },
  },
  vendas: {
    label: 'Vendas',
    description: 'Importação controlada de vendas históricas.',
    collectionLabel: '/vendas',
    required: ['saleType', 'storeName'],
    aliases: {
      seller: ['vendedor', 'seller', 'email vendedor'],
      sellerName: ['nome vendedor', 'consultor'],
      storeName: ['loja', 'store', 'ponto de venda'],
      saleType: ['tipo venda', 'tipo', 'servico', 'produto'],
      customerName: ['cliente', 'nome cliente'],
      cpf: ['cpf', 'documento'],
      revenue: ['receita', 'valor receita', 'valor'],
      commission: ['comissao', 'comissão'],
      saleDate: ['data', 'data venda', 'createdAt'],
    },
  },
  metas: {
    label: 'Metas',
    description: 'Metas por loja, vendedor ou grupo.',
    collectionLabel: '/goals',
    required: ['month', 'year', 'targetValue'],
    aliases: {
      type: ['tipo', 'type'],
      storeName: ['loja', 'store'],
      sellerName: ['vendedor', 'seller', 'consultor'],
      userId: ['userId', 'id vendedor', 'uid'],
      groupName: ['grupo', 'equipe'],
      month: ['mes', 'mês', 'month'],
      year: ['ano', 'year'],
      targetValue: ['meta', 'target', 'valor meta', 'quantidade'],
      currentValue: ['realizado', 'realizada'],
    },
  },
  lojas: {
    label: 'Lojas',
    description: 'Cadastro de lojas usado pelo CRM.',
    collectionLabel: '/stores',
    required: ['name', 'city', 'state'],
    aliases: {
      name: ['loja', 'nome loja', 'name', 'store'],
      city: ['cidade', 'municipio'],
      state: ['uf', 'estado'],
      managerName: ['gerente', 'manager'],
    },
  },
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeKey(value) {
  return normalizeHeader(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number(String(value || '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function getExtension(fileName = '') {
  return String(fileName).split('.').pop().toLowerCase()
}

function buildHeaderMap(headers, aliases) {
  const normalizedHeaders = headers.map((header) => normalizeHeader(header))
  return Object.fromEntries(Object.entries(aliases).map(([field, names]) => {
    const wanted = names.map(normalizeHeader)
    const index = normalizedHeaders.findIndex((header) => wanted.includes(header))
    return [field, index >= 0 ? headers[index] : '']
  }))
}

function getCell(row, header) {
  if (!header) return ''
  return row[header] ?? ''
}

function buildDocId(target, row, index) {
  if (target === 'viabilidade_fibra') {
    return [
      row.uf,
      row.city,
      row.neighborhood,
      row.cep,
      row.street,
      row.number,
      row.viability,
    ].map(normalizeKey).filter(Boolean).join('|')
  }
  if (target === 'clientes') return normalizeKey(row.cpf || row.phone || `${row.name}-${index}`)
  if (target === 'vendas') return normalizeKey(row.cpf || `${row.storeName}-${row.seller || row.sellerName}-${row.saleType}-${row.saleDate}-${index}`)
  if (target === 'metas') return normalizeKey(`${row.year}-${row.month}-${row.type || 'meta'}-${row.storeName || row.userId || row.groupName || index}`)
  if (target === 'lojas') return normalizeKey(`${row.name}-${row.city}-${row.state}`)
  return normalizeKey(`${target}-${index}`)
}

function mapRow(target, row, headerMap, index) {
  const config = targetConfigs[target]
  const mapped = {}

  Object.keys(config.aliases).forEach((field) => {
    mapped[field] = normalizeText(getCell(row, headerMap[field]))
  })

  if (target === 'viabilidade_fibra') {
    mapped.uf = mapped.uf.toUpperCase()
    mapped.cep = onlyDigits(mapped.cep).slice(0, 8)
    mapped.city = mapped.city.toUpperCase()
    mapped.neighborhood = mapped.neighborhood.toUpperCase()
    mapped.viability = mapped.viability || 'Nao informado'
  }

  if (target === 'clientes') {
    mapped.cpf = onlyDigits(mapped.cpf).slice(0, 11)
    mapped.phone = onlyDigits(mapped.phone)
  }

  if (target === 'vendas') {
    mapped.revenue = parseNumber(mapped.revenue)
    mapped.commission = parseNumber(mapped.commission)
    mapped.status = 'Importada'
  }

  if (target === 'metas') {
    mapped.month = Number(onlyDigits(mapped.month)) || 0
    mapped.year = Number(onlyDigits(mapped.year)) || 0
    mapped.targetValue = parseNumber(mapped.targetValue)
    mapped.currentValue = parseNumber(mapped.currentValue)
    mapped.type = mapped.type || (mapped.userId || mapped.sellerName ? 'seller' : mapped.groupName ? 'group' : 'store')
  }

  if (target === 'lojas') {
    mapped.state = mapped.state.toUpperCase().slice(0, 2)
    mapped.normalizedName = normalizeHeader(mapped.name)
  }

  mapped._docId = buildDocId(target, mapped, index)
  return mapped
}

function validateRow(target, row, index) {
  const missing = targetConfigs[target].required.filter((field) => !String(row[field] ?? '').trim())
  if (target === 'metas' && (!row.month || row.month < 1 || row.month > 12)) missing.push('month')
  if (target === 'metas' && (!row.year || row.year < 2020)) missing.push('year')
  if (missing.length) {
    return `Linha ${index + 2}: campo obrigatório ausente (${[...new Set(missing)].join(', ')}).`
  }
  return ''
}

async function parseSpreadsheet(file, target) {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', raw: false, cellDates: false })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!firstSheet) throw new Error('A planilha não possui abas com dados.')

  const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', blankrows: false })
  if (!rawRows.length) throw new Error('A planilha está vazia.')

  const headers = Object.keys(rawRows[0] || {})
  const headerMap = buildHeaderMap(headers, targetConfigs[target].aliases)
  const missingColumns = targetConfigs[target].required.filter((field) => !headerMap[field])
  if (missingColumns.length) {
    throw new Error(`Colunas obrigatórias não encontradas: ${missingColumns.join(', ')}.`)
  }

  const seen = new Set()
  const validRows = []
  const errors = []
  let duplicateRows = 0

  rawRows.forEach((rawRow, index) => {
    const isEmpty = Object.values(rawRow).every((value) => !String(value || '').trim())
    if (isEmpty) return

    const mapped = mapRow(target, rawRow, headerMap, index)
    const error = validateRow(target, mapped, index)
    if (error) {
      errors.push(error)
      return
    }

    if (seen.has(mapped._docId)) {
      duplicateRows += 1
      return
    }
    seen.add(mapped._docId)
    validRows.push(mapped)
  })

  return {
    rows: validRows,
    headers,
    errors,
    duplicateRows,
    totalRows: rawRows.length,
    invalidRows: errors.length,
  }
}

function statusClass(status) {
  if (status === 'concluido') return 'border-emerald-300/30 bg-emerald-500/15 text-emerald-100'
  if (status === 'erro') return 'border-red-300/30 bg-red-500/15 text-red-100'
  return 'border-cyan-300/30 bg-cyan-500/15 text-cyan-100'
}

export default function AdminImports() {
  const { currentUser } = useAuth()
  const inputRef = useRef(null)
  const [target, setTarget] = useState('viabilidade_fibra')
  const [fileInfo, setFileInfo] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Aguardando planilha')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const unsubscribe = subscribeImportHistory((rows) => {
      setHistory(rows)
      setHistoryLoading(false)
    }, (error) => {
      console.error('Erro ao carregar histórico de importação:', error)
      setHistoryLoading(false)
    })
    return unsubscribe
  }, [])

  const previewRows = useMemo(() => {
    const rows = parsed?.rows || []
    const term = normalizeHeader(search)
    if (!term) return rows
    return rows.filter((row) => normalizeHeader(Object.values(row).join(' ')).includes(term))
  }, [parsed, search])

  const pageCount = Math.max(1, Math.ceil(previewRows.length / PAGE_SIZE))
  const pageRows = previewRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const previewColumns = useMemo(() => {
    const rows = parsed?.rows || []
    const columns = Object.keys(rows[0] || {}).filter((key) => key !== '_docId')
    return columns.slice(0, 8)
  }, [parsed])

  async function handleFile(file) {
    setMessage('')
    setParsed(null)
    setProgress(12)
    setStatus('Processando...')

    if (!file) return
    const extension = getExtension(file.name)
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setStatus('Erro ao importar')
      setMessage('Arquivo inválido. Envie .xlsx, .xls ou .csv.')
      setProgress(0)
      return
    }

    setBusy(true)
    setFileInfo({ name: file.name, size: file.size, type: extension, importedAt: new Date().toISOString() })
    try {
      const result = await parseSpreadsheet(file, target)
      setParsed(result)
      setProgress(55)
      setStatus(result.rows.length ? 'Planilha validada' : 'Nenhuma linha válida')
      setMessage(result.rows.length
        ? `${result.rows.length} linha(s) pronta(s), ${result.invalidRows} inválida(s), ${result.duplicateRows} duplicada(s).`
        : 'Todas as linhas foram removidas por erro, vazio ou duplicidade.')
      setPage(1)
    } catch (error) {
      reportError(error, { source: 'AdminImports', action: 'processar planilha', module: 'importacao excel', severity: 'medio', autoFix: true })
      setStatus('Erro ao importar')
      setMessage(error.message || 'Não foi possível processar a planilha.')
      setProgress(0)
    } finally {
      setBusy(false)
    }
  }

  async function importRows() {
    if (!parsed?.rows?.length || !fileInfo) return
    setBusy(true)
    setProgress(70)
    setStatus('Importando...')
    setMessage('Gravando dados em lote no Firestore.')

    try {
      const result = await importBaseRows({
        target,
        rows: parsed.rows,
        fileName: fileInfo.name,
        actor: currentUser,
        stats: {
          totalRows: parsed.totalRows,
          invalidRows: parsed.invalidRows,
          duplicateRows: parsed.duplicateRows,
          errors: parsed.errors,
        },
      })
      setProgress(100)
      setStatus('Base atualizada com sucesso')
      setMessage(`${result.importedRows} registro(s) salvo(s) em ${targetConfigs[target].collectionLabel}.`)
    } catch (error) {
      reportError(error, { source: 'AdminImports', action: 'salvar importacao', module: 'importacao excel', severity: 'critico', autoFix: true })
      setStatus('Erro ao importar')
      setMessage(error.message || 'Não foi possível salvar no Firestore.')
      setProgress(70)
    } finally {
      setBusy(false)
    }
  }

  function onDrop(event) {
    event.preventDefault()
    setDragging(false)
    handleFile(event.dataTransfer.files?.[0])
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Administração"
        title="Importação de Base"
        description="Transforme planilhas Excel ou CSV em dados do CRM com validação, deduplicação, histórico e gravação segura no Firestore."
        action={(
          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
            <ShieldCheck className="h-4 w-4" />
            Apenas Administrador
          </div>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard label="Base destino" value={targetConfigs[target].collectionLabel} icon={Database} tone="cyan" />
        <MetricCard label="Linhas válidas" value={parsed?.rows?.length || 0} icon={CheckCircle2} tone="green" />
        <MetricCard label="Linhas com erro" value={parsed?.invalidRows || 0} icon={AlertTriangle} tone="amber" />
        <MetricCard label="Duplicidades" value={parsed?.duplicateRows || 0} icon={XCircle} tone="rose" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl"
        >
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">Tipo de base</label>
              <select
                value={target}
                onChange={(event) => {
                  setTarget(event.target.value)
                  setParsed(null)
                  setMessage('')
                  setProgress(0)
                  setStatus('Aguardando planilha')
                }}
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
                disabled={busy}
              >
                {Object.entries(targetConfigs).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-400">{targetConfigs[target].description}</p>
            </div>

            <div
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={[
                'flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition',
                dragging ? 'border-cyan-200 bg-cyan-300/10' : 'border-cyan-300/30 bg-slate-950/70 hover:bg-slate-950',
              ].join(' ')}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
              <UploadCloud className="h-12 w-12 text-cyan-200" />
              <h2 className="mt-3 text-xl font-semibold text-white">Arraste a planilha ou clique para enviar</h2>
              <p className="mt-1 text-sm text-slate-400">Arquivos aceitos: .xlsx, .xls e .csv</p>
              {fileInfo && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                  <FileSpreadsheet className="h-4 w-4 text-cyan-200" />
                  {fileInfo.name}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-white/10 bg-slate-950/70 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">{status}</div>
                <div className="mt-1 text-sm text-slate-400">{message || 'Selecione um arquivo para iniciar a validação automática.'}</div>
              </div>
              <button
                type="button"
                onClick={importRows}
                disabled={busy || !parsed?.rows?.length}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                Salvar no Firestore
              </button>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-cyan-300 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </motion.section>

        <section className="rounded-xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-2">
            <History className="h-5 w-5 text-cyan-200" />
            <h2 className="text-lg font-semibold text-white">Histórico de importações</h2>
          </div>
          {historyLoading ? <SkeletonRows rows={5} /> : (
            <div className="space-y-3">
              {history.slice(0, 8).map((item) => (
                <div key={item.id} className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{item.fileName}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.userName || item.userEmail || 'Administrador'}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${statusClass(item.status)}`}>
                      {item.status || 'processando'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-400">
                    <div><span className="text-slate-200">{item.importedRows || item.validRows || 0}</span> salvos</div>
                    <div><span className="text-slate-200">{item.invalidRows || 0}</span> erros</div>
                    <div><span className="text-slate-200">{item.duplicateRows || 0}</span> dup.</div>
                  </div>
                </div>
              ))}
              {!history.length && <div className="rounded-lg bg-slate-950/60 p-4 text-sm text-slate-400">Nenhuma importação registrada.</div>}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Prévia da planilha</h2>
            <p className="text-sm text-slate-400">Linhas inválidas e duplicadas são removidas antes da gravação.</p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Buscar na prévia"
              className="w-full rounded-lg border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 md:w-72"
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase text-slate-400">
              <tr>
                {previewColumns.length ? previewColumns.map((column) => (
                  <th key={column} className="px-3 py-3">{column}</th>
                )) : <th className="px-3 py-3">Dados</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {pageRows.map((row) => (
                <tr key={row._docId} className="hover:bg-white/[0.03]">
                  {previewColumns.map((column) => (
                    <td key={column} className="max-w-[220px] truncate px-3 py-3 text-slate-300">{String(row[column] ?? '-')}</td>
                  ))}
                </tr>
              ))}
              {!pageRows.length && (
                <tr>
                  <td colSpan={Math.max(previewColumns.length, 1)} className="px-3 py-8 text-center text-slate-400">
                    Nenhuma linha validada para exibir.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-slate-400">{previewRows.length} registro(s) na prévia</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-sm text-slate-400">Página {page} de {pageCount}</span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              disabled={page >= pageCount}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>

        {!!parsed?.errors?.length && (
          <div className="mt-5 rounded-lg border border-amber-300/25 bg-amber-400/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-100">
              <AlertTriangle className="h-4 w-4" />
              Erros encontrados
            </div>
            <div className="max-h-40 space-y-1 overflow-auto text-xs text-amber-100/80">
              {parsed.errors.slice(0, 30).map((error) => <div key={error}>{error}</div>)}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
