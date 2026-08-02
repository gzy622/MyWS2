const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_UNCOMPRESSED_SIZE = 24 * 1024 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

export { XLSX_MIME };

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlDecode(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function attr(source, name) {
  const match = source.match(new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}=(?:"([^"]*)"|'([^']*)')`));
  return match ? xmlDecode(match[1] ?? match[2] ?? '') : '';
}

function columnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function columnIndex(reference) {
  const match = String(reference ?? '').match(/^([A-Z]+)/i);
  if (!match) return -1;
  let result = 0;
  for (const char of match[1].toUpperCase()) result = result * 26 + char.charCodeAt(0) - 64;
  return result - 1;
}

function cellReference(row, column) {
  return `${columnName(column)}${row + 1}`;
}

function cellValue(cell) {
  if (cell && typeof cell === 'object' && !Array.isArray(cell) && 'value' in cell) return cell.value;
  return cell;
}

function cellStyle(cell, rowIndex) {
  if (cell && typeof cell === 'object' && !Array.isArray(cell) && Number.isInteger(cell.style)) {
    return cell.style;
  }
  return rowIndex === 0 ? 1 : 0;
}

function serializeCell(cell, rowIndex, columnIndexValue) {
  const value = cellValue(cell);
  if (value === '' || value === null || value === undefined) return '';
  const reference = cellReference(rowIndex, columnIndexValue);
  const style = cellStyle(cell, rowIndex);
  const styleAttr = style ? ` s="${style}"` : '';
  const formula = cell && typeof cell === 'object' && !Array.isArray(cell) ? cell.formula : '';
  if (formula) {
    const formulaType = typeof value === 'number' && Number.isFinite(value) ? '' : ' t="str"';
    const cachedValue = typeof value === 'number' && Number.isFinite(value) ? String(value) : xmlEscape(String(value));
    return `<c r="${reference}"${styleAttr}${formulaType}><f>${xmlEscape(String(formula).replace(/^=/, ''))}</f><v>${cachedValue}</v></c>`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"${styleAttr}><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${reference}"${styleAttr} t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  const text = String(value);
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${reference}"${styleAttr} t="inlineStr"><is><t${preserve}>${xmlEscape(text)}</t></is></c>`;
}

function freezeXml(rows, columns) {
  if (!rows && !columns) return '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const topLeftCell = `${columnName(columns)}${rows + 1}`;
  const pane = columns && rows ? 'bottomRight' : columns ? 'topRight' : 'bottomLeft';
  return `<sheetViews><sheetView workbookViewId="0"><pane${columns ? ` xSplit="${columns}"` : ''}${rows ? ` ySplit="${rows}"` : ''} topLeftCell="${topLeftCell}" activePane="${pane}" state="frozen"/><selection pane="${pane}" activeCell="${topLeftCell}" sqref="${topLeftCell}"/></sheetView></sheetViews>`;
}

function validationXml(validations = []) {
  if (!validations.length) return '';
  const items = validations.map((item) => {
    const allowBlank = item.allowBlank === false ? '0' : '1';
    if (item.type === 'list') {
      const formula = item.formula1 ?? `"${(item.values ?? []).join(',')}"`;
      return `<dataValidation type="list" allowBlank="${allowBlank}" showErrorMessage="1" errorTitle="输入不正确" error="请从列表中选择。" sqref="${xmlEscape(item.sqref)}"><formula1>${xmlEscape(formula)}</formula1></dataValidation>`;
    }
    if (item.type === 'custom') {
      return `<dataValidation type="custom" allowBlank="${allowBlank}" showErrorMessage="1" errorTitle="输入不正确" error="${xmlEscape(item.error ?? '请输入符合要求的内容。')}" sqref="${xmlEscape(item.sqref)}"><formula1>${xmlEscape(item.formula1 ?? 'TRUE')}</formula1></dataValidation>`;
    }
    return `<dataValidation type="decimal" operator="between" allowBlank="${allowBlank}" showErrorMessage="1" errorTitle="分数不正确" error="请输入 0 到 100，最多一位小数。" sqref="${xmlEscape(item.sqref)}"><formula1>0</formula1><formula2>100</formula2></dataValidation>`;
  }).join('');
  return `<dataValidations count="${validations.length}">${items}</dataValidations>`;
}

function hiddenColumnSet(sheet) {
  const result = new Set();
  for (const item of sheet.hiddenColumns ?? []) {
    if (Number.isInteger(item)) result.add(item);
    else if (Array.isArray(item) && item.length >= 2) {
      for (let index = item[0]; index <= item[1]; index += 1) result.add(index);
    }
  }
  return result;
}

function worksheetColumnsXml(sheet) {
  const hidden = hiddenColumnSet(sheet);
  const widths = sheet.widths ?? [];
  const columnCount = Math.max(widths.length, hidden.size ? Math.max(...hidden) + 1 : 0);
  if (!columnCount) return '';
  return Array.from({ length: columnCount }, (_, index) => {
    const width = Number(widths[index]) || 12;
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"${hidden.has(index) ? ' hidden="1"' : ''}/>`;
  }).join('');
}

function rowIsHidden(sheet, rowIndex) {
  return (sheet.hiddenRows ?? []).includes(rowIndex);
}

function rowHeight(sheet, rowIndex) {
  const value = sheet.rowHeights?.[rowIndex];
  return Number.isFinite(Number(value)) ? ` ht="${Number(value)}" customHeight="1"` : '';
}

function worksheetXml(sheet, commentsRelationId = '') {
  const rows = sheet.rows ?? [];
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const rowCount = Math.max(1, rows.length);
  const dimension = `A1:${columnName(columnCount - 1)}${rowCount}`;
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndexValue) => serializeCell(cell, rowIndex, columnIndexValue)).join('');
    const height = rowHeight(sheet, rowIndex) || (rowIndex === 0 && sheet.header ? ' ht="24" customHeight="1"' : '');
    const hidden = rowIsHidden(sheet, rowIndex) ? ' hidden="1"' : '';
    return `<row r="${rowIndex + 1}"${height}${hidden}>${cells}</row>`;
  }).join('');
  const filterRef = typeof sheet.autoFilter === 'string'
    ? sheet.autoFilter
    : sheet.autoFilter?.ref;
  const filter = filterRef && rows.length
    ? `<autoFilter ref="${xmlEscape(filterRef)}"/>`
    : '';
  const merges = (sheet.merges ?? []).length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${xmlEscape(ref)}"/>`).join('')}</mergeCells>`
    : '';
  const legacyDrawing = commentsRelationId ? `<legacyDrawing r:id="${xmlEscape(commentsRelationId)}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${dimension}"/>${freezeXml(sheet.freezeRows ?? 0, sheet.freezeColumns ?? 0)}<sheetFormatPr defaultRowHeight="20"/>${worksheetColumnsXml(sheet) ? `<cols>${worksheetColumnsXml(sheet)}</cols>` : ''}<sheetData>${rowXml}</sheetData>${filter}${merges}${validationXml(sheet.validations)}${legacyDrawing}</worksheet>`;
}

