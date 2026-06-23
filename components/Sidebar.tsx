'use client'
// components/Sidebar.tsx
// Barra lateral compartida por todas las paginas.

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

const menuItems = [
  { id: 'dashboard',     icon: '📊', label: 'Dashboard',          href: '/dashboard' },
  { id: 'documentos',    icon: '📄', label: 'Documentos',         href: '/documentos' },
  { id: 'nomina',        icon: '🧾', label: 'Nomina',             href: '/nomina' },
  { id: 'cobrar',        icon: '💰', label: 'Cuentas por Cobrar', href: '/cobrar' },
  { id: 'pagar',         icon: '💳', label: 'Cuentas por Pagar',  href: '/pagar' },
  { id: 'alertas',       icon: '⚠️', label: 'Centro de Alertas',  href: '/alertas' },
  { id: 'revision',      icon: '🤖', label: 'Revision IA',        href: '/documentos?vista=revision' },
  { id: 'clientes',      icon: '👥', label: 'Clientes',           href: '/clientes' },
  { id: 'proveedores',   icon: '🏭', label: 'Proveedores',        href: '/dashboard?seccion=proveedores' },
  { id: 'bancos',        icon: '🏦', label: 'Conciliacion Bancaria', href: '/bancos' },
  { id: 'reportes',      icon: '📈', label: 'Reportes',           href: '/reportes' },
  { id: 'configuracion', icon: '⚙️', label: 'Configuracion',      href: '/configuracion' },
]

type SidebarProps = {
  user: any
  onLogout: () => void
  alertCount?: number
}

export default function Sidebar({ user, onLogout, alertCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeId = (() => {
    if (pathname === '/documentos') {
      return searchParams.get('vista') === 'revision' ? 'revision' : 'documentos'
    }
    if (pathname === '/nomina') return 'nomina'
    if (pathname === '/reportes') return 'reportes'
    if (pathname === '/bancos') return 'bancos'
    if (pathname === '/cobrar') return 'cobrar'
if (pathname === '/pagar') return 'pagar'
if (pathname === '/alertas') return 'alertas'
if (pathname === '/clientes') return 'clientes'
if (pathname === '/proveedores') return 'proveedores'
if (pathname === '/configuracion') return 'configuracion'
if (pathname === '/dashboard') return 'dashboard'
    return ''
  })()

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full z-10">
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-sm">📊</div>
          <div>
            <h1 className="font-bold text-white text-sm">ContaBot</h1>
            <p className="text-slate-400 text-xs">Auxiliar Contable IA</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {menuItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
              activeId === item.id ? 'bg-emerald-500 text-white font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span>{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.id === 'alertas' && alertCount > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{alertCount}</span>
            )}
          </Link>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-slate-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center text-xs">
            {user?.email?.[0]?.toUpperCase()}
          </div>
          <p className="text-xs text-white truncate flex-1">{user?.email}</p>
        </div>
        <button
          onClick={onLogout}
          className="w-full text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors"
        >
          Cerrar sesion
        </button>
      </div>
    </aside>
  )
}