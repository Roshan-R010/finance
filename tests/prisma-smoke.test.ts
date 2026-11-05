import test from 'node:test';
import assert from 'node:assert/strict';
import { db, run, transaction, one, all } from '../src/prisma-db.ts';
import { uuid, now, today, shiftDate, createAccount, accountView, businessDashboard, chequeList, confirmChequeResult, reverseReceipt } from '../src/service.prisma.ts';
import { chequeDepositPdf, formatInr } from '../src/cheque-pdf.ts';

test('scheduled cheque metrics and bank results use full managed scope',async()=>{
  const owner=uuid(),soloBorrower=uuid(),jointBorrower=uuid(),investor=uuid(),manager=uuid(),organization=uuid();
  const day=today(),yesterday=shiftDate(day,-1),older=shiftDate(day,-3);
  try{
    await transaction(db,async()=>{
      const baseline=await businessDashboard();
      await run(db,'INSERT INTO users VALUES (?,?,?,?)',owner,'cheque-smoke-'+owner,'test-only',now());
      for(const [id,name,roles] of [[owner,'Ayyappan','OWNER,INVESTOR'],[soloBorrower,'Solo Business','BORROWER'],[jointBorrower,'Joint Business','BORROWER'],[investor,'Investor','INVESTOR'],[manager,'External Manager','MANAGER']]){
        await run(db,'INSERT INTO parties (id,name,kind,roles,phone,notes,created_at) VALUES (?,?,?,?,?,?,?)',id,name,'PERSON',roles,'','',now());
      }
      await run(db,'INSERT INTO parties (id,name,kind,roles,phone,notes,created_at) VALUES (?,?,?,?,?,?,?)',organization,'Linked Organisation','ORGANIZATION','BUSINESS','','',now());
      await run(db,'UPDATE parties SET organization_id=? WHERE id=?',organization,jointBorrower);
      assert.equal((await one(db,'SELECT organization_id FROM parties WHERE id=?',jointBorrower)).organization_id,organization);
      const solo=await createAccount({type:'SOLO_SELF_MANAGED',arrangement:'NONE',borrowerId:soloBorrower,face:'10000',rate:'10',agreementDate:day,schedule:{mode:'COUNT',count:10,firstDate:day,intervalDays:7},basis:'FACE_SHARE',partners:[]},owner);
      const joint=await createAccount({type:'JOINT_SELF_MANAGED',arrangement:'NONE',borrowerId:jointBorrower,face:'3000',rate:'10',agreementDate:day,schedule:{mode:'COUNT',count:3,firstDate:day,intervalDays:1},basis:'FACE_SHARE',partners:[{partyId:investor,amount:'1500'}]},owner);
      const soloRows=await all(db,'SELECT c.* FROM cheques c JOIN installments i ON i.id=c.installment_id WHERE c.account_id=? ORDER BY i.sequence_no',solo.id);
      const jointRows=await all(db,'SELECT c.* FROM cheques c JOIN installments i ON i.id=c.installment_id WHERE c.account_id=? ORDER BY i.sequence_no',joint.id);
      assert.equal(soloRows.length,10);
      assert.equal(jointRows.length,3);
      assert.equal((await accountView(joint.id)).contributions.length,2);
      assert.equal(Number(jointRows[0].amount_paise),100000);
      const dates=[day,yesterday,older,shiftDate(day,1),shiftDate(day,7),shiftDate(day,8),older,yesterday,shiftDate(day,14),shiftDate(day,21)];
      for(let i=0;i<soloRows.length;i++){
        await run(db,'UPDATE cheques SET scheduled_date=? WHERE id=?',dates[i],soloRows[i].id);
        await run(db,'UPDATE installments SET due_date=? WHERE id=?',dates[i],soloRows[i].installment_id);
      }
      for(const [i,scheduled] of [[1,yesterday],[2,shiftDate(day,7)]] as const){
        await run(db,'UPDATE cheques SET scheduled_date=? WHERE id=?',scheduled,jointRows[i].id);
        await run(db,'UPDATE installments SET due_date=? WHERE id=?',scheduled,jointRows[i].installment_id);
      }
      for(const arrangement of ['MANAGED_POOL','OWN_STAKE_EXTERNALLY_MANAGED']){
        const accountId=uuid(),installmentId=uuid(),stamp=now();
        await run(db,'INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',accountId,'EXT-'+accountId.slice(0,8),'EXTERNAL',arrangement,null,manager,100000,10000,90000,'10','half-up',day,null,'ACTIVE','',stamp,stamp);
        await run(db,'INSERT INTO installments VALUES (?,?,?,?,?,?)',installmentId,accountId,1,day,100000,0);
        await run(db,'INSERT INTO cheques (id,account_id,installment_id,scheduled_date,amount_paise,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',uuid(),accountId,installmentId,day,100000,'PENDING',stamp,stamp);
      }
      await confirmChequeResult(soloRows[6].id,'BOUNCED',owner);
      const oldPass=await confirmChequeResult(soloRows[7].id,'PASSED',owner);
      assert.ok(oldPass.receiptId);
      let summary=await businessDashboard();
      const delta=(key:string)=>({count:summary.metrics[key].count-baseline.metrics[key].count,amount:summary.metrics[key].amount-baseline.metrics[key].amount});
      assert.deepEqual(delta('today'),{count:2,amount:200000});
      assert.deepEqual(delta('yesterday'),{count:2,amount:200000});
      assert.deepEqual(delta('olderPending'),{count:1,amount:100000});
      assert.deepEqual(delta('bounced'),{count:1,amount:100000});
      assert.deepEqual(delta('followup'),{count:2,amount:200000});
      assert.deepEqual(delta('upcoming'),{count:3,amount:300000});
      const ours=(rows:any[])=>rows.filter(r=>r.account_id===solo.id||r.account_id===joint.id);
      const todayList=await chequeList('today');
      assert.equal(ours(todayList.rows).length,2);
      assert.equal(ours(todayList.rows).reduce((n,r)=>n+r.amount_paise,0),200000);
      assert.ok(ours(todayList.rows).every(r=>r.status==='PENDING'));
      assert.ok(ours(todayList.rows).some(r=>r.account_id===joint.id&&r.borrower_name==='Linked Organisation'));
      assert.equal(ours((await chequeList('today',shiftDate(day,1))).rows).length,1);
      assert.equal(ours((await chequeList('older')).rows).length,1);
      assert.equal(ours((await chequeList('followup')).rows).length,2);
      assert.equal(ours((await chequeList('upcoming')).rows).length,3);
      const pdf=chequeDepositPdf(todayList).toString('ascii');
      assert.match(pdf,/Cheques to Deposit/);
      assert.match(pdf,/Solo Business/);
      assert.match(pdf,/Linked Organisation/);
      assert.ok(pdf.includes(formatInr(todayList.amount)));
      assert.ok(pdf.includes('/MediaBox [0 0 595 842]'));
      const before=(await accountView(joint.id)).collected_paise;
      const passed=await confirmChequeResult(jointRows[1].id,'PASSED',owner);
      assert.equal((await accountView(joint.id)).collected_paise-before,100000);
      assert.equal((await accountView(joint.id)).installments[1].paid_paise,100000);
      assert.deepEqual((await accountView(joint.id)).contributions.map(c=>c.collected_paise).sort((a,b)=>a-b),[50000,50000]);
      await assert.rejects(confirmChequeResult(jointRows[1].id,'PASSED',owner),/already has a confirmed result/);
      await assert.rejects(reverseReceipt(passed.receiptId!,{reason:'Test'},owner),/confirmed cheque result/);
      assert.ok(await one(db,"SELECT id FROM audit_events WHERE entity='cheque' AND entity_id=? AND action='passed_confirmed'",jointRows[1].id));
      const soloBefore=(await accountView(solo.id)).collected_paise;
      await confirmChequeResult(soloRows[1].id,'BOUNCED',owner);
      assert.equal((await accountView(solo.id)).collected_paise,soloBefore);
      summary=await businessDashboard();
      assert.equal(summary.metrics.yesterday.count,baseline.metrics.yesterday.count);
      assert.equal(summary.metrics.followup.count,baseline.metrics.followup.count+3);
      assert.equal(shiftDate('2026-12-30',7),'2027-01-06');
      await run(db,'UPDATE parties SET active=false WHERE id=?',jointBorrower);
      await assert.rejects(createAccount({type:'SOLO_SELF_MANAGED',arrangement:'NONE',borrowerId:jointBorrower,face:'1000',rate:'10',agreementDate:day,schedule:{mode:'COUNT',count:1,firstDate:day},basis:'FACE_SHARE',partners:[]},owner),/active registered borrower/);
      throw new Error('ROLLBACK_CHECK');
    },180000);
  }catch(error:any){if(error.message!=='ROLLBACK_CHECK')throw error;}
  assert.equal(await one(db,'SELECT id FROM users WHERE id=?',owner),undefined);
  await db.$disconnect();
});
