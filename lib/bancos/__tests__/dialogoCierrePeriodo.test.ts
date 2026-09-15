// lib/bancos/__tests__/dialogoCierrePeriodo.test.ts
// Regresion del incidente de julio 2026: un solo clic en "Cerrar periodo"
// cerraba el periodo sin ninguna confirmacion. app/bancos/page.tsx es un
// componente 'use client' y este repo no tiene jsdom/React Testing
// Library (ver vitest.config.ts), asi que no se puede renderizar ni
// disparar clics reales -- las garantias de COMPORTAMIENTO asincrono
// (confirmar llama una vez, doble clic llama una vez, error deja el
// periodo abierto, identidad obsoleta se descarta) ya estan cubiertas
// conductualmente en accionExclusiva.test.ts y
// confirmarCierrePeriodoFlujo.test.ts, con retrasos reales via setTimeout
// y sin necesitar React. Lo que este archivo verifica -- leyendo el
// codigo fuente real, mismo estilo que paginaBancosSinRutaDestructiva.test.ts
// e identidadVigenteEnPaginas.test.ts -- es que esas piezas puras estan
// efectivamente CABLEADAS en la UI de la forma que el hotfix exige: el
// clic inicial solo abre el dialogo, Cancelar/Escape/X nunca escriben, el
// dialogo se cierra solo si la empresa o el periodo cambian, y los
// atributos de accesibilidad y los textos requeridos estan presentes.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

function leer(rutaRelativa: string): string {
  return readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), rutaRelativa),
    'utf-8'
  )
}

const pagina = leer('../../../app/bancos/page.tsx')

function extraerFuncion(nombre: string): string {
  const patron = new RegExp(`const ${nombre} = (?:async )?\\([^)]*\\) => \\{`)
  const inicio = pagina.search(patron)
  expect(inicio, `no se encontro la funcion ${nombre}`).toBeGreaterThanOrEqual(0)
  // Recorta desde el inicio del cuerpo hasta la linea `}` que cierra la
  // funcion al mismo nivel de indentacion de 2 espacios (todas las
  // funciones del componente estan indentadas asi).
  const resto = pagina.slice(inicio)
  const fin = resto.search(/\n {2}\}/)
  expect(fin, `no se pudo delimitar el cuerpo de ${nombre}`).toBeGreaterThanOrEqual(0)
  return resto.slice(0, fin)
}

