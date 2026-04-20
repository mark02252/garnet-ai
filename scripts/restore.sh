#!/bin/bash
# Garnet 복원 스크립트
# 사용법: ./scripts/restore.sh backups/garnet-backup-2026-04-20_1500
#
# 새 환경 세팅 전체 순서:
# 1. git clone https://github.com/mark02252/garnet-ai.git
# 2. cd garnet-ai
# 3. npm install
# 4. ./scripts/restore.sh <backup_dir>
# 5. npx prisma db push
# 6. ollama pull nomic-embed-text
# 7. npm run dev

set -e

BACKUP_DIR="${1:?백업 디렉토리 경로를 지정하세요. 예: ./scripts/restore.sh backups/garnet-backup-2026-04-20_1500}"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ 백업 디렉토리가 없습니다: ${BACKUP_DIR}"
  exit 1
fi

echo "=== Garnet 복원 시작 ==="
echo "소스: ${BACKUP_DIR}"

# 1. .env 복원
if [ -f "$BACKUP_DIR/env.bak" ]; then
  if [ -f ".env" ]; then
    echo "▸ .env가 이미 존재합니다. 덮어쓰시겠습니까? (y/N)"
    read -r confirm
    if [ "$confirm" != "y" ]; then
      echo "  ⏭️ .env 건너뜀"
    else
      cp "$BACKUP_DIR/env.bak" .env
      echo "  ✅ .env 복원"
    fi
  else
    cp "$BACKUP_DIR/env.bak" .env
    echo "  ✅ .env 복원"
  fi
fi

# 2. .garnet-config 복원
if [ -d "$BACKUP_DIR/garnet-config" ]; then
  mkdir -p .garnet-config
  cp -r "$BACKUP_DIR/garnet-config/"* .garnet-config/ 2>/dev/null || true
  echo "  ✅ .garnet-config 복원"
fi

# 3. config/ 복원
if [ -d "$BACKUP_DIR/config" ]; then
  mkdir -p config
  cp -r "$BACKUP_DIR/config/"* config/ 2>/dev/null || true
  echo "  ✅ config 복원"
fi

# 4. DB 복원
if [ -f "$BACKUP_DIR/garnet-db.dump" ]; then
  echo "▸ DB 복원 (pg_restore)"
  DB_URL=$(grep "^DATABASE_URL=" .env | sed 's/DATABASE_URL=//' | tr -d '"')
  DIRECT_URL=$(echo "$DB_URL" | sed 's/pgbouncer=true//' | sed 's/\?$//' | sed 's/6543/5432/')

  if command -v pg_restore &> /dev/null; then
    pg_restore --no-owner --no-privileges --clean --if-exists \
      -d "$DIRECT_URL" "$BACKUP_DIR/garnet-db.dump" 2>/dev/null && \
      echo "  ✅ DB 복원 완료" || \
      echo "  ⚠️ pg_restore 실패. npx prisma db push 후 JSON 복원을 시도하세요."
  else
    echo "  ⚠️ pg_restore 미설치. JSON 복원을 시도합니다."
  fi
elif ls "$BACKUP_DIR"/*.json &>/dev/null; then
  echo "▸ JSON 백업에서 DB 복원"
  echo "  npx prisma db push 실행 후 npx tsx scripts/restore-db-json.ts ${BACKUP_DIR} 를 실행하세요."
fi

echo ""
echo "=== 복원 완료 ==="
echo ""
echo "다음 단계:"
echo "  1. npx prisma db push       (DB 스키마 동기화)"
echo "  2. ollama pull nomic-embed-text  (임베딩 모델)"
echo "  3. npm run dev               (서버 시작)"
echo ""
echo "회사 이동 시 추가 작업:"
echo "  4. config/company.md 새로 작성"
echo "  5. npx tsx -e \"const {bootstrapDomain}=require('./lib/agent-loop/domain-bootstrap'); bootstrapDomain('config/company.md').then(console.log)\""
echo "  6. Knowledge Store 초기화 (새 도메인에서 다시 학습)"
