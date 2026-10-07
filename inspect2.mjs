import { read, utils } from 'xlsx'
import fs from 'fs'

const buf = fs.readFileSync('data/Copia-de-Coincidencias_Admisible_Resoluciones-2-ab9ce3.xlsx')
const wb = read(buf, { cellDates: true })
const rows = utils.sheet_to_json(wb.Sheets['Detalle resoluciones'], { defval: null })
console.log(`Detalle resoluciones (${rows.length} rows)`)
console.log(JSON.stringify(rows.slice(0, 6), null, 2))
console.log('Columns:', Object.keys(rows[0] || {}))
