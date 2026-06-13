/**
 * ==========================================================================
 * Homerun Radar 2 (클럽레이더 2) - Premium local QA & Production Backend Server
 * ==========================================================================
 * 
 * 본 서버는 3050 나이트클럽 매칭 플랫폼 '클럽레이더 2'의 실시간 데이터 동기화,
 * 역할별 스마트 휴면 회원 자동 청소, 관리자 승인/제재 및 제보 보상 처리, 
 * 그리고 결제 및 포인트 수수료 차감 트랜잭션을 처리하는 핵심 고성능 백엔드 엔진입니다.
 */

const express = require('express');
const path = require('path');
const os = require('os');
const qrcode = require('qrcode-terminal');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Express JSON Body-Parser 활성화
app.use(express.json());

// 🔒 [보안 락 3] 다중 로그인 차단 백엔드 세션 락 검증 미들웨어
function verifySessionLock(req, res, next) {
  const activeSessionId = req.headers['x-active-session-id'] || req.body.activeSessionId;
  const userUid = req.headers['x-user-uid'] || req.body.userUid || req.body.authorUid || req.body.senderUid;

  if (!userUid) {
    // UID가 없는 경우는 게스트이거나 인증 전이므로 패스
    return next();
  }

  const user = database.users[userUid];
  if (user && user.activeSessionId && user.activeSessionId !== activeSessionId) {
    console.error(`🚨 [Security-Lock-Error] 다중 로그인/세션 불일치 차단 발생!`);
    console.error(`   - 유저 닉네임: ${user.nickname} (UID: ${userUid})`);
    console.error(`   - DB 저장 세션 ID: "${user.activeSessionId}"`);
    console.error(`   - 요청 헤더 세션 ID: "${activeSessionId}"`);
    return res.status(403).json({ error: "session_expired", message: "다른 기기에서 로그인되어 세션이 만료되었습니다. 다시 로그인해주세요." });
  }

  next();
}

// ==========================================================================
// 1.0. 실시간 하이브리드 인메모리 데이터베이스 엔진 (Premium Database Engine)
// ==========================================================================
const database = {
  users: {},         // 일반회원 및 웨이터 프로필 (UID 키)
  waiters: {},       // 웨이터 프로필 (조회 편의용 에셋)
  chats: {},         // 1:1 대화방 데이터
  bookings: {},      // 예약 리스트
  sponsors: {},      // 관리자 스폰서 배너 목록
  notifications: [], // 알림 내역 리스트 (순차 배열)
  reports: {},       // 크라우드소싱 신규/폐업 제보 리스트
  credit_logs: {},   // 포인트 지급/차감 수수료 히스토리 원장 (Audit Log)
  posts: {}          // 실시간 수기 게시글 리스트
};

// 1.1. 초기 모크 데이터 주입 (기존 데이터 완벽 보전 및 QA용 기초 데이터 마련)
const KoreanAvatars = {
  me: './assets/korean_man_user.png',
  james: './assets/korean_waiter_james.png',
  vipWoman: './assets/korean_woman_vip.png'
};

