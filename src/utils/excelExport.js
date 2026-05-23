let xlsxPromise

async function loadXlsx() {
  if (!xlsxPromise) {
    xlsxPromise = import('xlsx')
  }
  return xlsxPromise
}

function getCellText(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toLocaleDateString('pt-BR')
  return String(value)
}

function getColumnWidths(rows, headers = []) {
  const widthCount = Math.max(headers.length, ...rows.map((row) => row.length), 1)
  return Array.from({ length: widthCount }, (_, index) => {
    const headerWidth = getCellText(headers[index]).length
    const contentWidth = rows.reduce((max, row) => Math.max(max, getCellText(row[index]).length), headerWidth)
    return { wch: Math.min(Math.max(contentWidth + 3, 12), 42) }
  })
}

export async function styleProfessionalWorksheet(worksheet, rows = [], options = {}) {
  const XLSX = await loadXlsx()
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1')
  const headerRowIndex = Number(options.headerRowIndex || 0)
  const headerRow = rows[headerRowIndex] || []

  worksheet['!cols'] = getColumnWidths(rows, headerRow)
  worksheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRowIndex, c: 0 },
      e: { r: range.e.r, c: range.e.c },
    }),
  }
  worksheet['!freeze'] = {
    xSplit: 0,
    ySplit: headerRowIndex + 1,
    topLeftCell: `A${headerRowIndex + 2}`,
    activePane: 'bottomLeft',
    state: 'frozen',
  }

  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: column })
    if (!worksheet[cellAddress]) continue
    worksheet[cellAddress].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0891B2' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    }
  }

  worksheet['!rows'] = worksheet['!rows'] || []
  worksheet['!rows'][headerRowIndex] = { hpt: 24 }
  return worksheet
}

export async function appendAoaSheet(workbook, sheetName, rows, options = {}) {
  const XLSX = await loadXlsx()
  const safeRows = rows.length ? rows : [['Sem dados']]
  const worksheet = XLSX.utils.aoa_to_sheet(safeRows)
  await styleProfessionalWorksheet(worksheet, safeRows, options)
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  return worksheet
}

export async function appendJsonSheet(workbook, sheetName, rows, headers) {
  const XLSX = await loadXlsx()
  const safeRows = rows.length ? rows : [{}]
  const worksheet = XLSX.utils.json_to_sheet(safeRows, { header: headers })
  const aoaRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false })
  await styleProfessionalWorksheet(worksheet, aoaRows)
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  return worksheet
}

export async function createWorkbook() {
  const XLSX = await loadXlsx()
  return XLSX.utils.book_new()
}

export async function writeWorkbook(workbook, fileName) {
  const XLSX = await loadXlsx()
  XLSX.writeFile(workbook, fileName, { cellStyles: true })
}
