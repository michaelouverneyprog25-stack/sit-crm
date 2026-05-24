import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { reportError } from '../utils/operationLog'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    reportError(error, { componentStack: info?.componentStack || '', source: 'ErrorBoundary' })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6">
        <div className="max-w-xl rounded-xl border border-red-300/20 bg-red-950/25 p-6 text-center shadow-2xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-400/15 text-red-200">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-white">Algo saiu do fluxo esperado</h1>
          <p className="mt-2 text-sm text-slate-300">
            Registramos o erro localmente para diagnóstico. Você pode tentar recarregar sem perder os dados já salvos.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Recarregar sistema
          </button>
        </div>
      </div>
    )
  }
}