// 기본 탑재 스폰서 광고
database.sponsors = {
  "1": { id: "1", title: "👑 순금 1돈 뽑기! 주말의 왕은 누구?", imageUrl: "https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?q=80&w=1000&auto=format&fit=crop", region: "대전", club: "한국관나이트", tag: "스폰서", priority: 10, status: "active", startDate: "2026-05-01", endDate: "2026-06-30", impressions: 124, clicks: 8, linkUrl: "#" },
  "2": { id: "2", title: "🎤 DJ KOO 스페셜 파티 — 으뜸원나이트", imageUrl: "https://images.unsplash.com/photo-1566737236500-c8ac43014a67?q=80&w=1000&auto=format&fit=crop", region: "대전", club: "으뜸원나이트", tag: "핫이벤트", priority: 8, status: "active", startDate: "2026-05-20", endDate: "2026-05-28", impressions: 87, clicks: 6, linkUrl: "#" },
  "3": { id: "3", title: "🍾 샴페인 1+1 폭탄 세일 프로모션", imageUrl: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1000&auto=format&fit=crop", region: "대전", club: "찬스나이트", tag: "주류할인", priority: 6, status: "active", startDate: "2026-05-15", endDate: "2026-05-31", impressions: 54, clicks: 3, linkUrl: "#" },
  "4": { id: "4", title: "💎 강남 한복판 VVIP 시크릿 파티", imageUrl: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=1000&auto=format&fit=crop", region: "서울", club: "강남 아레나", tag: "VIP전용", priority: 9, status: "active", startDate: "2026-05-01", endDate: "2026-07-31", impressions: 215, clicks: 18, linkUrl: "#" }
};

// 기본 웨이터 정보 (앱 실행 시 자동 로딩)
const defaultWaiters = [];

defaultWaiters.forEach(w => {
  database.users[w.uid] = w;
  database.waiters[w.id] = w;
});

// SSE 커넥션 풀 관리 (다중 단말기 브로드캐스트용)
let sseClients = [];

// SSE 브로드캐스트 헬퍼 (데이터 변경 시 연결된 모든 모바일/PC에 즉시 전파)
function broadcastUpdate(collection) {
  const data = collection === 'notifications'
    ? database.notifications
    : Object.values(database[collection] || {});
    
  const payload = JSON.stringify({ collection, data });
  
  sseClients.forEach(client => {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.error(`❌ [SSE] 클라이언트 전송 오류 (ID: ${client.id})`);
    }
  });
}

// ==========================================================================
// 2.0. RESTful API 기본 데이터 처리 라우터 (Standard Database Endpoints)
// ==========================================================================

// 2.1. 컬렉션 전체 조회 API
app.get('/api/db/:collection', (req, res) => {
  const { collection } = req.params;
  if (!database[collection]) {
    return res.status(404).json({ error: "Collection not found" });
  }
  const data = collection === 'notifications'
    ? database.notifications
    : Object.values(database[collection]);
  res.json(data);
});

// 2.2. 단건 조회 API
app.get('/api/db/:collection/:id', (req, res) => {
  const { collection, id } = req.params;
  if (!database[collection]) {
    return res.status(404).json({ error: "Collection not found" });
  }
  const item = database[collection][id];
  if (!item) {
    return res.status(404).json({ error: "Document not found" });
  }
  res.json(item);
});

// 2.3. 데이터 추가/업데이트 API (ID 지정 - 포인트 갱신 패킷 임의 위조 방어 추가)
app.post('/api/db/:collection/:id', verifySessionLock, (req, res) => {
  const { collection, id } = req.params;

  // 🌟 [V1.5.8] notifications는 순차 배열이므로 특수 업데이트 처리로 0.1초 실시간 알림 뱃지 씽크 보장!
  if (collection === 'notifications') {
    const idx = database.notifications.findIndex(n => String(n.id) === String(id));
    if (idx > -1) {
      database.notifications[idx] = { ...database.notifications[idx], ...req.body };
      res.json({ success: true, data: database.notifications[idx] });
      broadcastUpdate('notifications');
      return;
    } else {
      return res.status(404).json({ error: "Notification not found" });
    }
  }

  if (!database[collection]) {
    database[collection] = {};
  }
  
  const existing = database[collection][id] || {};
  let updateData = { ...req.body };

  // 🔒 [보안 락 1] 유저 정보 직접 수정 시 credits 필드 위조 방어막 (V1.5.9 정상 차감 연동 완화)
  if (collection === 'users') {
    if ('credits' in updateData) {
      // 🌟 [V1.5.8] 신규 가입(existing 데이터가 없음) 시에는 외부에서 세팅한 가입 50 CR 웰컴 포인트를 그대로 허용합니다!
      const isNewUser = Object.keys(existing).length === 0;
      if (!isNewUser) {
        const prevCredits = Number(existing.credits) || 0;
        const newCredits = Number(updateData.credits) || 0;
        // 크레딧이 증가하는 악의적 위조는 철저히 차단하되, 정상적인 서비스 소모로 인한 차감(감소)은 전면 허용!
        if (newCredits > prevCredits) {
          console.warn(`🛡️ [Security Lock 1] 외부로부터 유저 크레딧 증가(위조) 시도 차단! (UID: ${id}, 기존: ${prevCredits}, 요청: ${newCredits})`);
          updateData.credits = prevCredits;
        } else {
          console.log(`💳 [Security Sync] 유저 크레딧의 정상적인 차감 소모 허용 (UID: ${id}, 기존: ${prevCredits} -> 차감: ${newCredits})`);
        }
      }
    }
  }
  // 🔒 [보안 락 1] 수기 글 추천 보상 백엔드 단독 연산 시스템
  if (collection === 'posts' && updateData.likes > (existing.likes || 0)) {
    const post = existing;
    const authorUid = post.authorUid;
    const userUid = req.headers['x-user-uid'] || req.body.userUid;

    if (authorUid && userUid) {
      const author = database.users[authorUid];
      const liker = database.users[userUid];

      if (author && liker && liker.role !== 'coach' && String(authorUid) !== String(userUid)) {
        // 추천 주체가 일반 회원(선수)이고 작성자가 본인이 아닐 때만 +5 CR 가산
        const rewardAmount = 5;
        const originalCredits = Number(author.credits) || 0;
        const finalCredits = originalCredits + rewardAmount;
        
        author.credits = finalCredits;
        database.users[authorUid] = author;
        
        if (author.role === 'coach') {
          database.waiters[authorUid] = author;
          broadcastUpdate('waiters');
        }

        // 금융 장부 기록
        const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const logItem = {
          id: logId,
          uid: authorUid,
          nickname: author.nickname,
          role: author.role,
          type: 'post_liked_reward',
          amount: rewardAmount,
          balance: finalCredits,
          reason: `👍 방문 수기가 추천을 받아 인기 보상 크레딧 지급! (추천인: ${liker.nickname})`,
          createdAt: new Date().toISOString()
        };
        database.credit_logs[logId] = logItem;

        // 보상 알림 발송
        const notifId = 'notif_' + Date.now();
        const notifItem = {
          id: notifId,
          type: 'system',
          title: '🎁 게시글 추천 보상 크레딧 지급!',
          body: `작성하신 수기 글 [${post.title || '성공 수기'}]이 추천을 받았습니다! 보상으로 5 CR이 자동 충전되었습니다. 현재 보유: ${finalCredits} CR`,
          isRead: false,
          createdAt: '방금 전',
          targetUid: authorUid
        };
        database.notifications.push(notifItem);

        // SSE 전송
        broadcastUpdate('users');
        broadcastUpdate('credit_logs');
        broadcastUpdate('notifications');
      }
    }
  }

  const updated = { ...existing, ...updateData, id: id };
  database[collection][id] = updated;

  // 만약 users의 코치 정보가 갱신되면 waiters 리스트에도 함께 동기화
  if (collection === 'users' && updated.role === 'coach') {
    database.waiters[id] = updated;
    broadcastUpdate('waiters');
  }
  
  res.json({ success: true, data: updated });
  
  // 실시간 브로드캐스트 작동!
  broadcastUpdate(collection);
});

// 2.4. 데이터 추가 API (자동 ID 생성 및 알림 특수화 + 수기 차등 보상 백엔드 단독 연산)
app.post('/api/db/:collection', verifySessionLock, (req, res) => {
  const { collection } = req.params;
  if (collection === 'notifications') {
    const newNotif = { id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5), ...req.body, createdAt: '방금 전' };
    database.notifications.push(newNotif);
    res.json({ success: true, data: newNotif });
    broadcastUpdate('notifications');
  } else if (collection === 'posts') {
    // 🔒 [보안 락 1] 수기 글자 수 차등 보상 백엔드 단독 연산 시스템
    const id = `post_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const postData = { ...req.body, id };
    
    const authorUid = postData.authorUid;
    const content = postData.content || '';
    const clubName = postData.clubName || '나이트클럽';
    const title = postData.title || '';
    
    // 공백 제외 글자수 정밀 연산
    const textLen = content.trim().replace(/\s+/g, '').length;
    const author = database.users[authorUid];
    let rewardAmount = 0;

    if (author) {
      const isCoach = author.role === 'coach';
      if (isCoach) {
        // 코치(웨이터)용 차등
        if (textLen >= 100) {
          rewardAmount = 15;
        } else if (textLen >= 40) {
          rewardAmount = 7;
        } else {
          rewardAmount = 0;
        }
      } else {
        // 플레이어(일반회원)용 차등
        if (textLen >= 120) {
          rewardAmount = 25;
        } else if (textLen >= 60) {
          rewardAmount = 15;
        } else if (textLen >= 20) {
          rewardAmount = 5;
        } else {
          rewardAmount = 0;
        }
      }

      // 1. 유저 보유 크레딧 갱신
      const originalCredits = Number(author.credits) || 0;
      const finalCredits = originalCredits + rewardAmount;
      author.credits = finalCredits;
      database.users[authorUid] = author;

      if (author.role === 'coach') {
        database.waiters[authorUid] = author;
        broadcastUpdate('waiters');
      }

      // 2. 백엔드에서 직접 포인트 금융 장부 기록
      if (rewardAmount > 0) {
        const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const logItem = {
          id: logId,
          uid: authorUid,
          nickname: author.nickname,
          role: author.role,
          type: 'board_post_reward',
          amount: rewardAmount,
          balance: finalCredits,
          reason: `✍️ [${clubName}] 성공 수기 작성 포상 크레딧 (${rewardAmount} CR)`,
          createdAt: new Date().toISOString()
        };
        database.credit_logs[logId] = logItem;

        // 3. 백엔드에서 직접 보상 알림 발송
        const notifId = 'notif_' + Date.now();
        const notifItem = {
          id: notifId,
          type: 'system',
          title: '🎁 성공 수기 포상 크레딧 지급!',
          body: `작성해주신 생생한 경험담 수기가 등록되었습니다. 감사의 포상으로 ${rewardAmount} CR이 자동 충전되었습니다. 현재 보유: ${finalCredits} CR`,
          isRead: false,
          createdAt: '방금 전',
          targetUid: authorUid
        };
        database.notifications.push(notifItem);
      }
      
      // 4. 작성자 닉네임 포맷팅 (웨이터일 경우 "쩝이쩝이(한국관나이트소속_코치)" 형식 강제조합)
      if (isCoach) {
        postData.author = `${author.nickname}(${clubName}소속_코치)`;
      } else {
        postData.author = author.nickname;
      }
    }

    database.posts[id] = postData;
    res.json({ success: true, data: postData, rewardAmount: rewardAmount, finalCredits: author ? author.credits : 0 });
    
    // 전체 동기화 전송
    broadcastUpdate('posts');
    broadcastUpdate('users');
    broadcastUpdate('credit_logs');
    broadcastUpdate('notifications');
  } else {
    if (!database[collection]) database[collection] = {};
    const id = req.body.uid || req.body.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newItem = { ...req.body, id };
    
    // [V1.6.1] 신규 가입자 크레딧 누락 시 기본 1000 CR 지급 연산 가드
    if (collection === 'users') {
      if (!('credits' in newItem) || newItem.credits === undefined || newItem.credits === null) {
        newItem.credits = 1000;
      }
    }

    database[collection][id] = newItem;

    // 코치 가입 시 waiters 에 동시 캐싱
    if (collection === 'users' && newItem.role === 'coach') {
      database.waiters[id] = newItem;
      broadcastUpdate('waiters');
    }

    res.json({ success: true, data: newItem });
    broadcastUpdate(collection);
  }
});

// 2.5. 데이터 삭제 API
app.delete('/api/db/:collection/:id', (req, res) => {
  const { collection, id } = req.params;
  if (!database[collection]) {
    return res.status(404).json({ error: "Collection not found" });
  }
  
  if (database[collection][id]) {
    delete database[collection][id];
    
    // 만약 users 삭제이고 코치였으면 waiters 목록에서도 영구 제거
    if (collection === 'users') {
      if (database.waiters[id]) {
        delete database.waiters[id];
        broadcastUpdate('waiters');
      }
    }
    
    res.json({ success: true });
    broadcastUpdate(collection);
  } else {
    res.status(404).json({ error: "Document not found" });
  }
});

// ==========================================================================
// 3.0. [NEW] VVIP 어드민 핵심 비즈니스 로직 API (Admin & Core Business Rules)
// ==========================================================================

// 3.1. 웨이터 가입 승인 API (Approve Waiter)
app.post('/api/admin/users/:uid/approve', (req, res) => {
  const { uid } = req.params;
  const user = database.users[uid];
  
  if (!user || user.role !== 'coach') {
    return res.status(404).json({ error: "코치 회원을 찾을 수 없습니다." });
  }
  
  // 상태 변경 및 승인 완료 처리
  user.isApproved = true;
  user.status = 'active';
  database.users[uid] = user;
  
  // waiters 캐시 업데이트
  database.waiters[uid] = user;
  
  // 축하 인앱 알림 자동 발송
  const newNotif = {
    id: 'notif_' + Date.now(),
    type: 'system',
    title: '🎉 영업 승인 완료 안내',
    body: `축하합니다! ${user.nickname} 코치님의 가입 승인이 완료되었습니다. 이제 실시간 200m 레이더 마케팅 기능이 즉시 활성화됩니다!`,
    isRead: false,
    createdAt: '방금 전',
    targetUid: uid
  };
  database.notifications.push(newNotif);
  
  res.json({ success: true, data: user });
  
  // 실시간 동기화 브로드캐스트
  broadcastUpdate('users');
  broadcastUpdate('waiters');
  broadcastUpdate('notifications');
});

// 3.2. 웨이터 가입 반려 API (Reject Waiter)
app.post('/api/admin/users/:uid/reject', (req, res) => {
  const { uid } = req.params;
  const { reason } = req.body;
  const user = database.users[uid];
  
  if (!user || user.role !== 'coach') {
    return res.status(404).json({ error: "코치 회원을 찾을 수 없습니다." });
  }
  
  // 반려 상태 지정 또는 삭제
  user.isApproved = false;
  user.status = 'rejected';
  user.rejectReason = reason || '소속 클럽 확인이 어렵거나 허위 정보 기재';
  database.users[uid] = user;
  
  // waiters 캐시 제거 또는 상태 반영
  if (database.waiters[uid]) {
    delete database.waiters[uid];
  }
  
  // 반려 안내 인앱 알림 발송
  const newNotif = {
    id: 'notif_' + Date.now(),
    type: 'system',
    title: '⚠️ 가입 신청 반려 안내',
    body: `소속클럽 정보 미확인 사유로 반려되었습니다. (반려사유: ${user.rejectReason}). 내 정보에서 올바른 정보를 입력해 다시 신청하세요.`,
    isRead: false,
    createdAt: '방금 전',
    targetUid: uid
  };
  database.notifications.push(newNotif);
  
  res.json({ success: true, data: user });
  
  // 실시간 동기화 브로드캐스트
  broadcastUpdate('users');
  broadcastUpdate('waiters');
  broadcastUpdate('notifications');
});

// 3.3. 관리자 수동 포인트 지급/차감 및 금융 원장 기록 API (Manual Credit Adjust)
app.post('/api/admin/users/:uid/adjust-credits', (req, res) => {
  const { uid } = req.params;
  const { amount, reason } = req.body; // amount: number (양수 지급, 음수 차감), reason: string
  
  const user = database.users[uid];
  if (!user) {
    return res.status(404).json({ error: "해당 사용자를 찾을 수 없습니다." });
  }
  
  if (!reason) {
    return res.status(400).json({ error: "포인트 조작 사유(reason)를 반드시 남겨야 합니다." });
  }
  
  const originalCredits = Number(user.credits) || 0;
  const adjustAmount = Number(amount) || 0;
  const finalCredits = Math.max(0, originalCredits + adjustAmount);
  
  // 1. 유저 보유 포인트 갱신
  user.credits = finalCredits;
  database.users[uid] = user;
  
  // 코치일 경우 waiters 캐시도 동시 반영
  if (user.role === 'coach') {
    database.waiters[uid] = user;
    broadcastUpdate('waiters');
  }
  
  // 2. credit_logs 컬렉션 금융 원장에 기록 (Audit Log)
  const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const logItem = {
    id: logId,
    uid: uid,
    nickname: user.nickname,
    role: user.role,
    type: adjustAmount >= 0 ? 'admin_reward' : 'admin_charge',
    amount: adjustAmount,
    balance: finalCredits,
    reason: reason,
    createdAt: new Date().toISOString()
  };
  database.credit_logs[logId] = logItem;
  
  // 3. 당사자에게 인앱 알림 발송
  const notifId = 'notif_' + Date.now();
  const notifItem = {
    id: notifId,
    type: 'system',
    title: adjustAmount >= 0 ? '🪙 크레딧 보상 지급' : '🪙 크레딧 관리자 차감',
    body: adjustAmount >= 0 
      ? `관리자로부터 ${adjustAmount} CR이 특별 지급되었습니다! (사유: ${reason}). 현재 보유: ${finalCredits} CR`
      : `관리자에 의해 ${Math.abs(adjustAmount)} CR이 차감되었습니다. (사유: ${reason}). 현재 보유: ${finalCredits} CR`,
    isRead: false,
    createdAt: '방금 전',
    targetUid: uid
  };
  database.notifications.push(notifItem);
  
  res.json({ success: true, balance: finalCredits, log: logItem });
  
  // 실시간 동기화 브로드캐스트
  broadcastUpdate('users');
  broadcastUpdate('credit_logs');
  broadcastUpdate('notifications');
});

// 3.4. 크라우드소싱 신규/폐업 제보 승인 및 무료 포인트 자동 보상 API
// 3.4. 크라우드소싱 신규/폐업 제보 승인 및 무료 포인트 자동 보상 API (2중 승인 방어막 추가)
app.post('/api/admin/reports/:id/approve', verifySessionLock, (req, res) => {
  const { id } = req.params;
  const report = database.reports[id];
  
  if (!report) {
    return res.status(404).json({ error: "제보 정보를 찾을 수 없습니다." });
  }

  // 🔒 [보안 락 2] 제보 승인 2중 처리 방어 (포인트 중복 지급 차단)
  if (report.status === 'approved') {
    return res.status(400).json({ error: "already_approved", message: "이미 승인 완료된 제보 정보입니다." });
  }
  
  // 승인 처리
  report.status = 'approved';
  database.reports[id] = report;
  
  const userUid = report.userUid;
  const user = database.users[userUid];
  
  // 제보자 포인트 자동 지급 로직 (20 CR 보상)
  if (user) {
    const originalCredits = Number(user.credits) || 0;
    const rewardAmount = 20;
    const finalCredits = originalCredits + rewardAmount;
    
    user.credits = finalCredits;
    database.users[userUid] = user;
    
    if (user.role === 'coach') {
      database.waiters[userUid] = user;
      broadcastUpdate('waiters');
    }
    
    // 포인트 원장 기록
    const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const logItem = {
      id: logId,
      uid: userUid,
      nickname: user.nickname,
      role: user.role,
      type: 'report_reward',
      amount: rewardAmount,
      balance: finalCredits,
      reason: `📌 나이트클럽 제보 승인 감사 보상 [클럽명: ${report.clubName}]`,
      createdAt: new Date().toISOString()
    };
    database.credit_logs[logId] = logItem;
    
    // 보상 알림 발송
    const notifId = 'notif_' + Date.now();
    const notifItem = {
      id: notifId,
      type: 'system',
      title: '🎁 제보 감사 무료 보상 크레딧!',
      body: `보내주신 [${report.clubName}] 제보가 소중히 반영되었습니다. 감사의 보상으로 20 CR이 자동 충전되었습니다. 현재 보유: ${finalCredits} CR`,
      isRead: false,
      createdAt: '방금 전',
      targetUid: userUid
    };
    database.notifications.push(notifItem);
  }
  
  res.json({ success: true, data: report });
  
  // 실시간 동기화 브로드캐스트
  broadcastUpdate('users');
  broadcastUpdate('reports');
  broadcastUpdate('credit_logs');
  broadcastUpdate('notifications');
});

// 3.5. [NEW] 반경 내 전체 손님 단체 삐삐 홍보 발송 API (VVIP 특전 - 30 CR 차감)
app.post('/api/db/promotions/group', verifySessionLock, (req, res) => {
  const { senderUid, text, range } = req.body;
  
  const sender = database.users[senderUid];
  if (!sender || sender.role !== 'coach') {
    return res.status(404).json({ error: "웨이터 회원을 찾을 수 없습니다." });
  }

  const cost = 3;
  const originalCredits = Number(sender.credits) || 0;
  if (originalCredits < cost) {
    return res.status(400).json({ error: "credits_insufficient", message: `포인트가 부족합니다. 단체 삐삐 발송에는 ${cost} CR이 소요됩니다. (보유: ${originalCredits} CR)` });
  }

  // 1. 코치 크레딧 차감
  const finalCredits = originalCredits - cost;
  sender.credits = finalCredits;
  database.users[senderUid] = sender;
  database.waiters[senderUid] = sender;

  // 2. 포인트 금융 장부 기록
  const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const logItem = {
    id: logId,
    uid: senderUid,
    nickname: sender.nickname,
    role: sender.role,
    type: 'group_promotion_fee',
    amount: -cost,
    balance: finalCredits,
    reason: `📢 반경 내 전체 손님 단체 삐삐 발송 수수료 차감`,
    createdAt: new Date().toISOString()
  };
  database.credit_logs[logId] = logItem;

  // 3. 반경 내 모든 일반회원(player)을 스캔하여 인앱 알림 일괄 투하
  const allUsers = Object.values(database.users);
  const players = allUsers.filter(u => u.role === 'player');
  let sentCount = 0;

  players.forEach(p => {
    const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const notifItem = {
      id: notifId,
      type: 'promo',
      promoType: 'event', // 기본 혜택
      title: `📢 [VVIP 단체] 에이스 웨이터 ${sender.nickname} 삐삐 도착!`,
      body: `[소속: ${sender.club || '나이트클럽'}] ${text}`,
      isRead: false,
      targetUid: p.uid,
      senderUid: senderUid,
      senderNick: sender.nickname,
      senderPhone: sender.phone || '010-3333-7777',
      createdAt: '방금 전'
    };
    database.notifications.push(notifItem);
    sentCount++;
  });

  // 시스템 전용 알림 발송 (코치에게 발송 보고용)
  const reportNotifId = 'notif_' + Date.now() + '_rep';
  const reportNotifItem = {
    id: reportNotifId,
    type: 'system',
    title: '📢 단체 삐삐 발송 완료 안내',
    body: `반경 내 ${sentCount}명의 선수 손님에게 홍보 삐삐 메시지가 성공적으로 동시 다발 살포되었습니다! (3 CR 차감)`,
    isRead: false,
    createdAt: '방금 전',
    targetUid: senderUid
  };
  database.notifications.push(reportNotifItem);

  res.json({ success: true, sentCount: sentCount, balance: finalCredits });

  // 실시간 동기화 브로드캐스트
  broadcastUpdate('users');
  broadcastUpdate('waiters');
  broadcastUpdate('credit_logs');
  broadcastUpdate('notifications');
});

// ==========================================================================
// 4.0. 스마트 이원화 휴면 청소기 & 가속 디버거 (Smart Inactive Cleaners & Time Accelerator)
// ==========================================================================

// 4.1. 역할별 휴면 정리 핵심 배치 함수 (새벽 4시 저부하 시뮬레이터)
function runSmartCleanup() {
  const now = Date.now();
  
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const COACH_INACTIVE_LIMIT = 60 * MS_PER_DAY; // 웨이터(코치) 2달 = 60일
  const PLAYER_INACTIVE_LIMIT = 730 * MS_PER_DAY; // 일반(선수) 2년 = 730일
  
  let playerDeletedCount = 0;
  let coachDeletedCount = 0;
  
  const allUsers = Object.values(database.users);
  
  allUsers.forEach(user => {
    const lastActive = Number(user.lastActiveAt) || now;
    const diffTime = now - lastActive;
    
    if (user.role === 'coach') {
      // 1. 코치/웨이터 휴면 정리 (2달 기준)
      if (diffTime >= COACH_INACTIVE_LIMIT) {
        console.log(`🧹 [휴면 청소] 장기 비접속 코치 정리 대상 감지: ${user.nickname} (마지막 접속: ${new Date(lastActive).toLocaleDateString()})`);
        
        // 데이터베이스에서 완전 Cascade Clean-up 삭제
        delete database.users[user.uid];
        if (database.waiters[user.uid]) {
          delete database.waiters[user.uid];
        }
        
        // 연관 대화방 삭제 또는 정지
        Object.keys(database.chats).forEach(roomId => {
          const room = database.chats[roomId];
          if (room.participants && room.participants.includes(user.uid)) {
            delete database.chats[roomId];
          }
        });
        
        coachDeletedCount++;
      }
    } else {
      // 2. 일반회원(선수) 휴면 정리 (2년 기준)
      if (diffTime >= PLAYER_INACTIVE_LIMIT) {
        console.log(`🧹 [휴면 청소] 장기 미접속 선수 정리 대상 감지: ${user.nickname} (마지막 접속: ${new Date(lastActive).toLocaleDateString()})`);
        
        // 완전 삭제
        delete database.users[user.uid];
        
        // 연관 대화방 삭제
        Object.keys(database.chats).forEach(roomId => {
          const room = database.chats[roomId];
          if (room.participants && room.participants.includes(user.uid)) {
            delete database.chats[roomId];
          }
        });
        
        playerDeletedCount++;
      }
    }
  });
  
  const logMsg = `🧹 새벽 4시 스마트 휴면 청소기 작동 완료 [일반회원 ${playerDeletedCount}명 삭제, 웨이터 코치 ${coachDeletedCount}명 정리 완료]`;
  console.log(logMsg);
  
  // 시스템 관리자 알림 및 브로드캐스트
  if (playerDeletedCount > 0 || coachDeletedCount > 0) {
    const newNotif = {
      id: 'notif_' + Date.now() + '_sys',
      type: 'system',
      title: '🧹 스마트 휴면 회원 자동 청소 완료',
      body: `역할별 미활동 정책에 의거하여 선수 ${playerDeletedCount}명, 웨이터 ${coachDeletedCount}명이 안전하게 영구 정리되었습니다.`,
      isRead: false,
      createdAt: '방금 전'
    };
    database.notifications.push(newNotif);
    
    broadcastUpdate('users');
    broadcastUpdate('waiters');
    broadcastUpdate('chats');
    broadcastUpdate('notifications');
  }
  
  return { success: true, players: playerDeletedCount, coaches: coachDeletedCount };
}

// 4.2. 24시간마다 백그라운드 자동 새벽 4시 모의 가동 (Interval)
setInterval(() => {
  console.log("⏰ [System Scheduler] 백그라운드 휴면 체크 엔진이 가동됩니다 (저부하 모드)...");
  runSmartCleanup();
}, 60 * 60 * 1000); // 1시간 주기 저부하 간이 체크

// 4.3. QA용 가상 접속 시간 가속 API (QA Time Accelerator)
app.post('/api/debug/accelerate', (req, res) => {
  const { uid, period } = req.body; // uid: 대상 유저, period: '2months' | '2years'
  const user = database.users[uid];
  
  if (!user) {
    return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
  }
  
  const now = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  let targetTime = now;
  
  if (period === '2months') {
    // 2달 전으로 조작 (65일 전으로 설정하여 정리 한계를 넘김)
    targetTime = now - (65 * MS_PER_DAY);
  } else if (period === '2years') {
    // 2년 전으로 조작 (740일 전으로 설정)
    targetTime = now - (745 * MS_PER_DAY);
  }
  
  user.lastActiveAt = targetTime;
  database.users[uid] = user;
  
  if (user.role === 'coach') {
    database.waiters[uid] = user;
    broadcastUpdate('waiters');
  }
  
  res.json({ 
    success: true, 
    nickname: user.nickname, 
    role: user.role, 
    lastActiveAt: targetTime, 
    dateString: new Date(targetTime).toLocaleDateString()
  });
  
  broadcastUpdate('users');
});

// 4.4. QA용 휴면 청소 즉시 수동 구동 API
app.post('/api/debug/trigger-cleanup', (req, res) => {
  const result = runSmartCleanup();
  res.json(result);
});

// ==========================================================================
// 5.0. 실시간 SSE (Server-Sent Events) 개방 스트림 라우터 (Real-time Live Sync)
// ==========================================================================
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);
  
  console.log(`🔌 [SSE-Server] 신규 QA 단말 접속됨 (ID: ${clientId}). 현재 활성 동기화 기기: ${sseClients.length}대`);
  
  // 최초 연결 즉시 현재 서버 DB 데이터를 내려보냅니다 (Sync Initialization)
  res.write(`data: ${JSON.stringify({ action: 'welcome' })}\n\n`);
  for (const collection in database) {
    const data = collection === 'notifications'
      ? database.notifications
      : Object.values(database[collection] || {});
    res.write(`data: ${JSON.stringify({ collection, data })}\n\n`);
  }

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
    console.log(`🔌 [SSE-Server] QA 단말 접속 끊김 (ID: ${clientId}). 현재 활성 동기화 기기: ${sseClients.length}대`);
  });
});

// 3.5. 알림 벌크 일괄 읽음 처리 API 신설 (V1.5.7 마이너 핫픽스: 0초 전체 읽음 대응)
app.post('/api/db-bulk/notifications/read-all', verifySessionLock, (req, res) => {
  const userUid = req.headers['x-user-uid'] || req.body.userUid;
  if (!userUid) {
    return res.status(400).json({ error: "Missing user uid context" });
  }

  let updatedCount = 0;
  database.notifications.forEach(n => {
    if (String(n.targetUid) === String(userUid) && !n.isRead) {
      n.isRead = true;
      updatedCount++;
    }
  });

  if (updatedCount > 0) {
    console.log(`🔔 [DB-Server] 유저 [${userUid}] 님의 전체 미읽음 알림 ${updatedCount}건을 일괄 읽음 처리 완료!`);
    broadcastUpdate('notifications');
  }

  res.json({ success: true, updatedCount });
});

// 3.6. 1:1 대화방 매칭 수락/거절 벌크 트랜잭션 API 신설 (V1.6.0 마이너 핫픽스: 포인트 안전 차감 및 즉시 개방 보장)
app.post('/api/chat/accept', verifySessionLock, (req, res) => {
  const { roomId, resolution, userUid } = req.body;
  
  console.log(`📡 [Accept-API-Debug] 1:1 대화 수락/거절 요청 수신!`);
  console.log(`   - 대화방 ID (roomId): "${roomId}"`);
  console.log(`   - 처리 유형 (resolution): "${resolution}"`);
  console.log(`   - 수락 시도자 UID (userUid): "${userUid}"`);
  
  if (!roomId || !resolution || !userUid) {
    console.error(`   ❌ [Accept-API-Error] 필수 인자 누락!`);
    return res.status(400).json({ error: "missing_fields", message: "필수 입력 항목(roomId, resolution, userUid)이 누락되었습니다." });
  }

  const room = database.chats[roomId];
  if (!room) {
    return res.status(404).json({ error: "room_not_found", message: "대화방 정보를 찾을 수 없습니다." });
  }

  const senderUid = room.senderUid;
  const sender = database.users[senderUid];
  const receiver = database.users[userUid];

  if (!sender || !receiver) {
    return res.status(404).json({ error: "user_not_found", message: "대화방 참여 회원 프로필 정보를 찾을 수 없습니다." });
  }

  if (resolution === 'approved') {
    const originalCredits = Number(sender.credits) || 0;
    if (originalCredits < 10) {
      // 잔액 부족 시 자동 거절 상태로 전환
      room.status = 'rejected';
      room.lastMessage = '포인트 부족으로 매칭 실패';
      room.timeMs = Date.now();
      database.chats[roomId] = room;

      broadcastUpdate('chats');
      return res.status(400).json({ error: "credits_insufficient", message: "신청자의 포인트가 부족하여 매칭을 진행할 수 없습니다." });
    }

    // 1. 신청자 크레딧 차감
    const finalCredits = originalCredits - 10;
    sender.credits = finalCredits;
    database.users[senderUid] = sender;

    if (sender.role === 'coach') {
      database.waiters[senderUid] = sender;
      broadcastUpdate('waiters');
    }

    // 2. 포인트 금융 장부 기록
    const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    database.credit_logs[logId] = {
      id: logId,
      uid: senderUid,
      nickname: sender.nickname,
      role: sender.role,
      type: 'chat_match_fee',
      amount: -10,
      balance: finalCredits,
      reason: `💬 [${receiver.nickname}] 님과의 부킹 1:1 대화 매칭 성사 수수료`,
      createdAt: new Date().toISOString()
    };

    // 3. 대화방 status 'approved' 최종 개방
    room.status = 'approved';
    room.lastMessage = '🎉 매칭 수락 완료! 1:1 대화가 시작되었습니다.';
    room.timeMs = Date.now();
    database.chats[roomId] = room;

    // 4. 신청자 알림 생성
    const notifId = 'notif_' + Date.now();
    database.notifications.push({
      id: notifId,
      type: 'chat',
      title: '🎉 부킹 대화 매칭 완료!',
      body: `${receiver.nickname}님이 대화 신청을 최종 수락하셨습니다! 포인트 10 CR이 정상 차감되었습니다.`,
      isRead: false,
      targetUid: senderUid,
      createdAt: '방금 전'
    });

    console.log(`💬 [Chat-Server] 1:1 매칭 승인 완료! [신청자: ${sender.nickname} 10 CR 차감, 수락자: ${receiver.nickname}]`);

    broadcastUpdate('users');
    broadcastUpdate('chats');
    broadcastUpdate('credit_logs');
    broadcastUpdate('notifications');

    return res.json({ success: true, finalCredits });
  } else {
    // 거절 처리
    room.status = 'rejected';
    room.lastMessage = '대화 신청이 정중하게 거절되었습니다.';
    room.timeMs = Date.now();
    database.chats[roomId] = room;

    const notifId = 'notif_' + Date.now();
    database.notifications.push({
      id: notifId,
      type: 'chat',
      title: '⚠️ 대화 신청 거절 안내',
      body: `${receiver.nickname}님이 대화 신청을 정중히 거절하셨습니다. (차감된 포인트 없음)`,
      isRead: false,
      targetUid: senderUid,
      createdAt: '방금 전'
    });

    console.log(`💬 [Chat-Server] 1:1 매칭 거절 완료! [신청자: ${sender.nickname}, 거절자: ${receiver.nickname}]`);

    broadcastUpdate('chats');
    broadcastUpdate('notifications');

    return res.json({ success: true });
  }
});

// 3.7. 1:1 대화방 나가기(퇴장 & 영구 소거 가비지 컬렉션) API 신설 (V1.6.0 방안 C 적용)
app.post('/api/chat/leave', verifySessionLock, (req, res) => {
  const { roomId, userUid } = req.body;

  if (!roomId || !userUid) {
    return res.status(400).json({ error: "missing_fields", message: "필수 입력 항목(roomId, userUid)이 누락되었습니다." });
  }

  const room = database.chats[roomId];
  if (!room) {
    return res.status(404).json({ error: "room_not_found", message: "이미 나가기 처리되었거나 존재하지 않는 대화방입니다." });
  }

  // leftUsers 배열 초기화
  room.leftUsers = room.leftUsers || [];

  if (!room.leftUsers.includes(userUid)) {
    room.leftUsers.push(userUid);
  }

  // 1:1 채팅방의 양측 참여자 2명이 모두 나간 경우 ➡️ 가비지 컬렉션 가동하여 메모리 영구 폭파
  if (room.leftUsers.length >= 2) {
    delete database.chats[roomId];
    console.log(`🧹 [Chat-Server] 참여자 2인 모두 퇴장! 대화방 [${roomId}] 서버 메모리에서 영구 자동 소거 완료.`);
  } else {
    // 1명만 퇴장한 경우 ➡️ 상대방 상세창 잠금 안내 및 시스템 메시지 강제 삽입
    room.messages = room.messages || [];
    room.messages.push({
      id: 'system_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      senderUid: 'system',
      senderName: '알림',
      text: '상대방이 대화방을 나갔습니다. 추가 메시지를 보낼 수 없습니다.',
      timestamp: '방금 전',
      timeMs: Date.now(),
      isRead: false
    });
    room.lastMessage = '상대방이 대화방을 나갔습니다.';
    room.timeMs = Date.now();
    database.chats[roomId] = room;
    console.log(`📤 [Chat-Server] 유저 [${userUid}] 1차 일방 퇴장 완료. [대화방: ${roomId}]`);
  }

  // SSE 채널로 실시간 탭 상태 강제 씽크 브로드캐스트
  broadcastUpdate('chats');

  res.json({ success: true });
});

// ==========================================================================
// 6.0. 전체 QA 데이터 초기화 API (Cascade Clean-up)
// ==========================================================================
app.post('/api/db/clear-all', (req, res) => {
  database.users = {};
  database.waiters = {};
  database.chats = {};
  database.bookings = {};
  database.reports = {};
  database.credit_logs = {};
  database.notifications = [];
  database.posts = {};

  console.log("🧹 [DB-Server] 전체 테스트 데이터(회원/웨이터/게시글/채팅 등) 백지상태 완전 초기화 완료! (스폰서 광고 4개 보존)");
  
  res.json({ success: true, message: "모든 테스트 데이터가 깨끗하게 100% 청소되었습니다." });
  
  // 모든 컬렉션 브로드캐스트
  broadcastUpdate('users');
  broadcastUpdate('waiters');
  broadcastUpdate('chats');
  broadcastUpdate('bookings');
  broadcastUpdate('reports');
  broadcastUpdate('credit_logs');
  broadcastUpdate('notifications');
  broadcastUpdate('posts');
});

// ==========================================================================
// 7.0. 정적 파일 서빙 및 로컬 네트워크 LAN IP / cloudflared CLI 구동부
// ==========================================================================

// 7.1. 정적 파일 서빙 설정
app.use(express.static(path.join(__dirname)));

// 7.2. 로컬 IP 주소 자동 감지
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.') || iface.address.startsWith('172.')) {
          return iface.address;
        }
      }
    }
  }
  return 'localhost';
}

// 전역 터널 주소 공유 캐시
let currentTunnelUrl = '';

// 현재 백엔드 원격 터널 주소 반환 API (프론트엔드 실시간 노출용)
app.get('/api/debug/tunnel-url', (req, res) => {
  res.json({ url: currentTunnelUrl || 'http://localhost:3001' });
});

// 7.3. cloudflared 원격 카카오톡 공유용 터널 자동 시작
async function startTunnel(port) {
  console.log('🔄 [Cloudflare Tunnel] 퍼블릭 원격 터널을 생성 중입니다 (국내 최초 QUIC http2 우회 적용)...');
  
  try {
    const cloudflared = spawn('npx', [
      '-y',
      'cloudflared',
      'tunnel',
      '--url',
      `http://localhost:${port}`,
      '--protocol',
      'http2'
    ]);

    cloudflared.stderr.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/);
      if (match && !currentTunnelUrl) {
        currentTunnelUrl = match[0];
        console.log('\n============================================================');
        console.log('🔗 [클럽레이더 2 - 카카오톡 외부 공유용 원격 터널링 주소]');
        console.log(`   👉 ${currentTunnelUrl}`);
        console.log('============================================================');
        console.log('📣 이 링크를 스마트폰 카카오톡으로 복사하여 외부 기기에서 실시간 QA 하세요!');
        console.log('------------------------------------------------------------');
        qrcode.generate(currentTunnelUrl, { small: true });
        console.log('============================================================\n');
      }
    });

    cloudflared.on('close', (code) => {
      console.log(`⚠️ 원격 Cloudflare 터널 종료됨 (코드: ${code}). 5초 후 복구 진행...`);
      setTimeout(() => startTunnel(port), 5000);
    });

    cloudflared.on('error', (err) => {
      console.error('❌ 원격 터널 에러:', err);
    });

  } catch (err) {
    console.error('❌ Cloudflare Tunnel 발급 실패:', err.message);
    setTimeout(() => startTunnel(port), 5000);
  }
}

