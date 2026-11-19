// Register the hosted sign-in origin; Firestore rules are released separately.
const project = 'pti-app-2ab59';
const token = process.env.ACCESS_TOKEN;
const origin = process.env.PUBLIC_ORIGIN;
if (!token || !origin) throw new Error('Deployment identity and public origin are required.');
async function request(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${new URL(url).hostname}: ${response.status} ${result.error?.message || ''}`);
  return result;
}
const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
const config = await request(configUrl);
const host = new URL(origin).hostname;
if (!config.authorizedDomains.includes(host)) await request(`${configUrl}?updateMask=authorizedDomains`, 'PATCH', { authorizedDomains: [...config.authorizedDomains, host] });
console.log('Hosted sign-in origin registered; global Firestore rules unchanged.');
