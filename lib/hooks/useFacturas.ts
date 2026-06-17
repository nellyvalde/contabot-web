'use client'
// lib/hooks/useFacturas.ts
// Centraliza la carga y el CRUD basico de la tabla "facturas" en Supabase.
// Usado por app/documentos/page.tsx (buzon) y app/dashboard/page.tsx (cobrar,
// pagar, alertas, clientes, proveedores) para no duplicar las queries.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useFacturas(userId: string | undefined) {
  const [facturas, setFacturas] = useState<any[]>([])

  const cargarFacturas = async (uid: string) => {
    const { data } = await supabase
      .from('facturas')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    if (data) setFacturas(data)
  }

  useEffect(() => {
    if (userId) cargarFacturas(userId)
  }, [userId])

  const handleEliminar = async (id: string) => {
    if (!confirm('Seguro que deseas eliminar este documento?')) return
    await supabase.from('facturas').delete().eq('id', id)
    if (userId) cargarFacturas(userId)
  }

  const handleEstado = async (id: string, nuevoEstado: string) => {
    await supabase.from('facturas').update({ estado: nuevoEstado }).eq('id', id)
    if (userId) cargarFacturas(userId)
  }

  return { facturas, cargarFacturas, handleEliminar, handleEstado }
}