// 7.4. Express 서버 리스닝
app.listen(PORT, () => {
  const localIP = getLocalIPAddress();
  const localhostURL = `http://localhost:${PORT}`;
  const lanURL = `http://${localIP}:${PORT}`;

  console.clear();
  console.log('============================================================');
  console.log('⚡ [클럽레이더 2] 내부 QA 및 모바일 실기기 실시간 검증 서버 작동');
  console.log('============================================================\n');
  
  console.log(`💻 [PC 브라우저 테스트 주소]:`);
  console.log(`   👉 ${localhostURL}\n`);
  
  if (localIP !== 'localhost') {
    console.log(`📱 [로컬 와이파이 접속 주소] (PC와 동일한 와이파이 필요):`);
    console.log(`   👉 ${lanURL}\n`);
    
    console.log('------------------------------------------------------------');
    console.log('📣 동일 Wi-Fi 망에서 아래 QR 코드를 스캔해 즉시 스마트폰으로 접속하세요:');
    console.log('------------------------------------------------------------');
    qrcode.generate(lanURL, { small: true });
    console.log('------------------------------------------------------------');
  } else {
    console.log('⚠️ 네트워크 미연결 상태입니다. 로컬 PC 브라우저에서만 테스트 가능합니다.\n');
  }
  
  console.log(`💡 [클럽레이더 2 QA 이행 가이드]:`);
  console.log(`   1. 이원화 회원가입 시 웨이터는 관리자 승인 완료 전까지는 락이 걸립니다.`);
  console.log(`   2. 관리자 페이지에서 클릭 1초 만에 웨이터 승인 및 포인트 지급이 동기화됩니다.`);
  console.log(`   3. 모바일 GPS 거리 슬라이더를 200m 밖으로 밀면 실시간 SSE 스트림으로 도트가 꺼집니다.\n`);
  console.log('============================================================');

  // 🌟 [Render.com 배포 방어막] 리얼 클라우드 서버 배포 시에는 로컬 터널을 가동하지 않고 스킵합니다!
  if (process.env.RENDER) {
    console.log("☁️ [Cloud Host] Render.com 리얼 서버 구동이 감지되었습니다. 로컬 cloudflared 터널 개방을 스킵합니다!");
  } else {
    // 터널 자동 시작
    startTunnel(PORT);
  }
});
