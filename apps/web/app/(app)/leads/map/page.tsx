'use client';

import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import { apiFetch, ApiError } from '../../../../lib/api';
import { PAGE } from '../../../../lib/ui';
import { geocodePH, PH_CENTER, LEAD_STATUS_COLORS } from '../../../../lib/ph-geo';
import { statusLabel } from '../../../../lib/badges';

interface LocationGroup {
  location: string;
  total: number;
  statuses: Record<string, number>;
}

function dominant(statuses: Record<string, number>): string {
  return Object.entries(statuses).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'new';
}

export default function LeadsMapPage() {
  const [groups, setGroups] = useState<LocationGroup[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);

  useEffect(() => {
    apiFetch<LocationGroup[]>('/leads/by-location')
      .then(setGroups)
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Initialize the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([PH_CENTER.lat, PH_CENTER.lng], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw markers whenever data or the status filter changes.
  const draw = useCallback(() => {
    const L = LRef.current;
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!L || !layer || !map) return;
    layer.clearLayers();

    const points: [number, number][] = [];
    for (const g of groups) {
      const coord = geocodePH(g.location);
      if (!coord) continue;
      const count = filter === 'all' ? g.total : g.statuses[filter] ?? 0;
      if (count <= 0) continue;
      const color = filter === 'all' ? LEAD_STATUS_COLORS[dominant(g.statuses)] : LEAD_STATUS_COLORS[filter];
      const radius = Math.min(34, 7 + Math.sqrt(count) * 6);

      const breakdown = Object.entries(g.statuses)
        .sort((a, b) => b[1] - a[1])
        .map(([s, n]) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${LEAD_STATUS_COLORS[s] ?? '#999'};margin-right:6px"></span>${statusLabel(s)}: <b>${n}</b>`)
        .join('<br/>');

      L.circleMarker([coord.lat, coord.lng], {
        radius,
        color: '#ffffff',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.75,
      })
        .bindPopup(`<div style="font-size:13px"><b>${g.location}</b> — ${g.total} lead${g.total === 1 ? '' : 's'}<br/><br/>${breakdown}</div>`)
        .bindTooltip(`${g.location} (${count})`)
        .addTo(layer);
      points.push([coord.lat, coord.lng]);
    }

    if (points.length > 0) {
      map.fitBounds(points as any, { padding: [40, 40], maxZoom: 11 });
    }
  }, [groups, filter]);

  useEffect(() => { if (ready) draw(); }, [ready, draw]);

  const matched = groups.filter((g) => geocodePH(g.location));
  const unmatched = groups.filter((g) => !geocodePH(g.location));
  const statusesPresent = Array.from(new Set(groups.flatMap((g) => Object.keys(g.statuses))));

  return (
    <div className={PAGE.wide}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Lead map</h1>
          <p className="mt-1 text-sm text-gray-500">
            {matched.length} mapped location{matched.length === 1 ? '' : 's'} · colored by status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
            <option value="all">All statuses (dominant color)</option>
            {statusesPresent.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
          <Link href="/leads" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">List view</Link>
        </div>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {!loading && groups.length === 0 && !error && (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No leads with a location yet. Add a location when creating leads to see them here.
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
        {statusesPresent.map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: LEAD_STATUS_COLORS[s] ?? '#999' }} />
            {statusLabel(s)}
          </span>
        ))}
      </div>

      <div ref={containerRef} className="mt-3 h-[560px] w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50" />

      {unmatched.length > 0 && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-700">Unmapped locations <span className="font-normal text-gray-400">· not recognized as a Philippine place</span></h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {unmatched.map((g) => (
              <span key={g.location} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{g.location} ({g.total})</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
