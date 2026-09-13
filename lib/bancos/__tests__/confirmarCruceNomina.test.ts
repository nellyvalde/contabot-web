import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { confirmarCruceNomina, type ParametrosConfirmarCruceNomina } from '../confirmarCruceNomina'
import type { ResultadoAbono } from '@/lib/nomina/abonos'

const params: ParametrosConfirmarCruceNomina = {
  empresaId: 'empresa-1',
  obligacionId: 42,
  valorAbonado: 100000,
  fechaAbono: '2026-07-15',
  referencia: 'banco:empresa-1:2026-07-15:PAGO NOMINA:100000',
  observaciones: 'PAGO NOMINA',
}

describe('confirmarCruceNomina', () => {
  let spy: ReturnType<typeof vi.spyOn>
  beforeEach(() => { spy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => { spy.mockRestore() })

  it('registrarAbono ok:false NO marca el cruce como confirmado, y nunca expone el error crudo', async () => {
    const registrar = vi.fn(async (): Promise<ResultadoAbono> => ({ ok: false, error: 'duplicate key value violates unique constraint "abonos_pkey"' }))
    const resultado = await confirmarCruceNomina(params, registrar)

    expect(resultado.confirmado).toBe(false)
    if (!resultado.confirmado) {
      expect(resultado.mensaje).not.toContain('duplicate key value')
      expect(resultado.mensaje).not.toContain('constraint')
    }
  })

  it('un rechazo inesperado (promesa que lanza) no produce un rechazo no controlado -- se captura y se devuelve como no confirmado', async () => {
    const registrar = vi.fn(async (): Promise<ResultadoAbono> => { throw new Error('network error') })
    await expect(confirmarCruceNomina(params, registrar)).resolves.toEqual(
      expect.objectContaining({ confirmado: false })
    )
  })

  it('ok:true, duplicado:false -- marca el cruce como confirmado (abono nuevo)', async () => {
    const registrar = vi.fn(async (): Promise<ResultadoAbono> => ({ ok: true, duplicado: false, saldoPendiente: 0, estado: 'Pagado' }))
    const resultado = await confirmarCruceNomina(params, registrar)
    expect(resultado).toEqual({ confirmado: true })
  })

  it('ok:true, duplicado:true -- comportamiento idempotente elegido: tambien marca el cruce como confirmado, sin registrar un segundo abono', async () => {
    const registrar = vi.fn(async (): Promise<ResultadoAbono> => ({ ok: true, duplicado: true }))
    const resultado = await confirmarCruceNomina(params, registrar)
    expect(resultado).toEqual({ confirmado: true })
    expect(registrar).toHaveBeenCalledTimes(1)
  })
})
