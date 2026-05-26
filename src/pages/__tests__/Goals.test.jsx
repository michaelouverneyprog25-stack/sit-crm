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
  ]),
  getUsers: vi.fn(async () => [
    { uid: 'seller-1', id: 'seller-1', name: 'Ana Vendedora', role: 'Vendedor', storeName: 'Loja Centro', storeCity: 'São Paulo', storeState: 'SP' },
    { uid: 'exec-1', id: 'exec-1', name: 'Bia Executiva', role: 'Executivo', storeName: 'Loja Centro', storeCity: 'São Paulo', storeState: 'SP' },
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

    expect(await screen.findByLabelText('Loja')).toBeInTheDocument()
    expect(screen.getByLabelText('Vendedor')).toBeInTheDocument()
    expect(screen.getByLabelText('Grupo')).toBeInTheDocument()
    expect(screen.getByLabelText('Serviços')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tipo')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(within(screen.getByLabelText('Loja')).getByRole('option', { name: 'Loja Centro' })).toBeInTheDocument()
      expect(within(screen.getByLabelText('Vendedor')).getByRole('option', { name: 'Ana Vendedora' })).toBeInTheDocument()
      expect(within(screen.getByLabelText('Vendedor')).getByRole('option', { name: 'Bia Executiva' })).toBeInTheDocument()
    })
  })

  it('loads store goals and only filters visible service rows on screen', async () => {
    render(<Goals />)

    fireEvent.change(await screen.findByLabelText('Loja'), { target: { value: 'Loja Centro' } })

    await waitFor(() => {
      expect(getGoalsMock).toHaveBeenCalledWith(expect.objectContaining({ storeName: 'Loja Centro' }))
      const table = screen.getByRole('table')
      expect(within(table).getByText('Receita Total')).toBeInTheDocument()
      expect(within(table).getByText('Fibra')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Serviços'), { target: { value: 'Fibra' } })

    const table = screen.getByRole('table')
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
    expect(screen.queryByLabelText('Loja')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Grupo')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Serviços')).toBeInTheDocument()
  })
})