function workbookXml(sheets) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
}

function workbookRelsXml(sheets) {
  const sheetRels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function contentTypesXml(sheets) {
  const overrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const commentOverrides = sheets.flatMap((sheet, index) => (sheet.comments?.length ? [
    `<Override PartName="/xl/comments${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>`
  ] : [])).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${overrides}${commentOverrides}</Types>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Microsoft YaHei"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Microsoft YaHei"/><family val="2"/></font><font><b/><color rgb="FF24558A"/><sz val="16"/><name val="Microsoft YaHei"/><family val="2"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF24558A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE6E6E6"/></left><right style="thin"><color rgb="FFE6E6E6"/></right><top style="thin"><color rgb="FFE6E6E6"/></top><bottom style="thin"><color rgb="FFE6E6E6"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const STYLES_XML_V2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Microsoft YaHei"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Microsoft YaHei"/><family val="2"/></font><font><b/><color rgb="FF24558A"/><sz val="16"/><name val="Microsoft YaHei"/><family val="2"/></font><font><b/><color rgb="FF24558A"/><sz val="11"/><name val="Microsoft YaHei"/><family val="2"/></font></fonts><fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF24558A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F4"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF4FF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF7F7F8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F2F5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE6E6E6"/></left><right style="thin"><color rgb="FFE6E6E6"/></right><top style="thin"><color rgb="FFE6E6E6"/></top><bottom style="thin"><color rgb="FFE6E6E6"/></bottom><diagonal/></border><border><left style="medium"><color rgb="FF9AB8D5"/></left><right style="thin"><color rgb="FFE6E6E6"/></right><top style="thin"><color rgb="FFE6E6E6"/></top><bottom style="thin"><color rgb="FFE6E6E6"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="14"><xf numFmtId="0" fontId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function coreXml(createdAt) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>教师工作台</dc:creator><cp:lastModifiedBy>教师工作台</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${xmlEscape(createdAt)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${xmlEscape(createdAt)}</dcterms:modified></cp:coreProperties>`;
}

function appXml(sheets) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>教师工作台</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>工作表</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map((sheet) => `<vt:lpstr>${xmlEscape(sheet.name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts><Company></Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>1.0</AppVersion></Properties>`;
}

function commentsXml(comments = []) {
  const items = comments.map((comment) => (
    `<comment ref="${xmlEscape(comment.ref)}" authorId="0"><text><t xml:space="preserve">${xmlEscape(comment.text)}</t></text></comment>`
  )).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>教师工作台</author></authors><commentList>${items}</commentList></comments>`;
}

function commentCellPosition(reference) {
  const match = String(reference ?? '').match(/^([A-Z]+)(\d+)$/i);
  if (!match) return { column: 0, row: 0 };
  return { column: columnIndex(match[1]), row: Math.max(0, Number(match[2]) - 1) };
}

function vmlCommentsXml(comments = []) {
  const shapes = comments.map((comment, index) => {
    const position = commentCellPosition(comment.ref);
    return `<v:shape type="#_x0000_t202" style="position:absolute;margin-left:59.25pt;margin-top:1.5pt;width:108pt;height:59.25pt;z-index:${index + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto" id="_x0000_s${1025 + index}"><v:fill color2="#ffffe1"/><v:shadow color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"/></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>1, 15, 0, 2, 3, 15, 5, 4</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${position.row}</x:Row><x:Column>${position.column}</x:Column></x:ClientData></v:shape>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>${shapes}</xml>`;
}

function worksheetRelsXml(sheetIndex) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments${sheetIndex}.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawing${sheetIndex}.vml"/></Relationships>`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function writeUint16(target, offset, value) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint16(offset, value, true);
}

