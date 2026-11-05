import { randomUUID } from 'node:crypto';
import { one, all, run, transaction } from './prisma-db.ts';
import { calculateLoan, contributions, allocate } from './domain/money.ts';
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
  for(const entry of entries)if(!await one(db,"SELECT id FROM parties WHERE id=? AND active=true AND roles ILIKE '%INVESTOR%'",entry.id))fail('Select an active registered investor.');
  if(data.borrowerId&&!await one(db,"SELECT id FROM parties WHERE id=? AND active=true AND (roles ILIKE '%BORROWER%' OR kind='ORGANIZATION')",data.borrowerId))fail('Select an active registered borrower or organisation.');
  if(data.managerId&&!await one(db,"SELECT id FROM parties WHERE id=? AND active=true AND roles ILIKE '%MANAGER%'",data.managerId))fail('Select an active registered manager.');
  const splits=contributions(loan,basis,entries),installments=scheduleInput(data,face,scope.scheduleRequired);
  const id=uuid(),reference=`LN-${Date.now().toString(36).toUpperCase()}-${id.slice(0,4).toUpperCase()}`,stamp=now();
  await run(db,'INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,reference,type,arrangement,data.borrowerId||null,data.managerId||null,num(face),num(loan.interest),num(loan.netCash),rate,'half-up',date(data.agreementDate),null,'ACTIVE',optional(data.notes),stamp,stamp);
  for(const s of splits)await run(db,'INSERT INTO contributions VALUES (?,?,?,?,?,?,?,?)',uuid(),id,s.id,basis,num(entries.find(x=>x.id===s.id)!.amount),num(s.face),num(s.netCash),num(s.expectedProfit));
  for(const [i,row] of installments.entries()){const installmentId=uuid();await run(db,'INSERT INTO installments VALUES (?,?,?,?,?,?)',installmentId,id,i+1,row.date,row.amount,row.overridden?1:0);if(type==='SOLO_SELF_MANAGED'||type==='JOINT_SELF_MANAGED')await run(db,'INSERT INTO cheques (id,account_id,installment_id,scheduled_date,amount_paise,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',uuid(),id,installmentId,row.date,row.amount,'PENDING',stamp,stamp);}
  await audit(actor,'account',id,'created',reference);
  return {id,reference};
}

export async function accountView(id:string) {
  const account=await one(db,`SELECT a.*,
    CASE WHEN b.kind = 'PERSON' THEN b.name ELSE '' END AS borrower_person_name,
    CASE WHEN b.kind = 'ORGANIZATION' THEN b.name ELSE o.name END AS organization_name,
    COALESCE(o.name,b.name) borrower_name,
    m.name manager_name
    FROM accounts a
    LEFT JOIN parties b ON b.id=a.borrower_id
    LEFT JOIN parties o ON o.id=b.organization_id
    LEFT JOIN parties m ON m.id=a.manager_id
    WHERE a.id=?`,id);
  if(!account)fail('Loan not found.',404);
  const contributions=await all(db,'SELECT c.*,p.name party_name FROM contributions c JOIN parties p ON p.id=c.party_id WHERE account_id=? ORDER BY p.name',id);
  const installments=await all(db,`SELECT i.*,c.status cheque_status,COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END) FROM receipts r WHERE r.installment_id=i.id),0) paid_paise FROM installments i LEFT JOIN cheques c ON c.installment_id=i.id WHERE i.account_id=? ORDER BY i.sequence_no`,id);
  const receipts=await all(db,`SELECT r.*,i.sequence_no,(SELECT COUNT(*) FROM receipts x WHERE x.reversal_of=r.id) reversed FROM receipts r LEFT JOIN installments i ON i.id=r.installment_id WHERE r.account_id=? ORDER BY r.created_at DESC`,id);
  const distributions=await all(db,'SELECT d.*,p.name party_name FROM distributions d JOIN contributions c ON c.id=d.contribution_id JOIN parties p ON p.id=c.party_id WHERE d.account_id=? ORDER BY d.paid_date DESC',id);
  const collected=receipts.reduce((n,r)=>n+(r.reversal_of?-r.amount_paise:r.amount_paise),0);
  const shares=contributions.length?allocate(BigInt(collected),contributions.map(c=>({id:c.id,weight:BigInt(c.face_paise)}))):[];
  const collectedByContribution=new Map(shares.map(s=>[s.id,num(s.amount)]));
  return {account,contributions:contributions.map(c=>({...c,collected_paise:collectedByContribution.get(c.id)||0})),installments,receipts,distributions,collected_paise:collected};
}

