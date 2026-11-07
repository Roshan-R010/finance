import { randomUUID } from 'node:crypto';
import { db, all, one, run } from './prisma-db.ts';
import { allocate } from './domain/money.ts';

const id=()=>randomUUID();
const stamp=()=>new Date().toISOString();
const fail=(message:string):never=>{throw Object.assign(new Error(message),{status:400});};
const paise=(value:unknown):bigint=>{
  const input=String(value??'').trim().replace(/,/g,'');
  if(!/^\d{1,13}(?:\.\d{1,2})?$/.test(input))return fail('Enter a valid rupee amount.');
  const [whole,fraction='']=input.split('.');
  const result=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  if(result>BigInt(Number.MAX_SAFE_INTEGER))return fail('Amount is too large.');
  return result;
};
const safe=(value:bigint)=>{if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(Number.MIN_SAFE_INTEGER))return fail('Cash amount is too large.');return Number(value);};
const day=(value:unknown)=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)return fail('Enter a valid date.');return value;};
const description=(value:unknown)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>120)return fail('Enter a source or name.');return value.trim();};
export type CashAllocation={partyId:string;owned:bigint;managed:bigint};

export async function cashStarted(){return Boolean(await one(db,'SELECT id FROM cash_cutover WHERE id=1'));}

export async function postCashMovement(input:{key:string;kind:string;description:string;notes?:string;sourceId?:string;date:string;actor:string;managedIn?:bigint;managedOut?:bigint;allocations:CashAllocation[];reversalOf?:string}){
  const incoming=input.managedIn||0n,outgoing=input.managedOut||0n;
  if(incoming<0n||outgoing<0n||incoming&&outgoing)return fail('Invalid cash direction.');
  if(input.allocations.reduce((sum,row)=>sum+row.managed,0n)!==incoming-outgoing)return fail('Cash ownership does not reconcile with managed cash.');
  if(new Set(input.allocations.map(row=>row.partyId)).size!==input.allocations.length)return fail('Duplicate cash owner.');
  const existing=await one(db,'SELECT id FROM cash_movements WHERE event_key=?',input.key);
  if(existing)return {id:existing.id,duplicate:true};
  const movementId=id();
  await run(db,'INSERT INTO cash_movements (id,event_key,kind,description,notes,source_id,effective_date,managed_in_paise,managed_out_paise,reversal_of,created_at,actor_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',movementId,input.key,input.kind,input.description,input.notes||null,input.sourceId||null,day(input.date),safe(incoming),safe(outgoing),input.reversalOf||null,stamp(),input.actor);
  for(const allocation of input.allocations)await run(db,'INSERT INTO cash_allocations (id,movement_id,party_id,owned_delta_paise,managed_delta_paise) VALUES (?,?,?,?,?)',id(),movementId,allocation.partyId,safe(allocation.owned),safe(allocation.managed));
  return {id:movementId,duplicate:false};
}

export async function openCash(data:any,actor:string){
  if(await cashStarted())return fail('Opening cash has already been set.');
  const effectiveDate=day(data.date),ownManaged=paise(data.ownManaged||'0'),ownOutside=paise(data.ownOutside||'0');
  const partners=Array.isArray(data.partners)?data.partners:[];
  const partnerRows=[] as {id:string;amount:bigint}[];
  for(const row of partners){const party=await one(db,"SELECT id FROM parties WHERE id=? AND active=true AND roles ILIKE '%INVESTOR%'",row.partyId);if(!party||party.id===actor)return fail('Choose a registered partner.');partnerRows.push({id:party.id,amount:paise(row.amount)});}
  if(new Set(partnerRows.map(row=>row.id)).size!==partnerRows.length)return fail('A partner appears more than once.');
  await run(db,'INSERT INTO cash_cutover (id,started_at,effective_date,actor_id) VALUES (1,?,?,?)',stamp(),effectiveDate,actor);
  if(ownManaged)await postCashMovement({key:'opening:owner:managed',kind:'OPENING',description:'Opening cash held for lending',date:effectiveDate,actor,managedIn:ownManaged,allocations:[{partyId:actor,owned:ownManaged,managed:ownManaged}]});
  if(ownOutside)await postCashMovement({key:'opening:owner:outside',kind:'OPENING',description:'Opening personal cash outside lending pool',date:effectiveDate,actor,allocations:[{partyId:actor,owned:ownOutside,managed:0n}]});
  for(const row of partnerRows)if(row.amount)await postCashMovement({key:`opening:partner:${row.id}`,kind:'OPENING',description:'Opening partner cash held',date:effectiveDate,actor,managedIn:row.amount,allocations:[{partyId:row.id,owned:row.amount,managed:row.amount}]});
  return {ok:true};
}

