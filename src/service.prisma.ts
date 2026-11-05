import { randomUUID } from 'node:crypto';
import { one, all, run, transaction } from './prisma-db.ts';
import { calculateLoan, contributions } from './domain/money.ts';
import { classifyAccount } from './domain/accounts.ts';
import { scheduleByAmount, scheduleByCount, manualSchedule, scheduleDates } from './domain/schedule.ts';

import { db } from './prisma-db.ts';
export { db };
export const uuid = () => randomUUID();
export const now = () => new Date().toISOString();
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
export const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
export function date(value: unknown): string { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Enter a valid date.'); scheduleDates(value as string,1,1); return value as string; }
export function str(value: unknown, label: string, max = 255): string { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`Enter ${label}.`); return (value as string).trim(); }
export function optional(value: unknown, max = 2000) { return typeof value === 'string' ? value.trim().slice(0,max) : ''; }
export function money(value: unknown): bigint { if (typeof value !== 'string' || !/^\d{1,13}(\.\d{1,2})?$/.test(value)) fail('Enter a valid rupee amount.'); const [a,b=''] = (value as string).split('.'); const n=BigInt(a)*100n+BigInt(b.padEnd(2,'0')); if(n>BigInt(Number.MAX_SAFE_INTEGER))fail('Amount is too large.'); return n; }
export function num(n: bigint): number { if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))fail('Amount is too large.'); return Number(n); }
export async function audit(actor: string,entity: string,id: string,action: string,detail='') { await run(db,'INSERT INTO audit_events VALUES (?,?,?,?,?,?,?)',uuid(),actor,entity,id,action,detail,now()); }
export async function idempotent(key: string|undefined,actor: string,fn:()=>Promise<any>) { if(!key||!/^[a-f0-9-]{36}$/.test(key))fail('Idempotency key required.'); return await transaction(db,async()=>{const old=await one(db,'SELECT response_json FROM request_keys WHERE key=? AND actor_id=?',key,actor);if(old)return JSON.parse(old.response_json);const result=await fn();await run(db,'INSERT INTO request_keys VALUES (?,?,?,?)',key,actor,JSON.stringify(result),now());return result;}); }