export async function updateAccount(id:string,data:any,actor:string) {
  const existing=await one(db,'SELECT * FROM accounts WHERE id=?',id);
  if(!existing)fail('Loan not found.',404);
  const receipts=await all(db,'SELECT id,reversal_of FROM receipts WHERE account_id=?',id);
  const hasActiveReceipts=receipts.some(r=>!r.reversal_of);

  let borrowerId=existing.borrower_id;
  if(data.borrowerId!==undefined){
    if(existing.type!=='EXTERNAL'){
      if(!data.borrowerId)fail('A borrower or organisation is required.');
      const b=await one(db,"SELECT id FROM parties WHERE id=? AND active=true AND (roles ILIKE '%BORROWER%' OR kind='ORGANIZATION')",data.borrowerId);
      if(!b)fail('Select an active registered borrower or organisation.');
      borrowerId=data.borrowerId;
    }
  }

  let managerId=existing.manager_id;
  if(data.managerId!==undefined&&existing.type==='EXTERNAL'){
    if(!data.managerId)fail('An external manager is required.');
    const m=await one(db,"SELECT id FROM parties WHERE id=? AND active=true AND roles ILIKE '%MANAGER%'",data.managerId);
    if(!m)fail('Select an active registered manager.');
    managerId=data.managerId;
  }

  const agreementDate=data.agreementDate?date(data.agreementDate):existing.agreement_date;
  const notes=data.notes!==undefined?optional(data.notes):existing.notes;

  let rate=existing.rate_text;
  if(data.rate!==undefined){
    rate=str(data.rate,'the interest rate',20);
    if(!/^\d{1,2}(\.\d{1,4})?$/.test(rate))fail('Rate must be below 100%.');
  }

  let status=existing.status;
  if(data.status!==undefined){
    const valid:Record<string,string>={ACTIVE:'ACTIVE',COMPLETED:'COMPLETED',DEFAULTED:'DEFAULTED',STOPPED_PAYING:'DEFAULTED'};
    status=valid[String(data.status).toUpperCase()]||status;
  }

  const isChangingFace=data.face!==undefined&&money(data.face)!==BigInt(existing.face_paise);
  const isChangingRate=rate!==existing.rate_text;
  const isChangingSchedule=!!data.schedule;

  if(isChangingFace||isChangingRate||isChangingSchedule){
    if(hasActiveReceipts){
      fail('Cannot edit financial terms or schedule because payments have already been recorded. Reverse payments first.');
    }
    const face=data.face!==undefined?money(data.face):BigInt(existing.face_paise);
    const [whole,fraction='']=rate.split('.');
    const loan=calculateLoan(face,BigInt(whole+fraction),10n**BigInt(fraction.length),'half-up');
    const type=existing.type,arrangement=existing.arrangement;
    const oldContribs=await all(db,'SELECT * FROM contributions WHERE account_id=?',id);
    const basis=data.basis==='NET_CASH'?'NET_CASH':(oldContribs[0]?.input_basis||'FACE_SHARE');
    const expected=basis==='NET_CASH'?loan.netCash:loan.face;

    const partners=Array.isArray(data.partners)?data.partners:[];
    let partnerEntries=partners.map((p:any)=>({id:str(p.partyId,'an investor'),amount:money(p.amount)}));
    if(!partners.length&&(type==='JOINT_SELF_MANAGED'||arrangement==='MANAGED_POOL')){
      const partnerOld=oldContribs.filter(c=>c.party_id!==actor);
      if(partnerOld.length)partnerEntries=partnerOld.map(c=>({id:c.party_id,amount:BigInt(c.entered_paise)}));
    }

    if((type==='SOLO_SELF_MANAGED'||arrangement==='OWN_STAKE_EXTERNALLY_MANAGED')&&partnerEntries.length)fail('This account cannot have other investors.');
    if((type==='JOINT_SELF_MANAGED'||arrangement==='MANAGED_POOL')&&!partnerEntries.length)fail('Add at least one investor.');

    const remainder=expected-partnerEntries.reduce((n:bigint,p:any)=>n+p.amount,0n);
    if(remainder<=0n)fail('Ayyappan must have a positive contribution.');
    const entries=[{id:actor,amount:remainder},...partnerEntries];

    const scope=classifyAccount({
      type,
      arrangement,
      borrowerId:borrowerId||undefined,
      externalManagerId:managerId||undefined,
      ownerId:actor,
      contributorIds:entries.map(x=>x.id),
      hasSchedule:!!(data.schedule||(type!=='EXTERNAL'))
    });

    let installments:Array<{date:string;amount:number;overridden:boolean}>=[];
    if(data.schedule){
      installments=scheduleInput(data,face,scope.scheduleRequired);
    }else if(scope.scheduleRequired){
      const oldInst=await all(db,'SELECT sequence_no,due_date FROM installments WHERE account_id=? ORDER BY sequence_no',id);
      const count=oldInst.length||10;
      const firstDate=oldInst[0]?.due_date||agreementDate;
      installments=scheduleInput({schedule:{mode:'COUNT',count,firstDate,intervalDays:7}},face,true);
    }

    const splits=contributions(loan,basis,entries);
    const stamp=now();

    await run(db,'UPDATE accounts SET borrower_id=?,manager_id=?,face_paise=?,interest_paise=?,net_paise=?,rate_text=?,agreement_date=?,status=?,notes=?,updated_at=? WHERE id=?',
      borrowerId,managerId,num(face),num(loan.interest),num(loan.netCash),rate,agreementDate,status,notes,stamp,id);

    await run(db,'DELETE FROM contributions WHERE account_id=?',id);
    for(const s of splits){
      await run(db,'INSERT INTO contributions VALUES (?,?,?,?,?,?,?,?)',uuid(),id,s.id,basis,num(entries.find(x=>x.id===s.id)!.amount),num(s.face),num(s.netCash),num(s.expectedProfit));
    }

    if(installments.length){
      await run(db,'DELETE FROM cheques WHERE account_id=?',id);
      await run(db,'DELETE FROM installments WHERE account_id=?',id);
      for(const [i,row] of installments.entries()){
        const installmentId=uuid();
        await run(db,'INSERT INTO installments VALUES (?,?,?,?,?,?)',installmentId,id,i+1,row.date,row.amount,row.overridden?1:0);
        if(type==='SOLO_SELF_MANAGED'||type==='JOINT_SELF_MANAGED'){
          await run(db,'INSERT INTO cheques (id,account_id,installment_id,scheduled_date,amount_paise,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',uuid(),id,installmentId,row.date,row.amount,'PENDING',stamp,stamp);
        }
      }
    }
  }else{
    const stamp=now();
    await run(db,'UPDATE accounts SET borrower_id=?,manager_id=?,agreement_date=?,notes=?,status=?,updated_at=? WHERE id=?',
      borrowerId,managerId,agreementDate,notes,status,stamp,id);
  }

  await audit(actor,'account',id,'updated',`Updated loan ${existing.reference}`);
  return {id,ok:true};
}

