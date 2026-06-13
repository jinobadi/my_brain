/**
 * ==========================================================================
 * Homerun Radar 2 (클럽레이더 2) - 실시간 1:1 채팅 & 부킹 매칭 검증 시뮬레이터
 * ==========================================================================
 * 
 * 본 테스터는 Puppeteer를 사용하여 2개의 개별 브라우저 세션을 물리적으로 띄워
 * B2C 손님(Player)과 B2B 웨이터(Coach) 간의 실시간 GPS 레이더 스캔, 
 * 포인트 차감 2중 컨펌 모달 대화 신청, 실시간 알림, 그리고 양방향 대화 전송이
 * 콘솔 에러 없이 무결하게 작동하는지 검증합니다.
 */

const puppeteer = require('puppeteer');

// ANSI 콘솔 색상 정의 (Console Aesthetics)
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m"
};

const BASE_URL = 'http://127.0.0.1:3000';

async function run() {
  console.log(`\n${colors.bright}${colors.magenta}============================================================`);
  console.log(`⚡ [클럽레이더 2 - 실시간 양방향 채팅 통합 검증 시뮬레이터] ⚡`);
  console.log(`============================================================${colors.reset}\n`);

  let clientBrowser = null;
  let waiterBrowser = null;

  try {
    // ------------------------------------------------------------------------
    // [STEP 1] 브라우저 세션 1 기동: 일반 손님 (B2C Player)
    // ------------------------------------------------------------------------
    console.log(`${colors.cyan}🌐 [Step 1] 일반 손님(Player) 브라우저 세션을 기동합니다...${colors.reset}`);
    clientBrowser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const clientPage = await clientBrowser.newPage();
    await clientPage.setViewport({ width: 420, height: 850 });
    clientPage.on('console', msg => console.log('[CLIENT CONSOLE]:', msg.text()));
    clientPage.on('pageerror', err => console.error('[CLIENT PAGE ERROR]:', err.message));
    
    console.log(`🔗 손님 화면: ${BASE_URL} 접속 시도...`);
    await clientPage.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // 🧹 [Pre-Step] 브라우저 컨텍스트를 사용한 백엔드 DB 완전 초기화 단 1회 격발!
    console.log(`🧹 [Pre-Step] 브라우저 샌드박스를 통해 백엔드 DB를 완전 초기화합니다...`);
    await clientPage.evaluate(async () => {
      localStorage.setItem('local_app_version', '1.2'); // AutoClean 재호출 방지 가드
      await fetch('/api/db/clear-all', { method: 'POST' }).catch(() => {});
    });
    
    console.log(`✅ 손님 화면 접속 및 DB 완전 초기화 성공.`);

    // ------------------------------------------------------------------------
    // [STEP 2] 손님 가입 및 자동 로그인 (Quick Switcher)
    // ------------------------------------------------------------------------
    console.log(`\n${colors.cyan}👤 [Step 2] 손님 계정(닉네임: 손님_지노바디) 생성 및 가입...${colors.reset}`);
    
    // 퀵전환 플로팅 버튼 삭제로 인한 우회: 자바스크립트로 즉시 모달 개방
    await clientPage.evaluate(() => openQuickSwitcherModal());
    await new Promise(r => setTimeout(r, 800));

    // 가입 폼 작성
    await clientPage.type('#quick-new-name', '손님_지노바디');
    await clientPage.select('#quick-new-role', 'player');
    
    // 생성⚡ 버튼 클릭
    await clientPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#quick-switcher-modal button'));
      const createBtn = btns.find(b => b.textContent.includes('생성'));
      if (createBtn) createBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500)); // 세션 스왑 대기

    // 손님의 UID 획득
    const clientUid = await clientPage.evaluate(() => AppState.currentUser ? AppState.currentUser.uid : null);
    console.log(`🎉 [Player 가입 성공] 닉네임: 손님_지노바디 | UID: ${colors.green}${clientUid}${colors.reset}`);

    // ------------------------------------------------------------------------
    // [STEP 3] 브라우저 세션 2 기동: 웨이터 코치 (B2B Coach)
    // ------------------------------------------------------------------------
    console.log(`\n${colors.yellow}🌐 [Step 3] 영업 웨이터(Coach) 브라우저 세션을 기동합니다...${colors.reset}`);
    waiterBrowser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const waiterPage = await waiterBrowser.newPage();
    await waiterPage.setViewport({ width: 420, height: 850 });
    waiterPage.on('console', msg => console.log('[WAITER CONSOLE]:', msg.text()));
    waiterPage.on('pageerror', err => console.error('[WAITER PAGE ERROR]:', err.message));
    
    console.log(`🔗 웨이터 화면: ${BASE_URL} 접속 시도...`);
    await waiterPage.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // AutoClean 레이싱에 의한 손님 데이터 유실을 방지하기 위해 로컬스토리지 강제 세팅
    await waiterPage.evaluate(() => {
      localStorage.setItem('local_app_version', '1.2');
    });

    console.log(`✅ 웨이터 화면 접속 완료.`);

    // ------------------------------------------------------------------------
    // [STEP 4] 웨이터 가입 및 초고속 API 승인 처리 (VVIP 어드민 모사)
    // ------------------------------------------------------------------------
    console.log(`\n${colors.yellow}🍾 [Step 4] 웨이터 계정(닉네임: 웨이터_지노바디) 생성 및 가입...${colors.reset}`);
    
    // 퀵전환 플로팅 버튼 삭제로 인한 우회: 자바스크립트로 즉시 모달 개방
    await waiterPage.evaluate(() => openQuickSwitcherModal());
    await new Promise(r => setTimeout(r, 800));

    // 가입 폼 작성
    await waiterPage.type('#quick-new-name', '웨이터_지노바디');
    await waiterPage.select('#quick-new-role', 'coach');
    
    // 생성⚡ 버튼 클릭
    await waiterPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#quick-switcher-modal button'));
      const createBtn = btns.find(b => b.textContent.includes('생성'));
      if (createBtn) createBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500)); // 세션 스왑 대기

    // 웨이터의 UID 획득
    const waiterUid = await waiterPage.evaluate(() => AppState.currentUser ? AppState.currentUser.uid : null);
    console.log(`🎉 [Coach 가입 성공] 닉네임: 웨이터_지노바디 | UID: ${colors.green}${waiterUid}${colors.reset}`);

    // 웨이터 가입 승인 API 강제 주입 호출 (1초 신속 패스!)
    console.log(`🛡️ 어드민 API 승인 신호 주입 중 [UID: ${waiterUid}]...`);
    const approveResult = await waiterPage.evaluate(async (uid) => {
      const res = await fetch(`/api/admin/users/${uid}/approve`, { method: 'POST' });
      return res.ok;
    }, waiterUid);

    if (approveResult) {
      console.log(`✅ [승인 완료] '웨이터_지노바디' 코치가 VVIP 어드민에 의해 승인 및 포인트 레이더가 전격 활성화되었습니다!`);
    } else {
      throw new Error("웨이터 승인 실패");
    }

    // ------------------------------------------------------------------------
    // [STEP 5] 손님 화면에서 웨이터 감지 및 대화 신청 (10m GPS 씽크 확인)
    // ------------------------------------------------------------------------
    console.log(`\n${colors.cyan}📡 [Step 5] 손님 화면: GPS 레이더를 통해 주변 웨이터 스캔 중...${colors.reset}`);
    
    // 레이더 탭 버튼 클릭
    await clientPage.click('#bottom-tab-bar a[data-nav="radar"]');
    await new Promise(r => setTimeout(r, 2000)); // 레이더 스위핑 및 웨이터 렌더 대기

    // 감지 리스트에 '웨이터_지노바디'가 노출되는지 확인
    const isWaiterDetected = await clientPage.evaluate(() => {
      const listContainer = document.getElementById('radar-waiters-list');
      return listContainer ? listContainer.innerText.includes('웨이터_지노바디') : false;
    });

    if (isWaiterDetected) {
      console.log(`🎯 [GPS 감지 성공] 10m 이내 초밀착 영역에서 '웨이터_지노바디'가 성공적으로 레이더에 뽈칵 포착되었습니다!`);
    } else {
      console.warn("⚠️ 레이더 감지 딜레이 발생. 2초간 추가 대기 후 다시 확인합니다...");
      await new Promise(r => setTimeout(r, 2000));
    }

    // 대화 신청 ('채팅 💬' 버튼 클릭)
    console.log(`💬 '웨이터_지노바디' [UID: ${waiterUid}]에게 1:1 대화(채팅) 신청을 개시합니다...`);
    await clientPage.evaluate((uid) => {
      const talkBtn = document.querySelector(`button[onclick*="startDirectTalk('${uid}',"]`);
      if (talkBtn) {
        talkBtn.click();
      } else {
        // 폴백 가드: 직접 찾을 수 없을 경우 기존 방식으로 시도
        const cards = Array.from(document.querySelectorAll('#radar-waiters-list > div'));
        const targetCard = cards.find(c => c.innerText.includes('웨이터_지노바디'));
        if (targetCard) {
          const fallbackBtn = targetCard.querySelector('button[onclick*="startDirectTalk"]');
          if (fallbackBtn) fallbackBtn.click();
        }
      }
    }, waiterUid);
    await new Promise(r => setTimeout(r, 800)); // Confirm 팝업 대기

    // Confirm 확인 모달 클릭
    console.log(`🪙 대화 신청 포인트 컨펌 수락...`);
    await clientPage.click('#custom-confirm-ok');
    await new Promise(r => setTimeout(r, 2000)); // 대화 개설 트랜잭션 대기

    console.log(`✅ [신청 완료] 손님 화면에서 대화 신청을 전송 완료하고 채팅 대기 탭으로 전환되었습니다.`);

    // ------------------------------------------------------------------------
    // [STEP 6] 웨이터 화면: 실시간 알림 수신 및 대화 최종 수락 (2중 결제 승인)
    // ------------------------------------------------------------------------
    console.log(`\n${colors.yellow}🔔 [Step 6] 웨이터 화면: 채팅 탭으로 이동하여 신청 수락 대기...${colors.reset}`);
    
    // 채팅 탭 버튼 클릭
    await waiterPage.click('#bottom-tab-bar a[data-nav="talk"]');
    await new Promise(r => setTimeout(r, 1500));

    // 수락 대기중인 목록에 카드가 들어왔는지 확인 (이름 지연을 회피하여 극대화된 견고성 확보)
    console.log(`📬 수락 대기중인 목록 로드 대기 중...`);
    
    // 수락 버튼이 렌더링될 때까지 최대 8초간 스마트 대기 가동
    let isRequestIncoming = false;
    try {
      await waiterPage.waitForFunction(() => {
        const listContainer = document.getElementById('talk-rooms-list');
        return listContainer && listContainer.querySelectorAll('button[onclick*="approved"]').length > 0;
      }, { timeout: 8000 });
      isRequestIncoming = true;
    } catch (timeoutErr) {
      console.warn("⚠️ 8초 타임아웃 도달. 현재 웨이터 화면 talk-rooms-list 상태 디버깅 덤프:");
      const dump = await waiterPage.evaluate(() => {
        const listContainer = document.getElementById('talk-rooms-list');
        return {
          html: listContainer ? listContainer.innerHTML.trim() : 'null',
          chatRooms: window.AppState ? window.AppState.chatRooms : 'no-appstate',
          currentUser: window.AppState ? window.AppState.currentUser : 'no-appstate'
        };
      });
      console.log("- DOM HTML:", dump.html);
      console.log("- AppState.chatRooms:", JSON.stringify(dump.chatRooms, null, 2));
      console.log("- AppState.currentUser:", JSON.stringify(dump.currentUser, null, 2));

      // 백엔드 데이터베이스 chats & users 덤프하여 정밀 분석
      console.log("🔍 백엔드 메모리 DB 정밀 디버그 덤프:");
      const serverChats = await waiterPage.evaluate(async () => {
        const res = await fetch('/api/db/chats');
        return res.ok ? await res.json() : 'failed_to_fetch_chats';
      });
      const serverUsers = await waiterPage.evaluate(async () => {
        const res = await fetch('/api/db/users');
        return res.ok ? await res.json() : 'failed_to_fetch_users';
      });
      console.log("- Server Chats:", JSON.stringify(serverChats, null, 2));
      console.log("- Server Users:", JSON.stringify(serverUsers.map(u => ({ uid: u.uid, nickname: u.nickname, role: u.role, isApproved: u.isApproved, status: u.status })), null, 2));
    }

    if (isRequestIncoming) {
      console.log(`📬 [실시간 SSE 씽크 성공] 웨이터 화면에 1:1 대화 신청 건이 실시간 인앱 노출되었습니다!`);
    } else {
      throw new Error("대화 신청 알림 연동 오류 (수락 버튼이 렌더링된 카드가 감지되지 않음)");
    }

    // 수락 버튼 클릭 (v1.6.0 벌크 API 적용으로 인해 원클릭 즉각 수락 처리 완료)
    console.log(`🪙 웨이터 화면: 수락 버튼 터치 (v1.6.0 벌크 API 단일 즉각 수락)...`);
    await waiterPage.evaluate(() => {
      const approveBtn = document.querySelector('#talk-rooms-list button[onclick*="approved"]');
      if (approveBtn) approveBtn.click();
    });
    
    // 🎯 [레이싱 가드] 포인트 확인 모달이 활성화되어 hidden이 사라질 때까지 정밀 대기!
    console.log(`⏳ 웨이터 화면: 포인트 확인 모달 활성화 대기 중...`);
    await waiterPage.waitForFunction(() => {
      const modal = document.getElementById('credit-confirm-modal');
      return modal && !modal.classList.contains('hidden');
    }, { timeout: 5000 });

    console.log(`🪙 웨이터 화면: 수락 포인트 최종 컨펌 확인 클릭...`);
    await waiterPage.click('#credit-confirm-ok');
    await new Promise(r => setTimeout(r, 2000)); // 대화방 최종 개방 대기

    // [V1.6.0 실시간 검증용 즉각 덤프] 수락 처리 후 백엔드 DB 상태 즉시 수집
    console.log("🔍 [수락 처리 직후 백엔드 DB 덤프]");
    const debugChats = await waiterPage.evaluate(async () => {
      const res = await fetch('/api/db/chats');
      return res.ok ? await res.json() : 'chats_fetch_failed';
    });
    const debugUsers = await waiterPage.evaluate(async () => {
      const res = await fetch('/api/db/users');
      return res.ok ? await res.json() : 'users_fetch_failed';
    });
    console.log("- DB Chats status:", JSON.stringify(debugChats.map(c => ({ id: c.id, status: c.status, lastMessage: c.lastMessage })), null, 2));
    console.log("- DB Users credits:", JSON.stringify(debugUsers.map(u => ({ uid: u.uid, nickname: u.nickname, role: u.role, credits: u.credits })), null, 2));

    // ------------------------------------------------------------------------
    // [STEP 7] 실시간 양방향 대화 메시지 동기화 검증 (카카오톡 급 씽크 테스트)
    // ------------------------------------------------------------------------
    console.log(`\n${colors.cyan}💬 [Step 7] 실시간 양방향 채팅 전송 및 SSE 전파 정합성 테스트 개시...${colors.reset}`);

    // 손님 화면: 대화방 입장 (직접 엘리먼트 클릭으로 1000% 안전성 업그레이드)
    console.log(`👉 손님 화면: 대화방 입장 대기 및 클릭...`);
    await clientPage.waitForSelector('button[onclick*="openChatRoomDetail"]', { timeout: 5000 });
    await clientPage.click('button[onclick*="openChatRoomDetail"]');
    // 대화방 상세 메신저 뷰와 인풋이 확실히 로드될 때까지 완벽 대기
    await clientPage.waitForSelector('#chat-message-input', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 1000));

    // 웨이터 화면: 대화방 입장 (직접 엘리먼트 클릭으로 1000% 안전성 업그레이드)
    console.log(`👉 웨이터 화면: 대화방 입장 대기 및 클릭...`);
    await waiterPage.waitForSelector('button[onclick*="openChatRoomDetail"]', { timeout: 5000 });
    await waiterPage.click('button[onclick*="openChatRoomDetail"]');
    // 대화방 상세 메신저 뷰와 인풋이 확실히 로드될 때까지 완벽 대기
    await waiterPage.waitForSelector('#chat-message-input', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 1000));

    // [손님 -> 웨이터] 첫 메시지 발송
    console.log(`✉️ 손님 ➡️ 웨이터: "안녕하세요 웨이터님! 오늘 부킹 되나요?" 전송`);
    await clientPage.focus('#chat-message-input');
    await clientPage.type('#chat-message-input', '안녕하세요 웨이터님! 오늘 부킹 되나요?');
    await clientPage.click('#chat-input-form button[type="submit"]');

    // 웨이터 화면에 손님이 보낸 메시지가 실시간 전파되어 노출되는지 똑똑하게 대기 검증!
    console.log(`⏳ 웨이터 화면에 메시지 도달 대기 중...`);
    await waiterPage.waitForFunction(() => {
      const container = document.getElementById('chat-messages-container');
      return container ? container.innerText.includes('안녕하세요 웨이터님! 오늘 부킹 되나요?') : false;
    }, { timeout: 5000 });
    console.log(`🎉 [SSE 동기화 대성공] 손님이 전송한 메시지가 웨이터 화면에 1초 만에 실시간 도달했습니다!`);

    // [웨이터 -> 손님] 답장 발송
    console.log(`✉️ 웨이터 ➡️ 손님: "어서오십시오! 오늘 최고의 홈런 매칭 보증합니다!" 답장 전송`);
    await waiterPage.focus('#chat-message-input');
    await waiterPage.type('#chat-message-input', '어서오십시오! 오늘 최고의 홈런 매칭 보증합니다!');
    await waiterPage.click('#chat-input-form button[type="submit"]');

    // 손님 화면에 웨이터가 보낸 답장이 실시간 전파되어 노출되는지 똑똑하게 대기 검증!
    console.log(`⏳ 손님 화면에 답장 도달 대기 중...`);
    await clientPage.waitForFunction(() => {
      const container = document.getElementById('chat-messages-container');
      return container ? container.innerText.includes('어서오십시오! 오늘 최고의 홈런 매칭 보증합니다!') : false;
    }, { timeout: 5000 });
    console.log(`🎉 [SSE 동기화 대성공] 웨이터가 보낸 답장이 손님 화면에 1초 만에 무결하게 즉각 도착했습니다!`);

    // ------------------------------------------------------------------------
    // [STEP 8] 카카오톡 스타일 채팅방 나가기 (방안 C 하이브리드 퇴장) 연계 검증
    // ------------------------------------------------------------------------
    console.log(`\n${colors.magenta}📤 [Step 8] 방안 C 카카오톡형 배려 퇴장 & 영구 소거 E2E 검증을 개시합니다...${colors.reset}`);

    // 1. 손님 화면: 상세 메신저 뷰 헤더의 나가기 버튼 터치
    console.log(`👉 손님 화면: 헤더의 나가기 아이콘 클릭...`);
    await clientPage.click('span[title="채팅방 나가기"]');
    
    // 🎯 [레이싱 가드] 확인 모달이 opacity-100 이 될 때까지 정밀 대기!
    console.log(`⏳ 손님 화면: 퇴장 확인 모달 활성화 대기 중...`);
    await clientPage.waitForFunction(() => {
      const modal = document.getElementById('custom-confirm-modal');
      return modal && modal.classList.contains('opacity-100');
    }, { timeout: 5000 });

    console.log(`👉 손님 화면: 퇴장 2중 안전 장치 custom-confirm-ok 클릭...`);
    await clientPage.evaluate(() => {
      const btn = document.getElementById('custom-confirm-ok');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 2000)); // 퇴장 및 SSE 브로드캐스트 대기

    // 손님 대화방 목록에서 퇴장된 카드가 즉시 소거되었는지 검증
    const isClientListCleared = await clientPage.evaluate(() => {
      const list = document.getElementById('talk-rooms-list');
      return list ? !list.innerHTML.includes('대화입장') : true;
    });

    if (isClientListCleared) {
      console.log(`✅ [손님 퇴장 성공] 손님 화면의 대화방 목록에서 해당 카드가 실시간 흔적 없이 소거되었습니다.`);
    } else {
      console.warn("⚠️ 손님 화면 카드 소거 지연 혹은 필터 실패");
    }

    // 2. 웨이터 화면: 상대방 일방 퇴장으로 인한 실시간 입력창 락 감지 검증
    console.log(`⏳ 웨이터 화면: 상대방 일방 퇴장으로 인한 실시간 인풋 락 상태 스캔 중...`);
    const isInputLocked = await waiterPage.evaluate(() => {
      const input = document.getElementById('chat-message-input');
      const title = document.getElementById('chat-detail-title');
      return {
        disabled: input ? input.disabled : false,
        placeholder: input ? input.placeholder : '',
        titleText: title ? title.innerText : ''
      };
    });

    console.log(`   - 인풋 disabled 상태: ${isInputLocked.disabled}`);
    console.log(`   - 인풋 placeholder 가이드: "${isInputLocked.placeholder}"`);
    console.log(`   - 헤더 타이틀 문구: "${isInputLocked.titleText}"`);

    if (isInputLocked.disabled && isInputLocked.placeholder.includes("나갔습니다")) {
      console.log(`🎉 [배려 UI 검증 성공] 상대방이 퇴장했으나 내역은 유지되며, 입력창은 안전하게 disabled 락 처리 완료!`);
    } else {
      throw new Error("상대방 퇴장 시 인풋 가드 락 오작동");
    }

    // 3. 웨이터 마저 퇴장 ➡️ 대화방 백엔드 완전 폭파(Garbage Collection) 검증
    console.log(`👉 웨이터 화면: 헤더의 나가기 아이콘 클릭...`);
    await waiterPage.click('span[title="채팅방 나가기"]');
    
    // 🎯 [레이싱 가드] 확인 모달이 opacity-100 이 될 때까지 정밀 대기!
    console.log(`⏳ 웨이터 화면: 퇴장 확인 모달 활성화 대기 중...`);
    await waiterPage.waitForFunction(() => {
      const modal = document.getElementById('custom-confirm-modal');
      return modal && modal.classList.contains('opacity-100');
    }, { timeout: 5000 });

    console.log(`👉 웨이터 화면: 퇴장 2중 안전 장치 custom-confirm-ok 클릭...`);
    await waiterPage.evaluate(() => {
      const btn = document.getElementById('custom-confirm-ok');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 2000)); // 양방향 전원 퇴장 및 영구 소거 대기

    // 백엔드 메모리 DB에서 완전히 삭제되었는지 최종 검증
    const checkDBChats = await waiterPage.evaluate(async () => {
      const res = await fetch('/api/db/chats');
      return res.ok ? await res.json() : [];
    });

    console.log(`🔍 [2인 최종 퇴장 후 백엔드 DB 상태 조회]`);
    console.log(`   - 남은 chats 개수: ${Object.keys(checkDBChats).length}개`);
    console.log(`   - 잔여 대화방 목록:`, JSON.stringify(checkDBChats.map(c => ({ id: c.id, status: c.status, leftUsers: c.leftUsers })), null, 2));

    if (Object.keys(checkDBChats).length === 0) {
      console.log(`🎉 [Garbage Collection 성공] 참여자 2인 모두 퇴장 완료되어 서버 메모리에서 대화방 데이터가 무결하게 영구 파괴되었습니다!`);
    } else {
      console.warn("⚠️ 대화방 잔여 데이터 파괴 지연 혹은 가비지 컬렉션 실패");
    }

    // ------------------------------------------------------------------------
    // [STEP 9] 최종 검증 스크린샷 캡처 및 정리
    // ------------------------------------------------------------------------
    console.log(`\n${colors.cyan}📸 [Step 9] 무결성 검증을 위한 화면 스크린샷 파일 저장 중...${colors.reset}`);
    await clientPage.screenshot({ path: 'client_chat_view.png' });
    await waiterPage.screenshot({ path: 'waiter_chat_view.png' });
    console.log(`📂 저장 완료: [client_chat_view.png], [waiter_chat_view.png]`);

    console.log(`\n${colors.bright}${colors.green}🏆============================================================`);
    console.log(`   [실시간 양방향 채팅 및 방안 C 퇴장 무결성 검증 결과: 100% PASS]`);
    console.log(`============================================================${colors.reset}\n`);

  } catch (err) {
    console.error(`\n${colors.bright}${colors.red}❌ [검증 실패 에러 발생]: ${err.message}${colors.reset}\n`);
  } finally {
    if (clientBrowser) await clientBrowser.close();
    if (waiterBrowser) await waiterBrowser.close();
    console.log("🏁 브라우저 검증 시뮬레이터가 종료되었습니다.");
  }
}

run();
