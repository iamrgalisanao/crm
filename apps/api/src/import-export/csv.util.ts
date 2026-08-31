/**
 * Minimal, dependency-free CSV parsing/serialization. Handles quoted fields,
 * escaped quotes ("") inside quotes, commas/newlines inside quotes, and CRLF.
 */

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  const src = text.charCodeAt(0) === 65279 ? text.slice(1) : text; // strip BOM

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      record.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      record.push(field); field = '';
      if (record.some((f) => f.trim() !== '') || record.length > 1) records.push(record);
      record = [];
    } else {
      field += c;
    }
  }
  // trailing field/record
  if (field !== '' || record.length > 0) {
    record.push(field);
    if (record.some((f) => f.trim() !== '')) records.push(record);
  }

  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
  return { headers, rows };
}

function escapeField(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const head = columns.map(escapeField).join(',');
  const body = rows.map((row) => columns.map((c) => escapeField(row[c])).join(',')).join('\r\n');
  return body ? `${head}\r\n${body}` : head;
}