export async function deleteAccount(id:string,actor:string) {
  const account=await one(db,'SELECT * FROM accounts WHERE id=?',id);
  if(!account)fail('Loan not found.',404);

  await run(db,'DELETE FROM installment_decisions WHERE installment_id IN (SELECT id FROM installments WHERE account_id=?)',id);
  await run(db,'DELETE FROM cheques WHERE account_id=?',id);
  await run(db,'DELETE FROM receipts WHERE account_id=? AND reversal_of IS NOT NULL',id);
  await run(db,'DELETE FROM receipts WHERE account_id=?',id);
  await run(db,'DELETE FROM distributions WHERE account_id=?',id);
  await run(db,'DELETE FROM installments WHERE account_id=?',id);
  await run(db,'DELETE FROM contributions WHERE account_id=?',id);
  await run(db,'DELETE FROM accounts WHERE id=?',id);

  await audit(actor,'account',id,'deleted',`Deleted loan ${account.reference}`);
  return {id,ok:true};
}

export async function deleteParty(id:string,actor:string) {
  const party=await one(db,'SELECT * FROM parties WHERE id=?',id);
  if(!party)fail('Directory record not found.',404);
  if(/OWNER/i.test(party.roles||''))fail('The owner account cannot be deleted.');

  const linked=await all(db,'SELECT reference FROM accounts WHERE borrower_id=? OR manager_id=? OR EXISTS(SELECT 1 FROM contributions WHERE account_id=accounts.id AND party_id=?)',id,id,id);
  if(linked.length>0){
    fail(`Cannot delete "${party.name}" because it is linked to loan(s): ${linked.map(l=>l.reference).join(', ')}. Delete or reassign those loans first.`);
  }

  await run(db,'UPDATE parties SET organization_id=NULL WHERE organization_id=?',id);
  await run(db,'DELETE FROM parties WHERE id=?',id);
  await audit(actor,'party',id,'deleted',party.name);
  return {id,ok:true};
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
  if(await one(db,"SELECT id FROM cheques WHERE receipt_id=? AND status='PASSED'",id))fail('A confirmed cheque result cannot be reversed here.');
  const reason=str(data.reason,'a reversal reason',500),newId=uuid();
  await run(db,'INSERT INTO receipts VALUES (?,?,?,?,?,?,?,?,?,?,?)',newId,r.account_id,r.installment_id,r.source,r.method,r.amount_paise,date(data.receivedDate||today()),reason,'REVERSAL',id,now());
  await audit(actor,'receipt',id,'reversed',reason);return {id:newId};
}

