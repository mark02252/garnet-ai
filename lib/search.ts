import { getSearchProvider } from '@/lib/env';
import type { RuntimeConfig, SearchHit } from '@/lib/types';
export { buildWebIntelligenceReport, buildWebIntelligenceSummary } from '@/lib/web-report';

type SerperResponse = {
  organic?: Array<{
    title?: string;
    snippet?: string;
    link?: string;
  }>;
};

function parseDomainRules(raw: string | undefined) {
  return (raw || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function matchDomain(hostname: string, rule: string) {
  return hostname === rule || hostname.endsWith(`.${rule}`);
}

const MARKETING_INTENT_TERMS = [
  '마케팅',
  '캠페인',
  '프로모션',
  '브랜딩',
  '집객',
  '전환율',
  '고객 유입',
  '콘텐츠',
  '광고',
  '브랜드 전략'
];

const NEGATIVE_NOISE_TERMS = [
  'ssrf',
  'cve',
  '취약점',
  '보안',
  '커널',
  'cpu',
  'release note',
  '개발자 문서',
  'api reference',
  '기술 지원',
  'z/os',
  'ibm',
  'jove',
  '종양',
  '면역',
  '논문',
  '의학'
];

const REGION_HINT_KEYWORDS = [
  '서울',
  '강남',
  '홍대',
  '마포',
  '합정',
  '신촌',
  '연남',
  '성수',
  '제천',
  '청주',
  '충주',
  '부산',
  '대구',
  '인천',
  '광주',
  '대전',
  '울산',
  '세종',
  '수원',
  '성남',
  '용인',
  '고양',
  '창원',
  '전주',
  '천안',
  '춘천',
  '강릉',
  '제주'
];

type TopicSignals = {
  cleanedTopic: string;
  inferredBrand: string;
  inferredRegion: string;
  inferredBranch: string;
  resolutionConfidence: number;
  resolutionReasons: string[];
  mustIncludeTerms: string[];
  focusTerms: string[];
  mismatchTerms: string[];
};

type BranchAliasRule = {
  id: string;
  keywords: string[];
  brand: string;
  branch: string;
  region: string;
  mustIncludeTerms: string[];
  mismatchTerms: string[];
};

const BRANCH_ALIAS_RULES: BranchAliasRule[] = [
  {
    id: 'MONOPLEX_AT_RYSE_HONGDAE',
    keywords: ['앳 라이즈', 'at ryse', 'ryse', '라이즈'],
    brand: 'MONOPLEX',
    branch: '앳 라이즈',
    region: '홍대',
    mustIncludeTerms: ['홍대', '라이즈', 'ryse', 'monoplex'],
    mismatchTerms: ['강남', '이비스', 'ibis', 'hotel ibis']
  },
  {
    id: 'MONOPLEX_IBIS_GANGNAM',
    keywords: ['이비스', 'ibis', '앰배서더 강남', '이비스 강남'],
    brand: 'MONOPLEX',
    branch: '이비스 스타일 앰배서더 강남',
    region: '강남',
    mustIncludeTerms: ['강남', '이비스', 'ibis', 'monoplex'],
    mismatchTerms: ['홍대', '라이즈', 'ryse']
  }
];

export type SearchResolution = {
  cleanedTopic: string;
  effectiveBrand: string;
  effectiveRegion: string;
  inferredBranch: string;
  confidence: number;
  reasons: string[];
  focusTerms: string[];
  mismatchTerms: string[];
  mustIncludeTerms: string[];
};

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((v) => v.trim())
    .filter((v) => v.length >= 2);
}

function dedupeByUrl<T extends { url: string }>(rows: T[]) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = row.url.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function sanitizeTopicForSearch(topic: string) {
  let text = topic
    .replace(/\[올나잇\s*세미나\s*라운드[^\]]*\]/gi, ' ')
    .replace(/\[이전\s*라운드\s*요약\]/gi, ' ');

  const previousRoundMarker = text.indexOf('[이전 라운드 요약]');
  if (previousRoundMarker >= 0) {
    text = text.slice(0, previousRoundMarker);
  }

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^r\d+\s*:/i.test(line))
    .filter((line) => !/^(pm 결정|산출물|메모리 방향)\s*:/i.test(line))
    .slice(0, 3);

  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

function inferRegionHint(text: string) {
  const lower = text.toLowerCase();
  for (const keyword of REGION_HINT_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) return keyword;
  }

  const tokens = text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((v) => v.trim())
    .filter(Boolean);

  const regionLike = tokens.filter((token) => /(시|군|구|도|읍|면|동)$/.test(token) && token.length >= 2);
  if (regionLike.length > 0) {
    return regionLike.slice(0, 2).join(' ');
  }
  return '';
}

