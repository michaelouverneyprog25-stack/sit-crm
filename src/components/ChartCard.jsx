import React from 'react'

export default function ChartCard({title, value, percent, label}){
  return (
    <div className="bg-gray-800 p-5 rounded">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm text-gray-400">{title}</div>
          <div className="text-2xl font-semibold">{value}</div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-gray-300">{percent}%</div>
      </div>
      <div className="h-3 bg-gray-700 rounded overflow-hidden">
        <div className="h-full bg-cyan-300" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <div className="mt-3 text-sm text-gray-400">{label}</div>
    </div>
  )
}