export async function addCashFund(data:any,actor:string){
  const cutover=await one(db,'SELECT effective_date FROM cash_cutover WHERE id=1');
  if(!cutover)return fail('Set opening cash before adding funds.');
  const amount=paise(data.amount);if(amount<=0n)return fail('Amount must be greater than zero.');
  const source=description(data.source),fundId=id();
  const receivedOn=day(data.date);if(receivedOn<cutover.effective_date)return fail('Fund date is before cash tracking started.');
  await postCashMovement({key:`fund:${fundId}`,kind:'ADD_FUND',description:source,notes:typeof data.notes==='string'?data.notes.trim().slice(0,500):'',date:receivedOn,actor,sourceId:fundId,managedIn:amount,allocations:[{partyId:actor,owned:amount,managed:amount}]});
  return {id:fundId,ok:true};
}

export async function postLoanCash(accountId:string,actor:string,data:any){
  const cutover=await one(db,'SELECT effective_date FROM cash_cutover WHERE id=1');if(!cutover)return;
  const account=await one(db,'SELECT id,reference,agreement_date FROM accounts WHERE id=?',accountId);
  if(account.agreement_date<cutover.effective_date)return;
  const shares=await all(db,'SELECT party_id,net_paise FROM contributions WHERE account_id=?',accountId);
  const version=Number((await one(db,"SELECT COUNT(*) AS count FROM cash_movements WHERE source_id=? AND kind='LOAN_OUT'",accountId)).count)+1;
  const selections=Array.isArray(data.partnerCustody)?data.partnerCustody:[];
  if(data.ownerCashSource!==undefined&&!['MANAGED','OUTSIDE'].includes(data.ownerCashSource))return fail('Choose where Ayyappan paid from.');
  const ownerManaged=data.ownerCashSource!=='OUTSIDE';
  const allocations:CashAllocation[]=[];let managedOut=0n;
  for(const share of shares){const amount=BigInt(share.net_paise);if(share.party_id===actor){allocations.push({partyId:actor,owned:-amount,managed:ownerManaged?-amount:0n});if(ownerManaged)managedOut+=amount;continue;}
    const option=selections.find((item:any)=>item.partyId===share.party_id)?.custody;
    if(!['NEW_HELD','ALREADY_HELD','DIRECT'].includes(option))return fail('Choose how each partner paid their contribution.');
    if(option==='NEW_HELD')await postCashMovement({key:`loan:${accountId}:v${version}:partner:${share.party_id}:in`,kind:'PARTNER_CASH',description:`Partner cash for ${account.reference}`,sourceId:accountId,date:account.agreement_date,actor,managedIn:amount,allocations:[{partyId:share.party_id,owned:amount,managed:amount}]});
    if(option!=='DIRECT'){allocations.push({partyId:share.party_id,owned:-amount,managed:-amount});managedOut+=amount;}
  }
  await postCashMovement({key:`loan:${accountId}:v${version}:out`,kind:'LOAN_OUT',description:`Cash invested in ${account.reference}`,sourceId:accountId,date:account.agreement_date,actor,managedOut,allocations});
}

export async function loanCashChoices(accountId:string,actor:string){
  const movement=await one(db,`SELECT * FROM cash_movements m WHERE m.source_id=? AND m.kind='LOAN_OUT'
    AND NOT EXISTS (SELECT 1 FROM cash_movements r WHERE r.reversal_of=m.id)
    ORDER BY m.created_at DESC,m.id DESC LIMIT 1`,accountId);
  if(!movement)return {ownerCashSource:'MANAGED',partnerCustody:[]};
  const rows=await all(db,'SELECT party_id,managed_delta_paise FROM cash_allocations WHERE movement_id=?',movement.id);
  const partnerCustody=[] as {partyId:string;custody:string}[];
  for(const row of rows){if(row.party_id===actor)continue;
    const received=await one(db,`SELECT id FROM cash_movements m WHERE m.source_id=? AND m.kind='PARTNER_CASH'
      AND m.event_key LIKE ? AND NOT EXISTS (SELECT 1 FROM cash_movements r WHERE r.reversal_of=m.id) LIMIT 1`,accountId,movement.event_key.replace(':out',':partner:%:in'));
    partnerCustody.push({partyId:row.party_id,custody:received?'NEW_HELD':'ALREADY_HELD'});
  }
  const contributions=await all(db,'SELECT party_id FROM contributions WHERE account_id=? AND party_id<>?',accountId,actor);
  for(const row of contributions)if(!partnerCustody.some(item=>item.partyId===row.party_id))partnerCustody.push({partyId:row.party_id,custody:'DIRECT'});
  return {ownerCashSource:rows.find(row=>row.party_id===actor)?.managed_delta_paise?'MANAGED':'OUTSIDE',partnerCustody};
}

