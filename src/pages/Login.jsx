import React, { useState } from 'react'
import { login } from '../firebase/auth'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { reportError } from '../utils/operationLog'
import Logo from '../components/Logo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  function getLoginErrorMessage(err) {
    if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password' || err?.code === 'auth/user-not-found') {
      return 'E-mail ou senha incorretos.'
    }
    if (err?.code === 'auth/user-disabled') {
      return 'Este usuário está desativado. Fale com o administrador.'
    }
    if (err?.code === 'auth/invalid-email') {
      return 'E-mail inválido.'
    }
    if (err?.code === 'auth/network-request-failed') {
      return 'Falha de conexão. Verifique a internet e tente novamente.'
    }
    return 'Erro ao autenticar. Tente novamente.'
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      await login(email.trim().toLowerCase(), password)
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (err) {
      reportError(err, { source: 'Login', action: 'autenticar usuario', module: 'login', userEmail: email.trim().toLowerCase(), autoFix: false })
      setError(getLoginErrorMessage(err))
    }
  }

  return (
    <div className="flex min-h-[78vh] items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md overflow-hidden rounded-xl border border-sky-300/20 bg-gray-800 shadow-[0_24px_80px_rgba(0,43,127,0.38)]">
        <div className="border-b border-sky-300/20 bg-gradient-to-br from-[#002B7F] via-[#0057FF] to-[#00A3FF] px-6 py-7">
          <Logo variant="full" size="lg" className="mb-4 justify-center" />
          <h2 className="text-2xl font-semibold text-white">Bem-vindo ao SIT.LUMX CRM</h2>
          <p className="mt-1 text-sm text-blue-50">Acesse vendas, metas, fibra e relatórios com segurança.</p>
        </div>
        <div className="p-6">
          {error && <div className="mb-4 rounded border border-red-300/30 bg-red-600/20 p-3 text-sm text-red-100">{error}</div>}
          <label className="mb-3 block text-sm text-slate-300">
            <span className="mb-1 block">Email</span>
            <input className="w-full rounded bg-gray-700 p-3" placeholder="seu@email.com" type="email" autoCapitalize="none" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="mb-4 block text-sm text-slate-300">
            <span className="mb-1 block">Senha</span>
            <input className="w-full rounded bg-gray-700 p-3" placeholder="Digite sua senha" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <button className="w-full rounded bg-blue-600 p-3 font-semibold shadow-[0_0_28px_rgba(0,87,255,0.28)]">Entrar</button>
          <div className="mt-4 text-right text-sm text-gray-400">
            <Link to="/forgot-password" className="text-cyan-300 hover:text-cyan-200">Esqueci a senha</Link>
          </div>
        </div>
      </form>
    </div>
  )
}
