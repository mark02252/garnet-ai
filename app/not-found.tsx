import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card space-y-2">
      <h1 className="text-xl font-semibold">실행 기록을 찾을 수 없습니다</h1>
      <p className="text-sm text-[var(--text-base)]">해당 실행 ID는 로컬 히스토리에 존재하지 않습니다.</p>
      <Link href="/history" className="text-sm text-brand-700">
        히스토리로 이동
      </Link>
    </div>
  );
}
