import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Menu, Moon, Sun } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { logout } from '../firebase/auth'
import { useAuth } from '../contexts/AuthContext'
import SyncStatus from './SyncStatus'

export default function Navbar({ sidebarOpen, setSidebarOpen }){
  const {dark,setDark} = useTheme()
  const navigate = useNavigate()
  const { currentUser } = useAuth()

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
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded bg-cyan-300 text-sm font-black text-slate-950">SIT</span>
            <span>
              <span className="block text-sm font-semibold leading-tight text-white">SIT CRM</span>
              <span className="block text-xs text-slate-400">Vendas e metas</span>
            </span>
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SyncStatus />
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium text-slate-100">{currentUser?.name || 'Usuário'}</div>
            <div className="text-xs text-slate-400">{currentUser?.role || 'Perfil'}</div>
          </div>
          <button onClick={()=>setDark(!dark)} className="inline-flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {dark? 'Light' : 'Dark'}
          </button>
          <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white">
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </div>
    </nav>
  )
}
