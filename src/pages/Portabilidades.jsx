import React, { useEffect, useState } from 'react'
import { getPortabilidades, addPortabilidade, updatePortabilidade, deletePortabilidade, getUsers } from '../firebase/db'

const STATUS_OPTIONS = ['Pendente', 'Ativa', 'Cancelada']

function getUserNameByEmail(users, email) {
  const user = users.find((item) => item.email === email)
  return user?.name || 'Sem vendedor'
}

export default function Portabilidades() {
  const [items, setItems] = useState([])
  const [filterCpf, setFilterCpf] = useState('')
  const [seller, setSeller] = useState('')
  const [status, setStatus] = useState('')
  const [users, setUsers] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ customer: '', cpf: '', plan: '', seller: '', status: 'Pendente', amount: 0 })

  async function load() {
    const data = await getPortabilidades({
      cpf: filterCpf || undefined,
      seller: seller || undefined,
      status: status || undefined,
    })
    setItems(data)
  }

  useEffect(() => {
    getUsers().then(setUsers)
    load()
  }, [])

  useEffect(() => { load() }, [filterCpf, seller, status])

  function change(e) {
    const value = e.target.name === 'amount' ? Number(e.target.value) : e.target.value
    setForm({ ...form, [e.target.name]: value })
  }

  function startEdit(item) {
    setEditing(item)
    setForm({
      customer: item.customer || '',
      cpf: item.cpf || '',
      plan: item.plan || '',
      seller: item.seller || '',
      status: item.status || 'Pendente',
      amount: item.amount || 0,
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    if (editing) {
      await updatePortabilidade(editing.id, form)
      setEditing(null)
    } else {
      await addPortabilidade(form)
    }
    setForm({ customer: '', cpf: '', plan: '', seller: '', status: 'Pendente', amount: 0 })
    load()
  }

  async function handleDelete(item) {
    if (!window.confirm(`Excluir portabilidade de ${item.customer}?`)) return
    await deletePortabilidade(item.id)
    load()
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl mb-4">Portabilidades</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        <input placeholder="Buscar por CPF" value={filterCpf} onChange={e => setFilterCpf(e.target.value)} className="p-2 bg-gray-700 rounded" />
        <select value={seller} onChange={e => setSeller(e.target.value)} className="p-2 bg-gray-700 rounded">
          <option value="">Todos vendedores</option>
          {users.map(u => (<option key={u.id} value={u.email}>{u.name || 'Sem nome'}</option>))}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="p-2 bg-gray-700 rounded">
          <option value="">Todos status</option>
          {STATUS_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <button onClick={load} className="px-3 py-2 bg-blue-600 rounded">Filtrar</button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <form onSubmit={handleSave} className="bg-gray-800 p-4 rounded">
          <h2 className="text-xl mb-3">{editing ? 'Editar portabilidade' : 'Nova portabilidade'}</h2>
          <input name="customer" placeholder="Cliente" value={form.customer} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded" />
          <input name="cpf" placeholder="CPF" value={form.cpf} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded" />
          <input name="plan" placeholder="Plano" value={form.plan} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded" />
          <input name="amount" type="number" placeholder="Valor" value={form.amount} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded" />
          <select name="seller" value={form.seller} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded">
            <option value="">Selecione o vendedor</option>
            {users.map(u => (<option key={u.id} value={u.email}>{u.name || 'Sem nome'}</option>))}
          </select>
          <select name="status" value={form.status} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded">
            {STATUS_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="submit" className="bg-green-600 px-3 py-2 rounded">{editing ? 'Atualizar' : 'Salvar'}</button>
            {editing && <button type="button" onClick={() => { setEditing(null); setForm({ customer: '', cpf: '', plan: '', seller: '', status: 'Pendente', amount: 0 }) }} className="bg-gray-600 px-3 py-2 rounded">Cancelar</button>}
          </div>
        </form>

        <div className="bg-gray-800 p-4 rounded">
          <h2 className="text-xl mb-3">Lista de portabilidades</h2>
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="bg-gray-900 p-3 rounded">
                <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2">
                  <div>
                    <div className="font-semibold">{item.customer} <span className="text-sm text-gray-400">({item.cpf})</span></div>
                    <div className="text-sm text-gray-400">{item.plan} • {getUserNameByEmail(users, item.seller)}</div>
                    <div className="text-sm text-gray-400">Status: {item.status}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(item)} className="px-3 py-2 bg-blue-600 rounded">Editar</button>
                    <button onClick={() => handleDelete(item)} className="px-3 py-2 bg-red-600 rounded">Excluir</button>
                  </div>
                </div>
              </div>
            ))}
            {!items.length && <div className="text-gray-400">Nenhuma portabilidade encontrada.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
