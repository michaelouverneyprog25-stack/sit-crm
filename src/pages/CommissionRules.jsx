import React, { useEffect, useMemo, useState } from 'react'
import { addCommissionRule, deleteCommissionRule, getCommissionRules, updateCommissionRule } from '../firebase/db'
import { useAuth } from '../contexts/AuthContext'

const SUBCATEGORIES = ['Receita', 'Upgrade', 'Aparelhos', 'Acessórios', 'Portabilidade', 'Seguros']
const UPGRADE_CATEGORIES = ['Controle', 'Premium', 'Black', 'Família']
const CALCULATION_TYPES = [
  { value: 'fixo', label: 'Valor fixo' },
  { value: 'percentual', label: 'Percentual' },
  { value: 'percentual_meta', label: 'Percentual com meta' },
]

const emptyForm = {
  subcategoria: 'Receita',
  planoAnterior: '',
  planoNovo: '',
  tipoUpgrade: 'Receita',
  categoria: 'Receita',
  tipoCalculo: 'percentual_meta',
  valorComissao: '',
  percentualComissao: '',
  percentualComissaoMetaBatida: '',
  percentualLoja: '',
  percentualLojaMetaBatida: '',
  ativo: true,
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeCurrency(value) {
  const parsed = Number(String(value || '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export default function CommissionRules() {
  const { currentUser } = useAuth()
  const [rules, setRules] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState('')
  const [activeSubcategory, setActiveSubcategory] = useState('Receita')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await getCommissionRules()
      setRules(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Erro ao carregar regras de comissão:', err)
      setError(err.message || 'Não foi possível carregar as regras de comissão.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredRules = useMemo(() => {
    return rules
      .filter((rule) => normalize(rule.subcategoria || rule.categoria) === normalize(activeSubcategory))
      .sort((a, b) => (
        String(a.categoria || '').localeCompare(String(b.categoria || ''), 'pt-BR')
        || String(a.planoAnterior || '').localeCompare(String(b.planoAnterior || ''), 'pt-BR')
        || String(a.planoNovo || '').localeCompare(String(b.planoNovo || ''), 'pt-BR')
      ))
  }, [rules, activeSubcategory])

  const isUpgradeRule = form.subcategoria === 'Upgrade'
  const isFixedRule = form.tipoCalculo === 'fixo' || form.subcategoria === 'Upgrade' || form.subcategoria === 'Portabilidade'
  const isPercentRule = ['percentual', 'percentual_meta'].includes(form.tipoCalculo) && !isFixedRule
  const isGoalPercentRule = form.tipoCalculo === 'percentual_meta' && !isFixedRule

  function change(e) {
    const { name, value, type, checked } = e.target
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'subcategoria' ? {
        categoria: value === 'Upgrade' ? 'Controle' : value,
        tipoUpgrade: value === 'Upgrade' ? 'Controle' : value,
        tipoCalculo: ['Portabilidade', 'Upgrade'].includes(value) ? 'fixo' : 'percentual_meta',
        planoAnterior: value === 'Upgrade' ? current.planoAnterior : '*',
        planoNovo: value === 'Upgrade' ? current.planoNovo : '*',
      } : {}),
      ...(name === 'categoria' ? { tipoUpgrade: value } : {}),
    }))
  }

  function resetForm() {
    setEditingId('')
    setForm({
      ...emptyForm,
      subcategoria: activeSubcategory,
      categoria: activeSubcategory === 'Upgrade' ? 'Controle' : activeSubcategory,
      tipoUpgrade: activeSubcategory === 'Upgrade' ? 'Controle' : activeSubcategory,
      tipoCalculo: ['Upgrade', 'Portabilidade'].includes(activeSubcategory) ? 'fixo' : 'percentual_meta',
      planoAnterior: activeSubcategory === 'Upgrade' ? '' : '*',
      planoNovo: activeSubcategory === 'Upgrade' ? '' : '*',
    })
  }

  function startEdit(rule) {
    setEditingId(rule.id)
    setForm({
      subcategoria: rule.subcategoria || 'Upgrade',
      planoAnterior: rule.planoAnterior || '',
      planoNovo: rule.planoNovo || '',
      tipoUpgrade: rule.tipoUpgrade || rule.categoria || 'Controle',
      categoria: rule.categoria || 'Controle',
      tipoCalculo: rule.tipoCalculo || 'fixo',
      valorComissao: String(rule.valorComissao ?? ''),
      percentualComissao: String(rule.percentualComissao ?? ''),
      percentualComissaoMetaBatida: String(rule.percentualComissaoMetaBatida ?? ''),
      percentualLoja: String(rule.percentualLoja ?? ''),
      percentualLojaMetaBatida: String(rule.percentualLojaMetaBatida ?? ''),
      ativo: rule.ativo !== false,
    })
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (form.subcategoria === 'Upgrade' && (!form.planoAnterior.trim() || !form.planoNovo.trim())) {
      setError('Informe o plano anterior e o plano novo.')
      return
    }

    const payload = {
      subcategoria: form.subcategoria,
      planoAnterior: form.subcategoria === 'Upgrade' ? form.planoAnterior.trim() : '*',
      planoNovo: form.subcategoria === 'Upgrade' ? form.planoNovo.trim() : '*',
      tipoUpgrade: form.tipoUpgrade.trim() || form.categoria,
      categoria: form.categoria,
      tipoCalculo: form.tipoCalculo,
      valorComissao: normalizeCurrency(form.valorComissao),
      percentualComissao: normalizeCurrency(form.percentualComissao),
      percentualComissaoMetaBatida: normalizeCurrency(form.percentualComissaoMetaBatida),
      percentualLoja: normalizeCurrency(form.percentualLoja),
      percentualLojaMetaBatida: normalizeCurrency(form.percentualLojaMetaBatida),
      ativo: form.ativo,
      actorRole: currentUser?.role,
    }

    setSaving(true)
    try {
      const savedRule = editingId
        ? await updateCommissionRule(editingId, payload)
        : await addCommissionRule(payload)
      setRules((current) => {
        const withoutSaved = current.filter((rule) => rule.id !== savedRule.id)
        return [...withoutSaved, savedRule]
      })
      setSuccess(editingId ? 'Regra atualizada e comissões recalculadas.' : 'Regra cadastrada e pronta para novas vendas.')
      resetForm()
      load()
    } catch (err) {
      console.error('Erro ao salvar regra de comissão:', err)
      setError(err.message || 'Não foi possível salvar a regra.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(rule) {
    const label = rule.subcategoria === 'Upgrade'
      ? `${rule.planoAnterior} para ${rule.planoNovo}`
      : rule.subcategoria || rule.categoria
    if (!window.confirm(`Excluir a regra de ${label}?`)) return
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await deleteCommissionRule(rule.id, { actorRole: currentUser?.role })
      setRules((current) => current.filter((item) => item.id !== rule.id))
      setSuccess('Regra excluída e comissões recalculadas.')
    } catch (err) {
      console.error('Erro ao excluir regra de comissão:', err)
      setError(err.message || 'Não foi possível excluir a regra.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Administração</p>
          <h1 className="mt-1 text-3xl font-semibold">Regras de comissão</h1>
          <p className="mt-1 text-sm text-gray-400">Ajuste Receita, Upgrade, Aparelhos, Acessórios, Portabilidade e Seguros sem alterar código.</p>
        </div>
        <div className="rounded bg-gray-800 px-4 py-3">
          <div className="text-sm text-gray-400">Regras ativas</div>
          <div className="text-2xl font-semibold">{rules.filter((rule) => rule.ativo !== false).length}</div>
        </div>
      </div>

      {error && <div className="rounded border border-red-300/30 bg-red-600/20 p-3 text-sm text-red-100">{error}</div>}
      {success && <div className="rounded border border-emerald-300/30 bg-emerald-600/20 p-3 text-sm text-emerald-100">{success}</div>}

      <div className="flex flex-wrap gap-2 rounded bg-gray-800 p-3">
        {SUBCATEGORIES.map((subcategory) => (
          <button
            key={subcategory}
            type="button"
            onClick={() => {
              setActiveSubcategory(subcategory)
              setEditingId('')
              setForm({
                ...emptyForm,
                subcategoria: subcategory,
                categoria: subcategory === 'Upgrade' ? 'Controle' : subcategory,
                tipoUpgrade: subcategory === 'Upgrade' ? 'Controle' : subcategory,
                tipoCalculo: ['Upgrade', 'Portabilidade'].includes(subcategory) ? 'fixo' : 'percentual_meta',
                planoAnterior: subcategory === 'Upgrade' ? '' : '*',
                planoNovo: subcategory === 'Upgrade' ? '' : '*',
              })
            }}
            className={`rounded px-4 py-2 text-sm font-semibold transition ${activeSubcategory === subcategory ? 'bg-cyan-300 text-slate-950' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
          >
            {subcategory}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={save} className="rounded bg-gray-800 p-5">
          <div className="mb-4 border-b border-white/10 pb-4">
            <h2 className="text-xl font-semibold">{editingId ? 'Editar regra' : 'Nova regra'}</h2>
            <p className="mt-1 text-sm text-gray-400">Altere a regra ativa para recalcular as vendas com esta categoria.</p>
          </div>

          <label className="mb-3 block text-sm text-gray-300">
            <span className="mb-1 block">Subcategoria</span>
            <select name="subcategoria" value={form.subcategoria} onChange={change} className="h-11 w-full rounded bg-gray-700 px-3">
              {SUBCATEGORIES.map((subcategory) => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
            </select>
          </label>

          {isUpgradeRule && (
            <label className="mb-3 block text-sm text-gray-300">
              <span className="mb-1 block">Categoria do upgrade</span>
              <select name="categoria" value={form.categoria} onChange={change} className="h-11 w-full rounded bg-gray-700 px-3">
                {UPGRADE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
          )}

          <label className="mb-3 block text-sm text-gray-300">
            <span className="mb-1 block">Tipo de cálculo</span>
            <select name="tipoCalculo" value={form.tipoCalculo} onChange={change} disabled={isUpgradeRule} className="h-11 w-full rounded bg-gray-700 px-3 disabled:opacity-70">
              {CALCULATION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>

          {isUpgradeRule && (
            <>
              <label className="mb-3 block text-sm text-gray-300">
                <span className="mb-1 block">Tipo de upgrade</span>
                <input name="tipoUpgrade" value={form.tipoUpgrade} onChange={change} placeholder="Ex.: Controle para Premium" className="h-11 w-full rounded bg-gray-700 px-3" />
              </label>
              <label className="mb-3 block text-sm text-gray-300">
                <span className="mb-1 block">Plano anterior</span>
                <input name="planoAnterior" value={form.planoAnterior} onChange={change} placeholder="Ex.: Controle Smart" className="h-11 w-full rounded bg-gray-700 px-3" />
              </label>
              <label className="mb-3 block text-sm text-gray-300">
                <span className="mb-1 block">Plano novo</span>
                <input name="planoNovo" value={form.planoNovo} onChange={change} placeholder="Ex.: Premium" className="h-11 w-full rounded bg-gray-700 px-3" />
              </label>
            </>
          )}

          {isFixedRule && (
            <label className="mb-3 block text-sm text-gray-300">
              <span className="mb-1 block">Valor fixo da comissão</span>
              <input name="valorComissao" inputMode="decimal" value={form.valorComissao} onChange={change} placeholder="Ex.: 7,00" className="h-11 w-full rounded bg-gray-700 px-3" />
            </label>
          )}

          {isPercentRule && (
            <label className="mb-3 block text-sm text-gray-300">
              <span className="mb-1 block">Percentual padrão (%)</span>
              <input name="percentualComissao" inputMode="decimal" value={form.percentualComissao} onChange={change} placeholder="Ex.: 5" className="h-11 w-full rounded bg-gray-700 px-3" />
            </label>
          )}

          {isGoalPercentRule && (
            <label className="mb-3 block text-sm text-gray-300">
              <span className="mb-1 block">Percentual com meta batida (%)</span>
              <input name="percentualComissaoMetaBatida" inputMode="decimal" value={form.percentualComissaoMetaBatida} onChange={change} placeholder="Ex.: 10" className="h-11 w-full rounded bg-gray-700 px-3" />
            </label>
          )}

          {form.subcategoria === 'Aparelhos' && (
            <div className="mb-3 grid gap-3 md:grid-cols-2">
              <label className="block text-sm text-gray-300">
                <span className="mb-1 block">Percentual loja padrão (%)</span>
                <input name="percentualLoja" inputMode="decimal" value={form.percentualLoja} onChange={change} placeholder="Ex.: 0" className="h-11 w-full rounded bg-gray-700 px-3" />
              </label>
              <label className="block text-sm text-gray-300">
                <span className="mb-1 block">Percentual loja meta batida (%)</span>
                <input name="percentualLojaMetaBatida" inputMode="decimal" value={form.percentualLojaMetaBatida} onChange={change} placeholder="Ex.: 1,5" className="h-11 w-full rounded bg-gray-700 px-3" />
              </label>
            </div>
          )}

          <label className="mb-5 flex items-center gap-2 text-sm text-gray-300">
            <input name="ativo" type="checkbox" checked={form.ativo} onChange={change} className="h-4 w-4" />
            Regra ativa
          </label>

          <div className="flex flex-wrap gap-2">
            <button disabled={saving} type="submit" className="rounded bg-cyan-300 px-4 py-2.5 font-semibold text-slate-950 disabled:opacity-50">
              {saving ? 'Salvando...' : editingId ? 'Atualizar regra' : 'Cadastrar regra'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded bg-gray-700 px-4 py-2.5 font-semibold">
                Cancelar edição
              </button>
            )}
          </div>
        </form>

        <div className="rounded bg-gray-800 p-5">
          <div className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Tabela de regras</h2>
              <p className="mt-1 text-sm text-gray-400">As regras ativas são usadas automaticamente ao salvar ou recalcular vendas.</p>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-400">Carregando regras...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead className="bg-gray-900 text-left text-xs uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="p-3">Categoria</th>
                    <th className="p-3">Plano anterior</th>
                    <th className="p-3">Plano novo</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Comissão</th>
                    <th className="p-3">Percentual</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.map((rule) => (
                    <tr key={rule.id} className="border-t border-white/10">
                      <td className="p-3">{rule.categoria || '-'}</td>
                      <td className="p-3">{rule.subcategoria === 'Upgrade' ? rule.planoAnterior : '-'}</td>
                      <td className="p-3">{rule.subcategoria === 'Upgrade' ? rule.planoNovo : '-'}</td>
                      <td className="p-3">{rule.tipoCalculo || rule.tipoUpgrade || '-'}</td>
                      <td className="p-3 font-semibold">{formatCurrency(rule.valorComissao)}</td>
                      <td className="p-3">
                        {Number(rule.percentualComissao || 0) ? `${rule.percentualComissao}%` : '-'}
                        {Number(rule.percentualComissaoMetaBatida || 0) ? ` / ${rule.percentualComissaoMetaBatida}% meta` : ''}
                      </td>
                      <td className="p-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${rule.ativo !== false ? 'bg-emerald-400/15 text-emerald-100' : 'bg-gray-700 text-gray-300'}`}>
                          {rule.ativo !== false ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => startEdit(rule)} className="rounded bg-blue-600 px-3 py-2 text-sm">Editar</button>
                          <button onClick={() => remove(rule)} className="rounded bg-red-600 px-3 py-2 text-sm">Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredRules.length && <div className="rounded border border-white/10 bg-gray-900 p-4 text-gray-400">Nenhuma regra encontrada.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
