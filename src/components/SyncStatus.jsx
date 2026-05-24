import React from 'react'
import { CheckCircle2, CloudOff, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { useSyncStatus } from '../contexts/SyncContext'

function getStatusConfig(status, online) {
  if (!online || status === 'offline') {
    return { icon: CloudOff, className: 'border-amber-300/25 bg-amber-300/10 text-amber-100' }
  }
  if (status === 'saving') {
    return { icon: Loader2, className: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100', spin: true }
  }
  if (status === 'error') {
    return { icon: TriangleAlert, className: 'border-red-300/25 bg-red-400/10 text-red-100' }
  }
  if (status === 'pending') {
    return { icon: RefreshCw, className: 'border-violet-300/25 bg-violet-300/10 text-violet-100' }
  }
  return { icon: CheckCircle2, className: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' }
}

export default function SyncStatus() {
  const { online, status, message, pending, updatedAt } = useSyncStatus()
  const config = getStatusConfig(status, online)
  const Icon = config.icon

  return (
    <div className={`hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-sm lg:flex ${config.className}`}>
      <Icon className={`h-4 w-4 ${config.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      <div className="leading-tight">
        <div className="font-semibold">{status === 'saving' ? 'Salvando...' : message || 'Salvo com sucesso'}</div>
        <div className="opacity-75">
          {pending ? `${pending} pendente(s)` : updatedAt ? updatedAt.toLocaleTimeString('pt-BR') : 'monitor ativo'}
        </div>
      </div>
    </div>
  )
}
