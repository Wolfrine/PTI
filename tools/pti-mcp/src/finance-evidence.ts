/**
 * Source-scoped financial evidence projection for PTI Finance.
 * A bank statement's physical cash movements and the classified posted ledger
 * are separate accounting views. Neither is a complete household balance sheet.
 *
 * This module is pure. It adds no Firestore reads, listeners, jobs or writes.
 */
type Obj=Record<string,unknown>;
export type BankStatementFact={
 account:string;month:string;from:string;to:string;sourceWindowId:string;rows:number;
 openingPaisa:number;closingPaisa:number;creditPaisa:number;debitPaisa:number;
};
const asObj=(v:unknown):Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Obj:{};
const integer=(v:unknown):number|null=>typeof v==='number'&&Number.isSafeInteger(v)?v:null;
const money=(v:unknown):number|null=>{const n=integer(v);return n!==null&&Math.abs(n)<=100_000_000_000_000?n:null;};
const nonNegative=(v:unknown)=>{const n=integer(v);return n!==null&&n>=0?n:null;};
const monthKey=(v:unknown):v is string=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(v);
const dateOnly=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
const endOfMonth=(m:string)=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).toISOString().slice(0,10);
const sum=(items:number[])=>items.reduce((total,value)=>total+value,0);
function safeCounts(value:unknown){
 const c=asObj(value);
 const transactions=nonNegative(c.transactions),review=nonNegative(c.review);
 const pending=nonNegative(c.pending),excluded=nonNegative(c.excluded);
 const posted=transactions!==null&&review!==null&&pending!==null&&excluded!==null
  ?Math.max(0,transactions-review-pending-excluded):null;
 return {transactions,posted,review,pending,excluded};
}
function boundBalance(row:unknown){
 const b=asObj(row),value=money(b.amountPaisa);
 if(typeof b.account!=='string'||!b.account||!['cash','investment','debt'].includes(String(b.kind))||
  !dateOnly(b.asOf)||value===null)return null;
 return {account:b.account,kind:b.kind as string,amountPaisa:value,asOf:b.asOf as string,
  basis:typeof b.basis==='string'?b.basis:null};
}
function bankRecord(f:BankStatementFact){
 if(!monthKey(f.month)||!dateOnly(f.from)||!dateOnly(f.to)||f.from>f.to||
    f.from.slice(0,7)!==f.month||f.to.slice(0,7)!==f.month||!f.account||
    ![f.openingPaisa,f.closingPaisa,f.creditPaisa,f.debitPaisa,f.rows].every(Number.isSafeInteger)||
    f.openingPaisa+f.creditPaisa-f.debitPaisa!==f.closingPaisa)return null;
 return {month:f.month,account:f.account,period:{from:f.from,to:f.to},
  sourceWindowId:f.sourceWindowId,sourceKind:'verified_bank_statement' as const,
  partialCalendarMonth:f.from!==f.month+'-01'||f.to!==endOfMonth(f.month),
  rows:f.rows,openingPaisa:f.openingPaisa,creditsPaisa:f.creditPaisa,debitsPaisa:f.debitPaisa,
  netMovementPaisa:f.closingPaisa-f.openingPaisa,closingPaisa:f.closingPaisa,
  arithmeticVerified:true};
}
/**
 * Null = not established. Zero = a genuine recorded zero, but the state of
 * income (observed / not classified / no coverage) remains explicit.
 */
