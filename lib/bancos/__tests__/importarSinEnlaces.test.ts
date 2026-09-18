// lib/bancos/__tests__/importarSinEnlaces.test.ts
// Confirmacion MECANICA (no solo descriptiva) de las condiciones de
// aprobacion de los Bloques A y B: cero enlaces desde /bancos o el
// Sidebar, cero RPC, cero escritura, cero IA, .xls retirado. Estas
// pruebas leen el codigo fuente real (este repo no tiene jsdom/React
// Testing Library, ver vitest.config.ts), mismo estilo que
// paginaBancosSinRutaDestructiva.test.ts e identidadVigenteEnPaginas.test.ts.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

function leer(rutaRelativa: string): string {
  return readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), rutaRelativa), 'utf-8')
}

describe('app/bancos/importar -- Bloques A y B, sin enlazar (Bloques C y D requieren nueva aprobación)', () => {
  it('app/bancos/page.tsx no enlaza a /bancos/importar', () => {
    const pagina = leer('../../../app/bancos/page.tsx')
    expect(pagina).not.toMatch(/bancos\/importar/)
  })

  it('components/Sidebar.tsx (el Sidebar real, resuelto por el alias @/components/Sidebar) no enlaza a /bancos/importar', () => {
    const sidebar = leer('../../../components/Sidebar.tsx')
    expect(sidebar).not.toMatch(/bancos\/importar/)
  })

  it('app/bancos/importar/page.tsx no hace ninguna llamada RPC (.rpc() del cliente Supabase) -- Bloque C no implementado todavía', () => {
    // Nota: el archivo SÍ puede mencionar "iniciar_o_reintentar_importacion"
    // en un comentario explicando qué falta -- lo que se prohíbe aquí es la
    // llamada real (`.rpc(`), no el nombre en prosa.
    const importar = leer('../../../app/bancos/importar/page.tsx')
    expect(importar).not.toMatch(/\.rpc\(/)
  })

  it('app/bancos/importar/page.tsx nunca escribe -- sin insert/update/delete/upsert contra Supabase', () => {
    const importar = leer('../../../app/bancos/importar/page.tsx')
    expect(importar).not.toMatch(/\.insert\(/)
    expect(importar).not.toMatch(/\.update\(/)
    expect(importar).not.toMatch(/\.delete\(/)
    expect(importar).not.toMatch(/\.upsert\(/)
  })

  it('el input de archivo solo acepta .xlsx y .csv -- .xls fue retirado de este MVP', () => {
    const importar = leer('../../../app/bancos/importar/page.tsx')
    const accept = importar.match(/accept="([^"]*)"/)
    expect(accept).not.toBeNull()
    expect(accept![1]).toBe('.xlsx,.csv')
    expect(accept![1]).not.toMatch(/\.xls\b/)
  })

  it('lib/bancos/obtenerCuentasBancarias.ts es de solo lectura: usa .select(, nunca escribe ni llama a una RPC', () => {
    const archivo = leer('../obtenerCuentasBancarias.ts')
    expect(archivo).toMatch(/\.select\(/)
    expect(archivo).not.toMatch(/\.insert\(/)
    expect(archivo).not.toMatch(/\.update\(/)
    expect(archivo).not.toMatch(/\.delete\(/)
    expect(archivo).not.toMatch(/\.upsert\(/)
    expect(archivo).not.toMatch(/\.rpc\(/)
  })

  it('lib/bancos/parsearExtractoAvVillas.ts no importa Supabase ni hace ninguna llamada de red', () => {
    const archivo = leer('../parsearExtractoAvVillas.ts')
    expect(archivo).not.toMatch(/from '@\/lib\/supabase'/)
    expect(archivo).not.toMatch(/\.rpc\(/)
    expect(archivo).not.toMatch(/fetch\(/)
  })

  it('no se usa ninguna IA (Anthropic/OpenAI/Claude) en el parser ni en la página de importar', () => {
    const importar = leer('../../../app/bancos/importar/page.tsx')
    const parser = leer('../parsearExtractoAvVillas.ts')
    for (const codigo of [importar, parser]) {
      expect(codigo).not.toMatch(/anthropic/i)
      expect(codigo).not.toMatch(/openai/i)
      expect(codigo).not.toMatch(/claude-/i)
    }
  })

  it('el parser no admite la extensión .pdf -- PDF queda fuera de alcance de este MVP (el nombre "pdf" sí puede aparecer en comentarios explicando por qué)', () => {
    const parser = leer('../parsearExtractoAvVillas.ts')
    const listaExtensiones = parser.match(/EXTENSIONES_PERMITIDAS = \[[^\]]*\]/)
    expect(listaExtensiones).not.toBeNull()
    expect(listaExtensiones![0]).not.toMatch(/\.pdf/i)
    expect(parser).not.toMatch(/pdfjs/i)
  })

  it('el parser no importa lib/bancos/config.ts -- no reutiliza ni modifica BANCOS.av_villas (esa entrada describe el PDF legacy, no este parser XLSX/CSV)', () => {
    const parser = leer('../parsearExtractoAvVillas.ts')
    expect(parser).not.toMatch(/from '\.\/config'/)
    expect(parser).not.toMatch(/from '@\/lib\/bancos\/config'/)
  })
})

describe('app/bancos/importar/page.tsx -- invalidación sincrónica de la clave vigente (corrección de revisión)', () => {
  function extraerFuncion(pagina: string, nombre: string): string {
    const inicio = pagina.indexOf(`const ${nombre} = `)
    expect(inicio, `no se encontró la función ${nombre}`).toBeGreaterThanOrEqual(0)
    const resto = pagina.slice(inicio)
    const fin = resto.search(/\n {2}\}/)
    expect(fin, `no se pudo delimitar el cuerpo de ${nombre}`).toBeGreaterThanOrEqual(0)
    return resto.slice(0, fin)
  }

  it('handleArchivoSeleccionado invalida consultaArchivoRef ANTES de llamar a validarArchivoAntesDeLeer -- no solo dentro de ejecutarSiVigente', () => {
    const pagina = leer('../../../app/bancos/importar/page.tsx')
    const cuerpo = extraerFuncion(pagina, 'handleArchivoSeleccionado')

    const indiceInvalidacion = cuerpo.indexOf('consultaArchivoRef.current = clave')
    const indiceValidacion = cuerpo.indexOf('validarArchivoAntesDeLeer(')

    expect(indiceInvalidacion, 'no se encontró la invalidación sincrónica de consultaArchivoRef').toBeGreaterThanOrEqual(0)
    expect(indiceValidacion, 'no se encontró la llamada a validarArchivoAntesDeLeer').toBeGreaterThanOrEqual(0)
    expect(indiceInvalidacion).toBeLessThan(indiceValidacion)
  })

  it('handleCuentaSeleccionada invalida consultaArchivoRef de forma sincrónica al cambiar de cuenta', () => {
    const pagina = leer('../../../app/bancos/importar/page.tsx')
    const cuerpo = extraerFuncion(pagina, 'handleCuentaSeleccionada')
    expect(cuerpo).toMatch(/consultaArchivoRef\.current = ''/)
  })
})

describe('app/bancos/importar/page.tsx -- previsualización de valores (corrección de revisión)', () => {
  it('la celda de Valor NUNCA usa Math.round -- los centavos no se descartan en la previsualización', () => {
    const pagina = leer('../../../app/bancos/importar/page.tsx')
    expect(pagina).not.toMatch(/Math\.round/)
  })

  it('la celda de Valor usa formatearValorMoneda (formateador puro, con dos decimales exactos)', () => {
    const pagina = leer('../../../app/bancos/importar/page.tsx')
    expect(pagina).toMatch(/\{formatearValorMoneda\(m\.valor\)\}/)
    expect(pagina).toMatch(/from '@\/lib\/bancos\/formatearValorMoneda'/)
  })
})
