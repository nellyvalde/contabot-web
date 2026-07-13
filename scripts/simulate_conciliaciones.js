// Simulación local de la lógica de borrado en conciliaciones_bancarias
const conciliaciones = [
  { id: 1, empresa_id: 'E1', periodo: '2026-05', estado: 'confirmado' },
  { id: 2, empresa_id: 'E1', periodo: '2026-05', estado: 'no_encontrado' },
  { id: 3, empresa_id: 'E1', periodo: '2026-06', estado: 'confirmado' },
  { id: 4, empresa_id: 'E1', periodo: '2026-06', estado: 'no_encontrado' },
  { id: 5, empresa_id: 'E1', periodo: '2026-06', estado: 'por_confirmar' },
  { id: 6, empresa_id: 'E2', periodo: '2026-06', estado: 'no_encontrado' },
]

console.log('Antes del borrado:')
console.table(conciliaciones)

const empresaActivaId = 'E1'
const periodosAReemplazar = ['2026-06']

// Lógica: borrar registros con empresa_id igual, periodo IN periodosAReemplazar, y estado != 'confirmado'
const resultado = conciliaciones.filter(c => {
  if (c.empresa_id !== empresaActivaId) return true // keep other empresas
  if (!periodosAReemplazar.includes(c.periodo)) return true // keep other periodos
  if (c.estado === 'confirmado') return true // keep confirmed
  return false // delete
})

console.log('\nDespués del borrado (solo afectados los no confirmados de 2026-06 para empresa E1):')
console.table(resultado)

// Verificar que mayo no fue afectado
const mayo = resultado.filter(r => r.empresa_id === empresaActivaId && r.periodo === '2026-05')
console.log(`\nRegistros restantes en 2026-05 para E1: ${mayo.length}`)
// Verificar que confirmados no fueron eliminados
const confirmados = resultado.filter(r => r.empresa_id === empresaActivaId && r.estado === 'confirmado')
console.log(`Registros confirmados para E1: ${confirmados.length}`)
