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
    <div className="rounded bg-gray-800 p-5">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-xl font-semibold">Lista de vendas salvas</h3>
          <p className="mt-1 text-sm text-gray-400">Registros recentes com dados comerciais e comissão.</p>
        </div>
        {loading && <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm text-cyan-100">Atualizando...</div>}
      </div>
      <div className="space-y-3">
        {items.map((s) => (
          <div key={s.id} className="rounded border border-white/10 bg-gray-900 p-4">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2">
              <div>
                {formatSaleDate(s.saleDate) && <div className="text-sm text-gray-400">Data: {formatSaleDate(s.saleDate)}</div>}
                <div className="text-lg font-semibold">{s.customer} <span className="text-sm font-normal text-gray-400">({s.cpf})</span></div>
                <div className="text-sm text-gray-400">{s.sellerName || s.userName || 'Sem vendedor'} — Esteira: {s.status || 'Não'}</div>
                <div className="text-sm text-gray-400">
                  Tipo: {s.saleType || 'Ativação'}
                  {s.saleType === 'Aparelhos' && s.deviceSaleMode ? ` — ${s.deviceSaleMode}` : ''}
                  {s.saleType === 'Upgrade' && s.deviceValue ? ' — com aparelho' : ''}
                  {s.saleType === 'Portabilidade' && s.provisionalNumber ? ` — Provisório: ${s.provisionalNumber}` : ''}
                  {s.saleType === 'Aparelhos' && s.deviceSaleMode === 'Portabilidade' && s.provisionalNumber ? ` — Provisório: ${s.provisionalNumber}` : ''}
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
                  <div className="mt-2 rounded border border-cyan-300/10 bg-cyan-300/5 p-2 text-sm text-gray-300">
                    <div>Comissão upgrade: {formatCurrency(s.commissionDetails?.upgrade?.amount || 0)}</div>
                    <div>Regra: {s.commissionDetails?.upgrade?.ruleId ? `${s.commissionDetails?.upgrade?.category || 'Upgrade'} - ${s.commissionDetails?.upgrade?.type || 'Regra cadastrada'}` : 'sem regra cadastrada'}</div>
                  </div>
                )}
                {s.dacc && <div className="text-sm text-gray-400">DACC: {s.dacc}</div>}
                {(s.insurance || s.seguro) && <div className="text-sm text-gray-400">Seguro: {s.insurance || s.seguro}</div>}
                {(s.insuranceValue !== '' && s.insuranceValue !== undefined) && <div className="text-sm text-gray-400">Valor do seguro: {formatCurrency(s.insuranceValue)}</div>}
                {(s.userName || s.sellerName) && <div className="text-sm text-gray-400">Cadastrado por: {s.userName || s.sellerName}</div>}
                {formatDate(s.createdAt) && <div className="text-sm text-gray-400">Criado em: {formatDate(s.createdAt)}</div>}
                <div className="text-sm text-gray-400">Comissão vendedor: {formatCurrency(s.commission || 0)}</div>
                {Number(s.storeCommission || 0) > 0 && <div className="text-sm text-gray-400">Comissão loja: {formatCurrency(s.storeCommission || 0)}</div>}
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <div className="mr-1 rounded bg-white/5 px-3 py-2 font-semibold">{formatCurrency(s.amount || 0)}</div>
                {onEdit && <button onClick={() => onEdit(s)} className="px-3 py-2 bg-blue-600 rounded">Editar</button>}
                {onDelete && <button onClick={() => onDelete(s)} className="px-3 py-2 bg-red-600 rounded">Excluir</button>}
              </div>
            </div>
          </div>
        ))}
        {!items.length && <div className="rounded border border-white/10 bg-gray-900 p-4 text-gray-400">Nenhuma venda encontrada.</div>}
      </div>
    </div>
  )
}
