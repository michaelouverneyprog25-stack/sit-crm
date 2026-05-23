import React, { useEffect, useMemo, useState } from 'react'
import { getFiberViabilityCities, searchFiberViability } from '../firebase/db'

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

  const hasFilters = useMemo(() => {
    return Object.values(filters).some((value) => String(value || '').trim())
  }, [filters])

  useEffect(() => {
    let active = true
    setLoadingCities(true)
    getFiberViabilityCities()
      .then((data) => {
        if (active) setCities(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        console.error('Erro ao carregar cidades da base de fibra:', err)
        if (active) {
          setCities([])
          setError('Não foi possível carregar as cidades cadastradas de fibra.')
        }
      })
      .finally(() => {
        if (active) setLoadingCities(false)
      })

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
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Rede TIM</p>
          <h1 className="mt-1 text-3xl font-semibold">Viabilidade de Fibra</h1>
          <p className="mt-1 text-sm text-gray-400">
            Consulte a base de cobertura por cidade, CEP, rua e número.
          </p>
        </div>
        <div className="rounded bg-gray-800 px-4 py-3">
          <div className="text-sm text-gray-400">Resultados encontrados</div>
          <div className="text-2xl font-semibold">{formatNumber(result.totalMatches)}</div>
        </div>
      </div>

      {error && <div className="rounded border border-red-300/30 bg-red-600/20 p-3 text-sm text-red-100">{error}</div>}

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
              value={filters.cep}
              onChange={changeFilter}
              placeholder="Ex.: 22290190"
              maxLength={8}
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
              {loading ? 'Consultando...' : 'Consultar'}
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
        </div>
        {searched && !loading && !(result.rows || []).length && (
          <div className="p-6 text-gray-400">Nenhum endereço encontrado para os filtros informados.</div>
        )}
      </div>
    </div>
  )
}
