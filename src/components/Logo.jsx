import React from 'react'

const fullLogo = '/brand/sit-lumx-logo-transparent.png'
const symbolLogo = '/brand/sit-lumx-symbol-transparent.png'

export default function Logo({
  variant = 'full',
  size = 'md',
  showText = true,
  className = '',
  glow = true,
}) {
  const isSymbol = variant === 'symbol'
  const sizes = {
    xs: isSymbol ? 'h-9 w-9' : 'h-10 w-32',
    sm: isSymbol ? 'h-11 w-11' : 'h-12 w-40',
    md: isSymbol ? 'h-14 w-14' : 'h-16 w-52',
    lg: isSymbol ? 'h-20 w-20' : 'h-24 w-72',
    xl: isSymbol ? 'h-28 w-28' : 'h-32 w-96',
  }

  return (
    <div className={`sit-logo-wrap ${glow ? 'sit-logo-glow' : ''} ${className}`}>
      <img
        src={isSymbol ? symbolLogo : fullLogo}
        alt="SIT.LUMX"
        className={`${sizes[size] || sizes.md} sit-logo-image`}
        draggable="false"
      />
      {showText && isSymbol && (
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight text-white">SIT.LUMX CRM</span>
          <span className="block text-xs text-slate-400">Vendas e metas</span>
        </span>
      )}
    </div>
  )
}
