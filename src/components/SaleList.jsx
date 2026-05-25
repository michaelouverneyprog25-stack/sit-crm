import React from 'react'

function formatCurrency(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDate(value) {
  if (!value) return ''
  const date = value.toDate ? value.toDate() : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR')
}

function formatSaleDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR')
}

export default function SaleList({ items, loading = false, onEdit, onDelete }) {
  return (
    <div className="rounded-xl border border-white/10 bg-gray-800/95 p-5 shadow-lg shadow-blue-950/20">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-xl font-semibold">Vendas Salvas</h3>
          <p className="mt-1 text-sm text-gray-400">Registros recentes com dados comerciais e comissão.</p>
        </div>
        {loading && <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm text-cyan-100">Atualizando...</div>}
      </div>
      <div className="space-y-3">
        {items.map((s) => (
          <div key={s.id} className="overflow-hidden rounded-xl border border-white/10 bg-gray-900/90">
            <div className="flex flex-col gap-3 border-b border-white/10 bg-white/[0.03] p-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-xs font-semibold text-sky-100">{s.saleType || 'Ativação'}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.status === 'Sim' || s.status === 'Fechada' ? 'bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-300/30' : 'bg-amber-400/15 text-amber-100 ring-1 ring-amber-300/30'}`}>
                    Esteira: {s.status || 'Não'}
                  </span>
                  {formatSaleDate(s.saleDate) && <span className="text-sm text-gray-400">{formatSaleDate(s.saleDate)}</span>}
                </div>
                <div className="mt-2 text-lg font-semibold text-white">{s.customer || 'Cliente não informado'} <span className="text-sm font-normal text-gray-400">({s.cpf || 'CPF não informado'})</span></div>
                <div className="mt-1 text-sm text-gray-400">
                  {s.sellerName || s.userName || 'Sem vendedor'} {s.sellerRegistration ? `• Matrícula ${s.sellerRegistration}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-xs text-gray-400">Valor</div>
                  <div className="font-semibold text-white">{formatCurrency(s.amount || 0)}</div>
                </div>
                {onEdit && <button onClick={() => onEdit(s)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500">Editar</button>}
                {onDelete && <button onClick={() => onDelete(s)} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold hover:bg-red-500">Excluir</button>}
              </div>
            </div>
            <div className="grid gap-4 p-4 xl:grid-cols-[1fr_220px]">
              <div className="grid gap-2 text-sm text-gray-400 md:grid-cols-2">
                <div>
                  <span className="text-gray-500">Modalidade:</span> {s.saleType || 'Ativação'}
                  {s.saleType === 'Aparelhos' && s.deviceSaleMode ? ` • ${s.deviceSaleMode}` : ''}
                  {s.saleType === 'Upgrade' && s.deviceValue ? ' • com aparelho' : ''}
                  {s.saleType === 'Portabilidade' && s.provisionalNumber ? ` • Provisório: ${s.provisionalNumber}` : ''}
                  {s.saleType === 'Aparelhos' && s.deviceSaleMode === 'Portabilidade' && s.provisionalNumber ? ` • Provisório: ${s.provisionalNumber}` : ''}
                </div>
                {(s.saleType === 'Aparelhos' || (s.saleType === 'Upgrade' && s.deviceValue)) && s.deviceModel && <div className="text-sm text-gray-400">Modelo: {s.deviceModel}</div>}
                {(s.saleType === 'Aparelhos' || (s.saleType === 'Upgrade' && s.deviceValue)) && s.deviceValue !== '' && s.deviceValue !== undefined && <div className="text-sm text-gray-400">Valor do aparelho: {formatCurrency(s.deviceValue)}</div>}
                {(s.saleType === 'Aparelhos' || (s.saleType === 'Upgrade' && s.deviceValue)) && s.imei && <div className="text-sm text-gray-400">IMEI: {s.imei}</div>}
                {(s.saleType === 'Aparelhos' || (s.saleType === 'Upgrade' && s.deviceValue)) && s.deviceOrigin && <div className="text-sm text-gray-400">Origem: {s.deviceOrigin}</div>}
                {s.saleType === 'Acessórios' && s.accessoryName && <div className="text-sm text-gray-400">Acessório: {s.accessoryName}</div>}
                {s.saleType === 'Acessórios' && s.accessoryValue !== '' && s.accessoryValue !== undefined && <div className="text-sm text-gray-400">Valor do acessório: {formatCurrency(s.accessoryValue)}</div>}
                {s.plan && <div className="text-sm text-gray-400">Plano: {s.plan}</div>}
                {s.access && <div className="text-sm text-gray-400">{s.saleType === 'Fibra' ? 'Contrato' : 'Acesso'}: {s.access}</div>}
                {s.planValue !== '' && s.planValue !== undefined && <div className="text-sm text-gray-400">Valor do plano: {formatCurrency(s.planValue)}</div>}
                {s.saleType === 'Fibra' && (
                  <div className="mt-2 rounded border border-cyan-300/10 bg-cyan-300/5 p-2 text-sm text-gray-300">
                    <div>CEP: {s.fiberCep || '-'}</div>
                    <div>Endereço: {[s.fiberInstallationAddress, s.fiberInstallationNumber].filter(Boolean).join(', ') || '-'}</div>
                    {s.fiberInstallationComplement && <div>Complemento: {s.fiberInstallationComplement}</div>}
                    {s.fiberNeighborhood && <div>Bairro: {s.fiberNeighborhood}</div>}
                    {s.fiberCity && <div>Cidade: {s.fiberCity}</div>}
                    <div>Data instalação: {s.fiberInstallationDate || '-'}</div>
                    <div>Contato: {s.fiberClientContact || '-'}</div>
                  </div>
                )}
                {s.saleType === 'Upgrade' && s.previousPlan && <div className="text-sm text-gray-400">Plano anterior: {s.previousPlan}</div>}
                {s.saleType === 'Upgrade' && (
                  <div className="rounded border border-cyan-300/10 bg-cyan-300/5 p-2 text-sm text-gray-300 md:col-span-2">
                    <div>Comissão upgrade: {formatCurrency(s.commissionDetails?.upgrade?.amount || 0)}</div>
                    <div>Regra: {s.commissionDetails?.upgrade?.ruleId ? `${s.commissionDetails?.upgrade?.category || 'Upgrade'} - ${s.commissionDetails?.upgrade?.type || 'Regra cadastrada'}` : 'sem regra cadastrada'}</div>
                  </div>
                )}
                {s.dacc && <div className="text-sm text-gray-400">DACC: {s.dacc}</div>}
                {(s.insurance || s.seguro) && <div className="text-sm text-gray-400">Seguro: {s.insurance || s.seguro}</div>}
                {(s.insuranceValue !== '' && s.insuranceValue !== undefined) && <div className="text-sm text-gray-400">Valor do seguro: {formatCurrency(s.insuranceValue)}</div>}
                {(s.userName || s.sellerName) && <div className="text-sm text-gray-400">Cadastrado por: {s.userName || s.sellerName}</div>}
                {formatDate(s.createdAt) && <div className="text-sm text-gray-400">Criado em: {formatDate(s.createdAt)}</div>}
              </div>
              <div className="grid gap-2 self-start rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Comissão vendedor</span>
                  <span className="font-semibold text-white">{formatCurrency(s.commission || 0)}</span>
                </div>
                {Number(s.storeCommission || 0) > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-400">Comissão Gerente</span>
                    <span className="font-semibold text-white">{formatCurrency(s.storeCommission || 0)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {!items.length && <div className="rounded border border-white/10 bg-gray-900 p-4 text-gray-400">Nenhuma venda encontrada.</div>}
      </div>
    </div>
  )
}