export async function postDistributionCash(distributionId:string,accountId:string,partyId:string,amountPaise:number,dateValue:string,actor:string){
  const cutover=await one(db,'SELECT effective_date FROM cash_cutover WHERE id=1');
  if(!cutover||dateValue<cutover.effective_date)return;
  const amount=BigInt(amountPaise);
  const held=await one(db,'SELECT COALESCE(SUM(managed_delta_paise),0) AS total FROM cash_allocations WHERE party_id=?',partyId);
  if(BigInt(held.total)<amount)return fail('Partner cash held is not enough for this payout.');
  await postCashMovement({key:`distribution:${distributionId}`,kind:'PARTNER_PAYOUT',description:'Partner payout',sourceId:distributionId,date:dateValue,actor,managedOut:amount,allocations:[{partyId,owned:-amount,managed:-amount}]});
}

export async function reverseCashSource(sourceId:string,actor:string){
  const movements=await all(db,`SELECT m.* FROM cash_movements m WHERE m.source_id=? AND m.reversal_of IS NULL
    AND NOT EXISTS (SELECT 1 FROM cash_movements r WHERE r.reversal_of=m.id) ORDER BY m.created_at DESC,m.id DESC`,sourceId);
  for(const movement of movements){
    const rows=await all(db,'SELECT party_id,owned_delta_paise,managed_delta_paise FROM cash_allocations WHERE movement_id=?',movement.id);
    await postCashMovement({key:`reverse:${movement.id}`,kind:'CORRECTION',description:`Correction: ${movement.description}`,sourceId,date:movement.effective_date,actor,managedIn:BigInt(movement.managed_out_paise),managedOut:BigInt(movement.managed_in_paise),reversalOf:movement.id,allocations:rows.map(row=>({partyId:row.party_id,owned:-BigInt(row.owned_delta_paise),managed:-BigInt(row.managed_delta_paise)}))});
  }
}

export async function postReceiptCash(receiptId:string,actor:string,destination='MANAGED'){
  const cutover=await one(db,'SELECT effective_date FROM cash_cutover WHERE id=1');if(!cutover)return;
  const receipt=await one(db,'SELECT id,account_id,amount_paise,received_date,reversal_of FROM receipts WHERE id=?',receiptId);if(!receipt)return fail('Receipt not found.');
  if(!['MANAGED','OUTSIDE'].includes(destination))return fail('Choose where the returned cash was received.');
  if(receipt.received_date<cutover.effective_date)return;
  const shares=await all(db,'SELECT party_id,face_paise FROM contributions WHERE account_id=?',receipt.account_id);
  if(!shares.length)return fail('Receipt has no contributor allocation.');
  const amount=BigInt(receipt.amount_paise),split=allocate(amount,shares.map(row=>({id:row.party_id,weight:BigInt(row.face_paise)})));
  const allocations=split.map(row=>({partyId:row.id,owned:row.amount,managed:destination==='MANAGED'?row.amount:0n}));
  await postCashMovement({key:`receipt:${receiptId}`,kind:receipt.reversal_of?'RECEIPT_REVERSAL':'COLLECTION',description:receipt.reversal_of?'Reversed receipt':'Confirmed collection',sourceId:receiptId,date:receipt.received_date,actor,managedIn:receipt.reversal_of||destination==='OUTSIDE'?0n:amount,managedOut:receipt.reversal_of&&destination==='MANAGED'?amount:0n,allocations:receipt.reversal_of?allocations.map(row=>({...row,owned:-row.owned,managed:-row.managed})):allocations});
}

export async function cashSummary(actor:string){
  const cutover=await one(db,'SELECT started_at,effective_date FROM cash_cutover WHERE id=1');
  if(!cutover)return {started:false,managed:0,personal:0,partnerHeld:0,activity:[]};
  const rows=await all(db,`SELECT m.id,m.kind,m.description,m.effective_date,m.created_at,m.managed_in_paise,m.managed_out_paise,
    COALESCE(SUM(a.owned_delta_paise) FILTER (WHERE a.party_id=?),0) personal_delta,
    COALESCE(SUM(a.managed_delta_paise) FILTER (WHERE a.party_id<>?),0) partner_delta
    FROM cash_movements m LEFT JOIN cash_allocations a ON a.movement_id=m.id
    GROUP BY m.id ORDER BY m.effective_date,m.created_at,m.id`,actor,actor);
  let managed=0n,personal=0n,partnerHeld=0n;
  const activity=rows.map(row=>{managed+=BigInt(row.managed_in_paise)-BigInt(row.managed_out_paise);personal+=BigInt(row.personal_delta);partnerHeld+=BigInt(row.partner_delta);return {...row,managed_balance:safe(managed),personal_balance:safe(personal)};});
  return {started:true,startedOn:cutover.effective_date,managed:safe(managed),personal:safe(personal),partnerHeld:safe(partnerHeld),activity:activity.reverse().slice(0,100)};
}
