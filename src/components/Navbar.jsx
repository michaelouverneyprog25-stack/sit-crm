import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, LogOut, Menu, Moon, Sun, UserCircle } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { logout } from '../firebase/auth'
import { useAuth } from '../contexts/AuthContext'
import SyncStatus from './SyncStatus'
import Logo from './Logo'
import UserAvatar from './UserAvatar'

export default function Navbar({ sidebarOpen, setSidebarOpen }){
  const {dark,setDark} = useTheme()
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)

  async function handleLogout(){
    await logout()
    navigate('/login')
  }

  return (
    <nav className="sticky top-0 z-30 border-b border-white/10 bg-[#080d14]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden rounded border border-white/10 bg-white/5 p-2 text-slate-200 hover:bg-white/10"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <Link to="/" className="flex items-center">
            <Logo variant="symbol" size="xs" />
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SyncStatus />
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((current) => !current)}
              className="inline-flex items-center gap-3 rounded-full border border-sky-300/20 bg-white/5 py-1 pl-1 pr-3 text-left hover:border-sky-300/50 hover:bg-sky-400/10"
            >
              <UserAvatar user={currentUser} size="sm" />
              <span className="hidden min-w-0 sm:block">
                <span className="block truncate text-sm font-medium text-slate-100">{currentUser?.name || 'Usuário'}</span>
                <span className="block truncate text-xs text-slate-400">Perfil: {currentUser?.role || 'Perfil'}</span>
              </span>
            </button>
            {profileOpen && (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-sky-300/20 bg-[#0B1020] shadow-2xl">
                <Link onClick={() => setProfileOpen(false)} to="/profile" className="flex items-center gap-2 px-4 py-3 text-sm text-slate-200 hover:bg-sky-500/15">
                  <UserCircle className="h-4 w-4 text-sky-300" />
                  Meu perfil
                </Link>
                <Link onClick={() => setProfileOpen(false)} to="/profile" className="flex items-center gap-2 px-4 py-3 text-sm text-slate-200 hover:bg-sky-500/15">
                  <Camera className="h-4 w-4 text-sky-300" />
                  Alterar foto
                </Link>
                <button onClick={handleLogout} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-red-100 hover:bg-red-500/15">
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </div>
            )}
          </div>
          <button onClick={()=>setDark(!dark)} className="inline-flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {dark? 'Light' : 'Dark'}
          </button>
        </div>
      </div>
    </nav>
  )
}
