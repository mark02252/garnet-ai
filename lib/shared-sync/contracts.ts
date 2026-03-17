export type SharedRunRecord = {
  id: string;
  topic: string;
  brand: string | null;
  region: string | null;
  goal: string | null;
  createdAt: string;
  updatedAt: string;
  webSources: Array<{
    id: string;
    title: string;
    snippet: string;
    url: string;
    provider: string;
    fetchedAt: string;
  }>;
  meetingTurns: Array<{
    id: string;
    role: string;
    nickname: string;
    content: string;
    createdAt: string;
  }>;
  attachments: Array<{
    id: string;
    name: string;
    mimeType: string;
    /** base64 content (local only) or empty string when storageUrl is set */
    content: string;
    /** Supabase Storage public URL, set after upload */
    storageUrl?: string | null;
    createdAt: string;
  }>;
  deliverable: {
    id: string;
    type: string;
    content: string;
    createdAt: string;
  } | null;
  memoryLog: {
    id: string;
    hypothesis: string;
    direction: string;
    expectedImpact: string;
    risks: string;
    outcome: string | null;
    failureReason: string | null;
    tags: string[];
    createdAt: string;
  } | null;
  sourceDevice: string | null;
};

export type SharedLearningArchiveRecord = {
  id: string;
  runId: string | null;
  sourceType: string;
  situation: string;
  recommendedResponse: string;
  reasoning: string;
  signals: string[];
  tags: string[];
  status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SharedApprovalDecisionRecord = {
  id: string;
  itemType: string;
  itemId: string;
  decision: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SharedRunProgressRecord = {
  runId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  stepKey: 'web_research' | 'meeting' | 'deliverable' | 'memory' | 'completed';
  stepLabel: string;
  progressPct: number;
  message: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
};

export type SharedBootstrapPayload = {
  generatedAt: string;
  counts: {
    runs: number;
    learningArchives: number;
    approvalDecisions: number;
    runProgress: number;
  };
  runs: SharedRunRecord[];
  learningArchives: SharedLearningArchiveRecord[];
  approvalDecisions: SharedApprovalDecisionRecord[];
  runProgress: SharedRunProgressRecord[];
};
