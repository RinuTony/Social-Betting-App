export function createUsersForActor(actorId, actorName) {
  return [{ id: actorId, name: actorName || 'You', coins: 1000, isSelf: true }];
}

export const rewardCatalog = [
  { id: 'r1', label: 'Starbucks Voucher', cost: 300 },
  { id: 'r2', label: 'Netflix Gift Code', cost: 500 },
  { id: 'r3', label: 'Spotify Premium Pass', cost: 450 },
];
