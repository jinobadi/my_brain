#!/bin/bash

# ==========================================================================
# 클럽레이더 2 (club_rader2) 원클릭 버전 전환 및 서버 복구 스크립트
# Usage: ./switch_version.sh <버전명> (예: ./switch_version.sh 0.1)
# ==========================================================================

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "❌ 에러: 버전을 지정해 주세요. (예: ./switch_version.sh 0.1)"
  exit 1
fi

SERVER_SRC=".versions/server.v$VERSION.js"
INDEX_SRC=".versions/index.v$VERSION.html"
APP_SRC=".versions/app.v$VERSION.js"

if [ ! -f "$SERVER_SRC" ] || [ ! -f "$INDEX_SRC" ] || [ ! -f "$APP_SRC" ]; then
  echo "❌ 에러: 해당 버전($VERSION)의 백업 파일이 .versions/ 폴더에 존재하지 않습니다."
  echo "       (확인 대상: $SERVER_SRC, $INDEX_SRC, $APP_SRC)"
  exit 1
fi

echo "🔄 [클럽레이더 2] $VERSION 버전으로 코드 복원 및 스위칭을 시작합니다..."

# 1. 파일 복사 복원 진행
cp "$SERVER_SRC" server.js
cp "$INDEX_SRC" index.html
cp "$APP_SRC" app.js
echo "✅ $VERSION 버전 파일 복원 완료!"

# 2. 기존 포트 3001 서버 프로세스 감지 및 Kill
echo "⏰ 기존 3001 포트 백엔드 서버를 재시작합니다..."
PID=$(lsof -t -i:3001)
if [ -n "$PID" ]; then
  echo "💀 기존 실행 중인 서버 프로세스(PID: $PID) 종료 중..."
  kill -9 $PID
fi

# 3. 신규 버전 백그라운드 기동
export PORT=3001
nohup npm start > server.log 2>&1 &

echo "🎉 [완료] $VERSION 버전으로 서버가 성공적으로 재출발했습니다!"
echo "👉 웹 브라우저 새로고침 후 타이틀 옆에 ($VERSION) 표시가 정상 적용되었는지 확인해 주세요."
