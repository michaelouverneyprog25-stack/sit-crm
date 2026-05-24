import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { flushPendingSync } from '../firebase/db'

const SyncContext = createContext(null)

const initialState = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  saving: false,
  message: 'Tudo sincronizado',
  status: 'idle',
  pending: 0,
  updatedAt: null,
}

export function useSyncStatus() {
  return useContext(SyncContext) || initialState
}

export function SyncProvider({ children }) {
  const [state, setState] = useState(initialState)

  useEffect(() => {
    function updateOnline() {
      setState((current) => ({
        ...current,
        online: navigator.onLine,
        status: navigator.onLine ? current.status : 'offline',
        message: navigator.onLine ? 'Conexão restabelecida' : 'Sem internet. Salvando localmente quando possível.',
        updatedAt: new Date(),
      }))
    }

    function updateSync(event) {
      const detail = event.detail || {}
      setState((current) => ({
        ...current,
        ...detail,
        saving: detail.status === 'saving' || detail.saving === true,
        updatedAt: new Date(),
      }))
    }

    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    window.addEventListener('sit:sync-status', updateSync)

    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
      window.removeEventListener('sit:sync-status', updateSync)
    }
  }, [])

  useEffect(() => {
    if (!state.online) return undefined
    let active = true
    flushPendingSync().then((result) => {
      if (!active || !result?.flushed) return
      setState((current) => ({
        ...current,
        pending: result.remaining,
        status: result.remaining ? 'pending' : 'success',
        message: result.remaining ? 'Ainda há itens pendentes de sincronização' : 'Pendências sincronizadas',
        updatedAt: new Date(),
      }))
    }).catch(() => {})
    return () => {
      active = false
    }
  }, [state.online])

  const value = useMemo(() => state, [state])

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
