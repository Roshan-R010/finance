import 'dotenv/config';
import { db, one, run, all, transaction } from '../src/prisma-db.ts';
import { uuid, now, createAccount } from '../src/service.prisma.ts';

async function main() {
  if (process.argv[2] !== '--replace-samples') throw new Error('Run with --replace-samples to replace the existing finance records.');
  console.log('--- Starting Seed: 10 Loans & Directory Entities ---');
  
  // 1. Get owner (Ayyappan)
  const owner = await one(db, "SELECT id, name FROM parties WHERE roles ILIKE '%OWNER%' LIMIT 1");
  if (!owner) {
    throw new Error('Owner party not found! Run setup first.');
  }
  const ownerId = owner.id;
  console.log(`Found owner: ${owner.name} (${ownerId})`);
  await transaction(db, async () => {

  // 2. Clean existing accounts and children
  console.log('Cleaning existing accounts, cheques, receipts...');
  await run(db, 'DELETE FROM installment_decisions');
  await run(db, 'DELETE FROM cheques');
  await run(db, 'DELETE FROM receipts');
  await run(db, 'DELETE FROM distributions');
  await run(db, 'DELETE FROM installments');
  await run(db, 'DELETE FROM contributions');
  await run(db, 'DELETE FROM accounts');
  await run(db, 'DELETE FROM parties WHERE id <> ?', ownerId);
  await run(db, 'DELETE FROM audit_events');
  await run(db, 'DELETE FROM request_keys');

  // Helper to add party
  async function addParty(opts: {
    name: string;
    kind: 'PERSON' | 'ORGANIZATION';
    roles: string;
    phone?: string;
    address?: string;
    contactName?: string;
    organizationId?: string | null;
    notes?: string;
  }) {
    const id = uuid();
    await run(
      db,
      'INSERT INTO parties (id,name,kind,roles,phone,notes,created_at,address,contact_name,active,organization_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id,
      opts.name,
      opts.kind,
      opts.roles,
      opts.phone || '',
      opts.notes || '',
      now(),
      opts.address || '',
      opts.contactName || '',
      true,
      opts.organizationId || null
    );
    return id;
  }

  // 3. Create Organisations
  console.log('Creating Organisations...');
  const orgMurugan = await addParty({
    name: 'Sri Murugan Textiles',
    kind: 'ORGANIZATION',
    roles: 'BORROWER',
    phone: '9842100001',
    address: 'Brough Road, Erode',
    contactName: 'K. Senthil Kumar',
    notes: 'Wholesale textile manufacturer & exporter'
  });

  const orgLakshmi = await addParty({
    name: 'Lakshmi Auto Spares',
    kind: 'ORGANIZATION',
    roles: 'BORROWER',
    phone: '9842200002',
    address: 'Cross Cut Road, Gandhipuram, Coimbatore',
    contactName: 'R. Karthik',
    notes: 'Automobile spare parts retailer'
  });

  const orgBalaji = await addParty({
    name: 'Balaji Timber & Hardware',
    kind: 'ORGANIZATION',
    roles: 'BORROWER',
    phone: '9842300003',
    address: 'Trichy Main Road, Salem',
    contactName: 'S. Murugesan',
    notes: 'Teak and timber merchant'
  });

  const orgRoyal = await addParty({
    name: 'Royal Bakers & Confectionery',
    kind: 'ORGANIZATION',
    roles: 'BORROWER',
    phone: '9842400004',
    address: 'Mohanur Road, Namakkal',
    contactName: 'V. Suresh',
    notes: 'Bakery chain across 4 branches'
  });

  const orgMeenakshi = await addParty({
    name: 'Meenakshi Silks',
    kind: 'ORGANIZATION',
    roles: 'BORROWER',
    phone: '9842500005',
    address: 'South Masi Street, Madurai',
    contactName: 'P. Ramachandran',
    notes: 'Silk saree showroom & manufacturing'
  });

  const orgSaravana = await addParty({
    name: 'Saravana Traders',
    kind: 'ORGANIZATION',
    roles: 'BORROWER',
    phone: '9842600006',
    address: 'Salai Road, Dindigul',
    contactName: 'M. Saravanan',
    notes: 'Paddy and rice wholesale merchant'
  });

  const orgStarTech = await addParty({
    name: 'Star Tech Solutions',
    kind: 'ORGANIZATION',
    roles: 'BORROWER',
    phone: '9842700007',
    address: 'Anna Salai, Chennai',
    contactName: 'N. Prakash',
    notes: 'IT hardware and office networking supplies'
  });

  const orgSkTraders = await addParty({ name: 'SK Traders', kind: 'ORGANIZATION', roles: 'BORROWER' });
  const orgNorthStar = await addParty({ name: 'North Star Exports', kind: 'ORGANIZATION', roles: 'BORROWER' });

  // 4. Create Partners (Investors and External Managers)
  console.log('Creating Partners...');
  const partnerGanesh = await addParty({
    name: 'Ganesh',
    kind: 'PERSON',
    roles: 'INVESTOR,MANAGER',
    phone: '9843100010',
    address: 'Race Course, Coimbatore',
    contactName: 'Ganesh M',
    notes: 'Co-investor in commercial textile & retail loans'
  });

  const partnerSubbu = await addParty({
    name: 'Subbu',
    kind: 'PERSON',
    roles: 'INVESTOR',
    phone: '9843200020',
    address: 'Perundurai Road, Erode',
    contactName: 'Subramanian S',
    notes: 'Co-investor in trading and industrial hardware loans'
  });

  const partnerTrueFinance = await addParty({
    name: 'True Finance',
    kind: 'ORGANIZATION',
    roles: 'MANAGER',
    phone: '9843300030',
    address: 'Mount Road, Chennai',
    contactName: 'D. Natarajan',
    notes: 'External asset management syndicate'
  });

  const partnerApex = await addParty({
    name: 'Apex Finance Co.',
    kind: 'ORGANIZATION',
    roles: 'MANAGER',
    phone: '9843400040',
    address: 'Avinashi Road, Coimbatore',
    contactName: 'K. Balasubramanian',
    notes: 'External commercial lending syndicate'
  });

  // Companies are the borrower records. Only the individual borrower needs a person record.
  const borAnnamalai = await addParty({
    name: 'T. Annamalai',
    kind: 'PERSON',
    roles: 'BORROWER',
    phone: '9789800008',
    address: 'Gandhi Nagar, Tirupur',
    organizationId: null,
    notes: 'Individual borrower - contract screen printer'
  });

  // 6. Create 10 Loans
  console.log('Creating 10 Loans (8 with installments today: 2026-11-06)...');

  async function markFunded(accId: string, fundedDate: string) {
    await run(db, 'UPDATE accounts SET funded_date=? WHERE id=?', fundedDate, accId);
  }

  // Loan 1: Solo - Sri Murugan Textiles (₹10L)
  const l1 = await createAccount({
    type: 'SOLO_SELF_MANAGED',
    arrangement: 'NONE',
    borrowerId: orgMurugan,
    face: '1000000',
    rate: '10',
    agreementDate: '2026-11-01',
    basis: 'FACE_SHARE',
    notes: 'Working capital term loan for textile loom expansion',
    partners: [],
    schedule: {
      mode: 'COUNT',
      count: 10,
      firstDate: '2026-11-05',
      intervalDays: 7,
      overrides: [{ index: 1, date: '2026-11-06' }]
    }
  }, ownerId);
  await markFunded(l1.id, '2026-11-01');
  console.log('Created Loan 1:', l1.reference, '- Sri Murugan Textiles (₹10L, today: ₹1L, yesterday: ₹1L)');

  // Loan 2: Solo - Lakshmi Auto Spares (₹5L)
  const l2 = await createAccount({
    type: 'SOLO_SELF_MANAGED',
    arrangement: 'NONE',
    borrowerId: orgLakshmi,
    face: '500000',
    rate: '12',
    agreementDate: '2026-11-02',
    basis: 'FACE_SHARE',
    notes: 'Inventory stocking loan for auto spare parts',
    partners: [],
    schedule: {
      mode: 'COUNT',
      count: 5,
      firstDate: '2026-11-06',
      intervalDays: 7
    }
  }, ownerId);
  await markFunded(l2.id, '2026-11-02');
  console.log('Created Loan 2:', l2.reference, '- Lakshmi Auto Spares (₹5L, today: ₹1L)');

  // Loan 3: Solo - Balaji Timber & Hardware (₹15L)
  const l3 = await createAccount({
    type: 'SOLO_SELF_MANAGED',
    arrangement: 'NONE',
    borrowerId: orgBalaji,
    face: '1500000',
    rate: '10',
    agreementDate: '2026-11-01',
    basis: 'FACE_SHARE',
    notes: 'Seasonal timber lot procurement',
    partners: [],
    schedule: {
      mode: 'COUNT',
      count: 10,
      firstDate: '2026-11-06',
      intervalDays: 7
    }
  }, ownerId);
  await markFunded(l3.id, '2026-11-01');
  console.log('Created Loan 3:', l3.reference, '- Balaji Timber & Hardware (₹15L, today: ₹1.5L)');

  // Loan 4: Solo - Royal Bakers & Confectionery (₹8L)
  const l4 = await createAccount({
    type: 'SOLO_SELF_MANAGED',
    arrangement: 'NONE',
    borrowerId: orgRoyal,
    face: '800000',
    rate: '10',
    agreementDate: '2026-10-30',
    basis: 'FACE_SHARE',
    notes: 'Commercial oven and packaging equipment credit',
    partners: [],
    schedule: {
      mode: 'COUNT',
      count: 8,
      firstDate: '2026-11-05',
      intervalDays: 7,
      overrides: [{ index: 1, date: '2026-11-06' }]
    }
  }, ownerId);
  await markFunded(l4.id, '2026-10-30');
  console.log('Created Loan 4:', l4.reference, '- Royal Bakers & Confectionery (₹8L, today: ₹1L, yesterday: ₹1L)');

  // Loan 5: Solo - T. Annamalai (Individual, ₹2L)
  const l5 = await createAccount({
    type: 'SOLO_SELF_MANAGED',
    arrangement: 'NONE',
    borrowerId: borAnnamalai,
    face: '200000',
    rate: '12',
    agreementDate: '2026-11-04',
    basis: 'FACE_SHARE',
    notes: 'Garment printing machine repair and operating cash',
    partners: [],
    schedule: {
      mode: 'COUNT',
      count: 4,
      firstDate: '2026-11-06',
      intervalDays: 7
    }
  }, ownerId);
  await markFunded(l5.id, '2026-11-04');
  console.log('Created Loan 5:', l5.reference, '- T. Annamalai (Individual, ₹2L, today: ₹50k)');

  // Loan 6: Joint - Meenakshi Silks (₹20L) with Ganesh (₹10L)
  const l6 = await createAccount({
    type: 'JOINT_SELF_MANAGED',
    arrangement: 'NONE',
    borrowerId: orgMeenakshi,
    face: '2000000',
    rate: '10',
    agreementDate: '2026-11-01',
    basis: 'FACE_SHARE',
    notes: 'Festive season wedding silk inventory purchase',
    partners: [{ partyId: partnerGanesh, amount: '1000000' }],
    schedule: {
      mode: 'COUNT',
      count: 10,
      firstDate: '2026-11-05',
      intervalDays: 7,
      overrides: [{ index: 1, date: '2026-11-06' }]
    }
  }, ownerId);
  await markFunded(l6.id, '2026-11-01');
  console.log('Created Loan 6:', l6.reference, '- Meenakshi Silks (Joint w/ Ganesh, ₹20L, today: ₹2L, yesterday: ₹2L)');

  // Loan 7: Joint - Saravana Traders (₹12L) with Subbu (₹6L)
  const l7 = await createAccount({
    type: 'JOINT_SELF_MANAGED',
    arrangement: 'NONE',
    borrowerId: orgSaravana,
    face: '1200000',
    rate: '10',
    agreementDate: '2026-11-03',
    basis: 'FACE_SHARE',
    notes: 'Rice harvest procurement credit',
    partners: [{ partyId: partnerSubbu, amount: '600000' }],
    schedule: {
      mode: 'COUNT',
      count: 6,
      firstDate: '2026-11-06',
      intervalDays: 7
    }
  }, ownerId);
  await markFunded(l7.id, '2026-11-03');
  console.log('Created Loan 7:', l7.reference, '- Saravana Traders (Joint w/ Subbu, ₹12L, today: ₹2L)');

  // Loan 8: Joint - Star Tech Solutions (₹25L) with Ganesh (₹10L) & Subbu (₹5L)
  const l8 = await createAccount({
    type: 'JOINT_SELF_MANAGED',
    arrangement: 'NONE',
    borrowerId: orgStarTech,
    face: '2500000',
    rate: '10',
    agreementDate: '2026-11-03',
    basis: 'FACE_SHARE',
    notes: 'IT infrastructure procurement for corporate client',
    partners: [
      { partyId: partnerGanesh, amount: '1000000' },
      { partyId: partnerSubbu, amount: '500000' }
    ],
    schedule: {
      mode: 'COUNT',
      count: 10,
      firstDate: '2026-11-06',
      intervalDays: 7
    }
  }, ownerId);
  await markFunded(l8.id, '2026-11-03');
  console.log('Created Loan 8:', l8.reference, '- Star Tech Solutions (Joint w/ Ganesh & Subbu, ₹25L, today: ₹2.5L)');

  // Loan 9: Ayyappan's personal stake, managed by Ganesh for SK Traders.
  const l9 = await createAccount({
    type: 'EXTERNAL',
    arrangement: 'OWN_STAKE_EXTERNALLY_MANAGED',
    borrowerId: orgSkTraders,
    managerId: partnerGanesh,
    face: '800000',
    rate: '12',
    agreementDate: '2026-10-15',
    basis: 'FACE_SHARE',
    notes: 'Sample personal investment managed by Ganesh',
    partners: []
  }, ownerId);
  await markFunded(l9.id, '2026-10-15');
  console.log('Created Loan 9:', l9.reference, '- SK Traders (managed by Ganesh)');

  // Loan 10: External - Own Stake Externally Managed (₹30L) managed by True Finance
  const l10 = await createAccount({
    type: 'EXTERNAL',
    arrangement: 'OWN_STAKE_EXTERNALLY_MANAGED',
    borrowerId: orgNorthStar,
    managerId: partnerTrueFinance,
    face: '600000',
    rate: '14',
    agreementDate: '2026-10-20',
    basis: 'FACE_SHARE',
    notes: 'Sample personal investment managed by True Finance',
    partners: []
  }, ownerId);
  await markFunded(l10.id, '2026-10-20');
  console.log('Created Loan 10:', l10.reference, '- North Star Exports (managed by True Finance)');

  console.log('--- Seeding Completed Successfully! ---');
  }, 120000);
  await db.$disconnect();
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
