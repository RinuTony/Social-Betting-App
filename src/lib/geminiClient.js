function buildModelCandidates(preferred, defaults) {
  const list = [preferred, ...defaults].filter(Boolean);
  return Array.from(new Set(list));
}

export function textModelCandidates(preferredModel) {
  return buildModelCandidates(preferredModel, [
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-2.0-flash',
    'gemini-2.0-flash-exp',
  ]);
}

export function imageModelCandidates(preferredModel) {
  return buildModelCandidates(preferredModel, [
    'gemini-2.0-flash-preview-image-generation',
    'gemini-2.0-flash-exp',
  ]);
}

export async function generateContentWithFallback({
  apiKey,
  modelCandidates,
  generationConfig,
  contents,
}) {
  let lastErrorText = '';
  let lastStatus = 0;
  let lastModel = '';

  for (const model of modelCandidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          generationConfig,
          contents,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return { data, model };
      }

      const errorText = await response.text().catch(() => '');
      lastErrorText = errorText;
      lastStatus = response.status;
      lastModel = model;

      // If model id is not available, try next candidate.
      if (response.status === 404 && /not found|ListModels/i.test(errorText)) {
        continue;
      }

      // Non-model errors (rate limit/auth/etc.) should stop immediately.
      throw new Error(
        `Gemini request failed (${response.status}) on model ${model}. ${errorText ? errorText.slice(0, 220) : ''}`.trim()
      );
    } catch (error) {
      if (error?.message?.includes('Gemini request failed')) throw error;
      lastErrorText = error?.message || 'Unknown error';
      lastStatus = lastStatus || 0;
      lastModel = model;
    }
  }

  throw new Error(
    `No available Gemini models for this key/project. Last tried: ${lastModel || 'none'} (${lastStatus || 'n/a'}). ${lastErrorText ? String(lastErrorText).slice(0, 220) : ''}`.trim()
  );
}

