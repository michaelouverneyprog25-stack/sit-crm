import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Navigate, useLocation } from 'react-router-dom'

export default function ProtectedRoute({children}){
  const { currentUser, loading, authError } = useAuth()
  const location = useLocation()
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
  return children
}
