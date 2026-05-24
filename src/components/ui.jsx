import React from 'react'

export function PageHeader({ eyebrow, title, description, action, metric }) {
  return (
    <div className="crm-page-header">
      <div>
        {eyebrow && <p className="crm-eyebrow">{eyebrow}</p>}
        <h1 className="crm-title">{title}</h1>
        {description && <p className="crm-description">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {metric}
        {action}
      </div>
    </div>
  )
}

export function MetricCard({ label, value, helper, tone = 'cyan', icon: Icon }) {
  return (
    <div className={`crm-metric crm-metric-${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="crm-metric-label">{label}</div>
          <div className="crm-metric-value">{value}</div>
        </div>
        {Icon && (
          <div className="crm-metric-icon">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
      </div>
      {helper && <div className="crm-metric-helper">{helper}</div>}
    </div>
  )
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-lg bg-white/[0.06]" />
      ))}
    </div>
  )
}
