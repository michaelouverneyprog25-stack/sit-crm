import * as Sentry from '@sentry/react'

let initialized = false

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn || initialized) return false

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0.1),
  })

  initialized = true
  return true
}

export function captureMonitoringError(error, context = {}) {
  if (initialized) {
    Sentry.captureException(error, {
      extra: context,
    })
  }
}
