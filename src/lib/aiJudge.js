import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { evaluateWithMockAI } from '../logic/betting';

function buildPrompt({ note, betText, deadlineISO }) {
  return [
    'You are a strict proof verifier for a social accountability app.',
    'Decide if the proof supports the claimed completion for the specific bet.',
    'Run anti-cheat checks conceptually: OCR hints (clock/text), time-of-day consistency, and location plausibility from visible landmarks.',
    `Bet statement: ${betText || 'Not provided'}`,
    `Bet deadline: ${deadlineISO || 'Not provided'}`,
    'Return JSON only: {"verdict":"PASS|FAIL","reason":"...","confidence":0..1}.',
    `Proof note: ${note || 'No note provided'}`,
  ].join('\n');
}

function parseVerdict(text) {
  const cleaned = (text || '').replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    const verdict = parsed?.verdict === 'PASS' ? 'PASS' : 'FAIL';
    const reason = typeof parsed?.reason === 'string' ? parsed.reason : 'No reason provided.';
    const confidence = Number(parsed?.confidence);
    return {
      verdict,
      reason,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
      provider: 'gemini',
    };
  } catch {
    return null;
  }
}

async function imageToBase64(uri) {
  if (!uri) return null;
  try {
    return await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  } catch {
    return null;
  }
}

export async function judgeProof({ note, imageUri, videoUri, secretGesture, betText, deadlineISO }) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const model = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-1.5-flash';

  if (!apiKey) {
    const verdict = evaluateWithMockAI(note);
    return {
      verdict,
      reason: 'Mock AI fallback: no Gemini key configured.',
      confidence: 0.5,
      provider: 'mock',
    };
  }

  const parts = [{ text: buildPrompt({ note, betText, deadlineISO }) }];
  if (secretGesture) {
    parts.push({
      text: `Liveness challenge required: ${secretGesture}. Confirm if provided evidence likely includes this challenge.`,
    });
  }
  if (videoUri) {
    parts.push({
      text: 'A short liveness video was provided by the user. Consider it in the verdict.',
    });
  }
  const imageBase64 = await imageToBase64(imageUri);
  if (imageBase64) {
    parts.unshift({
      inline_data: {
        mime_type: 'image/jpeg',
        data: imageBase64,
      },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 200,
      },
      contents: [{ role: 'user', parts }],
    }),
  });

  if (!response.ok) {
    const verdict = evaluateWithMockAI(note);
    return {
      verdict,
      reason: `Mock fallback: Gemini request failed (${response.status}).`,
      confidence: 0.4,
      provider: 'mock',
    };
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('\n') || '';
  const parsed = parseVerdict(text);
  if (parsed) return parsed;

  const verdict = evaluateWithMockAI(note);
  return {
    verdict,
    reason: 'Mock fallback: could not parse Gemini response.',
    confidence: 0.4,
    provider: 'mock',
  };
}
