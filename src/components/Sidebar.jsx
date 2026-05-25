import React from 'react'
import { NavLink } from 'react-router-dom'
import { Activity, BarChart3, Building2, ClipboardList, Database, FileSpreadsheet, Goal, Gauge, LifeBuoy, ReceiptText, SearchCheck, ShoppingCart, Smartphone, TerminalSquare, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Logo from './Logo'
import UserAvatar from './UserAvatar'

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
  const canManageImports = role === 'Administrador'
  const displayName = currentUser?.name || 'Usuário'

  const navItems = [
    { to: '/', label: 'Dashboard', icon: Gauge, show: true, end: true },
    { to: '/sales', label: 'Vendas', icon: ShoppingCart, show: true, end: true },
    { to: '/reports', label: 'Relatórios', icon: BarChart3, show: canViewReports, end: true },
    { to: '/reports/all-sales', label: 'Relatório de vendas', icon: FileSpreadsheet, show: canViewAllSalesReport, end: true },
    { to: '/users', label: 'Usuários', icon: Users, show: canManageUsers, end: true },
    { to: '/stores', label: 'Lojas', icon: Building2, show: canManageStores, end: true },
    { to: '/commission-rules', label: 'Regras de comissão', icon: ReceiptText, show: canManageCommissionRules, end: true },
    { to: '/goals', label: 'Metas', icon: Goal, show: canManageGoals, end: true },
    { to: '/fiber-viability', label: 'Viabilidade de fibra', icon: Smartphone, show: canViewFiberViability, end: true },
    { to: '/fiber-contracts', label: 'Contratos fibra', icon: ClipboardList, show: canViewFiberViability, end: true },
    { to: '/admin/imports', label: 'Importação de Base', icon: Database, show: canManageImports, end: true, group: 'Administração' },
    { to: '/admin/spreadsheets', label: 'Gestão de Planilhas', icon: FileSpreadsheet, show: canManageImports, end: true, group: 'Administração' },
    { to: '/admin/support', label: 'Suporte', icon: LifeBuoy, show: canManageImports, end: true, group: 'Suporte' },
    { to: '/admin/errors', label: 'Monitoramento de Erros', icon: Activity, show: canManageImports, end: true, group: 'Suporte' },
    { to: '/admin/logs', label: 'Logs do Sistema', icon: TerminalSquare, show: canManageImports, end: true, group: 'Suporte' },
    { to: '/admin/diagnostics', label: 'Diagnóstico Automático', icon: SearchCheck, show: canManageImports, end: true, group: 'Suporte' },
  ].filter((item) => item.show)

  const standardNavItems = navItems.filter((item) => !item.group)
  const adminNavItems = navItems.filter((item) => item.group === 'Administração')
  const supportNavItems = navItems.filter((item) => item.group === 'Suporte')
  const groupedNavItems = [
    { label: 'Administração', items: adminNavItems },
    { label: 'Suporte', items: supportNavItems },
  ].filter((group) => group.items.length)

  function linkClass({ isActive }) {
    return [
      'flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition',
      isActive
        ? 'border-l-4 border-[#00A3FF] bg-[#0057FF]/20 text-white shadow-[0_0_24px_rgba(0,87,255,0.22)]'
        : 'border-l-4 border-transparent text-slate-300 hover:border-[#00A3FF]/70 hover:bg-[#0057FF]/10 hover:text-white',
    ].join(' ')
  }

  function UserBlock() {
    return (
      <div className="mb-6 rounded border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-4">
          <Logo variant="full" size="sm" className="justify-center" />
        </div>
        <div className="mb-3 flex items-center gap-3">
          <UserAvatar user={currentUser} size="md" />
          <div className="min-w-0">
            <div className="truncate font-semibold text-white">{displayName}</div>
            <div className="truncate text-xs text-slate-400">SIT.LUMX CRM</div>
          </div>
        </div>
        <div className="inline-flex rounded-full border border-sky-300/25 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-100">
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
          {standardNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setSidebarOpen(false)} className={linkClass}>
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
          {groupedNavItems.map((group) => (
            <div key={group.label} className="pt-4">
              <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{group.label}</div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setSidebarOpen(false)} className={linkClass}>
                    <item.icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
      <aside className="sticky top-[65px] hidden h-[calc(100vh-65px)] w-72 shrink-0 border-r border-white/10 bg-[#080d14]/55 p-4 backdrop-blur md:block">
        <UserBlock />
        <nav className="space-y-1">
          {standardNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
          {groupedNavItems.map((group) => (
            <div key={group.label} className="pt-4">
              <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{group.label}</div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                    <item.icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
