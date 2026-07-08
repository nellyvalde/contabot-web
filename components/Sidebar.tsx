'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import SelectorEmpresa from '@/components/SelectorEmpresa'
import {
  LayoutDashboard, Inbox, Receipt, ShoppingCart, Users,
  Wallet, CreditCard, Landmark, BarChart2, Bot,
  Settings, AlertTriangle, Building2
} from 'lucide-react'

type MenuItem = {
  id: string
  icon: React.ReactNode
  label: string
  href: string
}

type MenuGroup = {
  titulo: string
  items: MenuItem[]
}

const menuGroups: MenuGroup[] = [
  {
    titulo: 'OPERACIONES',
    items: [
      { id: 'dashboard',  icon: <LayoutDashboard size={16}/>, label: 'Dashboard',    href: '/dashboard' },
      { id: 'documentos', icon: <Inbox size={16}/>,           label: 'Buzón IA',     href: '/documentos' },
      { id: 'revision',  icon: <Bot size={16}/>,              label: 'Revisión IA',  href: '/documentos?vista=revision' },
    ]
  },
  {
    titulo: 'REGISTROS',
    items: [
      { id: 'ventas',    icon: <Receipt size={16}/>,      label: 'Ventas',          href: '/ventas' },
      { id: 'compras',   icon: <ShoppingCart size={16}/>, label: 'Compras y Gastos',href: '/compras' },
      { id: 'nomina',      icon: <Users size={16}/>,        label: 'Nómina',          href: '/nomina' },
    ]
  },
  {
    titulo: 'MONITOREO',
    items: [
      { id: 'alertas',       icon: <AlertTriangle size={16}/>,label: 'Centro de Alertas',  href: '/alertas' },
      { id: 'reportes',      icon: <BarChart2 size={16}/>,    label: 'Reportes Contables', href: '/reportes' },
      { id: 'configuracion', icon: <Settings size={16}/>,     label: 'Configuración',      href: '/configuracion' },
    ]
  },
]

type SidebarProps = {
  user: any
  onLogout: () => void
  alertCount?: number
}

export default function Sidebar({ user, onLogout, alertCount = 0 }: SidebarProps) {
  const pathname = usePathname()

  const activeId = (() => {
    if (pathname === '/nomina') return 'nomina'
    if (pathname === '/documentos') return 'documentos'
    if (pathname === '/bancos') return 'bancos'
    if (pathname === '/cobrar') return 'cobrar'
    if (pathname === '/pagar') return 'pagar'
    if (pathname === '/alertas') return 'alertas'
    if (pathname === '/ventas') return 'ventas'
if (pathname === '/compras') return 'compras'
    if (pathname === '/proveedores') return 'proveedores'
    if (pathname === '/configuracion') return 'configuracion'
    if (pathname === '/dashboard') return 'dashboard'
    return ''
  })()

  // Color activo por sección
  const colorActivo: Record<string, string> = {
    dashboard:   'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    documentos:  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
   ventas:  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
compras: 'bg-red-500/20 text-red-400 border border-red-500/30',
    nomina:      'bg-red-500/20 text-red-400 border border-red-500/30',
    cobrar:      'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    pagar:       'bg-red-500/20 text-red-400 border border-red-500/30',
    bancos:      'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    reportes:    'bg-slate-500/20 text-slate-300 border border-slate-500/30',
    revision:    'bg-slate-500/20 text-slate-300 border border-slate-500/30',
    alertas:     'bg-red-500/20 text-red-400 border border-red-500/30',
  }

  return (
    <aside
      className="w-64 fixed h-full z-10 flex flex-col"
      style={{
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <BarChart2 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white text-sm tracking-tight">ContaBot</h1>
            <p className="text-slate-400 text-xs">Auxiliar Contable IA</p>
          </div>
        </div>
      </div>

      {/* Selector empresa */}
      <div className="pt-2 border-b border-white/[0.06]">
        <SelectorEmpresa />
      </div>

      {/* Navegación agrupada */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
        {menuGroups.map((group) => (
          <div key={group.titulo}>
            <p className="text-[10px] font-semibold text-slate-500 tracking-widest px-3 mb-1.5">
              {group.titulo}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = activeId === item.id
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                      isActive
                        ? colorActivo[item.id] ?? 'bg-emerald-500/20 text-emerald-400'
                        : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                    }`}
                  >
                    <span className={isActive ? '' : 'opacity-60'}>{item.icon}</span>
                    <span className="flex-1 font-medium">{item.label}</span>
                    {item.id === 'alertas' && alertCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">
                        {alertCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Usuario */}
      <div className="px-4 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            {user?.email?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-300 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full text-left text-xs text-slate-500 hover:text-red-400 transition-colors py-1 flex items-center gap-2"
        >
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}