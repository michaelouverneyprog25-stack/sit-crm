const fs = require('fs')
const path = require('path')
const os = require('os')
const readline = require('readline')
const { spawn } = require('child_process')

const DEFAULT_ZIP = '/home/michael/Downloads/Base_de_Cobertura_-_Rede_TIM_–_Parceiro_V.tal-20260520_161912.zip'
const DATA_DIR = path.join(__dirname, '..', 'data')
const OUTPUT_FILE = path.join(DATA_DIR, 'fiber-coverage.csv')
const BACKUP_DIR = path.join(DATA_DIR, 'cleanup-backups')

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

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function rowKey(headers, values) {
  const get = (name) => values[headers.indexOf(name)] || ''
  return [
    get('UF'),
    get('MUNICIPIO'),
    get('CEP'),
    get('LOGRADOURO'),
    get('NUM_LOGRADOURO'),
    get('COMPLEMENTO'),
    get('COMPLEMENTO2'),
    get('COMPLEMENTO3'),
    get('COMPLEMENTO4'),
    get('COMPLEMENTO5'),
    get('BAIRRO'),
  ].map(normalize).join('|')
}

function openZipCsv(zipPath) {
  const child = spawn('unzip', ['-p', zipPath], { stdio: ['ignore', 'pipe', 'inherit'] })
  child.on('error', (error) => {
    throw error
  })
  return child
}

async function importFiberCoverage(zipPath) {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Arquivo não encontrado: ${zipPath}`)
  }

  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(BACKUP_DIR, { recursive: true })

  if (fs.existsSync(OUTPUT_FILE)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    fs.copyFileSync(OUTPUT_FILE, path.join(BACKUP_DIR, `fiber-coverage-${stamp}.csv`))
  }

  const unzip = openZipCsv(zipPath)
  const rl = readline.createInterface({ input: unzip.stdout, crlfDelay: Infinity })
  const rowsByKey = new Map()
  let headerLine = ''
  let headers = []
  let readRows = 0

  for await (const line of rl) {
    if (!headerLine) {
      headerLine = line.replace(/^\uFEFF/, '')
      headers = parseSemicolonCsvLine(headerLine)
      continue
    }
    if (!line.trim()) continue
    readRows += 1
    const values = parseSemicolonCsvLine(line)
    rowsByKey.set(rowKey(headers, values), line)
  }

  const exitCode = await new Promise((resolve) => {
    unzip.on('close', resolve)
  })
  if (exitCode !== 0) {
    throw new Error(`Falha ao extrair ZIP. Código: ${exitCode}`)
  }

  const tmpFile = path.join(os.tmpdir(), `fiber-coverage-${process.pid}.csv`)
  const out = fs.createWriteStream(tmpFile)
  out.write(`${headerLine}\n`)
  for (const line of rowsByKey.values()) {
    out.write(`${line}\n`)
  }
  await new Promise((resolve, reject) => {
    out.end(resolve)
    out.on('error', reject)
  })
  fs.renameSync(tmpFile, OUTPUT_FILE)

  return {
    source: zipPath,
    output: OUTPUT_FILE,
    readRows,
    writtenRows: rowsByKey.size,
    duplicatesRemoved: readRows - rowsByKey.size,
  }
}

if (require.main === module) {
  importFiberCoverage(process.argv[2] || DEFAULT_ZIP)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

module.exports = { importFiberCoverage }