function writeUint32(target, offset, value) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value >>> 0, true);
}

function concatBytes(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('xlsx-compression-unsupported');
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new Error('xlsx-compression-invalid');
  }
}

async function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = textEncoder.encode(entry.name);
    const source = entry.data instanceof Uint8Array ? entry.data : textEncoder.encode(entry.data);
    const compressedCandidate = await deflateRaw(source);
    const useDeflate = compressedCandidate && compressedCandidate.length < source.length;
    const data = useDeflate ? compressedCandidate : source;
    const method = useDeflate ? 8 : 0;
    const checksum = crc32(source);
    const local = new Uint8Array(30 + name.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0x0800);
    writeUint16(local, 8, method);
    writeUint32(local, 14, checksum);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, source.length);
    writeUint16(local, 26, name.length);
    local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0x0800);
    writeUint16(central, 10, method);
    writeUint32(central, 16, checksum);
    writeUint32(central, 20, data.length);
    writeUint32(central, 24, source.length);
    writeUint16(central, 28, name.length);
    writeUint32(central, 42, localOffset);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length + data.length;
  }
  const central = concatBytes(centralParts);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, central.length);
  writeUint32(end, 16, localOffset);
  return concatBytes([...localParts, central, end]);
}

function findEndRecord(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

async function readZip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22) throw new Error('xlsx-invalid-zip');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndRecord(bytes);
  if (endOffset < 0) throw new Error('xlsx-invalid-zip');
  const count = view.getUint16(endOffset + 10, true);
  if (count > 2048) throw new Error('xlsx-expanded-too-large');
  let offset = view.getUint32(endOffset + 16, true);
  const entries = new Map();
  let totalSize = 0;
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('xlsx-invalid-zip');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    totalSize += uncompressedSize;
    if (totalSize > MAX_UNCOMPRESSED_SIZE) throw new Error('xlsx-expanded-too-large');
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('xlsx-invalid-zip');
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    let data;
    if (method === 0) data = new Uint8Array(compressed);
    else if (method === 8) data = await inflateRaw(compressed);
    else throw new Error('xlsx-compression-unsupported');
    if (data.length !== uncompressedSize) throw new Error('xlsx-invalid-zip');
    entries.set(name.replace(/^\//, ''), data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function parseSharedStrings(xml) {
  const strings = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => xmlDecode(part[1]));
    strings.push(parts.join(''));
  }
  return strings;
}

function parseCell(body, attributes, sharedStrings) {
  const type = attr(attributes, 't');
  const formula = body.match(/<f\b[^>]*>([\s\S]*?)<\/f>/);
  const valueMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  if (type === 'inlineStr') {
    return [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => xmlDecode(part[1])).join('');
  }
  const raw = valueMatch ? xmlDecode(valueMatch[1]) : '';
  if (type === 's') return sharedStrings[Number(raw)] ?? '';
  if (type === 'b') return raw === '1';
  if (type === 'str' || type === 'e') return raw;
  if (raw === '' && formula) return '';
  const numeric = Number(raw);
  return raw !== '' && Number.isFinite(numeric) ? numeric : raw;
}

