function cloneUsers(users) {
  return users.map((u) => ({ ...u }));
}

function pickRandomFriend(friendIds) {
  return friendIds[Math.floor(Math.random() * friendIds.length)];
}

function pickSide() {
  return Math.random() > 0.5 ? 'YES' : 'NO';
}

function randomAmount() {
  return 50 + Math.floor(Math.random() * 4) * 25;
}

export function createPromise(text, deadlineISO, actorId) {
  return {
    id: `p_${Date.now()}`,
    text,
    deadlineISO,
    actorId,
    status: 'OPEN',
    proofNote: '',
    aiVerdict: 'PENDING',
    bets: [],
    createdAtISO: new Date().toISOString(),
  };
}

export function autoSeedFriendBets(promiseObj, friendIds) {
  const used = new Set();
  const next = { ...promiseObj, bets: [...promiseObj.bets] };
  const maxBettors = Math.min(3, friendIds.length);

  while (used.size < maxBettors) {
    const bettorId = pickRandomFriend(friendIds);
    if (used.has(bettorId)) {
      continue;
    }
    used.add(bettorId);
    next.bets.push({
      bettorId,
      side: pickSide(),
      amount: randomAmount(),
    });
  }

  return next;
}

export function placeBet(promiseObj, bettorId, side, amount) {
  if (promiseObj.status !== 'OPEN') {
    return { ok: false, error: 'Bets are closed for this promise.' };
  }

  const exists = promiseObj.bets.some((b) => b.bettorId === bettorId);
  if (exists) {
    return { ok: false, error: 'You already placed a bet on this promise.' };
  }

  const next = {
    ...promiseObj,
    bets: [...promiseObj.bets, { bettorId, side, amount }],
  };

  return { ok: true, promiseObj: next };
}

export function evaluateWithMockAI(proofNote) {
  const positive = ['5am', 'done', 'proof', 'success', 'completed', 'finished'];
  const normalized = (proofNote || '').toLowerCase();
  const hasPositiveSignal = positive.some((term) => normalized.includes(term));

  if (hasPositiveSignal) {
    return 'PASS';
  }

  return Math.random() > 0.5 ? 'PASS' : 'FAIL';
}

export function settlePromise(promiseObj, users, verdict) {
  const settled = { ...promiseObj, status: 'SETTLED', aiVerdict: verdict };
  const userList = cloneUsers(users);
  const winnerSide = verdict === 'PASS' ? 'YES' : 'NO';

  settled.bets.forEach((bet) => {
    const user = userList.find((u) => u.id === bet.bettorId);
    if (!user) {
      return;
    }

    if (bet.side === winnerSide) {
      user.coins += bet.amount;
    } else {
      user.coins = Math.max(0, user.coins - bet.amount);
    }
  });

  return { promiseObj: settled, users: userList };
}

export function sumPool(promiseObj) {
  return promiseObj.bets.reduce((acc, b) => acc + b.amount, 0);
}

export function splitBets(promiseObj) {
  return promiseObj.bets.reduce(
    (acc, bet) => {
      if (bet.side === 'YES') acc.yes += bet.amount;
      if (bet.side === 'NO') acc.no += bet.amount;
      return acc;
    },
    { yes: 0, no: 0 }
  );
}