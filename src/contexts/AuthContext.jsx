import React, { createContext, useContext, useEffect, useState } from 'react'
import { auth } from '../firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'
import { getUserProfile } from '../firebase/db'

const AuthContext = createContext()

function normalizeRole(value) {
  const role = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
  if (role === 'administrador' || role === 'admin') return 'Administrador'
  if (role === 'gestor master' || role === 'gestor marter') return 'Gestor Master'
  if (role === 'gerente') return 'Gerente'
  if (role === 'vendedor') return 'Vendedor'
  if (role === 'caixa') return 'Caixa'
  if (role === 'executivo') return 'Executivo'
  return value || 'Vendedor'
}

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true)
      setAuthError('')

      try {
        if (!user) {
          setCurrentUser(null)
          return
        }

        const tokenResult = await user.getIdTokenResult(true)
        const roleFromClaim = tokenResult?.claims?.role
        let profile = null

        try {
          profile = await getUserProfile(user.uid)
        } catch (error) {
          console.error('Erro ao carregar perfil do usuário:', error)
          setAuthError('Não foi possível carregar o perfil completo. Usando dados da autenticação.')
        }

        const merged = {
          uid: user.uid,
          email: user.email,
          name: profile?.name || user.displayName || 'Usuário',
          role: normalizeRole(profile?.role || roleFromClaim || 'Vendedor'),
          storeName: profile?.storeName || '',
          storeCity: profile?.storeCity || '',
          storeState: profile?.storeState || '',
          disabled: profile?.disabled === true,
        }

        setCurrentUser(merged)
      } catch (error) {
        console.error('Erro ao restaurar sessão:', error)
        setCurrentUser(null)
        setAuthError('Não foi possível restaurar sua sessão. Faça login novamente.')
      } finally {
        setLoading(false)
      }
    })
    return unsubscribe
  }, [])

  const value = { currentUser, loading, authError }
  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
            <div className="text-sm text-gray-300">Carregando sessão...</div>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  )
}
