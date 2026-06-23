// lib/bancos/config.ts
// Configuracion de formatos de extractos por banco.
// Para agregar un nuevo banco, solo agrega una entrada aqui sin tocar el resto del codigo.

export type BancoConfig = {
  nombre: string
  tipo: 'pdf' | 'excel' | 'csv'
  columnaFecha: string
  columnaDescripcion: string
  columnaValor: string
  columnaDebito?: string
  columnaCredito?: string
  formatoFecha: string // 'YYYY/MM/DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY'
  separadorMiles?: string
  simboloMoneda?: string
}

export const BANCOS: Record<string, BancoConfig> = {
  av_villas: {
    nombre: 'AV Villas',
    tipo: 'pdf',
    columnaFecha: 'FECHA',
    columnaDescripcion: 'DESCRIPCIÓN TRANSACCIÓN',
    columnaValor: 'VALOR',
    formatoFecha: 'YYYY/MM/DD',
    separadorMiles: '.',
    simboloMoneda: '$',
  },
  bancolombia: {
    nombre: 'Bancolombia',
    tipo: 'excel',
    columnaFecha: 'Fecha',
    columnaDescripcion: 'Descripcion',
    columnaValor: 'Valor',
    columnaDebito: 'Debito',
    columnaCredito: 'Credito',
    formatoFecha: 'DD/MM/YYYY',
    separadorMiles: '.',
    simboloMoneda: '$',
  },
  davivienda: {
    nombre: 'Davivienda',
    tipo: 'excel',
    columnaFecha: 'Fecha Transaccion',
    columnaDescripcion: 'Descripcion',
    columnaValor: 'Monto',
    formatoFecha: 'DD/MM/YYYY',
    separadorMiles: ',',
    simboloMoneda: '$',
  },
}