// Simulación en memoria de la lógica de subida de extracto bancario
// No toca la base de datos; demuestra que los DELETE se limitan por periodo

function resumenPorPeriodo(conciliaciones) {
  const res = {}
  for (const r of conciliaciones) {
    res[r.periodo] = res[r.periodo] || { total: 0, confirmados: 0, no_confirmados: 0 }
    res[r.periodo].total++
    if (r.estado === 'confirmado') res[r.periodo].confirmados++
    else res[r.periodo].no_confirmados++
  }
  return res
}

async function runSimulation() {
  const empresaId = 'emp-123'

  // Estado inicial: conciliaciones para mayo y junio
  let conciliaciones = [
    // Mayo (2026-05)
    { id: 'm1', empresa_id: empresaId, periodo: '2026-05', movimiento_fecha: '2026-05-10', estado: 'no_encontrado' },
    { id: 'm2', empresa_id: empresaId, periodo: '2026-05', movimiento_fecha: '2026-05-20', estado: 'confirmado' },
    // Junio (2026-06)
    { id: 'j1', empresa_id: empresaId, periodo: '2026-06', movimiento_fecha: '2026-06-05', estado: 'no_encontrado' },
    { id: 'j2', empresa_id: empresaId, periodo: '2026-06', movimiento_fecha: '2026-06-15', estado: 'confirmado' },
  ]

  // Tabla periodos (solo tiene mayo actualmente)
  let periodosTable = [
    { empresa_id: empresaId, periodo: '2026-05', cerrado: false }
  ]

  console.log('Estado inicial (por periodo):')
  console.log(JSON.stringify(resumenPorPeriodo(conciliaciones), null, 2))
  console.log('Periodos en tabla:', periodosTable.map(p => p.periodo))

  // Simulamos la subida de extracto para 2026-06
  const periodoSeleccionado = '2026-06'

  // crearOactualizarPeriodo: upsert en periodosTable
  const existing = periodosTable.find(p => p.empresa_id === empresaId && p.periodo === periodoSeleccionado)
  if (!existing) {
    periodosTable.push({ empresa_id: empresaId, periodo: periodoSeleccionado, cerrado: false })
    console.log('\nPeriodo creado en tabla:', periodoSeleccionado)
  }

  // DELETE limitado por periodo: borrar conciliaciones NO confirmadas SOLO de 2026-06
  const antesDelete = conciliaciones.length
  conciliaciones = conciliaciones.filter(c => !(c.empresa_id === empresaId && c.periodo === periodoSeleccionado && c.estado !== 'confirmado'))
  const eliminados = antesDelete - conciliaciones.length
  console.log(`\nEliminadas (no confirmadas) para periodo ${periodoSeleccionado}:`, eliminados)

  console.log('\nEstado tras DELETE por periodo:')
  console.log(JSON.stringify(resumenPorPeriodo(conciliaciones), null, 2))

  // Simulamos el resultado del cruce (nuevo movimiento faltante 2026-05-30 aparece en el extracto de Junio)
  const resultadosCruce = [
    { movimiento: { fecha: '2026-05-30', descripcion: 'Pago X', valor: 100 }, periodoDestino: '2026-06', estadoCruce: 'encontrado', fechaRealOrigen: '2026-05-30' },
    { movimiento: { fecha: '2026-06-20', descripcion: 'Pago Y', valor: 200 }, periodoDestino: '2026-06', estadoCruce: 'no_encontrado', fechaRealOrigen: null },
  ]

  // Antes de insertar, la lógica actualizada borra solo los no_encontrado para los periodos afectados (en este caso 2026-06)
  const periodosAInsertar = Array.from(new Set(resultadosCruce.map(r => r.periodoDestino)))
  conciliaciones = conciliaciones.filter(c => !(c.empresa_id === empresaId && periodosAInsertar.includes(c.periodo) && c.estado === 'no_encontrado'))

  // Insertamos los resultados
  const newRows = resultadosCruce.map((r, idx) => ({
    id: 'new' + idx,
    empresa_id: empresaId,
    periodo: r.periodoDestino,
    movimiento_fecha: r.movimiento.fecha,
    movimiento_descripcion: r.movimiento.descripcion,
    movimiento_valor: r.movimiento.valor,
    estado: r.estadoCruce === 'encontrado' ? 'encontrado' : 'no_encontrado',
    fecha_real_origen: r.fechaRealOrigen || null
  }))
  conciliaciones = conciliaciones.concat(newRows)

  console.log('\nEstado final tras inserción:')
  console.log(JSON.stringify(resumenPorPeriodo(conciliaciones), null, 2))

  // Verificar que confirmados no se duplicaron ni se borraron
  const confirmados = conciliaciones.filter(c => c.estado === 'confirmado')
  console.log('\nEntradas confirmadas (deben estar intactas):', confirmados.map(c => ({ id: c.id, periodo: c.periodo, fecha: c.movimiento_fecha })))

  // Verificar que el selector (union de tablas) muestre ambos periodos
  const periodosDropdown = Array.from(new Set([].concat(periodosTable.map(p => p.periodo), conciliaciones.map(c => c.periodo)))).sort().reverse()
  console.log('\nValores que aparecerán en el selector (periodos):', periodosDropdown)

  // Resultado de la simulación
  return {
    conciliaciones,
    periodosTable,
    periodosDropdown
  }
}

runSimulation().then(() => console.log('\nSimulación completada.'))
