export interface VideoGenerationRequest {
  prompt: string;
  format: 'REELS_9_16' | 'SHORTS_9_16' | 'TIKTOK_9_16' | 'SQUARE_1_1' | 'LANDSCAPE_16_9';
  platform: string;
  style?: string;
  duration?: number; // seconds, default 15-30
}

export interface VideoGenerationResult {
  id: string;
  status: 'PENDING' | 'GENERATING' | 'EDITING' | 'COMPLETED' | 'FAILED';
  videoUrl?: string;
  thumbnailUrl?: string;
  script?: string;
  error?: string;
}

export const FORMAT_LABELS: Record<string, string> = {
  REELS_9_16: 'Instagram Reels (9:16)',
  SHORTS_9_16: 'YouTube Shorts (9:16)',
  TIKTOK_9_16: 'TikTok (9:16)',
  SQUARE_1_1: '정사각형 (1:1)',
  LANDSCAPE_16_9: '가로 (16:9)',
};

export const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  REELS_9_16: { width: 1080, height: 1920 },
  SHORTS_9_16: { width: 1080, height: 1920 },
  TIKTOK_9_16: { width: 1080, height: 1920 },
  SQUARE_1_1: { width: 1080, height: 1080 },
  LANDSCAPE_16_9: { width: 1920, height: 1080 },
};
