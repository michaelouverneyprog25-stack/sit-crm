import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Navigate, useLocation } from 'react-router-dom'

export default function RoleRoute({allowedRoles = [], children}){
  const { currentUser, loading, authError } = useAuth()
  const location = useLocation()
  const role = currentUser?.role
  if(loading) return null
  if(authError && !currentUser) {
    return (
      <div className="max-w-xl mx-auto bg-gray-800 p-4 rounded">
        <h1 className="text-xl mb-2">Sessão indisponível</h1>
        <p className="text-sm text-gray-300">{authError}</p>
      </div>
    )
  }
  if(!currentUser) return <Navigate to="/login" state={{from:location}} replace />
  if(currentUser.disabled) {
    return (
      <div className="max-w-xl mx-auto bg-gray-800 p-4 rounded">
        <h1 className="text-xl mb-2">Acesso inativo</h1>
        <p className="text-sm text-gray-300">Seu usuário foi removido/inativado no CRM. Fale com um administrador para recuperar o acesso.</p>
      </div>
    )
  }
  if(allowedRoles.length && !allowedRoles.includes(role)) {
    return (
      <div className="max-w-xl mx-auto bg-gray-800 p-4 rounded">
        <h1 className="text-xl mb-2">Acesso restrito</h1>
        <p className="text-sm text-gray-300">Seu perfil atual é {role || 'indefinido'} e não tem permissão para acessar esta página.</p>
      </div>
    )
  }
  return children
}
