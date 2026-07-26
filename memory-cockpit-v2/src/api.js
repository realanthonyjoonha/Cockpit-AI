export async function api(path) {
  const res = await fetch(`/api/${path}`);
  // session expired mid-use → the server now serves the login page; reload into it
  if (res.status === 401) { window.location.reload(); throw new Error('signed out'); }
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(`/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { window.location.reload(); throw new Error('signed out'); }
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}
