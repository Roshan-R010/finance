import test from 'node:test';
import assert from 'node:assert/strict';
import { db, run, transaction, one, all } from '../src/prisma-db.ts';
import { uuid, now, today, createAccount, deleteAccount, deleteParty, recordReceipt } from '../src/service.prisma.ts';

test('deleteAccount cascades and deleteParty respects loan links and owner protection', async () => {
  const owner = uuid(), borrower = uuid(), org = uuid(), investor = uuid();
  const day = today();

  try {
    await transaction(db, async () => {
      await run(db, 'INSERT INTO users VALUES (?,?,?,?)', owner, 'del-test-' + owner, 'test-pw', now());
      await run(db, 'INSERT INTO parties (id,name,kind,roles,phone,notes,created_at) VALUES (?,?,?,?,?,?,?)', owner, 'Owner Ayyappan', 'PERSON', 'OWNER,INVESTOR', '', '', now());
      await run(db, 'INSERT INTO parties (id,name,kind,roles,phone,notes,created_at) VALUES (?,?,?,?,?,?,?)', org, 'Test Holding Org', 'ORGANIZATION', 'BUSINESS', '', '', now());
      await run(db, 'INSERT INTO parties (id,name,kind,roles,phone,notes,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?)', borrower, 'Test Borrower Member', 'PERSON', 'BORROWER', '', '', org, now());
      await run(db, 'INSERT INTO parties (id,name,kind,roles,phone,notes,created_at) VALUES (?,?,?,?,?,?,?)', investor, 'Test Contributor', 'PERSON', 'INVESTOR', '', '', now());

      // 1. Owner protection
      await assert.rejects(deleteParty(owner, owner), /The owner account cannot be deleted/);

      // 2. Create a joint loan
      const account = await createAccount({
        type: 'JOINT_SELF_MANAGED',
        arrangement: 'NONE',
        borrowerId: borrower,
        face: '500000',
        rate: '10',
        agreementDate: day,
        schedule: { mode: 'COUNT', count: 5, firstDate: day, intervalDays: 7 },
        basis: 'FACE_SHARE',
        partners: [{ partyId: investor, amount: '200000' }]
      }, owner);

      // Add a receipt to test receipt cascading
      const inst = await one(db, 'SELECT id FROM installments WHERE account_id=? ORDER BY sequence_no LIMIT 1', account.id);
      await recordReceipt({
        amount: '1000',
        method: 'CASH',
        installmentId: inst.id,
        receivedDate: day,
        reference: 'RC-TEST-1'
      }, account.id, owner);

      // 3. Trying to delete borrower or investor linked to the loan must fail with clear message
      await assert.rejects(
        deleteParty(borrower, owner),
        /Cannot delete "Test Borrower Member" because it is linked to loan\(s\)/
      );
      await assert.rejects(
        deleteParty(investor, owner),
        /Cannot delete "Test Contributor" because it is linked to loan\(s\)/
      );

      // 4. Delete the loan
      const delLoanResult = await deleteAccount(account.id, owner);
      assert.equal(delLoanResult.ok, true);

      // Verify cascading deletion of all account child tables
      assert.equal(await one(db, 'SELECT id FROM accounts WHERE id=?', account.id), undefined);
      assert.equal((await all(db, 'SELECT id FROM installments WHERE account_id=?', account.id)).length, 0);
      assert.equal((await all(db, 'SELECT id FROM cheques WHERE account_id=?', account.id)).length, 0);
      assert.equal((await all(db, 'SELECT id FROM contributions WHERE account_id=?', account.id)).length, 0);
      assert.equal((await all(db, 'SELECT id FROM receipts WHERE account_id=?', account.id)).length, 0);

      // Verify audit log for deleted loan
      const loanAudit = await one(db, "SELECT * FROM audit_events WHERE entity='account' AND entity_id=? AND action='deleted'", account.id);
      assert.ok(loanAudit, 'Loan deletion logged in audit events');

      // 5. Now borrower party is not linked to any loan, deletion must succeed
      const delBorrowerResult = await deleteParty(borrower, owner);
      assert.equal(delBorrowerResult.ok, true);
      assert.equal(await one(db, 'SELECT id FROM parties WHERE id=?', borrower), undefined);

      // 6. Org with member individuals: test unlinking when org is deleted
      // Create a new member person linked to org
      const member2 = uuid();
      await run(db, 'INSERT INTO parties (id,name,kind,roles,phone,notes,organization_id,created_at) VALUES (?,?,?,?,?,?,?,?)', member2, 'Second Member', 'PERSON', 'BORROWER', '', '', org, now());
      assert.equal((await one(db, 'SELECT organization_id FROM parties WHERE id=?', member2)).organization_id, org);

      // Delete the org
      const delOrgResult = await deleteParty(org, owner);
      assert.equal(delOrgResult.ok, true);
      assert.equal(await one(db, 'SELECT id FROM parties WHERE id=?', org), undefined);

      // Verify member2's organization_id was unlinked to NULL without foreign key error
      const member2After = await one(db, 'SELECT organization_id FROM parties WHERE id=?', member2);
      assert.equal(member2After.organization_id, null);

      // Verify audit event for deleted party
      const orgAudit = await one(db, "SELECT * FROM audit_events WHERE entity='party' AND entity_id=? AND action='deleted'", org);
      assert.ok(orgAudit, 'Party deletion logged in audit events');

      throw new Error('ROLLBACK_CHECK');
    }, 180000);
  } catch (err: any) {
    if (err.message !== 'ROLLBACK_CHECK') throw err;
  }
  await db.$disconnect();
});
