import { read, utils } from 'xlsx'
import fs from 'fs'

const buf = fs.readFileSync('data/Copia-de-Coincidencias_Admisible_Resoluciones-2-ab9ce3.xlsx')
const wb = read(buf, { cellDates: true })
console.log('SHEETS:', wb.SheetNames)
for (const name of wb.SheetNames) {
  const rows = utils.sheet_to_json(wb.Sheets[name], { defval: null })
  console.log(`\n=== ${name} (${rows.length} rows) ===`)
  console.log(JSON.stringify(rows.slice(0, 5), null, 2))
}
