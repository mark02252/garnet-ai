import type { DeliverableType, MeetingRole } from '@prisma/client';

export type DomainKey =
  | 'MARKETING_GROWTH'
  | 'PRICING_PROCUREMENT'
  | 'OPERATIONS_EXPANSION'
  | 'FINANCE_STRATEGY'
  | 'GENERAL_STRATEGY';

export type DomainOverride = DomainKey | 'AUTO';

export type DomainAgentDecisionPolicy = {
  primaryObjective?: string;
  tradeoffPriority?: string[];
  riskTolerance?: string;
};

export type DomainAgentOutputSchema = {
  mustInclude?: string[];
};

export type DomainAgentProfile = {
  id: string;
  name: string;
  roleSummary?: string;
  specialty: string[];
  decisionPolicy?: DomainAgentDecisionPolicy;
  frameworks?: string[];
  instructions?: string[];
  antiPatterns?: string[];
  outputSchema?: DomainAgentOutputSchema;
  expectedOutput: string;
};

export type GlobalAgentPolicy = {
  version?: string;
  purpose?: string;
  globalInstructions?: string[];
  globalAntiPatterns?: string[];
  defaultResponseFormat?: string[];
};

export type DomainAgentPoolConfig = Partial<Record<DomainKey, DomainAgentProfile[]>> & {
  _GLOBAL_AGENT_POLICY?: GlobalAgentPolicy;
};

export type BusinessContext = {
  companyStage?: string;
  businessModel?: string;
  currentPriority?: string;
  decisionHorizon?: string;
  constraints?: string[];
  responseExpectation?: string[];
};

export type AgentTaskMode = 'multi_agent_synthesis' | 'adaptive_domain_auto' | 'single_domain_focus';

export type AgentExecutionConfig = {
  selectedDomain?: DomainOverride;
  selectedAgents?: string[];
  taskMode?: AgentTaskMode;
};

export type RunInput = {
  topic: string;
  brand?: string;
  region?: string;
  goal?: string;
  domainOverride?: DomainOverride;
  domainSpecialistOverrides?: Partial<
    Record<
      DomainKey,
      Array<{
        id: string;
        name: string;
        specialty: string;
        expectedOutput: string;
      }>
    >
  >;
  domainAgentPoolConfig?: DomainAgentPoolConfig;
  businessContext?: BusinessContext;
  agentExecution?: AgentExecutionConfig;
  attachments?: Array<{
    name: string;
    mimeType?: string;
    content: string;
  }>;
};

export type RuntimeConfig = {
  runProfile?: 'manual' | 'free';
  llmProvider?: 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw' | 'claude' | 'gemma4';
  openaiApiKey?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  localBaseUrl?: string;
  localModel?: string;
  localApiKey?: string;
  openclawAgent?: string;
  gemma4Model?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  searchApiKey?: string;
  searchProvider?: 'serper' | 'brave' | 'naver';
  searchIncludeDomains?: string;
  searchExcludeDomains?: string;
  seminarDebateCycles?: number;
  domainAgentPoolConfig?: DomainAgentPoolConfig;
  businessContext?: BusinessContext;
  agentExecution?: AgentExecutionConfig;
};

export type MeetingExecutionOptions = {
  mode?: 'standard' | 'deliberation';
  reviewCycles?: number;
  onProgress?: (update: {
    status: 'RUNNING' | 'COMPLETED' | 'FAILED';
    stepKey: 'web_research' | 'meeting' | 'deliverable' | 'memory' | 'completed';
    stepLabel: string;
    progressPct: number;
    message?: string;
  }) => Promise<void> | void;
};

export type SearchHit = {
  title: string;
  snippet: string;
  url: string;
  provider: string;
  fetchedAt: Date;
};

export type RoleConfig = {
  role: MeetingRole;
  nickname: string;
  instruction: string;
};

export type DeliverableSelection = {
  type: DeliverableType;
  content: string;
};
