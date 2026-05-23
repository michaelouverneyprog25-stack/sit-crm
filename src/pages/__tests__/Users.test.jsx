import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Users from '../Users'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'

vi.mock('../../firebase/db', () => ({
  apiRequest: async () => [],
  getUsers: async () => [],
  getStores: async () => [],
}))

describe('Users page', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows validation error when passwords do not match', async () => {
    render(<Users />)
    const name = screen.getByPlaceholderText(/Nome/i)
    const email = screen.getByPlaceholderText(/Email/i)
    const password = screen.getByPlaceholderText(/^Senha$/i)
    const confirm = screen.getByPlaceholderText(/Confirme a senha/i)
    const saveBtn = screen.getByText(/Salvar/i)

    fireEvent.change(name, { target: { value: 'Joao' } })
    fireEvent.change(email, { target: { value: 'joao@example.com' } })
    fireEvent.change(password, { target: { value: 'Abcd12' } })
    fireEvent.change(confirm, { target: { value: 'Mismatch' } })

    fireEvent.click(saveBtn)

    await waitFor(() => expect(screen.getByText(/Confirmação de senha não confere/i)).toBeInTheDocument())
  })
})
