import React from 'react'

export default function Spinner({ size = 4 }){
  const s = `${size} ${size}`
  return (
    <div className="flex items-center justify-center">
      <div className={`w-${size} h-${size} border-2 border-t-transparent border-white rounded-full animate-spin`} />
    </div>
  )
}
