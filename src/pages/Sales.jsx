import React, { useEffect, useState } from 'react'
import SaleForm from '../components/SaleForm'
import SaleList from '../components/SaleList'
import { getVendas, addVenda, updateVenda, deleteVenda, getUsers } from '../firebase/db'
import { useAuth } from '../contexts/AuthContext'

const SALES_FULL_ACCESS_ROLES = ['Administrador', 'Gestor Master', 'Gerente']

function getUserNameByEmail(users, email) {
  const user = users.find((item) => item.email === email)
  return user?.name || 'Sem vendedor'
}

export default function Sales() {
  const { currentUser } = useAuth()
  const [sales, setSales] = useState([])
  const [filterCpf, setFilterCpf] = useState('')
  const [seller, setSeller] = useState('')
  const [status, setStatus] = useState('')
  const [saleType, setSaleType] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [users, setUsers] = useState([])
  const [editingSale, setEditingSale] = useState(null)
  const [formVersion, setFormVersion] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const canViewAllSales = SALES_FULL_ACCESS_ROLES.includes(currentUser?.role)

  async function load() {
    setError('')
    try {
      const data = await getVendas({
        cpf: filterCpf || undefined,
        seller: canViewAllSales ? seller || undefined : currentUser?.email || undefined,
        userId: canViewAllSales ? undefined : currentUser?.uid || undefined,
        userEmail: canViewAllSales ? undefined : currentUser?.email || undefined,
        status: status || undefined,
        saleType: saleType || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      })
      setSales(data)
    } catch (err) {
      console.error('Erro ao carregar vendas:', err)
      setError('Não foi possível carregar as vendas.')
    }
  }

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch((err) => {
        console.error('Erro ao carregar usuários:', err)
        setUsers([])
      })
  }, [])
  useEffect(() => { load() }, [filterCpf, seller, status, saleType, fromDate, toDate, canViewAllSales, currentUser?.uid, currentUser?.email])

  async function handleSave(sale) {
    setLoading(true)
    setError('')
    setSuccess('')

    const payload = {
      ...sale,
      seller: editingSale?.seller || sale.seller || currentUser?.email || '',
      userId: editingSale?.userId || currentUser?.uid || '',
      userName: editingSale?.userName || currentUser?.name || 'Usuário',
      userEmail: editingSale?.userEmail || currentUser?.email || '',
    }

    try {
      let savedSale = null
      if (editingSale) {
        savedSale = await updateVenda(editingSale.id, payload)
        setEditingSale(null)
      } else {
        savedSale = await addVenda(payload)
      }
      if (savedSale?.id) {
        setSales((current) => {
          const withoutSaved = current.filter((saleItem) => saleItem.id !== savedSale.id)
          return [savedSale, ...withoutSaved]
        })
      }
      setFormVersion((current) => current + 1)
      setSuccess('Venda salva e sincronizada com metas/dashboard.')
      load()
    } catch (err) {
      console.error('Erro ao salvar venda:', err)
      setError(err.message || 'Não foi possível salvar a venda. Verifique os dados e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  function handleEdit(sale) {
    setEditingSale(sale)
  }

  async function handleDelete(sale) {
    if (!window.confirm(`Tem certeza que deseja excluir a venda de ${sale.customer}?`)) return
    setLoading(true)
    setError('')
    try {
      await deleteVenda(sale.id)
      await load()
    } catch (err) {
      console.error('Erro ao excluir venda:', err)
      setError('Não foi possível excluir a venda.')
    } finally {
      setLoading(false)
    }
  }

  const displaySales = sales.map((sale) => ({
    ...sale,
    sellerName: sale.userName || getUserNameByEmail(users, sale.seller || sale.userEmail),
  }))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Operação</p>
          <h1 className="mt-1 text-3xl font-semibold">Vendas</h1>
          <p className="mt-1 text-sm text-gray-400">Cadastro, acompanhamento e sincronização automática com metas.</p>
        </div>
        <div className="rounded bg-gray-800 px-4 py-3">
          <div className="text-sm text-gray-400">Vendas filtradas</div>
          <div className="text-2xl font-semibold">{displaySales.length}</div>
        </div>
      </div>
      {error && <div className="rounded border border-red-300/30 bg-red-600/20 p-3 text-sm text-red-100">{error}</div>}
      {success && <div className="rounded border border-emerald-300/30 bg-emerald-600/20 p-3 text-sm text-emerald-100">{success}</div>}
      <div className="flex flex-wrap gap-2 rounded bg-gray-800 p-4">
        <input placeholder="Buscar por CPF" value={filterCpf} onChange={e => setFilterCpf(e.target.value)} className="h-11 bg-gray-700 px-3 rounded" />
        {canViewAllSales ? (
          <select value={seller} onChange={e => setSeller(e.target.value)} className="h-11 bg-gray-700 px-3 rounded">
            <option value="">Todos vendedores</option>
            {users.map(u => (<option key={u.id} value={u.email}>{u.name || 'Sem nome'}</option>))}
          </select>
        ) : (
          <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300">
            Minhas vendas: {currentUser?.name || 'Usuário'}
          </div>
        )}
        <select value={status} onChange={e => setStatus(e.target.value)} className="h-11 bg-gray-700 px-3 rounded">
          <option value="">Todas esteiras</option>
          <option value="Sim">Esteira: Sim</option>
          <option value="Não">Esteira: Não</option>
        </select>
        <select value={saleType} onChange={e => setSaleType(e.target.value)} className="h-11 bg-gray-700 px-3 rounded">
          <option value="">Todos tipos</option>
          <option value="Ativação">Ativação</option>
          <option value="Migração">Migração</option>
          <option value="Portabilidade">Portabilidade</option>
          <option value="Upgrade">Upgrade</option>
          <option value="Aparelhos">Aparelhos</option>
          <option value="Acessórios">Acessórios</option>
          <option value="Fibra">Fibra</option>
        </select>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-11 bg-gray-700 px-3 rounded" />
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-11 bg-gray-700 px-3 rounded" />
        <button onClick={load} className="h-11 bg-blue-600 px-4 rounded font-semibold">Filtrar</button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <SaleForm
          key={editingSale?.id || formVersion}
          initialData={editingSale}
          onSave={handleSave}
          onCancel={() => setEditingSale(null)}
          submitLabel={editingSale ? 'Atualizar venda' : 'Nova venda'}
        />
        <SaleList items={displaySales} loading={loading} onEdit={handleEdit} onDelete={handleDelete} />
      </div>
    </div>
  )
}
