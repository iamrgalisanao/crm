'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { formatMoney } from '../../../../lib/format';
import { PAGE } from '../../../../lib/ui';

interface Card {
  id: string;
  name: string;
  account: { id: string; name: string } | null;
  amount: string;
  currency: string;
  weighted: string;
  probability: number;
  owner: { id: string; name: string } | null;
  daysInStage: number;
  priority: string;
  stageId: string;
}
interface Column {
  stage: { id: string; name: string; defaultProbability: number; slaDays: number | null };
  count: number;
  total: string;
  weighted: string;
  cards: Card[];
}
interface Board {
  pipeline: { id: string; name: string };
  columns: Column[];
}

export default function PipelinePage() {
  const { can } = useAuth();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const editable = can('opportunities.edit');

  const load = useCallback(async () => {
    setLoading(true);
    try { setBoard(await apiFetch<Board>('/opportunities/board')); setError(null); }
    catch (e) { setError((e as ApiError).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function moveTo(stageId: string) {
    const id = dragId;
    setDragId(null);
    setOverStage(null);
    if (!id) return;
    const card = board?.columns.flatMap((c) => c.cards).find((c) => c.id === id);
    if (!card || card.stageId === stageId) return;
    // Optimistic: reload after the API confirms.
    try {
      await apiFetch(`/opportunities/${id}/stage`, { method: 'POST', body: { stageId } });
      load();
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  if (loading) return <div className="text-gray-400">Loading pipeline…</div>;
  if (error && !board) return <div className="text-red-600">{error}</div>;
  if (!board) return null;

  return (
    <div className={PAGE.full}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Pipeline</h1>
          <p className="mt-1 text-sm text-gray-500">{board.pipeline.name}{editable ? ' · drag cards to move stages' : ''}</p>
        </div>
        <Link href="/opportunities" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">List view</Link>
      </div>

      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {board.columns.map((col) => (
          <div
            key={col.stage.id}
            onDragOver={(e) => { if (editable) { e.preventDefault(); setOverStage(col.stage.id); } }}
            onDragLeave={() => setOverStage((s) => (s === col.stage.id ? null : s))}
            onDrop={() => moveTo(col.stage.id)}
            className={`flex w-72 shrink-0 flex-col rounded-xl border bg-gray-50 ${
              overStage === col.stage.id ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200'
            }`}
          >
            <div className="border-b border-gray-200 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">{col.stage.name}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500">{col.count}</span>
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {formatMoney(col.total, 'PHP')} · wtd {formatMoney(col.weighted, 'PHP')}
              </div>
            </div>

            <div className="flex-1 space-y-2 p-2" style={{ minHeight: 120 }}>
              {col.cards.length === 0 && <p className="px-1 py-6 text-center text-xs text-gray-400">Drop here</p>}
              {col.cards.map((card) => (
                <Link
                  key={card.id}
                  href={`/opportunities/${card.id}`}
                  draggable={editable}
                  onDragStart={() => setDragId(card.id)}
                  onDragEnd={() => { setDragId(null); setOverStage(null); }}
                  className={`block rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:shadow ${
                    dragId === card.id ? 'opacity-50' : ''
                  } ${editable ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  <div className="text-sm font-medium text-gray-900">{card.name}</div>
                  <div className="text-xs text-gray-500">{card.account?.name ?? 'No account'}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800">{formatMoney(card.amount, card.currency)}</span>
                    <span className="text-xs text-gray-500">{card.probability}%</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                    <span>{card.owner?.name ?? 'Unassigned'}</span>
                    <span className={card.daysInStage > 7 ? 'text-amber-600' : ''}>{card.daysInStage}d in stage</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
