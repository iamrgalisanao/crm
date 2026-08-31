// Built-in gazetteer of Philippine cities/provinces → coordinates, used to place
// free-text lead locations on the map without an external geocoding service.
// Keys are normalized (lowercase, no "city"/"province" suffix). Extend as needed.

export interface LatLng { lat: number; lng: number }

const GAZETTEER: Record<string, LatLng> = {
  // Metro Manila
  manila: { lat: 14.5995, lng: 120.9842 },
  'quezon': { lat: 14.676, lng: 121.0437 },
  makati: { lat: 14.5547, lng: 121.0244 },
  taguig: { lat: 14.5176, lng: 121.0509 },
  pasig: { lat: 14.5764, lng: 121.0851 },
  caloocan: { lat: 14.6577, lng: 120.9822 },
  mandaluyong: { lat: 14.5794, lng: 121.0359 },
  pasay: { lat: 14.5378, lng: 120.9896 },
  paranaque: { lat: 14.4793, lng: 121.0198 },
  'las pinas': { lat: 14.4499, lng: 120.9833 },
  muntinlupa: { lat: 14.4081, lng: 121.0415 },
  marikina: { lat: 14.6507, lng: 121.1029 },
  valenzuela: { lat: 14.7, lng: 120.983 },
  'san juan': { lat: 14.6019, lng: 121.0355 },
  navotas: { lat: 14.6667, lng: 120.9417 },
  malabon: { lat: 14.6625, lng: 120.9567 },
  pateros: { lat: 14.5417, lng: 121.0669 },
  // Luzon
  baguio: { lat: 16.4023, lng: 120.596 },
  angeles: { lat: 15.145, lng: 120.5887 },
  olongapo: { lat: 14.8386, lng: 120.2842 },
  'san fernando': { lat: 15.0349, lng: 120.6899 },
  dagupan: { lat: 16.043, lng: 120.3336 },
  tarlac: { lat: 15.4755, lng: 120.5963 },
  cabanatuan: { lat: 15.4867, lng: 120.967 },
  malolos: { lat: 14.8433, lng: 120.8114 },
  meycauayan: { lat: 14.7369, lng: 120.9603 },
  'san jose del monte': { lat: 14.8139, lng: 121.0453 },
  antipolo: { lat: 14.5878, lng: 121.1759 },
  batangas: { lat: 13.7565, lng: 121.0583 },
  lipa: { lat: 13.9411, lng: 121.1624 },
  calamba: { lat: 14.2117, lng: 121.1653 },
  'santa rosa': { lat: 14.3122, lng: 121.1114 },
  'sta rosa': { lat: 14.3122, lng: 121.1114 },
  bacoor: { lat: 14.459, lng: 120.9366 },
  imus: { lat: 14.4297, lng: 120.9367 },
  dasmarinas: { lat: 14.3294, lng: 120.9367 },
  cavite: { lat: 14.4791, lng: 120.8969 },
  lucena: { lat: 13.9373, lng: 121.617 },
  naga: { lat: 13.6218, lng: 123.1948 },
  legazpi: { lat: 13.1391, lng: 123.7438 },
  legaspi: { lat: 13.1391, lng: 123.7438 },
  vigan: { lat: 17.5747, lng: 120.3869 },
  laoag: { lat: 18.1978, lng: 120.5936 },
  tuguegarao: { lat: 17.6132, lng: 121.727 },
  'puerto princesa': { lat: 9.7392, lng: 118.7353 },
  pampanga: { lat: 15.0794, lng: 120.62 },
  bulacan: { lat: 14.7943, lng: 120.8799 },
  laguna: { lat: 14.1407, lng: 121.4692 },
  rizal: { lat: 14.6037, lng: 121.3084 },
  // Visayas
  cebu: { lat: 10.3157, lng: 123.8854 },
  mandaue: { lat: 10.3236, lng: 123.9223 },
  'lapu-lapu': { lat: 10.3103, lng: 123.9494 },
  iloilo: { lat: 10.7202, lng: 122.5621 },
  bacolod: { lat: 10.6407, lng: 122.9689 },
  tacloban: { lat: 11.2444, lng: 125.0048 },
  ormoc: { lat: 11.0064, lng: 124.6075 },
  roxas: { lat: 11.5853, lng: 122.7511 },
  dumaguete: { lat: 9.3103, lng: 123.3081 },
  // Mindanao
  davao: { lat: 7.1907, lng: 125.4553 },
  'cagayan de oro': { lat: 8.4542, lng: 124.6319 },
  zamboanga: { lat: 6.9214, lng: 122.079 },
  'general santos': { lat: 6.1164, lng: 125.1716 },
  butuan: { lat: 8.9475, lng: 125.5406 },
  iligan: { lat: 8.228, lng: 124.2452 },
  cotabato: { lat: 7.2047, lng: 124.231 },
  tagum: { lat: 7.4478, lng: 125.8078 },
};

export const PH_CENTER: LatLng = { lat: 12.8797, lng: 121.774 };

function normalize(loc: string): string {
  return loc
    .toLowerCase()
    .split(',')[0] // take the part before a comma ("Makati, Metro Manila" → "makati")
    .replace(/\bcity\b|\bprovince\b|\bmetro\b/g, '')
    .replace(/[^a-z\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve a free-text location to coordinates, or null if unknown. */
export function geocodePH(location: string): LatLng | null {
  const norm = normalize(location);
  if (!norm) return null;
  if (GAZETTEER[norm]) return GAZETTEER[norm];
  // Fuzzy: a gazetteer key contained in the location text, or vice versa (min 4 chars).
  for (const key of Object.keys(GAZETTEER)) {
    if (key.length >= 4 && (norm.includes(key) || key.includes(norm))) return GAZETTEER[key];
  }
  return null;
}

export const LEAD_STATUS_COLORS: Record<string, string> = {
  new: '#64748b',
  contacted: '#3b82f6',
  attempting_contact: '#6366f1',
  qualified: '#22c55e',
  unqualified: '#9ca3af',
  converted: '#10b981',
  lost: '#ef4444',
  spam: '#d1d5db',
};
