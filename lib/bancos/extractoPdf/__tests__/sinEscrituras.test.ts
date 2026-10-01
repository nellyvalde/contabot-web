// lib/bancos/extractoPdf/__tests__/sinEscrituras.test.ts
// Confirmación MECÁNICA (lee el código fuente real de cada archivo del
// módulo) de que lib/bancos/extractoPdf/ -- todo el módulo, Fases 1-4 --
// no contiene ninguna llamada RPC ni de escritura contra Supabase, ni
// importa Supabase, IA generativa, ni el parser XLSX/CSV existente.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dirModulo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const archivosProduccion = readdirSync(dirModulo).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))

describe('lib/bancos/extractoPdf -- confirmación mecánica de cero escrituras/RPC/IA', () => {
  it('hay al menos un archivo de producción para revisar (evita que el test pase vacío por error)', () => {
    expect(archivosProduccion.length).toBeGreaterThanOrEqual(10)
  })

  for (const archivo of archivosProduccion) {
    it(`${archivo} -- sin .rpc(, .insert(, .update(, .delete(, .upsert(`, () => {
      const codigo = readFileSync(path.join(dirModulo, archivo), 'utf-8')
      expect(codigo).not.toMatch(/\.rpc\(/)
      expect(codigo).not.toMatch(/\.insert\(/)
      expect(codigo).not.toMatch(/\.update\(/)
      expect(codigo).not.toMatch(/\.delete\(/)
      expect(codigo).not.toMatch(/\.upsert\(/)
    })

    it(`${archivo} -- no importa Supabase ni el parser XLSX/CSV existente`, () => {
      const codigo = readFileSync(path.join(dirModulo, archivo), 'utf-8')
      expect(codigo).not.toMatch(/from '@\/lib\/supabase'/)
      expect(codigo).not.toMatch(/from '@\/lib\/bancos\/parsearExtractoAvVillas'/)
      expect(codigo).not.toMatch(/from '\.\.\/parsearExtractoAvVillas'/)
    })

    it(`${archivo} -- sin IA (Anthropic/OpenAI/Claude) ni tesseract.js`, () => {
      const codigo = readFileSync(path.join(dirModulo, archivo), 'utf-8')
      expect(codigo).not.toMatch(/anthropic/i)
      expect(codigo).not.toMatch(/openai/i)
      expect(codigo).not.toMatch(/claude-/i)
      expect(codigo).not.toMatch(/tesseract/i)
    })
  }

  it('ningún archivo de producción llama a page.render() ni getOperatorList() (nunca renderiza páginas como imagen)', () => {
    for (const archivo of archivosProduccion) {
      const codigo = readFileSync(path.join(dirModulo, archivo), 'utf-8')
      expect(codigo).not.toMatch(/\.render\(/)
      expect(codigo).not.toMatch(/getOperatorList/)
    }
  })

  it('package.json de la rama no agrega tesseract.js ni ninguna dependencia nueva', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(dirModulo, '../../../package.json'), 'utf-8'))
    const todas = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(Object.keys(todas).some(k => k.toLowerCase().includes('tesseract'))).toBe(false)
  })
})
