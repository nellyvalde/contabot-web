import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Estas paginas ('use client', sin jsdom/React Testing Library en este
// repo -- ver vitest.config.ts) no se pueden renderizar en pruebas, asi
// que el unico modo de verificar dos garantias especificas de la
// arquitectura -- (a) los refs de identidad vigente se actualizan con
// useLayoutEffect y no con useEffect, y (b) el reinicio al cambiar/quitar
// empresa deja `cargando` en false -- es leer el codigo fuente real,
// mismo estilo que paginaBancosSinRutaDestructiva.test.ts.
//
// Por que useLayoutEffect y no useEffect: useEffect es un efecto PASIVO,
// programado para correr despues de que el navegador pinta, sin garantia
// de que corra antes de que una promesa pendiente (una respuesta de
// Supabase, una RPC) continue su .then(). useLayoutEffect corre de forma
// SINCRONICA durante el commit, antes de que React devuelva el control al
// event loop -- es la unica de las dos que realmente cierra el hueco de
// vigencia que motiva este ref (ver ejecutarSiVigente en
// lib/bancos/consultaVigente.ts).
function leer(rutaRelativa: string): string {
  return readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), rutaRelativa),
    'utf-8'
  )
}

const paginaBancos = leer('../../../app/bancos/page.tsx')
const paginaReporteContable = leer('../../../app/bancos/reporte-contable/page.tsx')

describe('identidad vigente en app/bancos/page.tsx -- useLayoutEffect, nunca useEffect', () => {
  it('importa useLayoutEffect de react', () => {
    expect(paginaBancos).toMatch(/import\s*\{[^}]*\buseLayoutEffect\b[^}]*\}\s*from\s*'react'/)
  })

  it('actualiza empresaIdRenderizadoRef y periodoSeleccionadoRenderizadoRef dentro de un useLayoutEffect', () => {
    const bloque = paginaBancos.match(/useLayoutEffect\(\(\) => \{[\s\S]*?\}\)/)
    expect(bloque).not.toBeNull()
    expect(bloque![0]).toMatch(/empresaIdRenderizadoRef\.current = empresaActiva\?\.id/)
    expect(bloque![0]).toMatch(/periodoSeleccionadoRenderizadoRef\.current = periodoSeleccionado/)
  })

  it('esos dos refs nunca se escriben fuera del useLayoutEffect (ni durante el render, ni en un useEffect distinto) -- las comparaciones de esVigente (===) no cuentan como escritura', () => {
    // `(?!=)` excluye deliberadamente `===`/`!==` (lecturas de esVigente):
    // solo cuenta una asignacion real de un solo `=`.
    const asignaciones = paginaBancos.match(/(empresaIdRenderizadoRef|periodoSeleccionadoRenderizadoRef)\.current\s*=(?!=)/g) || []
    // Las unicas 2 asignaciones esperadas son las que ya se verificaron
    // arriba, dentro del bloque useLayoutEffect.
    expect(asignaciones.length).toBe(2)
  })
})

describe('identidad vigente en app/bancos/reporte-contable/page.tsx -- useLayoutEffect, nunca useEffect', () => {
  it('importa useLayoutEffect de react', () => {
    expect(paginaReporteContable).toMatch(/import\s*\{[^}]*\buseLayoutEffect\b[^}]*\}\s*from\s*'react'/)
  })

  it('actualiza empresaIdRenderizadoRef y periodoContableRenderizadoRef dentro de un useLayoutEffect', () => {
    const bloque = paginaReporteContable.match(/useLayoutEffect\(\(\) => \{[\s\S]*?\}\)/)
    expect(bloque).not.toBeNull()
    expect(bloque![0]).toMatch(/empresaIdRenderizadoRef\.current = empresaActiva\?\.id/)
    expect(bloque![0]).toMatch(/periodoContableRenderizadoRef\.current = periodoContable/)
  })

  it('esos dos refs nunca se escriben fuera del useLayoutEffect -- las comparaciones de esVigente (===) no cuentan como escritura', () => {
    const asignaciones = paginaReporteContable.match(/(empresaIdRenderizadoRef|periodoContableRenderizadoRef)\.current\s*=(?!=)/g) || []
    expect(asignaciones.length).toBe(2)
  })

  it('al cambiar o quitar la empresa activa, reinicia cargando a false -- una carga descartada de la empresa anterior no puede dejar el spinner pegado', () => {
    const bloque = paginaReporteContable.match(/if \(empresaActiva\?\.id !== empresaReflejada\) \{[\s\S]*?\n {2}\}/)
    expect(bloque).not.toBeNull()
    expect(bloque![0]).toMatch(/setCargando\(false\)/)
  })
})
