import React from 'react'

export default function Modal({open, title, children, onClose}){
  if(!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-gray-900 rounded shadow-xl overflow-hidden border border-white/10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-300 hover:text-white">Fechar</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
