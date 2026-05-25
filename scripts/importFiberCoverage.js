const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { Readable } = require('stream')
const { spawn } = require('child_process')

const DEFAULT_ZIP = '/home/michael/Downloads/Base_de_Cobertura_-_Rede_TIM_–_Parceiro_V.tal-20260520_161912.zip'
const DATA_DIR = path.join(__dirname, '..', 'data')
const OUTPUT_FILE = path.join(DATA_DIR, 'fiber-coverage.csv')
const BACKUP_DIR = path.join(DATA_DIR, 'fiber-backups')
const LOG_DIR = path.join(DATA_DIR, 'fiber-import-logs')

const CANONICAL_HEADERS = [
  'DT_REF',
  'UF',
  'MUNICIPIO',
  'CEP',
  'LOGRADOURO',
  'NUM_LOGRADOURO',
  'COMPLEMENTO',
  'COMPLEMENTO2',
  'COMPLEMENTO3',
  'COMPLEMENTO4',
  'COMPLEMENTO5',
  'BAIRRO',
  'QTD_HH',
  'LATITUDE',
  'LONGITUDE',
  'ID_LOTE',
  'VIABILIDADE',
  'MOTIVO',
  'TIPO_LOTE',
  'QTD_INFRACO',
  'INFRACO_PRINCIPAL',
  'INFRACO_SECUNDÁRIA',
  'INFRACO_TERCIÁRIA',
  'OLT',
  'SEGMENTACAO_OLT',
  'ID_CAPACITY',
  'ORD_INFRACO',
  'BLOQ_CAPACITY',
  'MOTIVO_CAPACITY',
  'AJUSTE_CAPACITY',
]

