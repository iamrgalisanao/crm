'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProductType } from '@crm/shared';
import { apiFetch, ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { formatMoney } from '../../../lib/format';
import { PAGE } from '../../../lib/ui';

interface Product {
  id: string;
  sku: string;
  name: string;
  category: { id: string; name: string } | null;
  type: string;
  unit: string;
  defaultPrice: string;
  currency: string;
  taxRate: { id: string; name: string; rateBp: number } | null;
  isActive: boolean;
}
interface Category { id: string; name: string }
interface TaxRate { id: string; name: string; rateBp: number }

const TYPES = Object.values(ProductType);

export default function ProductsPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const manage = can('products.manage');

  const load = useCallback(async (query: string, cat: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      if (cat) qs.set('categoryId', cat);
      const res = await apiFetch<{ data: Product[]; pagination: { total: number } }>(`/products?${qs}`);
      setRows(res.data);
      setTotal(res.pagination.total);
      setError(null);
    } catch (e) { setError((e as ApiError).message); }
    finally { setLoading(false); }
  }, []);

  const loadMeta = useCallback(() => {
    apiFetch<Category[]>('/product-categories').then(setCategories).catch(() => {});
    apiFetch<TaxRate[]>('/tax-rates').then(setTaxRates).catch(() => {});
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => {
    const t = setTimeout(() => load(q, categoryId), 250);
    return () => clearTimeout(t);
  }, [q, categoryId, load]);

  async function toggleActive(p: Product) {
    await apiFetch(`/products/${p.id}`, { method: 'PATCH', body: { isActive: !p.isActive } });
    load(q, categoryId);
  }

  return (
    <div className={PAGE.wide}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Products &amp; Services</h1>
          <p className="mt-1 text-sm text-gray-500">{total} catalog items</p>
        </div>
        {manage && (
          <button onClick={() => setShowForm((s) => !s)} className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600">
            {showForm ? 'Close' : 'New item'}
          </button>
        )}
      </div>

      {showForm && (
        <NewProductForm categories={categories} taxRates={taxRates}
          onCreated={() => { setShowForm(false); load(q, categoryId); }}
          onCategoryAdded={loadMeta} />
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU or name…"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">SKU</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium text-right">Price</th>
              <th className="px-4 py-2.5 font-medium">Tax</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>}
            {error && !loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-red-600">{error}</td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No catalog items yet.</td></tr>}
            {!loading && !error && rows.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{p.sku}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}<span className="ml-2 text-xs text-gray-400">/ {p.unit}</span></td>
                <td className="px-4 py-2.5 text-gray-600">{p.category?.name ?? '—'}</td>
                <td className="px-4 py-2.5"><span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">{p.type}</span></td>
                <td className="px-4 py-2.5 text-right text-gray-800">{formatMoney(p.defaultPrice, p.currency)}</td>
                <td className="px-4 py-2.5 text-gray-600">{p.taxRate ? `${p.taxRate.rateBp / 100}%` : '—'}</td>
                <td className="px-4 py-2.5">
                  {manage ? (
                    <button onClick={() => toggleActive(p)}
                      className={`rounded-full px-2 py-0.5 text-xs ${p.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </button>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${p.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{p.isActive ? 'Active' : 'Inactive'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewProductForm({
  categories, taxRates, onCreated, onCategoryAdded,
}: { categories: Category[]; taxRates: TaxRate[]; onCreated: () => void; onCategoryAdded: () => void }) {
  const [f, setF] = useState({ sku: '', name: '', type: 'product', unit: 'unit', defaultPrice: '', cost: '', categoryId: '', taxRateId: '' });
  const [newCat, setNewCat] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = 'rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500';

  async function addCategory() {
    if (!newCat.trim()) return;
    await apiFetch('/product-categories', { method: 'POST', body: { name: newCat.trim() } });
    setNewCat('');
    onCategoryAdded();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      await apiFetch('/products', {
        method: 'POST',
        body: {
          sku: f.sku,
          name: f.name,
          type: f.type,
          unit: f.unit || undefined,
          defaultPrice: f.defaultPrice || undefined,
          cost: f.cost || undefined,
          categoryId: f.categoryId || undefined,
          taxRateId: f.taxRateId || undefined,
        },
      });
      onCreated();
    } catch (e) { setErr((e as ApiError).message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-4">
      <input required placeholder="SKU" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} className={input} />
      <input required placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${input} sm:col-span-3`} />
      <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={input}>
        {Object.values(ProductType).map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
      </select>
      <input placeholder="Unit (e.g. hour, license)" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className={input} />
      <input placeholder="Price (e.g. 1500)" value={f.defaultPrice} onChange={(e) => setF({ ...f, defaultPrice: e.target.value })} className={input} />
      <input placeholder="Cost (optional)" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} className={input} />
      <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} className={input}>
        <option value="">Category…</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select value={f.taxRateId} onChange={(e) => setF({ ...f, taxRateId: e.target.value })} className={input}>
        <option value="">Tax…</option>
        {taxRates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <div className="col-span-2 flex items-center gap-2">
        <input placeholder="+ new category" value={newCat} onChange={(e) => setNewCat(e.target.value)} className={`${input} flex-1`} />
        <button type="button" onClick={addCategory} className="rounded-lg border border-gray-300 px-2.5 py-2 text-xs text-gray-600 hover:bg-gray-50">Add</button>
      </div>
      <div className="col-span-2 flex items-center gap-3 sm:col-span-4">
        <button type="submit" disabled={saving} className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          {saving ? 'Saving…' : 'Create item'}
        </button>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </form>
  );
}
