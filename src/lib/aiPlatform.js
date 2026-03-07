import { computeUserHistoryStats, predictPassOddsFromHistory } from './aiInsights';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fallbackSynthesis({ rawText, deadlineISO, odds }) {
  const formatted = `User will submit proof by ${deadlineISO}. Goal: ${rawText}`;
  const riskLabel = odds <= 35 ? 'HIGH_RISK_HIGH_REWARD' : odds >= 70 ? 'LOW_RISK_STEADY' : 'BALANCED';
  return {
    formattedBet: formatted,
    riskLabel,
    provider: 'fallback',
  };
}

function fallbackBookie({ ownerName, odds, passCount, failCount }) {
  const name = ownerName || 'This user';
  if (odds < 40) {
    return `${name} is running cold: ${passCount} PASS vs ${failCount} FAIL. The YES crowd is taking a real gamble.`;
  }
  if (odds > 70) {
    return `${name} has a strong track record. If you are betting NO, bring data, not vibes.`;
  }
  return `${name} sits near coin-flip territory. This market could swing late before deadline.`;
}

function fallbackDisputeSummary({ betText, verdict, proofNote, disputeCount }) {
  return [
    `Bet: ${betText}`,
    `Current verdict: ${verdict}`,
    `Proof note: ${proofNote || 'No note submitted'}`,
    `Disputes filed: ${disputeCount}`,
    'AI recommendation: keep under review if evidence is ambiguous.',
  ].join('\n');
}

export function computeTrueOddsFromLastTen(bets, userId) {
  const mine = (bets || [])
    .filter((b) => b.ownerId === userId && b.status === 'SETTLED')
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
    .slice(0, 10);

  const pass = mine.filter((b) => b.aiVerdict === 'PASS').length;
  const fail = mine.filter((b) => b.aiVerdict === 'FAIL').length;
  const total = pass + fail;
  const odds = total > 0 ? (pass / total) * 100 : predictPassOddsFromHistory(computeUserHistoryStats(bets, userId));
  const pct = clamp(odds, 0, 100);
  const riskLabel = pct <= 35 ? 'HIGH_RISK_HIGH_REWARD' : pct >= 70 ? 'LOW_RISK_STEADY' : 'BALANCED';
  return {
    odds: pct,
    riskLabel,
    pass,
    fail,
    sample: total,
  };
}

export async function synthesizeBet({ rawText, deadlineISO, ownerName, odds }) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const model = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-1.5-flash';
  if (!apiKey) return fallbackSynthesis({ rawText, deadlineISO, odds });

  const prompt = [
    'Rewrite this social goal into one clear, verifiable accountability bet.',
    'Output JSON only: {"formattedBet":"...","riskLabel":"HIGH_RISK_HIGH_REWARD|BALANCED|LOW_RISK_STEADY"}',
    'Keep it concrete with proof expectation and specific deadline.',
    `User: ${ownerName || 'Unknown'}`,
    `Raw bet text: ${rawText}`,
    `Deadline: ${deadlineISO}`,
    `True odds: ${odds.toFixed(0)}%`,
  ].join('\n');

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { temperature: 0.2, maxOutputTokens: 220 },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    });
    if (!response.ok) return fallbackSynthesis({ rawText, deadlineISO, odds });
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('\n').trim() || '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      formattedBet: parsed?.formattedBet || fallbackSynthesis({ rawText, deadlineISO, odds }).formattedBet,
      riskLabel: parsed?.riskLabel || fallbackSynthesis({ rawText, deadlineISO, odds }).riskLabel,
      provider: 'gemini',
    };
  } catch {
    return fallbackSynthesis({ rawText, deadlineISO, odds });
  }
}

export async function generateBookieComment({ ownerName, odds, passCount, failCount, yesPool, noPool }) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const model = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-1.5-flash';
  if (!apiKey) return fallbackBookie({ ownerName, odds, passCount, failCount });

  const prompt = [
    'You are a sharp but non-toxic AI bookie for a social betting app.',
    'Write one concise top comment under 30 words.',
    'If pool is one-sided, play devil’s advocate.',
    `Owner: ${ownerName}`,
    `True odds: ${odds.toFixed(0)}%`,
    `History: PASS ${passCount}, FAIL ${failCount}`,
    `Pool snapshot YES ${yesPool}, NO ${noPool}`,
  ].join('\n');

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { temperature: 0.7, maxOutputTokens: 90 },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    });
    if (!response.ok) return fallbackBookie({ ownerName, odds, passCount, failCount });
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('\n').trim();
    return text || fallbackBookie({ ownerName, odds, passCount, failCount });
  } catch {
    return fallbackBookie({ ownerName, odds, passCount, failCount });
  }
}

export function generateSecretGesture({ userName }) {
  const gestures = [
    'Give a thumbs up and say your username clearly.',
    'Show two fingers, nod once, and say your username.',
    'Raise your right hand, smile, and say your username.',
  ];
  const seed = (userName || 'user').length % gestures.length;
  return gestures[seed];
}

export function buildPredictiveNudge({ userName, hoursLeft, againstCoins, friendCount }) {
  return `Hey ${userName}, ${hoursLeft} hours left. ${friendCount} friends have bet ${againstCoins} coins against you. Don’t let them win.`;
}

export async function summarizeDisputeEvidence({
  betText,
  verdict,
  aiReason,
  proofNote,
  disputeCount,
  predictionCount,
}) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const model = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-1.5-flash';
  if (!apiKey) {
    return {
      summary: fallbackDisputeSummary({ betText, verdict, proofNote, disputeCount }),
      provider: 'fallback',
    };
  }

  const prompt = [
    'You are first-tier dispute reviewer for a social betting platform.',
    'Return a concise "Summary of Evidence" in 4 bullet points max.',
    `Bet: ${betText}`,
    `Current verdict: ${verdict}`,
    `AI reason: ${aiReason || 'N/A'}`,
    `Proof note: ${proofNote || 'N/A'}`,
    `Dispute count: ${disputeCount}`,
    `Prediction count: ${predictionCount}`,
    'End with recommendation: KEEP or REOPEN.',
  ].join('\n');

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { temperature: 0.25, maxOutputTokens: 220 },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    });
    if (!response.ok) {
      return {
        summary: fallbackDisputeSummary({ betText, verdict, proofNote, disputeCount }),
        provider: 'fallback',
      };
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('\n').trim();
    return {
      summary: text || fallbackDisputeSummary({ betText, verdict, proofNote, disputeCount }),
      provider: 'gemini',
    };
  } catch {
    return {
      summary: fallbackDisputeSummary({ betText, verdict, proofNote, disputeCount }),
      provider: 'fallback',
    };
  }
}

