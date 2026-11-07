import { all, db } from './prisma-db.ts';
import { allocate } from './domain/money.ts';

const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const validDay=(value:string)=>datePattern.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const monthStart=(value:string)=>value.slice(0,7)+'-01';
const shiftMonth=(value:string,delta:number)=>{const d=new Date(value.slice(0,7)+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);return d.toISOString().slice(0,7)+'-01';};
const monthEnd=(value:string)=>{const d=new Date(shiftMonth(value,1)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
const safe=(value:bigint)=>{if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Reporting amount exceeds the safe integer range.');return Number(value);};
const fail=(message:string):never=>{throw Object.assign(new Error(message),{status:400});};
export type BusinessLoan={id:string;type:string;agreement_date:string;face_paise:number;net_paise:number;interest_paise:number;funded:number};
export type BusinessContribution={account_id:string;party_id:string;party_name:string;net_paise:number;profit_paise:number};
export type BusinessInstallment={id:string;account_id:string;due_date:string;amount_paise:number};
export type BusinessReceipt={id:string;installment_id:string;received_date:string;amount_paise:number};

export function reportingPeriod(mode:string,now:string,start?:string,end?:string){
  if(!validDay(now))return fail('Invalid current date.');
  let from:string,to:string;
  const current=monthStart(now);
  if(mode==='current'){from=current;to=monthEnd(current);}
  else if(mode==='previous'){from=shiftMonth(current,-1);to=monthEnd(from);}
  else if(mode==='last3'||mode==='last6'){from=shiftMonth(current,mode==='last3'?-2:-5);to=monthEnd(current);}
  else if(mode==='year'){from=now.slice(0,4)+'-01-01';to=now.slice(0,4)+'-12-31';}
  else if(mode==='custom'){if(!start||!end||!validDay(start)||!validDay(end)||start>end)return fail('Choose a valid start and end date.');from=start;to=end;}
  else return fail('Choose a reporting period.');
  if(monthStart(to)>shiftMonth(from,239))return fail('Choose a range of 20 years or less.');
  const chartStart=mode==='custom'?monthStart(from):shiftMonth(to,-11);
  const chartEnd=mode==='custom'?monthEnd(to):monthEnd(to);
  return {mode,start:from,end:to,chartStart,chartEnd,label:mode==='current'?'Current month':mode==='previous'?'Previous month':mode==='last3'?'Last 3 months':mode==='last6'?'Last 6 months':mode==='year'?'This year':'Custom range'};
}

const monthKeys=(start:string,end:string)=>{const values:string[]=[];for(let cursor=monthStart(start),n=0;cursor<=monthStart(end)&&n<240;cursor=shiftMonth(cursor,1),n++)values.push(cursor.slice(0,7));return values;};

export function summarizeBusiness(period:ReturnType<typeof reportingPeriod>,today:string,loans:BusinessLoan[],contributions:BusinessContribution[],installments:BusinessInstallment[],receipts:BusinessReceipt[]){
  const managed=loans.filter(row=>row.type==='SOLO_SELF_MANAGED'||row.type==='JOINT_SELF_MANAGED');
  const cohort=managed.filter(row=>row.agreement_date>=period.start&&row.agreement_date<=period.end);
  const ids=new Set(cohort.map(row=>row.id));
  const fundedIds=new Set(cohort.filter(row=>row.funded).map(row=>row.id));
  const sum=(values:number[])=>safe(values.reduce((total,value)=>total+BigInt(value),0n));
  const totals={count:cohort.length,net:sum(cohort.filter(row=>row.funded).map(row=>row.net_paise)),profit:sum(cohort.map(row=>row.interest_paise)),face:sum(cohort.map(row=>row.face_paise))};
  const monthly=monthKeys(period.chartStart,period.chartEnd).map(month=>{const group=managed.filter(row=>row.agreement_date.slice(0,7)===month&&(period.mode!=='custom'||row.agreement_date>=period.start&&row.agreement_date<=period.end));return {month,count:group.length,net:sum(group.filter(row=>row.funded).map(row=>row.net_paise)),profit:sum(group.map(row=>row.interest_paise))};});
  const contributorRows=contributions.filter(row=>ids.has(row.account_id));
  const partnerMap=new Map<string,{partyId:string;name:string;loans:Set<string>;net:bigint;profit:bigint}>();
  for(const row of contributorRows){let partner=partnerMap.get(row.party_id);if(!partner){partner={partyId:row.party_id,name:row.party_name,loans:new Set(),net:0n,profit:0n};partnerMap.set(row.party_id,partner);}if(row.net_paise>0)partner.loans.add(row.account_id);if(fundedIds.has(row.account_id))partner.net+=BigInt(row.net_paise);partner.profit+=BigInt(row.profit_paise);}
  const partners=[...partnerMap.values()].map(row=>({partyId:row.partyId,name:row.name,loans:row.loans.size,net:safe(row.net),profit:safe(row.profit),share:totals.net?Number(row.net*10000n/BigInt(totals.net))/100:0})).sort((a,b)=>b.net-a.net||a.name.localeCompare(b.name));
  if(sum(partners.map(row=>row.net))!==totals.net||sum(partners.map(row=>row.profit))!==totals.profit)throw new Error('Contributor totals do not reconcile to managed loans.');

  const entries=new Map<string,{month:string;scheduled:bigint;realized:bigint;atRisk:bigint;future:bigint}>();
  const entry=(month:string)=>{let row=entries.get(month);if(!row){row={month,scheduled:0n,realized:0n,atRisk:0n,future:0n};entries.set(month,row);}return row;};
  let realizedTotal=0n,atRiskTotal=0n,futureTotal=0n;
  for(const loan of cohort){const items=installments.filter(row=>row.account_id===loan.id).sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.id.localeCompare(b.id));if(!items.length)continue;
    const allocations=allocate(BigInt(loan.interest_paise),items.map(item=>({id:item.id,weight:BigInt(item.amount_paise)})));
    const byId=new Map(allocations.map(row=>[row.id,row.amount]));
    for(const item of items){const expected=byId.get(item.id)||0n,scheduled=entry(item.due_date.slice(0,7));scheduled.scheduled+=expected;
      const payments=receipts.filter(row=>row.installment_id===item.id).sort((a,b)=>a.received_date.localeCompare(b.received_date)||a.id.localeCompare(b.id));
      const paid=payments.reduce((total,row)=>total+BigInt(row.amount_paise),0n);
      if(paid>BigInt(item.amount_paise))throw new Error('Recorded receipts exceed an installment.');
      const remainder=BigInt(item.amount_paise)-paid;
      const weights=payments.map(row=>({id:row.id,weight:BigInt(row.amount_paise)}));if(remainder>0n)weights.push({id:'remaining',weight:remainder});
      const split=weights.length?allocate(expected,weights):[];
      for(const payment of payments){const portion=split.find(row=>row.id===payment.id)?.amount||0n;entry(payment.received_date.slice(0,7)).realized+=portion;realizedTotal+=portion;}
      const unpaid=split.find(row=>row.id==='remaining')?.amount||0n;
      if(item.due_date<today){scheduled.atRisk+=unpaid;atRiskTotal+=unpaid;}else{scheduled.future+=unpaid;futureTotal+=unpaid;}
    }
  }
  const forecast=[...entries.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(row=>({month:row.month,scheduled:safe(row.scheduled),realized:safe(row.realized),atRisk:safe(row.atRisk),future:safe(row.future)}));
  return {period,totals,monthly,partners,forecast,forecastTotals:{realized:safe(realizedTotal),atRisk:safe(atRiskTotal),future:safe(futureTotal)}};
}

export async function businessAnalytics(mode:string,now:string,start?:string,end?:string){
  const period=reportingPeriod(mode,now,start,end);
  const loans=await all(db,`SELECT a.id,a.type,a.agreement_date,a.face_paise,a.net_paise,a.interest_paise,
    CASE WHEN a.funded_date IS NOT NULL OR EXISTS (
      SELECT 1 FROM cash_movements m WHERE m.source_id=a.id AND m.kind='LOAN_OUT' AND m.reversal_of IS NULL
      AND NOT EXISTS (SELECT 1 FROM cash_movements rev WHERE rev.reversal_of=m.id)
    ) THEN 1 ELSE 0 END funded
    FROM accounts a WHERE a.type IN ('SOLO_SELF_MANAGED','JOINT_SELF_MANAGED')
    AND a.agreement_date>=? AND a.agreement_date<=? ORDER BY a.agreement_date,a.id`,period.chartStart,period.chartEnd) as BusinessLoan[];
  const cohortIds=loans.filter(row=>row.agreement_date>=period.start&&row.agreement_date<=period.end).map(row=>row.id);
  if(!cohortIds.length)return summarizeBusiness(period,now,loans,[],[],[]);
  const placeholders=cohortIds.map(()=>'?').join(',');
  const [contributions,installments,receipts]=await Promise.all([
    all(db,`SELECT c.account_id,c.party_id,p.name party_name,c.net_paise,c.profit_paise FROM contributions c JOIN parties p ON p.id=c.party_id WHERE c.account_id IN (${placeholders})`,...cohortIds),
    all(db,`SELECT id,account_id,due_date,amount_paise FROM installments WHERE account_id IN (${placeholders}) ORDER BY due_date,id`,...cohortIds),
    all(db,`SELECT r.id,r.installment_id,r.received_date,r.amount_paise FROM receipts r WHERE r.account_id IN (${placeholders}) AND r.installment_id IS NOT NULL AND r.reversal_of IS NULL AND NOT EXISTS (SELECT 1 FROM receipts rev WHERE rev.reversal_of=r.id) ORDER BY r.received_date,r.id`,...cohortIds)
  ]);
  return summarizeBusiness(period,now,loans,contributions as BusinessContribution[],installments as BusinessInstallment[],receipts as BusinessReceipt[]);
}
