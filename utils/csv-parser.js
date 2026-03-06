// utils/csv-parser.js
// Ported from csv_parser.py — parses TestRail CSV exports
// v2: fixed multiline quoted field support

const CsvParser = {

  // ── Text cleaning ──
  cleanHtml(text) {
    if (!text) return '';
    // Remove image spans
    text = text.replace(/<span[^>]*markdown-img-container[^>]*>.*?<\/span>/gs, '');
    // Strip all HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  },

  parseSteps(raw) {
    if (!raw) return [];
    const cleaned = this.cleanHtml(raw);
    // Split on numbered prefixes like "1. ", "2. "
    const parts = cleaned.split(/(?:^|\s)(\d+)\.\s+/);
    const steps = [];
    let i = 1;
    while (i < parts.length) {
      if (i + 1 < parts.length) {
        const stepText = parts[i + 1].trim();
        if (stepText) steps.push(stepText);
      }
      i += 2;
    }
    // Fallback: return whole text if regex didn't split
    if (steps.length === 0 && cleaned) return [cleaned];
    return steps;
  },

  // ── Tokenize entire CSV respecting quoted multiline fields ──
  // Never split on \n first — walk char-by-char to handle
  // steps that span multiple lines inside quoted fields.
  _tokenize(text) {
    const rows = [];
    let row      = [];
    let field    = '';
    let inQuotes = false;
    let i        = 0;

    while (i < text.length) {
      const ch = text[i];

      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') {
          field += '"'; i += 2; continue; // escaped quote
        }
        inQuotes = !inQuotes; i++; continue;
      }

      if (ch === ',' && !inQuotes) {
        row.push(field); field = ''; i++; continue;
      }

      if (!inQuotes && (ch === '\n' || (ch === '\r' && text[i + 1] === '\n'))) {
        if (ch === '\r') i++; // skip \r of \r\n
        row.push(field); field = '';
        if (row.some(f => f.trim())) rows.push(row);
        row = []; i++; continue;
      }

      field += ch; i++;
    }

    // Last field/row
    if (field || row.length > 0) {
      row.push(field);
      if (row.some(f => f.trim())) rows.push(row);
    }

    return rows;
  },

  // ── Parse CSV into array of row objects ──
  parseRawCsv(text) {
    const rows = this._tokenize(text);
    if (rows.length === 0) return [];

    const headers = rows[0].map(h => h.trim());
    const result  = [];

    for (let i = 1; i < rows.length; i++) {
      const row = {};
      headers.forEach((h, idx) => { row[h] = (rows[i][idx] || '').trim(); });
      result.push(row);
    }
    return result;
  },

  // ── Main parse function ──
  parse(csvText) {
    // Handle BOM
    const text = csvText.replace(/^\uFEFF/, '');
    const rows = this.parseRawCsv(text);
    const cases = [];

    for (const row of rows) {
      const id    = (row['ID'] || '').trim();
      const title = this.cleanHtml(row['Title'] || '');
      if (!id || !title) continue;

      cases.push({
        id,
        title,
        section:        (row['Section'] || 'General').trim(),
        steps:          this.parseSteps(row['Steps (Step)'] || ''),
        expected:       this.parseSteps(row['Steps (Expected Result)'] || ''),
        preconditions:  this.cleanHtml(row['Preconditions'] || ''),
        priority:       (row['Priority'] || 'Medium').trim(),
      });
    }
    return cases;
  },

  // ── Group by section, merge tiny sections into Miscellaneous ──
  groupBySection(cases, minSize = 4) {
    const sections = {};
    for (const tc of cases) {
      if (!sections[tc.section]) sections[tc.section] = [];
      sections[tc.section].push(tc);
    }

    const grouped = {};
    const misc = [];

    for (const [section, tcs] of Object.entries(sections)) {
      if (tcs.length >= minSize) {
        grouped[section] = tcs;
      } else {
        misc.push(...tcs);
      }
    }

    if (misc.length > 0) grouped['Miscellaneous'] = misc;
    return grouped;
  }
};