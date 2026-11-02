// Bank mail is a wake-up signal, never evidence of purchased products.
const SENDER = 'alerts@hdfcbank.bank.in';
const DOMAIN = 'hdfcbank.bank.in';
const failure = reason => ({ok: false, reason});

function mailbox(value) {
  const text = String(value ?? '').trim();
  if (/[\r\n,]/.test(text)) return null;
  const match = text.match(/^[^<>]*<([^<>]+)>$/);
  return (match ? match[1] : text).trim().toLowerCase();
}

function authenticated(value) {
  // Supply the actual Gmail Authentication-Results header, not body text.
  return String(value ?? '').split(';').some(part => {
    if (/^\s*dmarc=pass\b/i.test(part))
      return /\bheader\.from="?hdfcbank\.bank\.in"?(?=\s|$)/i.test(part);
    if (/^\s*dkim=pass\b/i.test(part))
      return /\bheader\.(?:i|d)="?@?hdfcbank\.bank\.in"?(?=\s|$)/i.test(part);
    return false;
  });
}

function plainText(value) {
  return String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
      const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ' ';
    })
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/gi, (_, name) =>
      ({nbsp:' ', amp:'&', lt:'<', gt:'>', quot:'"', apos:"'"})[name.toLowerCase()])
    .replace(/\s+/g, ' ').trim();
}

function validDisplayedDate(value) {
  const [day, month, year] = value.split('-').map(Number);
  // Validate the displayed date only. Do not synthesize a purchase timestamp.
  return month >= 1 && month <= 12 && day >= 1 &&
    day <= new Date(Date.UTC(2000 + year, month, 0)).getUTCDate();
}

/** Accept only an authenticated, single Blinkit debit in the observed HDFC format.
 * Unrecognized formats are deliberately left for review. No body/financial IDs
 * are returned. receivedAt must be Gmail's actual message arrival timestamp.
 */
export function parseBlinkitBankAlert(input) {
  if (!input || !/^[a-f0-9]{16}$/i.test(input.gmailMessageId ?? '') ||
      typeof input.receivedAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(input.receivedAt) ||
      !Number.isFinite(Date.parse(input.receivedAt)) ||
      typeof input.text !== 'string' || input.text.length > 100000)
    return failure('invalid_source');
  if (mailbox(input.from) !== SENDER) return failure('untrusted_sender');
  if (!authenticated(input.authenticationResults)) return failure('unverified_sender');
  const subject = String(input.subject ?? '').replace(/^\s*❗\uFE0F?\s*/, '').replace(/\s+/g, ' ').trim();
  if (subject !== 'You have done a UPI txn. Check details!') return failure('unsupported_subject');

  const text = plainText(input.text);
  const debits = [...text.matchAll(/(?:\bRs\.?|\bINR|₹)\s*(\d[\d,]*(?:\.\d{1,2})?)\s+is\s+debited\b/gi)];
  if (debits.length !== 1) return failure(debits.length ? 'ambiguous_transaction' : 'not_blinkit_debit');
  const debit = debits[0];
  const amountText = debit[1];
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(amountText))
    return failure('invalid_amount');
  const amount = Number(amountText.replaceAll(',', ''));
  if (!(amount > 0 && amount <= 100000)) return failure('invalid_amount');
  const transaction = text.slice(debit.index + debit[0].length, debit.index + debit[0].length + 1000);
  const merchant = [...transaction.matchAll(/\btowards\s+VPA\s+[^()]{1,200}\(\s*([^()]{1,100}?)\s*\)\s+on\s+(\d{2}-\d{2}-\d{2})(?=[.\s]|$)/gi)];
  if (merchant.length !== 1) return failure(merchant.length ? 'ambiguous_transaction' : 'not_blinkit_debit');
  if (merchant[0][1].trim().toLowerCase() !== 'blinkit') return failure('not_blinkit_debit');
  if (!validDisplayedDate(merchant[0][2])) return failure('invalid_transaction_date');
  return {ok: true, eventSource: {
    schemaVersion: 1, kind: 'payment-alert', provider: 'blinkit', merchant: 'Blinkit',
    gmailMessageId: input.gmailMessageId.toLowerCase(), amount, currency: 'INR',
    emailReceivedAt: new Date(input.receivedAt).toISOString(),
    transactionDateText: merchant[0][2], transactionTimezone: 'Asia/Kolkata'
  }};
}

export const blinkitAlertSender = SENDER;
export const blinkitAlertAuthenticationDomain = DOMAIN;
