import React, { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import Toast from '../components/Toast'
import LoadingOverlay from '../components/LoadingOverlay'
import { validationRules } from '../config/validation'
import { useAuth } from '../contexts/AuthContext'
import { apiRequest, disableUserAccess, enableUserAccess, getStores, getUsers } from '../firebase/db'
import { CACHE_KEYS, readArrayCache, sortByName, writeArrayCache } from '../utils/browserCache'
import UserAvatar from '../components/UserAvatar'

const USER_MANAGEMENT_ROLES = ['Administrador', 'Gestor Master', 'Gerente']
const USER_STATUS_ROLES = ['Administrador', 'Gestor Master']
const FULL_ROLE_OPTIONS = ['Administrador', 'Gestor Master', 'Gerente', 'Vendedor', 'Caixa']
const MANAGER_ROLE_OPTIONS = ['Vendedor', 'Caixa']
const MANAGER_HIDDEN_ROLES = ['Administrador', 'Gestor Master']

function getAssignableRoleOptions(role) {
  return role === 'Gerente' ? MANAGER_ROLE_OPTIONS : FULL_ROLE_OPTIONS
}

function isProtectedFromManager(user) {
  return MANAGER_HIDDEN_ROLES.includes(user?.role)
}

export default function Users(){
  const { currentUser } = useAuth() || {}
  const [users,setUsers] = useState(() => readArrayCache(CACHE_KEYS.users))
  const [stores, setStores] = useState(() => readArrayCache(CACHE_KEYS.stores))
  const [editing, setEditing] = useState(null)
  const emptyForm = {name:'',email:'',password:'Password123',confirmPassword:'Password123',role:'Vendedor', active:true, storeName:'', storeCity:'', storeState:'', photoUrl:''}
  const [form, setForm] = useState(emptyForm)
  const [modal, setModal] = useState({type:'', open:false, user:null})
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState({open:false, msg:'', type:'info'})
  const [loading, setLoading] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')

  function setCachedUsers(nextUsersOrUpdater) {
    setUsers((current) => {
      const nextUsers = typeof nextUsersOrUpdater === 'function'
        ? nextUsersOrUpdater(current)
        : nextUsersOrUpdater
      const sortedUsers = sortByName(Array.isArray(nextUsers) ? nextUsers : [])
      writeArrayCache(CACHE_KEYS.users, sortedUsers)
      return sortedUsers
    })
  }

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

  async function load({ silent = false } = {}){
    if (!silent) setLoadingList(true)
    setLoadError('')
    const hasCachedUsers = users.length > 0
    const hasCachedStores = stores.length > 0

    const [usersResult, storesResult] = await Promise.allSettled([
      getUsers(),
      getStores(),
    ])

    if (usersResult.status === 'fulfilled') {
      setCachedUsers(Array.isArray(usersResult.value) ? usersResult.value : [])
    } else {
      console.error(usersResult.reason)
      const message = usersResult.reason?.message || 'Erro ao carregar usuários'
      if (!hasCachedUsers) {
        setLoadError(message)
        showToast(message, 'error')
      }
    }

    if (storesResult.status === 'fulfilled') {
      setCachedStores(Array.isArray(storesResult.value) ? storesResult.value : [])
    } else {
      console.error(storesResult.reason)
      const message = storesResult.reason?.message || 'Erro ao carregar lojas'
      if (!hasCachedStores) {
        setLoadError((current) => current || message)
        showToast(message, 'error')
      }
    }

    if (!silent) setLoadingList(false)
  }

  useEffect(()=>{ load({ silent: users.length > 0 || stores.length > 0 }) },[])

  function startEdit(u){
    if (currentUser?.role === 'Gerente' && isProtectedFromManager(u)) {
      showToast('Gerente não pode editar Administrador ou Gestor Master.', 'error')
      return
    }
    setEditing(u.id)
    setForm({name:u.name||'', email:u.email||'', password:'', confirmPassword:'', role:u.role||'Vendedor', active: !(u.disabled === true), storeName:u.storeName||'', storeCity:u.storeCity||'', storeState:u.storeState||'', photoUrl:u.photoUrl||'' })
  }

  function change(e){
    const { name, type, value, checked } = e.target
    if (name === 'role') {
      setForm((current) => ({
        ...current,
        role: value,
        ...(value === 'Gestor Master' ? { storeName: '', storeCity: '', storeState: '' } : {}),
      }))
      return
    }
    if (name === 'storeName') {
      const selectedStore = stores.find((store) => store.name === value)
      setForm({
        ...form,
        storeName: value,
        storeCity: selectedStore?.city || '',
        storeState: selectedStore?.state || '',
      })
      return
    }

    setForm({...form, [name]: type === 'checkbox' ? checked : value })
  }

  function showToast(msg, type = 'info'){
    setToast({open:true, msg, type})
  }

  function validate(){
    const errs = {}
    if(!form.name || form.name.trim().length < validationRules.name.minLength) errs.name = `Nome obrigatório (min ${validationRules.name.minLength} caracteres)`
    const emailRe = validationRules.emailRegex
    if(!form.email || !emailRe.test(form.email)) errs.email = 'Email inválido'
    if(!editing){
      if(!form.password || form.password.length < validationRules.password.minLength) errs.password = `Senha com no mínimo ${validationRules.password.minLength} caracteres`
      const strongReParts = []
      if(validationRules.password.requireNumber) strongReParts.push('(?=.*[0-9])')
      if(validationRules.password.requireUpper) strongReParts.push('(?=.*[A-Z])')
      const strongRe = new RegExp(`${strongReParts.join('')}(?=.{${validationRules.password.minLength},})`)
      if(!strongRe.test(form.password)) errs.password = 'Senha deve conter número e letra maiúscula'
      if(form.password !== form.confirmPassword) errs.confirmPassword = 'Confirmação de senha não confere'
    }
    const roles = validationRules.roles
    const assignableRoles = getAssignableRoleOptions(currentUser?.role)
    if(!roles.includes(form.role)) errs.role = 'Perfil inválido'
    if(!assignableRoles.includes(form.role)) errs.role = 'Gerente só pode cadastrar ou editar perfis Vendedor ou Caixa'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function save(e){
    e.preventDefault()
    if(!validate()){
      showToast('Corrija os erros do formulário', 'error')
      return
    }

    if (!canManageUserStatus) {
      showToast('Sem permissão para cadastrar ou editar usuários', 'error')
      return
    }

    const userPayload = {
      name: form.name,
      email: form.email,
      role: form.role,
      active: !!form.active,
      storeName: form.role === 'Gestor Master' ? '' : form.storeName,
      storeCity: form.role === 'Gestor Master' ? '' : form.storeCity,
      storeState: form.role === 'Gestor Master' ? '' : form.storeState,
      photoUrl: form.photoUrl.trim(),
      actorRole: currentUser?.role,
    }

    setLoading(true)
    let saved = false
    let savedUser = null
    try{
      if(editing){
        const result = await apiRequest(`/api/users/${editing}`, {
          method: 'PUT',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(userPayload)
        })
        savedUser = {
          uid: result.uid || editing,
          id: result.uid || editing,
          name: form.name,
          email: form.email,
          role: result.role || form.role,
          storeName: userPayload.storeName,
          storeCity: userPayload.storeCity,
          storeState: userPayload.storeState,
          photoUrl: userPayload.photoUrl,
          disabled: !form.active,
        }
        showToast('Usuário atualizado', 'success')
      } else {
        const result = await apiRequest('/api/users', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ ...form, ...userPayload })
        })
        savedUser = {
          uid: result.uid || form.email,
          id: result.uid || form.email,
          name: form.name,
          email: form.email,
          role: result.role || form.role,
          storeName: userPayload.storeName,
          storeCity: userPayload.storeCity,
          storeState: userPayload.storeState,
          photoUrl: userPayload.photoUrl,
          disabled: !form.active,
        }
        showToast(result.reused ? result.message : 'Usuário criado', result.reused ? 'info' : 'success')
      }
      if (savedUser) {
        setCachedUsers((current) => [
          ...current.filter((user) => (user.uid || user.id || user.email) !== (savedUser.uid || savedUser.id || savedUser.email) && user.email !== savedUser.email),
          savedUser,
        ])
      }
      saved = true
    }catch(err){
      console.error(err)
      showToast(err.message || 'Erro ao salvar usuário', 'error')
    }finally{
      setLoading(false)
    }

    if (saved) {
      setEditing(null)
      setForm(emptyForm)
      load({ silent: true })
    }
  }

  function openResetModal(user){
    if (currentUser?.role === 'Gerente' && isProtectedFromManager(user)) {
      showToast('Gerente não pode redefinir senha de Administrador ou Gestor Master.', 'error')
      return
    }
    setModal({type:'reset', open:true, user})
    setPassword('')
  }

  function openDisableModal(user){
    setModal({type:'disable', open:true, user})
  }

  function openDeleteModal(user){
    setModal({type:'disable', open:true, user})
  }

  function closeModal(){
    setModal({type:'', open:false, user:null})
    setPassword('')
  }

  async function handleReset(){
    if(!password) return
    try {
      await apiRequest(`/api/users/${modal.user.uid}/reset-password`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ password })
      })
      showToast('Senha atualizada', 'success')
      closeModal()
      load()
    } catch (err) {
      showToast(err.message || 'Erro ao redefinir senha', 'error')
    }
  }

  async function handleDisable(){
    const uid = modal.user?.uid || modal.user?.id
    if (!uid) {
      showToast('Não foi possível identificar o usuário para inativar.', 'error')
      return
    }
    try {
      const result = await disableUserAccess(uid, currentUser?.role)
      setCachedUsers((current) => current.map((user) => (user.uid || user.id) === uid ? { ...user, disabled: true, accessRemoved: true } : user))
      showToast(result.message || 'Usuário removido/inativado com sucesso', 'success')
      closeModal()
      load({ silent: true })
    } catch (err) {
      showToast(err.message || 'Não foi possível remover/inativar o usuário.', 'error')
    }
  }

  async function handleEnable(user){
    const uid = user.uid || user.id
    if (!uid) {
      showToast('Não foi possível identificar o usuário para reativar.', 'error')
      return
    }
    try {
      const result = await enableUserAccess(uid, currentUser?.role)
      setCachedUsers((current) => current.map((item) => (item.uid || item.id) === uid ? { ...item, disabled: false, accessRemoved: false } : item))
      showToast(result.message || 'Usuário reativado com sucesso', 'success')
      load({ silent: true })
    } catch (err) {
      showToast(err.message || 'Não foi possível reativar o usuário.', 'error')
    }
  }

  const canManageUserStatus = USER_MANAGEMENT_ROLES.includes(currentUser?.role)
  const canInactivateUsers = USER_STATUS_ROLES.includes(currentUser?.role)
  const assignableRoleOptions = getAssignableRoleOptions(currentUser?.role)
  const filteredUsers = users.filter((user) => {
    if (currentUser?.role === 'Gerente' && isProtectedFromManager(user)) return false
    const term = search.trim().toLowerCase()
    if (!term) return true
    return [user.name, user.email, user.role, user.storeName, user.storeCity, user.storeState]
      .some((value) => String(value || '').toLowerCase().includes(term))
  })

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl">Usuários</h1>
          <p className="text-sm text-gray-400">Todos os usuários cadastrados no Firebase Auth e no Firestore.</p>
        </div>
        <div className="bg-gray-800 px-4 py-3 rounded">
          <div className="text-sm text-gray-400">Total cadastrado</div>
          <div className="text-2xl font-semibold">{loadingList ? '...' : users.length}</div>
        </div>
      </div>
      {loadError && (
        <div className="mb-4 bg-red-600 text-white p-3 rounded flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <span>{loadError}</span>
          <button type="button" onClick={load} className="bg-red-800 px-3 py-2 rounded">Tentar novamente</button>
        </div>
      )}
      <div className="mb-4 grid md:grid-cols-3 gap-4">
        <form onSubmit={save} className="bg-gray-800 p-4 rounded">
          <h3 className="mb-2">{editing? 'Editar usuário' : 'Novo usuário'}</h3>
          <input name="name" placeholder="Nome" value={form.name} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded" />
          {errors.name && <div className="text-sm text-red-500 mb-2">{errors.name}</div>}
          <input name="email" placeholder="Email" value={form.email} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded" />
          {errors.email && <div className="text-sm text-red-500 mb-2">{errors.email}</div>}
          <input name="photoUrl" placeholder="URL da foto/avatar" value={form.photoUrl} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded" />
          {!editing && <input name="password" placeholder="Senha" type="password" value={form.password} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded" />} 
          {!editing && errors.password && <div className="text-sm text-red-500 mb-2">{errors.password}</div>}
          {!editing && (
            <>
              <input name="confirmPassword" placeholder="Confirme a senha" type="password" value={form.confirmPassword} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded" />
              {errors.confirmPassword && <div className="text-sm text-red-500 mb-2">{errors.confirmPassword}</div>}
            </>
          )}
          <select name="role" value={form.role} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded">
            {form.role && !assignableRoleOptions.includes(form.role) && (
              <option value={form.role} disabled>{form.role}</option>
            )}
            {assignableRoleOptions.map((role) => (
              <option key={role}>{role}</option>
            ))}
          </select>
          {errors.role && <div className="text-sm text-red-500 mb-2">{errors.role}</div>}
          {form.role !== 'Gestor Master' && (
            <>
              <select name="storeName" value={form.storeName} onChange={change} className="w-full p-2 mb-2 bg-gray-700 rounded">
                <option value="">{loadingList ? 'Carregando lojas...' : 'Selecione a loja'}</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.name}>{store.name}</option>
                ))}
                {form.storeName && !stores.some((store) => store.name === form.storeName) && (
                  <option value={form.storeName}>{form.storeName}</option>
                )}
              </select>
              <input name="storeCity" placeholder="Cidade da loja" value={form.storeCity} disabled className="w-full p-2 mb-2 bg-gray-700 rounded opacity-80" />
              <input name="storeState" placeholder="UF da loja" value={form.storeState} disabled className="w-full p-2 mb-2 bg-gray-700 rounded uppercase opacity-80" />
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" checked={!!form.active} onChange={change} />
            Ativo
          </label>
          <div className="flex gap-2">
            <button disabled={loading} className="bg-green-600 px-3 py-2 rounded flex items-center gap-2 disabled:opacity-50">
              {loading ? <span className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin" /> : 'Salvar'}
            </button>
            <button type="button" disabled={loading} onClick={()=>{setEditing(null); setForm(emptyForm)}} className="bg-gray-600 px-3 py-2 rounded">Cancelar</button>
          </div>
        </form>

        <div className="md:col-span-2 bg-gray-800 p-4 rounded">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <h2 className="text-xl">Usuários cadastrados</h2>
            <input
              placeholder="Buscar usuário ou cargo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full md:w-80 p-2 bg-gray-700 rounded"
            />
          </div>
          {loadingList && <div className="mb-2 text-sm text-gray-400">Carregando usuários e lojas...</div>}
          <div className="space-y-2">
            {filteredUsers.map(u=> (
              <div key={u.uid || u.id} className="bg-gray-900 p-3 rounded">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar user={u} size="sm" />
                    <div className="min-w-0">
                    <div className="font-semibold">{u.name || 'Sem nome'}</div>
                    <div className="text-sm text-gray-400">{u.email}</div>
                    <div className="text-sm text-gray-400">{u.role || 'Vendedor'} {'•'} {u.disabled ? 'Desativado' : 'Ativo'}</div>
                    {(u.storeName || u.storeCity || u.storeState) && (
                      <div className="text-sm text-gray-400">Loja: {u.storeName || '-'} {u.storeCity ? `• ${u.storeCity}` : ''} {u.storeState ? `/${u.storeState}` : ''}</div>
                    )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={()=>startEdit(u)} className="px-2 py-1 bg-blue-600 rounded">Editar</button>
                    <button onClick={()=>openResetModal(u)} className="px-2 py-1 bg-yellow-600 rounded">Resetar senha</button>
                    {canInactivateUsers && (u.disabled ? (
                      <button onClick={() => handleEnable(u)} className="px-2 py-1 bg-green-600 rounded">Reativar</button>
                    ) : (
                      <button onClick={()=>openDisableModal(u)} className="px-2 py-1 bg-red-600 rounded">Inativar</button>
                    ))}
                    {canInactivateUsers && u.role !== 'Administrador' && !u.disabled && (
                      <button onClick={()=>openDeleteModal(u)} className="px-2 py-1 bg-red-800 rounded">Remover acesso</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!loadingList && !filteredUsers.length && (
              <div className="text-gray-400 bg-gray-900 p-3 rounded">Nenhum usuário encontrado.</div>
            )}
          </div>
        </div>
      </div>
      <div className="text-sm text-gray-400">Usuário criado no Firebase Authentication e perfil salvo no Firestore via backend Node.</div>
      <Toast open={toast.open} message={toast.msg} type={toast.type} onClose={() => setToast({...toast, open:false})} />
      <LoadingOverlay open={loading} />

      <Modal open={modal.open} title={modal.type === 'reset' ? 'Redefinir senha' : 'Inativar usuário'} onClose={closeModal}>
        {modal.type === 'reset' ? (
          <div className="space-y-4">
            <div>Digite a nova senha para <strong>{modal.user?.email}</strong></div>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full p-2 bg-gray-700 rounded" placeholder="Nova senha" />
            <div className="flex justify-end gap-2">
              <button onClick={closeModal} className="px-4 py-2 bg-gray-600 rounded">Cancelar</button>
              <button onClick={handleReset} className="px-4 py-2 bg-yellow-600 rounded">Salvar senha</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p>Tem certeza que deseja inativar <strong>{modal.user?.email}</strong>?</p>
            <p className="text-sm text-gray-400">O acesso será removido do sistema, mas vendas, metas e relatórios antigos serão preservados.</p>
            <div className="flex justify-end gap-2">
              <button onClick={closeModal} className="px-4 py-2 bg-gray-600 rounded">Cancelar</button>
              <button onClick={handleDisable} className="px-4 py-2 bg-red-600 rounded">Inativar usuário</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
