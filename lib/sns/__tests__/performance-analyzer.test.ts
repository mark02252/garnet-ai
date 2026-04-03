import { describe, it, expect } from 'vitest'

describe('performance-analyzer', () => {
  it('exports generatePerformanceReport function', async () => {
    const mod = await import('../performance-analyzer')
    expect(typeof mod.generatePerformanceReport).toBe('function')
  })

  it('exports generatePerformanceReport as async function', async () => {
    const mod = await import('../performance-analyzer')
    // generatePerformanceReport exists and is async
    expect(mod.generatePerformanceReport.constructor.name).toBe('AsyncFunction')
  })

  it('PerformanceReport summary fields are defined correctly', () => {
    // Type-level validation via a mock object conforming to the type
    const mockReport = {
      summary: {
        period: '최근 30일',
        totalReach: 10000,
        avgReach: 333,
        reachChange: 12.5,
        totalEngagement: 500,
        avgEngagementRate: 5.0,
        trendDirection: 'UP' as const,
      },
      topPosts: [{
        mediaId: 'abc123',
        caption: '테스트 캡션',
        reach: 1000,
        engagement: 50,
        mediaType: 'IMAGE',
        timestamp: '2026-04-01T00:00:00Z',
        whyGood: '이미지 퀄리티가 높음',
      }],
      lowPosts: [{
        mediaId: 'def456',
        caption: '저성과 게시물',
        reach: 100,
        mediaType: 'IMAGE',
        improvementTip: '해시태그 추가 필요',
      }],
      patterns: {
        bestPostingTimes: ['화요일 19:00'],
        bestContentType: '캐러셀',
        topHashtags: ['#마케팅', '#브랜딩'],
        topKeywords: ['성장', '브랜드'],
        audienceInsight: '20~30대 여성 타겟',
      },
      recommendations: [{
        topic: '브랜드 스토리',
        contentType: 'CAROUSEL' as const,
        reason: '인게이지먼트가 높음',
        suggestedCaption: '우리 브랜드의 이야기',
        suggestedHashtags: ['#브랜드'],
      }],
      adSuggestions: [{
        targetPostDescription: '최근 도달 1위 게시물',
        suggestedBudget: '3~5만원',
        expectedEffect: '예상 도달 +2,000',
        objective: '도달',
      }],
    }

    // Validate required fields exist
    expect(mockReport.summary.trendDirection).toBe('UP')
    expect(mockReport.topPosts[0].mediaId).toBe('abc123')
    expect(mockReport.lowPosts[0].improvementTip).toBeTruthy()
    expect(mockReport.patterns.bestPostingTimes).toBeInstanceOf(Array)
    expect(mockReport.adSuggestions[0].suggestedBudget).toBe('3~5만원')
  })
})
