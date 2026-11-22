const senderSources = new Map([
  ['hdfcbank.net', 'hdfc'],
  ['hdfcbank.com', 'hdfc'],
  ['hdfcbank.bank.in', 'hdfc'],
  ['cdslstatement.com', 'cdsl'],
  ['groww.in', 'groww'],
]);

// Input is the top-level header list from an authenticated Gmail connector read.
export function verifiedFinanceGmailSender(message) {
  const headers = message?.payload?.headers;
  if (!Array.isArray(headers)) return null;
  const from = headers.filter(header => header?.name?.toLowerCase() === 'from');
  const domain = from.length === 1 && /@([a-z0-9.-]+)>?\s*$/i.exec(from[0].value ?? '')?.[1].toLowerCase();
  const source = senderSources.get(domain);
  if (!source) return null;
  const receiver = headers.find(header => header?.name?.toLowerCase() === 'authentication-results' &&
    /^\s*mx\.google\.com\s*;/i.test(header.value ?? ''));
  const result = receiver?.value?.split(';').map(field => field.trim())
    .find(field => /^dmarc=pass(?:\s|$)/i.test(field));
  const alignedDomain = result?.match(/\bheader\.from=([a-z0-9.-]+)(?:\s|$)/i)?.[1].toLowerCase();
  return alignedDomain === domain ? { source, domain, authentication: 'gmail_dmarc_pass' } : null;
}
