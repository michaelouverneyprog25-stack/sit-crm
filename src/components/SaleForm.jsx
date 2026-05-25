import React, { useEffect, useState } from 'react'
import { apiRequest } from '../firebase/db'

const SALE_TYPES = ['Ativação', 'Migração', 'Portabilidade', 'Upgrade', 'Aparelhos', 'Acessórios', 'Fibra']
const DEVICE_SALE_MODES = ['Ativação', 'Migração', 'Portabilidade']
const PLAN_OPTIONS = [
  'CONTROLE 2.0',
  'CONTROLE PLUS 2.0',
  'CONTROLE PREMIUM 2.0',
  'CONTROLE BASICO EXPRESS',
  'CONTROLE LIGTH EXPRESS',
  'CONTROLE PRO EXPRESS',
  'BLACK',
  'BLACK PLUS',
  'BLACK PREMIUM',
  'BLACK A EXPRESS',
  'BLACK B EXPRESS',
  'BLACK C EXPRESS',
  'BLACK FAMILIA',
  'BLACK FAMILIA PLUS',
  'BLACK FAMILIA PREMIUM',
  'BLACK FAMILIA VIP',
  'Dependente',
  'Fibra 500MB',
  'Fibra 600MB',
  'Fibra 700MB',
  'Fibra 1GB',
]

function getCurrentSaleTime() {
  return new Date().toTimeString().slice(0, 5)
}

function createEmptyForm() {
  return {
    saleDate: new Date().toISOString().slice(0, 10),
    saleTime: getCurrentSaleTime(),
    customer: '',
    cpf: '',
    amount: 0,
    status: 'Não',
    seller: '',
    plan: '',
    saleType: 'Ativação',
    access: '',
    planValue: '',
    previousPlan: '',
    addDeviceToUpgrade: 'Não',
    deviceSaleMode: 'Ativação',
    dacc: 'Não',
    insurance: 'Não',
    insuranceValue: '',
    provisionalNumber: '',
    deviceModel: '',
    deviceValue: '',
    imei: '',
    deviceOrigin: 'Loja',
    dependentCount: '',
    accessoryName: '',
    accessoryValue: '',
    fiberCep: '',
    fiberInstallationAddress: '',
    fiberInstallationNumber: '',
    fiberInstallationComplement: '',
    fiberNeighborhood: '',
    fiberCity: '',
    fiberInstallationDate: '',
    fiberClientContact: '',
    fiberStatus: 'Aprovisionamento',
    fiberCompletionDate: '',
    fiberCancelReason: '',
    fiberRescheduledDate: '',
  }
}

function parseCurrencyValue(value) {
  if (value === '' || value === null || value === undefined) return ''
  const normalized = String(value).replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : ''
}

function isDependentPlan(plan) {
  return String(plan || '').toUpperCase() === 'DEPENDENTE'
}

