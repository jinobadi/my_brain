#!/usr/bin/env bash
set -e
echo "🔧 P0 Prototype 구조 검증 시작..."

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
ERRORS=0

# 1. 필수 파일 존재 여부 확인
REQUIRED_FILES=(
  "package.json"
  "tsconfig.json"
  "next.config.js"
  "lib/supabase.ts"
  "lib/wasm-ai.ts"
  "app/layout.tsx"
  "app/page.tsx"
  "app/demo/page.tsx"
  "app/globals.css"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ -f "$BASE_DIR/$f" ]; then
    echo "✅ $f 확인됨"
  else
    echo "❌ $f 누락"
    ERRORS=$((ERRORS+1))
  fi
done

# 2. JSON 유효성 검사
echo "📦 JSON 구문 검증..."
for f in package.json tsconfig.json; do
  if node -e "JSON.parse(require('fs').readFileSync('$BASE_DIR/$f', 'utf8'))" 2>/dev/null; then
    echo "✅ $f 구문 정상"
  else
    echo "❌ $f 구문 오류"
    ERRORS=$((ERRORS+1))
  fi
done

# 3. TypeScript/Next.js 구조 체크 (의존성 설치 후 실행 권장)
echo "⚠️  tsc --noEmit 검사는 'npm install' 실행 후 'npm run validate'로 재실행하세요."
echo "🏁 검증 완료. 에러 없음: $((ERRORS==0))"
exit $ERRORS