function findBranchAlias(textLower: string) {
  return BRANCH_ALIAS_RULES.find((rule) => rule.keywords.some((keyword) => textLower.includes(keyword.toLowerCase())));
}

function inferTopicSignals(topic: string, brand?: string, region?: string, goal?: string): TopicSignals {
  const cleanedTopic = sanitizeTopicForSearch(topic);
  const text = `${cleanedTopic} ${goal || ''}`.toLowerCase();
  const alias = findBranchAlias(text);

  const performanceSignals = ['공연', '공연장', '극장', '문화', '전시', '콘서트', '행사', '관람', '티켓', '축제'];
  const hotelSignals = ['호텔', '객실', '숙박', '호캉스', '체크인', '체류'];
  const fairSignals = ['디자인페어', '공간 디자인', '공간디자인', '부스', '전시', '페어', '설치', '아트페어'];
  const inferredBrand =
    (brand || '').trim() ||
    alias?.brand ||
    (/(garnet|가넷)/i.test(`${cleanedTopic} ${goal || ''}`)
      ? 'Garnet'
      : /(monoplex|모노플렉스)/i.test(`${cleanedTopic} ${goal || ''}`)
        ? 'MONOPLEX'
        : '');
  const inferredRegion = (region || '').trim() || alias?.region || inferRegionHint(cleanedTopic);
  const inferredBranch = alias?.branch || '';
  const mustIncludeTerms = alias?.mustIncludeTerms || [];
  const resolutionReasons: string[] = [];
  let resolutionConfidence = 55;
  if (alias) {
    resolutionConfidence += 25;
    resolutionReasons.push(`지점 별칭 매칭: ${alias.id}`);
  }
  if (inferredBrand) {
    resolutionConfidence += 8;
    resolutionReasons.push(`브랜드 추정: ${inferredBrand}`);
  }
  if (inferredRegion) {
    resolutionConfidence += 8;
    resolutionReasons.push(`지역 추정: ${inferredRegion}`);
  }
  resolutionConfidence = Math.max(50, Math.min(98, resolutionConfidence));

  const isPerformance = performanceSignals.some((signal) => text.includes(signal));
  const isHotel = hotelSignals.some((signal) => text.includes(signal));
  const isFair = fairSignals.some((signal) => text.includes(signal));

  if (isFair) {
    return {
      cleanedTopic,
      inferredBrand,
      inferredRegion,
      inferredBranch,
      resolutionConfidence,
      resolutionReasons,
      mustIncludeTerms: Array.from(new Set([...mustIncludeTerms, '디자인페어', '공간', '부스', '설치', '관람객'])),
      focusTerms: ['디자인페어', '공간 연출', '부스 동선', '체험형 설치', '현장 집객'],
      mismatchTerms: Array.from(new Set(['호텔', '숙박', '객실', '호캉스', '의학', '논문', ...(alias?.mismatchTerms || [])]))
    };
  }

  if (isPerformance && !isHotel) {
    return {
      cleanedTopic,
      inferredBrand,
      inferredRegion,
      inferredBranch,
      resolutionConfidence,
      resolutionReasons,
      mustIncludeTerms,
      focusTerms: ['공연장', '문화행사', '관람객 유입', '지역 홍보', '오프라인 이벤트'],
      mismatchTerms: Array.from(new Set(['호텔', '숙박', '객실', '호캉스', ...(alias?.mismatchTerms || [])]))
    };
  }

  if (isHotel) {
    return {
      cleanedTopic,
      inferredBrand,
      inferredRegion,
      inferredBranch,
      resolutionConfidence,
      resolutionReasons,
      mustIncludeTerms,
      focusTerms: ['호텔 마케팅', '숙박 프로모션', '객실 판매', '체험형 패키지'],
      mismatchTerms: Array.from(new Set([...(alias?.mismatchTerms || [])]))
    };
  }

  return {
    cleanedTopic,
    inferredBrand,
    inferredRegion,
    inferredBranch,
    resolutionConfidence,
    resolutionReasons,
    mustIncludeTerms,
    focusTerms: ['마케팅 전략', '캠페인', '프로모션', '고객 유입'],
    mismatchTerms: Array.from(new Set([...(alias?.mismatchTerms || [])]))
  };
}

