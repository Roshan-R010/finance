/** All monetary values are integer paise. Rates are rational percentages. */
export type Rounding = 'half-up' | 'half-even';

function roundedDivision(n: bigint, d: bigint, policy: Rounding): bigint {
  if (n < 0n || d <= 0n) throw new Error('Invalid division');
  const q = n / d, r = n % d;
  if (r * 2n < d) return q;
  if (r * 2n > d) return q + 1n;
  return policy === 'half-up' || q % 2n === 1n ? q + 1n : q;
}

export function calculateLoan(face: bigint, rateNumerator: bigint, rateDenominator: bigint, rounding: Rounding) {
  if (face <= 0n || rateDenominator <= 0n || rateNumerator < 0n || rateNumerator >= 100n * rateDenominator) throw new Error('Invalid face value or rate');
  if (rounding !== 'half-up' && rounding !== 'half-even') throw new Error('Rounding policy required');
  const interest = roundedDivision(face * rateNumerator, 100n * rateDenominator, rounding);
  return { face, interest, netCash: face - interest, expectedGrossProfit: interest };
}

/** Largest remainder allocation with stable caller-supplied unique IDs for tie breaks. */
export function allocate(total: bigint, shares: { id: string; weight: bigint }[]) {
  if (total < 0n || !shares.length || shares.some(s => !s.id || s.weight < 0n) || new Set(shares.map(s => s.id)).size !== shares.length) throw new Error('Invalid shares');
  const denominator = shares.reduce((sum, s) => sum + s.weight, 0n);
  if (denominator <= 0n) throw new Error('Empty allocation');
  const rows = shares.map(s => ({ ...s, amount: total * s.weight / denominator, remainder: total * s.weight % denominator }));
  let remaining = total - rows.reduce((sum, r) => sum + r.amount, 0n);
  const order = [...rows].sort((a, b) => a.remainder === b.remainder ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.remainder > b.remainder ? -1 : 1);
  for (const row of order) { if (remaining === 0n) break; row.amount++; remaining--; }
  return rows.map(({ id, amount }) => ({ id, amount }));
}

export function contributions(loan: ReturnType<typeof calculateLoan>, basis: 'FACE_SHARE' | 'NET_CASH', entries: { id: string; amount: bigint }[]) {
  if (basis !== 'FACE_SHARE' && basis !== 'NET_CASH') throw new Error('Invalid basis');
  const expected = basis === 'FACE_SHARE' ? loan.face : loan.netCash;
  if (entries.reduce((sum, e) => sum + e.amount, 0n) !== expected) throw new Error('Contributions do not reconcile');
  const profits = allocate(loan.interest, entries.map(e => ({ id: e.id, weight: e.amount })));
  return entries.map((entry, i) => {
    const profit = profits[i].amount;
    const face = basis === 'FACE_SHARE' ? entry.amount : entry.amount + profit;
    const netCash = basis === 'NET_CASH' ? entry.amount : entry.amount - profit;
    return { id: entry.id, face, netCash, expectedProfit: profit };
  });
}
