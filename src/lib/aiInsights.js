function safePct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function computeUserHistoryStats(bets, userId) {
  const mine = (bets || []).filter((b) => b.ownerId === userId);
  const settled = mine.filter((b) => b.status === 'SETTLED');
  const passCount = settled.filter((b) => b.aiVerdict === 'PASS').length;
  const failCount = settled.filter((b) => b.aiVerdict === 'FAIL').length;
  const expiredCount = mine.filter((b) => b.status === 'EXPIRED').length;
  const underReviewCount = mine.filter((b) => b.status === 'UNDER_REVIEW').length;
  const resolvedCount = passCount + failCount;
  const avgPool =
    mine.length > 0
      ? mine.reduce((acc, b) => acc + (Number.isFinite(b.poolTotal) ? b.poolTotal : 0), 0) / mine.length
      : 0;

  return {
    totalBets: mine.length,
    settledBets: settled.length,
    resolvedCount,
    passCount,
    failCount,
    expiredCount,
    underReviewCount,
    avgPool: Math.round(avgPool),
  };
}

export function predictPassOddsFromHistory(stats) {
  const pass = Number(stats?.passCount || 0);
  const fail = Number(stats?.failCount || 0);
  const expiredPenalty = Number(stats?.expiredCount || 0) * 0.5;
  const alpha = 1;
  const beta = 1;
  const prob = (pass + alpha) / (pass + fail + expiredPenalty + alpha + beta);
  return safePct(prob * 100);
}

function fallbackRecap({ userName, stats, odds }) {
  const name = userName || 'This user';
  return `${name} posted ${stats.totalBets} bets with ${stats.passCount} PASS and ${stats.failCount} FAIL outcomes. ` +
    `Current projected success odds: ${odds.toFixed(0)}%. Avg pool: ${stats.avgPool} coins.`;
}

export async function generateUserRecap({ userName, stats, odds }) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const model = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-1.5-flash';

  if (!apiKey) {
    return {
      recap: fallbackRecap({ userName, stats, odds }),
      provider: 'fallback',
    };
  }

  const prompt = [
    'You are an assistant creating a concise performance recap for a social accountability app.',
    'Return 2-3 short sentences.',
    `User: ${userName || 'Unknown user'}`,
    `Total bets: ${stats.totalBets}`,
    `PASS: ${stats.passCount}, FAIL: ${stats.failCount}, EXPIRED: ${stats.expiredCount}, UNDER_REVIEW: ${stats.underReviewCount}`,
    `Average pool: ${stats.avgPool} coins`,
    `Predicted PASS odds next bet: ${odds.toFixed(0)}%`,
    'Tone: factual, neutral, clear.',
  ].join('\n');

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 180,
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      return {
        recap: fallbackRecap({ userName, stats, odds }),
        provider: 'fallback',
      };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('\n').trim();
    if (!text) {
      return {
        recap: fallbackRecap({ userName, stats, odds }),
        provider: 'fallback',
      };
    }

    return {
      recap: text,
      provider: 'gemini',
    };
  } catch {
    return {
      recap: fallbackRecap({ userName, stats, odds }),
      provider: 'fallback',
    };
  }
}