export const shiftDate = (value:string, days:number) => { const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10); };

export async function businessDashboard() {
  const current=today(),yesterday=shiftDate(current,-1),weekEnd=shiftDate(current,7);
  const metrics=await one(db,`WITH operational AS (
    SELECT c.status,c.scheduled_date,c.amount_paise,i.amount_paise installment_amount,
      COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END) FROM receipts r WHERE r.installment_id=i.id),0) paid_paise
    FROM cheques c JOIN installments i ON i.id=c.installment_id JOIN accounts a ON a.id=c.account_id
    WHERE a.type IN ('SOLO_SELF_MANAGED','JOINT_SELF_MANAGED') AND a.status='ACTIVE'
  ), eligible AS (SELECT * FROM operational WHERE paid_paise<installment_amount),
  dates AS (SELECT ?::text today_date,?::text yesterday_date,?::text week_end_date)
  SELECT
    COUNT(*) FILTER (WHERE status='PENDING' AND scheduled_date=today_date) today_count,
    COALESCE(SUM(amount_paise) FILTER (WHERE status='PENDING' AND scheduled_date=today_date),0) today_amount,
    COUNT(*) FILTER (WHERE status='PENDING' AND scheduled_date=yesterday_date) yesterday_count,
    COALESCE(SUM(amount_paise) FILTER (WHERE status='PENDING' AND scheduled_date=yesterday_date),0) yesterday_amount,
    COUNT(*) FILTER (WHERE status='PENDING' AND scheduled_date<yesterday_date) older_count,
    COALESCE(SUM(amount_paise) FILTER (WHERE status='PENDING' AND scheduled_date<yesterday_date),0) older_amount,
    COUNT(*) FILTER (WHERE status='BOUNCED') bounced_count,
    COALESCE(SUM(amount_paise) FILTER (WHERE status='BOUNCED'),0) bounced_amount,
    COUNT(*) FILTER (WHERE status='BOUNCED' OR (status='PENDING' AND scheduled_date<yesterday_date)) followup_count,
    COALESCE(SUM(amount_paise) FILTER (WHERE status='BOUNCED' OR (status='PENDING' AND scheduled_date<yesterday_date)),0) followup_amount,
    COUNT(*) FILTER (WHERE status='PENDING' AND scheduled_date>today_date AND scheduled_date<=week_end_date) upcoming_count,
    COALESCE(SUM(amount_paise) FILTER (WHERE status='PENDING' AND scheduled_date>today_date AND scheduled_date<=week_end_date),0) upcoming_amount
  FROM eligible CROSS JOIN dates`,current,yesterday,weekEnd);
  const group=(prefix:string)=>({count:metrics[prefix+'_count'],amount:metrics[prefix+'_amount']});
  return {today:current,yesterday,weekEnd,metrics:{today:group('today'),yesterday:group('yesterday'),olderPending:group('older'),bounced:group('bounced'),followup:group('followup'),upcoming:group('upcoming')}};
}