function parseWorksheet(xml, sharedStrings) {
  const rows = [];
  const hiddenRows = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowIndex = Math.max(0, Number(attr(rowMatch[1], 'r') || rows.length + 1) - 1);
    const row = [];
    if (attr(rowMatch[1], 'hidden') === '1') hiddenRows.push(rowIndex);
    const body = rowMatch[2] ?? '';
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    for (const cellMatch of body.matchAll(cellPattern)) {
      const attributes = cellMatch[1] ?? cellMatch[3] ?? '';
      const body = cellMatch[2] ?? '';
      const index = columnIndex(attr(attributes, 'r'));
      if (index >= 0) row[index] = parseCell(body, attributes, sharedStrings);
    }
    while (rows.length < rowIndex) rows.push([]);
    rows[rowIndex] = row;
  }
  const hiddenColumns = [];
  for (const match of xml.matchAll(/<col\b([^>]*?)(?:\/>|>)/g)) {
    if (attr(match[1], 'hidden') !== '1') continue;
    const min = Number(attr(match[1], 'min')) - 1;
    const max = Number(attr(match[1], 'max')) - 1;
    if (Number.isInteger(min) && min >= 0 && Number.isInteger(max) && max >= min) hiddenColumns.push([min, max]);
  }
  const merges = [...xml.matchAll(/<mergeCell\b([^>]*?)(?:\/>|>)/g)].map((match) => attr(match[1], 'ref')).filter(Boolean);
  const filterMatch = xml.match(/<autoFilter\b([^>]*?)(?:\/>|>)/);
  return {
    rows,
    meta: {
      hiddenRows,
      hiddenColumns,
      merges,
      autoFilter: filterMatch ? attr(filterMatch[1], 'ref') : ''
    }
  };
}

function normalizeTarget(target) {
  const source = String(target ?? '');
  const parts = (source.startsWith('/') ? source.slice(1) : `xl/${source}`).split('/');
  const result = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') result.pop();
    else result.push(part);
  }
  return result.join('/');
}

class XlsxWorkbook extends Map {
  constructor() {
    super();
    this.sheetMeta = new Map();
  }

  setSheetMeta(name, meta) {
    this.sheetMeta.set(name, meta);
  }

  getSheetMeta(name) {
    return this.sheetMeta.get(name) ?? {};
  }
}

export async function createXlsxWorkbook(sheets, { createdAt = new Date().toISOString() } = {}) {
  const entries = [
    { name: '[Content_Types].xml', data: contentTypesXml(sheets) },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'docProps/core.xml', data: coreXml(createdAt) },
    { name: 'docProps/app.xml', data: appXml(sheets) },
    { name: 'xl/workbook.xml', data: workbookXml(sheets) },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml(sheets) },
    { name: 'xl/styles.xml', data: STYLES_XML_V2 },
    ...sheets.flatMap((sheet, index) => {
      const worksheetEntries = [{
        name: `xl/worksheets/sheet${index + 1}.xml`,
        data: worksheetXml(sheet, sheet.comments?.length ? 'rId2' : '')
      }];
      if (sheet.comments?.length) {
        worksheetEntries.push(
          { name: `xl/worksheets/_rels/sheet${index + 1}.xml.rels`, data: worksheetRelsXml(index + 1) },
          { name: `xl/comments${index + 1}.xml`, data: commentsXml(sheet.comments) },
          { name: `xl/drawings/vmlDrawing${index + 1}.vml`, data: vmlCommentsXml(sheet.comments) }
        );
      }
      return worksheetEntries;
    })
  ];
  return createZip(entries);
}

export async function readXlsxWorkbook(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = await readZip(bytes);
  const workbookData = entries.get('xl/workbook.xml');
  const relsData = entries.get('xl/_rels/workbook.xml.rels');
  if (!workbookData || !relsData) throw new Error('xlsx-workbook-missing');
  const workbook = textDecoder.decode(workbookData);
  const rels = textDecoder.decode(relsData);
  const targets = new Map();
  for (const match of rels.matchAll(/<Relationship\b([^>]*?)(?:\/>|>)/g)) {
    targets.set(attr(match[1], 'Id'), normalizeTarget(attr(match[1], 'Target')));
  }
  const sharedData = entries.get('xl/sharedStrings.xml');
  const sharedStrings = sharedData ? parseSharedStrings(textDecoder.decode(sharedData)) : [];
  const sheets = new XlsxWorkbook();
  for (const match of workbook.matchAll(/<sheet\b([^>]*?)(?:\/>|>)/g)) {
    const name = attr(match[1], 'name');
    const target = targets.get(attr(match[1], 'r:id'));
    const sheetData = target ? entries.get(target) : null;
    if (!name || !sheetData) continue;
    const parsed = parseWorksheet(textDecoder.decode(sheetData), sharedStrings);
    sheets.set(name, parsed.rows);
    sheets.setSheetMeta(name, parsed.meta);
  }
  if (!sheets.size) throw new Error('xlsx-sheets-missing');
  return sheets;
}
