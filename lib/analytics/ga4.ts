import { fetchDailyTraffic, isGA4Configured } from '@/lib/ga4-client';

export async function getTodaySummary(): Promise<string> {
  if (!isGA4Configured()) {
    return 'GA4가 설정되지 않았습니다';
  }

  // KST 기준 날짜 — sv-SE 로케일이 'YYYY-MM-DD' 형식 반환
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const data = await fetchDailyTraffic(today, today);
  // 인증 실패 / 네트워크 오류 시 fetchDailyTraffic이 throw → 호출부(telegram-router)의 catch로 전파

  if (!data || data.length === 0) {
    return '오늘 데이터가 아직 없습니다';
  }

  const row = data[0];
  const visitors = row.activeUsers.toLocaleString('ko-KR');
  const sessions = row.sessions.toLocaleString('ko-KR');
  const convRate = row.sessions > 0
    ? ((row.conversions / row.sessions) * 100).toFixed(1)
    : '0.0';

  const dateLabel = new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
  });
  return `${dateLabel} 기준\n👤 방문자: ${visitors}명\n📈 세션: ${sessions}\n🎯 전환율: ${convRate}%`;
}
