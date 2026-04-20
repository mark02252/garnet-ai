/**
 * Garnet Phase 7 — Domain Bootstrap
 * domain-bootstrap.ts: Bootstrap domain config from a company.md file.
 *
 * Reads company.md (with YAML frontmatter), generates config/domain.yaml
 * and config/tools.yaml tailored to the company's data sources and sub-reasoners.
 */

import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────────

export type CompanyMeta = {
  name: string;
  industry: string;
  kpis: string[];
  data_sources: string[];
  sub_reasoners: string[];
};

export type ParsedCompanyMd = {
  meta: CompanyMeta;
  context: string;
};

export type BootstrapResult = {
  domainYaml: string;
  toolsYaml: string;
  message: string;
};

// ── YAML Frontmatter Parser ────────────────────────────────────────────────

export function parseCompanyMd(filePath: string): ParsedCompanyMd {
  const raw = fs.readFileSync(filePath, 'utf-8');

  // Extract YAML frontmatter between --- markers
  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error(`No YAML frontmatter found in ${filePath}`);
  }

  const [, frontmatterStr, context] = frontmatterMatch;
  const parsed = yaml.load(frontmatterStr) as Record<string, unknown>;

  const meta: CompanyMeta = {
    name: (parsed.name as string) ?? 'Unknown',
    industry: (parsed.industry as string) ?? 'Unknown',
    kpis: Array.isArray(parsed.kpis) ? (parsed.kpis as string[]) : [],
    data_sources: Array.isArray(parsed.data_sources) ? (parsed.data_sources as string[]) : [],
    sub_reasoners: Array.isArray(parsed.sub_reasoners) ? (parsed.sub_reasoners as string[]) : [],
  };

  return { meta, context: context.trim() };
}

// ── YAML Generators ────────────────────────────────────────────────────────

export function generateDomainYaml(meta: CompanyMeta): string {
  const doc = {
    name: meta.name,
    industry: meta.industry,
    kpis: meta.kpis,
    data_sources: meta.data_sources,
    sub_reasoners: meta.sub_reasoners,
  };
  return yaml.dump(doc, { lineWidth: 120 });
}

export function generateToolsYaml(meta: CompanyMeta): string {
  const universalTools = ['knowledge_search', 'episode_search', 'web_search', 'ask_expert'];

  // Domain-specific tools derived from data_sources
  const domainTools: string[] = [];
  for (const ds of meta.data_sources) {
    if (ds === 'ga4') {
      if (!domainTools.includes('ga4_query')) domainTools.push('ga4_query');
      if (!domainTools.includes('ga4_funnel')) domainTools.push('ga4_funnel');
    }
  }

  // Build per-sub-reasoner tool lists
  const subReasoners: Record<string, { tools: string[] }> = {};
  for (const reasoner of meta.sub_reasoners) {
    subReasoners[reasoner] = { tools: [...domainTools, ...universalTools] };
  }

  const doc = {
    max_calls_per_reasoner: 3,
    max_calls_per_cycle: 15,
    tool_timeout: 5000,
    sub_reasoners: subReasoners,
  };

  return yaml.dump(doc, { lineWidth: 120 });
}

// ── Bootstrap Entry Point ──────────────────────────────────────────────────

export async function bootstrapDomain(companyMdPath: string): Promise<BootstrapResult> {
  const { meta, context } = parseCompanyMd(companyMdPath);

  const domainYaml = generateDomainYaml(meta);
  const toolsYaml = generateToolsYaml(meta);

  const configDir = path.resolve(process.cwd(), 'config');
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  fs.writeFileSync(path.join(configDir, 'domain.yaml'), domainYaml, 'utf-8');
  fs.writeFileSync(path.join(configDir, 'tools.yaml'), toolsYaml, 'utf-8');

  const message = [
    `도메인 부트스트랩 완료: ${meta.name} (${meta.industry})`,
    ``,
    `생성된 파일:`,
    `  - config/domain.yaml`,
    `  - config/tools.yaml`,
    ``,
    `서브 리즈너: ${meta.sub_reasoners.join(', ')}`,
    `데이터 소스: ${meta.data_sources.join(', ')}`,
    `KPI: ${meta.kpis.join(', ')}`,
    ``,
    `다음 단계:`,
    `1. config/domain.yaml에서 회사 정보를 확인하세요.`,
    `2. config/tools.yaml에서 각 서브 리즈너의 도구 목록을 검토하세요.`,
    `3. Garnet Agent Loop를 시작하려면 /api/agent-loop/start를 호출하세요.`,
    ``,
    `비즈니스 컨텍스트 (${context.length}자) 로드 완료.`,
  ].join('\n');

  return { domainYaml, toolsYaml, message };
}
