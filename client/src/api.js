const BASE = "";

async function get(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`API ${path} failed: ${r.status}`);
  return r.json();
}

export const api = {
  topology: () => get("/api/topology"),
  device: (id) => get(`/api/devices/${encodeURIComponent(id)}`),
  search: (q) => get(`/api/search?q=${encodeURIComponent(q)}`),
};
