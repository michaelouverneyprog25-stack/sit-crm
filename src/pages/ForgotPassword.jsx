import React, { useState } from 'react'
import { resetPassword } from '../firebase/auth'
import { Link, useNavigate } from 'react-router-dom'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage('')
    setError('')
    setLoading(true)

    try {
      await resetPassword(email)
      setMessage('E-mail de recuperação enviado. Verifique sua caixa de entrada.')
      setEmail('')
    } catch (err) {
      setError('Não foi possível enviar o link. Verifique o e-mail e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-gray-800 p-6 rounded">
        <h2 className="text-2xl mb-4">Recuperar senha</h2>
        {message && <div className="bg-green-600 p-2 mb-3">{message}</div>}
        {error && <div className="bg-red-600 p-2 mb-3">{error}</div>}
        <input
          className="w-full p-2 mb-3 bg-gray-700 rounded"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button disabled={loading} className="w-full bg-blue-600 p-2 rounded">
          {loading ? 'Enviando...' : 'Enviar link de recuperação'}
        </button>
        <div className="mt-4 text-sm text-gray-400">
          <button type="button" onClick={() => navigate('/login')} className="text-blue-400 hover:text-blue-300">
            Voltar ao login
          </button>
        </div>
      </form>
    </div>
  )
}
