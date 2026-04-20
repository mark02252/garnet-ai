#!/bin/bash
# Garnet 전체 백업 스크립트
# 사용법: ./scripts/backup.sh
# 결과: backups/garnet-backup-YYYY-MM-DD/ 디렉토리에 저장

set -e

TIMESTAMP=$(date +%Y-%m-%d_%H%M)
BACKUP_DIR="backups/garnet-backup-${TIMESTAMP}"
mkdir -p "$BACKUP_DIR"

echo "=== Garnet 백업 시작 (${TIMESTAMP}) ==="

# 1. .env 백업
echo "▸ .env 백업"
cp .env "$BACKUP_DIR/env.bak"
echo "  ✅ .env → ${BACKUP_DIR}/env.bak"

# 2. .garnet-config 백업 (하네스 메트릭, sub-reasoner 결과 등)
if [ -d ".garnet-config" ]; then
  echo "▸ .garnet-config 백업"
  cp -r .garnet-config "$BACKUP_DIR/garnet-config/"
  echo "  ✅ .garnet-config 복사 완료"
fi

# 3. config/ 백업 (domain.yaml, tools.yaml, company.md)
if [ -d "config" ]; then
  echo "▸ config/ 백업"
  cp -r config "$BACKUP_DIR/config/"
  echo "  ✅ config 복사 완료"
fi

# 4. DB 백업 (Supabase PostgreSQL)
echo "▸ DB 백업 (PostgreSQL)"

# .env에서 DATABASE_URL 읽기
DB_URL=$(grep "^DATABASE_URL=" .env | sed 's/DATABASE_URL=//' | tr -d '"')

if [ -z "$DB_URL" ]; then
  echo "  ⚠️ DATABASE_URL이 .env에 없습니다. DB 백업 건너뜀."
else
  # pgbouncer 파라미터 제거 (pg_dump는 직접 연결 필요)
  DIRECT_URL=$(echo "$DB_URL" | sed 's/pgbouncer=true//' | sed 's/\?$//' | sed 's/6543/5432/')

  # pg_dump 시도
  if command -v pg_dump &> /dev/null; then
    pg_dump "$DIRECT_URL" \
      --no-owner --no-privileges \
      --format=custom \
      --file="$BACKUP_DIR/garnet-db.dump" 2>/dev/null && \
      echo "  ✅ DB 덤프 → ${BACKUP_DIR}/garnet-db.dump" || \
      echo "  ⚠️ pg_dump 실패 — Prisma JSON 백업으로 대체합니다."

    # pg_dump 실패 시 Prisma 기반 JSON 백업
    if [ ! -f "$BACKUP_DIR/garnet-db.dump" ]; then
      npx tsx scripts/backup-db-json.ts "$BACKUP_DIR" 2>/dev/null || echo "  ⚠️ JSON 백업도 실패"
    fi
  else
    echo "  ⚠️ pg_dump 미설치. Prisma JSON 백업으로 대체합니다."
    npx tsx scripts/backup-db-json.ts "$BACKUP_DIR" 2>/dev/null || echo "  ⚠️ JSON 백업 실패"
  fi
fi

# 5. 백업 요약
echo ""
echo "=== 백업 완료 ==="
echo "위치: ${BACKUP_DIR}/"
ls -lh "$BACKUP_DIR/"
echo ""
echo "⚠️ 이 백업 폴더는 API 키와 DB 데이터를 포함합니다."
echo "   GitHub에 올리지 마세요. 안전한 곳에 보관하세요."
