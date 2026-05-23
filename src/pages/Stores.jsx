import React, { useEffect, useState } from 'react'
import { addStore, deleteStore, getStores, updateStore } from '../firebase/db'
import { useAuth } from '../contexts/AuthContext'
import { CACHE_KEYS, readArrayCache, sortByName, writeArrayCache } from '../utils/browserCache'

const emptyForm = {
  name: '',
  city: '',
  state: '',
}

export default function Stores() {
  const { currentUser } = useAuth()
  const [stores, setStores] = useState(() => readArrayCache(CACHE_KEYS.stores))
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [loadingStores, setLoadingStores] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function setCachedStores(nextStoresOrUpdater) {
    setStores((current) => {
      const nextStores = typeof nextStoresOrUpdater === 'function'
        ? nextStoresOrUpdater(current)
        : nextStoresOrUpdater
      const sortedStores = sortByName(Array.isArray(nextStores) ? nextStores : [])
      writeArrayCache(CACHE_KEYS.stores, sortedStores)
      return sortedStores
    })
  }

  async function load({ silent = false } = {}) {
    if (!silent) setLoadingStores(true)
    setError('')

    try {
      const data = await getStores()
      setCachedStores(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
      if (!stores.length) setError('Não foi possível carregar as lojas.')
    } finally {
      if (!silent) setLoadingStores(false)
    }
  }

  useEffect(() => {
    load({ silent: stores.length > 0 })
  }, [])

  function change(e) {
    const { name, value } = e.target
    setForm((current) => ({
      ...current,
      [name]: name === 'state' ? value.toUpperCase() : value,
    }))
  }

  function resetForm() {
    setEditing(null)
    setForm(emptyForm)
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!form.name.trim() || !form.city.trim() || !form.state.trim()) {
      setError('Preencha nome da loja, cidade e UF.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        actorRole: currentUser?.role,
      }

      let savedStore = null
      if (editing) {
        savedStore = await updateStore(editing, payload)
        setSuccess('Loja atualizada com sucesso.')
      } else {
        savedStore = await addStore(payload)
        setSuccess('Loja cadastrada com sucesso.')
      }

      if (savedStore?.id) {
        setCachedStores((current) => {
          const withoutSaved = current.filter((store) => store.id !== savedStore.id)
          return [...withoutSaved, savedStore]
        })
      }
      resetForm()
      load({ silent: true })
    } catch (err) {
      console.error(err)
      setError(err.message || 'Não foi possível salvar a loja.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(store) {
    setEditing(store.id)
    setForm({
      name: store.name || '',
      city: store.city || '',
      state: store.state || '',
    })
  }

  async function remove(store) {
    if (!window.confirm(`Excluir a loja ${store.name}?`)) return
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await deleteStore(store.id, { actorRole: currentUser?.role })
      setSuccess('Loja excluída com sucesso.')
      setCachedStores((current) => current.filter((item) => item.id !== store.id))
      load({ silent: true })
    } catch (err) {
      console.error(err)
      setError(err.message || 'Não foi possível excluir a loja.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl">Lojas</h1>
          <p className="text-sm text-gray-400">Cadastre apenas nome da loja, cidade e UF.</p>
        </div>
        {(loadingStores || saving) && <div className="text-sm text-gray-400">{saving ? 'Salvando loja...' : 'Atualizando lojas...'}</div>}
      </div>

      {error && <div className="mb-4 bg-red-600 text-white p-3 rounded">{error}</div>}
      {success && <div className="mb-4 bg-green-700 text-white p-3 rounded">{success}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <form onSubmit={save} className="bg-gray-800 p-4 rounded">
          <h2 className="text-xl mb-3">{editing ? 'Editar loja' : 'Nova loja'}</h2>
          <input name="name" placeholder="Nome da loja" value={form.name} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded" />
          <input name="city" placeholder="Cidade" value={form.city} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded" />
          <input name="state" placeholder="UF" value={form.state} onChange={change} maxLength={2} className="w-full p-2 mb-3 bg-gray-700 rounded uppercase" />
          <div className="flex gap-2">
            <button disabled={saving} type="submit" className="bg-green-600 px-3 py-2 rounded disabled:opacity-50">{saving ? 'Salvando...' : editing ? 'Atualizar' : 'Salvar'}</button>
            <button type="button" disabled={saving} onClick={resetForm} className="bg-gray-600 px-3 py-2 rounded disabled:opacity-50">Cancelar</button>
          </div>
        </form>

        <div className="md:col-span-2 bg-gray-800 p-4 rounded">
          <h2 className="text-xl mb-3">Lojas cadastradas</h2>
          <div className="space-y-2">
            {stores.map((store) => (
              <div key={store.id} className="bg-gray-900 p-3 rounded flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="font-semibold">{store.name}</div>
                  <div className="text-sm text-gray-400">{store.city} / {store.state}</div>
                </div>
                <div className="flex gap-2">
                  <button disabled={saving} onClick={() => startEdit(store)} className="px-3 py-2 bg-blue-600 rounded disabled:opacity-50">Editar</button>
                  <button disabled={saving} onClick={() => remove(store)} className="px-3 py-2 bg-red-700 rounded disabled:opacity-50">Excluir</button>
                </div>
              </div>
            ))}
            {!stores.length && <div className="text-gray-400 bg-gray-900 p-3 rounded">Nenhuma loja cadastrada.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