describe('boton "Cerrar periodo" -- un clic solo abre el dialogo, nunca escribe', () => {
  it('el boton que dispara el flujo llama a abrirConfirmacionCierre, no a cerrarPeriodoBancario/cerrarPeriodoExclusivo directamente', () => {
    expect(pagina).toMatch(/<button onClick=\{abrirConfirmacionCierre\}[^>]*>\s*Cerrar periodo/)
  })

  it('abrirConfirmacionCierre nunca llama a cerrarPeriodoBancario ni a cerrarPeriodoExclusivo', () => {
    const cuerpo = extraerFuncion('abrirConfirmacionCierre')
    expect(cuerpo).not.toMatch(/cerrarPeriodoBancario\(/)
    expect(cuerpo).not.toMatch(/cerrarPeriodoExclusivo\(/)
  })
})

describe('Cancelar / Escape / boton X -- cierran el dialogo sin escribir', () => {
  it('cancelarConfirmacionCierre nunca llama a cerrarPeriodoBancario ni a cerrarPeriodoExclusivo', () => {
    const cuerpo = extraerFuncion('cancelarConfirmacionCierre')
    expect(cuerpo).not.toMatch(/cerrarPeriodoBancario\(/)
    expect(cuerpo).not.toMatch(/cerrarPeriodoExclusivo\(/)
  })

  it('el boton "Cancelar" y el boton X llaman a cancelarConfirmacionCierre', () => {
    const ocurrencias = pagina.match(/onClick=\{cancelarConfirmacionCierre\}/g) || []
    // Uno para el boton X (aria-label="Cerrar") y otro para "Cancelar".
    expect(ocurrencias.length).toBe(2)
  })

  it('el manejador de Escape (onCancel del <dialog>) nunca escribe -- como mucho evita el cierre nativo mientras hay una escritura en curso', () => {
    const bloque = pagina.match(/onCancel=\{[^}]*\}/)
    expect(bloque).not.toBeNull()
    expect(bloque![0]).not.toMatch(/cerrarPeriodoBancario\(/)
    expect(bloque![0]).not.toMatch(/cerrarPeriodoExclusivo\(/)
  })

  it('el manejador onClose del <dialog> (se dispara al cerrar por cualquier via nativa) nunca escribe, solo sincroniza estado', () => {
    const bloque = pagina.match(/onClose=\{[^}]*\}/)
    expect(bloque).not.toBeNull()
    expect(bloque![0]).not.toMatch(/cerrarPeriodoBancario\(/)
    expect(bloque![0]).not.toMatch(/cerrarPeriodoExclusivo\(/)
    expect(bloque![0]).toMatch(/setMostrarConfirmacionCierre\(false\)/)
  })
})

describe('confirmarCierrePeriodo -- unica via que dispara la escritura, protegida por crearAccionExclusiva', () => {
  it('confirmarCierrePeriodo llama a cerrarPeriodoExclusivo (el wrapper de crearAccionExclusiva), no a cerrarPeriodoBancario directamente', () => {
    const cuerpo = extraerFuncion('confirmarCierrePeriodo')
    expect(cuerpo).toMatch(/cerrarPeriodoExclusivo\(/)
    expect(cuerpo).not.toMatch(/(?<!Exclusivo\.current = \()cerrarPeriodoBancario\(/)
  })

  it('cerrarPeriodoExclusivo se construye envolviendo cerrarPeriodoBancario con crearAccionExclusiva', () => {
    const inicio = pagina.indexOf('const cerrarPeriodoExclusivo = useRef(')
    expect(inicio).toBeGreaterThanOrEqual(0)
    const bloque = pagina.slice(inicio, pagina.indexOf(').current', inicio))
    expect(bloque).toMatch(/crearAccionExclusiva\(/)
    expect(bloque).toMatch(/cerrarPeriodoBancario\(/)
  })

  it('el boton "Si, cerrar periodo" llama a confirmarCierrePeriodo', () => {
    expect(pagina).toMatch(/onClick=\{confirmarCierrePeriodo\}/)
  })
})

describe('mientras se procesa: ambos botones deshabilitados y "Cerrando..."', () => {
  it('el boton Cancelar y el boton "Si, cerrar periodo" estan deshabilitados con disabled={cerrandoPeriodo}', () => {
    const ocurrencias = pagina.match(/disabled=\{cerrandoPeriodo\}/g) || []
    // Cancelar, boton X, y el boton de confirmar -- los 3 controles del
    // dialogo quedan deshabilitados mientras se procesa.
    expect(ocurrencias.length).toBeGreaterThanOrEqual(3)
  })

  it('el boton de confirmar muestra "Cerrando..." mientras cerrandoPeriodo es true', () => {
    expect(pagina).toMatch(/\{cerrandoPeriodo \? 'Cerrando…' : 'Sí, cerrar periodo'\}/)
  })
})

describe('contenido y accesibilidad del dialogo', () => {
  it('usa el elemento <dialog> nativo con aria-labelledby y aria-describedby', () => {
    expect(pagina).toMatch(/<dialog[\s\S]*?aria-labelledby="titulo-confirmar-cierre-periodo"[\s\S]*?aria-describedby="descripcion-confirmar-cierre-periodo"/)
  })

  it('muestra el nombre de la empresa activa y el periodo que se va a cerrar', () => {
    expect(pagina).toMatch(/\{formatearPeriodo\(periodoModalCierre\)\}/)
    expect(pagina).toMatch(/\{empresaModalCierre\.nombre\}/)
  })

  it('advierte que el periodo quedara bloqueado para cambios', () => {
    expect(pagina).toMatch(/quedará bloqueado para cambios/)
  })

  it('"Cancelar" tiene foco inicial (autoFocus) y aparece antes que el boton destructivo en el marcado', () => {
    const indiceCancelar = pagina.indexOf('Cancelar')
    const indiceConfirmar = pagina.indexOf('Sí, cerrar periodo')
    expect(indiceCancelar).toBeGreaterThan(0)
    expect(indiceConfirmar).toBeGreaterThan(indiceCancelar)

    const botonCancelar = pagina.slice(pagina.lastIndexOf('<button', indiceCancelar), indiceCancelar)
    expect(botonCancelar).toMatch(/autoFocus/)
  })

  it('el boton "Si, cerrar periodo" usa un color de accion destructiva (rojo) claramente distinto de Cancelar', () => {
    const indiceConfirmar = pagina.indexOf('Sí, cerrar periodo')
    const botonConfirmar = pagina.slice(pagina.lastIndexOf('<button', indiceConfirmar), indiceConfirmar)
    expect(botonConfirmar).toMatch(/bg-red-600/)

    const indiceCancelar = pagina.indexOf('>Cancelar<')
    const botonCancelar = pagina.slice(pagina.lastIndexOf('<button', indiceCancelar), indiceCancelar)
    expect(botonCancelar).not.toMatch(/bg-red-600/)
  })

  it('al exito, el mensaje visible sigue el formato "Periodo [mes/año] cerrado"', () => {
    expect(pagina).toMatch(/`Periodo \$\{formatearPeriodo\(periodo\)\} cerrado\.`/)
  })

  it('la etiqueta visual del periodo sigue alternando entre "Periodo cerrado" y "Periodo abierto" segun periodoCerrado', () => {
    expect(pagina).toMatch(/\{periodoCerrado \? 'Periodo cerrado' : 'Periodo abierto'\}/)
  })

  it('un error muestra el mensaje controlado dentro del dialogo con role="alert"', () => {
    expect(pagina).toMatch(/role="alert"[^>]*>\{errorConfirmacionCierre\}/)
  })
})

describe('cambiar empresa o periodo con el dialogo abierto -- se cancela solo', () => {
  it('existe un bloque de render que cierra el dialogo si empresaActiva o periodoSeleccionado ya no coinciden con los capturados al abrirlo', () => {
    const bloque = pagina.match(/if \(\s*mostrarConfirmacionCierre[\s\S]*?setErrorConfirmacionCierre\(''\)\s*\n\s*\}/)
    expect(bloque).not.toBeNull()
    expect(bloque![0]).toMatch(/empresaActiva\?\.id !== empresaModalCierre\.id/)
    expect(bloque![0]).toMatch(/periodoSeleccionado !== periodoModalCierre/)
    expect(bloque![0]).toMatch(/setMostrarConfirmacionCierre\(false\)/)
  })

  it('ese bloque de auto-cierre esta ANTES de que se actualicen (via useLayoutEffect) los refs de identidad vigente -- no depende de ellos, depende directamente de empresaActiva/periodoSeleccionado ya renderizados', () => {
    const indiceBloqueCierre = pagina.indexOf('mostrarConfirmacionCierre &&')
    const indiceUseLayoutEffect = pagina.indexOf('useLayoutEffect(() => {')
    expect(indiceBloqueCierre).toBeGreaterThan(0)
    expect(indiceUseLayoutEffect).toBeGreaterThan(0)
    expect(indiceBloqueCierre).toBeLessThan(indiceUseLayoutEffect)
  })
})

describe('no se agrega funcion de reabrir periodos', () => {
  it('no existe ninguna funcion, boton, ni texto de UI para reabrir un periodo cerrado', () => {
    // No se prohibe la palabra "reabrir" en comentarios que hablen de NO
    // agregar esa funcion -- se verifica que no exista un identificador de
    // funcion, ni un boton/texto visible al usuario, que implemente reabrir.
    expect(pagina).not.toMatch(/function\s+reabrir/i)
    expect(pagina).not.toMatch(/const\s+reabrir\w*\s*=/i)
    expect(pagina).not.toMatch(/>\s*Reabrir/i)
    expect(pagina).not.toMatch(/aria-label="Reabrir/i)
  })

  it('setPeriodoCerrado(false) solo aparece en el reinicio por cambio de empresa, nunca en un flujo disparado por un boton del usuario', () => {
    const ocurrencias = pagina.match(/setPeriodoCerrado\(false\)/g) || []
    // La unica aparicion es la del bloque de reinicio al cambiar de
    // empresa (ver identidadVigenteEnPaginas.test.ts / el bloque
    // `empresaReflejada` de mas arriba en este mismo archivo).
    expect(ocurrencias.length).toBe(1)
  })
})
