import test from 'node:test';
import assert from 'node:assert/strict';
import { db, run, transaction, one, all } from '../src/prisma-db.ts';
import { uuid, now, today, shiftDate, createAccount, updateAccount, accountView, businessDashboard, personalDashboard, chequeList, confirmChequeResult, reverseReceipt } from '../src/service.prisma.ts';
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
      await run(db,'UPDATE parties SET phone=? WHERE id=?','9876543210',organization);
      await run(db,'UPDATE parties SET organization_id=? WHERE id=?',organization,jointBorrower);
      assert.equal((await one(db,'SELECT organization_id FROM parties WHERE id=?',jointBorrower)).organization_id,organization);
      const solo=await createAccount({type:'SOLO_SELF_MANAGED',arrangement:'NONE',borrowerId:soloBorrower,face:'10000',rate:'10',agreementDate:day,schedule:{mode:'COUNT',count:10,firstDate:day,intervalDays:7},basis:'FACE_SHARE',partners:[]},owner);
      const joint=await createAccount({type:'JOINT_SELF_MANAGED',arrangement:'NONE',borrowerId:jointBorrower,face:'3000',rate:'10',agreementDate:day,schedule:{mode:'COUNT',count:3,firstDate:day,intervalDays:1},basis:'FACE_SHARE',partners:[{partyId:investor,amount:'1500'}]},owner);
      const month=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(day.slice(5,7))-1];
      const prefix=`LN${month}${Number(day.slice(8,10))}-`;
      assert.ok(solo.reference.startsWith(prefix));
      assert.equal(Number(joint.reference.slice(prefix.length)),Number(solo.reference.slice(prefix.length))+1);
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
        await run(db,'INSERT INTO accounts (id,reference,type,arrangement,borrower_id,manager_id,face_paise,interest_paise,net_paise,rate_text,rounding_policy,agreement_date,funded_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',accountId,'EXT-'+accountId.slice(0,8),'EXTERNAL',arrangement,null,manager,100000,10000,90000,'10','half-up',day,null,'ACTIVE','',stamp,stamp);
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
      assert.ok(ours(todayList.rows).some(r=>r.account_id===joint.id&&r.borrower_phone==='9876543210'));
      const rangeList=await chequeList('today',day,shiftDate(day,7));
      assert.equal(ours(rangeList.rows).length,5);
      assert.equal(rangeList.endDate,shiftDate(day,7));
      await assert.rejects(chequeList('today',day,yesterday),/End date must be on or after start date/);
      assert.equal(ours((await chequeList('today',shiftDate(day,1))).rows).length,1);
      assert.equal(ours((await chequeList('older')).rows).length,1);
      assert.equal(ours((await chequeList('followup')).rows).length,2);
      assert.equal(ours((await chequeList('upcoming')).rows).length,3);
      const pdf=chequeDepositPdf(todayList).toString('ascii');
      assert.match(pdf,/Cheques to Deposit/);
      assert.match(pdf,/Solo Business/);
      assert.match(pdf,/Linked Organisation/);
      assert.match(pdf,/9876543210/);
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
      // Companies can borrow directly without a person record or contact name.
      const companyLoan=await createAccount({type:'SOLO_SELF_MANAGED',arrangement:'NONE',borrowerId:organization,face:'1000',rate:'10',agreementDate:day,schedule:{mode:'COUNT',count:1,firstDate:day,intervalDays:7},basis:'FACE_SHARE',partners:[]},owner);
      const companyBefore=await accountView(companyLoan.id);
      assert.equal(companyBefore.account.borrower_id,organization);
      assert.equal(companyBefore.account.borrower_name,'Linked Organisation');
      assert.equal(companyBefore.account.contact_name,'');
      await updateAccount(companyLoan.id,{contactName:'  Display Only Contact  '},owner);
      let companyAfter=await accountView(companyLoan.id);
      assert.equal(companyAfter.account.contact_name,'Display Only Contact');
      assert.equal(companyAfter.account.borrower_id,organization);
      assert.equal(companyAfter.account.face_paise,companyBefore.account.face_paise);
      assert.equal(companyAfter.collected_paise,companyBefore.collected_paise);
      assert.deepEqual(companyAfter.installments,companyBefore.installments);
      assert.deepEqual(companyAfter.contributions,companyBefore.contributions);
      const companyWorklist=await chequeList('today');
      const companyRow=companyWorklist.rows.find(r=>r.account_id===companyLoan.id);
      assert.equal(companyRow?.borrower_name,'Linked Organisation');
      const companyPdf=chequeDepositPdf({...companyWorklist,rows:[companyRow],count:1,amount:companyRow.amount_paise}).toString('ascii');
      assert.ok(companyPdf.includes('Linked Organisation'));
      assert.ok(!companyPdf.includes('Display Only Contact'));
      await updateAccount(companyLoan.id,{notes:'Contact unchanged'},owner);
      assert.equal((await accountView(companyLoan.id)).account.contact_name,'Display Only Contact');
      await updateAccount(companyLoan.id,{rate:'11',contactName:'Edited contact'},owner);
      assert.equal((await accountView(companyLoan.id)).account.contact_name,'Edited contact');
      await updateAccount(companyLoan.id,{contactName:''},owner);
      assert.equal((await accountView(companyLoan.id)).account.contact_name,'');
      await run(db,'UPDATE parties SET active=false WHERE id=?',jointBorrower);
      await assert.rejects(createAccount({type:'SOLO_SELF_MANAGED',arrangement:'NONE',borrowerId:jointBorrower,face:'1000',rate:'10',agreementDate:day,schedule:{mode:'COUNT',count:1,firstDate:day},basis:'FACE_SHARE',partners:[]},owner),/active registered borrower/);
      // Manager IDs are configuration keys; every external scenario remains outside cheque operations.
      const trueFinance=uuid();
      process.env.FINFAM_GANESH_MANAGER_ID=manager;
      process.env.FINFAM_TRUE_FINANCE_MANAGER_ID=trueFinance;
      await run(db,"UPDATE parties SET roles='MANAGER,INVESTOR' WHERE id=?",manager);
      await run(db,'INSERT INTO parties (id,name,kind,roles,phone,notes,created_at) VALUES (?,?,?,?,?,?,?)',trueFinance,'True Finance','ORGANIZATION','MANAGER','','',now());
      const businessBeforeExternal=await businessDashboard();
      const ganeshStake=await createAccount({type:'EXTERNAL',arrangement:'OWN_STAKE_EXTERNALLY_MANAGED',managerId:manager,face:'250000',rate:'17',agreementDate:day,basis:'FACE_SHARE',partners:[]},owner);
      const trueSolo=await createAccount({type:'EXTERNAL',arrangement:'MANAGED_POOL',managerId:trueFinance,face:'500000',rate:'17',agreementDate:day,basis:'FACE_SHARE',partners:[]},owner);
      const trueJoint=await createAccount({type:'EXTERNAL',arrangement:'MANAGED_POOL',managerId:trueFinance,face:'500000',rate:'17',agreementDate:day,basis:'FACE_SHARE',partners:[{partyId:manager,amount:'250000'}]},owner);
      assert.equal((await accountView(ganeshStake.id)).account.borrower_id,null);
      assert.equal((await accountView(ganeshStake.id)).contributions.length,1);
      assert.equal((await accountView(trueSolo.id)).contributions.length,1);
      const trueJointView=await accountView(trueJoint.id);
      assert.equal(trueJointView.installments.length,0);
      assert.deepEqual(trueJointView.contributions.map(c=>c.face_paise).sort((a,b)=>a-b),[25000000,25000000]);
      const personal=await personalDashboard(owner);
      assert.equal(personal.accounts.find(a=>a.id===trueJoint.id)?.own_net,20750000);
      assert.equal(personal.externalBreakdown.find((row:any)=>row.managerId===trueFinance)?.poolFace,100000000);
      assert.deepEqual((await businessDashboard()).metrics,businessBeforeExternal.metrics);
      assert.equal((await chequeList('today')).rows.some(row=>[ganeshStake.id,trueSolo.id,trueJoint.id].includes(row.account_id)),false);
      await updateAccount(trueJoint.id,{partners:[{partyId:manager,amount:'200000'}],basis:'FACE_SHARE'},owner);
      assert.equal((await accountView(trueJoint.id)).contributions.find(c=>c.party_id===owner)?.face_paise,30000000);
      await assert.rejects(createAccount({type:'EXTERNAL',arrangement:'MANAGED_POOL',managerId:manager,face:'1000',rate:'10',agreementDate:day,partners:[]},owner),/do not match/);
      await assert.rejects(createAccount({type:'EXTERNAL',arrangement:'MANAGED_POOL',managerId:trueFinance,face:'1000',rate:'10',agreementDate:day,partners:[{partyId:investor,amount:'500'}]},owner),/does not allow/);
      throw new Error('ROLLBACK_CHECK');
    },180000);
  }catch(error:any){if(error.message!=='ROLLBACK_CHECK')throw error;}
  assert.equal(await one(db,'SELECT id FROM users WHERE id=?',owner),undefined);
  await db.$disconnect();
});
