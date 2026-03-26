const FAL_API_URL = 'https://fal.run/fal-ai/ltx-video';

interface FalVideoRequest {
  prompt: string;
  negative_prompt?: string;
  num_frames?: number;
  resolution?: string;
}

interface FalVideoResponse {
  video: { url: string; content_type: string };
}

export async function generateVideoWithFal(request: FalVideoRequest): Promise<FalVideoResponse> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new Error('FAL_KEY not configured');

  const response = await fetch(FAL_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: request.prompt,
      negative_prompt: request.negative_prompt || 'low quality, blurry, distorted',
      num_frames: request.num_frames || 121,
      resolution: request.resolution || 'portrait_9_16',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Fal.ai API error (${response.status}): ${error}`);
  }

  return response.json();
}

// Map Garnet format to Fal.ai resolution
export function formatToResolution(format: string): string {
  switch (format) {
    case 'REELS_9_16':
    case 'SHORTS_9_16':
    case 'TIKTOK_9_16':
      return 'portrait_9_16';
    case 'SQUARE_1_1':
      return 'square_1_1';
    case 'LANDSCAPE_16_9':
      return 'landscape_16_9';
    default:
      return 'portrait_9_16';
  }
}