const REQUIRED_FIELDS = ['UF', 'MUNICIPIO', 'CEP', 'LOGRADOURO', 'BAIRRO', 'VIABILIDADE']
const FIELD_ALIASES = {
  DT_REF: ['dt ref', 'data referencia', 'data base'],
  UF: ['uf', 'estado'],
  MUNICIPIO: ['municipio', 'cidade', 'localidade', 'city'],
  CEP: ['cep', 'codigo postal', 'cod postal'],
  LOGRADOURO: ['logradouro', 'rua', 'endereco', 'street'],
  NUM_LOGRADOURO: ['num logradouro', 'numero', 'num', 'numero endereco'],
  COMPLEMENTO: ['complemento', 'compl'],
  COMPLEMENTO2: ['complemento2', 'complemento 2'],
  COMPLEMENTO3: ['complemento3', 'complemento 3'],
  COMPLEMENTO4: ['complemento4', 'complemento 4'],
  COMPLEMENTO5: ['complemento5', 'complemento 5'],
  BAIRRO: ['bairro', 'neighborhood'],
  QTD_HH: ['qtd hh', 'domicilios', 'hh'],
  LATITUDE: ['latitude', 'lat'],
  LONGITUDE: ['longitude', 'lng', 'long'],
  ID_LOTE: ['id lote', 'lote'],
  VIABILIDADE: ['viabilidade', 'status', 'situacao'],
  MOTIVO: ['motivo', 'observacao'],
  TIPO_LOTE: ['tipo lote'],
  QTD_INFRACO: ['qtd infraco'],
  INFRACO_PRINCIPAL: ['infraco principal', 'provedor infra'],
  INFRACO_SECUNDÁRIA: ['infraco secundaria', 'infraco secundária'],
  INFRACO_TERCIÁRIA: ['infraco terciaria', 'infraco terciária'],
  OLT: ['olt'],
  SEGMENTACAO_OLT: ['segmentacao olt', 'segmentação olt'],
  ID_CAPACITY: ['id capacity'],
  ORD_INFRACO: ['ord infraco'],
  BLOQ_CAPACITY: ['bloq capacity', 'bloqueio capacidade'],
  MOTIVO_CAPACITY: ['motivo capacity'],
  AJUSTE_CAPACITY: ['ajuste capacity'],
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function parseSemicolonCsvLine(line) {
  const values = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
      continue
    }
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === ';' && !quoted) {
      values.push(current)
      current = ''
      continue
    }
    current += char
  }
  values.push(current)
  return values
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function csvEscape(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim()
  if (/[;"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function buildHeaderMap(headers) {
  const normalizedHeaders = headers.map(normalizeHeader)
  return Object.fromEntries(CANONICAL_HEADERS.map((field) => {
    const names = [field, ...(FIELD_ALIASES[field] || [])].map(normalizeHeader)
    const index = normalizedHeaders.findIndex((header) => names.includes(header))
    return [field, index]
  }))
}

function missingRequiredHeaders(headerMap) {
  return REQUIRED_FIELDS.filter((field) => headerMap[field] < 0)
}

function rowValue(values, headerMap, field) {
  const index = headerMap[field]
  return index >= 0 ? values[index] || '' : ''
}

function normalizeRow(values, headerMap, lineNumber) {
  const row = Object.fromEntries(CANONICAL_HEADERS.map((field) => [field, rowValue(values, headerMap, field)]))
  row.UF = normalize(row.UF)
  row.MUNICIPIO = normalize(row.MUNICIPIO)
  row.CEP = onlyDigits(row.CEP).slice(0, 8)
  row.LOGRADOURO = normalize(row.LOGRADOURO)
  row.BAIRRO = normalize(row.BAIRRO)
  row.VIABILIDADE = String(row.VIABILIDADE || '').trim() || 'Nao informado'

  const missing = REQUIRED_FIELDS.filter((field) => !String(row[field] || '').trim())
  if (row.CEP && row.CEP.length !== 8) missing.push('CEP inválido')
  if (missing.length) {
    return {
      error: `Linha ${lineNumber}: campo obrigatório ausente ou inválido (${[...new Set(missing)].join(', ')}).`,
      row,
    }
  }

  return { row }
}

function rowKey(row) {
  return [
    row.UF,
    row.MUNICIPIO,
    row.CEP,
    row.LOGRADOURO,
    row.NUM_LOGRADOURO,
    row.COMPLEMENTO,
    row.COMPLEMENTO2,
    row.COMPLEMENTO3,
    row.COMPLEMENTO4,
    row.COMPLEMENTO5,
    row.BAIRRO,
  ].map(normalize).join('|')
}

function openZipCsv(zipPath) {
  const child = spawn('unzip', ['-p', zipPath], { stdio: ['ignore', 'pipe', 'pipe'] })
  child.stderr.on('data', (data) => {
    process.stderr.write(data)
  })
  return { stream: child.stdout, close: new Promise((resolve) => child.on('close', resolve)) }
}

function openCsvFile(csvPath) {
  return { stream: fs.createReadStream(csvPath), close: Promise.resolve(0) }
}

function openXlsxFile(filePath) {
  const XLSX = require('xlsx')
  const workbook = XLSX.readFile(filePath, { cellDates: false, raw: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('A planilha não possui abas com dados.')
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';', blankrows: false })
  return { stream: Readable.from(csv.split(/\r?\n/).map((line) => `${line}\n`)), close: Promise.resolve(0) }
}

function openSource(sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase()
  if (ext === '.zip') return openZipCsv(sourcePath)
  if (ext === '.csv' || ext === '.txt') return openCsvFile(sourcePath)
  if (ext === '.xlsx' || ext === '.xls') return openXlsxFile(sourcePath)
  throw new Error('Formato inválido. Use .zip, .csv, .xlsx ou .xls.')
}

function createBackup(source, runStamp) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const runDir = path.join(BACKUP_DIR, runStamp)
  fs.mkdirSync(runDir, { recursive: true })
  const manifest = {
    createdAt: new Date().toISOString(),
    activeFile: OUTPUT_FILE,
    importSource: source,
    backupFile: '',
    status: 'archived',
  }
  if (fs.existsSync(OUTPUT_FILE)) {
    manifest.backupFile = path.join(runDir, 'fiber-coverage.previous.csv')
    fs.copyFileSync(OUTPUT_FILE, manifest.backupFile)
  }
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}

function writeImportLog(runStamp, log) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  const logFile = path.join(LOG_DIR, `fiber-import-${runStamp}.json`)
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2))
  return logFile
}

