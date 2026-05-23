import React, { useEffect } from 'react'

export default function Toast({ open, message, type = 'info', onClose }){
  useEffect(()=>{
    if(!open) return
    const t = setTimeout(()=> onClose && onClose(), 3000)
    return ()=> clearTimeout(t)
  },[open])

  if(!open) return null

  const bg = type === 'error'
    ? 'border-red-300/30 bg-red-600/90'
    : type === 'success'
      ? 'border-emerald-300/30 bg-emerald-600/90'
      : 'border-cyan-300/30 bg-cyan-700/90'

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className={`${bg} border text-white px-4 py-3 rounded shadow-lg backdrop-blur`}>{message}</div>
    </div>
  )
}
