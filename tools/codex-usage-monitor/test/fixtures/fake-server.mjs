import readline from 'node:readline';
const input = readline.createInterface({ input: process.stdin });
input.on('line', line => {
  const request = JSON.parse(line); if (request.method === 'initialized') return;
  if (process.env.FAKE_RPC_MODE === 'timeout') return;
  if (process.env.FAKE_RPC_MODE === 'exit') { process.exit(1); return; }
  const respond = value => process.stdout.write(JSON.stringify({ id: request.id, ...value }) + '\n');
  process.stdout.write(JSON.stringify({ method: 'ignored/notification', params: { synthetic: true } }) + '\n');
  if (request.method === 'initialize') respond({ result: {} });
  else if (request.method === 'account/read') respond({ result: { account: { type: 'chatgpt', email: 'synthetic@example.test' } } });
  else if (request.method === 'account/usage/read') respond({ error: { code: -32601, message: 'SYNTHETIC_PRIVATE_ERROR_DETAILS' } });
  else respond({ result: { rateLimits: { primary: { usedPercent: 4, windowDurationMins: 10080, resetsAt: 1893456000 } } } });
});
