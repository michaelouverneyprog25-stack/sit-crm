export const validationRules = {
  name: { minLength: 2 },
  password: { minLength: 6, requireNumber: true, requireUpper: true },
  emailRegex: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  roles: ['Administrador','Gestor Master','Gerente','Vendedor']
}