export function scheduleInput(data: any, face: bigint, required: boolean) {
  if (!data.schedule && !required) return [];
  const s=data.schedule;
  if(!s||!['COUNT','AMOUNT','MANUAL'].includes(s.mode))fail('Choose an installment schedule.');
  let amounts: bigint[];
  if(s.mode==='COUNT') amounts=scheduleByCount(face,Number(s.count));
  else if(s.mode==='AMOUNT')amounts=scheduleByAmount(face,money(s.amount));
  else amounts=manualSchedule(face,(s.groups||[]).map((g:any)=>({amount:money(g.amount),count:Number(g.count)})));
  const dates=scheduleDates(date(s.firstDate),amounts.length,Number(s.intervalDays),s.weekday===''||s.weekday==null?undefined:Number(s.weekday));
  const changed=new Set<number>();
  if(Array.isArray(s.overrides))for(const change of s.overrides){if(!Number.isInteger(change.index)||change.index<0||change.index>=dates.length||changed.has(change.index))fail('Invalid schedule override.');changed.add(change.index);if(change.date!==undefined)dates[change.index]=date(change.date);if(change.amount!==undefined)amounts[change.index]=money(change.amount);}
  if(amounts.some(x=>x<=0n)||amounts.reduce((n,x)=>n+x,0n)!==face)fail('Edited installment amounts must sum exactly to the recorded face value.');
  return amounts.map((amount,i)=>({date:dates[i],amount:num(amount),overridden:changed.has(i)}));
}
export async function createAccount(data:any,actor:string) {
  const face=money(data.face),rate=str(data.rate,'the interest rate',20);
  if(!/^\d{1,2}(\.\d{1,4})?$/.test(rate))fail('Rate must be below 100%.');
  const [whole,fraction='']=rate.split('.');
  const loan=calculateLoan(face,BigInt(whole+fraction),10n**BigInt(fraction.length),'half-up');
  const type=data.type,arrangement=data.arrangement,partners=Array.isArray(data.partners)?data.partners:[];
  const basis=data.basis==='NET_CASH'?'NET_CASH':'FACE_SHARE';
  const expected=basis==='NET_CASH'?loan.netCash:loan.face;
  const partnerEntries=partners.map((p:any)=>({id:str(p.partyId,'an investor'),amount:money(p.amount)}));
  if((type==='SOLO_SELF_MANAGED'||arrangement==='OWN_STAKE_EXTERNALLY_MANAGED')&&partners.length)fail('This account cannot have other investors.');
  if((type==='JOINT_SELF_MANAGED'||arrangement==='MANAGED_POOL')&&!partners.length)fail('Add at least one investor.');
  const remainder=expected-partnerEntries.reduce((n:bigint,p:any)=>n+p.amount,0n);
  if(remainder<=0n)fail('Ayyappan must have a positive contribution until zero-capital management is approved.');
  const entries=[{id:actor,amount:remainder},...partnerEntries];
  const scope=classifyAccount({type,arrangement,borrowerId:data.borrowerId||undefined,externalManagerId:data.managerId||undefined,ownerId:actor,contributorIds:entries.map(x=>x.id),hasSchedule:!!data.schedule});
  if(scope.scheduleRequired&&!data.schedule)fail('A schedule is required.');
  for(const entry of entries)if(!await one(db,'SELECT id FROM parties WHERE id=?',entry.id))fail('Select a valid investor.');
  if(data.borrowerId&&!await one(db,'SELECT id FROM parties WHERE id=?',data.borrowerId))fail('Select a valid borrower.');
  if(data.managerId&&!await one(db,'SELECT id FROM parties WHERE id=?',data.managerId))fail('Select a valid manager.');
  const splits=contributions(loan,basis,entries),installments=scheduleInput(data,face,scope.scheduleRequired);
  const id=uuid(),reference=`LN-${Date.now().toString(36).toUpperCase()}-${id.slice(0,4).toUpperCase()}`,stamp=now();
  await run(db,'INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,reference,type,arrangement,data.borrowerId||null,data.managerId||null,num(face),num(loan.interest),num(loan.netCash),rate,'half-up',date(data.agreementDate),null,'ACTIVE',optional(data.notes),stamp,stamp);
  for(const s of splits)await run(db,'INSERT INTO contributions VALUES (?,?,?,?,?,?,?,?)',uuid(),id,s.id,basis,num(entries.find(x=>x.id===s.id)!.amount),num(s.face),num(s.netCash),num(s.expectedProfit));
  for(const [i,row] of installments.entries())await run(db,'INSERT INTO installments VALUES (?,?,?,?,?,?)',uuid(),id,i+1,row.date,row.amount,row.overridden?1:0);
  await audit(actor,'account',id,'created',reference);
  return {id,reference};
}
export async function accountView(id:string) {
  const account=await one(db,'SELECT a.*,b.name borrower_name,m.name manager_name FROM accounts a LEFT JOIN parties b ON b.id=a.borrower_id LEFT JOIN parties m ON m.id=a.manager_id WHERE a.id=?',id);
  if(!account)fail('Loan not found.',404);
  const contributions=await all(db,'SELECT c.*,p.name party_name FROM contributions c JOIN parties p ON p.id=c.party_id WHERE account_id=? ORDER BY p.name',id);
  const installments=await all(db,`SELECT i.*,d.decision,COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END) FROM receipts r WHERE r.installment_id=i.id),0) paid_paise FROM installments i LEFT JOIN installment_decisions d ON d.installment_id=i.id WHERE i.account_id=? ORDER BY i.sequence_no`,id);
  const receipts=await all(db,`SELECT r.*,i.sequence_no,(SELECT COUNT(*) FROM receipts x WHERE x.reversal_of=r.id) reversed FROM receipts r LEFT JOIN installments i ON i.id=r.installment_id WHERE r.account_id=? ORDER BY r.created_at DESC`,id);
  const distributions=await all(db,'SELECT d.*,p.name party_name FROM distributions d JOIN contributions c ON c.id=d.contribution_id JOIN parties p ON p.id=c.party_id WHERE d.account_id=? ORDER BY d.paid_date DESC',id);
  const collected=receipts.reduce((n,r)=>n+(r.reversal_of?-r.amount_paise:r.amount_paise),0);
  return {account,contributions,installments,receipts,distributions,collected_paise:collected};
}
export async function recordReceipt(data:any,accountId:string,actor:string) {
  const account=await one(db,'SELECT * FROM accounts WHERE id=?',accountId);if(!account)fail('Loan not found.',404);
  const amount=money(data.amount);if(amount<=0n)fail('Receipt must be positive.');
  const installmentId=data.installmentId||null;
  if(account.type!=='EXTERNAL'&&!installmentId)fail('Choose the installment paid.');
  if(installmentId){const i=await one(db,'SELECT * FROM installments WHERE id=? AND account_id=?',installmentId,accountId);if(!i)fail('Invalid installment.');const applied=(await one(db,`SELECT COALESCE(SUM(CASE WHEN reversal_of IS NULL THEN amount_paise ELSE -amount_paise END),0) total FROM receipts WHERE installment_id=?`,installmentId)).total;if(amount>BigInt(i.amount_paise-applied))fail('Receipt exceeds the remaining installment amount.');}
  const collected=(await one(db,`SELECT COALESCE(SUM(CASE WHEN reversal_of IS NULL THEN amount_paise ELSE -amount_paise END),0) total FROM receipts WHERE account_id=?`,accountId)).total;
  if(amount>BigInt(account.face_paise-collected))fail('Receipt exceeds outstanding face value.');
  const id=uuid();await run(db,'INSERT INTO receipts VALUES (?,?,?,?,?,?,?,?,?,?,?)',id,accountId,installmentId,account.type==='EXTERNAL'?'EXTERNAL_MANAGER':'BORROWER',str(data.method,'a payment method',30),num(amount),date(data.receivedDate),optional(data.reference,120),'CONFIRMED',null,now());await audit(actor,'receipt',id,'recorded',`${num(amount)} paise`);return {id};
}
export async function reverseReceipt(id:string,data:any,actor:string) {
  const r=await one(db,'SELECT * FROM receipts WHERE id=?',id);if(!r||r.reversal_of||await one(db,'SELECT id FROM receipts WHERE reversal_of=?',id))fail('Receipt cannot be reversed.');
  const reason=str(data.reason,'a reversal reason',500),newId=uuid();
  await run(db,'INSERT INTO receipts VALUES (?,?,?,?,?,?,?,?,?,?,?)',newId,r.account_id,r.installment_id,r.source,r.method,r.amount_paise,date(data.receivedDate||today()),reason,'REVERSAL',id,now());
  await audit(actor,'receipt',id,'reversed',reason);return {id:newId};
}
export async function businessDashboard() {
  const rows=await all(db,`SELECT i.*,a.reference,a.type,p.name borrower_name,COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END) FROM receipts r WHERE r.installment_id=i.id),0) paid_paise FROM installments i JOIN accounts a ON a.id=i.account_id LEFT JOIN parties p ON p.id=a.borrower_id WHERE a.type IN ('SOLO_SELF_MANAGED','JOINT_SELF_MANAGED') AND a.status='ACTIVE' ORDER BY i.due_date`);
  const current=today(),tomorrow=scheduleDates(current,2,1)[1],week=scheduleDates(current,2,7)[1];
  const pending=rows.filter(r=>r.paid_paise<r.amount_paise),sum=(items:any[])=>items.reduce((n,r)=>n+r.amount_paise-r.paid_paise,0);
  const todayInstallments=await all(db,`SELECT i.id,i.account_id,i.sequence_no,i.due_date,i.amount_paise,a.reference,p.name borrower_name,d.decision,COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END) FROM receipts r WHERE r.installment_id=i.id),0) paid_paise FROM installments i JOIN accounts a ON a.id=i.account_id LEFT JOIN parties p ON p.id=a.borrower_id LEFT JOIN installment_decisions d ON d.installment_id=i.id WHERE a.type IN ('SOLO_SELF_MANAGED','JOINT_SELF_MANAGED') AND a.status='ACTIVE' AND i.due_date=? ORDER BY p.name,i.sequence_no`,current);
  return {today:current,metrics:{dueToday:sum(pending.filter(r=>r.due_date===current)),dueTomorrow:sum(pending.filter(r=>r.due_date===tomorrow)),nextWeek:sum(pending.filter(r=>r.due_date>=current&&r.due_date<=week)),overdue:sum(pending.filter(r=>r.due_date<current))},todayInstallments,installments:pending};
}
export async function markInstallmentDecision(id:string,decision:string,actor:string) {
  if(!['PAID','UNPAID'].includes(decision))fail('Choose paid or not paid.');
  const row=await one(db,`SELECT i.*,a.type,a.status,p.name borrower_name,COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END) FROM receipts r WHERE r.installment_id=i.id),0) paid_paise FROM installments i JOIN accounts a ON a.id=i.account_id LEFT JOIN parties p ON p.id=a.borrower_id WHERE i.id=?`,id);
  if(!row||!['SOLO_SELF_MANAGED','JOINT_SELF_MANAGED'].includes(row.type)||row.status!=='ACTIVE')fail('Installment not found.',404);
  if(row.due_date>today())fail('Only due or overdue installments can be checked here.');
  const remaining=row.amount_paise-row.paid_paise;
  if(decision==='UNPAID'&&remaining<=0){
    const automatic=await all(db,`SELECT r.id FROM receipts r WHERE r.installment_id=? AND r.method='DAILY_CHECKLIST' AND r.reversal_of IS NULL AND NOT EXISTS (SELECT 1 FROM receipts x WHERE x.reversal_of=r.id)`,id);
    if(!automatic.length)fail('This installment was paid outside the checklist. Reverse its receipt from the loan detail page to correct it.');
    for(const receipt of automatic)await reverseReceipt(receipt.id,{reason:'Status changed to Not paid',receivedDate:today()},actor);
  }
  if(decision==='PAID'&&remaining>0)await recordReceipt({amount:(remaining/100).toFixed(2),method:'DAILY_CHECKLIST',installmentId:id,receivedDate:today(),reference:''},row.account_id,actor);
  await run(db,`INSERT INTO installment_decisions VALUES (?,?,?,?,?) ON CONFLICT (installment_id) DO UPDATE SET decision=EXCLUDED.decision,decided_on=EXCLUDED.decided_on,actor_id=EXCLUDED.actor_id,updated_at=EXCLUDED.updated_at`,id,decision,today(),actor,now());
  await audit(actor,'installment',id,decision==='PAID'?'marked_paid':'marked_unpaid');
  return {id,status:decision};
}
export async function personalDashboard(actor:string) {
  const rows=await all(db,`SELECT a.id,a.reference,a.type,a.arrangement,a.funded_date,a.face_paise,c.face_paise own_face,c.net_paise own_net,c.profit_paise own_profit,COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END) FROM receipts r WHERE r.account_id=a.id),0) collected_paise FROM accounts a JOIN contributions c ON c.account_id=a.id AND c.party_id=? WHERE a.status='ACTIVE' ORDER BY a.created_at DESC`,actor);
  return {accounts:rows,totals:{ownFace:rows.reduce((n,r)=>n+r.own_face,0),ownNetExpected:rows.reduce((n,r)=>n+r.own_net,0),ownNetFunded:rows.reduce((n,r)=>n+(r.funded_date?r.own_net:0),0),ownProfitExpected:rows.reduce((n,r)=>n+r.own_profit,0),managedCollected:rows.reduce((n,r)=>n+r.collected_paise,0)}};
}


