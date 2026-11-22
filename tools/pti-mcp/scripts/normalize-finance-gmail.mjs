// Prepare a normalized PTI MCP request in the authenticated Gmail worker.
// Keep Gmail bodies, addresses and attachment bytes in the worker's memory.
const HDFC_DOMAINS = new Set(['hdfcbank.net', 'hdfcbank.com', 'hdfcbank.bank.in']);
const DEBIT = /(?:Rs\.?|INR)\s*([\d,]+\.\d{2})\s+has been debited from account\s+\*{2,}(\d{4})\s+to VPA\s+\S+\s+on\s+(\d{2})-(\d{2})-(\d{2})\.?\s+Your UPI transaction reference number is\s+(\d{10,16})(?=[.\s]|$)/i;
const PAISA_LIMIT = 100000000000;

function headers(message) {
  return new Map((message?.payload?.headers ?? []).map(({name, value}) => [name.toLowerCase(), value]));
}

function senderDomain(value) {
  return /@([a-z\d.-]+)>?\s*$/i.exec(value ?? '')?.[1].toLowerCase();
}

function dmarcMatches(value, domain) {
  return String(value ?? '').split(';').some(part => {
    const matches = /\bdmarc=pass\b.*\bheader\.from=([\w.-]+)/i.exec(part);
    return matches?.[1].toLowerCase() === domain;
  });
}

function paisa(digits) {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})\.\d{2}$/.test(digits)) return null;
  const amount = BigInt(digits.replace(/[,.]/g, ''));
  return amount > 0n && amount <= BigInt(PAISA_LIMIT) ? Number(amount) : null;
}

export function normalizeHdfcUpiDebit(message, householdSavingsAliases, window) {
  const field = headers(message);
  const domain = senderDomain(field.get('from'));
  if (!HDFC_DOMAINS.has(domain) || !dmarcMatches(field.get('authentication-results'), domain)) return null;
  const received = new Date(Number(message.internal_date));
  if (Number.isNaN(received.getTime()) || !/^[a-z\d]{10,64}$/i.test(message.id ?? '')) return null;
  const match = DEBIT.exec(String(message.snippet ?? ''));
  if (!match) return null;

  const [, amount, lastFour, day, month, year, reference] = match;
  const account = householdSavingsAliases[lastFour];
  if (!account || !/^[a-z\d][a-z\d-]{0,79}$/.test(account)) return null;
  const occurredOn = `20${year}-${month}-${day}`;
  const date = new Date(`${occurredOn}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== occurredOn) return null;
  if (occurredOn < window.from || occurredOn > window.to) return null;
  const amountPaisa = paisa(amount);
  if (amountPaisa === null) return null;

  return {
    messageId: message.id,
    receivedAt: received.toISOString(),
    source: 'hdfc',
    sourceType: 'bank_alert',
    parserVersion: 'hdfc-upi-debit-v1',
    ownerScope: 'confirmed',
    coverage: 'observed',
    entries: [{
      rowKey: 'upi-debit',
      occurredOn,
      amountPaisa,
      direction: 'debit',
      kind: 'unknown',
      status: 'review',
      account,
      accountKind: 'cash',
      references: [{namespace: 'upi', value: reference}],
    }],
  };
}
