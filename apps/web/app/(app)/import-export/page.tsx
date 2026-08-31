'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { PAGE } from '../../../lib/ui';

interface ImportResult { imported: number; failed: number; total: number; errors: { row: number; message: string }[] }

const ENTITIES = [
  { key: 'leads', label: 'Leads', view: 'leads.view', create: 'leads.create', template: 'name,company,contactPerson,email,phone,mobile,source,industry,interest,estimatedBudget,location,priority' },
  { key: 'accounts', label: 'Accounts', view: 'accounts.view', create: 'accounts.create', template: 'name,industry,address,city,country,website,phone,status' },
  { key: 'contacts', label: 'Contacts', view: 'contacts.view', create: 'contacts.create', template: 'firstName,lastName,jobTitle,department,email,phone,mobile,account' },
  { key: 'products', label: 'Products', view: 'products.view', create: 'products.manage', template: 'sku,name,type,unit,defaultPrice,cost,category' },
];

function download(filename: string, text: string, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function ImportExportPage() {
  const { can } = useAuth();
  const [entity, setEntity] = useState('leads');
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const spec = ENTITIES.find((e) => e.key === entity)!;

  async function exportCsv(key: string) {
    try {
      const r = await apiFetch<{ filename: string; csv: string }>(`/export/${key}`);
      download(r.filename, r.csv);
    } catch (e) { setError((e as ApiError).message); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setCsv(await file.text());
  }

  async function runImport() {
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await apiFetch<ImportResult>(`/import/${entity}`, { method: 'POST', body: { csv } }));
    } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  }

  return (
    <div className={PAGE.detail}>
      <h1 className="text-2xl font-semibold text-gray-900">Import / Export</h1>
      <p className="mt-1 text-sm text-gray-500">Bulk-load or download your CRM data as CSV.</p>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Export */}
      <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-700">Export</h2>
        <p className="mt-1 text-xs text-gray-500">Downloads up to 1,000 records, respecting your access.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ENTITIES.filter((e) => can(e.view)).map((e) => (
            <button key={e.key} onClick={() => exportCsv(e.key)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Export {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* Import */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-700">Import</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select value={entity} onChange={(e) => { setEntity(e.target.value); setResult(null); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
            {ENTITIES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50" />
          <button onClick={() => download(`${entity}-template.csv`, spec.template)} className="text-sm text-brand-600 hover:underline">Download template</button>
        </div>

        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6}
          placeholder={`Paste CSV or choose a file…\n${spec.template}`}
          className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs outline-none focus:border-brand-500" />

        <div className="mt-3 flex items-center gap-3">
          <button disabled={busy || !csv.trim() || !can(spec.create)} onClick={runImport}
            className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
            {busy ? 'Importing…' : `Import ${spec.label}`}
          </button>
          {!can(spec.create) && <span className="text-xs text-gray-400">You don't have permission to create {spec.label.toLowerCase()}.</span>}
        </div>

        {result && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-sm">
              <span className="font-medium text-emerald-700">{result.imported} imported</span>
              {result.failed > 0 && <span className="ml-3 font-medium text-red-600">{result.failed} failed</span>}
              <span className="ml-3 text-gray-500">of {result.total} rows</span>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded border border-red-100 bg-white">
                <table className="w-full text-xs">
                  <thead><tr className="bg-red-50 text-left text-red-700"><th className="px-2 py-1">Row</th><th className="px-2 py-1">Error</th></tr></thead>
                  <tbody>
                    {result.errors.map((er, i) => (
                      <tr key={i} className="border-t border-red-50"><td className="px-2 py-1 font-mono text-gray-500">{er.row}</td><td className="px-2 py-1 text-gray-700">{er.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