async function importFiberCoverage(sourcePath, options = {}) {
  const source = sourcePath === '--from-current' ? OUTPUT_FILE : sourcePath
  if (!source || !fs.existsSync(source)) {
    throw new Error(`Arquivo não encontrado: ${source || '(vazio)'}`)
  }

  fs.mkdirSync(DATA_DIR, { recursive: true })
  const runStamp = stamp()
  const backup = createBackup(source, runStamp)
  const input = openSource(source)
  const rl = readline.createInterface({ input: input.stream, crlfDelay: Infinity })
  const rowsByKey = new Map()
  const invalidRows = []
  let headers = []
  let headerMap = {}
  let readRows = 0
  let emptyRows = 0
  let duplicateRows = 0
  let lineNumber = 0

  for await (const rawLine of rl) {
    const line = rawLine.replace(/\r$/, '')
    lineNumber += 1
    if (!headers.length) {
      headers = parseSemicolonCsvLine(line.replace(/^\uFEFF/, ''))
      headerMap = buildHeaderMap(headers)
      const missingColumns = missingRequiredHeaders(headerMap)
      if (missingColumns.length) {
        throw new Error(`Colunas obrigatórias não encontradas: ${missingColumns.join(', ')}.`)
      }
      continue
    }

    if (!line.trim()) {
      emptyRows += 1
      continue
    }

    readRows += 1
    const values = parseSemicolonCsvLine(line)
    const normalized = normalizeRow(values, headerMap, lineNumber)
    if (normalized.error) {
      if (invalidRows.length < 250) invalidRows.push(normalized.error)
      continue
    }

    const key = rowKey(normalized.row)
    if (rowsByKey.has(key)) {
      duplicateRows += 1
      continue
    }
    rowsByKey.set(key, normalized.row)
  }

  const exitCode = await input.close
  if (exitCode !== 0) {
    throw new Error(`Falha ao carregar arquivo de origem. Código: ${exitCode}`)
  }

  if (!rowsByKey.size) {
    throw new Error('Nenhuma linha válida encontrada. A base antiga foi mantida e o backup foi preservado.')
  }

  const tmpFile = path.join(DATA_DIR, `.fiber-coverage-${process.pid}-${runStamp}.tmp.csv`)
  const out = fs.createWriteStream(tmpFile)
  out.write(`${CANONICAL_HEADERS.join(';')}\n`)
  for (const row of rowsByKey.values()) {
    out.write(`${CANONICAL_HEADERS.map((field) => csvEscape(row[field])).join(';')}\n`)
  }
  await new Promise((resolve, reject) => {
    out.end(resolve)
    out.on('error', reject)
  })

  if (options.dryRun) {
    fs.unlinkSync(tmpFile)
  } else {
    fs.renameSync(tmpFile, OUTPUT_FILE)
  }

  const logFile = path.join(LOG_DIR, `fiber-import-${runStamp}.json`)
  const result = {
    source,
    output: OUTPUT_FILE,
    backup,
    readRows,
    writtenRows: rowsByKey.size,
    emptyRows,
    invalidRows: readRows - rowsByKey.size - duplicateRows,
    duplicateRows,
    logFile,
    dryRun: Boolean(options.dryRun),
    importedAt: new Date().toISOString(),
  }
  writeImportLog(runStamp, {
    ...result,
    invalidRowSamples: invalidRows,
    requiredFields: REQUIRED_FIELDS,
    canonicalHeaders: CANONICAL_HEADERS,
  })
  return result
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run')
  const fromCurrent = argv.includes('--from-current')
  const fileArg = argv.find((arg) => !arg.startsWith('--'))
  return {
    source: fromCurrent ? '--from-current' : fileArg || DEFAULT_ZIP,
    dryRun,
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2))
  importFiberCoverage(args.source, { dryRun: args.dryRun })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

module.exports = {
  importFiberCoverage,
  parseSemicolonCsvLine,
  CANONICAL_HEADERS,
  REQUIRED_FIELDS,
}
