import React from 'react'

export default function UserAvatar({ user, size = 'md', className = '' }) {
  const name = user?.name || user?.email || 'Usuário'
  const initial = name.slice(0, 1).toUpperCase()
  const sizes = {
    sm: 'h-9 w-9 text-sm',
    md: 'h-11 w-11 text-base',
    lg: 'h-24 w-24 text-3xl',
  }

  if (user?.photoUrl) {
    return (
      <img
        src={user.photoUrl}
        alt={name}
        className={`${sizes[size] || sizes.md} rounded-full border border-sky-300/40 object-cover shadow-[0_0_22px_rgba(0,87,255,0.28)] ${className}`}
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <div className={`${sizes[size] || sizes.md} flex items-center justify-center rounded-full border border-sky-300/40 bg-gradient-to-br from-[#0057FF] to-[#00A3FF] font-bold text-white shadow-[0_0_22px_rgba(0,87,255,0.28)] ${className}`}>
      {initial}
    </div>
  )
}
