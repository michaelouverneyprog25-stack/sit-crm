import React from 'react'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import Goals from '../Goals'
import { useAuth } from '../../contexts/AuthContext'

const getGoalsMock = vi.fn(async () => [])

vi.mock('../../firebase/db', () => ({
  addGoal: vi.fn(async () => ({})),
  clearStoreGoalDistribution: vi.fn(async () => ({})),
  distributeStoreGoals: vi.fn(async () => ({ sellersCount: 1 })),
  getCalendar: vi.fn(async () => ({})),
  getGoals: (...args) => getGoalsMock(...args),
  getStores: vi.fn(async () => [
    { id: 'store-1', name: 'Loja Centro', city: 'São Paulo', state: 'SP' },
    { id: 'store-2', name: 'Loja Rio', city: 'Rio de Janeiro', state: 'RJ' },
  ]),
  getUsers: vi.fn(async () => [
    { uid: 'seller-1', id: 'seller-1', name: 'Ana Vendedora', role: 'Vendedor', storeName: 'Loja Centro', storeCity: 'São Paulo', storeState: 'SP' },
    { uid: 'exec-1', id: 'exec-1', name: 'Bia Executiva', role: 'Executivo', storeName: 'Loja Centro', storeCity: 'São Paulo', storeState: 'SP' },
    { uid: 'seller-2', id: 'seller-2', name: 'Carla Rio', role: 'Vendedor', storeName: 'Loja Rio', storeCity: 'Rio de Janeiro', storeState: 'RJ' },
  ]),
  subscribeGoals: vi.fn(() => () => {}),
  updateGoal: vi.fn(async () => ({})),
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

describe('Goals page filters', () => {
  beforeEach(() => {
    getGoalsMock.mockClear()
    useAuth.mockReturnValue({
      currentUser: {
        uid: 'admin-1',
        name: 'Admin',
        role: 'Administrador',
        storeName: '',
        storeCity: '',
        storeState: '',
      },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows goal filters for admin without requiring the old scope selector', async () => {
    render(<Goals />)

    expect(await screen.findByLabelText('Local')).toBeInTheDocument()
    expect(screen.getByLabelText('Loja')).toBeInTheDocument()
    expect(screen.getByLabelText('Vendedor')).toBeInTheDocument()
    expect(screen.getByText('Serviço/Produto')).toBeInTheDocument()
    expect(screen.queryByLabelText('Grupo Econômico')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tipo')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(within(screen.getByLabelText('Local')).getByRole('option', { name: 'São Paulo / SP' })).toBeInTheDocument()
      expect(within(screen.getByLabelText('Loja')).getByRole('option', { name: 'Loja Centro' })).toBeInTheDocument()
      expect(within(screen.getByLabelText('Vendedor')).getByRole('option', { name: 'Ana Vendedora' })).toBeInTheDocument()
      expect(within(screen.getByLabelText('Vendedor')).getByRole('option', { name: 'Bia Executiva' })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Local'), { target: { value: 'São Paulo / SP' } })

    await waitFor(() => {
      expect(within(screen.getByLabelText('Loja')).getByRole('option', { name: 'Loja Centro' })).toBeInTheDocument()
      expect(within(screen.getByLabelText('Loja')).queryByRole('option', { name: 'Loja Rio' })).not.toBeInTheDocument()
      expect(within(screen.getByLabelText('Vendedor')).queryByRole('option', { name: 'Carla Rio' })).not.toBeInTheDocument()
    })
  })

  it('loads store goals and keeps all service rows visible without service filter', async () => {
    render(<Goals />)

    fireEvent.change(await screen.findByLabelText('Loja'), { target: { value: 'Loja Centro' } })

    await waitFor(() => {
      expect(getGoalsMock).toHaveBeenCalledWith(expect.objectContaining({ storeName: 'Loja Centro' }))
      const table = screen.getByRole('table')
      expect(within(table).getByText('Receita Total')).toBeInTheDocument()
      expect(within(table).getByText('Fibra')).toBeInTheDocument()
      expect(within(table).queryByText('Dependentes')).not.toBeInTheDocument()
      expect(within(table).queryByText('Gross')).not.toBeInTheDocument()
      expect(within(table).getByRole('columnheader', { name: 'Projeção' })).toBeInTheDocument()
      expect(within(table).getByRole('columnheader', { name: 'Média atual' })).toBeInTheDocument()
      expect(within(table).getByRole('columnheader', { name: 'Dias úteis' })).toBeInTheDocument()
      expect(within(table).getByRole('columnheader', { name: 'Restante' })).toBeInTheDocument()
      const fibraRow = within(table).getByText('Fibra').closest('tr')
      expect(within(fibraRow).getAllByText(/\b\d{1,2}\b/).length).toBeGreaterThan(0)
    })

    const table = screen.getByRole('table')
    expect(within(table).getByText('Fibra')).toBeInTheDocument()
    expect(within(table).getByText('Receita Total')).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('Todos os serviços'), { target: { value: 'Fibra' } })
    expect(within(table).getByText('Fibra')).toBeInTheDocument()
    expect(within(table).queryByText('Receita Total')).not.toBeInTheDocument()
  })

  it('keeps executive users limited to their own goal filters', async () => {
    useAuth.mockReturnValue({
      currentUser: {
        uid: 'exec-1',
        name: 'Bia Executiva',
        role: 'Executivo',
        storeName: 'Loja Centro',
        storeCity: 'São Paulo',
        storeState: 'SP',
      },
    })

    render(<Goals />)

    expect(await screen.findByLabelText('Vendedor')).toHaveValue('Bia Executiva')
    expect(screen.queryByLabelText('Local')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Loja')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Grupo Econômico')).not.toBeInTheDocument()
    expect(screen.getByText('Serviço/Produto')).toBeInTheDocument()
  })
})
