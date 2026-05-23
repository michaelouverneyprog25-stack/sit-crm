import React from 'react'

export default function LoadingOverlay({ open }){
  if(!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 p-6 rounded-lg flex items-center gap-3">
        <div className="w-6 h-6 border-2 border-t-transparent border-white rounded-full animate-spin" />
        <div className="text-white">Processando...</div>
      </div>
    </div>
  )
}
