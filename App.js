import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { friendIds, initialUsers, rewardCatalog } from './src/data/seed';
import {
  autoSeedFriendBets,
  createPromise,
  evaluateWithMockAI,
  placeBet,
  settlePromise,
  splitBets,
  sumPool,
} from './src/logic/betting';
import TopNav from './src/components/TopNav';

const SELF_ID = 'u1';
const DEFAULT_BET = '100';

export default function App() {
  const [users, setUsers] = useState(initialUsers);
  const [promises, setPromises] = useState([]);
  const [tab, setTab] = useState('Feed');
  const [promiseText, setPromiseText] = useState('');
  const [deadline, setDeadline] = useState('');
  const [proof, setProof] = useState({});
  const [betAmount, setBetAmount] = useState(DEFAULT_BET);
  const [message, setMessage] = useState('');

  const self = users.find((u) => u.id === SELF_ID);

  const usersById = useMemo(() => {
    return users.reduce((acc, u) => {
      acc[u.id] = u;
      return acc;
    }, {});
  }, [users]);

  const createNewPromise = () => {
    if (!promiseText.trim() || !deadline.trim()) {
      setMessage('Add both a promise and deadline.');
      return;
    }

    const base = createPromise(promiseText.trim(), deadline.trim(), SELF_ID);
    const withFriendBets = autoSeedFriendBets(base, friendIds);
    setPromises((prev) => [withFriendBets, ...prev]);
    setPromiseText('');
    setDeadline('');
    setMessage('Promise posted. Friends started betting.');
  };

  const handleFriendBet = (promiseId, side) => {
    const amount = Number(betAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('Enter a valid bet amount.');
      return;
    }

    const friendId = friendIds[Math.floor(Math.random() * friendIds.length)];

    setPromises((prev) =>
      prev.map((p) => {
        if (p.id !== promiseId) {
          return p;
        }

        const result = placeBet(p, friendId, side, amount);
        if (!result.ok) {
          setMessage(result.error);
          return p;
        }

        setMessage(`${usersById[friendId]?.name || 'Friend'} bet ${side}.`);
        return result.promiseObj;
      })
    );
  };

  const submitProof = (promiseId) => {
    const note = proof[promiseId] || '';
    const verdict = evaluateWithMockAI(note);

    setPromises((prev) => {
      let nextUsers = users;
      const nextPromises = prev.map((p) => {
        if (p.id !== promiseId || p.status !== 'OPEN') {
          return p;
        }

        const withProof = { ...p, proofNote: note };
        const settled = settlePromise(withProof, users, verdict);
        nextUsers = settled.users;
        return settled.promiseObj;
      });

      setUsers(nextUsers);
      return nextPromises;
    });

    setMessage(`AI verdict: ${verdict}. Coins settled.`);
  };

  const redeemReward = (reward) => {
    if (!self || self.coins < reward.cost) {
      setMessage('Not enough coins for that reward.');
      return;
    }

    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== SELF_ID) {
          return u;
        }
        return { ...u, coins: u.coins - reward.cost };
      })
    );

    setMessage(`${reward.label} redeemed.`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Social Prediction</Text>
        <Text style={styles.subtitle}>Bet on promises. Make accountability social.</Text>

        <TopNav current={tab} onChange={setTab} />

        {tab === 'Feed' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Post a Promise</Text>
              <TextInput
                value={promiseText}
                onChangeText={setPromiseText}
                placeholder="I will wake up at 5 AM tomorrow"
                placeholderTextColor="#7284A7"
                style={styles.input}
              />
              <TextInput
                value={deadline}
                onChangeText={setDeadline}
                placeholder="Deadline (e.g. Tomorrow 5:00 AM)"
                placeholderTextColor="#7284A7"
                style={styles.input}
              />
              <Pressable style={styles.primaryBtn} onPress={createNewPromise}>
                <Text style={styles.primaryBtnText}>Post Promise</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Community Feed</Text>
              <TextInput
                value={betAmount}
                onChangeText={setBetAmount}
                keyboardType="number-pad"
                placeholder="Bet amount"
                placeholderTextColor="#7284A7"
                style={styles.input}
              />

              {promises.length === 0 && (
                <Text style={styles.dimText}>No promises yet. Create one above.</Text>
              )}

              {promises.map((p) => {
                const split = splitBets(p);
                return (
                  <View key={p.id} style={styles.promiseCard}>
                    <Text style={styles.promiseText}>{p.text}</Text>
                    <Text style={styles.meta}>Deadline: {p.deadlineISO}</Text>
                    <Text style={styles.meta}>Pool: {sumPool(p)} coins (YES {split.yes} / NO {split.no})</Text>
                    <Text
                      style={[
                        styles.status,
                        p.aiVerdict === 'PASS' && styles.pass,
                        p.aiVerdict === 'FAIL' && styles.fail,
                      ]}
                    >
                      Status: {p.status} | AI: {p.aiVerdict}
                    </Text>

                    <View style={styles.rowGap}>
                      <Pressable style={styles.smallBtn} onPress={() => handleFriendBet(p.id, 'YES')}>
                        <Text style={styles.smallBtnText}>Friend Bets YES</Text>
                      </Pressable>
                      <Pressable style={styles.smallBtnAlt} onPress={() => handleFriendBet(p.id, 'NO')}>
                        <Text style={styles.smallBtnText}>Friend Bets NO</Text>
                      </Pressable>
                    </View>

                    {p.status === 'OPEN' && (
                      <View style={styles.proofWrap}>
                        <TextInput
                          value={proof[p.id] || ''}
                          onChangeText={(value) =>
                            setProof((prev) => ({
                              ...prev,
                              [p.id]: value,
                            }))
                          }
                          placeholder="Proof note (e.g. photo says 5:01 AM run completed)"
                          placeholderTextColor="#7284A7"
                          style={styles.input}
                        />
                        <Pressable style={styles.primaryBtn} onPress={() => submitProof(p.id)}>
                          <Text style={styles.primaryBtnText}>Submit Proof for AI</Text>
                        </Pressable>
                      </View>
                    )}

                    <Text style={styles.meta}>Bets:</Text>
                    {p.bets.map((bet, idx) => (
                      <Text key={`${p.id}_${idx}`} style={styles.betLine}>
                        {usersById[bet.bettorId]?.name || 'Unknown'} -> {bet.side} ({bet.amount})
                      </Text>
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {tab === 'Wallet' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Coin Wallet</Text>
            {users.map((u) => (
              <View key={u.id} style={styles.walletRow}>
                <Text style={styles.walletName}>{u.name}{u.isSelf ? ' (You)' : ''}</Text>
                <Text style={styles.walletCoins}>{u.coins} coins</Text>
              </View>
            ))}
            <Text style={styles.dimText}>When AI marks PASS, YES bettors win. When FAIL, NO bettors win.</Text>
          </View>
        )}

        {tab === 'Rewards' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Redeem Rewards</Text>
            <Text style={styles.meta}>Your balance: {self?.coins || 0} coins</Text>
            {rewardCatalog.map((reward) => (
              <View key={reward.id} style={styles.rewardRow}>
                <View>
                  <Text style={styles.rewardLabel}>{reward.label}</Text>
                  <Text style={styles.meta}>{reward.cost} coins</Text>
                </View>
                <Pressable style={styles.smallBtn} onPress={() => redeemReward(reward)}>
                  <Text style={styles.smallBtnText}>Redeem</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {!!message && (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{message}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 16,
    color: '#9DB0D4',
  },
  card: {
    backgroundColor: '#111C31',
    borderColor: '#1B2B49',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#EAF0FF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#0E1728',
    borderWidth: 1,
    borderColor: '#294067',
    color: '#F2F6FF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: '#2A4FB9',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dimText: {
    color: '#91A3C3',
    marginTop: 8,
  },
  promiseCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#0D1628',
    borderWidth: 1,
    borderColor: '#23385E',
  },
  promiseText: {
    color: '#F5F8FF',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  meta: {
    color: '#A4B4CF',
    marginBottom: 4,
  },
  status: {
    color: '#D2DCF0',
    fontWeight: '600',
    marginBottom: 8,
  },
  pass: {
    color: '#53D28C',
  },
  fail: {
    color: '#FF7E7E',
  },
  rowGap: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  smallBtn: {
    backgroundColor: '#2B4EC2',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  smallBtnAlt: {
    backgroundColor: '#A04343',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  smallBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  proofWrap: {
    marginTop: 4,
    marginBottom: 8,
  },
  betLine: {
    color: '#C8D4EB',
    marginTop: 2,
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#223559',
    paddingBottom: 8,
  },
  walletName: {
    color: '#E5EDFF',
    fontWeight: '600',
  },
  walletCoins: {
    color: '#87E1A0',
    fontWeight: '700',
  },
  rewardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#223559',
  },
  rewardLabel: {
    color: '#F1F5FF',
    fontWeight: '600',
  },
  toast: {
    marginTop: 8,
    backgroundColor: '#173059',
    borderColor: '#2A4FB9',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  toastText: {
    color: '#D7E6FF',
    fontWeight: '500',
  },
});