export default function SaleForm({ initialData = null, onSave, onCancel, submitLabel = 'Salvar' }) {
  const [form, setForm] = useState(() => createEmptyForm())
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (initialData) {
      setForm({
        saleDate: initialData.saleDate || '',
        saleTime: initialData.saleTime || (initialData.createdAt ? new Date(initialData.createdAt).toTimeString().slice(0, 5) : ''),
        customer: initialData.customer || '',
        cpf: initialData.cpf || '',
        amount: initialData.amount || 0,
        status: initialData.status || 'Não',
        seller: initialData.seller || '',
        plan: initialData.plan || '',
        saleType: initialData.saleType || 'Ativação',
        access: initialData.access || '',
        planValue: initialData.planValue ?? '',
        previousPlan: initialData.previousPlan || '',
        addDeviceToUpgrade: initialData.addDeviceToUpgrade || (initialData.saleType === 'Upgrade' && initialData.deviceValue ? 'Sim' : 'Não'),
        deviceSaleMode: initialData.deviceSaleMode || 'Ativação',
        dacc: initialData.dacc || 'Não',
        insurance: initialData.insurance || initialData.seguro || 'Não',
        insuranceValue: initialData.insuranceValue ?? initialData.seguroValue ?? '',
        provisionalNumber: initialData.provisionalNumber || '',
        deviceModel: initialData.deviceModel || '',
        deviceValue: initialData.deviceValue ?? '',
        imei: initialData.imei || '',
        deviceOrigin: initialData.deviceOrigin || 'Loja',
        dependentCount: initialData.dependentCount ?? initialData.dependents ?? '',
        accessoryName: initialData.accessoryName || '',
        accessoryValue: initialData.accessoryValue ?? '',
        fiberCep: initialData.fiberCep || '',
        fiberInstallationAddress: initialData.fiberInstallationAddress || '',
        fiberInstallationNumber: initialData.fiberInstallationNumber || '',
        fiberInstallationComplement: initialData.fiberInstallationComplement || '',
        fiberNeighborhood: initialData.fiberNeighborhood || '',
        fiberCity: initialData.fiberCity || '',
        fiberInstallationDate: initialData.fiberInstallationDate || '',
        fiberClientContact: initialData.fiberClientContact || '',
        fiberStatus: initialData.fiberStatus || 'Aprovisionamento',
        fiberCompletionDate: initialData.fiberCompletionDate || '',
        fiberCancelReason: initialData.fiberCancelReason || '',
        fiberRescheduledDate: initialData.fiberRescheduledDate || '',
      })
    } else {
      setForm(createEmptyForm())
    }
    setErrors({})
  }, [initialData])

  useEffect(() => {
    if (initialData) return undefined

    const syncSaleTime = () => {
      setForm((current) => ({
        ...current,
        saleTime: getCurrentSaleTime(),
      }))
    }

    syncSaleTime()
    const timer = setInterval(syncSaleTime, 30000)

    return () => clearInterval(timer)
  }, [initialData])

  function change(e) {
    const { name } = e.target
    const value = ['amount'].includes(name)
      ? Number(e.target.value)
      : ['fiberCep', 'fiberInstallationNumber'].includes(name)
        ? e.target.value.replace(/\D/g, '')
        : e.target.value
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === 'insurance' && value !== 'Sim' ? { insuranceValue: '' } : {}),
      ...(name === 'saleType' && value !== 'Portabilidade' ? { provisionalNumber: '' } : {}),
      ...(name === 'saleType' && value !== 'Upgrade' ? { previousPlan: '' } : {}),
      ...(name === 'saleType' && value !== 'Upgrade' ? { addDeviceToUpgrade: 'Não' } : {}),
      ...(name === 'saleType' && value !== 'Aparelhos' ? { deviceSaleMode: 'Ativação' } : {}),
      ...(name === 'saleType' && value !== 'Aparelhos' && value !== 'Upgrade' ? { deviceModel: '', deviceValue: '', imei: '', deviceOrigin: 'Loja' } : {}),
      ...(name === 'addDeviceToUpgrade' && value !== 'Sim' ? { deviceModel: '', deviceValue: '', imei: '', deviceOrigin: 'Loja' } : {}),
      ...(name === 'deviceSaleMode' && value !== 'Portabilidade' && current.saleType === 'Aparelhos' ? { provisionalNumber: '' } : {}),
      ...(name === 'saleType' && value !== 'Acessórios' ? { accessoryName: '', accessoryValue: '' } : {}),
      ...(name === 'saleType' && value !== 'Fibra' ? {
        fiberCep: '',
        fiberInstallationAddress: '',
        fiberInstallationNumber: '',
        fiberInstallationComplement: '',
        fiberNeighborhood: '',
        fiberCity: '',
        fiberInstallationDate: '',
        fiberClientContact: '',
        fiberStatus: 'Aprovisionamento',
        fiberCompletionDate: '',
        fiberCancelReason: '',
        fiberRescheduledDate: '',
      } : {}),
      ...(name === 'plan' ? { dependentCount: isDependentPlan(value) ? 1 : '' } : {}),
    }))
  }

  useEffect(() => {
    if (form.saleType !== 'Fibra' || form.fiberCep.length !== 8) return
    let active = true

    apiRequest(`/api/fiber-viability?cep=${form.fiberCep}&limit=1`)
      .then((data) => {
        const row = data?.rows?.[0]
        if (!active || !row) return
        setForm((current) => {
          if (current.saleType !== 'Fibra' || current.fiberCep !== form.fiberCep) return current
          return {
            ...current,
            fiberInstallationAddress: row.street || current.fiberInstallationAddress || '',
            fiberNeighborhood: row.neighborhood || current.fiberNeighborhood || '',
            fiberCity: row.city || current.fiberCity || '',
          }
        })
      })
      .catch((err) => {
        console.warn('Não foi possível preencher endereço pelo CEP:', err)
      })

    return () => {
      active = false
    }
  }, [form.saleType, form.fiberCep])

  function submit(e) {
    e.preventDefault()
    const nextErrors = {}
    const submittedSaleTime = initialData ? form.saleTime : getCurrentSaleTime()

    if (!form.customer.trim()) nextErrors.customer = 'Informe o cliente.'
    if (!form.saleDate) nextErrors.saleDate = 'Informe a data.'
    if (!submittedSaleTime) nextErrors.saleTime = 'Informe a hora.'
    if (!form.cpf.trim()) nextErrors.cpf = 'Informe o CPF.'
    if (!form.saleType) nextErrors.saleType = 'Selecione a modalidade de venda.'
    if (form.saleType !== 'Acessórios' && !form.access.trim()) nextErrors.access = form.saleType === 'Fibra' ? 'Informe o contrato.' : 'Informe o acesso.'
    if (form.saleType !== 'Acessórios' && !form.plan) nextErrors.plan = 'Selecione o plano.'
    if (!isDependentPlan(form.plan) && !['Acessórios', 'Upgrade'].includes(form.saleType) && (form.planValue === '' || parseCurrencyValue(form.planValue) === '')) nextErrors.planValue = 'Informe o valor do plano.'
    if ((form.saleType === 'Portabilidade' || (form.saleType === 'Aparelhos' && form.deviceSaleMode === 'Portabilidade')) && !form.provisionalNumber.trim()) nextErrors.provisionalNumber = 'Informe o número provisório da portabilidade.'
    if (form.saleType === 'Upgrade' && !form.previousPlan.trim()) nextErrors.previousPlan = 'Informe o plano anterior.'
    const requiresDeviceFields = form.saleType === 'Aparelhos' || (form.saleType === 'Upgrade' && form.addDeviceToUpgrade === 'Sim')
    if (requiresDeviceFields && !form.deviceModel.trim()) nextErrors.deviceModel = 'Informe o modelo do aparelho.'
    if (requiresDeviceFields && (form.deviceValue === '' || parseCurrencyValue(form.deviceValue) === '')) nextErrors.deviceValue = 'Informe o valor do aparelho.'
    if (requiresDeviceFields && !form.imei.trim()) nextErrors.imei = 'Informe o IMEI.'
    if (requiresDeviceFields && !form.deviceOrigin) nextErrors.deviceOrigin = 'Selecione Loja ou TIM.'
    if (form.saleType === 'Acessórios' && !form.accessoryName.trim()) nextErrors.accessoryName = 'Informe o nome do acessório.'
    if (form.saleType === 'Acessórios' && (form.accessoryValue === '' || parseCurrencyValue(form.accessoryValue) === '')) nextErrors.accessoryValue = 'Informe o valor do acessório.'
    if (form.insurance === 'Sim' && (form.insuranceValue === '' || parseCurrencyValue(form.insuranceValue) === '')) nextErrors.insuranceValue = 'Informe o valor do seguro.'
    if (form.saleType === 'Fibra' && form.fiberCep.length !== 8) nextErrors.fiberCep = 'Informe o CEP com 8 dígitos.'
    if (form.saleType === 'Fibra' && !form.fiberInstallationAddress.trim()) nextErrors.fiberInstallationAddress = 'Informe o endereço de instalação.'
    if (form.saleType === 'Fibra' && !form.fiberInstallationNumber.trim()) nextErrors.fiberInstallationNumber = 'Informe o número da residência.'
    if (form.saleType === 'Fibra' && !form.fiberCity.trim()) nextErrors.fiberCity = 'Informe um CEP válido para preencher a cidade.'
    if (form.saleType === 'Fibra' && !form.fiberInstallationDate) nextErrors.fiberInstallationDate = 'Informe a data de instalação.'
    if (form.saleType === 'Fibra' && !form.fiberClientContact.trim()) nextErrors.fiberClientContact = 'Informe o contato do cliente.'
    if (isDependentPlan(form.plan) && Number(form.dependentCount || 1) < 1) nextErrors.dependentCount = 'Informe uma quantidade válida de dependentes.'

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const parsedPlanValue = parseCurrencyValue(form.planValue)
    const parsedAccessoryValue = parseCurrencyValue(form.accessoryValue)
    const parsedInsuranceValue = parseCurrencyValue(form.insuranceValue)
    const dependentCount = isDependentPlan(form.plan) ? Number(form.dependentCount || 1) : 0

    onSave({
      ...form,
      amount: isDependentPlan(form.plan) || form.saleType === 'Upgrade' ? 0 : form.saleType === 'Acessórios' ? parsedAccessoryValue : parsedPlanValue,
      saleTime: submittedSaleTime,
      planValue: isDependentPlan(form.plan) || form.saleType === 'Upgrade' ? 0 : form.saleType === 'Acessórios' ? '' : parsedPlanValue,
      dependentCount: Number.isFinite(dependentCount) ? dependentCount : 0,
      provisionalNumber: form.saleType === 'Portabilidade' || (form.saleType === 'Aparelhos' && form.deviceSaleMode === 'Portabilidade') ? form.provisionalNumber.trim() : '',
      previousPlan: form.saleType === 'Upgrade' ? form.previousPlan.trim() : '',
      addDeviceToUpgrade: form.saleType === 'Upgrade' ? form.addDeviceToUpgrade : 'Não',
      deviceSaleMode: form.saleType === 'Aparelhos' ? form.deviceSaleMode : '',
      insurance: form.insurance,
      insuranceValue: form.insurance === 'Sim' ? parsedInsuranceValue : '',
      deviceModel: requiresDeviceFields ? form.deviceModel.trim() : '',
      deviceValue: requiresDeviceFields ? parseCurrencyValue(form.deviceValue) : '',
      imei: requiresDeviceFields ? form.imei.trim() : '',
      deviceOrigin: requiresDeviceFields ? form.deviceOrigin : '',
      accessoryName: form.saleType === 'Acessórios' ? form.accessoryName.trim() : '',
      accessoryValue: form.saleType === 'Acessórios' ? parsedAccessoryValue : '',
      fiberCep: form.saleType === 'Fibra' ? form.fiberCep : '',
      fiberInstallationAddress: form.saleType === 'Fibra' ? form.fiberInstallationAddress.trim() : '',
      fiberInstallationNumber: form.saleType === 'Fibra' ? form.fiberInstallationNumber.trim() : '',
      fiberInstallationComplement: form.saleType === 'Fibra' ? form.fiberInstallationComplement.trim() : '',
      fiberNeighborhood: form.saleType === 'Fibra' ? form.fiberNeighborhood.trim() : '',
      fiberCity: form.saleType === 'Fibra' ? form.fiberCity.trim() : '',
      fiberInstallationDate: form.saleType === 'Fibra' ? form.fiberInstallationDate : '',
      fiberClientContact: form.saleType === 'Fibra' ? form.fiberClientContact.trim() : '',
      fiberStatus: form.saleType === 'Fibra' ? form.fiberStatus || 'Aprovisionamento' : '',
      fiberCompletionDate: form.saleType === 'Fibra' ? form.fiberCompletionDate : '',
      fiberCancelReason: form.saleType === 'Fibra' ? form.fiberCancelReason.trim() : '',
      fiberRescheduledDate: form.saleType === 'Fibra' ? form.fiberRescheduledDate : '',
    })
  }

  const fieldClass = 'w-full bg-gray-700 p-3 rounded'
  const errorClass = 'mb-2 text-sm text-red-300'
  const accessPlaceholder = form.saleType === 'Fibra' ? 'Contrato' : 'Acesso'

  return (
    <form onSubmit={submit} className="rounded bg-gray-800 p-5">
      <div className="mb-4 border-b border-white/10 pb-4">
        <h3 className="text-xl font-semibold">{submitLabel}</h3>
        <p className="mt-1 text-sm text-gray-400">Preencha os dados comerciais para atualizar metas e comissões.</p>
      </div>
      <input name="saleDate" type="date" value={form.saleDate} onChange={change} className={`${fieldClass} mb-2`} />
      {errors.saleDate && <div className={errorClass}>{errors.saleDate}</div>}
      <input name="saleTime" type="time" value={form.saleTime} disabled className={`${fieldClass} mb-2 cursor-not-allowed opacity-75`} />
      {errors.saleTime && <div className={errorClass}>{errors.saleTime}</div>}
      <input name="customer" placeholder="Cliente" value={form.customer} onChange={change} className={`${fieldClass} mb-2`} />
      {errors.customer && <div className={errorClass}>{errors.customer}</div>}
      <input name="cpf" placeholder="CPF" value={form.cpf} onChange={change} className={`${fieldClass} mb-2`} />
      {errors.cpf && <div className={errorClass}>{errors.cpf}</div>}
      <select name="saleType" value={form.saleType} onChange={change} className={`${fieldClass} mb-2`}>
        {SALE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
      </select>
      {errors.saleType && <div className={errorClass}>{errors.saleType}</div>}
      {form.saleType !== 'Acessórios' && (
        <>
          <input name="access" placeholder={accessPlaceholder} value={form.access} onChange={change} className={`${fieldClass} mb-2`} />
          {errors.access && <div className={errorClass}>{errors.access}</div>}
        </>
      )}
      {form.saleType === 'Portabilidade' && (
        <>
          <input
            name="provisionalNumber"
            placeholder="Número provisório"
            value={form.provisionalNumber}
            onChange={change}
            className={`${fieldClass} mb-2`}
          />
          {errors.provisionalNumber && <div className={errorClass}>{errors.provisionalNumber}</div>}
        </>
      )}
      {form.saleType === 'Aparelhos' && (
        <>
          <select name="deviceSaleMode" value={form.deviceSaleMode} onChange={change} className={`${fieldClass} mb-2`}>
            {DEVICE_SALE_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </select>
          {form.deviceSaleMode === 'Portabilidade' && (
            <>
              <input
                name="provisionalNumber"
                placeholder="Número provisório"
                value={form.provisionalNumber}
                onChange={change}
                className={`${fieldClass} mb-2`}
              />
              {errors.provisionalNumber && <div className={errorClass}>{errors.provisionalNumber}</div>}
            </>
          )}
        </>
      )}
      {form.saleType !== 'Acessórios' && (
        <>
          <select name="plan" value={form.plan} onChange={change} className={`${fieldClass} mb-2`}>
            <option value="">Selecione o plano</option>
            {PLAN_OPTIONS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
          </select>
          {errors.plan && <div className={errorClass}>{errors.plan}</div>}
        </>
      )}
      {form.saleType !== 'Acessórios' && form.saleType !== 'Upgrade' && !isDependentPlan(form.plan) && (
        <>
          <input
            name="planValue"
            type="text"
            inputMode="decimal"
            placeholder="Valor do plano (R$)"
            value={form.planValue}
            onChange={change}
            className={`${fieldClass} mb-2`}
          />
          {errors.planValue && <div className={errorClass}>{errors.planValue}</div>}
        </>
      )}
      {form.saleType === 'Acessórios' && (
        <>
          <input
            name="accessoryName"
            placeholder="Nome do acessório"
            value={form.accessoryName}
            onChange={change}
            className={`${fieldClass} mb-2`}
          />
          {errors.accessoryName && <div className={errorClass}>{errors.accessoryName}</div>}
          <input
            name="accessoryValue"
            type="text"
            inputMode="decimal"
            placeholder="Valor do acessório (R$)"
            value={form.accessoryValue}
            onChange={change}
            className={`${fieldClass} mb-2`}
          />
          {errors.accessoryValue && <div className={errorClass}>{errors.accessoryValue}</div>}
        </>
      )}
      {form.saleType === 'Fibra' && (
        <div className="mb-3 rounded border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-3 text-sm font-semibold text-cyan-100">Dados de instalação</div>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <input
                name="fiberCep"
                placeholder="CEP"
                value={form.fiberCep}
                onChange={change}
                maxLength={8}
                className={`${fieldClass} mb-2`}
              />
              {errors.fiberCep && <div className={errorClass}>{errors.fiberCep}</div>}
            </div>
            <div>
              <input
                name="fiberClientContact"
                placeholder="Contato do cliente"
                value={form.fiberClientContact}
                onChange={change}
                className={`${fieldClass} mb-2`}
              />
              {errors.fiberClientContact && <div className={errorClass}>{errors.fiberClientContact}</div>}
            </div>
            <div className="md:col-span-2">
              <input
                name="fiberInstallationAddress"
                placeholder="Endereço de instalação"
                value={form.fiberInstallationAddress}
                onChange={change}
                className={`${fieldClass} mb-2`}
              />
              {errors.fiberInstallationAddress && <div className={errorClass}>{errors.fiberInstallationAddress}</div>}
            </div>
            <div>
              <input
                name="fiberInstallationNumber"
                placeholder="Número"
                value={form.fiberInstallationNumber}
                onChange={change}
                className={`${fieldClass} mb-2`}
              />
              {errors.fiberInstallationNumber && <div className={errorClass}>{errors.fiberInstallationNumber}</div>}
            </div>
            <input
              name="fiberInstallationComplement"
              placeholder="Complemento"
              value={form.fiberInstallationComplement}
              onChange={change}
              className={`${fieldClass} mb-2`}
            />
            <input
              name="fiberNeighborhood"
              placeholder="Bairro"
              value={form.fiberNeighborhood}
              onChange={change}
              className={`${fieldClass} mb-2`}
            />
            <input
              name="fiberCity"
              placeholder="Cidade automática pelo CEP"
              value={form.fiberCity}
              onChange={change}
              className={`${fieldClass} mb-2`}
            />
            {errors.fiberCity && <div className={errorClass}>{errors.fiberCity}</div>}
            <div>
              <input
                name="fiberInstallationDate"
                type="date"
                value={form.fiberInstallationDate}
                onChange={change}
                className={`${fieldClass} mb-2`}
              />
              {errors.fiberInstallationDate && <div className={errorClass}>{errors.fiberInstallationDate}</div>}
            </div>
          </div>
        </div>
      )}
      {form.saleType === 'Upgrade' && (
        <>
          <input name="previousPlan" placeholder="Plano anterior" value={form.previousPlan} onChange={change} className={`${fieldClass} mb-2`} />
          {errors.previousPlan && <div className={errorClass}>{errors.previousPlan}</div>}
          <select name="addDeviceToUpgrade" value={form.addDeviceToUpgrade} onChange={change} className={`${fieldClass} mb-2`}>
            <option value="Não">Adicionar aparelho: Não</option>
            <option value="Sim">Adicionar aparelho: Sim</option>
          </select>
        </>
      )}
      {(form.saleType === 'Aparelhos' || (form.saleType === 'Upgrade' && form.addDeviceToUpgrade === 'Sim')) && (
        <>
          <input name="deviceModel" placeholder="Modelo" value={form.deviceModel} onChange={change} className={`${fieldClass} mb-2`} />
          {errors.deviceModel && <div className={errorClass}>{errors.deviceModel}</div>}
          <input
            name="deviceValue"
            type="text"
            inputMode="decimal"
            placeholder="Valor do aparelho (R$)"
            value={form.deviceValue}
            onChange={change}
            className={`${fieldClass} mb-2`}
          />
          {errors.deviceValue && <div className={errorClass}>{errors.deviceValue}</div>}
          <input name="imei" placeholder="IMEI" value={form.imei} onChange={change} className={`${fieldClass} mb-2`} />
          {errors.imei && <div className={errorClass}>{errors.imei}</div>}
          <select name="deviceOrigin" value={form.deviceOrigin} onChange={change} className={`${fieldClass} mb-2`}>
            <option value="Loja">Loja</option>
            <option value="TIM">TIM</option>
          </select>
          {errors.deviceOrigin && <div className={errorClass}>{errors.deviceOrigin}</div>}
        </>
      )}
      <select name="dacc" value={form.dacc} onChange={change} className={`${fieldClass} mb-2`}>
        <option value="Não">DACC: Não</option>
        <option value="Sim">DACC: Sim</option>
      </select>
      <select name="insurance" value={form.insurance} onChange={change} className={`${fieldClass} mb-2`}>
        <option value="Não">Seguro: Não</option>
        <option value="Sim">Seguro: Sim</option>
      </select>
      {form.insurance === 'Sim' && (
        <>
          <input
            name="insuranceValue"
            type="text"
            inputMode="decimal"
            placeholder="Valor do seguro (R$)"
            value={form.insuranceValue}
            onChange={change}
            className={`${fieldClass} mb-2`}
          />
          {errors.insuranceValue && <div className={errorClass}>{errors.insuranceValue}</div>}
        </>
      )}
      <select name="status" value={form.status} onChange={change} className={`${fieldClass} mb-4`}>
        <option value="Não">Esteira: Não</option>
        <option value="Sim">Esteira: Sim</option>
      </select>
      <div className="flex gap-2">
        <button type="submit" className="bg-green-600 px-4 py-2.5 rounded font-semibold">{submitLabel === 'Nova venda' ? 'Salvar' : submitLabel}</button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="border border-white/10 bg-white/5 px-4 py-2.5 rounded">Cancelar</button>
        )}
      </div>
    </form>
  )
}