export function resolveSearchContext(topic: string, brand?: string, region?: string, goal?: string): SearchResolution {
  const signals = inferTopicSignals(topic, brand, region, goal);
  return {
    cleanedTopic: signals.cleanedTopic || topic,
    effectiveBrand: signals.inferredBrand || (brand || '').trim(),
    effectiveRegion: signals.inferredRegion || (region || '').trim(),
    inferredBranch: signals.inferredBranch || '',
    confidence: signals.resolutionConfidence,
    reasons: signals.resolutionReasons,
    focusTerms: signals.focusTerms,
    mismatchTerms: signals.mismatchTerms,
    mustIncludeTerms: signals.mustIncludeTerms
  };
}

export function buildMarketingQuery(topic: string, brand?: string, region?: string, goal?: string) {
  const resolved = resolveSearchContext(topic, brand, region, goal);
  const effectiveTopic = resolved.cleanedTopic || topic;
  const effectiveRegion = resolved.effectiveRegion;
  const effectiveBrand = resolved.effectiveBrand;
  const focusOr = resolved.focusTerms.slice(0, 4).map((term) => `"${term}"`).join(' OR ');
  const core = [effectiveTopic, effectiveBrand, resolved.inferredBranch, effectiveRegion, goal].filter(Boolean).join(' ');
  return [
    core,
    effectiveRegion || resolved.inferredBranch ? '"지점" OR "위치" OR "운영" OR "공식"' : '',
    '"마케팅 전략" OR "캠페인" OR "프로모션" OR "고객 유입"',
    '"시장 트렌드" OR "소비자 반응" OR "브랜드 사례" OR "홍보 사례"',
    focusOr,
    effectiveRegion ? `"${effectiveRegion}"` : '',
    effectiveBrand ? `"${effectiveBrand}"` : '',
    resolved.inferredBranch ? `"${resolved.inferredBranch}"` : ''
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildSearchQueries(topic: string, brand?: string, region?: string, goal?: string) {
  const resolved = resolveSearchContext(topic, brand, region, goal);
  const effectiveTopic = resolved.cleanedTopic || topic;
  const effectiveRegion = resolved.effectiveRegion;
  const effectiveBrand = resolved.effectiveBrand;
  const focus = resolved.focusTerms.slice(0, 3);
  const branch = resolved.inferredBranch;
  const core = [effectiveTopic, effectiveBrand, branch, effectiveRegion, goal].filter(Boolean).join(' ');
  const fallbackCore = [effectiveRegion, branch, ...focus].filter(Boolean).join(' ') || [effectiveTopic, ...focus].filter(Boolean).join(' ');

  const queries = [
    buildMarketingQuery(topic, brand, region, goal),
    effectiveRegion || branch ? [effectiveBrand, branch, effectiveRegion, '위치', '지점', '공식'].filter(Boolean).join(' ') : '',
    [effectiveTopic, effectiveBrand, branch, effectiveRegion, ...focus, '마케팅', '캠페인'].filter(Boolean).join(' '),
    [core, ...focus, '사례', '전략'].filter(Boolean).join(' '),
    [fallbackCore, '홍보 사례', '집객', effectiveRegion].filter(Boolean).join(' '),
    [effectiveBrand, ...resolved.mustIncludeTerms, '전시', '부스', '사례'].filter(Boolean).join(' ')
  ].filter(Boolean);

  return Array.from(new Set(queries)).slice(0, 6);
}

function scoreSearchRow(
  row: { title?: string; snippet?: string; link?: string },
  ctx: {
    topic: string;
    brand?: string;
    region?: string;
    goal?: string;
    branch?: string;
    focusTerms: string[];
    mismatchTerms: string[];
    mustIncludeTerms: string[];
    preferredDomains: string[];
  }
) {
  const title = row.title || '';
  const snippet = row.snippet || '';
  const link = row.link || '';
  const text = `${title} ${snippet} ${link}`.toLowerCase();

  let score = 0;

  if (ctx.brand && text.includes(ctx.brand.toLowerCase())) score += 10;
  if (ctx.region && text.includes(ctx.region.toLowerCase())) score += 6;
  if (ctx.branch && text.includes(ctx.branch.toLowerCase())) score += 8;
  if (ctx.goal && text.includes(ctx.goal.toLowerCase())) score += 4;

  if (ctx.mustIncludeTerms.length > 0) {
    const mustHits = ctx.mustIncludeTerms.reduce((acc, term) => acc + (text.includes(term.toLowerCase()) ? 1 : 0), 0);
    score += mustHits * 2.8;
    if (mustHits === 0) score -= 6;
  }

  if (ctx.region) {
    const targetRegion = ctx.region.toLowerCase();
    const mentionedRegions = REGION_HINT_KEYWORDS.filter((regionKeyword) => text.includes(regionKeyword.toLowerCase()));
    if (mentionedRegions.length > 0) {
      const matchesTarget = mentionedRegions.some(
        (regionKeyword) =>
          targetRegion.includes(regionKeyword.toLowerCase()) || regionKeyword.toLowerCase().includes(targetRegion)
      );
      if (!matchesTarget) {
        score -= 6;
      } else {
        const conflicts = mentionedRegions.filter(
          (regionKeyword) =>
            !(targetRegion.includes(regionKeyword.toLowerCase()) || regionKeyword.toLowerCase().includes(targetRegion))
        );
        score -= conflicts.length * 2.4;
      }
    }
  }

  const topicTokens = tokenize(ctx.topic).slice(0, 8);
  for (const token of topicTokens) {
    if (text.includes(token)) score += 1.5;
  }

  for (const term of ctx.focusTerms) {
    if (text.includes(term.toLowerCase())) score += 2.2;
  }

  for (const term of ctx.mismatchTerms) {
    if (text.includes(term.toLowerCase())) score -= 4.2;
  }

  for (const term of MARKETING_INTENT_TERMS) {
    if (text.includes(term.toLowerCase())) score += 1.2;
  }

  for (const term of NEGATIVE_NOISE_TERMS) {
    if (text.includes(term.toLowerCase())) score -= 2.5;
  }

  if (/blog|news|campaign|marketing|trend|case/.test(text)) score += 1;

  const host = hostnameOf(link);
  if (host && ctx.preferredDomains.some((domain) => matchDomain(host, domain))) {
    score += 3.2;
  }

  return score;
}

function rankAndFilterRows(
  rows: Array<{ title?: string; snippet?: string; link?: string }>,
  ctx: {
    topic: string;
    brand?: string;
    region?: string;
    goal?: string;
    branch?: string;
    focusTerms: string[];
    mismatchTerms: string[];
    mustIncludeTerms: string[];
    preferredDomains: string[];
  }
) {
  const scored = rows
    .filter((row) => row.title && row.link)
    .map((row) => ({
      ...row,
      score: scoreSearchRow(row, ctx)
    }))
    .sort((a, b) => b.score - a.score);

  const threshold = scored.length > 0 ? Math.max(-2, scored[Math.min(6, scored.length - 1)].score - 3) : -2;
  const filtered = scored.filter((row) => row.score >= threshold);
  return filtered.length > 0 ? filtered : scored;
}

function resolvePreferredDomains(brand?: string, branch?: string) {
  const domains: string[] = [];
  const brandLower = (brand || '').toLowerCase();
  const branchLower = (branch || '').toLowerCase();
  if (brandLower.includes('monoplex')) {
    domains.push('monoplex.kr', 'instagram.com', 'map.naver.com');
  }
  if (branchLower.includes('ryse') || branchLower.includes('라이즈') || branchLower.includes('홍대')) {
    domains.push('rysehotel.com');
  }
  if (branchLower.includes('ibis') || branchLower.includes('이비스') || branchLower.includes('강남')) {
    domains.push('all.accor.com');
  }
  return Array.from(new Set(domains));
}

export async function runWebSearch(topic: string, brand?: string, region?: string, goal?: string): Promise<SearchHit[]> {
  return runWebSearchWithRuntime(topic, brand, region, goal);
}

export async function runWebSearchWithRuntime(
  topic: string,
  brand?: string,
  region?: string,
  goal?: string,
  runtime?: RuntimeConfig
): Promise<SearchHit[]> {
  const resolved = resolveSearchContext(topic, brand, region, goal);
  const effectiveTopic = resolved.cleanedTopic || topic;
  const effectiveRegion = resolved.effectiveRegion;
  const effectiveBrand = resolved.effectiveBrand;
  const preferredDomains = resolvePreferredDomains(effectiveBrand, resolved.inferredBranch);

  const provider = (runtime?.searchProvider || getSearchProvider()).toLowerCase();
  const includeDomains = parseDomainRules(runtime?.searchIncludeDomains ?? process.env.SEARCH_INCLUDE_DOMAINS);
  const excludeDomains = parseDomainRules(runtime?.searchExcludeDomains ?? process.env.SEARCH_EXCLUDE_DOMAINS);
  const apiKey = runtime?.searchApiKey || process.env.SEARCH_API_KEY || '';

  const braveApiKey = process.env.BRAVE_SEARCH_API_KEY || '';
  const naverClientId = process.env.NAVER_CLIENT_ID || '';
  const naverClientSecret = process.env.NAVER_CLIENT_SECRET || '';

  async function fetchSerperRows(query: string) {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, num: 16, gl: 'kr', hl: 'ko' })
    });
    if (!response.ok) {
      throw new Error(`Serper Search failed (${response.status})`);
    }
    const json = (await response.json()) as SerperResponse;
    return json.organic || [];
  }

  async function fetchBraveRows(query: string) {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=16&search_lang=ko&country=kr`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': braveApiKey
      }
    });
    if (!response.ok) {
      throw new Error(`Brave Search failed (${response.status})`);
    }
    const json = (await response.json()) as {
      web?: { results?: Array<{ title?: string; description?: string; url?: string }> };
    };
    return (json.web?.results || []).map((r) => ({
      title: r.title,
      snippet: r.description,
      link: r.url
    }));
  }

  async function fetchNaverRows(query: string) {
    const blogUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=8&sort=sim`;
    const newsUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=8&sort=sim`;
    const headers = {
      'X-Naver-Client-Id': naverClientId,
      'X-Naver-Client-Secret': naverClientSecret
    };

    const [blogRes, newsRes] = await Promise.allSettled([
      fetch(blogUrl, { headers }),
      fetch(newsUrl, { headers })
    ]);

    const naverRows: Array<{ title?: string; snippet?: string; link?: string }> = [];
    for (const res of [blogRes, newsRes]) {
      if (res.status === 'fulfilled' && res.value.ok) {
        const json = (await res.value.json()) as {
          items?: Array<{ title?: string; description?: string; link?: string }>;
        };
        for (const item of json.items || []) {
          naverRows.push({
            title: (item.title || '').replace(/<[^>]*>/g, ''),
            snippet: (item.description || '').replace(/<[^>]*>/g, ''),
            link: item.link
          });
        }
      }
    }
    return naverRows;
  }

  async function fetchRowsWithFallback(query: string) {
    // 1차: primary provider
    if (provider === 'serper' && apiKey) {
      try { return await fetchSerperRows(query); } catch { /* fallthrough */ }
    }
    if (provider === 'brave' && braveApiKey) {
      try { return await fetchBraveRows(query); } catch { /* fallthrough */ }
    }
    if (provider === 'naver' && naverClientId) {
      try { return await fetchNaverRows(query); } catch { /* fallthrough */ }
    }

    // 2차: fallback (serper → brave → naver)
    if (provider !== 'serper' && apiKey) {
      try { return await fetchSerperRows(query); } catch { /* fallthrough */ }
    }
    if (provider !== 'brave' && braveApiKey) {
      try { return await fetchBraveRows(query); } catch { /* fallthrough */ }
    }
    if (provider !== 'naver' && naverClientId) {
      try { return await fetchNaverRows(query); } catch { /* fallthrough */ }
    }

    return [];
  }

  const queries = buildSearchQueries(effectiveTopic, effectiveBrand, effectiveRegion, goal);
  let rows: Array<{ title?: string; snippet?: string; link?: string }> = [];
  for (const q of queries) {
    const batch = await fetchRowsWithFallback(q);
    rows = rows.concat(batch);
    if (rows.length >= 8) break;
  }

  const now = new Date();

  const ranked = rankAndFilterRows(rows, {
    topic: effectiveTopic,
    brand: effectiveBrand,
    region: effectiveRegion,
    goal,
    branch: resolved.inferredBranch,
    focusTerms: resolved.focusTerms,
    mismatchTerms: resolved.mismatchTerms,
    mustIncludeTerms: resolved.mustIncludeTerms,
    preferredDomains
  }).slice(0, 16);
  const normalized = ranked
    .map((item) => ({
      title: item.title || 'Untitled',
      snippet: item.snippet || '',
      url: item.link || '',
      provider: provider || 'serper',
      fetchedAt: now
    }))
    .filter((item) => item.url && item.title);

  const domainFiltered = normalized.filter((item) => {
    const hostname = hostnameOf(item.url);
    if (!hostname) return false;

    if (excludeDomains.some((rule) => matchDomain(hostname, rule))) return false;

    if (includeDomains.length === 0) return true;
    return includeDomains.some((rule) => matchDomain(hostname, rule));
  });

  const finalRows = domainFiltered.length > 0 ? domainFiltered : normalized;
  return dedupeByUrl(finalRows).slice(0, 8);
}
