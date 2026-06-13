const puppeteer = require('puppeteer');

(async () => {
  console.log("🚀 [Tester-v1.4] 대표님의 명에 따라 임의의 신규 VVIP 선수단 회원 가입 실시간 시뮬레이션을 개시합니다!");
  
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // 콘솔 로그 실시간 수집
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      console.error(`❌ [Console Error]: ${text}`);
    } else {
      console.log(`ℹ️ [Console Log]: ${text}`);
    }
  });

  page.on('pageerror', err => {
    console.error(`❌ [Page Crash Error]: ${err.toString()}`);
  });

  try {
    console.log("🔗 http://localhost:3001로 접속 중...");
    await page.goto('http://localhost:3001', { waitUntil: 'load', timeout: 15000 });
    console.log("✅ 페이지 마운트 완료.");

    // 1. 회원가입 탭으로 강제 네비게이션
    console.log("🖱️ [1초 회원가입] 페이지 이동...");
    await page.evaluate(() => {
      window.navigateTo('signup');
    });
    await new Promise(r => setTimeout(r, 1000));

    // 2. 선수 (일반 회원) 탭이 기본 선택되어 있는지 확인하고 입력
    console.log("✍️ 임의의 이름(김태희), 닉네임(여신태희), 번호(010-9999-8888) 입력 중...");
    await page.type('#su-name', '김태희');
    await page.type('#su-nickname', '여신태희');
    await page.type('#su-phone', '010-9999-8888');

    // 3. 성향 칩 다중 선택 시뮬레이션
    console.log("🖱️ 본인 성향 스타일 칩 선택 중 (#섹시스타일, #EDM러버)...");
    await page.evaluate(() => {
      const chips = document.querySelectorAll('#style-tag-container-signup div');
      chips.forEach(chip => {
        const text = chip.innerText;
        if (text === '#섹시스타일' || text === '#EDM러버') {
          chip.click();
          console.log(`👉 성향 칩 클릭: ${text}`);
        }
      });
    });

    // 4. 인증요청 클릭
    console.log("🖱️ [인증요청] 버튼 클릭...");
    await page.evaluate(() => {
      const reqSmsBtn = document.querySelector('#signup-form button[type="button"]');
      if (reqSmsBtn) reqSmsBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // 5. 가상인증번호 '1234' 입력 및 확인 클릭
    console.log("✍️ 가상인증번호 '1234' 입력 및 확인 클릭...");
    await page.type('#su-auth-code', '1234');
    await page.evaluate(() => {
      const verifyBtn = document.querySelector('#sms-auth-box button');
      if (verifyBtn) verifyBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // 6. 가입 서브밋 트리거
    console.log("🖱️ [선수단 정식 회원가입 완료 ⚡] 최종 전송 클릭...");
    const submitResult = await page.evaluate(async () => {
      const form = document.getElementById('signup-form');
      if (form) {
        const submitEvent = new Event('submit', { cancelable: true });
        form.dispatchEvent(submitEvent);
        return "폼 서브밋 디스패치 성공";
      }
      return "폼을 찾을 수 없음";
    });
    console.log(`📝 [Submit Sim Result]: ${submitResult}`);
    
    // 가입 완료 후 상태 변화 및 DB 적재 대기
    await new Promise(r => setTimeout(r, 4000));
    
    // 현재 복구된 페이지 상태가 무엇인지 검증
    const endPage = await page.evaluate(() => {
      return {
        currentPage: AppState.currentPage,
        currentUser: AppState.currentUser
      };
    });
    
    console.log(`🏁 [회원가입 완료 스냅샷]:`);
    console.log(`   👉 현재 화면: ${endPage.currentPage}`);
    console.log(`   👉 가입 유저 세션 정보: \n${JSON.stringify(endPage.currentUser, null, 2)}`);

  } catch (err) {
    console.error(`❌ 에러 발생: ${err.message}`);
  } finally {
    await browser.close();
    console.log("🏁 시뮬레이션 디버깅 테스트 종료.");
  }
})();
