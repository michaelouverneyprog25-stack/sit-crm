import React, { useState } from 'react'
import { Camera, Save } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { updateUserProfile } from '../firebase/db'
import UserAvatar from '../components/UserAvatar'

export default function Profile() {
  const { currentUser } = useAuth()
  const [photoUrl, setPhotoUrl] = useState(currentUser?.photoUrl || '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function savePhoto(event) {
    event.preventDefault()
    setMessage('')
    setError('')

    const value = photoUrl.trim()
    if (value && !/^https?:\/\/.+\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(value)) {
      setError('Use uma URL HTTPS de imagem JPG, JPEG, PNG ou WEBP.')
      return
    }

    setSaving(true)
    try {
      await updateUserProfile(currentUser.uid, { photoUrl: value })
      setMessage('Foto atualizada. Entre novamente ou recarregue a página para atualizar o topo.')
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a foto.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-xl border border-sky-300/20 bg-gray-800 p-6 shadow-2xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <UserAvatar user={{ ...currentUser, photoUrl }} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-200">Meu perfil</div>
            <h1 className="mt-1 text-3xl font-semibold text-white">{currentUser?.name || 'Usuário'}</h1>
            <p className="mt-1 text-slate-400">{currentUser?.email}</p>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded border border-white/10 bg-gray-900 p-3">
                <div className="text-slate-400">Perfil</div>
                <div className="font-semibold text-white">{currentUser?.role || '-'}</div>
              </div>
              <div className="rounded border border-white/10 bg-gray-900 p-3">
                <div className="text-slate-400">Loja</div>
                <div className="font-semibold text-white">{currentUser?.storeName || '-'}</div>
              </div>
              <div className="rounded border border-white/10 bg-gray-900 p-3">
                <div className="text-slate-400">Cidade/UF</div>
                <div className="font-semibold text-white">{[currentUser?.storeCity, currentUser?.storeState].filter(Boolean).join(' / ') || '-'}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={savePhoto} className="rounded-xl border border-sky-300/20 bg-gray-800 p-5">
        <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <Camera className="h-5 w-5 text-sky-300" />
          Alterar foto
        </div>
        <label className="block text-sm text-slate-300">
          <span className="mb-1 block">URL da imagem</span>
          <input
            value={photoUrl}
            onChange={(event) => setPhotoUrl(event.target.value)}
            placeholder="https://exemplo.com/foto.webp"
            className="w-full rounded bg-gray-700 p-3"
          />
        </label>
        <p className="mt-2 text-xs text-slate-400">Aceita JPG, JPEG, PNG e WEBP por URL. Upload direto para Storage exige configuração de Firebase Storage.</p>
        {error && <div className="mt-3 rounded border border-red-300/30 bg-red-600/20 p-3 text-sm text-red-100">{error}</div>}
        {message && <div className="mt-3 rounded border border-emerald-300/30 bg-emerald-600/20 p-3 text-sm text-emerald-100">{message}</div>}
        <button disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </form>
    </div>
  )
}
