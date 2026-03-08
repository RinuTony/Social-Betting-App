import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { generateContentWithFallback, imageModelCandidates } from './geminiClient';

function buildPosterPrompt({ betText, proofNote, ownerName, style }) {
  return [
    'You are a creative director making a shareable victory poster for a social betting app.',
    `Design style: ${style}.`,
    'Turn the uploaded proof photo into a dramatic hero poster.',
    'Include bold headline text in the art: "MISSION ACCOMPLISHED".',
    'Keep the person recognizable from the source photo while improving lighting, composition, and mood.',
    'Avoid adding logos, watermarks, or copyrighted characters.',
    `User: ${ownerName || 'Unknown'}`,
    `Bet: ${betText || 'Not provided'}`,
    `Proof note: ${proofNote || 'No proof note provided'}`,
    'Return the edited image only.',
  ].join('\n');
}

async function imageToBase64(uri) {
  if (!uri) return null;
  try {
    return await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  } catch {
    return null;
  }
}

function extractInlineImage(candidates) {
  const parts = candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    const mime = inline?.mimeType || inline?.mime_type;
    const data = inline?.data;
    if (typeof data === 'string' && data.length > 0) {
      return {
        mimeType: typeof mime === 'string' ? mime : 'image/png',
        base64: data,
      };
    }
  }
  return null;
}

function toDataUri({ mimeType, base64 }) {
  return `data:${mimeType};base64,${base64}`;
}

export async function generateVictoryPoster({
  betText,
  proofNote,
  proofImageUri,
  ownerName,
  style = 'cinematic movie poster',
}) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const preferredModel =
    process.env.EXPO_PUBLIC_GEMINI_IMAGE_MODEL ||
    process.env.EXPO_PUBLIC_GEMINI_MODEL ||
    'gemini-2.0-flash-preview-image-generation';

  if (!proofImageUri) {
    return {
      posterUri: '',
      provider: 'none',
      style,
      warning: 'No proof image provided for poster generation.',
    };
  }

  if (!apiKey) {
    return {
      posterUri: proofImageUri,
      provider: 'fallback',
      style,
      warning: 'Gemini key missing. Using original proof image.',
    };
  }

  const inputImage = await imageToBase64(proofImageUri);
  if (!inputImage) {
    return {
      posterUri: proofImageUri,
      provider: 'fallback',
      style,
      warning: 'Could not read proof image. Using original proof image.',
    };
  }

  let data;
  try {
    const result = await generateContentWithFallback({
      apiKey,
      modelCandidates: imageModelCandidates(preferredModel),
      generationConfig: {
        temperature: 0.8,
        responseModalities: ['TEXT', 'IMAGE'],
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: buildPosterPrompt({ betText, proofNote, ownerName, style }) },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: inputImage,
              },
            },
          ],
        },
      ],
    });
    data = result.data;
  } catch (error) {
    return {
      posterUri: proofImageUri,
      provider: 'fallback',
      style,
      warning: `Gemini poster request failed. ${error?.message || 'Using original proof image.'}`,
    };
  }
  const imagePart = extractInlineImage(data?.candidates);
  if (!imagePart) {
    return {
      posterUri: proofImageUri,
      provider: 'fallback',
      style,
      warning: 'Gemini did not return an image. Using original proof image.',
    };
  }

  return {
    posterUri: toDataUri(imagePart),
    provider: 'gemini-image',
    style,
    warning: '',
  };
}
