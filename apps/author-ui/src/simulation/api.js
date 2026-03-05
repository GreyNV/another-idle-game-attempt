async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json();
}

export function simulateRun(payload) {
  return postJson('/api/simulate', payload);
}

export function diffSnapshots(payload) {
  return postJson('/api/diffSnapshots', payload);
}

export function simulateDefinition(payload) {
  return simulateRun(payload);
}