export function financialEvidenceModel(monthRows:unknown[],balanceRows:unknown[],
 verifiedStatements:BankStatementFact[],today:string){
 const monthIndex=new Map<string,Obj>();
 for(const value of monthRows){
  const raw=asObj(value);
  if(!monthKey(raw.month))continue;
  const id=raw.month;
  if(id<=today.slice(0,7))monthIndex.set(id,raw);
 }
 const records=[...monthIndex.entries()].sort(([a],[b])=>a.localeCompare(b));
 const cashByMonth=new Map<string,ReturnType<typeof bankRecord>[]>();
 for(const fact of verifiedStatements.slice(0,120)){
  const bank=bankRecord(fact);if(!bank||bank.period.to>today)continue;
  const prior=cashByMonth.get(bank.month)||[];
  // Upstream source-window validation has already selected one per account-month.
  if(!prior.some(value=>value?.account===bank.account))prior.push(bank);
  cashByMonth.set(bank.month,prior);
 }
 const ledgerMonths=records.map(([month,raw])=>{
  const counts=safeCounts(raw.counts),coverage=asObj(raw.coverage);
  const earned=money(raw.earnedIncomePaisa),spending=money(raw.spendPaisa);
  const inflow=money(raw.inflowPaisa),outflow=money(raw.outflowPaisa);
  const repayment=money(raw.loanRepaymentPaisa),card=money(raw.cardSettlementPaisa);
  const reconciliation=asObj(raw.reconciliation),analysis=asObj(raw.monthlyAnalysis);
  const version=integer(raw.version);
  const currentReconciliation=version!==null&&reconciliation.reportVersion===version&&
   (reconciliation.status==='balanced'||reconciliation.status==='repaired');
  const currentAnalysis=currentReconciliation&&analysis.ledgerVersion===version&&
   analysis.reportVersion===version&&typeof analysis.headline==='string';
  const status=typeof coverage.status==='string'?coverage.status:'unknown';
  const cashStatements=(cashByMonth.get(month)||[]).filter(v=>v!==null);
  const bankCredits=cashStatements.length?sum(cashStatements.map(v=>v!.creditsPaisa)):null;
  const bankDebits=cashStatements.length?sum(cashStatements.map(v=>v!.debitsPaisa)):null;
  const bankNet=cashStatements.length?sum(cashStatements.map(v=>v!.netMovementPaisa)):null;
  const evidence=earned===null?'missing'
    :earned>0?'recorded'
    :(counts.transactions===null||counts.transactions===0?'no_transactions':'none_classified_in_observed_entries');
  return {month,sourceCoverage:status,counts,
   earnedIncome:{amountPaisa:earned,evidence},
   classifiedSpendingPaisa:spending,
   postedCash:{inflowPaisa:inflow,outflowPaisa:outflow,
      netPaisa:inflow===null||outflow===null?null:inflow-outflow,
      scope:'classified_posted_cash_events_only' as const},
   reportedRepayments:{loanPaisa:repayment,cardPaisa:card},
   verifiedStatementCash:{accounts:cashStatements,creditsPaisa:bankCredits,debitsPaisa:bankDebits,netPaisa:bankNet,
      scope:'only_accounts_with_verified_bank_statement' as const,
      allAccountsComplete:cashStatements.length>0&&cashStatements.every(v=>!v!.partialCalendarMonth)},
   reconciliation:{status:currentReconciliation?'current':'missing_or_stale',analysis:currentAnalysis?'current':'missing_or_stale'},
   coverageWarnings: {
     partial:status!=='observed',
     inProgressCount:nonNegative(coverage.inProgressCount),
     lockedCount:nonNegative(coverage.lockedCount),
     unparsedCount:nonNegative(coverage.unparsedCount),
     reviewCount:counts.review,
   },
   accountingNote:'Statement credits and debits include classified, review and transfer movements; posted ledger cash excludes review/pending/excluded records.'};
 });
 const knownBalances=new Map<string,NonNullable<ReturnType<typeof boundBalance>>>();
 for(const raw of balanceRows){
  const b=boundBalance(raw);if(!b)continue;const key=b.kind+'|'+b.account;
  const prior=knownBalances.get(key);if(!prior||b.asOf>prior.asOf)knownBalances.set(key,b);
 }
 const accounts=[...knownBalances.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.account.localeCompare(b.account));
 const grouped=(kind:string)=>accounts.filter(b=>b.kind===kind);
 const cash=grouped('cash'),investments=grouped('investment'),debts=grouped('debt');
 const totals={
  bankStatementMonths:[...cashByMonth.keys()].length,
  bankStatementAccountMonths:[...cashByMonth.values()].reduce((n,a)=>n+a.length,0),
  ledgerMonths:ledgerMonths.length,
  currentAnalyses:ledgerMonths.filter(m=>m.reconciliation.analysis==='current').length,
  reconciledMonths:ledgerMonths.filter(m=>m.reconciliation.status==='current').length,
  capturedTransactions:sum(ledgerMonths.map(m=>m.counts.transactions??0)),
  classifiedPostedTransactions:sum(ledgerMonths.map(m=>m.counts.posted??0)),
  reviewTransactions:sum(ledgerMonths.map(m=>m.counts.review??0)),
 };
 const currentCash=cash.length?sum(cash.map(b=>b.amountPaisa)):null;
 const latestCashDate=cash.length?cash.map(b=>b.asOf).sort()[0]:null;
 const missingDimensions=[
  ...(!investments.length?['investment_balances']:[]),
  ...(!debts.length?['outstanding_debt_balances']:[]),
  'unverified_other_accounts','unverified_future_obligations','household_asset_liability_completeness'
 ];
 const findings=[
  ...(totals.reviewTransactions?[{code:'classification_backlog',severity:'attention' as const,
   text:totals.reviewTransactions+' captured movements require classification; they remain part of bank cash movement even when excluded from classified spending.'}]:[]),
  ...(!investments.length||!debts.length?[{code:'net_worth_not_established',severity:'information' as const,
   text:'Complete assets and liabilities are not established; a household net-worth figure would be misleading.'}]:[]),
  ...(totals.currentAnalyses<totals.ledgerMonths?[{code:'analyses_missing_or_stale',severity:'attention' as const,
   text:'Some captured monthly ledger results have not yet been published against the current reconciled version.'}]:[])
 ];
 return {schemaVersion:1,asOf:today,
  source:'owner_verified_finance_workspace',
  scope:{classification:'captured_ledger_only',cash:'verified_statement_accounts_only',
   wealth:'incomplete',forecast:'not_established',sourcePeriod:'November 2023 onward, with gaps'},
  totals,accounts,
  position:{cashSnapshots:cash,investmentSnapshots:investments,debtSnapshots:debts,
   knownRecordedCashPaisa:currentCash,oldestCashSnapshot:latestCashDate,
   consolidatedNetWorthPaisa:null,availableToSpendPaisa:null},
  ledgerMonths,quality:{missingDimensions,findings}};
}
