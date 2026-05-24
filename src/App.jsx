import React, { Suspense, lazy, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import RoleRoute from './components/RoleRoute'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import Spinner from './components/Spinner'

const Login = lazy(() => import('./pages/Login'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Sales = lazy(() => import('./pages/Sales'))
const Portabilidades = lazy(() => import('./pages/Portabilidades'))
const Users = lazy(() => import('./pages/Users'))
const Stores = lazy(() => import('./pages/Stores'))
const CommissionRules = lazy(() => import('./pages/CommissionRules'))
const Reports = lazy(() => import('./pages/Reports'))
const AllSalesReport = lazy(() => import('./pages/AllSalesReport'))
const Goals = lazy(() => import('./pages/Goals'))
const FiberViability = lazy(() => import('./pages/FiberViability'))
const FiberContracts = lazy(() => import('./pages/FiberContracts'))

function RouteLoader() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <Spinner />
    </div>
  )
}

export default function App(){
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen text-white">
      <Navbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="flex flex-col md:flex-row">
        <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <Suspense fallback={<RouteLoader />}>
            <Routes>
              <Route path="/login" element={<Login/>} />
              <Route path="/forgot-password" element={<ForgotPassword/>} />
              <Route path="/" element={<ProtectedRoute><Dashboard/></ProtectedRoute>} />
              <Route path="/sales" element={<ProtectedRoute><Sales/></ProtectedRoute>} />
              <Route path="/portabilidades" element={<ProtectedRoute><Portabilidades/></ProtectedRoute>} />
              <Route path="/users" element={<RoleRoute allowedRoles={["Administrador","Gestor Master","Gerente"]}><Users/></RoleRoute>} />
              <Route path="/stores" element={<RoleRoute allowedRoles={["Administrador","Gestor Master"]}><Stores/></RoleRoute>} />
              <Route path="/commission-rules" element={<RoleRoute allowedRoles={["Administrador","Gestor Master"]}><CommissionRules/></RoleRoute>} />
              <Route path="/reports" element={<RoleRoute allowedRoles={["Administrador","Gestor Master","Gerente","Executivo"]}><Reports/></RoleRoute>} />
              <Route path="/reports/all-sales" element={<RoleRoute allowedRoles={["Administrador","Gestor Master","Gerente"]}><AllSalesReport/></RoleRoute>} />
              <Route path="/goals" element={<RoleRoute allowedRoles={["Administrador","Gestor Master","Gerente","Vendedor"]}><Goals/></RoleRoute>} />
              <Route path="/fiber-viability" element={<RoleRoute allowedRoles={["Administrador","Gestor Master","Gerente","Vendedor","Executivo"]}><FiberViability/></RoleRoute>} />
              <Route path="/fiber-contracts" element={<RoleRoute allowedRoles={["Administrador","Gestor Master","Gerente","Vendedor","Executivo"]}><FiberContracts/></RoleRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
