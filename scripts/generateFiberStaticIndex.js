const fs = require('fs')
const path = require('path')
const readline = require('readline')

const ROOT_DIR = path.resolve(__dirname, '..')
const SOURCE_FILE = path.join(ROOT_DIR, 'data', 'fiber-coverage.csv')
const PUBLIC_DIR = path.join(ROOT_DIR, 'public')
const OUTPUT_DIR = path.join(PUBLIC_DIR, 'fiber-index')
const CITIES_FILE = path.join(PUBLIC_DIR, 'fiber-cities.json')

const COLUMNS = [
  'cep',
  'street',
  'number',
  'complement',
  'neighborhood',
  'households',
  'viabilityCode',
  'viability',
  'olt',
  'capacityReason',
]

function parseCsvLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ';' && !inQuotes) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }

  values.push(current)
  return values
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getValue(row, headers, columnName) {
  const index = headers.indexOf(columnName)
  return index >= 0 ? row[index] || '' : ''
}

function getComplement(row, headers) {
  return [
    'COMPLEMENTO',
    'COMPLEMENTO2',
    'COMPLEMENTO3',
    'COMPLEMENTO4',
    'COMPLEMENTO5',
  ].map((column) => getValue(row, headers, column)).filter(Boolean).join(' ')
}

function makeRow(values, headers) {
  return [
    onlyDigits(getValue(values, headers, 'CEP')),
    getValue(values, headers, 'LOGRADOURO'),
    onlyDigits(getValue(values, headers, 'NUM_LOGRADOURO')),
    getComplement(values, headers),
    getValue(values, headers, 'BAIRRO'),
    Number(getValue(values, headers, 'QTD_HH')) || 0,
    getValue(values, headers, 'VIABILIDADE'),
    getValue(values, headers, 'MOTIVO'),
    getValue(values, headers, 'OLT'),
    getValue(values, headers, 'MOTIVO_CAPACITY') || getValue(values, headers, 'AJUSTE_CAPACITY'),
  ]
}

async function main() {
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(`Arquivo de origem não encontrado: ${SOURCE_FILE}`)
  }

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const byCity = new Map()
  const rl = readline.createInterface({
    input: fs.createReadStream(SOURCE_FILE),
    crlfDelay: Infinity,
  })

  let headers = []
  let totalRows = 0

  for await (const line of rl) {
    if (!headers.length) {
      headers = parseCsvLine(line).map((header) => header.replace(/^\uFEFF/, ''))
      continue
    }

    if (!line.trim()) continue
    const values = parseCsvLine(line)
    const city = getValue(values, headers, 'MUNICIPIO').trim()
    const uf = getValue(values, headers, 'UF').trim()
    if (!city) continue

    const key = `${city}|${uf}`
    if (!byCity.has(key)) {
      byCity.set(key, {
        city,
        uf,
        label: uf ? `${city} / ${uf}` : city,
        file: `${slugify(`${city}-${uf}`)}.json`,
        rows: [],
      })
    }

    byCity.get(key).rows.push(makeRow(values, headers))
    totalRows += 1
  }

  const cities = [...byCity.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  const generatedAt = new Date().toISOString()

  for (const item of cities) {
    const payload = {
      generatedAt,
      city: item.city,
      uf: item.uf,
      columns: COLUMNS,
      rows: item.rows,
    }
    fs.writeFileSync(path.join(OUTPUT_DIR, item.file), JSON.stringify(payload))
  }

  const index = {
    generatedAt,
    source: 'data/fiber-coverage.csv',
    count: cities.length,
    totalRows,
    columns: COLUMNS,
    cities: cities.map(({ city, uf, label, file, rows }) => ({
      city,
      uf,
      label,
      file,
      rows: rows.length,
    })),
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.json'), JSON.stringify(index, null, 2))
  fs.writeFileSync(CITIES_FILE, JSON.stringify({
    generatedAt,
    source: 'data/fiber-coverage.csv',
    count: cities.length,
    totalRows,
    cities: index.cities.map(({ city, uf, label, file, rows }) => ({ city, uf, label, file, rows })),
  }, null, 2))

  console.log({
    cities: cities.length,
    totalRows,
    outputDir: path.relative(ROOT_DIR, OUTPUT_DIR),
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
