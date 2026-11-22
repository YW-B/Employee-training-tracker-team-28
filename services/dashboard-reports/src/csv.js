// EN: Turns report rows into CSV text, safely.
//     1. CSV injection guard: a cell that starts with = + - or @ could run as a formula when the file is
//        opened in Excel, so we put a single quote ' in front of it.
//     2. A cell with a comma, a quote or a new line is wrapped in double quotes ("), and quotes inside it
//        are doubled, so the columns never shift.
// Franco: Bey7awwel rows el report le CSV b-amaan.
//     1. 7emaya men CSV injection: el cell elly btebda2 b = + - aw @ momken teshtaghal ka formula fe Excel,
//        f bn7ott ' 2oddamha.
//     2. El cell elly feeha comma aw quote aw satr gedeed bn7otaha ben "..." w bnkarrar el quotes elly
//        gowwaha, 3ashan el columns matetzazha2sh.
'use strict';

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

// EN: columns = [[header, key], ...]. Lines end with \r\n, which Excel expects.
// Franco: columns = [[header, key], ...]. El sotoor betkhlas b \r\n zay ma Excel mestanni.
function toCsv(columns, rows) {
  const lines = [columns.map(([header]) => csvCell(header)).join(',')];
  for (const row of rows) lines.push(columns.map(([, key]) => csvCell(row[key])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

module.exports = { csvCell, toCsv };
