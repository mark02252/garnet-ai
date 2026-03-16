import { NextResponse } from 'next/server';
import { getLLMProvider } from '@/lib/env';

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    startTime: Math.floor(start.getTime() / 1000),
    endTime: Math.floor(end.getTime() / 1000)
  };
}

function parseUsedUsd(payload: any) {
  if (!payload || !Array.isArray(payload.data)) return null;
  let sum = 0;
  for (const row of payload.data) {
    const amount = row?.amount?.value;
    if (typeof amount === 'number' && Number.isFinite(amount)) {
      sum += amount;
    }
  }
  return Number.isFinite(sum) ? Number(sum.toFixed(4)) : null;
}

export async function GET() {
  const provider = getLLMProvider();
  if (provider !== 'openai') {
    return NextResponse.json({
      available: false,
      reason: 'LLM_PROVIDER_NOT_OPENAI',
      message: `현재 LLM_PROVIDER가 ${provider}라 OpenAI 한도 조회를 사용하지 않습니다.`
    });
  }

  const adminKey = process.env.OPENAI_ADMIN_KEY;
  const monthlyBudgetRaw = process.env.OPENAI_MONTHLY_BUDGET_USD || '';
  const monthlyBudget = Number(monthlyBudgetRaw);
  const hasBudget = Number.isFinite(monthlyBudget) && monthlyBudget > 0;

  if (!adminKey) {
    return NextResponse.json({
      available: false,
      reason: 'OPENAI_ADMIN_KEY_MISSING',
      message: '관리자 키가 없어 잔여 한도를 조회할 수 없습니다.'
    });
  }

  const { startTime, endTime } = monthRange();

  try {
    const res = await fetch(
      `https://api.openai.com/v1/organization/costs?start_time=${startTime}&end_time=${endTime}`,
      {
        headers: {
          Authorization: `Bearer ${adminKey}`
        },
        cache: 'no-store'
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({
        available: false,
        reason: 'OPENAI_COST_API_FAILED',
        status: res.status,
        message: text || 'OpenAI 비용 API 호출 실패'
      });
    }

    const payload = await res.json();
    const usedUsd = parseUsedUsd(payload);

    if (usedUsd === null) {
      return NextResponse.json({
        available: false,
        reason: 'OPENAI_COST_PARSE_FAILED',
        message: '비용 데이터를 해석하지 못했습니다.'
      });
    }

    const remainingUsd = hasBudget ? Number((monthlyBudget - usedUsd).toFixed(4)) : null;
    const usageRatePct = hasBudget ? Number(((usedUsd / monthlyBudget) * 100).toFixed(1)) : null;

    return NextResponse.json({
      available: true,
      usedUsd,
      budgetUsd: hasBudget ? monthlyBudget : null,
      remainingUsd,
      usageRatePct,
      monthStartUnix: startTime,
      monthEndUnix: endTime,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      available: false,
      reason: 'OPENAI_COST_API_NETWORK_ERROR',
      message: error instanceof Error ? error.message : '네트워크 오류'
    });
  }
}