export async function chequeList(view:string,selectedDate?:string) {
  const current=today(),yesterday=shiftDate(current,-1),weekEnd=shiftDate(current,7);
  const selected=date(selectedDate||(view==='yesterday'||view==='older'?yesterday:current));
  const filters:Record<string,{where:string;params:string[]}>={
    today:{where:"scheduled_date=? AND status='PENDING' AND paid_paise<installment_amount",params:[selected]},
    yesterday:{where:"scheduled_date=? AND (status='PASSED' OR paid_paise<installment_amount)",params:[selected]},
    older:{where:"scheduled_date<? AND status='PENDING' AND paid_paise<installment_amount",params:[selected]},
    followup:{where:"(status='BOUNCED' OR (status='PENDING' AND scheduled_date<?)) AND paid_paise<installment_amount",params:[yesterday]},
    upcoming:{where:"scheduled_date>? AND scheduled_date<=? AND status='PENDING' AND paid_paise<installment_amount",params:[current,weekEnd]}
  };
  const filter=filters[view];if(!filter)fail('Unknown cheque list.');
  const rows=await all(db,`WITH operational AS (
    SELECT c.*,i.sequence_no,i.amount_paise installment_amount,a.reference,
      CASE WHEN p.kind = 'PERSON' THEN p.name ELSE '' END AS borrower_person_name,
      CASE WHEN p.kind = 'ORGANIZATION' THEN p.name ELSE org.name END AS organization_name,
      COALESCE(org.name,p.name) borrower_name,
      COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END) FROM receipts r WHERE r.installment_id=i.id),0) paid_paise
    FROM cheques c JOIN installments i ON i.id=c.installment_id
    JOIN accounts a ON a.id=c.account_id LEFT JOIN parties p ON p.id=a.borrower_id LEFT JOIN parties org ON org.id=p.organization_id
    WHERE a.type IN ('SOLO_SELF_MANAGED','JOINT_SELF_MANAGED') AND a.status='ACTIVE'
  ) SELECT * FROM operational WHERE ${filter.where} ORDER BY scheduled_date,borrower_name,sequence_no`,...filter.params);
  return {view,date:selected,today:current,yesterday,weekEnd,rows,count:rows.length,amount:rows.reduce((n,r)=>n+r.amount_paise,0)};
}

export async function confirmChequeResult(id:string,result:string,actor:string) {
  if(!['PASSED','BOUNCED'].includes(result))fail('Choose Passed or Bounced.');
  const cheque=await one(db,`SELECT c.*,a.type,a.status account_status,i.amount_paise installment_amount,
    COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END) FROM receipts r WHERE r.installment_id=i.id),0) paid_paise
    FROM cheques c JOIN accounts a ON a.id=c.account_id JOIN installments i ON i.id=c.installment_id WHERE c.id=?`,id);
  if(!cheque||!['SOLO_SELF_MANAGED','JOINT_SELF_MANAGED'].includes(cheque.type)||cheque.account_status!=='ACTIVE')fail('Cheque not found.',404);
  if(cheque.status!=='PENDING')fail('This cheque already has a confirmed result.',409);
  const remaining=cheque.installment_amount-cheque.paid_paise;
  let receiptId:string|null=null;
  if(result==='PASSED'){
    if(remaining<cheque.amount_paise)fail('Cheque amount exceeds the open installment. Reconcile earlier payments before confirming it.');
    const receipt=await recordReceipt({amount:(cheque.amount_paise/100).toFixed(2),method:'CHEQUE',installmentId:cheque.installment_id,receivedDate:today(),reference:''},cheque.account_id,actor);
    receiptId=receipt.id;
  }
  const confirmedOn=today(),stamp=now();
  await run(db,'UPDATE cheques SET status=?,result_confirmed_on=?,result_confirmed_at=?,result_actor_id=?,receipt_id=?,updated_at=? WHERE id=?',result,confirmedOn,stamp,actor,receiptId,stamp,id);
  await audit(actor,'cheque',id,result==='PASSED'?'passed_confirmed':'bounced_confirmed',`Scheduled ${cheque.scheduled_date}; amount ${cheque.amount_paise} paise`);
  return {id,status:result,confirmedOn,receiptId};
}

export async function personalDashboard(actor:string) {
  const rows=await all(db,`SELECT a.id,a.reference,a.type,a.arrangement,a.funded_date,a.face_paise,c.face_paise own_face,c.net_paise own_net,c.profit_paise own_profit,COALESCE((SELECT SUM(CASE WHEN r.reversal_of IS NULL THEN r.amount_paise ELSE -r.amount_paise END) FROM receipts r WHERE r.account_id=a.id),0) collected_paise FROM accounts a JOIN contributions c ON c.account_id=a.id AND c.party_id=? WHERE a.status='ACTIVE' ORDER BY a.created_at DESC`,actor);
  return {accounts:rows,totals:{ownFace:rows.reduce((n,r)=>n+r.own_face,0),ownNetExpected:rows.reduce((n,r)=>n+r.own_net,0),ownNetFunded:rows.reduce((n,r)=>n+(r.funded_date?r.own_net:0),0),ownProfitExpected:rows.reduce((n,r)=>n+r.own_profit,0),managedCollected:rows.reduce((n,r)=>n+r.collected_paise,0)}};
}
