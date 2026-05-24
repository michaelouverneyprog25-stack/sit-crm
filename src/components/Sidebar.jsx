import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Sidebar({ sidebarOpen, setSidebarOpen }){
  const { currentUser } = useAuth()
  const role = currentUser?.role || '—'
  const canManageUsers = ['Administrador','Gestor Master','Gerente'].includes(role)
  const canManageStores = ['Administrador','Gestor Master'].includes(role)
  const canManageCommissionRules = ['Administrador','Gestor Master'].includes(role)
  const canViewReports = ['Administrador','Gestor Master','Gerente','Executivo'].includes(role)
  const canViewAllSalesReport = ['Administrador','Gestor Master','Gerente'].includes(role)
  const canManageGoals = ['Administrador','Gestor Master','Gerente','Vendedor'].includes(role)
  const canViewFiberViability = ['Administrador','Gestor Master','Gerente','Vendedor','Executivo'].includes(role)
  const displayName = currentUser?.name || 'Usuário'

  const navItems = [
    { to: '/', label: 'Dashboard', show: true, end: true },
    { to: '/sales', label: 'Vendas', show: true, end: true },
    { to: '/reports', label: 'Relatórios', show: canViewReports, end: true },
    { to: '/reports/all-sales', label: 'Relatório de vendas', show: canViewAllSalesReport, end: true },
    { to: '/users', label: 'Usuários', show: canManageUsers, end: true },
    { to: '/stores', label: 'Lojas', show: canManageStores, end: true },
    { to: '/commission-rules', label: 'Regras de comissão', show: canManageCommissionRules, end: true },
    { to: '/goals', label: 'Metas', show: canManageGoals, end: true },
    { to: '/fiber-viability', label: 'Viabilidade de fibra', show: canViewFiberViability, end: true },
    { to: '/fiber-contracts', label: 'Contratos fibra', show: canViewFiberViability, end: true },
  ].filter((item) => item.show)

  function linkClass({ isActive }) {
    return [
      'block rounded px-3 py-2.5 text-sm font-medium transition',
      isActive
        ? 'bg-cyan-300 text-slate-950'
        : 'text-slate-300 hover:bg-white/10 hover:text-white',
    ].join(' ')
  }

  function UserBlock() {
    return (
      <div className="mb-6 rounded border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-cyan-300 font-bold text-slate-950">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-white">{displayName}</div>
            <div className="truncate text-xs text-slate-400">SIT CRM</div>
          </div>
        </div>
        <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
          Perfil: {role}
        </div>
      </div>
    )
  }

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-10 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-20 w-72 transform border-r border-white/10 bg-[#080d14]/95 p-4 shadow-xl backdrop-blur-xl transition-transform duration-200 ease-out md:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <UserBlock />
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setSidebarOpen(false)} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <aside className="sticky top-[65px] hidden h-[calc(100vh-65px)] w-72 shrink-0 border-r border-white/10 bg-[#080d14]/55 p-4 backdrop-blur md:block">
        <UserBlock />
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
