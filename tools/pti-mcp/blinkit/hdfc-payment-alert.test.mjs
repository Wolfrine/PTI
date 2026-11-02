import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBlinkitBankAlert} from './hdfc-payment-alert.mjs';

const fixture = overrides => ({
  gmailMessageId: '0123456789abcdef', from: 'HDFC Bank InstaAlerts <alerts@hdfcbank.bank.in>',
  subject: '❗  You have done a UPI txn. Check details!', receivedAt: '2026-11-01T08:14:12.000Z',
  authenticationResults: 'mx.google.com; dkim=pass header.i=@hdfcbank.bank.in header.s=sample; dmarc=pass header.from=hdfcbank.bank.in',
  text: '<p>Rs.840.00 is debited from your account PRIVATE_ACCOUNT towards VPA PRIVATE_VPA (Blinkit) on 01-11-26.<br>UPI transaction reference PRIVATE_REFERENCE</p>',
  ...overrides
});

test('extracts only minimal source evidence and preserves date precision', () => {
  const result = parseBlinkitBankAlert(fixture());
  assert.deepEqual(result, {ok:true,eventSource:{schemaVersion:1,kind:'payment-alert',provider:'blinkit',merchant:'Blinkit',gmailMessageId:'0123456789abcdef',amount:840,currency:'INR',emailReceivedAt:'2026-11-01T08:14:12.000Z',transactionDateText:'01-11-26',transactionTimezone:'Asia/Kolkata'}});
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|paymentAt|purchasedAt/);
});
test('accepts authenticated sender case, HTML entities and Indian grouping', () => {
  const result = parseBlinkitBankAlert(fixture({from:'ALERTS@HDFCBANK.BANK.IN',text:'Rs.1,23,456.50 is debited from your account towards VPA hidden (Blinkit) on 01-11-26.&#160;'}));
  assert.equal(result.eventSource.amount, 123456.5);
});
test('requires actual sender domain and authentication, not lookalikes', () => {
  for (const from of ['alerts@hdfcbank.bank.in.evil.test','attacker@test.invalid','a@test.invalid, alerts@hdfcbank.bank.in'])
    assert.equal(parseBlinkitBankAlert(fixture({from})).reason, 'untrusted_sender');
  for (const authenticationResults of ['', 'mx.google.com; spf=pass', 'mx.google.com; dmarc=pass header.from=hdfcbank.bank.in.evil.test', 'mx.google.com; dkim=pass header.i=@hdfcbank.bank.in.evil.test'])
    assert.equal(parseBlinkitBankAlert(fixture({authenticationResults})).reason, 'unverified_sender');
});
test('either exact domain DMARC or DKIM pass is sufficient', () => {
  for (const authenticationResults of ['mx.google.com; dmarc=pass header.from=hdfcbank.bank.in','mx.google.com; dkim=pass header.d=hdfcbank.bank.in'])
    assert.equal(parseBlinkitBankAlert(fixture({authenticationResults})).ok, true);
});
test('other merchant with Blinkit promotional mention is a no-op', () => {
  const text = fixture().text.replace('(Blinkit)', '(Another Merchant)') + ' Shop on Blinkit.';
  assert.equal(parseBlinkitBankAlert(fixture({text})).reason, 'not_blinkit_debit');
});
test('a separate merchant descriptor cannot be attached to the debit', () => {
  const text = fixture().text.replace('(Blinkit)', '(Another Merchant)') + ' Offers towards VPA example (Blinkit) on 01-11-26.';
  assert.equal(parseBlinkitBankAlert(fixture({text})).reason, 'ambiguous_transaction');
});
test('credits, forwards and unsupported subjects are not accepted', () => {
  assert.equal(parseBlinkitBankAlert(fixture({text:fixture().text.replace('debited','credited')})).reason, 'not_blinkit_debit');
  assert.equal(parseBlinkitBankAlert(fixture({subject:'Fwd: '+fixture().subject})).reason, 'unsupported_subject');
});
test('multiple debits are ambiguous and never merged', () => {
  assert.equal(parseBlinkitBankAlert(fixture({text:fixture().text+fixture().text})).reason, 'ambiguous_transaction');
});
test('invalid dates and malformed amounts are rejected', () => {
  assert.equal(parseBlinkitBankAlert(fixture({text:fixture().text.replace('01-11-26','31-02-26')})).reason, 'invalid_transaction_date');
  assert.equal(parseBlinkitBankAlert(fixture({text:fixture().text.replace('840.00','84,0.00')})).reason, 'invalid_amount');
});
test('scripts and styles cannot supply the transaction merchant', () => {
  const text='<script>'+fixture().text+'</script><p>Welcome to Blinkit</p>';
  assert.equal(parseBlinkitBankAlert(fixture({text})).ok, false);
});
test('invalid source IDs and timestamps cannot become event keys', () => {
  assert.equal(parseBlinkitBankAlert(fixture({gmailMessageId:'not/a/path'})).reason, 'invalid_source');
  assert.equal(parseBlinkitBankAlert(fixture({receivedAt:'2026-11-01'})).reason, 'invalid_source');
});
