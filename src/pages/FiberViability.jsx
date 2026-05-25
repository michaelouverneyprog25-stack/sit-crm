import React, { useEffect, useMemo, useState } from 'react'
import { Activity, Database, Search, ShieldAlert } from 'lucide-react'
import { diagnoseFiberViability, getFiberViabilityCities, searchFiberViability } from '../firebase/db'
import { MetricCard, PageHeader, SkeletonRows } from '../components/ui'

const emptyFilters = {
  city: '',
  cep: '',
  street: '',
  number: '',
  neighborhood: '',
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR')
}

function formatCep(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length !== 8) return value || '-'
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

function formatCepInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

function isViable(row) {
  return String(row.viability || '').toLowerCase().includes('viável')
    || String(row.viabilityCode || '') === '1'
}

export default function FiberViability() {
  const [filters, setFilters] = useState(emptyFilters)
  const [result, setResult] = useState({ rows: [], totalMatches: 0, scannedRows: 0, elapsedMs: 0 })
  const [cities, setCities] = useState([])
  const [loadingCities, setLoadingCities] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [diagnostics, setDiagnostics] = useState(null)

  const hasFilters = useMemo(() => {
    return Object.values(filters).some((value) => String(value || '').trim())
  }, [filters])

  useEffect(() => {
    let active = true
    async function loadBase() {
      setLoadingCities(true)
      try {
        const [cityData, diagnosticData] = await Promise.allSettled([
          getFiberViabilityCities(),
          diagnoseFiberViability(),
        ])
        if (!active) return

        if (cityData.status === 'fulfilled') {
          setCities(Array.isArray(cityData.value) ? cityData.value : [])
        } else {
          console.error('Erro ao carregar cidades da base de fibra:', cityData.reason)
          setCities([])
          setError(cityData.reason?.message || 'Não foi possível carregar as cidades cadastradas de fibra.')
        }

        if (diagnosticData.status === 'fulfilled') {
          setDiagnostics(diagnosticData.value)
        } else {
          console.warn('Diagnóstico de fibra indisponível:', diagnosticData.reason)
        }
      } catch (err) {
        console.error('Erro ao carregar base de fibra:', err)
        if (active) {
          setCities([])
          setError(err.message || 'A base de fibra falhou ao carregar. O suporte foi notificado.')
        }
      } finally {
        if (active) setLoadingCities(false)
      }
    }

    loadBase()

    return () => {
      active = false
    }
  }, [])

  function changeFilter(event) {
    const { name, value } = event.target
    setFilters((current) => ({
      ...current,
      [name]: name === 'cep' || name === 'number' ? value.replace(/\D/g, '') : value,
    }))
  }

  async function search(event) {
    event.preventDefault()
    setError('')
    setSearched(true)

    if (!hasFilters) {
      setResult({ rows: [], totalMatches: 0, scannedRows: 0, elapsedMs: 0 })
      setError('Informe ao menos cidade, CEP, rua ou número para pesquisar.')
      return
    }

    setLoading(true)
    try {
      const data = await searchFiberViability(filters)
      setResult(data)
    } catch (err) {
      console.error('Erro ao consultar viabilidade:', err)
      setError(err.message || 'Não foi possível consultar a viabilidade de fibra.')
    } finally {
      setLoading(false)
    }
  }

  function clear() {
    setFilters(emptyFilters)
    setResult({ rows: [], totalMatches: 0, scannedRows: 0, elapsedMs: 0 })
    setError('')
    setSearched(false)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        eyebrow="Rede TIM"
        title="Viabilidade de Fibra"
        description="Consulta otimizada com cache, fallback e diagnóstico automático das bases de cobertura."
        metric={(
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-sm text-gray-400">Resultados encontrados</div>
            <div className="text-2xl font-semibold">{formatNumber(result.totalMatches)}</div>
          </div>
        )}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Cidades carregadas"
          value={loadingCities ? '...' : formatNumber(cities.length)}
          helper="Cache inteligente e fallback por lojas"
          tone="cyan"
          icon={Database}
        />
        <MetricCard
          label="Base de fibra"
          value={diagnostics?.hasData ? 'Ativa' : 'Diagnóstico'}
          helper={diagnostics?.localBase?.status
            ? `Arquivo local: ${diagnostics.localBase.status}`
            : diagnostics?.primaryCollectionActive
              ? 'Usando somente /viabilidade_fibra'
            : `${diagnostics?.collections?.filter((item) => item.status === 'ok').length || 0} collection(s) com dados`}
          tone={diagnostics?.hasData ? 'emerald' : 'amber'}
          icon={Activity}
        />
        <MetricCard
          label="Linhas em cache"
          value={formatNumber(diagnostics?.cachedRows || 0)}
          helper="Usadas automaticamente se Firestore/API falhar"
          tone="violet"
          icon={ShieldAlert}
        />
      </div>

      {error && <div className="rounded border border-red-300/30 bg-red-600/20 p-3 text-sm text-red-100">{error}</div>}
      {diagnostics && !diagnostics.hasData && (
        <div className="rounded border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
          Diagnóstico: a base de fibra não retornou dados. O sistema tentará usar lojas cadastradas e cache local.
        </div>
      )}
      {!!diagnostics?.localBase?.missingColumns?.length && (
        <div className="rounded border border-red-300/30 bg-red-600/20 p-3 text-sm text-red-100">
          Base de fibra com colunas obrigatórias ausentes: {diagnostics.localBase.missingColumns.join(', ')}.
        </div>
      )}

      <form onSubmit={search} className="rounded bg-gray-800 p-5">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="flex flex-col gap-1 text-sm text-gray-300">
            <span>Cidade</span>
            <select
              name="city"
              value={filters.city}
              onChange={changeFilter}
              className="h-11 bg-gray-700 px-3 rounded"
            >
              <option value="">{loadingCities ? 'Carregando cidades...' : 'Todas as cidades'}</option>
              {cities.map((item) => (
                <option key={`${item.city}-${item.uf}`} value={item.city}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-300">
            <span>CEP</span>
            <input
              name="cep"
              value={formatCepInput(filters.cep)}
              onChange={changeFilter}
              placeholder="Ex.: 23093-240"
              inputMode="numeric"
              maxLength={9}
              className="h-11 bg-gray-700 px-3 rounded"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-300 md:col-span-2">
            <span>Rua</span>
            <input
              name="street"
              value={filters.street}
              onChange={changeFilter}
              placeholder="Ex.: Rua Bartolomeu Portela"
              className="h-11 bg-gray-700 px-3 rounded"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-300">
            <span>Número</span>
            <input
              name="number"
              value={filters.number}
              onChange={changeFilter}
              placeholder="Ex.: 25"
              className="h-11 bg-gray-700 px-3 rounded"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-300 md:col-span-2">
            <span>Bairro</span>
            <input
              name="neighborhood"
              value={filters.neighborhood}
              onChange={changeFilter}
              placeholder="Ex.: Botafogo"
              className="h-11 bg-gray-700 px-3 rounded"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-400">
            A consulta retorna até 150 linhas por busca. Use CEP, rua e número para maior precisão.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={clear} className="rounded border border-white/10 bg-white/5 px-4 py-2.5">
              Limpar
            </button>
            <button disabled={loading} type="submit" className="rounded bg-blue-600 px-4 py-2.5 font-semibold disabled:opacity-50">
              <span className="inline-flex items-center gap-2">
                <Search className="h-4 w-4" aria-hidden="true" />
                {loading ? 'Consultando...' : 'Consultar'}
              </span>
            </button>
          </div>
        </div>
      </form>

      <div className="rounded bg-gray-800 overflow-hidden">
        <div className="border-b border-white/10 p-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Endereços encontrados</h2>
            <p className="text-sm text-gray-400">
              {searched
                ? `${formatNumber(result.rows?.length || 0)} exibidos de ${formatNumber(result.totalMatches || 0)} encontrados`
                : 'Faça uma consulta para visualizar a cobertura.'}
            </p>
          </div>
          {result.elapsedMs > 0 && <span className="text-sm text-gray-400">Busca em {(result.elapsedMs / 1000).toFixed(1)}s</span>}
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonRows rows={6} />
          ) : (
          <table className="w-full min-w-[1180px] border-collapse">
            <thead className="bg-gray-900 text-left text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="p-3">Cidade/UF</th>
                <th className="p-3">CEP</th>
                <th className="p-3">Rua</th>
                <th className="p-3">Número</th>
                <th className="p-3">Complemento</th>
                <th className="p-3">Bairro</th>
                <th className="p-3">HH</th>
                <th className="p-3">Viabilidade</th>
                <th className="p-3">OLT</th>
                <th className="p-3">Motivo capacity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {(result.rows || []).map((row, index) => (
                <tr key={`${row.cep}-${row.street}-${row.number}-${row.complement}-${index}`} className="hover:bg-white/[0.03]">
                  <td className="p-3 font-semibold text-white">{row.city || '-'} / {row.uf || '-'}</td>
                  <td className="p-3 text-gray-300">{formatCep(row.cep)}</td>
                  <td className="p-3 text-gray-300">{row.street || '-'}</td>
                  <td className="p-3 text-gray-300">{row.number || '-'}</td>
                  <td className="p-3 text-gray-300">{row.complement || '-'}</td>
                  <td className="p-3 text-gray-300">{row.neighborhood || '-'}</td>
                  <td className="p-3 text-gray-300">{formatNumber(row.households)}</td>
                  <td className="p-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${isViable(row) ? 'bg-green-500/15 text-green-200 ring-1 ring-green-300/30' : 'bg-red-500/15 text-red-200 ring-1 ring-red-300/30'}`}>
                      {row.viability || '-'}
                    </span>
                  </td>
                  <td className="p-3 text-gray-300">{row.olt || '-'}</td>
                  <td className="p-3 text-gray-300">{row.capacityReason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
        {searched && !loading && !(result.rows || []).length && (
          <div className="p-6 text-gray-400">Nenhum endereço encontrado para os filtros informados.</div>
        )}
      </div>
    </div>
  )
}
