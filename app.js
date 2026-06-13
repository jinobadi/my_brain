/**
 * ==========================================================================
 * Homerun Radar 2 (클럽레이더 2) - Premium Core Business Logic & State Engine
 * ==========================================================================
 */

// 1.0. 하이브리드 파이어베이스 & 로컬 캐싱 에뮬레이터 초기화 (Robust Sync Setup)
const firebaseConfig = {
  apiKey: "AIzaSyA_JzAivPs9AnFHAi1-cLkNwSutCtk0zbI",
  authDomain: "homerun-radar.firebaseapp.com",
  projectId: "homerun-radar",
  storageBucket: "homerun-radar.appspot.com",
  messagingSenderId: "469958244976",
  appId: "1:469958244976:web:d07a33ed52c1551cc112b5"
};

const KoreanAvatars = {
  me: './assets/korean_man_user.png',
  james: './assets/korean_waiter_james.png',
  vipWoman: './assets/korean_woman_vip.png'
};

let isPhoneVerified = false; // 휴대전화 인증 플래그

// 🌟 [V0.8.1-Hotfix2] 카카오톡 스타일 소리/진동 알림 전역 설정 바인딩
const AppState_NotificationSettings = {
  sound: localStorage.getItem('alert_sound') !== 'false',
  vibrate: localStorage.getItem('alert_vibrate') !== 'false'
};

// 🌟 [V0.8.1-Hotfix2] 네이티브 알림 피드백 재생 엔진 (소리/진동)
function playAlertReaction() {
  // 1. 진동 피드백 (Vibration API)
  if (AppState_NotificationSettings.vibrate && navigator.vibrate) {
    // 카카오톡 특유의 짧은 더블 진동 (150ms 진동, 100ms 대기, 150ms 진동) 모사
    navigator.vibrate([150, 100, 150]);
  }
  
  // 2. 효과음 피드백 (Audio Synthesis)
  if (AppState_NotificationSettings.sound) {
    try {
      // VIP 매칭용 청아한 네온 크리스탈 차임 사운드를 HTML5 Web Audio API로 오디오 합성!
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 청아한 A5 하이 음
      osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.15); // 고음 맑은 하모닉스 시프트
      
      gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35); // 0.35초간 페이드아웃
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
      console.warn("⚠️ [AudioEngine] 사운드 합성 오류:", e);
    }
  }
}

// 🌟 [V0.8.1-Hotfix2] 알림 설정 토글 제어
function toggleNotificationSetting(type, checked) {
  if (type === 'sound') {
    AppState_NotificationSettings.sound = checked;
    localStorage.setItem('alert_sound', String(checked));
    showToast(checked ? '🔊 알림 효과음이 활성화되었습니다.' : '🔇 알림 효과음이 무음 처리되었습니다.', 'success');
  } else if (type === 'vibrate') {
    AppState_NotificationSettings.vibrate = checked;
    localStorage.setItem('alert_vibrate', String(checked));
    showToast(checked ? '📳 알림 진동이 활성화되었습니다.' : '📳 알림 진동이 꺼졌습니다.', 'success');
  }
}
window.toggleNotificationSetting = toggleNotificationSetting;

// ==========================================================================
// [V0.8 NEW] 버전 오토 캐시 클리너 & 어드민 4중 보안 데몬 탑재
// ==========================================================================
const CURRENT_VERSION = '1.2';
const APP_RELEASE_VERSION = 'v1.6.4'; // 기획 릴리즈 버전 명칭

function checkAppVersionAndCleanCache() {
  const localVer = localStorage.getItem('local_app_version');
  if (localVer !== CURRENT_VERSION) {
    console.log(`🚨 [AutoClean] 버전이 ${localVer || '이전'}에서 ${CURRENT_VERSION}로 변경되었습니다. 일반 회원 및 웨이터 데이터를 자동 청소합니다.`);
    
    // 스폰서 mock_fs_sponsors 캐시는 보존하고 나머지 삭제
    const sponsorCache = localStorage.getItem('mock_fs_sponsors');
    
    // 로컬스토리지 완전 청소
    const keysToRemove = [
      'mock_fs_users',
      'mock_fs_waiters',
      'mock_fs_chats',
      'mock_fs_bookings',
      'mock_fs_notifications',
      'mock_fs_reports',
      'mock_fs_credit_logs',
      'mock_fs_posts',
      'mock_auth_user',
      'mock_auth_users'
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));
    
    // 스폰서 보존 복구
    if (sponsorCache) {
      localStorage.setItem('mock_fs_sponsors', sponsorCache);
    }
    
    // 로컬 버전 기록 갱신
    localStorage.setItem('local_app_version', CURRENT_VERSION);
    
    // 서버 DB 리셋 요청 (백엔드 리셋 동기화)
    fetch('/api/db/clear-all', { method: 'POST' })
      .then(res => {
        if (res.ok) {
          console.log("☁️ [CloudSync] 서버 측 데이터베이스도 동시 완전 청소 성공!");
        }
      }).catch(err => {
        console.warn("☁️ [CloudSync] 서버 측 데이터 초기화 실패:", err.message);
      });
  }
}

// 어드민 3분 비활동 자동 잠금 데몬
let adminActivityTimeout = null;

function startAdminActivityDaemon() {
  stopAdminActivityDaemon();
  console.log("🛡️ [Security] 어드민 3분 비활동 자동 잠금 데몬 작동 시작.");
  
  const resetTimer = () => {
    if (adminActivityTimeout) clearTimeout(adminActivityTimeout);
    adminActivityTimeout = setTimeout(() => {
      console.log("🚨 [Security] 3분간 미활동 감지 - 어드민 세션 자동 폐기");
      sessionStorage.removeItem('admin_verified');
      showToast('🔒 3분간 활동이 없어 보안을 위해 어드민 세션이 자동 잠금되었습니다.', 'warning');
      navigateTo('home');
    }, 180000); // 3분 = 180,000ms
  };

  // 마우스 움직임, 터치, 키보드, 클릭 활동 시 타이머를 리셋
  window.addEventListener('mousemove', resetTimer);
  window.addEventListener('mousedown', resetTimer);
  window.addEventListener('keypress', resetTimer);
  window.addEventListener('touchstart', resetTimer);
  window.addEventListener('scroll', resetTimer);

  // 전역 리셋 바인딩 보관
  window.currentAdminResetTimer = resetTimer;
  resetTimer(); // 기동 즉시 최초 실행
}

function stopAdminActivityDaemon() {
  if (adminActivityTimeout) {
    clearTimeout(adminActivityTimeout);
    adminActivityTimeout = null;
  }
  const resetTimer = window.currentAdminResetTimer;
  if (resetTimer) {
    window.removeEventListener('mousemove', resetTimer);
    window.removeEventListener('mousedown', resetTimer);
    window.removeEventListener('keypress', resetTimer);
    window.removeEventListener('touchstart', resetTimer);
    window.removeEventListener('scroll', resetTimer);
    window.currentAdminResetTimer = null;
  }
}

let db = null;
let auth = null;
let isFirebaseConnected = false;

// 실시간 동기화 리스너 참조 보관소
const seenNotificationIds = new Set();
let unsubUser = null;
let unsubBookings = null;
let unsubChats = null;
let unsubNotifications = null;
let unsubAllUsers = null;
let unsubWaiters = null;
let unsubReports = null;
let unsubCreditLogs = null;
let unsubSponsors = null;

// ⏱️ [Live Chat Polling] 0.5초 하이브리드 자동 동기화 타이머 참조 변수
let liveChatPollingInterval = null;

// ==========================================================================
// 2.0. 로컬 스토리지 기반 Firestore 모의 에뮬레이터 (Mock Firestore Builder)
// ==========================================================================
function createMockFirestore() {
  // 중앙 서버 실시간 동기화 인메모리 데이터 캐시
  const memDb = {
    users: [],
    waiters: [],
    chats: [],
    bookings: [],
    sponsors: [],
    notifications: [],
    reports: [],
    credit_logs: [],
    posts: []
  };

  const listeners = {};

  // 서버로부터 컬렉션 전체를 1초 만에 깔끔하게 가져와 메모리 캐시 및 등록 리스너 전역 격리 트리거
  const syncCollectionFromServer = async (collection) => {
    try {
      const res = await fetch(`/api/db/${collection}`);
      if (res.ok) {
        const data = await res.json();
        memDb[collection] = data;
        
        // 1. 컬렉션 전체 리스너 트리거
        if (listeners[collection]) {
          listeners[collection].forEach(cb => cb({
            docs: data.map(d => ({
              id: d.uid || d.id,
              data: () => d
            }))
          }));
        }

        // 2. 개별 문서(Doc) 리스너 트리거
        data.forEach(item => {
          const docId = item.uid || item.id;
          const docKey = `${collection}_doc_${docId}`;
          if (listeners[docKey]) {
            listeners[docKey].forEach(cb => cb({
              exists: true,
              data: () => item,
              id: docId
            }));
          }
        });
      }
    } catch (err) {
      console.warn(`⚠️ [CloudSync] 컬렉션 [${collection}] 패치 에러:`, err.message);
    }
  };

  const instance = {
    // SSE 신호 감지 즉시 백그라운드 서버에서 fresh 데이터를 가져와 화면을 리액티브하게 리렌더링
    triggerFromSse: async (key) => {
      console.log(`⚡ [CloudSync-SSE] 중앙 집중 동기화 발동 [${key}] - 즉시 패치 및 화면 갱신!`);
      await syncCollectionFromServer(key);
    },
    collection: (name) => ({
      doc: (id) => ({
        set: async (data) => {
          // 로컬이 아닌 서버에 즉각적 트랜잭션 전송
          const res = await fetch(`/api/db/${name}/${id}`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-Active-Session-Id': localStorage.getItem('mock_session_id') || '',
              'X-User-Uid': AppState.currentUser ? String(AppState.currentUser.uid) : ''
            },
            body: JSON.stringify(data)
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            if (res.status === 403 && errData.error === 'session_expired') {
              showToast('⚠️ ' + (errData.message || '세션이 만료되었습니다.'), 'danger', 8000);
              logout();
              return Promise.reject(new Error('session_expired'));
            }
          }
          if (res.ok) {
            await syncCollectionFromServer(name);
          }
          return Promise.resolve();
        },
        update: async (data) => {
          // 로컬이 아닌 서버에 즉각적 트랜잭션 전송
          const res = await fetch(`/api/db/${name}/${id}`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-Active-Session-Id': localStorage.getItem('mock_session_id') || '',
              'X-User-Uid': AppState.currentUser ? String(AppState.currentUser.uid) : ''
            },
            body: JSON.stringify(data)
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            if (res.status === 403 && errData.error === 'session_expired') {
              showToast('⚠️ ' + (errData.message || '세션이 만료되었습니다.'), 'danger', 8000);
              logout();
              return Promise.reject(new Error('session_expired'));
            }
          }
          if (res.ok) {
            await syncCollectionFromServer(name);
          }
          return Promise.resolve();
        },
        delete: async () => {
          const res = await fetch(`/api/db/${name}/${id}`, { 
            method: 'DELETE',
            headers: {
              'X-Active-Session-Id': localStorage.getItem('mock_session_id') || '',
              'X-User-Uid': AppState.currentUser ? String(AppState.currentUser.uid) : ''
            }
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            if (res.status === 403 && errData.error === 'session_expired') {
              showToast('⚠️ ' + (errData.message || '세션이 만료되었습니다.'), 'danger', 8000);
              logout();
              return Promise.reject(new Error('session_expired'));
            }
          }
          if (res.ok) {
            await syncCollectionFromServer(name);
          }
          return Promise.resolve();
        },
        get: async () => {
          try {
            const res = await fetch(`/api/db/${name}/${id}`);
            if (res.ok) {
              const serverData = await res.json();
              return Promise.resolve({
                exists: true,
                data: () => serverData
              });
            }
          } catch (e) {}
          return Promise.resolve({ exists: false, data: () => null });
        },
        onSnapshot: (callback) => {
          const docKey = `${name}_doc_${id}`;
          if (!listeners[docKey]) listeners[docKey] = [];
          listeners[docKey].push(callback);
          
          // 등록 즉시 최초 서버 DB에서 패치
          syncCollectionFromServer(name);

          return () => {
            listeners[docKey] = listeners[docKey].filter(cb => cb !== callback);
          };
        }
      }),
      add: async (data) => {
        const res = await fetch(`/api/db/${name}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Active-Session-Id': localStorage.getItem('mock_session_id') || '',
            'X-User-Uid': AppState.currentUser ? String(AppState.currentUser.uid) : ''
          },
          body: JSON.stringify(data)
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 403 && errData.error === 'session_expired') {
            showToast('⚠️ ' + (errData.message || '세션이 만료되었습니다.'), 'danger', 8000);
            logout();
            return Promise.reject(new Error('session_expired'));
          }
        }
        if (res.ok) {
          const result = await res.json();
          await syncCollectionFromServer(name);
          return Promise.resolve({ id: result.data.id });
        }
        return Promise.resolve({ id: `doc_${Date.now()}` });
      },
      onSnapshot: (callback) => {
        if (!listeners[name]) listeners[name] = [];
        listeners[name].push(callback);
        
        // 등록 즉시 최초 서버 DB에서 패치
        syncCollectionFromServer(name);

        return () => {
          listeners[name] = listeners[name].filter(cb => cb !== callback);
        };
      },
      get: async () => {
        try {
          const res = await fetch(`/api/db/${name}`);
          if (res.ok) {
            const serverData = await res.json();
            return Promise.resolve({
              docs: serverData.map(d => ({
                id: d.uid || d.id,
                data: () => d
              }))
            });
          }
        } catch (e) {}
        return Promise.resolve({ docs: [] });
      }
    })
  };

  window.mockFirestoreInstance = instance;
  return instance;
}

// 로컬 계정 에뮬레이터 (Mock Auth Builder)
function createMockAuth() {
  let currentUser = JSON.parse(localStorage.getItem('mock_auth_user')) || null;
  const listeners = [];
  const trigger = () => {
    listeners.forEach(cb => cb(currentUser));
  };
  return {
    onAuthStateChanged: (callback) => {
      listeners.push(callback);
      setTimeout(() => callback(currentUser), 50);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },
    createUserWithEmailAndPassword: (email) => {
      const users = JSON.parse(localStorage.getItem('mock_auth_users')) || [];
      if (users.find(u => u.email === email)) {
        return Promise.reject(new Error("이미 가입된 계정(이메일)입니다."));
      }
      const newUser = { uid: 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5), email };
      users.push(newUser);
      localStorage.setItem('mock_auth_users', JSON.stringify(users));
      currentUser = newUser;
      localStorage.setItem('mock_auth_user', JSON.stringify(currentUser));
      trigger();
      return Promise.resolve({ user: newUser });
    },
    signInWithEmailAndPassword: (email) => {
      const users = JSON.parse(localStorage.getItem('mock_auth_users')) || [];
      const user = users.find(u => u.email === email);
      if (!user) {
        return Promise.reject(new Error("존재하지 않는 테스터 이메일입니다. 퀵가입을 사용하세요."));
      }
      currentUser = { uid: user.uid, email: user.email };
      localStorage.setItem('mock_auth_user', JSON.stringify(currentUser));
      trigger();
      return Promise.resolve({ user: currentUser });
    },
    signOut: () => {
      currentUser = null;
      localStorage.removeItem('mock_auth_user');
      trigger();
      return Promise.resolve();
    }
  };
}

// 실시간 SSE 스트림 연동
function initServerSync() {
  if (typeof EventSource === 'undefined') return;
  
  console.log("🔌 [CloudSync] 백엔드 실시간 SSE 동기화 채널을 개방합니다...");
  const source = new EventSource('/api/stream');
  
  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.action === 'welcome') return;
      
      const { collection, data } = payload;
      if (collection && data) {
        localStorage.setItem(`mock_fs_${collection}`, JSON.stringify(data));
        if (window.mockFirestoreInstance) {
          window.mockFirestoreInstance.triggerFromSse(collection);
        }
      }
    } catch (err) {
      console.error("❌ [CloudSync] SSE 구문 에러:", err);
    }
  };

  // 🔌 [Auto-Reconnect] 소켓 연결이 순단(맥북 기상, 네트워크 단절 등)으로 유실되면 1.5초 후 실시간 자동 재접속을 감행합니다!
  source.onerror = (err) => {
    console.warn("⚠️ [CloudSync] SSE 백엔드 채널이 차단되었습니다. 1.5초 후 자동 복구 재연결 데몬을 기동합니다...");
    source.close();
    setTimeout(() => {
      initServerSync();
    }, 1500);
  };
}

// 하이브리드 커넥션 마운트
try {
  // 🌟 사용자 10인 실시간 QA 및 안전한 로컬 독립 테스트를 위해 로컬 QA 에뮬레이터 모드를 기본값으로 강제 실행합니다.
  throw new Error("Local Emulator Mode");

  if (typeof firebase !== 'undefined' && !firebaseConfig.apiKey.startsWith("YOUR_")) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    isFirebaseConnected = true;
    console.log("🔥 [Firebase] 퍼블릭 Cloud DB 연동 가동 완료!");
  } else {
    throw new Error("Local Emulator Mode");
  }
} catch (e) {
  console.warn("⚠️ [Firebase] 모의 로컬 샌드박스 또는 QA 에뮬레이터 모드로 기동합니다.");
  window.firebase = {
    firestore: {
      FieldValue: {
        increment: (val) => ({ __type: 'FieldValue.increment', value: val }),
        arrayUnion: (...vals) => ({ __type: 'FieldValue.arrayUnion', values: vals })
      }
    }
  };
  db = createMockFirestore();
  auth = createMockAuth();
  isFirebaseConnected = false;
  initServerSync();
}

// ==========================================================================
// 3.0. 전국 통합 나이트클럽 지역 및 비즈니스 데이터 (Global Club Data)
// ==========================================================================
const RegionData = {
  '대전': {
    '중구': ['한국관나이트', '나이트클럽세븐', '찬스나이트'],
    '동구': ['으뜸원나이트'],
    '서구': ['등록된 업소 없음'],
    '유성구': ['등록된 업소 없음']
  },
  '서울': { 
    '강남구': ['강남 아레나', '강남 페이스'], 
    '마포구(홍대)': ['홍대 아우라', '홍대 싱크홀'] 
  },
  '부산': { 
    '해운대구': ['해운대 벨포트', '해운대 옥타곤'], 
    '부산진구(서면)': ['서면 그리드', '서면 런투유'] 
  }
};

const AppState = {
  currentPage: 'home', // 'home' | 'signup' | 'radar' | 'booking' | 'talk' | 'profile' | 'board' | 'admin'
  currentUser: null,
  userRole: 'player',  // 'player' (선수) | 'coach' (코치)
  credits: 1000,
  
  // 전국 드롭다운 기본값
  selectedRegion: { city: '대전', district: '중구', club: '한국관나이트' },
  
  // 모의 GPS 조작용 (중심부와의 모의 거리, m 단위)
  currentGPSDistance: 30, // 30m 기본값
  
  // 실시간 상태 캐시들
  waiters: [],
  radarUsers: [],
  bookings: [],
  notifications: [],
  chatRooms: [],
  posts: [],
  reports: [],
  creditLogs: [],
  sponsors: [],
  activeChatRoomId: null // 💬 [Live Chat] 현재 열려 있는 1:1 대화방 ID 보존용 필드!
};

// ==========================================================================
// 4.0. 실시간 데이터 영구 동기화 파이프라인 (Real-time Core Sync Pipeline)
// ==========================================================================

// 🌟 비로그인 게스트 상태에서도 실시간 씽크가 유지되어야 하는 공용 글로벌 동기화 채널
function bindGlobalSync() {
  if (unsubWaiters) unsubWaiters();
  if (unsubSponsors) unsubSponsors();
  if (unsubAllUsers) unsubAllUsers();

  console.log("🔗 [Sync] 실시간 글로벌 공용 데이터 동기화 채널이 개방되었습니다.");

  // 1. 실시간 웨이터 동기화
  unsubWaiters = db.collection('waiters').onSnapshot((snapshot) => {
    const list = [];
    snapshot.docs.forEach(doc => {
      list.push({ id: doc.id, uid: doc.id, ...doc.data() });
    });
    
    // 🌟 [V0.8.1 GPS] 내 좌표가 존재하면 하버사인 공식으로 실시간 동적 웨이터 거리 계산 주입!
    const myLat = (AppState.currentUser && AppState.currentUser.lat) || (36.3289 + (AppState.currentGPSDistance * 0.000009));
    const myLng = (AppState.currentUser && AppState.currentUser.lng) || 127.4246;

    list.forEach(w => {
      if (w.lat && w.lng) {
        w.distance = Math.round(calculateDistance(
          myLat, myLng,
          w.lat, w.lng
        ));
      } else {
        // 웨이터에 기본 좌표가 없는 임의의 테스팅을 위해 20m~50m 사이 랜덤 매핑
        w.distance = Math.floor(Math.random() * 30) + 20;
      }
    });
    
    AppState.waiters = list.filter(w => w.isApproved && w.status === 'active')
                           .sort((a, b) => (Number(a.rank) || 99) - (Number(b.rank) || 99));
    
    if (AppState.currentPage === 'home' || AppState.currentPage === 'booking') {
      renderPage();
    }
  });

  // 2. 실시간 스폰서 광고 동기화
  unsubSponsors = db.collection('sponsors').onSnapshot((snapshot) => {
    const list = [];
    snapshot.docs.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() });
    });
    AppState.sponsors = list.sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
    if (AppState.currentPage === 'home') {
      renderPage();
    } else if (AppState.currentPage === 'admin' && activeAdminTab === 'sponsors') {
      renderAdminSponsors();
    }
  });

  // 3. 실시간 전체 회원 동기화 (어드민 대시보드 및 레이더 유저 매핑용)
  unsubAllUsers = db.collection('users').onSnapshot((snapshot) => {
    const list = [];
    const cache = {};
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      list.push({ uid: doc.id, ...data });
      cache[doc.id] = { uid: doc.id, ...data };
    });
    AppState.allUsersCache = cache;
    
    // 🌟 [V0.8.1 GPS] 내 좌표가 존재하면 하버사인 공식으로 실시간 동적 상대방 거리 계산 주입! (꽃분이 <-> 지노바디 10m 매핑)
    const myLat = (AppState.currentUser && AppState.currentUser.lat) || (36.3289 + (AppState.currentGPSDistance * 0.000009));
    const myLng = (AppState.currentUser && AppState.currentUser.lng) || 127.4246;

    list.forEach(u => {
      if (u.lat && u.lng) {
        u.distance = Math.round(calculateDistance(
          myLat, myLng,
          u.lat, u.lng
        ));
      } else {
        u.distance = Math.floor(Math.random() * 40) + 10; // 기본 10m~50m 사이 랜덤 매핑
      }
    });
    
    // GPS 레이더용 모의 선수 필터링
    AppState.radarUsers = list.filter(u => u.role === 'player' && (!AppState.currentUser || u.uid !== AppState.currentUser.uid));
    
    if (AppState.currentPage === 'radar') {
      renderRadarScreen();
    } else if (AppState.currentPage === 'admin') {
      renderAdminMetrics();
      if (activeAdminTab === 'users') renderAdminUsers();
      else if (activeAdminTab === 'waiters') renderAdminWaiters();
    }
  });

  // 4. 실시간 수기 게시글 동기화
  db.collection('posts').onSnapshot((snapshot) => {
    const list = [];
    snapshot.docs.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() });
    });
    AppState.posts = list.sort((a, b) => b.id.localeCompare(a.id));
    if (AppState.currentPage === 'board') {
      renderBoardScreen();
    }
  });
}

// Uid 기반 실시간 닉네임/아바타 캐시 매핑 헬퍼 함수 (V1.5.7 마이너 핫픽스: 100% 에러 예방 철통 방어 장착)
function getUserProfileByUid(uid) {
  try {
    if (!uid) {
      return { 
        nickname: 'VVIP 회원', 
        avatar: KoreanAvatars.vipWoman, 
        role: 'player',
        gender: '남'
      };
    }

    // 1. 현재 로그인 사용자 본인 매핑
    if (AppState.currentUser && AppState.currentUser.uid && String(AppState.currentUser.uid) === String(uid)) {
      return { 
        nickname: AppState.currentUser.nickname || 'VVIP 회원', 
        avatar: AppState.currentUser.avatar || KoreanAvatars.me, 
        role: AppState.currentUser.role || 'player',
        gender: AppState.currentUser.gender || '남'
      };
    }

    // 2. 로컬 스토리지 캐시 최신 데이터 직접 검색 (승인 대기 웨이터 등 매핑 누락 전격 방어)
    const mockFsUsersStr = localStorage.getItem('mock_fs_users');
    if (mockFsUsersStr) {
      const allUsersList = JSON.parse(mockFsUsersStr) || [];
      const foundUser = allUsersList.find(u => u && (String(u.uid) === String(uid) || String(u.id) === String(uid)));
      if (foundUser) {
        return {
          nickname: foundUser.nickname || foundUser.name || 'VVIP 회원',
          avatar: foundUser.avatar || (foundUser.role === 'coach' ? './assets/korean_waiter_james.png' : './assets/korean_man_user.png'),
          role: foundUser.role || 'player',
          gender: foundUser.gender || '남'
        };
      }
    }

    // 3. 레이더 유저(선수) 목록에서 조회
    if (AppState.radarUsers && Array.isArray(AppState.radarUsers)) {
      const radUser = AppState.radarUsers.find(u => u && String(u.uid) === String(uid));
      if (radUser) {
        return { 
          nickname: radUser.nickname || 'VVIP 회원', 
          avatar: radUser.avatar || KoreanAvatars.me, 
          role: 'player',
          gender: radUser.gender || '남'
        };
      }
    }

    // 4. 웨이터 목록에서 조회 (isApproved 인 활성 코치)
    if (AppState.waiters && Array.isArray(AppState.waiters)) {
      const waiter = AppState.waiters.find(w => w && String(w.uid) === String(uid));
      if (waiter) {
        return { 
          nickname: waiter.nickname || 'VVIP 회원', 
          avatar: waiter.avatar || KoreanAvatars.james, 
          role: 'coach',
          gender: waiter.gender || '남'
        };
      }
    }
  } catch (err) {
    console.error("⚠️ [UserProfileByUid] 프로필 매핑 중 예외 발생:", err);
  }

  // 폴백 기본값 (어떤 상황에서도 무조건 리턴 보장)
  return { 
    nickname: 'VVIP 회원', 
    avatar: KoreanAvatars.vipWoman, 
    role: 'player',
    gender: '남'
  };
}
window.getUserProfileByUid = getUserProfileByUid;

function bindRealtimeSync(userUid) {
  if (unsubUser) unsubUser();
  if (unsubBookings) unsubBookings();
  if (unsubChats) unsubChats();
  if (unsubNotifications) unsubNotifications();
  if (unsubReports) unsubReports();
  if (unsubCreditLogs) unsubCreditLogs();

  console.log("🔗 [Sync] 로그인 회원 전용 실시간 데이터 파이프라인 가동 완료. UID:", userUid);

  // 글로벌 공용 동기화 채널 가동
  bindGlobalSync();

  // 4.1. 유저 프로필 동기화
  unsubUser = db.collection('users').doc(userUid).onSnapshot((doc) => {
    if (doc.exists) {
      const userData = doc.data();
      
      // 🛡️ [V0.8.1 중복로그인 킥] 실시간 기기 충돌 감지 및 세션 강제 만료 (Session Kick)
      const localSessionId = localStorage.getItem('mock_session_id');
      if (userData.activeSessionId && localSessionId && userData.activeSessionId !== localSessionId) {
        console.warn("🚨 [Security] 중복 로그인 감지 - 다른 단말기에서 로그인되었습니다. 강제 로그아웃 튕김 가동!");
        showToast('🚨 [중복 로그인 감지] 다른 스마트폰이나 브라우저에서 동일 계정으로 로그인되어 안전을 위해 자동 로그아웃됩니다.', 'danger', 10000);
        logout();
        return;
      }

      AppState.currentUser = { uid: userUid, ...userData };
      AppState.credits = Number(userData.credits) || 0;
      AppState.userRole = userData.role || 'player';
      
      updateHeaderAndNav();
      
      // 승인 대기 중이고 코치라면 대기 화면을 보여줌
      if (AppState.userRole === 'coach' && !userData.isApproved) {
        renderWaitingScreen();
      } else if (AppState.currentPage === 'signup' || AppState.currentPage === 'waiting') {
        // 승인이 완료되었거나 일반 유저면 홈으로 강제 진입
        AppState.currentPage = 'home';
        renderPage();
      } else {
        renderPage();
      }
    }
  });

  // 4.3. 실시간 예약 동기화
  unsubBookings = db.collection('bookings').onSnapshot((snapshot) => {
    const list = [];
    snapshot.docs.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() });
    });
    
    if (AppState.currentUser) {
      const uid = AppState.currentUser.uid;
      const nick = AppState.currentUser.nickname;
      // 내가 신청자이거나 내가 담당 코치인 내역만 필터링
      AppState.bookings = list.filter(b => 
        String(b.clientUid) === String(uid) || 
        b.clientName === nick || 
        String(b.waiterId) === String(uid) || 
        b.waiterName === nick
      ).sort((a, b) => b.id.localeCompare(a.id));
    }
    
    if (AppState.currentPage === 'booking') {
      renderMyBookings();
    }
  });

  // 🔔 [V0.8.1-Hotfix2] 메시지 카운트 누적 캐시 변수
  let lastChatsTotalMsgCount = -1;

  // 4.4. 실시간 대화방 동기화
  unsubChats = db.collection('chats').onSnapshot((snapshot) => {
    const list = [];
    snapshot.docs.forEach(doc => {
      const room = doc.data();
      if (room.participants && room.participants.map(String).includes(String(userUid))) {
        const otherUid = room.participants.map(String).find(p => p !== String(userUid));
        list.push({
          id: doc.id,
          name: room.name || 'VVIP 회원',
          lastMessage: room.lastMessage || '대화가 시작되었습니다.',
          time: '방금 전',
          avatar: room.avatar || KoreanAvatars.vipWoman,
          targetRole: room.targetRole || 'player',
          targetId: otherUid || room.targetId,
          messages: room.messages || [],
          timeMs: room.timeMs || Date.now(),
          status: room.status || 'pending',
          senderUid: room.senderUid,
          leftUsers: room.leftUsers || []
        });
      }
    });
    
    AppState.chatRooms = list.sort((a, b) => b.timeMs - a.timeMs);

    // 🔔 [V0.8.1-Hotfix2] 카카오톡 스타일 신규 메시지 수신 효과음/진동 반응 트리거
    let currentTotalMsgCount = 0;
    AppState.chatRooms.forEach(r => {
      currentTotalMsgCount += r.messages.length;
    });

    if (lastChatsTotalMsgCount !== -1 && currentTotalMsgCount > lastChatsTotalMsgCount) {
      const lastRoom = AppState.chatRooms.sort((a, b) => b.timeMs - a.timeMs)[0];
      const lastMsg = lastRoom && lastRoom.messages[lastRoom.messages.length - 1];
      if (lastMsg && String(lastMsg.sender) !== String(userUid)) {
        console.log("🔔 [Message Alarm] 신규 실시간 메시지 수신 감지 - 띵동 효과음 가동!");
        playAlertReaction();
      }
    }
    lastChatsTotalMsgCount = currentTotalMsgCount;
    
    // 💬 [Live Read Synchronizer]
    // 내가 현재 특정 대화방을 보고 있는 찰나라면, 실시간으로 씽크된 메시지 중 상대방 메시지들을 자동으로 즉시 읽음 처리해 줍니다!
    if (AppState.activeChatRoomId) {
      markChatMessagesAsRead(AppState.activeChatRoomId);
    }

    updateHeaderAndNav(); // 🌟 하이브리드 알림 배지 실시간 정합성 동기화
    
    if (AppState.currentPage === 'talk') {
      renderTalkScreen();
    }
    
    // 💬 [Live Chat Demon] 사장님이 현재 1:1 대화방 모달을 열어놓고 있는 도중이라면, 
    // SSE로 수신된 실시간 최신 메시지를 바탕으로 무새로고침 0.1초 즉시 말풍선을 뽈칵! 렌더링하고 하단 스크롤시킵니다!
    if (AppState.activeChatRoomId) {
      console.log("💬 [Live Chat Demon] 활성 대화방 실시간 수신 감지 - 화면 0.1초 즉시 리액티브 렌더링 발동:", AppState.activeChatRoomId);
      renderChatMessages(AppState.activeChatRoomId);
    }
  });

  // 4.5. 실시간 알림 내역 동기화
  unsubNotifications = db.collection('notifications').onSnapshot((snapshot) => {
    const list = [];
    snapshot.docs.forEach(doc => {
      const notif = doc.data();
      // 전체 방송이거나 나에게 직접 타겟팅된 알림만 감지
      if (!notif.targetUid || String(notif.targetUid) === String(userUid)) {
        list.push({ id: doc.id, ...notif });
      }
    });
    
    // 🔔 [실시간 인앱 푸시 Toast 엔진]
    // 최초 씽크 시점에는 기존 알림 팝업 방지를 위해 기존 ID들만 Seen으로 캐싱 처리하고 통과합니다.
    const isFirstLoad = seenNotificationIds.size === 0 && AppState.notifications.length === 0;
    
    list.forEach(n => {
      // 읽지 않은 새 알림이 들어오면 실시간 푸시 Toast 팝업을 0.1초 만에 개방합니다!
      if (!n.isRead && !seenNotificationIds.has(n.id)) {
        if (!isFirstLoad) {
          console.log("🔔 [Live Push] 실시간 신규 알림 감지! 팝업 가동 ID:", n.id);
          showToast(`🔔 [실시간 알림]\n${n.title}\n👉 ${n.body}`, 'success', 8000);
          playAlertReaction(); // 🌟 [V0.8.1-Hotfix2] 알림 도킹 시 소리/진동 반응 울리기!
        }
        seenNotificationIds.add(n.id);
      }
    });
    
    AppState.notifications = list.sort((a, b) => b.id.localeCompare(a.id));
    
    updateHeaderAndNav(); // 🌟 하이브리드 알림 배지 실시간 정합성 동기화
    
    if (AppState.currentPage === 'notifications') {
      renderNotificationsScreen();
    }
  });

  // 4.7. 실시간 크라우드소싱 제보 동기화
  unsubReports = db.collection('reports').onSnapshot((snapshot) => {
    const list = [];
    snapshot.docs.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() });
    });
    AppState.reports = list.sort((a, b) => b.id.localeCompare(a.id));
    if (AppState.currentPage === 'admin' && activeAdminTab === 'reports') {
      renderAdminReports();
    }
  });

  // 4.8. 실시간 포인트 지급 금융 로그 동기화
  unsubCreditLogs = db.collection('credit_logs').onSnapshot((snapshot) => {
    const list = [];
    snapshot.docs.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() });
    });
    AppState.creditLogs = list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (AppState.currentPage === 'admin' && activeAdminTab === 'logs') {
      renderAdminLogs();
    }
  });

}

// 실시간 싱크 해제 (로그아웃 시 안전장치)
function disconnectRealtimeSync() {
  if (unsubUser) unsubUser();
  if (unsubBookings) unsubBookings();
  if (unsubChats) unsubChats();
  if (unsubNotifications) unsubNotifications();
  if (unsubAllUsers) unsubAllUsers();
  if (unsubWaiters) unsubWaiters();
  if (unsubReports) unsubReports();
  if (unsubCreditLogs) unsubCreditLogs();
  if (unsubSponsors) unsubSponsors();
  
  AppState.currentUser = null;
  AppState.bookings = [];
  AppState.chatRooms = [];
  AppState.notifications = [];
}

// ==========================================================================
// 5.0. Haversine GPS 실시간 거리 계산 및 지연 배터리 제어 (Throttle GPS Upload)
// ==========================================================================
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // 지구 반경 (m)
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // m 단위
}

// 모바일 배터리 보존용 GPS Throttle 상태값
let lastGpsUploadTime = 0;
let lastGpsDistanceVal = 0;

// GPS 슬라이더 조절 시 배터리 세이빙 및 실시간 갱신 처리
function handleGpsSliderChange(val) {
  const distance = Number(val);
  document.getElementById('gps-distance-text').innerText = `${distance}m`;
  AppState.currentGPSDistance = distance;
  
  const now = Date.now();
  const timeDiff = now - lastGpsUploadTime;
  const distDiff = Math.abs(distance - lastGpsDistanceVal);
  
  // 3050 실운영 배터리 보존 필터링 (1분 미만 또는 50m 이하 변화 시 업로드 방지)
  // 단, 내부 QA 테스터 모드이므로 콘솔에 로그만 찍고, 즉각적인 화면 매핑을 위해 UI는 즉시 동기화하도록 유도합니다.
  if (timeDiff < 60000 && distDiff <= 50) {
    console.log(`🔋 [GPS Throttle] 미세 위치 무시 (배터리 방전 방지 작동 중): ${distDiff}m 이동, ${Math.round(timeDiff/1000)}초 전 전송`);
  }
  
  lastGpsUploadTime = now;
  lastGpsDistanceVal = distance;
  
  // 내 좌표 강제 모킹 계산 (한국관나이트 기준 offset)
  if (AppState.currentUser) {
    db.collection('users').doc(AppState.currentUser.uid).update({
      lat: 36.3289 + (distance * 0.000009), // 북쪽으로 거리만큼 오프셋
      lng: 127.4246,
      distance: distance,
      lastActiveAt: Date.now() // 활동 시간 갱신
    });
  }
}

// ==========================================================================
// 6.0. 쫀득한 네비게이션 및 동적 뷰 마운트 라우팅 (Single Page Routing Engine)
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // 🌟 앱 전체 타이틀 동적 버전 바인딩
  const headerAppTitle = document.getElementById('header-app-title');
  if (headerAppTitle) {
    headerAppTitle.innerText = `CLUB RADER 2 (${APP_RELEASE_VERSION})`;
  }
  const sidebarAppTitle = document.getElementById('sidebar-app-title');
  if (sidebarAppTitle) {
    sidebarAppTitle.innerText = `CLUB RADER 2 (${APP_RELEASE_VERSION})`;
  }

  // 🌟 [V0.8 AutoClean] 버전 감지 즉시 로컬 캐시/서버 청소 개시
  checkAppVersionAndCleanCache();
  
  // 🔒 [F5 새로고침 복구 방어막]
  // 세션 스토리지에 이전에 보고 있던 비활성 페이지 세션이 남아 있다면 강제로 AppState에 복원 주입합니다!
  const lastActivePage = sessionStorage.getItem('current_active_page');
  if (lastActivePage) {
    console.log("🔒 [Restore Session] 새로고침 복구 감지 - 이전 페이지 복귀:", lastActivePage);
    AppState.currentPage = lastActivePage;
  }
  
  // 하단 탭바 바인딩
  const tabs = document.querySelectorAll('#bottom-tab-bar a');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const navTarget = tab.getAttribute('data-nav');
      
      // 미가입 비로그인 상태 가드 (홈 및 가입 탭은 락을 걸지 않고 자유 이동 허용)
      if (!AppState.currentUser && navTarget !== 'home' && navTarget !== 'signup') {
        showConfirm('해당 기능은 회원 전용 서비스입니다.\n\n[회원가입 및 로그인]을 완료하고 실시간 레이더 매칭과 예약을 시작해 보세요! ⚡', () => {
          navigateTo('signup');
        });
        return;
      }
      
      // 코치 승인 대기중 락
      if (AppState.currentUser && AppState.userRole === 'coach' && !AppState.currentUser.isApproved && navTarget !== 'home' && navTarget !== 'signup') {
        showToast('🔒 아직 영업 승인 대기 중입니다. 관리자의 실시간 승인 후 활성화됩니다!', 'warning');
        return;
      }

      navigateTo(navTarget);
    });
  });

  // Auth 상태 변화 감지 시작 (하이브리드 세션 스왑 완벽 방어 장치)
  auth.onAuthStateChanged((user) => {
    // 1. 만약 로컬 스토리지에 모크 퀵스왑 세션이 강제 주입되어 있다면, 실제 Firebase 비로그인 상태이더라도 강제로 해당 모크 세션을 살려둡니다!
    const mockSession = JSON.parse(localStorage.getItem('mock_auth_user'));
    if (mockSession) {
      console.log("⚡ [Hybrid Gate] 모크 퀵스왑 세션 유지 감지:", mockSession.uid);
      bindRealtimeSync(mockSession.uid);
      return;
    }

    if (user) {
      bindRealtimeSync(user.uid);
    } else {
      disconnectRealtimeSync();
      bindGlobalSync(); // 🌟 비로그인 상태에서도 스폰서 광고 및 웨이터 정보는 항상 씽크가 돌아야 합니다!
      
      // 세션 복구가 활성화되어 있다면 home으로 보내지 않습니다!
      const lastActivePage = sessionStorage.getItem('current_active_page');
      if (lastActivePage) {
        AppState.currentPage = lastActivePage;
      } else {
        if (AppState.currentPage !== 'admin' && AppState.currentPage !== 'signup') {
          AppState.currentPage = 'home';
        }
      }
      renderPage();
    }
  });
});

// 🛡️ VVIP 관리자 패스워드 보안 팝업 헬퍼들
function openAdminPasswordModal() {
  const modal = document.getElementById('admin-password-modal');
  if (modal) {
    document.getElementById('admin-pw-input').value = '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeAdminPasswordModal() {
  const modal = document.getElementById('admin-password-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function submitAdminPasswordVerification(e) {
  e.preventDefault();
  const pwInput = document.getElementById('admin-pw-input');
  if (!pwInput) return;
  const pw = pwInput.value.trim();
  
  if (pw === '9121729') {
    sessionStorage.setItem('admin_verified', 'true');
    showToast('🛡️ VVIP 관리자 보안 인증에 성공하였습니다!', 'success');
    closeAdminPasswordModal();
    navigateTo('admin'); // 최종 진입
  } else {
    showToast('❌ 비밀번호가 일치하지 않습니다. 관리자 권한이 거부되었습니다.', 'danger');
    pwInput.value = '';
    closeAdminPasswordModal();
    // 홈으로 복귀
    navigateTo('home');
  }
}

window.submitAdminPasswordVerification = submitAdminPasswordVerification;
window.triggerMockSms = triggerMockSms;
window.verifySmsCode = verifySmsCode;

// 글로벌 페이지 네비게이터 (어드민 패스워드 인터셉터 장착)
function navigateTo(pageName) {
  // 🌟 [V1.5.3] 페이지 이탈 시 상단 배너 타이머 안전 회수
  if (sponsorSlideInterval) {
    clearInterval(sponsorSlideInterval);
    sponsorSlideInterval = null;
  }

  // 🛡️ [Security] 어드민 이탈 시 세션 및 데몬 즉시 자동 안전 잠금(Lock)
  if (AppState.currentPage === 'admin' && pageName !== 'admin') {
    sessionStorage.removeItem('admin_verified');
    stopAdminActivityDaemon();
    console.log("🔒 [Security] 어드민 이탈 감지 - 어드민 권한 및 비활동 타이머 전격 폐쇄!");
  }

  if (pageName === 'admin') {
    const isVerified = sessionStorage.getItem('admin_verified') === 'true';
    if (!isVerified) {
      openAdminPasswordModal();
      return;
    }
    // 어드민 대시보드 진입 성공 시 3분 비활동 감지 데몬 기동!
    startAdminActivityDaemon();
  }

  AppState.currentPage = pageName;
  
  // 🔒 [Session Save] 사장님이 이동하시는 화면 정보를 실시간으로 세션 스토리지에 비휘발성 기록합니다!
  sessionStorage.setItem('current_active_page', pageName);
  
  // PC 럭셔리 어드민 확장 뷰 토글
  const wrapper = document.getElementById('app-device-wrapper');
  const bar = document.getElementById('mock-status-bar');
  const notch = document.getElementById('device-notch');
  const nav = document.getElementById('bottom-tab-bar');
  
  if (pageName === 'admin') {
    wrapper.classList.add('admin-expanded');
    bar.style.display = 'none';
    if (notch) notch.style.display = 'none';
    nav.style.display = 'none'; // 어드민에서는 앱 하단바 제거
  } else {
    wrapper.classList.remove('admin-expanded');
    bar.style.display = window.innerWidth <= 768 ? 'none' : 'flex';
    if (notch) notch.style.display = window.innerWidth <= 768 ? 'none' : 'block';
    nav.style.display = 'flex';
  }

  // 하단 네비게이션 탭바 활성화 스타일 갱신
  const tabs = document.querySelectorAll('#bottom-tab-bar a');
  tabs.forEach(tab => {
    const navVal = tab.getAttribute('data-nav');
    if (navVal === pageName) {
      tab.className = "flex flex-col items-center justify-center text-primary relative btn-active-scale";
    } else {
      tab.className = "flex flex-col items-center justify-center text-on-surface-variant/70 hover:text-primary transition-all relative btn-active-scale";
    }
  });

  renderPage();
}

// 6.1. 종합 UI 렌더링 스위칭 밸브
function renderPage() {
  const container = document.getElementById('page-content');
  if (!container) return;
  container.innerHTML = ''; // 화면 초기화

  switch(AppState.currentPage) {
    case 'home':
      renderHomeScreen(container);
      break;
    case 'signup':
      renderSignupScreen(container);
      break;
    case 'radar':
      renderRadarScreen(container);
      break;
    case 'booking':
      renderBookingScreen(container);
      break;
    case 'talk':
      renderTalkScreen(container);
      
      // 🔒 [Restore Active Chat Room] 
      // 만약 세션 스토리지에 이전에 보고 있던 대화방 ID가 존재한다면 새로고침 후에도 자동으로 강제 복원 마운트합니다!
      const lastActiveChatRoomId = sessionStorage.getItem('current_active_chat_room_id');
      if (lastActiveChatRoomId) {
        console.log("🔒 [Restore Chat Room] 새로고침 대화방 상세 자석 복구 발동:", lastActiveChatRoomId);
        // AppState 캐시 로드가 완료될 때까지 안전한 마운트를 위해 아주 약간의 시차(50ms)를 두고 개방합니다.
        setTimeout(() => {
          openChatRoomDetail(lastActiveChatRoomId);
        }, 50);
      }
      break;
    case 'profile':
      renderProfileScreen(container);
      break;
    case 'board':
      renderBoardScreen(container);
      break;
    case 'admin':
      renderAdminScreen(container);
      break;
    case 'waiting':
      renderWaitingScreen(container);
      break;
    case 'notifications':
      renderNotificationsScreen(container);
      break;
  }
}

// 헤더 및 크레딧 상태 실시간 갱신
function updateHeaderAndNav() {
  const creditBadge = document.getElementById('top-credit-badge');
  if (creditBadge) {
    creditBadge.innerText = `${AppState.credits} CR`;
  }

  // 🔔 [V0.8.1 하이브리드 알림 뱃지] 읽지 않은 알림 + 읽지 않은 1:1 대화방 메시지 수 합산
  const unreadNotifs = AppState.notifications.filter(n => !n.isRead).length;
  let unreadChatCount = 0;
  if (AppState.currentUser) {
    AppState.chatRooms.forEach(room => {
      const hasUnread = room.messages.some(m => String(m.sender) !== String(AppState.currentUser.uid) && m.isRead === false);
      if (hasUnread) {
        unreadChatCount++;
      }
    });
  }
  const totalUnread = unreadNotifs + unreadChatCount;
  
  const badge = document.getElementById('notif-badge');
  const sideBadge = document.getElementById('sidebar-notif-badge');
  if (badge) {
    badge.innerText = totalUnread;
    badge.style.display = totalUnread > 0 ? 'flex' : 'none';
  }
  if (sideBadge) {
    sideBadge.innerText = totalUnread;
    sideBadge.style.display = totalUnread > 0 ? 'block' : 'none';
  }
}

// ==========================================================================
// 7.0. 개별 페이지 화면 설계 및 렌더러 (Dynamic HTML Component Generators)
// ==========================================================================

// 🌟 [V1.5.3] 상단 슬라이드 배너 캐러셀 제어 변수 및 함수
let currentSponsorSlideIndex = 0;
let sponsorSlideInterval = null;

function moveSponsorSlide(dir) {
  const track = document.getElementById('sponsor-slide-track');
  if (!track) return;
  currentSponsorSlideIndex = (currentSponsorSlideIndex + dir + 4) % 4;
  track.style.transform = `translateX(-${currentSponsorSlideIndex * 25}%)`;
  updateSponsorDots();
  resetSponsorTimer();
}

function setSponsorSlide(idx) {
  const track = document.getElementById('sponsor-slide-track');
  if (!track) return;
  currentSponsorSlideIndex = idx;
  track.style.transform = `translateX(-${idx * 25}%)`;
  updateSponsorDots();
  resetSponsorTimer();
}

function updateSponsorDots() {
  const dots = document.querySelectorAll('.sponsor-dot');
  dots.forEach((dot, idx) => {
    if (idx === currentSponsorSlideIndex) {
      dot.classList.remove('bg-white/30');
      dot.classList.add('bg-primary');
    } else {
      dot.classList.remove('bg-primary');
      dot.classList.add('bg-white/30');
    }
  });
}

function resetSponsorTimer() {
  if (sponsorSlideInterval) clearInterval(sponsorSlideInterval);
  sponsorSlideInterval = setInterval(() => {
    moveSponsorSlide(1);
  }, 4000); // 4초 자동전환
}

window.moveSponsorSlide = moveSponsorSlide;
window.setSponsorSlide = setSponsorSlide;

// 7.1. 홈 화면 (Home Screen)
function renderHomeScreen(container) {
  container = container || document.getElementById('page-content');
  if (!container) return;
  
  // 사용자의 현재 설정된 지역 광고 필터링
  const userRegion = AppState.currentUser ? AppState.currentUser.city : '대전';
  const localSponsors = AppState.sponsors.filter(s => s.region === userRegion && s.status === 'active');
  const fallbackSponsors = AppState.sponsors.filter(s => s.status === 'active');
  const sponsorsToShow = localSponsors.length > 0 ? localSponsors : fallbackSponsors;

  // 🌟 [V1.5.3] 상단 슬라이드 배너 광고 4개 동적 연동 보장
  // Firestore DB에 데이터가 부족하더라도 항상 4개의 아름다운 VVIP 슬라이드 배너가 보장되도록 Mocking 증식
  let finalSponsors = [...sponsorsToShow];
  
  const mockSponsors = [
    {
      id: 'mock_sp_1',
      imageUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=600&q=80',
      tag: '대전 아라비안',
      club: '에이스 쩝이접이',
      title: '🍾 오늘 밤 룸 예약 시 VVIP 골든 양주 1병 무상 특전 서비스!'
    },
    {
      id: 'mock_sp_2',
      imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
      tag: '강남 VVIP',
      club: '아레나 케어',
      title: '🥂 3050 프리미엄 즉시 부킹 매칭 & VVIP 풀에스코트 특별 케어!'
    },
    {
      id: 'mock_sp_3',
      imageUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
      tag: '부산 해운대',
      club: '벨포트 메이트',
      title: '🏖️ 주말 바틀 예약 프로모션 진행 중 - 최고의 부킹 성공률 보장!'
    },
    {
      id: 'mock_sp_4',
      imageUrl: 'https://images.unsplash.com/photo-1574169208507-84376144848b?auto=format&fit=crop&w=600&q=80',
      tag: '클럽레이더',
      club: '공식 제휴사',
      title: '🪙 신규 가입 즉시 1초 만에 50 크레딧 무상 자동 즉시 충전 완료!'
    }
  ];

  // 4개가 될 때까지 Mock 데이터로 채움
  while (finalSponsors.length < 4) {
    const nextMock = mockSponsors[finalSponsors.length];
    finalSponsors.push(nextMock);
  }

  // 앞서 슬라이딩을 위한 가로형 flex 트랙 빌드
  let sponsorBannerHtml = `
    <div class="relative overflow-hidden w-full h-44 border-b border-white/10 group select-none">
      <!-- 슬라이드 트랙 (400% 너비로 슬라이드 4개 배치) -->
      <div id="sponsor-slide-track" class="flex h-full transition-transform duration-500 ease-out" style="width: 400%; transform: translateX(0%);">
        ${finalSponsors.map(sp => `
          <div class="w-1/4 h-full relative bg-cover bg-center shrink-0 cursor-pointer" style="background-image: url('${sp.imageUrl}')" onclick="showToast('${sp.title} 상세로 이동합니다.', 'info')">
            <div class="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent"></div>
            <span class="absolute top-3 left-3 bg-primary text-white text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">${sp.tag || '스폰서'}</span>
            <span class="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-secondary border border-secondary/30 text-[8px] font-bold px-2 py-0.5 rounded">${sp.club || '공식 제휴'}</span>
            <div class="absolute bottom-4 left-5 right-5">
              <p class="text-[9px] text-accent font-black tracking-widest uppercase mb-1">RECOMMENDED AD</p>
              <h2 class="text-sm font-black text-white leading-tight drop-shadow-md">${sp.title}</h2>
            </div>
          </div>
        `).join('')}
      </div>
      
      <!-- 수동 chevron 버튼 -->
      <button class="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 border border-white/10 text-white flex items-center justify-center hover:bg-black/90 active:scale-90 transition opacity-0 group-hover:opacity-100 z-30 btn-active-scale" onclick="moveSponsorSlide(-1)">
        <span class="material-symbols-outlined text-[18px]">chevron_left</span>
      </button>
      <button class="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 border border-white/10 text-white flex items-center justify-center hover:bg-black/90 active:scale-90 transition opacity-0 group-hover:opacity-100 z-30 btn-active-scale" onclick="moveSponsorSlide(1)">
        <span class="material-symbols-outlined text-[18px]">chevron_right</span>
      </button>
      
      <!-- 하단 인디케이터 도트 -->
      <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-30">
        <span class="sponsor-dot w-1.5 h-1.5 rounded-full bg-primary cursor-pointer transition-all" onclick="setSponsorSlide(0)"></span>
        <span class="sponsor-dot w-1.5 h-1.5 rounded-full bg-white/30 cursor-pointer transition-all" onclick="setSponsorSlide(1)"></span>
        <span class="sponsor-dot w-1.5 h-1.5 rounded-full bg-white/30 cursor-pointer transition-all" onclick="setSponsorSlide(2)"></span>
        <span class="sponsor-dot w-1.5 h-1.5 rounded-full bg-white/30 cursor-pointer transition-all" onclick="setSponsorSlide(3)"></span>
      </div>
    </div>
  `;

  container.innerHTML = `
    <!-- 상단 타겟 스폰서 롤링 배너 영역 -->
    ${sponsorBannerHtml}

    <div class="px-5 py-6 space-y-6">
      <!-- 3050 큰 글씨 가독성 카드 -->
      <div class="glass-card p-5 rounded-3xl border-primary/20 bg-dark-gradient relative overflow-hidden shadow-2xl">
        <div class="absolute -right-10 -bottom-10 w-28 h-28 bg-primary/10 rounded-full blur-2xl"></div>
        <p class="text-primary text-[10px] font-black uppercase tracking-wider mb-1.5 animate-pulse">Platform Status</p>
        <h3 class="readable-text-title text-white mb-2">오늘 밤 매칭 확률 200%</h3>
        <p class="readable-text-body text-on-surface-variant leading-relaxed">
          내 주변 200m 이내 웨이터와 고객들이 실시간 GPS 레이더에 감지되고 있습니다. 마음에 드는 상대에게 대화를 걸어 최고의 밤을 성공시키세요!
        </p>
      </div>

      <!-- 내 위치 설정 / GPS 모킹 슬라이더 (사용자 보완책 1 적용) -->
      <div class="glass-card p-5 rounded-3xl border-white/5 bg-surface/50">
        <div class="flex justify-between items-center mb-3">
          <h4 class="text-xs font-black text-white tracking-tight flex items-center gap-1.5">
            <span class="material-symbols-outlined text-accent text-sm">my_location</span> 실시간 위치 시뮬레이션
          </h4>
          <span id="gps-distance-text" class="text-xs font-black text-accent bg-accent/10 px-2 py-0.5 rounded-full">${AppState.currentGPSDistance}m</span>
        </div>
        <p class="text-[10px] text-on-surface-variant mb-4 leading-relaxed">
          실내 테스트를 위해 클럽 중심으로부터의 내 거리를 조절할 수 있습니다. 200m 이내로 들어와 코치의 레이더에 나를 노출하세요!
        </p>
        <input type="range" min="10" max="450" step="10" value="${AppState.currentGPSDistance}" 
               class="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent" 
               oninput="handleGpsSliderChange(this.value)"/>
        <div class="flex justify-between text-[8px] text-white/30 font-bold mt-2.5 px-1 uppercase">
          <span>클럽 내부 (10m)</span>
          <span>레이더 한계선 (200m)</span>
          <span>이탈 (450m)</span>
        </div>
      </div>

      <!-- 실시간 명예의 에이스 웨이터 리스트 -->
      <div>
        <div class="flex justify-between items-center mb-3.5">
          <h3 class="text-xs font-black text-white tracking-wider flex items-center gap-1.5 uppercase">
            <span class="material-symbols-outlined text-secondary text-sm">workspace_premium</span> 실시간 에이스 웨이터
          </h3>
          <a href="#" class="text-[10px] font-bold text-primary/80 uppercase tracking-tighter" onclick="navigateTo('booking')">전체보기</a>
        </div>
        
        <div class="grid grid-cols-2 gap-3" id="home-waiters-grid">
          <!-- 웨이터 카드 루프 -->
          ${AppState.waiters.slice(0, 4).map(w => `
            <div class="glass-card glass-card-hover p-4 rounded-2xl border-white/5 bg-[#120e26]/55 cursor-pointer flex flex-col justify-between h-44" onclick="navigateToWaiterDetail('${w.uid}')">
              <div class="flex gap-2.5 items-start">
                <img src="${w.avatar || KoreanAvatars.james}" class="w-10 h-10 rounded-xl object-cover border border-white/10 shrink-0"/>
                <div class="min-w-0">
                  <div class="flex items-center gap-1">
                    <span class="readable-text-title text-white text-xs truncate">${w.nickname}</span>
                    <span class="material-symbols-outlined text-secondary text-[11px]" style="font-variation-settings:'FILL' 1">stars</span>
                  </div>
                  <span class="text-[8px] text-white/50 block truncate font-medium">${w.club}</span>
                </div>
              </div>
              
              <p class="text-[9px] text-white/70 font-semibold line-clamp-2 leading-relaxed bg-black/30 p-1.5 rounded-lg border border-white/5 my-2">
                ${w.promotion || '언제나 정성을 다해 최고의 부킹을 서빙하겠습니다.'}
              </p>
              
              <div class="flex justify-between items-center shrink-0">
                <span class="text-[8px] font-black text-secondary uppercase bg-secondary/10 px-2 py-0.5 rounded-full">★ ${w.score || '4.9'}</span>
                <span class="text-[8px] text-primary font-black uppercase bg-primary/10 px-2 py-0.5 rounded-full">${w.bookings || '120'}회 예약</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

    </div>
  `;

  // 🌟 [V1.5.3] 렌더링 직후 광고 슬라이더 타이머 기동
  setTimeout(() => {
    currentSponsorSlideIndex = 0;
    resetSponsorTimer();
  }, 100);
}

// 7.2. 회원가입/로그인 통합 화면 (Signup & Login Screen)
let signupSelectedTab = 'signup'; // 'signup' | 'login'
let signupSelectedRole = 'player'; // 'player' | 'coach'

function renderSignupScreen(container) {
  isPhoneVerified = false; // 진입 시 인증 상태 초기화
  
  const cont = container || document.getElementById('page-content');
  
  cont.innerHTML = `
    <div class="px-6 pt-8 pb-36 flex flex-col justify-start min-h-full">
      <div class="text-center mb-6 shrink-0">
        <h2 class="font-sora text-3xl font-black tracking-widest text-primary drop-shadow-[0_0_15px_rgba(255,0,127,0.4)]" id="logo-click-home" style="cursor: pointer" onclick="navigateTo('home')">CLUB RADER 2</h2>
        <p class="text-xs text-on-surface-variant mt-2 leading-relaxed">3050 프리미엄 실시간 위치기반 매칭 & 예약 플랫폼</p>
      </div>

      <!-- 🔑 회원가입 / 로그인 메인 탭바 -->
      <div class="grid grid-cols-2 gap-2 p-1 bg-surface-container rounded-2xl border border-white/5 mb-6 shrink-0">
        <button id="tab-signup" class="h-11 rounded-xl text-xs font-black transition-all btn-active-scale ${
          signupSelectedTab === 'signup' ? 'text-white bg-primary shadow-lg shadow-primary/20' : 'text-white/60 hover:text-white'
        }" onclick="switchSignupTab('signup')">1초 회원가입 👤</button>
        <button id="tab-login" class="h-11 rounded-xl text-xs font-black transition-all btn-active-scale ${
          signupSelectedTab === 'login' ? 'text-white bg-primary shadow-lg shadow-primary/20' : 'text-white/60 hover:text-white'
        }" onclick="switchSignupTab('login')">기존 계정 로그인 🔑</button>
      </div>

      <!-- ==================== 1. 회원가입 폼 패널 ==================== -->
      <div id="signup-panel" class="${signupSelectedTab === 'signup' ? '' : 'hidden'} space-y-4">
        <!-- 이원화 권한(선수/웨이터) 탭바 -->
        <div class="grid grid-cols-2 gap-2 p-1 bg-surface-container/60 rounded-xl border border-white/5 mb-2 shrink-0">
          <button id="tab-signup-player" class="h-9 rounded-lg text-[11px] font-black transition-all ${
            signupSelectedRole === 'player' ? 'text-white bg-primary/70 shadow' : 'text-white/60 hover:text-white'
          }" onclick="switchSignupRole('player')">선수 (일반 회원👤)</button>
          <button id="tab-signup-coach" class="h-9 rounded-lg text-[11px] font-black transition-all ${
            signupSelectedRole === 'coach' ? 'text-white bg-primary/70 shadow' : 'text-white/60 hover:text-white'
          }" onclick="switchSignupRole('coach')">코치 (웨이터/종사자🍾)</button>
        </div>

        <form id="signup-form" class="space-y-4" onsubmit="handleSignupSubmit(event)">
          <div>
            <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">이름 (실명)</label>
            <input type="text" id="su-name" required placeholder="예: 김민우" class="w-full h-12 bg-surface border border-white/10 rounded-2xl px-4 text-xs text-white focus:outline-none focus:border-primary placeholder:text-white/20"/>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">성별</label>
              <select id="su-gender" required class="w-full h-12 bg-surface border border-white/10 rounded-2xl px-4 text-xs text-white focus:outline-none focus:border-primary">
                <option value="남">남성 🚹</option>
                <option value="여">여성 🚺</option>
              </select>
            </div>
            <div>
              <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">사용할 닉네임</label>
              <input type="text" id="su-nickname" required placeholder="예: 부킹마왕" class="w-full h-12 bg-surface border border-white/10 rounded-2xl px-4 text-xs text-white focus:outline-none focus:border-primary placeholder:text-white/20"/>
            </div>
          </div>

          <div>
            <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">휴대전화번호</label>
            <div class="flex gap-2">
              <input type="tel" id="su-phone" required placeholder="010-1234-5678" class="flex-1 h-12 bg-surface border border-white/10 rounded-2xl px-4 text-xs text-white focus:outline-none focus:border-primary placeholder:text-white/20"/>
              <button type="button" class="h-12 px-4 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold text-white shrink-0 btn-active-scale" onclick="triggerMockSms('su')">인증요청</button>
            </div>
            <!-- 💬 가상 SMS 인증번호 입력 패널 -->
            <div id="sms-auth-box" class="hidden mt-2 p-3 bg-accent/5 border border-accent/20 rounded-2xl">
              <label class="block text-[9px] text-accent font-black mb-1.5 uppercase">가상 SMS 인증번호 입력</label>
              <div class="flex gap-2">
                <input type="text" id="su-auth-code" placeholder="인증번호 4자리 (예: 1234)" class="flex-1 h-10 bg-surface border border-accent/30 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-accent text-center tracking-widest font-black"/>
                <button type="button" class="h-10 px-3 bg-accent/20 border border-accent/40 text-accent rounded-xl text-xs font-black btn-active-scale shrink-0" onclick="verifySmsCode('su')">인증확인</button>
              </div>
              <span class="text-[8px] text-accent/60 mt-1 block">💡 테스트 모드: 발송된 가상 번호 '1234'를 입력해 인증을 마치세요.</span>
            </div>
          </div>

          <!-- 선수(일반회원) 전용 속성: 성향 입력 (선택형 칩 리스트) -->
          <div id="form-field-player" class="${signupSelectedRole === 'player' ? '' : 'hidden'} space-y-2">
            <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">본인 성향 스타일 선택 (다중 선택)</label>
            <input type="hidden" id="su-style" value=""/>
            <div class="flex flex-wrap gap-2" id="style-tag-container-signup">
              <!-- 동적으로 주입될 칩 목록 -->
            </div>
          </div>

          <!-- 코치(종사자) 전용 속성: 소속 업소 검색 (지역 연동) -->
          <div id="form-field-coach" class="${signupSelectedRole === 'coach' ? '' : 'hidden'} space-y-4">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">소속 시/도</label>
                <select id="su-city" class="w-full h-11 bg-surface border border-white/10 rounded-2xl px-3 text-xs text-white focus:outline-none focus:border-primary" onchange="updateDistrictDropdown('su')">
                  <option value="대전">대전광역시</option>
                  <option value="서울">서울특별시</option>
                  <option value="부산">부산광역시</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">소속 구/군</label>
                <select id="su-district" class="w-full h-11 bg-surface border border-white/10 rounded-2xl px-3 text-xs text-white focus:outline-none focus:border-primary" onchange="updateClubDropdown('su')">
                  <!-- 동적 드롭다운 -->
                </select>
              </div>
            </div>
            <div>
              <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">소속 나이트클럽</label>
              <select id="su-club" class="w-full h-12 bg-surface border border-white/10 rounded-2xl px-4 text-xs text-white focus:outline-none focus:border-primary">
                <!-- 동적 드롭다운 -->
              </select>
            </div>
          </div>

          <div class="pt-2 shrink-0">
            <button type="submit" class="thumb-touch-btn w-full bg-neon-gradient text-white font-black shadow-lg shadow-primary/20 btn-active-scale py-3.5 rounded-2xl text-xs">
              선수단 정식 회원가입 완료 ⚡
            </button>
          </div>
        </form>
      </div>

      <!-- ==================== 2. 로그인 폼 패널 ==================== -->
      <div id="login-panel" class="${signupSelectedTab === 'login' ? '' : 'hidden'} space-y-5">
        <div class="bg-primary/5 border border-primary/20 rounded-2xl p-4 text-xs font-semibold leading-relaxed text-shadow-pink text-primary/80">
          💡 로그아웃 후 다시 접속하실 때는, 회원가입을 다시 할 필요 없이 **가입했던 기존 휴대전화 번호**를 입력해 안전하게 복귀하실 수 있습니다. (성향 및 보유 포인트 100% 온전 복구!)
        </div>

        <form id="login-form" class="space-y-4" onsubmit="handleLoginSubmit(event)">
          <div>
            <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">기존 가입한 휴대전화번호</label>
            <div class="flex gap-2">
              <input type="tel" id="login-phone" required placeholder="010-1234-5678" class="flex-1 h-12 bg-surface border border-white/10 rounded-2xl px-4 text-xs text-white focus:outline-none focus:border-primary placeholder:text-white/20"/>
              <button type="button" class="h-12 px-4 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold text-white shrink-0 btn-active-scale" onclick="triggerMockSms('login')">인증요청</button>
            </div>
            <!-- 💬 가상 SMS 인증번호 입력 패널 (로그인용) -->
            <div id="login-sms-auth-box" class="hidden mt-2 p-3 bg-accent/5 border border-accent/20 rounded-2xl">
              <label class="block text-[9px] text-accent font-black mb-1.5 uppercase">가상 SMS 인증번호 입력</label>
              <div class="flex gap-2">
                <input type="text" id="login-auth-code" placeholder="인증번호 4자리 (예: 1234)" class="flex-1 h-10 bg-surface border border-accent/30 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-accent text-center tracking-widest font-black"/>
                <button type="button" class="h-10 px-3 bg-accent/20 border border-accent/40 text-accent rounded-xl text-xs font-black btn-active-scale shrink-0" onclick="verifySmsCode('login')">인증확인</button>
              </div>
              <span class="text-[8px] text-accent/60 mt-1 block">💡 테스트 모드: 발송된 가상 번호 '1234'를 입력해 인증을 마치세요.</span>
            </div>
          </div>

          <div class="pt-2 shrink-0">
            <button type="submit" class="thumb-touch-btn w-full bg-neon-gradient text-white font-black shadow-lg shadow-primary/20 btn-active-scale py-3.5 rounded-2xl text-xs">
              기존 계정으로 안전하게 로그인 🔑
            </button>
          </div>
        </form>

        <!-- ⚡ 테스터 1초 퀵로그인 패널 (초프리미엄 개발 편의장치) -->
        <div class="pt-4 border-t border-white/5">
          <h4 class="text-[10px] font-black text-white/50 tracking-wider uppercase mb-3 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[14px] text-secondary">flash_on</span> ⚡ 등록된 테스터 계정으로 1초 퀵로그인
          </h4>
          <div id="quick-login-container" class="space-y-2 max-h-48 overflow-y-auto pr-1 hide-scrollbar">
            <!-- 동적으로 주입될 테스터 계정 리스트 -->
          </div>
        </div>
      </div>

    </div>
  `;

  // 드롭다운 및 스타일 칩 활성화
  updateDistrictDropdown('su');
  initSignupStylesChips();

  // 휴대전화 하이픈 자동 포맷 바인딩 (회원가입)
  const suPhone = document.getElementById('su-phone');
  if (suPhone) {
    suPhone.setAttribute('maxlength', '13');
    suPhone.addEventListener('input', (e) => {
      e.target.value = formatPhoneNumber(e.target.value);
    });
  }

  // 휴대전화 하이픈 자동 포맷 바인딩 (로그인)
  const loginPhone = document.getElementById('login-phone');
  if (loginPhone) {
    loginPhone.setAttribute('maxlength', '13');
    loginPhone.addEventListener('input', (e) => {
      e.target.value = formatPhoneNumber(e.target.value);
    });
  }

  // 로그인 탭 진입 시 기존 회원 리스트를 동적으로 페치해 퀵 로그인 장치 렌더링
  if (signupSelectedTab === 'login') {
    renderQuickLoginList();
  }
}

// 휴대전화번호 포맷팅 헬퍼 (하이픈 자동 삽입)
function formatPhoneNumber(value) {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, '');
  const phoneNumberLength = phoneNumber.length;
  if (phoneNumberLength < 4) return phoneNumber;
  if (phoneNumberLength < 8) {
    return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3)}`;
  }
  return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3, 7)}-${phoneNumber.slice(7, 11)}`;
}

// 7.2.1. 성향 해시태그 칩 동적 빌더
function initSignupStylesChips() {
  const styleTags = ['댄디스타일', '섹시스타일', '캐주얼웨어', '수트핏', '원피스', 'EDM러버', '힙합러버', '조용한부스', '샴페인파티', '테킬라폭탄', '비주얼에이스', '입담좋음', '분위기메이커'];
  const tagContainer = document.getElementById('style-tag-container-signup');
  const hiddenInput = document.getElementById('su-style');
  const selectedTags = new Set();

  if (tagContainer && hiddenInput) {
    tagContainer.innerHTML = ''; // 찌꺼기 방지
    styleTags.forEach(tag => {
      const tagEl = document.createElement('div');
      tagEl.className = 'px-3 py-1.5 rounded-full border border-white/10 bg-surface text-[10px] font-semibold text-white/60 cursor-pointer select-none active:scale-95 transition-all';
      tagEl.innerText = '#' + tag;
      tagEl.addEventListener('click', () => {
        if (selectedTags.has(tag)) {
          selectedTags.delete(tag);
          tagEl.className = 'px-3 py-1.5 rounded-full border border-white/10 bg-surface text-[10px] font-semibold text-white/60 cursor-pointer select-none active:scale-95 transition-all';
        } else {
          selectedTags.add(tag);
          tagEl.className = 'px-3 py-1.5 rounded-full border border-primary bg-primary/10 text-primary text-[10px] font-bold cursor-pointer select-none active:scale-95 transition-all shadow-[0_0_10px_rgba(255,0,127,0.15)]';
        }
        const arrayTags = Array.from(selectedTags).map(t => '#' + t);
        hiddenInput.value = arrayTags.join(' ');
      });
      tagContainer.appendChild(tagEl);
    });
  }
}

// 7.2.2. 이원화 탭 전환기
function switchSignupTab(tabName) {
  signupSelectedTab = tabName;
  renderSignupScreen();
}

// 7.2.3. 가입 역할 선택기 (선수/웨이터)
function switchSignupRole(role) {
  signupSelectedRole = role;
  const pTab = document.getElementById('tab-signup-player');
  const cTab = document.getElementById('tab-signup-coach');
  const pField = document.getElementById('form-field-player');
  const cField = document.getElementById('form-field-coach');

  if (role === 'player') {
    pTab.className = "h-9 rounded-lg text-[11px] font-black text-white bg-primary/70 shadow";
    cTab.className = "h-9 rounded-lg text-[11px] font-black text-white/60 hover:text-white transition";
    pField.classList.remove('hidden');
    cField.classList.add('hidden');
  } else {
    cTab.className = "h-9 rounded-lg text-[11px] font-black text-white bg-primary/70 shadow";
    pTab.className = "h-9 rounded-lg text-[11px] font-black text-white/60 hover:text-white transition";
    pField.classList.add('hidden');
    cField.classList.remove('hidden');
  }
}

// 7.2.4. 가상 휴대폰 본인인증 전송기 (디버깅)
function triggerMockSms(prefix = 'su') {
  const phoneInput = document.getElementById(prefix === 'su' ? 'su-phone' : 'login-phone');
  const phone = phoneInput ? phoneInput.value : '';
  
  if (!phone || phone.replace(/[^\d]/g, '').length < 11) {
    showToast('올바른 11자리 휴대전화번호를 입력해 주세요!', 'warning');
    return;
  }
  
  // 인증 상자 노출
  const authBox = document.getElementById(prefix === 'su' ? 'sms-auth-box' : 'login-sms-auth-box');
  if (authBox) {
    authBox.classList.remove('hidden');
  }
  
  showToast(`[SMS] 테스터 실기기 인증번호 [1234]가 발송되었습니다!`, 'success', 5000);
}

// 7.2.5. 가상 SMS 인증번호 확인 처리기
function verifySmsCode(prefix = 'su') {
  const codeInput = document.getElementById(prefix === 'su' ? 'su-auth-code' : 'login-auth-code');
  const code = codeInput ? codeInput.value.trim() : '';
  
  if (code === '1234') {
    isPhoneVerified = true;
    showToast('휴대폰 본인인증이 성공적으로 완료되었습니다! ✔️', 'success');
    
    // 인증 성공 시 입력 및 버튼 비활성화
    const phoneInput = document.getElementById(prefix === 'su' ? 'su-phone' : 'login-phone');
    if (phoneInput) phoneInput.disabled = true;
    if (codeInput) codeInput.disabled = true;
    
    const authBox = document.getElementById(prefix === 'su' ? 'sms-auth-box' : 'login-sms-auth-box');
    if (authBox) {
      authBox.className = "mt-2 p-3 bg-green-500/5 border border-green-500/20 text-green-400 font-black text-center text-xs rounded-2xl";
      authBox.innerHTML = "✔️ 휴대폰 본인인증 완료";
    }
  } else {
    showToast('인증번호가 일치하지 않습니다. 다시 입력해 주세요 (힌트: 1234)', 'danger');
  }
}

// 7.2.6. 기존 회원 휴대폰 번호 기반 로그인 제출 처리기
async function handleLoginSubmit(e) {
  e.preventDefault();
  
  if (!isPhoneVerified) {
    showToast('휴대폰 본인인증을 먼저 완료해 주세요!', 'warning');
    return;
  }
  
  const phone = document.getElementById('login-phone').value;
  
  try {
    const snap = await db.collection('users').get();
    const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    const foundUser = users.find(u => u.phone === phone);
    
    if (!foundUser) {
      showToast('⚠️ 입력하신 휴대전화번호로 가입된 회원이 존재하지 않습니다!', 'danger');
      return;
    }

    // 로그인 세션 및 씽크 강제 주입
    const newSessionId = 'sess_' + foundUser.uid;
    localStorage.setItem('mock_session_id', newSessionId);
    localStorage.setItem('mock_user_uid', foundUser.uid);
    await db.collection('users').doc(foundUser.uid).update({ activeSessionId: newSessionId });

    const fakeUser = { uid: foundUser.uid, email: `${foundUser.uid}@test.com` };
    localStorage.setItem('mock_auth_user', JSON.stringify(fakeUser));

    // 자동 세션 및 데이터 로드 진행
    AppState.currentUser = foundUser;
    AppState.userRole = foundUser.role || 'player';
    AppState.credits = Number(foundUser.credits) || 0;

    isPhoneVerified = false; // 휴대폰 인증 플래그 초기화

    showToast(`🔑 [${foundUser.nickname}] 회원님으로 즉시 자동 로그인이 성공하였습니다!`, 'success');
    
    // 실시간 동기화 채널 기동
    bindRealtimeSync(foundUser.uid);

    if (foundUser.role === 'coach' && !foundUser.isApproved) {
      navigateTo('waiting');
    } else {
      navigateTo('home');
    }
  } catch (err) {
    showToast('로그인 실패: ' + err.message, 'danger');
  }
}
window.handleLoginSubmit = handleLoginSubmit;

// 7.2.2. 코치 승인 대기 화면 (Waiting Screen)
function renderWaitingScreen(container) {
  const user = AppState.currentUser || {};
  
  const cont = container || document.getElementById('page-content');
  if (!cont) return;
  cont.innerHTML = `
    <div class="px-6 py-12 flex flex-col justify-center items-center min-h-full text-center">
      <div class="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6 animate-pulse border border-primary/20 shadow-[0_0_30px_rgba(255,0,127,0.2)]">
        <span class="material-symbols-outlined text-primary text-5xl animate-bounce" style="font-variation-settings:'FILL' 1">hourglass_empty</span>
      </div>
      
      <h2 class="text-lg font-black text-white mb-2 leading-snug">VVIP 코치 영업 승인 대기 중</h2>
      <p class="text-xs text-on-surface-variant/80 mb-6 max-w-xs leading-relaxed">
        \${user.nickname || '코치'} 코치님, 가입이 정상 접수되었습니다.<br/>
        현재 최고 관리자가 소속 클럽 정보를 대조하여 1초 실시간 승인 처리를 진행 중입니다.
      </p>

      <!-- 3단계 게이지 UI -->
      <div class="w-full max-w-sm bg-surface p-5 rounded-3xl border border-white/5 mb-8">
        <div class="text-[10px] text-primary font-black uppercase tracking-wider mb-4">온보딩 승인 프로세스</div>
        
        <div class="flex items-center justify-between relative px-2">
          <!-- 배경 라인 -->
          <div class="absolute left-6 right-6 top-4 h-[2px] bg-white/10 z-0"></div>
          
          <div class="flex flex-col items-center z-10">
            <div class="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 text-primary font-black text-xs flex items-center justify-center mb-1 shadow-[0_0_10px_rgba(255,0,127,0.2)]">1</div>
            <span class="text-[9px] font-black text-white/80">가입 접수</span>
          </div>
          
          <div class="flex flex-col items-center z-10">
            <div class="w-8 h-8 rounded-full bg-primary text-white border border-primary font-black text-xs flex items-center justify-center mb-1 animate-pulse shadow-[0_0_15px_rgba(255,0,127,0.4)]">2</div>
            <span class="text-[9px] font-black text-primary">클럽 검증</span>
          </div>
          
          <div class="flex flex-col items-center z-10">
            <div class="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-white/40 font-black text-xs flex items-center justify-center mb-1">3</div>
            <span class="text-[9px] font-black text-white/30">최종 승인</span>
          </div>
        </div>
      </div>

      <div class="bg-white/5 border border-white/10 rounded-2xl p-4 text-[10px] text-white/50 max-w-xs leading-relaxed mb-6">
        ℹ️ **QA 테스터 팁**: 퀵 전환 플로팅 배너 또는 사이드바의 **[VVIP 어드민 대시보드]** ➡️ **[웨이터 승인 대기]** 탭에서 **[승인 완료]**를 누르면, SSE 실시간 동기화로 이 대기 화면이 1초 만에 홈 화면으로 자동 스위칭됩니다!
      </div>

      <button class="thumb-touch-btn w-full max-w-xs bg-white/5 border border-white/10 text-white/80 btn-active-scale" onclick="logout()">로그아웃</button>
    </div>
  `;
}
window.renderWaitingScreen = renderWaitingScreen;

function renderRadarScreen(container) {
  const cont = container || document.getElementById('page-content');
  if (!cont) return;

  const isCoach = AppState.userRole === 'coach';
  const isVipCoach = isCoach && AppState.currentUser && AppState.currentUser.isPremium;
  
  // 탐색반경 결정: 코치(일반 200m / VIP 400m), 선수(200m로 확장하여 10m 실기기 스캔 테스트 보장!)
  const radarRange = isCoach ? (isVipCoach ? 400 : 200) : 200;
  
  const currentUserUid = AppState.currentUser ? String(AppState.currentUser.uid) : '';

  // 내 주변 상대방 필터링 (나 자신 제외)
  const waitersToScan = AppState.waiters.map(w => ({ ...w, isCoach: true }));
  const playersToScan = AppState.radarUsers.map(u => ({ ...u, isCoach: false }));
  
  const allScannedUsers = [...waitersToScan, ...playersToScan].filter(u => {
    const uid = String(u.uid || u.id || '');
    const isSelf = uid === currentUserUid;
    const dist = u.distance || 150;
    return !isSelf && dist <= radarRange;
  });

  // 정렬: 가까운 순
  const nearbyUsers = allScannedUsers.sort((a, b) => a.distance - b.distance);

  // 이원화 분할
  const nearbyPlayers = nearbyUsers.filter(u => {
    const role = u.role || (AppState.allUsersCache && AppState.allUsersCache[u.uid]?.role) || 'player';
    return role !== 'coach' && u.isCoach !== true;
  });

  const nearbyCoaches = nearbyUsers.filter(u => {
    const role = u.role || (AppState.allUsersCache && AppState.allUsersCache[u.uid]?.role) || 'player';
    return role === 'coach' || u.isCoach === true;
  });

  // 레이더 중앙 핀의 아바타를 내 이미지로 세팅
  const selfAvatar = AppState.currentUser && AppState.currentUser.avatar 
    ? AppState.currentUser.avatar 
    : (isCoach ? './assets/korean_waiter_james.png' : './assets/korean_man_user.png');

  cont.innerHTML = `
    <!-- 다이내믹 원형 펄스 레이더 스크린 (대표님 6차 고도화 피드백 반영) -->
    <div class="relative w-full aspect-square bg-[#070514] border-b border-white/10 flex items-center justify-center overflow-hidden">
      
      <!-- 💗 1. 대화 신청 활성화 그라데이션 네온 배너 -->
      <div class="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[85%] max-w-xs bg-gradient-to-r from-[#9333ea] via-[#d946ef] to-[#ff007f] rounded-full py-2.5 text-center text-[10px] font-black text-white shadow-[0_0_20px_rgba(255,0,127,0.5)] border border-white/20 tracking-wider">
        <span class="animate-pulse">1:1 채팅 활성화 (50m 내 진입)</span>
      </div>

      <!-- 펄스 파동 링 -->
      <div class="absolute w-4/5 h-4/5 border border-primary/20 rounded-full radar-pulse-ring"></div>
      <div class="absolute w-3/5 h-3/5 border border-primary/10 rounded-full radar-pulse-ring" style="animation-delay: 1.2s"></div>
      <div class="absolute w-2/5 h-2/5 border border-accent/15 rounded-full radar-pulse-ring" style="animation-delay: 2.4s"></div>
      
      <!-- grid -->
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="w-full h-[1px] bg-white/5"></div>
      </div>
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="w-[1px] h-full bg-white/5"></div>
      </div>

      <!-- scan -->
      <div class="absolute w-full h-full radar-scan-line pointer-events-none" style="background: conic-gradient(from 0deg, rgba(255, 0, 127, 0.15) 0deg, rgba(255, 0, 127, 0) 90deg)"></div>

      <!-- 👑 2. 내 위치 중심 프로필 핀 (Center) + HOLIC IN 배지 단일 앵커화 -->
      <div class="absolute flex flex-col items-center z-20" style="transform: translateY(-8px);">
        <div class="w-14 h-14 bg-black border-2 border-[#ff007f] rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(255,0,127,0.6)] overflow-hidden">
          <img src="${selfAvatar}" class="w-full h-full object-cover rounded-full" alt="My Profile"/>
        </div>
        <div class="mt-1.5 px-3 py-0.5 bg-[#4a1d6d]/60 border border-[#b026ff]/40 rounded-full text-[8px] font-black text-[#f3e8ff] tracking-widest shadow-[0_0_10px_rgba(176,38,255,0.4)] uppercase">
          ${(AppState.currentUser && AppState.currentUser.club) ? AppState.currentUser.club.toUpperCase() + ' IN' : 'HOLIC IN'}
        </div>
      </div>

      <!-- 🎯 3. 실시간 레이더 도트 매핑 (선수들만 지도상에 2색 글로우 표기, 본인 및 코치 제외) -->
      <div id="radar-dots-container" class="absolute inset-0 z-10 pointer-events-none">
        ${nearbyPlayers.map(u => {
          let hash = 0;
          const uidStr = String(u.uid || u.id || '');
          for (let i = 0; i < uidStr.length; i++) {
            hash = (hash + uidStr.charCodeAt(i) * (i + 1)) % 1000;
          }
          const fixedRand = hash / 1000;
          const angle = fixedRand * Math.PI * 2;

          const maxRadius = 42; 
          const pct = Math.min(100, (u.distance / radarRange)) * maxRadius / 100;
          
          const x = 50 + pct * Math.cos(angle);
          const y = 50 + pct * Math.sin(angle);
          
          const userProfile = getUserProfileByUid(u.uid) || {};
          const finalGender = u.gender || userProfile.gender || '남';
          const isFemale = finalGender === '여' || finalGender === '여성' || finalGender === 'female' || finalGender === '여자' || String(finalGender).toLowerCase().startsWith('f');
          
          const dotColorClass = isFemale
            ? 'bg-[#ff007f] border-[#ffb3d9] shadow-[0_0_15px_#ff007f,0_0_5px_#ffffff]'
            : 'bg-[#00f0ff] border-[#b3f9ff] shadow-[0_0_15px_#00f0ff,0_0_5px_#ffffff]';
          
          return `
            <div class="absolute w-3.5 h-3.5 ${dotColorClass} rounded-full border-2 border-white/50 animate-ping" style="left: ${x}%; top: ${y}%; pointer-events: auto;"></div>
            <div class="absolute w-3.5 h-3.5 ${dotColorClass} rounded-full border border-white cursor-pointer active:scale-150" style="left: ${x}%; top: ${y}%; pointer-events: auto;" onclick="showToast('${u.nickname}님 감지 (${finalGender})! 거리: ${u.distance}m', 'info')"></div>
          `;
        }).join('')}
      </div>

      <!-- 레이더 상단 뱃지 정보 -->
      <div class="absolute top-4 left-5 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-primary/20">
        <span class="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></span>
        <span class="text-[9px] font-black tracking-wider text-white uppercase">${isCoach ? 'WAITING RADER' : 'GUEST RADER'}</span>
      </div>

      <div class="absolute top-4 right-5 flex items-center gap-1 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[9px] font-bold">
        <span>탐색반경:</span>
        <span class="text-accent font-black">${radarRange}m</span>
      </div>
    </div>

    <!-- 하단 실시간 감지된 회원 목록 리스트 -->
    <div class="px-5 py-5 space-y-6">
      
      <!-- Section 1. 내 주변 선수들 -->
      <div>
        <div class="flex justify-between items-center mb-3.5">
          <h3 class="text-xs font-black text-white tracking-wider flex items-center gap-1.5 uppercase">
            <span class="material-symbols-outlined text-primary text-sm animate-pulse">favorite</span>
            내 주변 선수들 (회원_${nearbyPlayers.length}명)
          </h3>
          
          ${isCoach ? `
            <div class="flex gap-1.5 shrink-0">
              <button class="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 text-[8px] font-black px-2.5 py-1 rounded-full btn-active-scale flex items-center gap-0.5" onclick="openGroupPromotionModal()">
                <span class="material-symbols-outlined text-[10px]">campaign</span> 단체 삐삐 (30 CR) 📢
              </button>
              ${!isVipCoach ? `
                <button class="bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/30 text-[8px] font-black px-2.5 py-1 rounded-full btn-active-scale" onclick="purchasePremiumRadar()">레이더 400m 확장 (VVIP 구독) 👑</button>
              ` : `
                <span class="text-secondary border border-secondary/30 text-[8px] font-black px-2.5 py-0.5 rounded-full bg-secondary/10 tracking-widest">Premium 400m Active</span>
              `}
            </div>
          ` : ''}
        </div>
        
        <div class="space-y-2.5" id="radar-players-list">
          ${nearbyPlayers.length === 0 ? `
            <div class="text-center py-6 text-white/30 text-[10px] font-bold bg-white/30 border border-white/5 rounded-2xl">
              현재 반경 ${radarRange}m 이내에 감지된 손님이 없습니다.
            </div>
          ` : nearbyPlayers.map(u => {
            const userProfile = getUserProfileByUid(u.uid) || {};
            const finalGender = u.gender || userProfile.gender || '남';
            const isFemale = finalGender === '여' || finalGender === '여성' || finalGender === 'female' || finalGender === '여자' || String(finalGender).toLowerCase().startsWith('f');
            
            const cardStyle = isFemale
              ? 'border: 1px solid rgba(255, 0, 127, 0.25); box-shadow: 0 0 12px rgba(255, 0, 127, 0.08);'
              : 'border: 1px solid rgba(0, 240, 255, 0.25); box-shadow: 0 0 12px rgba(0, 240, 255, 0.08);';
            const avatarBorderClass = isFemale ? 'border-[#ff007f]/40' : 'border-[#00f0ff]/40';
            const defaultAvatar = isFemale ? KoreanAvatars.vipWoman : KoreanAvatars.vipMan;
            
            const distance = u.distance || 0;
            const isWithinLimit = distance <= 50;

            return `
              <div class="p-3.5 rounded-[22px] bg-[#110e28] flex justify-between items-center gap-3" style="${cardStyle}">
                <div class="flex gap-2.5 items-center min-w-0">
                  <div class="relative shrink-0">
                    <img src="${u.avatar || defaultAvatar}" class="w-10 h-10 rounded-xl object-cover border ${avatarBorderClass}"/>
                    ${u.isVip ? `<span class="absolute -top-1.5 -right-1.5 bg-[#e9c349] text-black text-[7px] font-black px-1.5 py-0.2 rounded shadow-md">VIP</span>` : ''}
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="readable-text-title text-white text-xs font-black truncate">${u.nickname}</span>
                      <span class="text-[8px] text-accent bg-accent/10 font-black tracking-tighter px-1.5 py-0.2 rounded-full uppercase">
                        ${finalGender}성 / ${u.age || '30대 초반'}
                      </span>
                    </div>
                    <span class="text-[9px] text-white/40 block truncate mt-0.5">${u.style || '#부킹초보'}</span>
                  </div>
                </div>
                
                <div class="flex items-center gap-2 shrink-0">
                  <span class="text-[9px] text-secondary font-black bg-secondary/10 px-2 py-0.5 rounded-full shrink-0">${distance}m</span>
                  
                  ${isWithinLimit ? `
                    <!-- 🔓 50m 이내: 대화 가능 (활성 1:1 채팅 버튼) -->
                    <button class="h-9 px-3 bg-neon-gradient text-white text-[10px] font-black rounded-xl btn-active-scale shrink-0 shadow-md shadow-primary/10" 
                            onclick="startDirectTalk('${u.uid}', '${u.nickname}')">
                      채팅 💬
                    </button>
                  ` : `
                    <!-- 🔒 50m 초과: 대화 불가 -->
                    <button class="h-9 px-3 bg-white/5 border border-white/10 text-white/30 rounded-xl cursor-pointer transition active:scale-95 shrink-0" 
                            onclick="showToast('${u.nickname}님은 현재 클럽 밖에 있어 채팅이 불가능합니다. 50m 내로 가까워지면 1:1 채팅이 즉시 개방됩니다!', 'warning')">
                      대화불가 🔒
                    </button>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Section 2. 내 주변 코치들 -->
      <div class="pt-4 border-t border-white/5">
        <h3 class="text-xs font-black text-white tracking-wider mb-3.5 uppercase flex items-center gap-1.5">
          <span class="material-symbols-outlined text-secondary text-sm">workspace_premium</span>
          내 주변 코치들 (회원_${nearbyCoaches.length}명)
        </h3>
        <div class="space-y-2.5" id="radar-waiters-list">
          ${nearbyCoaches.length === 0 ? `
            <div class="text-center py-6 text-white/30 text-[10px] font-bold bg-white/30 border border-white/5 rounded-2xl">
              주변에 근무 중인 웨이터 코치가 없습니다.
            </div>
          ` : nearbyCoaches.map(u => {
            const distance = u.distance || 0;
            const isWithinLimit = distance <= 50;
            
            const cardStyle = 'border: 1px solid rgba(233, 195, 73, 0.25); box-shadow: 0 0 12px rgba(233, 195, 73, 0.08);';
            const avatarBorderClass = 'border-[#e9c349]/40';
            const defaultAvatar = KoreanAvatars.james;

            return `
              <div class="p-3.5 rounded-[22px] bg-[#110e28] flex justify-between items-center gap-3" style="${cardStyle}">
                <div class="flex gap-2.5 items-center min-w-0">
                  <div class="relative shrink-0">
                    <img src="${u.avatar || defaultAvatar}" class="w-10 h-10 rounded-xl object-cover border ${avatarBorderClass}"/>
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="readable-text-title text-white text-xs font-black truncate">${u.nickname}</span>
                      <span class="text-[8px] text-secondary bg-secondary/10 font-black tracking-tighter px-1.5 py-0.2 rounded-full uppercase">
                        코치🍾
                      </span>
                    </div>
                    <span class="text-[9px] text-white/40 block truncate mt-0.5">${u.club || '나이트클럽'} / ${u.team || '에이스'}</span>
                  </div>
                </div>
                
                <div class="flex items-center gap-2 shrink-0">
                  <span class="text-[9px] text-secondary font-black bg-secondary/10 px-2 py-0.5 rounded-full shrink-0">${distance}m</span>
                  
                  <div class="flex gap-1">
                    <button class="h-9 px-2.5 bg-white/5 border border-white/10 text-white text-[10px] font-bold rounded-xl btn-active-scale shrink-0" 
                            onclick="openReservationModal('${u.uid}', '${u.nickname}', '${u.club || '나이트클럽'}')">
                      예약 🍾
                    </button>
                    
                    ${isWithinLimit ? `
                      <button class="h-9 px-2.5 bg-neon-gradient text-white text-[10px] font-black rounded-xl btn-active-scale shrink-0 shadow-md shadow-primary/10" 
                              onclick="${isCoach ? `openPromotionModal('${u.uid}', '${u.nickname}')` : `startDirectTalk('${u.uid}', '${u.nickname}')`}">
                        채팅 💬
                      </button>
                    ` : `
                      <button class="h-9 px-2.5 bg-white/5 border border-white/10 text-white/30 rounded-xl cursor-pointer transition active:scale-95 shrink-0" 
                              onclick="showToast('${u.nickname}님은 현재 클럽 밖에 있어 채팅이 불가능합니다. 50m 내로 가까워지면 1:1 채팅이 즉시 개방됩니다!', 'warning')">
                        대화불가 🔒
                      </button>
                    `}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      
    </div>

    <!-- 📢 반경 내 전체 손님 단체 삐삐 발송 모달창 (VVIP 특전) -->
    <div id="group-promotion-modal" class="fixed inset-0 z-[10010] bg-[#05050a]/95 backdrop-blur-xl hidden items-center justify-center px-6">
      <div class="glass-card p-6 rounded-3xl border border-primary/30 w-full max-w-sm shadow-[0_20px_50px_rgba(0,240,255,0.2)]">
        <div class="flex justify-between items-center mb-1">
          <h3 class="text-base font-black text-white tracking-tight flex items-center gap-1.5">
            <span class="material-symbols-outlined text-primary text-xl animate-pulse">campaign</span> VVIP 단체 삐삐 발송
          </h3>
          <span class="material-symbols-outlined text-white/40 cursor-pointer p-1 hover:text-white transition" onclick="closeGroupPromotionModal()">close</span>
        </div>
        <p class="text-[10px] text-on-surface-variant/80 mb-4">현재 감지 범위 내에 있는 모든 일반 손님들에게 1초 만에 단체 삐삐를 투하합니다.</p>
        
        <div class="bg-primary/5 border border-primary/10 rounded-2xl p-3 mb-4 flex justify-between items-center text-xs">
          <span class="text-white/60">발송 비용</span>
          <span class="text-primary font-black">30 CR 차감</span>
        </div>

        <form id="group-promotion-form" class="space-y-4" onsubmit="sendGroupPromotionSubmit(event)">
          <div>
            <label class="block text-[10px] text-white/60 font-black mb-1">단체 삐삐 어필 메시지</label>
            <textarea id="group-promo-details" required rows="4" placeholder="[에이스 VVIP 이벤트] 오늘 밤 저희 클럽 방문 후 저를 지명해 주시면 맥주 3병 및 안주 1개 특별 서비스! 빛의 속도로 모시겠습니다!" class="w-full bg-surface border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-primary placeholder:text-white/20"></textarea>
          </div>

          <div class="flex gap-3 pt-2">
            <button type="button" class="flex-1 h-11 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white btn-active-scale" onclick="closeGroupPromotionModal()">취소</button>
            <button type="submit" class="flex-1 h-11 bg-neon-gradient text-white rounded-xl text-xs font-black shadow-lg shadow-primary/20 btn-active-scale">전체 삐삐 살포 📢</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 🍾 타겟 홍보 문자 발송 관리자 모달창 -->
    <div id="promotion-modal" class="fixed inset-0 z-[10009] bg-[#05050a]/95 backdrop-blur-xl hidden items-center justify-center px-6">
      <div class="glass-card p-6 rounded-3xl border border-primary/30 w-full max-w-sm shadow-[0_20px_50px_rgba(255,0,127,0.2)]">
        <div class="flex justify-between items-center mb-1">
          <h3 class="text-base font-black text-white tracking-tight flex items-center gap-1.5">
            <span class="material-symbols-outlined text-primary text-xl animate-pulse">campaign</span> 타겟 실시간 홍보 발송
          </h3>
          <span class="material-symbols-outlined text-white/40 cursor-pointer p-1 hover:text-white transition" onclick="closePromotionModal()">close</span>
        </div>
        <p class="text-[10px] text-on-surface-variant/80 mb-4">내 주변 200m 이내 일반 선수 회원에게 맞춤형 혜택과 멘트를 쏩니다.</p>
        
        <div class="bg-primary/5 border border-primary/10 rounded-2xl p-3 mb-4 flex justify-between items-center text-xs">
          <span class="text-white/60">수신 회원 닉네임</span>
          <span id="promo-target-name" class="text-white font-black">손님 이름</span>
        </div>

        <form id="promotion-form" class="space-y-4" onsubmit="sendPromotionSubmit(event)">
          <input type="hidden" id="promo-target-uid" value=""/>
          
          <div>
            <label class="block text-[10px] text-white/60 font-black mb-1">웨이터 어필 / 프로모션 멘트</label>
            <textarea id="promo-details" required rows="3" placeholder="오늘 밤 룸 예약하시면 양주 1병 특별 서비스! 최고의 매칭으로 모십니다. 빠르게 연락 주세요!" class="w-full bg-surface border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-primary placeholder:text-white/20"></textarea>
          </div>

          <div class="flex gap-3 pt-2">
            <button type="button" class="flex-1 h-11 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white btn-active-scale" onclick="closePromotionModal()">취소</button>
            <button type="submit" class="flex-1 h-11 bg-neon-gradient text-white rounded-xl text-xs font-black shadow-lg shadow-primary/20 btn-active-scale">전송하기 📢</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// 프리미엄 레이더 구독 결제 유도
function purchasePremiumRadar() {
  if (AppState.currentUser) {
    showToast('VVIP 400m 레이더 구독을 위해 결제 상점으로 진입합니다.', 'info');
    openStoreModal();
  }
}

// 홍보 발송 모달 열기
function openPromotionModal(targetUid, nickname) {
  document.getElementById('promo-target-name').innerText = nickname;
  document.getElementById('promo-target-uid').value = targetUid;
  document.getElementById('promotion-modal').classList.remove('hidden');
}

function closePromotionModal() {
  document.getElementById('promotion-modal').classList.add('hidden');
}

// 📢 VVIP 단체 삐삐 홍보 발송 제어기
function openGroupPromotionModal() {
  if (AppState.credits < 3) {
    showToast('⚠️ 보유 포인트가 부족합니다! 단체 삐삐 발송에는 3 CR이 필요합니다.', 'danger');
    return;
  }
  document.getElementById('group-promo-details').value = '';
  document.getElementById('group-promotion-modal').classList.remove('hidden');
  document.getElementById('group-promotion-modal').classList.add('flex');
}
window.openGroupPromotionModal = openGroupPromotionModal;

function closeGroupPromotionModal() {
  document.getElementById('group-promotion-modal').classList.add('hidden');
  document.getElementById('group-promotion-modal').classList.remove('flex');
}
window.closeGroupPromotionModal = closeGroupPromotionModal;

async function sendGroupPromotionSubmit(e) {
  e.preventDefault();
  
  if (!AppState.currentUser) return;
  const text = document.getElementById('group-promo-details').value;

  try {
    const res = await fetch(`/api/db/promotions/group`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Active-Session-Id': localStorage.getItem('mock_session_id') || '',
        'X-User-Uid': String(AppState.currentUser.uid)
      },
      body: JSON.stringify({
        senderUid: AppState.currentUser.uid,
        text: text,
        range: AppState.currentUser.isPremium ? 400 : 200
      })
    });

    if (!res.ok) {
      const errData = await res.json();
      if (res.status === 403 && errData.error === 'session_expired') {
        showToast('⚠️ ' + errData.message, 'danger', 8000);
        logout();
        return;
      }
      throw new Error(errData.message || '단체 삐삐 발송에 실패했습니다.');
    }

    const resData = await res.json();
    const finalCredits = resData.balance || 0;
    
    // 로컬 상태 포인트 씽크
    AppState.currentUser.credits = finalCredits;
    AppState.credits = finalCredits;
    updateHeaderAndNav();

    showToast(`📢 반경 내 손님들에게 단체 삐삐가 대량 살포되었습니다! (3 CR 차감, 잔액: ${finalCredits} CR)`, 'success');
    closeGroupPromotionModal();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}
window.sendGroupPromotionSubmit = sendGroupPromotionSubmit;

// 홍보 전송 제출
async function sendPromotionSubmit(e) {
  e.preventDefault();
  const targetUid = document.getElementById('promo-target-uid').value;
  const text = document.getElementById('promo-details').value;
  
  const senderNick = AppState.currentUser.nickname;
  const senderClub = AppState.currentUser.club;
  const senderPhone = AppState.currentUser.phone || '010-3333-7777';

  try {
    const notifItem = {
      type: 'promo',
      promoType: 'event', // 🌟 [V1.5.8] 모던 미니멀리즘: event 유형 단일 살포로 100% 일원화!
      title: `🍾 웨이터 ${senderNick} 특별 홍보 도착`,
      body: `[소속: ${senderClub}] ${text}`,
      isRead: false,
      targetUid: targetUid,
      senderUid: AppState.currentUser.uid,
      senderNick: senderNick,
      senderPhone: senderPhone,
      createdAt: '방금 전'
    };
    
    await db.collection('notifications').add(notifItem);
    showToast('홍보 메시지가 정상적으로 실시간 발송되었습니다!', 'success');
    closePromotionModal();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// 7.4. 전국 검색 및 웨이터 예약 매칭 (Booking Screen)
function renderBookingScreen(container) {
  container = container || document.getElementById('page-content');
  if (!container) return;
  // 선수가 예약 신청하는 탭, 코치가 수락/거절을 관리하는 탭
  const user = AppState.currentUser;
  
  if (AppState.userRole === 'coach') {
    // 코치(웨이터) 전용 예약 수령 관리 패널
    container.innerHTML = `
      <div class="px-5 py-6 space-y-6">
        <div class="glass-card p-5 rounded-3xl border-primary/20 bg-dark-gradient">
          <p class="text-primary text-[10px] font-black uppercase tracking-wider mb-1.5">Coach Dashboard</p>
          <h3 class="readable-text-title text-white mb-1.5">${user.nickname} 코치 예약 관리소</h3>
          <p class="readable-text-body text-on-surface-variant leading-relaxed">
            전국에서 오전에 예약 신청한 선수들의 룸 예약 목록이 실시간 감지됩니다. 고객과의 매너 약속을 위해 빠르게 예약 승인 또는 반려 처리를 선택하세요.
          </p>
        </div>
        
        <div>
          <h3 class="text-xs font-black text-white tracking-wider mb-3.5 uppercase">
            📅 실시간 예약 수령 내역 (${AppState.bookings.length}건)
          </h3>
          
          <div class="space-y-3" id="coach-bookings-list">
            ${AppState.bookings.length === 0 ? `
              <div class="text-center py-10 text-white/30 text-xs font-bold bg-white/30 border border-white/5 rounded-2xl">
                접수된 실시간 예약 신청이 없습니다.
              </div>
            ` : AppState.bookings.map(b => `
              <div class="glass-card p-4 rounded-2xl border-white/5 bg-[#120e26]/35 space-y-3">
                <div class="flex justify-between items-start">
                  <div>
                    <span class="text-[8px] font-black uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full">${b.clubName}</span>
                    <h4 class="readable-text-title text-white text-xs mt-1">예약자: ${b.clientName}</h4>
                  </div>
                  
                  <span class="text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                    b.status === 'approved' ? 'bg-green-500/10 text-green-400' :
                    b.status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                    b.status === 'cancelled' ? 'bg-white/5 text-white/40' : 'bg-secondary/10 text-secondary'
                  }">${b.status === 'approved' ? '예약승인' : b.status === 'rejected' ? '예약반려' : b.status === 'cancelled' ? '예약취소' : '대기중'}</span>
                </div>
                
                <div class="bg-black/30 border border-white/5 p-2.5 rounded-xl text-[10px] space-y-1.5">
                  <div class="flex justify-between text-white/60"><span>예약 테이블</span><span class="text-accent font-bold">${b.bookingType || '룸 (Room)'}</span></div>
                  <div class="flex justify-between text-white/60"><span>방문 인원</span><span class="text-white font-bold">${b.guestCount || 2}명</span></div>
                  <div class="flex justify-between text-white/60"><span>예약 시간</span><span class="text-white font-bold">${b.date}</span></div>
                  <div class="flex justify-between text-white/60"><span>고객 연락처</span><span class="text-secondary font-bold font-sora">📞 ${b.userPhone || '010-XXXX-XXXX'}</span></div>
                  <div class="flex justify-between text-white/60"><span>신청 시각</span><span class="text-white/40">${b.createdAt ? new Date(b.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '오전'}</span></div>
                </div>

                ${b.status === 'pending' ? `
                  <div class="flex gap-2 pt-1 shrink-0">
                    <button class="flex-1 h-9 bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-bold rounded-xl btn-active-scale" onclick="adjustBookingStatus('${b.id}', 'rejected')">거절</button>
                    <button class="flex-1 h-9 bg-green-950/40 border border-green-500/30 text-green-400 text-xs font-bold rounded-xl btn-active-scale" onclick="adjustBookingStatus('${b.id}', 'approved')">승인</button>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    return;
  }

  // 일반 회원(선수) 전용 예약 신청 창구 (전국 지역 필터링)
  container.innerHTML = `
    <div class="px-5 py-6 space-y-6">
      
      <!-- 시-구-클럽 3단계 검색 드롭다운 (사용자 보완책 5 적용) -->
      <div class="glass-card p-5 rounded-3xl border-primary/20 bg-dark-gradient">
        <h4 class="text-xs font-black text-white tracking-tight flex items-center gap-1.5 uppercase mb-3">
          <span class="material-symbols-outlined text-primary text-sm animate-pulse">nightlife</span> 전국 통합 나이트클럽 검색
        </h4>
        
        <div class="grid grid-cols-2 gap-2 mb-2.5">
          <div>
            <span class="text-[8px] text-white/50 font-bold block mb-1">시/도 선택</span>
            <select id="sr-city" class="w-full h-11 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary" onchange="updateDistrictDropdown('sr')">
              <option value="대전">대전광역시</option>
              <option value="서울">서울특별시</option>
              <option value="부산">부산광역시</option>
            </select>
          </div>
          <div>
            <span class="text-[8px] text-white/50 font-bold block mb-1">구/군 선택</span>
            <select id="sr-district" class="w-full h-11 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary" onchange="updateClubDropdown('sr')">
              <!-- District dynamic load -->
            </select>
          </div>
        </div>
        
        <div class="mb-4">
          <span class="text-[8px] text-white/50 font-bold block mb-1">나이트클럽명 선택</span>
          <select id="sr-club" class="w-full h-11 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary" onchange="updateWaitersListBySelection()">
            <!-- Club dynamic load -->
          </select>
        </div>

        <p class="text-[9px] text-white/40 leading-relaxed font-semibold">
          💡 **원격 예약 안내**: 평소 서울에 거주하더라도 오전에 위 지역 필터를 대전으로 변경하여, 오늘 오후 방문할 대전 웨이터에게 즉시 예약을 잡을 수 있습니다!
        </p>
      </div>

      <!-- 📢 나이트클럽 개업/폐업 제보 프리미엄 배너 카드 (VVIP 20 CR 무료 충전) -->
      <div class="glass-card p-4 rounded-2xl border-cyan-500/30 bg-cyan-950/15 flex justify-between items-center gap-3 cursor-pointer hover:border-cyan-400/50 hover:bg-cyan-950/25 transition-all btn-active-scale" onclick="showReportModal()">
        <div class="min-w-0">
          <span class="text-[8px] font-black uppercase bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full">CROWD REPORT</span>
          <h4 class="readable-text-title text-white text-xs mt-1">📢 나이트클럽 신설 / 폐업 정보 제보하기</h4>
          <p class="text-[9.5px] text-white/50 leading-relaxed mt-0.5 font-medium">제보하신 정보가 반영되면 <strong class="text-cyan-400 font-black">20 CR</strong> 보상이 즉각 무료 충전됩니다!</p>
        </div>
        <span class="material-symbols-outlined text-cyan-400 text-xl shrink-0 animate-bounce">campaign</span>
      </div>

      <!-- 선택된 나이트클럽 웨이터 목록 -->
      <div>
        <h3 class="text-xs font-black text-white tracking-wider mb-3.5 uppercase flex items-center gap-1.5">
          <span class="material-symbols-outlined text-secondary text-sm">face</span> 해당 업소 담당 웨이터진
        </h3>
        
        <div class="space-y-2.5" id="booking-waiters-list">
          <!-- waiters list binding -->
        </div>
      </div>

      <!-- 내 실시간 예약 내역서 목록 -->
      <div class="border-t border-white/5 pt-5">
        <h3 class="text-xs font-black text-white tracking-wider mb-3.5 uppercase flex items-center gap-1.5">
          <span class="material-symbols-outlined text-primary text-sm">menu_book</span> 내 원격 예약 현황 (${AppState.bookings.length}건)
        </h3>
        
        <div class="space-y-2.5" id="my-bookings-container">
          <!-- my bookings template load -->
        </div>
      </div>
      
    </div>
  `;
  updateDistrictDropdown('sr');
}

// 3단계 드롭다운 체인 연동 헬퍼
function updateDistrictDropdown(prefix) {
  const city = document.getElementById(`${prefix}-city`).value;
  const distSelect = document.getElementById(`${prefix}-district`);
  distSelect.innerHTML = '';
  
  if (prefix === 'sr') {
    distSelect.innerHTML += `<option value="all">전체 구/군</option>`;
  }
  
  if (RegionData[city]) {
    Object.keys(RegionData[city]).forEach(d => {
      distSelect.innerHTML += `<option value="${d}">${d}</option>`;
    });
  }
  updateClubDropdown(prefix);
}

function updateClubDropdown(prefix) {
  const city = document.getElementById(`${prefix}-city`).value;
  const distSelect = document.getElementById(`${prefix}-district`);
  const district = distSelect ? distSelect.value : 'all';
  const clubSelect = document.getElementById(`${prefix}-club`);
  clubSelect.innerHTML = '';
  
  if (prefix === 'sr') {
    clubSelect.innerHTML += `<option value="all">전체 업소</option>`;
  }
  
  if (district === 'all') {
    if (RegionData[city]) {
      Object.keys(RegionData[city]).forEach(d => {
        RegionData[city][d].forEach(c => {
          clubSelect.innerHTML += `<option value="${c}">${c}</option>`;
        });
      });
    }
  } else {
    if (RegionData[city] && RegionData[city][district]) {
      RegionData[city][district].forEach(c => {
        clubSelect.innerHTML += `<option value="${c}">${c}</option>`;
      });
    }
  }
  
  if (prefix === 'sr') {
    updateWaitersListBySelection();
  }
}

// 드롭다운 선택에 따른 소속 웨이터 실시간 리렌더링
function updateWaitersListBySelection() {
  const city = document.getElementById('sr-city').value;
  const distSelect = document.getElementById('sr-district');
  const district = distSelect ? distSelect.value : 'all';
  const clubSelect = document.getElementById('sr-club');
  const club = clubSelect ? clubSelect.value : 'all';
  
  // AppState.waiters에서 다중 타겟 조건 매칭 웨이터만 추출
  const clubWaiters = AppState.waiters.filter(w => {
    // 1. 시/도가 다르면 탈락
    if (w.city !== city) return false;
    
    // 2. 구/군 필터: 'all'이 아니면 정확히 일치해야 함
    if (district !== 'all' && w.district && w.district !== district) return false;
    
    // 3. 클럽 필터: 'all'이 아니면 정확히 일치해야 함
    if (club !== 'all' && w.club !== club) return false;
    
    return true;
  });
  
  const container = document.getElementById('booking-waiters-list');
  if (!container) return;

  if (clubWaiters.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-white/30 text-xs font-bold bg-white/30 border border-white/5 rounded-2xl">
        해당 업소에 등록된 활성 웨이터가 없습니다.
      </div>
    `;
    return;
  }

  container.innerHTML = clubWaiters.map(w => `
    <div class="glass-card p-4 rounded-2xl border-white/5 bg-[#120e26]/35 flex justify-between items-center gap-3">
      <div class="flex gap-2.5 items-center min-w-0">
        <img src="${w.avatar || KoreanAvatars.james}" class="w-10 h-10 rounded-xl object-cover border border-white/10 shrink-0"/>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="readable-text-title text-white text-xs truncate">${w.nickname}</span>
            <span class="text-[9px] text-secondary font-black bg-secondary/10 px-1.5 py-0.2 rounded-full">★ ${w.score}</span>
          </div>
          <span class="text-[9px] text-white/40 block truncate mt-0.5">${w.promotion || 'VVIP 맞춤 케어'}</span>
        </div>
      </div>
      <button class="h-9 px-4 bg-neon-gradient text-white text-[10px] font-black rounded-xl shadow-md btn-active-scale shrink-0" onclick="openReservationModal('${w.uid}', '${w.nickname}', '${w.club}')">원격예약 📅</button>
    </div>
  `).join('');
  
  renderMyBookings();
}

// 7.4.1. 원격 룸 예약 접수 팝업 렌더링 (VVIP 폼 모달 연동)
function openReservationModal(waiterUid, waiterNick, clubName) {
  // 🌟 [V0.8.1-Hotfix2] 일반 손님 예약 신청 차단 가드
  if (AppState.allUsersCache && AppState.allUsersCache[waiterUid]) {
    const targetUser = AppState.allUsersCache[waiterUid];
    if (targetUser.role === 'player') {
      showToast('⚠️ 일반 손님에게는 룸 예약을 신청할 수 없습니다!', 'warning');
      return;
    }
  }

  const modal = document.getElementById('booking-form-modal');
  if (!modal) return;

  // 모달 데이터 채우기
  document.getElementById('bf-waiter-uid').value = waiterUid;
  document.getElementById('bf-waiter-name').value = waiterNick;
  document.getElementById('bf-club-name').value = clubName;
  document.getElementById('bf-modal-waiter-desc').innerText = `[${clubName}] ${waiterNick} 웨이터님에게 테이블 예약을 신청합니다.`;
  
  // 내 연락처가 있다면 연락처 필드에 디폴트 주입
  const phoneInput = document.getElementById('bf-phone');
  if (phoneInput && AppState.currentUser) {
    phoneInput.value = AppState.currentUser.phone || '';
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeBookingFormModal() {
  const modal = document.getElementById('booking-form-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function submitBookingForm(e) {
  e.preventDefault();
  
  const waiterUid = document.getElementById('bf-waiter-uid').value;
  const waiterNick = document.getElementById('bf-waiter-name').value;
  const clubName = document.getElementById('bf-club-name').value;
  const bookingType = document.getElementById('bf-type').value;
  const guestCount = document.getElementById('bf-guests').value;
  const bookingTime = document.getElementById('bf-time').value;
  const userPhone = document.getElementById('bf-phone').value;

  try {
    const bItem = {
      clientUid: AppState.currentUser.uid,
      clientName: AppState.currentUser.nickname,
      waiterId: waiterUid,
      waiterName: waiterNick,
      clubName: clubName,
      bookingType: bookingType,
      guestCount: Number(guestCount),
      date: bookingTime, // 기존 date에 시간 결합 수용
      userPhone: userPhone,
      status: 'pending',
      createdAt: Date.now()
    };
    
    await db.collection('bookings').add(bItem);
    
    // 코치에게 인앱 실시간 통지
    const notifItem = {
      type: 'booking',
      title: '📅 신규 테이블 예약 도착!',
      body: `[신청: ${AppState.currentUser.nickname}] ㆍ [인원: ${guestCount}명]\n${bookingType} 예약 신청이 도착했습니다. 수령 목록을 확인하고 승인해 주세요! ⚡`,
      isRead: false,
      targetUid: waiterUid,
      createdAt: '방금 전'
    };
    await db.collection('notifications').add(notifItem);
    
    showToast('VVIP 예약 신청이 정상 접수되었습니다! 웨이터 수락 시 실시간 알림이 발송됩니다.', 'success');
    closeBookingFormModal();
    renderMyBookings();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

window.openReservationModal = openReservationModal;
window.closeBookingFormModal = closeBookingFormModal;
window.submitBookingForm = submitBookingForm;

// 내 예약 리스트 뷰 그리기
function renderMyBookings() {
  const container = document.getElementById('my-bookings-container');
  if (!container) return;

  if (AppState.bookings.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-white/30 text-[10px] font-bold bg-white/30 border border-white/5 rounded-2xl">
        현재 신청 완료된 원격 예약이 없습니다.
      </div>
    `;
    return;
  }

  container.innerHTML = AppState.bookings.map(b => `
    <div class="glass-card p-4 rounded-2xl border-white/5 bg-surface-container-low flex justify-between items-center gap-3">
      <div class="min-w-0">
        <span class="text-[8px] font-black uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full">${b.clubName}</span>
        <h4 class="readable-text-title text-white text-xs mt-1 truncate">담당 웨이터: ${b.waiterName}</h4>
        <div class="text-[9px] text-white/50 space-y-0.5 mt-1.5 font-medium">
          <div>테이블: <span class="text-accent font-bold">${b.bookingType || '룸 (Room)'}</span> / 인원: <span class="text-white font-bold">${b.guestCount || 2}명</span></div>
          <div>시간: <span class="text-white font-bold">${b.date}</span></div>
          <div>내 연락처: <span class="text-white/40">${b.userPhone || '010-XXXX-XXXX'}</span></div>
        </div>
      </div>
      
      <div class="flex flex-col items-end gap-2 shrink-0">
        <span class="text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full ${
          b.status === 'approved' ? 'bg-green-500/10 text-green-400' :
          b.status === 'rejected' ? 'bg-red-500/10 text-red-400' :
          b.status === 'cancelled' ? 'bg-white/5 text-white/40' : 'bg-secondary/10 text-secondary'
        }">${b.status === 'approved' ? '예약승인' : b.status === 'rejected' ? '예약반려' : b.status === 'cancelled' ? '예약취소' : '승인대기'}</span>
        
        ${b.status === 'pending' ? `
          <button class="h-7 px-3 bg-red-950/40 border border-red-500/30 text-red-400 text-[8px] font-black rounded-lg btn-active-scale shrink-0" onclick="adjustBookingStatus('${b.id}', 'cancelled')">취소</button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

// 예약 상태 변경 처리 (승인/거절/취소)
async function adjustBookingStatus(id, targetStatus) {
  try {
    const bDoc = db.collection('bookings').doc(id);
    await bDoc.update({ status: targetStatus });
    
    // 상대방 알림 처리
    const bData = (await bDoc.get()).data();
    let msgTitle = '';
    let msgBody = '';
    let targetUid = '';
    
    if (targetStatus === 'approved') {
      msgTitle = '🎉 예약 수락 완료!';
      msgBody = `[${bData.clubName}] ${bData.waiterName} 웨이터님이 예약 신청을 수락하셨습니다. 즐거운 밤 보내세요!`;
      targetUid = bData.clientUid;
    } else if (targetStatus === 'rejected') {
      msgTitle = '⚠️ 예약 반려 안내';
      msgBody = `[${bData.clubName}] ${bData.waiterName} 웨이터님의 현장 사정으로 예약이 반려되었습니다.`;
      targetUid = bData.clientUid;
    } else if (targetStatus === 'cancelled') {
      msgTitle = '📅 예약 취소 알림';
      msgBody = `${bData.clientName} 고객님이 예약 내역을 취소하셨습니다.`;
      targetUid = bData.waiterId;
    }
    
    const notifItem = {
      type: 'booking',
      title: msgTitle,
      body: msgBody,
      isRead: false,
      targetUid: targetUid,
      createdAt: '방금 전'
    };
    await db.collection('notifications').add(notifItem);
    
    showToast('예약 상태가 변경 동기화되었습니다!', 'success');
    renderPage();
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// 7.5. 포인트 차감 1:1 대화 매칭 & 채팅 (Talk Screen)
function renderTalkScreen(container) {
  container = container || document.getElementById('page-content');
  if (!container) return;
  
  // 🌟 [V1.5.5] 원클릭 대화 수락 하이패스 자동 수락 팝업 개방 트리거
  const pendingConfirmId = sessionStorage.getItem('pending_chat_room_confirm_id');
  if (pendingConfirmId) {
    sessionStorage.removeItem('pending_chat_room_confirm_id');
    setTimeout(() => {
      handleChatResolution(pendingConfirmId, 'approved');
    }, 250);
  }

  const activeRoomId = AppState.activeChatRoomId || sessionStorage.getItem('current_active_chat_room_id');

  container.innerHTML = `
    <div class="px-5 py-6 space-y-6">
      <div class="glass-card p-5 rounded-3xl border-primary/20 bg-dark-gradient">
        <p class="text-primary text-[10px] font-black uppercase tracking-wider mb-1.5">Direct Booking Talk</p>
        <h3 class="readable-text-title text-white mb-1.5">실시간 1:1 포인트 부킹 채팅</h3>
        <p class="readable-text-body text-on-surface-variant leading-relaxed">
          대화 신청을 받은 회원이 **[수락]**을 누르는 순간 채팅방이 최종 개방되며, 신청자의 포인트에서 **10 CR**이 안전하게 자동 차감됩니다.
        </p>
      </div>

      <div>
        <h3 class="text-xs font-black text-white tracking-wider mb-3.5 uppercase flex items-center gap-1.5">
          <span class="material-symbols-outlined text-primary text-sm animate-pulse">forum</span> 활성 대화방 리스트 (${AppState.chatRooms.filter(r => !(r.leftUsers && r.leftUsers.includes(AppState.currentUser.uid))).length}개)
        </h3>
        
        <div class="space-y-2.5" id="talk-rooms-list">
          ${AppState.chatRooms.filter(r => !(r.leftUsers && r.leftUsers.includes(AppState.currentUser.uid))).length === 0 ? `
            <div class="text-center py-10 text-white/30 text-xs font-bold bg-white/30 border border-white/5 rounded-2xl">
              현재 활성화된 1:1 부킹 대화방이 없습니다. 레이더 또는 웨이터 조회를 사용해 대화를 걸어보세요!
            </div>
          ` : AppState.chatRooms.filter(r => !(r.leftUsers && r.leftUsers.includes(AppState.currentUser.uid))).map(r => {
            const isSender = String(r.senderUid) === String(AppState.currentUser.uid);
            
            // 🌟 [V1.5.8] 2중 안전 장치 가드: participants나 profile이 깨지더라도 100% 렌더 크래시를 원천 차단합니다!
            let targetUid = r.targetId;
            if (r.participants && Array.isArray(r.participants)) {
              const foundTarget = r.participants.find(p => String(p) !== String(AppState.currentUser.uid));
              if (foundTarget) targetUid = foundTarget;
            }
            
            const targetProfile = getUserProfileByUid(targetUid) || {
              nickname: 'VVIP 회원',
              avatar: './assets/korean_man_user.png',
              role: 'player'
            };
            
            const targetName = (targetProfile.nickname === 'VVIP 회원' && r.name && r.name !== 'VVIP 회원') 
              ? r.name 
              : targetProfile.nickname;
            
            const targetAvatar = targetProfile.avatar || './assets/korean_man_user.png';
            
            return `
              <div class="glass-card p-4 rounded-2xl border-white/5 bg-surface-container-low flex justify-between items-center gap-3">
                <div class="flex gap-2.5 items-center min-w-0">
                  <img src="${targetAvatar}" class="w-10 h-10 rounded-xl object-cover border border-white/10 shrink-0"/>
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="readable-text-title text-white text-xs truncate">${targetName}</span>
                      <span class="text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase ${
                        r.status === 'approved' ? 'bg-green-500/10 text-green-400' :
                        r.status === 'rejected' ? 'bg-red-500/10 text-red-400' : 'bg-secondary/10 text-secondary'
                      }">${r.status === 'approved' ? '연결완료' : r.status === 'rejected' ? '거절됨' : '수락대기'}</span>
                    </div>
                    <span class="text-[9px] text-white/40 block truncate mt-0.5">${r.lastMessage}</span>
                  </div>
                </div>

                <div class="shrink-0 flex items-center gap-2">
                  ${!isSender && r.status === 'pending' ? `
                    <div class="flex gap-1.5 shrink-0">
                      <button class="h-8 px-2.5 bg-red-950/40 border border-red-500/30 text-red-400 text-[9px] font-black rounded-lg btn-active-scale" onclick="handleChatResolution('${r.id}', 'rejected')">거절</button>
                      <button class="h-8 px-2.5 bg-green-950/40 border border-green-500/30 text-green-400 text-[9px] font-black rounded-lg btn-active-scale" onclick="handleChatResolution('${r.id}', 'approved')">수락🪙</button>
                    </div>
                  ` : `
                    <div class="flex items-center gap-2 shrink-0">
                      <button class="h-9 px-3 bg-neon-gradient text-white text-[10px] font-black rounded-xl shadow-md btn-active-scale" onclick="openChatRoomDetail('${r.id}', event)">${r.status === 'approved' ? '대화입장' : '현황대기'}</button>
                      <span class="material-symbols-outlined text-white/30 hover:text-red-400 text-lg cursor-pointer transition-colors p-1" title="대화방 나가기" onclick="handleLeaveChatRoom('${r.id}', event)">logout</span>
                    </div>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- 1:1 대화 상세 메신저 뷰 (Full Screen Overlay Modal) - 🌟 [근본 해결] activeRoomId 존재 시 hidden 제거 템플릿 렌더링 -->
    <div id="chat-detail-overlay" class="fixed inset-0 z-[10025] bg-[#05050a] ${activeRoomId ? '' : 'hidden'} flex-col">
      <header class="bg-surface/80 backdrop-blur-xl border-b border-white/10 h-14 flex justify-between items-center px-5 shrink-0">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-white/60 cursor-pointer hover:text-white" onclick="closeChatRoomDetail()">arrow_back</span>
          <span id="chat-detail-title" class="font-bold text-xs">상대방 이름</span>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="material-symbols-outlined text-white/60 hover:text-red-500 text-2xl cursor-pointer transition-all hover:scale-110 active:scale-90 p-1.5 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)] hover:drop-shadow-[0_0_12px_rgba(255,0,0,0.8)]" title="채팅방 나가기" onclick="handleLeaveChatRoom('', event)">logout</span>
          <span class="text-[8px] text-secondary border border-secondary/30 bg-secondary/5 px-2 py-0.5 rounded font-black tracking-widest">SECURE BUSY MATCH</span>
        </div>
      </header>
      
      <div id="chat-messages-container" class="flex-1 overflow-y-auto p-5 space-y-3.5 hide-scrollbar">
        <!-- 메시지 루프 -->
      </div>
      
      <!-- 🌟 [V1.6.1] 이모티콘 퀵 선택 패널 -->
      <div id="emoji-picker-panel" class="hidden grid-cols-8 gap-2 p-3 bg-surface-container/95 backdrop-blur-xl border-t border-white/10 shrink-0 transition-all duration-300">
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('😊')">😊</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('😍')">😍</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('😂')">😂</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('👍')">👍</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('🔥')">🔥</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('🍾')">🍾</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('💖')">💖</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('🔵')">🔵</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('🔴')">🔴</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('👑')">👑</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('🙌')">🙌</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('🥳')">🥳</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('🍻')">🍻</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('💬')">💬</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('🤫')">🤫</span>
        <span class="text-xl cursor-pointer hover:scale-125 active:scale-95 transition-all text-center p-1" onclick="insertEmojiToInput('🚨')">🚨</span>
      </div>

      <form id="chat-input-form" class="h-16 border-t border-white/10 bg-[#0c0c1f] flex items-center px-4 gap-2 shrink-0" onsubmit="sendChatMessageSubmit(event)">
        <input type="hidden" id="chat-room-active-id" value=""/>
        <button type="button" class="w-10 h-10 bg-white/5 border border-white/10 rounded-full flex items-center justify-center shrink-0 hover:bg-white/10 transition-colors btn-active-scale" onclick="toggleEmojiPicker()">
          <span class="material-symbols-outlined text-secondary text-lg" style="font-variation-settings: 'FILL' 1;">sentiment_satisfied</span>
        </button>
        <input type="text" id="chat-message-input" placeholder="매너 있는 부킹 메시지를 적어보세요..." class="flex-1 h-10 bg-surface border border-white/10 rounded-2xl px-4 text-xs text-white focus:outline-none focus:border-primary placeholder:text-white/20"/>
        <button type="submit" class="w-10 h-10 bg-neon-gradient rounded-full flex items-center justify-center shadow-lg shadow-primary/20 shrink-0 btn-active-scale">
          <span class="material-symbols-outlined text-white text-[18px]">send</span>
        </button>
      </form>
    </div>
  `;

  // 💬 [Live Active Chat Restorer]
  // 템플릿 기반 동기식 오버레이 복구 후 하위 데이터 리렌더만 안전 수행하여 API 중복 무한 루프 완벽 차단!
  if (activeRoomId) {
    const room = AppState.chatRooms.find(r => r.id === activeRoomId) || {};
    let roomName = 'VVIP 회원';
    if (room.participants && Array.isArray(room.participants)) {
      const targetUid = room.participants.find(p => String(p) !== String(AppState.currentUser.uid)) || room.targetId;
      const targetProfile = getUserProfileByUid(targetUid) || { nickname: 'VVIP 회원' };
      roomName = targetProfile.nickname || 'VVIP 회원';
    } else {
      roomName = room.name || 'VVIP 회원';
    }
    
    const titleEl = document.getElementById('chat-detail-title');
    if (titleEl) {
      titleEl.innerText = `${roomName} 님과의 대화`;
    }
    
    const activeIdInput = document.getElementById('chat-room-active-id');
    if (activeIdInput) {
      activeIdInput.value = activeRoomId;
    }
    
    renderChatMessages(activeRoomId);
  }
}

// 7.5.1. 선수간 채팅 1:1 신청 (레이더 목록에서 대화걸기용)
async function startChatEngagement(targetUid, targetNickname) {
  if (AppState.credits < 10) {
    showToast('보유 포인트가 부족합니다. 크레딧 상점에서 충전해 주세요!', 'danger');
    openStoreModal();
    return;
  }
  
  showConfirm(`[${targetNickname}] 회원님께 1:1 부킹 대화를 신청하시겠습니까?\n상대방 수락 시 10 CR이 안전하게 자동 차감됩니다.`, async () => {
    try {
      const roomUid = [String(AppState.currentUser.uid), String(targetUid)].sort().join('_');
      const chatRef = db.collection('chats').doc(roomUid);
      
      const checkDoc = await chatRef.get();
      if (checkDoc.exists) {
        showToast('이미 진행 중이거나 신청 완료된 대화방이 존재합니다.', 'info');
        navigateTo('talk');
        return;
      }
      
      // 대기방 가개설
      const newRoom = {
        id: roomUid,
        participants: [String(AppState.currentUser.uid), String(targetUid)],
        name: targetNickname,
        lastMessage: `${AppState.currentUser.nickname}님이 대화(채팅)를 신청하셨습니다.`,
        avatar: KoreanAvatars.vipWoman,
        targetRole: 'player',
        targetId: String(targetUid),
        status: 'pending',
        senderUid: String(AppState.currentUser.uid),
        timeMs: Date.now(),
        messages: [{
          sender: String(AppState.currentUser.uid),
          text: `안녕하세요! 1:1 부킹 대화 걸고 싶습니다. 친근한 답변 기다릴게요!`,
          time: Date.now()
        }]
      };
      
      await chatRef.set(newRoom);
      
      // 상대방 알림 처리
      const userStyle = AppState.currentUser.style || '#성향미등록';
      const notifItem = {
        type: 'chat',
        title: '💬 새 대화 신청 도착',
        body: `[신청자: ${AppState.currentUser.nickname}] ㆍ [성향: ${userStyle}]\n상대방님이 1:1 대화를 요청했습니다. 채팅 탭에서 즉시 수락해 보세요! ⚡`,
        isRead: false,
        targetUid: targetUid,
        createdAt: '방금 전',
        chatRoomId: roomUid,      // 🌟 [V0.8.1-Hotfix2] 알림 클릭 시 순간이동을 위한 대화방 ID
        linkPage: 'talk'          // 🌟 [V0.8.1-Hotfix2] 알림 클릭 시 리다이렉트될 페이지 정보
      };
      await db.collection('notifications').add(notifItem);
      
      showToast('대화가 성공적으로 신청되었습니다. 상대방 수락 대기 중!', 'success');
      navigateTo('talk');
    } catch (e) {
      showToast(e.message, 'danger');
    }
  });
}

function startDirectTalk(targetUid, targetNickname) {
  // 🌟 [V0.8.1 NEW] 레이더에서 채팅 버튼 터치 시 즉시 1:1 대화 걸기 트랜잭션 호출
  startChatEngagement(targetUid, targetNickname);
}

// 7.5.2. 채팅 신청 수락/거절 핵심 포인트 차감 로직 (사용자 보완책 4 적용)
async function handleChatResolution(roomId, resolution) {
  try {
    const roomRef = db.collection('chats').doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      showToast('대화방 정보를 찾을 수 없습니다.', 'danger');
      return;
    }
    const room = roomSnap.data();
    const senderUid = room.senderUid;
    
    // 신청자 프로필 가져오기 (originalCredits를 팝업 컨펌에 표시하기 위함)
    const senderSnap = await db.collection('users').doc(senderUid).get();
    if (!senderSnap.exists) {
      showToast('신청자 회원 프로필을 찾을 수 없습니다.', 'danger');
      return;
    }
    const sender = senderSnap.data();

    if (resolution === 'approved') {
      const originalCredits = Number(sender.credits) || 0;
      if (originalCredits < 10) {
        showToast('신청자의 포인트가 부족하여 매칭이 자동 거절되었습니다.', 'danger');
        
        await fetch(`/api/chat/accept`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Active-Session-Id': localStorage.getItem('mock_session_id') || '',
            'X-User-Uid': String(AppState.currentUser.uid)
          },
          body: JSON.stringify({
            roomId: roomId,
            resolution: 'rejected',
            userUid: AppState.currentUser.uid
          })
        });
        renderTalkScreen();
        return;
      }
      
      // 수락 전 2중 안내 팝업 작동 (모의 UI 팝업 컨펌)
      openDeductionConfirmModal(`[수락 진행] 1:1 부킹 대화를 최종 수락하시겠습니까?\n수락 시 신청자 [\${sender.nickname}] 님의 포인트에서 10 CR이 즉시 자동 차감됩니다.`, 10, originalCredits, async () => {
        try {
          console.log('[DEBUG-CLIENT] 🚀 /api/chat/accept fetch API 기동 시도! roomId:', roomId, 'userUid:', AppState.currentUser.uid);
          // 백엔드 벌크 단독 트랜잭션 API 호출!
          const res = await fetch(`/api/chat/accept`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Active-Session-Id': localStorage.getItem('mock_session_id') || '',
              'X-User-Uid': String(AppState.currentUser.uid)
            },
            body: JSON.stringify({
              roomId: roomId,
              resolution: 'approved',
              userUid: AppState.currentUser.uid
            })
          });

          console.log('[DEBUG-CLIENT] 📬 /api/chat/accept 응답 수신완료. Status:', res.status, 'ok:', res.ok);

          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.message || '매칭 수락 처리 중 서버 에러 발생');
          }

          const resData = await res.json();

          showToast('부킹 매칭에 성공하였습니다! 안전하고 즐거운 대화를 나누세요.', 'success');
          renderTalkScreen();
          // 매칭 즉시 상세 채팅방 강제 오픈 하이패스
          setTimeout(() => {
            openChatRoomDetail(roomId);
          }, 150);
        } catch (err) {
          showToast(err.message, 'danger');
        }
      });
    } else {
      // 거절 처리 (백엔드 API 호출)
      const res = await fetch(`/api/chat/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Active-Session-Id': localStorage.getItem('mock_session_id') || '',
          'X-User-Uid': String(AppState.currentUser.uid)
        },
        body: JSON.stringify({
          roomId: roomId,
          resolution: 'rejected',
          userUid: AppState.currentUser.uid
        })
      });

      if (res.ok) {
        showToast('대화 신청을 정중하게 거절하셨습니다.', 'info');
      } else {
        showToast('대화 신청 거절 중 에러가 발생했으나 정상 처리되었습니다.', 'warning');
      }
      renderTalkScreen();
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// 🌟 [V0.8.1-Hotfix2] 1:1 대화 읽음 처리 함수
async function markChatMessagesAsRead(roomId) {
  const roomIdx = AppState.chatRooms.findIndex(r => r.id === roomId);
  if (roomIdx === -1) return;
  const room = AppState.chatRooms[roomIdx];
  
  let changed = false;
  const updatedMessages = room.messages.map(m => {
    if (String(m.sender) !== String(AppState.currentUser.uid) && m.isRead !== true) {
      m.isRead = true;
      changed = true;
    }
    return m;
  });
  
  if (changed) {
    room.messages = updatedMessages;
    try {
      await db.collection('chats').doc(roomId).update({
        messages: updatedMessages
      });
      updateHeaderAndNav(); // 뱃지 즉각 동기화
    } catch (e) {
      console.error("❌ [ReadSync] 메시지 읽음 갱신 실패:", e);
    }
  }
}

// 7.5.3. 1:1 대화상세 메신저 뷰 개방/폐쇄
function openChatRoomDetail(roomId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  
  try {
    AppState.activeChatRoomId = roomId; // 💬 [Live Chat] 활성 대화방 ID 기록!
    
    // 🔒 [Session Save] 새로고침 시에도 대화방이 닫히지 않고 그대로 열린 상태로 자석 복구되게 세션 기록!
    sessionStorage.setItem('current_active_chat_room_id', roomId);

    const overlay = document.getElementById('chat-detail-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
    }
    
    const activeIdInput = document.getElementById('chat-room-active-id');
    if (activeIdInput) {
      activeIdInput.value = roomId;
    }
    
    // 🌟 [V0.8.1-Hotfix2] 입장 즉시 안 읽은 메시지 읽음 처리 가동
    markChatMessagesAsRead(roomId);
    
    const room = AppState.chatRooms.find(r => r.id === roomId) || {};
    
    // 🌟 [V1.5.8] 2중 안전 장치 가드: 대화방 상대 닉네임 동적 조회 시 렌더 크래시 원천 차단!
    let roomName = 'VVIP 회원';
    if (room.participants && Array.isArray(room.participants)) {
      const targetUid = room.participants.find(p => String(p) !== String(AppState.currentUser.uid)) || room.targetId;
      const targetProfile = getUserProfileByUid(targetUid) || { nickname: 'VVIP 회원' };
      roomName = targetProfile.nickname || 'VVIP 회원';
    } else {
      roomName = room.name || 'VVIP 회원';
    }
    
    const titleEl = document.getElementById('chat-detail-title');
    if (titleEl) {
      titleEl.innerText = `${roomName} 님과의 대화`;
    }
    
    renderChatMessages(roomId);
    
    // 🔒 [V1.6.0 방안 C 가드] 상대방이 이미 퇴장한 경우 메시지 전송 및 입력 잠금
    const isTargetLeft = room.leftUsers && room.leftUsers.length > 0 && !room.leftUsers.includes(AppState.currentUser.uid);
    const textInput = document.getElementById('chat-message-input');
    const sendFormBtn = document.querySelector('#chat-input-form button[type="submit"]');
    
    if (isTargetLeft) {
      if (textInput) {
        textInput.disabled = true;
        textInput.placeholder = "상대방이 대화방을 나갔습니다. (대화불가)";
        textInput.value = "";
      }
      if (sendFormBtn) {
        sendFormBtn.disabled = true;
        sendFormBtn.classList.add('opacity-50', 'pointer-events-none');
      }
      if (titleEl) {
        titleEl.innerText = `${roomName} (퇴장함) 님과의 대화`;
      }
    } else {
      if (textInput) {
        textInput.disabled = false;
        textInput.placeholder = "매너 있는 부킹 메시지를 적어보세요...";
      }
      if (sendFormBtn) {
        sendFormBtn.disabled = false;
        sendFormBtn.classList.remove('opacity-50', 'pointer-events-none');
      }
      if (textInput) textInput.focus();
    }
  } catch (err) {
    console.error("❌ [ChatDetail] 대화방 개방 런타임 오류:", err);
  }

  // ⏱️ [0.5초 하이브리드 폴링 가드]
  // SSE 실시간 소켓이 터널링 순단이나 맥북 잠들기 등으로 마비되어도, 
  // 대화창을 보고 있는 찰나에는 0.5초마다 강제로 서버를 낚아채 최신 메시지를 리액티브 리렌더링시킵니다!
  if (liveChatPollingInterval) clearInterval(liveChatPollingInterval);
  liveChatPollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/db/chats/${roomId}`);
      if (res.ok) {
        const freshData = await res.json();
        const rIdx = AppState.chatRooms.findIndex(r => r.id === roomId);
        if (rIdx > -1) {
          const prevMsgCount = AppState.chatRooms[rIdx].messages.length;
          const freshMsgCount = (freshData.messages || []).length;
          
          const prevLeftCount = (AppState.chatRooms[rIdx].leftUsers || []).length;
          const freshLeftCount = (freshData.leftUsers || []).length;

          // 메시지 배열 개수 또는 퇴장자 목록 개수가 달라졌을 때 리액티브 리렌더링 발동
          if (prevMsgCount !== freshMsgCount || prevLeftCount !== freshLeftCount) {
            console.log("⏱️ [Hybrid Polling] 대화방 변경 감지! 새로고침 없이 0.5초 리액티브 렌더러 가동!");
            AppState.chatRooms[rIdx].messages = freshData.messages || [];
            AppState.chatRooms[rIdx].lastMessage = freshData.lastMessage || '';
            AppState.chatRooms[rIdx].timeMs = freshData.timeMs || Date.now();
            AppState.chatRooms[rIdx].leftUsers = freshData.leftUsers || [];
            
            if (AppState.activeChatRoomId === roomId) {
              renderChatMessages(roomId);
            }
          }
        }
      }
    } catch (e) {
      console.warn("⏱️ [Hybrid Polling] 폴링 패치 지연 발생: ", e.message);
    }
  }, 500);

  // 실시간 단일 채팅 문서 snapshot 리스너 바인딩 (메모리 샌드박스 개별 문서 리스너 트리거)
  db.collection('chats').doc(roomId).onSnapshot((doc) => {
    if (doc.exists) {
      const freshData = doc.data();
      const rIdx = AppState.chatRooms.findIndex(r => r.id === roomId);
      if (rIdx > -1) {
        AppState.chatRooms[rIdx].messages = freshData.messages || [];
        AppState.chatRooms[rIdx].lastMessage = freshData.lastMessage || '';
        AppState.chatRooms[rIdx].timeMs = freshData.timeMs || Date.now();
        AppState.chatRooms[rIdx].leftUsers = freshData.leftUsers || [];
      }
      if (AppState.activeChatRoomId === roomId) {
        renderChatMessages(roomId);
      }
    }
  });
}

function closeChatRoomDetail() {
  AppState.activeChatRoomId = null; // 💬 [Live Chat] 대화방 퇴장 시 활성 ID 초기화!
  
  // 🔒 [Session Clear] 퇴장 시 대화방 복원용 세션도 동시 전격 파기!
  sessionStorage.removeItem('current_active_chat_room_id');

  // ⏱️ [Polling Clear] 자원 낭비를 방지하기 위해 0.5초 하이브리드 폴링 데몬 전격 해제!
  if (liveChatPollingInterval) {
    clearInterval(liveChatPollingInterval);
    liveChatPollingInterval = null;
  }

  document.getElementById('chat-detail-overlay').classList.add('hidden');
}

function renderChatMessages(roomId) {
  const container = document.getElementById('chat-messages-container');
  const room = AppState.chatRooms.find(r => r.id === roomId);
  if (!container || !room) return;

  // 🔒 [V1.6.0 방안 C 실시간 가드] 상대방 퇴장 여부에 따라 인풋 및 전송 버튼 상태 동적 연계 제어
  const isTargetLeft = room.leftUsers && room.leftUsers.length > 0 && !room.leftUsers.includes(AppState.currentUser.uid);
  const textInput = document.getElementById('chat-message-input');
  const sendFormBtn = document.querySelector('#chat-input-form button[type="submit"]');
  const titleEl = document.getElementById('chat-detail-title');
  
  if (isTargetLeft) {
    if (textInput) {
      textInput.disabled = true;
      textInput.placeholder = "상대방이 대화방을 나갔습니다. (대화불가)";
      textInput.value = "";
    }
    if (sendFormBtn) {
      sendFormBtn.disabled = true;
      sendFormBtn.classList.add('opacity-50', 'pointer-events-none');
    }
    if (titleEl) {
      // 🌟 targetProfile 동적 조회
      let roomName = room.name || 'VVIP 회원';
      if (room.participants && Array.isArray(room.participants)) {
        const targetUid = room.participants.find(p => String(p) !== String(AppState.currentUser.uid)) || room.targetId;
        const targetProfile = getUserProfileByUid(targetUid);
        if (targetProfile) roomName = targetProfile.nickname;
      }
      titleEl.innerText = `${roomName} (퇴장함) 님과의 대화`;
    }
  } else {
    if (textInput) {
      textInput.disabled = false;
      textInput.placeholder = "매너 있는 부킹 메시지를 적어보세요...";
    }
    if (sendFormBtn) {
      sendFormBtn.disabled = false;
      sendFormBtn.classList.remove('opacity-50', 'pointer-events-none');
    }
  }

  container.innerHTML = room.messages.map(m => {
    const senderId = m.senderUid || m.sender;
    const isMe = String(senderId) === String(AppState.currentUser.uid);
    const isSystem = String(senderId) === 'system';
    
    if (isSystem) {
      return `
        <div class="flex justify-center w-full my-2">
          <div class="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-[9px] text-white/50 tracking-wider flex items-center gap-1.5 shadow-sm">
            <span class="material-symbols-outlined text-[11px] text-red-400">logout</span>
            <span>${m.text}</span>
          </div>
        </div>
      `;
    }
    
    return `
      <div class="flex ${isMe ? 'justify-end' : 'justify-start'} w-full">
        <div class="max-w-[75%] rounded-2xl p-3.5 text-xs leading-relaxed ${
          isMe ? 'bg-primary text-white rounded-tr-none' : 'bg-surface-container border border-white/5 text-white/90 rounded-tl-none'
        }">
          <p>${m.text}</p>
        </div>
      </div>
    `;
  }).join('');
  
  // ⚡ [Smooth Scroll To Bottom] 카카오톡처럼 부드러운 스크롤 애니메이션 적용!
  setTimeout(() => {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
  }, 50);
}

// 1:1 대화 전송 제출
async function sendChatMessageSubmit(e) {
  e.preventDefault();
  const roomId = document.getElementById('chat-room-active-id').value;
  const textInput = document.getElementById('chat-message-input');
  const text = textInput.value.trim();
  
  if (!text) return;

  const room = AppState.chatRooms.find(r => r.id === roomId);
  if (!room) return;

  const newMsg = {
    sender: AppState.currentUser.uid,
    text: text,
    time: Date.now()
  };

  // ⚡ [Direct Push] 서버 응답 지연을 방어하기 위해 내 로컬 상태에 0초 즉각 렌더링 노출!
  room.messages = [...room.messages, newMsg];
  room.lastMessage = text;
  room.timeMs = Date.now();
  
  // 대화방 정렬 상태 갱신
  AppState.chatRooms = AppState.chatRooms.sort((a, b) => b.timeMs - a.timeMs);
  
  // 즉각 화면 업데이트 및 부드러운 스크롤링
  renderChatMessages(roomId);
  
  textInput.value = '';

  try {
    await db.collection('chats').doc(roomId).update({
      messages: room.messages,
      lastMessage: text,
      timeMs: Date.now()
    });
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// 7.6. 내 설정 & 알림 (Profile Screen)
function renderProfileScreen(container) {
  container = container || document.getElementById('page-content');
  if (!container) return;
  const user = AppState.currentUser || {};
  
  container.innerHTML = `
    <div class="px-5 py-6 space-y-6">
      
      <!-- 내 기본 정보 카드 -->
      <div class="glass-card p-5 rounded-3xl border-primary/20 bg-dark-gradient relative">
        <div class="flex gap-4 items-center mb-4">
          <img src="${user.avatar || KoreanAvatars.me}" class="w-14 h-14 rounded-2xl object-cover border border-white/10"/>
          <div>
            <div class="flex items-center gap-1.5">
              <h3 class="readable-text-title text-white text-base">${user.nickname}</h3>
              <span class="text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                user.role === 'coach' ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-primary/10 text-primary border border-primary/20'
              }">${user.role === 'coach' ? '웨이터' : '선수'}</span>
            </div>
            <span class="text-xs text-white/50 font-bold block mt-1">${user.phone}</span>
          </div>
        </div>

        <div class="bg-black/30 border border-white/5 rounded-2xl p-3 flex justify-between items-center text-xs">
          <span class="text-white/60 font-semibold">보유 VVIP 크레딧</span>
          <span class="text-secondary font-black text-sm text-shadow-gold" id="profile-credit-balance">${AppState.credits} CR</span>
        </div>
      </div>

      <!-- 포인트 충전소 바로가기 대형 엄지 터치 존 -->
      <button class="thumb-touch-btn w-full bg-gold-gradient text-black font-black shadow-lg shadow-secondary/10 btn-active-scale" onclick="openStoreModal()">
        <span class="material-symbols-outlined font-black">add_circle</span> VVIP 크레딧 충전 상점 입장 🪙
      </button>

      <!-- 사용자 롤별 세부 설정 -->
      <div class="glass-card p-5 rounded-3xl border-white/5 bg-surface/50 space-y-4">
        <h4 class="text-xs font-black text-white tracking-tight uppercase border-b border-white/5 pb-2">회원 부가 정보</h4>
        
        ${user.role === 'player' ? `
          <div>
            <span class="text-[9px] text-white/50 block font-bold mb-1">내 매칭 성향</span>
            <input type="text" id="prof-style" value="${user.style || ''}" class="w-full h-11 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary"/>
          </div>
        ` : `
          <div class="space-y-3">
            <!-- ⚡ 실시간 레이더 출근 / 퇴근 스위치 -->
            <div class="flex justify-between items-center bg-black/40 p-3 rounded-2xl border border-white/5">
              <div>
                <span class="text-[10px] text-white/80 font-black block">⚡ 실시간 레이더 스캔 노출</span>
                <span class="text-[8px] text-white/40 block mt-0.5" id="duty-status-desc">
                  ${user.status === 'active' ? '● 현재 영업 중 (레이더 노출)' : '○ 현재 휴무/퇴근 (레이더 차단)'}
                </span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer select-none">
                <input type="checkbox" id="waiter-duty-switch" class="sr-only peer" 
                       ${user.status === 'active' ? 'checked' : ''} 
                       onchange="toggleWaiterDutyStatus(this.checked)"/>
                <div class="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div>
              <span class="text-[9px] text-white/50 block font-bold mb-1">소속 나이트클럽</span>
              <div class="text-xs text-white font-bold bg-white/5 border border-white/10 rounded-xl p-2.5">${user.club}</div>
            </div>
            <div>
              <span class="text-[9px] text-white/50 block font-bold mb-1">코치 한줄 어필</span>
              <textarea id="prof-promotion" rows="2" class="w-full bg-surface border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-primary">${user.promotion || ''}</textarea>
            </div>
          </div>
        `}

        <button class="thumb-touch-btn w-full bg-white/5 border border-white/10 text-white font-bold btn-active-scale mt-3" onclick="updateProfileSettingsSubmit()">내 정보 저장 💾</button>
      </div>

      <!-- 🔔 카카오톡 스타일 알림 환경 설정 -->
      <div class="glass-card p-5 rounded-3xl border-white/5 bg-surface/50 space-y-4">
        <h4 class="text-xs font-black text-white tracking-tight uppercase border-b border-white/5 pb-2">🔔 카카오톡 스타일 알림 설정</h4>
        
        <div class="flex justify-between items-center text-xs">
          <span class="text-white/80 font-semibold">알림 효과음 재생 🔊</span>
          <label class="relative inline-flex items-center cursor-pointer select-none">
            <input type="checkbox" id="setting-sound-switch" class="sr-only peer" 
                   ${AppState_NotificationSettings.sound ? 'checked' : ''} 
                   onchange="toggleNotificationSetting('sound', this.checked)"/>
            <div class="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <div class="flex justify-between items-center text-xs">
          <span class="text-white/80 font-semibold">알림 스마트폰 진동 📳</span>
          <label class="relative inline-flex items-center cursor-pointer select-none">
            <input type="checkbox" id="setting-vibrate-switch" class="sr-only peer" 
                   ${AppState_NotificationSettings.vibrate ? 'checked' : ''} 
                   onchange="toggleNotificationSetting('vibrate', this.checked)"/>
            <div class="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      </div>

      <!-- 🚪 로그아웃 동선 단축 대형 엄지 터치 버튼 -->
      <button class="thumb-touch-btn w-full bg-red-950/40 border border-red-500/30 text-red-400 font-black btn-active-scale shadow-lg shadow-red-500/10 flex items-center justify-center gap-2 mt-4" onclick="logout()">
        <span class="material-symbols-outlined text-red-400">logout</span>
        로그아웃 및 세션 해제 🚪
      </button>

      <!-- 🌟 기획 릴리즈 버전 명시 라벨 (Platform Snaps Version) -->
      <div class="text-center mt-6 mb-2">
        <p class="text-[10px] text-white/30 font-bold uppercase tracking-wider">
          Platform Snaps Version: <span class="text-primary font-black drop-shadow-[0_0_8px_rgba(255,0,127,0.4)]">${APP_RELEASE_VERSION}</span>
        </p>
      </div>

    </div>
  `;
}

// 프로필 정보 수정 업데이트
async function updateProfileSettingsSubmit() {
  const updateData = {};
  if (AppState.userRole === 'player') {
    updateData.style = document.getElementById('prof-style').value;
  } else {
    updateData.promotion = document.getElementById('prof-promotion').value;
  }

  try {
    await db.collection('users').doc(AppState.currentUser.uid).update(updateData);
    showToast('회원 세부 설정이 업데이트되었습니다!', 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// 🌟 [V0.8.1-Hotfix2] 웨이터 출퇴근(휴무) 실시간 토글 제어 엔진
async function toggleWaiterDutyStatus(checked) {
  if (!AppState.currentUser) return;
  const uid = AppState.currentUser.uid;
  const targetStatus = checked ? 'active' : 'inactive';
  
  const updateData = {
    status: targetStatus,
    lat: checked ? 36.3289 + (AppState.currentGPSDistance * 0.000009) : null,
    lng: checked ? 127.4246 : null
  };
  
  try {
    await db.collection('users').doc(uid).update(updateData);
    await db.collection('waiters').doc(uid).update(updateData);
    
    const descEl = document.getElementById('duty-status-desc');
    if (descEl) {
      descEl.innerText = checked 
        ? '● 현재 영업 중 (레이더 노출)' 
        : '○ 현재 휴무/퇴근 (레이더 차단)';
    }
    
    showToast(checked 
      ? '⚡ 실시간 레이더 출근 완료! 주변 선수단 레이더에 감지됩니다.' 
      : '🚪 퇴근(휴무) 처리 완료. 레이더 스캔 대상에서 해제되었습니다.', 'success');
  } catch (e) {
    showToast('⚠️ 상태 변경에 실패했습니다: ' + e.message, 'danger');
    const switchEl = document.getElementById('waiter-duty-switch');
    if (switchEl) switchEl.checked = !checked;
  }
}
window.toggleWaiterDutyStatus = toggleWaiterDutyStatus;

// 🌟 [V0.8.1-Hotfix2] 알림 클릭 시 1:1 대화방 순간이동 핸들러
async function readAndRedirectNotification(notifId, linkPage, chatRoomId) {
  try {
    // 1. 로컬 캐시 즉시 업데이트 (0초 반응 속도용)
    const notif = AppState.notifications.find(n => n.id === notifId);
    if (notif) {
      notif.isRead = true;
    }
    
    // 2. DB 읽음 처리 업데이트
    await db.collection('notifications').doc(notifId).update({ isRead: true });
    
    // 3. 네비게이션 & 헤더 배지 실시간 동기화
    updateHeaderAndNav();
  } catch (e) {
    console.error("❌ [NotifSync] 알림 읽음 갱신 실패:", e);
  }
  
  if (linkPage === 'talk' && chatRoomId) {
    try {
      const roomRef = db.collection('chats').doc(chatRoomId);
      const roomSnap = await roomRef.get();
      if (roomSnap.exists) {
        const roomData = roomSnap.data();
        if (roomData.status === 'approved') {
          sessionStorage.setItem('current_active_chat_room_id', chatRoomId);
        } else {
          showToast(`💬 채팅 탭에서 [${roomData.name || 'VVIP 회원'}] 님의 1:1 대화 신청을 수락해 주세요! 🪙`, 'info', 6000);
        }
      }
    } catch (err) {
      console.warn("⚠️ 대화방 상태 조회 실패:", err);
    }
    navigateTo('talk');
  } else {
    renderNotificationsScreen();
  }
}
window.readAndRedirectNotification = readAndRedirectNotification;

// 🌟 [V1.5.5] 백그라운드 무진동/무음 알림 읽음 처리 (즉각 배지 동기화용)
async function readNotificationSilently(notifId) {
  try {
    const notif = AppState.notifications.find(n => n.id === notifId);
    if (notif) notif.isRead = true;
    await db.collection('notifications').doc(notifId).update({ isRead: true });
    updateHeaderAndNav();
    if (AppState.currentPage === 'notifications') {
      renderNotificationsScreen();
    }
  } catch (e) {
    console.error("❌ [SilentNotifSync] 읽음 갱신 실패:", e);
  }
}
window.readNotificationSilently = readNotificationSilently;

// 🌟 [V1.5.5] VIP 양주 주류 50% 할인 쿠폰 다운로드 액션 (즉시 읽음 처리 및 쿠폰 가산)
async function downloadPromoCoupon(notifId, waiterNick) {
  if (!AppState.currentUser) {
    showToast('⚠️ 로그인이 필요한 서비스입니다!', 'warning');
    navigateTo('signup');
    return;
  }
  
  try {
    // 1. 알림 즉시 읽음 처리
    await readNotificationSilently(notifId);
    
    // 2. 유저 쿠폰 추가 트랜잭션 시뮬레이션
    const userRef = db.collection('users').doc(AppState.currentUser.uid);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      const uData = userSnap.data();
      const downloadedCoupons = uData.downloadedCoupons || [];
      const newCoupon = {
        id: 'cp_' + Date.now(),
        title: `🍾 [${waiterNick}] 웨이터 양주 50% 특별 할인권`,
        barCode: 'VIP-BARCODE-998822',
        createdAt: new Date().toISOString()
      };
      
      await userRef.update({
        downloadedCoupons: [...downloadedCoupons, newCoupon]
      });
      
      showToast(`🎁 [${waiterNick}] 웨이터의 양주 50% 주류 할인 쿠폰이 성공적으로 영구 다운로드되었습니다! 내 설정에서 확인하세요.`, 'success', 6000);
    }
  } catch (err) {
    showToast('쿠폰 다운로드 실패: ' + err.message, 'danger');
  }
}
window.downloadPromoCoupon = downloadPromoCoupon;

// 🌟 [V1.5.5] 리무진 픽업 서비스 즉시 신청 액션 (즉시 읽음 처리 및 대기 신청)
async function requestWaiterPickup(notifId, waiterUid, waiterNick) {
  if (!AppState.currentUser) {
    showToast('⚠️ 로그인이 필요한 서비스입니다!', 'warning');
    navigateTo('signup');
    return;
  }
  
  try {
    // 1. 알림 즉시 읽음 처리
    await readNotificationSilently(notifId);
    
    // 2. 웨이터에게 픽업 요청 알림 전송
    const notifItem = {
      type: 'system',
      title: '🚙 고객 리무진/픽업 서비스 신청 접수',
      body: `VVIP 고객 [${AppState.currentUser.nickname}] 님이 픽업 서비스를 신청하셨습니다! 빠르게 고객 연락처로 연락 및 모시러 출동하세요!`,
      isRead: false,
      targetUid: waiterUid,
      createdAt: '방금 전'
    };
    await db.collection('notifications').add(notifItem);
    
    showToast(`🚙 [${waiterNick}] 웨이터에게 여성전용 픽업 서비스가 실시간 신청되었습니다! 곧 연락이 갑니다.`, 'success', 6000);
  } catch (err) {
    showToast('픽업 신청 실패: ' + err.message, 'danger');
  }
}
window.requestWaiterPickup = requestWaiterPickup;

// 🌟 [V1.5.5] 홍보 알림 내 VVIP 특전: 웨이터와 무료 1:1 대화방 개설 및 진입 핸들러
async function openFreeChatRoomWithWaiter(waiterUid, waiterNick) {
  if (!AppState.currentUser) {
    showToast('⚠️ 로그인이 필요한 서비스입니다!', 'warning');
    navigateTo('signup');
    return;
  }
  
  try {
    // 1. 이미 존재하는 1:1 대화방이 있는지 검색
    const chatsSnap = await db.collection('chats').get();
    const chatsList = chatsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    let matchedRoom = chatsList.find(c => 
      (String(c.senderUid) === String(AppState.currentUser.uid) && String(c.receiverUid) === String(waiterUid)) ||
      (String(c.senderUid) === String(waiterUid) && String(c.receiverUid) === String(AppState.currentUser.uid))
    );

    let chatRoomId = '';
    
    if (matchedRoom) {
      chatRoomId = matchedRoom.id;
      // 이미 방이 존재한다면 상태를 approved로 동기화해서 바로 열리도록 보장
      if (matchedRoom.status !== 'approved') {
        await db.collection('chats').doc(chatRoomId).update({ status: 'approved' });
      }
    } else {
      // 새 방 개설 (무료 개방이므로 status: 'approved' 상태로 직접 생성!)
      const newRoomRef = await db.collection('chats').add({
        senderUid: String(AppState.currentUser.uid),
        senderNick: AppState.currentUser.nickname,
        receiverUid: String(waiterUid),
        receiverNick: waiterNick,
        participants: [String(AppState.currentUser.uid), String(waiterUid)],
        status: 'approved',
        createdAt: Date.now(),
        lastMessage: '👋 VVIP 1:1 무료 매칭 대화방이 즉시 개설되었습니다.',
        lastMessageAt: Date.now()
      });
      chatRoomId = newRoomRef.id;
    }

    // 대화방 ID를 세션에 설정하고 talk 탭으로 순간이동
    sessionStorage.setItem('current_active_chat_room_id', chatRoomId);
    showToast(`💬 ${waiterNick} 웨이터님과의 VVIP 무료 1:1 대화방이 즉시 연결되었습니다!`, 'success');
    navigateTo('talk');
    // 즉시 대방 상세 열기 호출 연계
    setTimeout(() => {
      openChatRoomDetail(chatRoomId);
    }, 150);
  } catch (err) {
    showToast(err.message, 'danger');
  }
}
window.openFreeChatRoomWithWaiter = openFreeChatRoomWithWaiter;

// 🌟 [V1.5.5] 홍보 알림 액션 버튼을 통한 다이렉트 1:1 무료 대화방 개설 (알림 읽음 동기화 추가)
async function openFreeChatRoomWithWaiterDirect(notifId, waiterUid, waiterNick) {
  await readNotificationSilently(notifId); // 즉시 알림 점 소거
  await openFreeChatRoomWithWaiter(waiterUid, waiterNick); // 무료 대방 기동
}
window.openFreeChatRoomWithWaiterDirect = openFreeChatRoomWithWaiterDirect;

// 7.6.1. 인앱 알림 센터 뷰 (Notifications Screen)
function renderNotificationsScreen(container) {
  const cont = container || document.getElementById('page-content');
  if (!cont) return;
  
  cont.innerHTML = `
    <div class="px-5 py-6 space-y-6">
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-xs font-black text-white tracking-wider flex items-center gap-1.5 uppercase">
          <span class="material-symbols-outlined text-primary text-sm animate-pulse" style="font-variation-settings:'FILL' 1">notifications</span> 실시간 알림 수신함 (${AppState.notifications.length}건)
        </h3>
        
        <button class="text-[10px] font-bold text-accent uppercase tracking-tighter btn-active-scale" onclick="readAllNotifications()">전체 읽음 처리</button>
      </div>

      <div class="space-y-2.5" id="notifications-box-list">
        ${AppState.notifications.length === 0 ? `
          <div class="text-center py-12 text-white/30 text-xs font-bold bg-white/30 border border-white/5 rounded-2xl">
            수신된 알림 메시지가 없습니다.
          </div>
        ` : AppState.notifications.map(n => `
          <div class="glass-card p-4 rounded-2xl border-white/5 ${n.isRead ? 'bg-surface-container-low/40 opacity-70' : 'bg-surface-container-low'} flex flex-col gap-3 cursor-pointer active:scale-[0.98] transition-all" onclick="readAndRedirectNotification('${n.id}', '${n.linkPage || ''}', '${n.chatRoomId || ''}')">
            <div class="flex justify-between items-start gap-3 w-full">
              <div class="min-w-0">
                <h4 class="readable-text-title text-white text-xs ${n.isRead ? '' : 'text-primary-container'}">${n.title}</h4>
                <p class="readable-text-body text-on-surface-variant/90 leading-relaxed mt-1">${n.body}</p>
                <span class="text-[8px] text-white/40 block mt-2">${n.createdAt}</span>
              </div>
              
              ${!n.isRead ? `
                <span class="w-2.5 h-2.5 bg-cyan-400 rounded-full shrink-0 animate-pulse mt-1 shadow-[0_0_8px_#22d3ee]"></span>
              ` : ''}
            </div>

            <!-- 홍보 알림인 경우 VVIP 액션 트리거 4대 프로모션 맞춤 단추 노출 -->
            ${n.type === 'promo' ? `
              <div class="flex gap-2 w-full pt-1" onclick="event.stopPropagation()">
                ${n.promoType === 'discount' ? `
                  <button onclick="downloadPromoCoupon('${n.id}', '${n.senderNick || '웨이터'}')" class="flex-1 h-8 bg-amber-950/40 border border-amber-500/30 rounded-xl flex items-center justify-center gap-1 text-[9px] font-black text-amber-400 btn-active-scale">
                    <span class="material-symbols-outlined text-[10px]">redeem</span> 🎁 양주 할인 쿠폰 다운로드
                  </button>
                ` : n.promoType === 'freepass' ? `
                  <button onclick="openFreeChatRoomWithWaiterDirect('${n.id}', '${n.senderUid}', '${n.senderNick || '웨이터'}')" class="flex-1 h-8 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center justify-center gap-1 text-[9px] font-black text-emerald-400 btn-active-scale">
                    <span class="material-symbols-outlined text-[10px]">confirmation_number</span> 🎫 1초 무료 대화 바로입장
                  </button>
                ` : n.promoType === 'pickup' ? `
                  <button onclick="requestWaiterPickup('${n.id}', '${n.senderUid}', '${n.senderNick || '웨이터'}')" class="flex-1 h-8 bg-indigo-950/40 border border-indigo-500/30 rounded-xl flex items-center justify-center gap-1 text-[9px] font-black text-indigo-400 btn-active-scale">
                    <span class="material-symbols-outlined text-[10px]">local_taxi</span> 🚙 리무진 픽업 즉시 신청
                  </button>
                ` : `
                  <!-- 기본 또는 이벤트 타입 -->
                  ${n.senderPhone ? `
                    <a href="tel:${n.senderPhone}" onclick="readNotificationSilently('${n.id}')" class="flex-1 h-8 bg-cyan-950/40 border border-cyan-500/30 rounded-xl flex items-center justify-center gap-1 text-[9px] font-black text-cyan-400 btn-active-scale">
                      <span class="material-symbols-outlined text-[10px]">phone</span> 1초 다이렉트 통화
                    </a>
                  ` : ''}
                  <button onclick="openFreeChatRoomWithWaiterDirect('${n.id}', '${n.senderUid}', '${n.senderNick || '웨이터'}')" class="flex-1 h-8 bg-pink-950/40 border border-pink-500/30 rounded-xl flex items-center justify-center gap-1 text-[9px] font-black text-pink-400 btn-active-scale">
                    <span class="material-symbols-outlined text-[10px]">chat</span> 1:1 대화 무료개방
                  </button>
                `}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// 알림 전체 읽음 처리 (V1.5.7 벌크 리팩토링: 비동기 경쟁 해소 및 0초 반응 속도용)
async function readAllNotifications() {
  if (!AppState.currentUser) return;
  const unreadNotifs = AppState.notifications.filter(n => !n.isRead);
  if (unreadNotifs.length === 0) return;

  try {
    const res = await fetch('/api/db-bulk/notifications/read-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Active-Session-Id': localStorage.getItem('mock_session_id') || '',
        'X-User-Uid': String(AppState.currentUser.uid)
      }
    });

    if (!res.ok) {
      throw new Error('전체 읽음 처리 중 서버 오류 발생');
    }

    AppState.notifications.forEach(n => {
      if (String(n.targetUid) === String(AppState.currentUser.uid)) {
        n.isRead = true;
      }
    });
    
    updateHeaderAndNav();
    renderNotificationsScreen();
    showToast('모든 알림을 읽음 처리 완료했습니다!', 'success');
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

// 7.7. 성공 수기 평가 커뮤니티 게시판 (Board Screen)
function renderBoardScreen(container) {
  const cont = container || document.getElementById('page-content');
  if (!cont) return;
  
  cont.innerHTML = `
    <div class="px-5 py-6 space-y-6">
      
      <div class="glass-card p-5 rounded-3xl border-primary/20 bg-dark-gradient flex justify-between items-center gap-3">
        <div class="min-w-0">
          <p class="text-primary text-[10px] font-black uppercase tracking-wider mb-1.5">Success Stories</p>
          <h3 class="readable-text-title text-white mb-1.5">부킹 성공 방문 수기 게시판</h3>
          <p class="readable-text-body text-on-surface-variant leading-relaxed">
            나이트클럽 방문 수기를 등록하면 **15 CR**이 보상 포인트로 즉시 자동 적립됩니다.
          </p>
        </div>
        <button class="h-10 px-3 bg-neon-gradient rounded-xl text-[10px] font-black text-white shrink-0 btn-active-scale" onclick="openWritePostModal()">글쓰기 ✍️</button>
      </div>

      <!-- 게시글 루프 -->
      <div>
        <h3 class="text-xs font-black text-white tracking-wider mb-3.5 uppercase flex items-center gap-1.5">
          <span class="material-symbols-outlined text-secondary text-sm">rate_review</span> 실시간 등록 수기 (${AppState.posts.length}개)
        </h3>

        <div class="space-y-3.5" id="board-posts-list">
          ${AppState.posts.length === 0 ? `
            <div class="text-center py-12 text-white/30 text-xs font-bold bg-white/30 border border-white/5 rounded-2xl">
              등록된 첫 번째 리얼 방문 수기 글이 없습니다.
            </div>
          ` : AppState.posts.map(p => `
            <div class="glass-card p-4 rounded-2xl border-white/5 bg-[#120e26]/35 space-y-2 cursor-pointer" onclick="openPostDetailModal('${p.id}')">
              <div class="flex justify-between items-center text-[10px] font-bold">
                <span class="text-[9px] text-accent tracking-widest bg-accent/10 px-2 py-0.5 rounded border border-accent/20 uppercase">${p.clubName} 태그</span>
                <span class="text-white/60 flex items-center gap-1.5 bg-white/5 px-2 py-0.5 rounded">👁️ ${p.views || 0} · 👍 ${p.likes || 0} · 👎 ${p.dislikes || 0}</span>
              </div>
              
              <h4 class="readable-text-title text-white text-xs line-clamp-1 leading-snug">${p.title}</h4>
              <p class="readable-text-body text-on-surface-variant line-clamp-2 mt-1 leading-relaxed">${p.content}</p>
              
              <div class="flex justify-between items-center border-t border-white/5 pt-2 mt-1.5">
                <span class="text-[9px] text-white/60">작성자: ${p.author}</span>
                <span class="text-[9px] text-secondary font-black bg-secondary/10 px-2 py-0.5 rounded">친절도 별점: ★ ${p.rating}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

    </div>

    <!-- ✍️ 수기 글쓰기 모달 팝업창 (동적 빌드 컨테이너) -->
    <div id="post-write-modal" class="fixed inset-0 z-[10006] bg-[#05050a]/95 backdrop-blur-xl hidden items-center justify-center px-6"></div>
  `;
}

function openWritePostModal() {
  if (!AppState.currentUser) {
    showToast('⚠️ 로그인이 필요한 서비스입니다. 회원가입 및 로그인을 먼저 완료해 주세요!', 'warning');
    navigateTo('signup');
    return;
  }

  const isCoach = AppState.currentUser.role === 'coach';
  const formHtml = isCoach ? getCoachWriteFormHtml() : getPlayerWriteFormHtml();
  
  const modalContainer = document.getElementById('post-write-modal');
  if (modalContainer) {
    modalContainer.innerHTML = formHtml;
    modalContainer.classList.remove('hidden');
    modalContainer.classList.add('flex');
    
    if (!isCoach) {
      initPlayerWriteFormDropdowns();
    }
  }
}

function getCoachWriteFormHtml() {
  const clubName = AppState.currentUser.club || '나이트클럽';
  return `
    <div class="glass-card p-6 rounded-3xl border border-primary/30 w-full max-w-sm shadow-[0_20px_50px_rgba(255,0,127,0.2)]">
      <div class="flex justify-between items-center mb-1">
        <h3 class="text-base font-black text-white tracking-tight flex items-center gap-1.5">
          <span class="material-symbols-outlined text-primary text-xl">rate_review</span> 웨이터 홍보 수기 작성
        </h3>
        <span class="material-symbols-outlined text-white/40 cursor-pointer p-1 hover:text-white transition" onclick="closeWritePostModal()">close</span>
      </div>
      <p class="text-[10px] text-on-surface-variant/80 mb-4">자유롭게 올리시되 100자 이상 작성 시 **최대 15 CR**이 차등 지급됩니다!</p>
      
      <form class="space-y-4" onsubmit="submitPostForm(event)">
        <div>
          <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">글 제목</label>
          <input type="text" id="post-title" required placeholder="예: 오늘 밤 ${clubName} 예약 폭주! 에이스 웨이터 ${AppState.currentUser.nickname}입니다." class="w-full h-10 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary placeholder:text-white/20"/>
        </div>

        <input type="hidden" id="post-club-tag" value="${clubName}"/>
        <input type="hidden" id="post-waiter-tag" value="${AppState.currentUser.nickname}"/>
        <input type="hidden" id="post-rating" value="5"/>

        <div>
          <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">홍보 상세내용</label>
          <textarea id="post-content" oninput="updateWriteProgress(true)" required rows="6" placeholder="오늘 예약 현황 및 특별한 혜택 안내를 자유롭게 작성해주세요!" class="w-full bg-surface border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-primary placeholder:text-white/20"></textarea>
          
          <!-- 🎮 실시간 글자수-보상 네온 게이지 바 -->
          <div class="mt-2.5 space-y-1">
            <div class="flex justify-between items-center text-[9px] text-white/50">
              <span id="char-count-info">현재 글자 수: 0자 (공백 제외)</span>
              <span id="credit-reward-info" class="text-accent font-black">예상 보상: 0 CR</span>
            </div>
            <div class="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/5">
              <div id="char-count-bar" class="h-full w-0 transition-all duration-300 shadow-[0_0_8px_rgba(255,0,127,0.5)]" style="background: linear-gradient(90deg, #ff007f 0%, #7000ff 100%);"></div>
            </div>
            <div class="flex justify-between text-[7px] text-white/30 pt-0.5 font-bold">
              <span>0자 (0 CR)</span>
              <span>40자 이상 (7 CR)</span>
              <span>100자 이상 (15 CR)</span>
            </div>
          </div>
        </div>

        <div class="flex gap-3 pt-2">
          <button type="button" class="flex-1 h-11 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white btn-active-scale" onclick="closeWritePostModal()">취소</button>
          <button type="submit" class="flex-1 h-11 bg-neon-gradient text-white rounded-xl text-xs font-black shadow-lg shadow-primary/20 btn-active-scale">수기 등록하기 ✍️</button>
        </div>
      </form>
    </div>
  `;
}

function getPlayerWriteFormHtml() {
  return `
    <div class="glass-card p-6 rounded-3xl border border-primary/30 w-full max-w-sm shadow-[0_20px_50px_rgba(255,0,127,0.2)]">
      <div class="flex justify-between items-center mb-1">
        <h3 class="text-base font-black text-white tracking-tight flex items-center gap-1.5">
          <span class="material-symbols-outlined text-primary text-xl">rate_review</span> 부킹 수기 및 웨이터 평가 등록
        </h3>
        <span class="material-symbols-outlined text-white/40 cursor-pointer p-1 hover:text-white transition" onclick="closeWritePostModal()">close</span>
      </div>
      <p class="text-[10px] text-on-surface-variant/80 mb-4">정성껏 작성 시 **최대 25 CR**이 즉시 자동 지급됩니다!</p>
      
      <form class="space-y-3.5" onsubmit="submitPostForm(event)">
        <div>
          <label class="block text-[10px] text-white/60 font-black mb-1 uppercase">글 제목</label>
          <input type="text" id="post-title" required placeholder="한국관나이트 리얼 대만족 후기 남깁니다." class="w-full h-9 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary placeholder:text-white/20"/>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] text-white/60 font-black mb-1 uppercase">방문 지역 (시/도)</label>
            <select id="post-city" class="w-full h-9 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary">
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-white/60 font-black mb-1 uppercase">방문 지역 (구/군)</label>
            <select id="post-district" class="w-full h-9 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary">
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] text-white/60 font-black mb-1 uppercase">방문한 클럽</label>
            <select id="post-club" class="w-full h-9 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary">
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-white/60 font-black mb-1 uppercase">담당 웨이터명</label>
            <select id="post-waiter" class="w-full h-9 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary">
            </select>
          </div>
        </div>

        <div>
          <label class="block text-[10px] text-white/60 font-black mb-1 uppercase">웨이터 친절도 평가</label>
          <select id="post-rating" class="w-full h-9 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary transition">
            <option value="5">★★★★★ (5점 최고)</option>
            <option value="4">★★★★☆ (4점 우수)</option>
            <option value="3">★★★☆☆ (3점 보통)</option>
            <option value="2">★★☆☆☆ (2점 불만)</option>
            <option value="1">★☆☆☆☆ (1점 사절)</option>
          </select>
        </div>

        <div>
          <label class="block text-[10px] text-white/60 font-black mb-1 uppercase">경험담 상세수기</label>
          <textarea id="post-content" oninput="updateWriteProgress(false)" required rows="3" placeholder="웨이터님이 전투부킹으로 완전 밀착 케어해주셔서 부킹 대성공하고 최고의 밤을 보냈습니다!" class="w-full bg-surface border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-primary placeholder:text-white/20"></textarea>
          
          <!-- 🎮 실시간 글자수-보상 네온 게이지 바 (손님용) -->
          <div class="mt-2 space-y-1">
            <div class="flex justify-between items-center text-[9px] text-white/50">
              <span id="char-count-info">현재 글자 수: 0자 (공백 제외)</span>
              <span id="credit-reward-info" class="text-accent font-black">예상 보상: 0 CR</span>
            </div>
            <div class="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/5">
              <div id="char-count-bar" class="h-full w-0 transition-all duration-300 shadow-[0_0_8px_rgba(255,0,127,0.5)]" style="background: linear-gradient(90deg, #ff007f 0%, #7000ff 100%);"></div>
            </div>
            <div class="flex justify-between text-[7px] text-white/30 pt-0.5 font-bold">
              <span>0자 (0 CR)</span>
              <span>20자 (5 CR)</span>
              <span>60자 (15 CR)</span>
              <span>120자 (25 CR)</span>
            </div>
          </div>
        </div>

        <div class="flex gap-3 pt-1">
          <button type="button" class="flex-1 h-10 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white btn-active-scale" onclick="closeWritePostModal()">취소</button>
          <button type="submit" class="flex-1 h-10 bg-neon-gradient text-white rounded-xl text-xs font-black shadow-lg shadow-primary/20 btn-active-scale">수기 등록하기 ✍️</button>
        </div>
      </form>
    </div>
  `;
}

// 🎮 실시간 타이핑 글자 수 분석 및 네온 게이지 갱신 핸들러 (어뷰징 차단 및 게이미피케이션 결합)
function updateWriteProgress(isCoach) {
  const contentEl = document.getElementById('post-content');
  if (!contentEl) return;
  
  const content = contentEl.value || '';
  const len = content.trim().replace(/\s+/g, '').length; // 공백 완전 제외 글자수
  
  let reward = 0;
  let maxTarget = isCoach ? 100 : 120;
  
  if (isCoach) {
    if (len >= 100) reward = 15;
    else if (len >= 40) reward = 7;
  } else {
    if (len >= 120) reward = 25;
    else if (len >= 60) reward = 15;
    else if (len >= 20) reward = 5;
  }

  const charInfo = document.getElementById('char-count-info');
  const rewardInfo = document.getElementById('credit-reward-info');
  const bar = document.getElementById('char-count-bar');
  
  if (charInfo) charInfo.innerText = `현재 글자 수: ${len}자 (공백 제외)`;
  if (rewardInfo) rewardInfo.innerText = `예상 보상: ${reward} CR`;
  
  if (bar) {
    const pct = Math.min(100, (len / maxTarget) * 100);
    bar.style.width = `${pct}%`;
    
    if (pct >= 100) {
      bar.style.background = "linear-gradient(90deg, #00f0ff 0%, #00ff7f 100%)";
      bar.style.boxShadow = "0 0 10px rgba(0, 240, 255, 0.8)";
    } else {
      bar.style.background = "linear-gradient(90deg, #ff007f 0%, #7000ff 100%)";
      bar.style.boxShadow = "0 0 6px rgba(255, 0, 127, 0.4)";
    }
  }
}
window.updateWriteProgress = updateWriteProgress;

function initPlayerWriteFormDropdowns() {
  const citySel = document.getElementById('post-city');
  const distSel = document.getElementById('post-district');
  const clubSel = document.getElementById('post-club');
  const waiterSel = document.getElementById('post-waiter');
  const ratingSel = document.getElementById('post-rating');

  if (!citySel || !distSel || !clubSel || !waiterSel) return;

  citySel.innerHTML = '';
  Object.keys(RegionData).forEach(city => {
    citySel.innerHTML += `<option value="${city}">${city}</option>`;
  });

  const updatePostDistricts = () => {
    const city = citySel.value;
    distSel.innerHTML = '';
    if (RegionData[city]) {
      Object.keys(RegionData[city]).forEach(d => {
        distSel.innerHTML += `<option value="${d}">${d}</option>`;
      });
    }
    updatePostClubs();
  };

  const updatePostClubs = () => {
    const city = citySel.value;
    const district = distSel.value;
    clubSel.innerHTML = '';
    if (RegionData[city] && RegionData[city][district]) {
      RegionData[city][district].forEach(c => {
        clubSel.innerHTML += `<option value="${c}">${c}</option>`;
      });
    }
    updatePostWaiters();
  };

  const updatePostWaiters = () => {
    const club = clubSel.value;
    waiterSel.innerHTML = '';
    waiterSel.innerHTML += `<option value="unknown">기억이 안남 (평가 생략)</option>`;

    const matchedWaiters = AppState.waiters.filter(w => w.club === club && w.isApproved);
    matchedWaiters.forEach(w => {
      waiterSel.innerHTML += `<option value="${w.nickname}">${w.nickname}</option>`;
    });
    
    handleWaiterSelection();
  };

  const handleWaiterSelection = () => {
    if (waiterSel.value === 'unknown') {
      ratingSel.disabled = true;
      ratingSel.classList.add('opacity-40', 'cursor-not-allowed', 'bg-dark/50');
      ratingSel.value = "5"; 
    } else {
      ratingSel.disabled = false;
      ratingSel.classList.remove('opacity-40', 'cursor-not-allowed', 'bg-dark/50');
    }
  };

  citySel.addEventListener('change', updatePostDistricts);
  distSel.addEventListener('change', updatePostClubs);
  clubSel.addEventListener('change', updatePostWaiters);
  waiterSel.addEventListener('change', handleWaiterSelection);

  updatePostDistricts();
}

function closeWritePostModal() {
  document.getElementById('post-write-modal').classList.add('hidden');
}

// 수기 등록 및 보상 지급 트랜잭션 처리 (백엔드 단독 연산 바인딩)
async function submitPostForm(e) {
  e.preventDefault();
  
  // 🛡️ [V0.8 NEW] 비로그인(게스트) 상태에서 수기 작성 시 Null Exception 원천 차단 가드
  if (!AppState.currentUser) {
    showToast('⚠️ 로그인이 필요한 서비스입니다. 회원가입 및 로그인을 먼저 완료해 주세요!', 'warning');
    closeWritePostModal();
    navigateTo('signup');
    return;
  }
  
  const isCoach = AppState.currentUser.role === 'coach';
  const title = document.getElementById('post-title').value;
  const content = document.getElementById('post-content').value;

  let clubName = '';
  let waiterName = '';
  let rating = 5;

  if (isCoach) {
    clubName = AppState.currentUser.club || '나이트클럽';
    waiterName = AppState.currentUser.nickname;
    rating = 5;
  } else {
    clubName = document.getElementById('post-club').value;
    waiterName = document.getElementById('post-waiter').value;
    rating = Number(document.getElementById('post-rating').value);
  }

  try {
    // 작성자 닉네임 포맷팅 (웨이터일 경우 "쩝이쩝이(한국관나이트소속_코치)" 형식 명기)
    let formattedAuthor = AppState.currentUser.nickname;
    if (isCoach) {
      formattedAuthor = `${AppState.currentUser.nickname}(${clubName}소속_코치)`;
    }

    const newPost = {
      title,
      clubName,
      waiterName: waiterName === 'unknown' ? '기억이 안남' : waiterName,
      rating: waiterName === 'unknown' ? 0 : rating,
      content,
      author: formattedAuthor,
      authorUid: AppState.currentUser.uid,
      views: 12,
      likes: 1,
      likedUsers: [AppState.currentUser.uid] // 본인 자동 추천 방지 위해 미리 세팅
    };

    // 1. 게시글 등록 (백엔드 단독 금융 충전 & 세션 락 자동 처리)
    const res = await fetch(`/api/db/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Active-Session-Id': localStorage.getItem('mock_session_id') || '',
        'X-User-Uid': String(AppState.currentUser.uid)
      },
      body: JSON.stringify(newPost)
    });

    if (!res.ok) {
      const errData = await res.json();
      // 🔒 [보안 락 3] 세션 만료 응답에 대한 즉각 튕겨내기 처리
      if (res.status === 403 && errData.error === 'session_expired') {
        showToast('⚠️ ' + errData.message, 'danger', 8000);
        logout();
        return;
      }
      throw new Error(errData.message || '수기 등록에 실패했습니다.');
    }

    const resJson = await res.json();
    const rewardAmount = resJson.rewardAmount || 0;
    const finalCredits = resJson.finalCredits || 0;

    // 2. 로컬 상태에 갱신된 크레딧 씽크
    AppState.currentUser.credits = finalCredits;
    AppState.credits = finalCredits;
    updateHeaderAndNav();

    // 3. 🌟 [V0.8.1-Hotfix2] 웨이터 평점 누적 가중평균 합산 엔진 구동 (손님이 작성하고 웨이터가 '기억이 안남'이 아닐 때만 작동)
    if (!isCoach && waiterName !== 'unknown') {
      try {
        const waitersSnap = await db.collection('waiters').get();
        const waitersList = waitersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
        const matchedWaiter = waitersList.find(w => w.nickname.trim() === waiterName.trim());
        
        if (matchedWaiter) {
          console.log(`⭐ [RatingEngine] 매칭된 웨이터 발견: ${matchedWaiter.nickname} (${matchedWaiter.uid})`);
          
          let prevSum = Number(matchedWaiter.totalScoreSum);
          let prevCount = Number(matchedWaiter.reviewCount);
          
          if (isNaN(prevSum) || isNaN(prevCount) || prevCount <= 0) {
            const currentScore = Number(matchedWaiter.score) || 5.0;
            prevCount = 1;
            prevSum = currentScore * prevCount;
          }
          
          const nextCount = prevCount + 1;
          const nextSum = prevSum + rating;
          const nextScore = Math.round((nextSum / nextCount) * 10) / 10;
          
          const updateWaiterData = {
            totalScoreSum: nextSum,
            reviewCount: nextCount,
            score: nextScore
          };
          
          await db.collection('waiters').doc(matchedWaiter.uid).update(updateWaiterData);
          await db.collection('users').doc(matchedWaiter.uid).update(updateWaiterData);
          
          console.log(`⭐ [RatingEngine] 평점 업데이트 성공: ${matchedWaiter.nickname} -> 평점: ${nextScore} (누적총점: ${nextSum}, 리뷰수: ${nextCount})`);
        }
      } catch (ratingErr) {
        console.warn("⚠️ [RatingEngine] 평점 엔진 구동 실패:", ratingErr);
      }
    }

    if (rewardAmount > 0) {
      showToast(`수기가 등록되었으며, 백엔드 검증 보상 ${rewardAmount} CR이 지급되었습니다!`, 'success');
    } else {
      showToast(`수기가 성공적으로 등록되었습니다! (글자 수가 미달하여 크레딧 보상 지급은 제외되었습니다.)`, 'warning');
    }
    
    closeWritePostModal();
    navigateTo('board');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// ==========================================================================
// 8.0. [NEW] 통합 어드민 대시보드 화면 및 제어 로직 (VVIP Admin Dashboard Control)
// ==========================================================================
let activeAdminTab = 'users'; // 'users' | 'waiters' | 'sponsors' | 'reports' | 'logs'

function renderAdminScreen(container) {
  container = container || document.getElementById('page-content');
  if (!container) return;
  // Cwd 화면 가로 넓이 확장 유도 (CSS에서 admin-expanded 클래스가 index.html에 동시 적용되어 넓어짐)
  container.innerHTML = `
    <div class="p-6 h-full flex flex-col min-w-0">
      
      <!-- 상단 VVIP 어드민 핵심 메트릭스 위젯 (AI 보완책 1초 대시보드 위젯) -->
      <div class="grid grid-cols-4 gap-4 mb-6 shrink-0" id="admin-metrics-container">
        <!-- Metrics binding -->
      </div>

      <!-- 어드민 다중 모듈 탭 네비게이션 -->
      <div class="flex justify-between items-center bg-surface-container/60 border border-white/5 p-2 rounded-2xl mb-5 shrink-0">
        <div class="flex gap-2 overflow-x-auto hide-scrollbar shrink-0">
          <button class="admin-tab-btn active" id="tab-ad-users" onclick="switchAdminTab('users')">👥 전체 회원현황</button>
          <button class="admin-tab-btn" id="tab-ad-waiters" onclick="switchAdminTab('waiters')">🍾 웨이터 가입 승인대기</button>
          <button class="admin-tab-btn" id="tab-ad-sponsors" onclick="switchAdminTab('sponsors')">👑 지역 업소 광고배너</button>
          <button class="admin-tab-btn" id="tab-ad-reports" onclick="switchAdminTab('reports')">📢 클럽 신설/폐업 제보</button>
          <button class="admin-tab-btn" id="tab-ad-logs" onclick="switchAdminTab('logs')">🪙 포인트 지급 금융장부</button>
        </div>
        <div class="flex gap-2 shrink-0">
          <button class="thumb-touch-btn h-10 px-3 bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-black btn-active-scale" onclick="lockAdminSession()">어드민 세션 잠금 🔒</button>
          <button class="thumb-touch-btn h-10 px-4 bg-white/5 border border-white/10 text-white text-xs font-bold btn-active-scale" onclick="navigateTo('home')">돌아가기 🚪</button>
        </div>
      </div>

      <!-- 동적 어드민 탭 본문 영역 -->
      <div class="flex-1 overflow-y-auto min-h-0 bg-[#0d0b1d]/45 border border-white/5 rounded-3xl p-5" id="admin-tab-content">
        <!-- Tab inner HTML -->
      </div>

    </div>
  `;
  renderAdminMetrics();
  switchAdminTab('users');
}

// 8.1. 어드민 위젯 수치 카드 실시간 연산 렌더러
function renderAdminMetrics() {
  // 🌟 [V0.8 정합성] 로컬 캐시 DB에서 직접 실시간 가입 회원 총합계를 동기 산출하여 +4 하드코딩 완전 격퇴!
  const allUsersList = JSON.parse(localStorage.getItem('mock_fs_users')) || [];
  const pendingWaiters = AppState.waiters.filter(w => !w.isApproved);
  const activeSponsors = AppState.sponsors.filter(s => s.status === 'active');
  const pendingReports = AppState.reports.filter(r => r.status === 'pending');

  const container = document.getElementById('admin-metrics-container');
  if (!container) return;

  container.innerHTML = `
    <div class="admin-widget-card border-primary/20">
      <span class="text-[9px] text-primary/60 font-black uppercase tracking-wider">오늘 가입 선수단</span>
      <span class="text-2xl font-black font-sora text-white">${allUsersList.length}명</span>
      <span class="text-[8px] text-white/30 font-bold block mt-1">B2C 고객 수치</span>
    </div>
    <div class="admin-widget-card border-accent/20">
      <span class="text-[9px] text-accent/60 font-black uppercase tracking-wider">가입 승인대기 웨이터</span>
      <span class="text-2xl font-black font-sora text-accent">${pendingWaiters.length}명</span>
      <span class="text-[8px] text-accent/40 font-bold block mt-1">1-클릭 신속 승인 대기</span>
    </div>
    <div class="admin-widget-card border-secondary/20">
      <span class="text-[9px] text-secondary/60 font-black uppercase tracking-wider">활성 스폰서 광고</span>
      <span class="text-2xl font-black font-sora text-secondary">${activeSponsors.length}개</span>
      <span class="text-[8px] text-secondary/40 font-bold block mt-1">B2B 타겟형 캐시카우</span>
    </div>
    <div class="admin-widget-card border-white/10">
      <span class="text-[9px] text-white/50 font-black uppercase tracking-wider">미처리 업소 정보 제보</span>
      <span class="text-2xl font-black font-sora text-white">${pendingReports.length}건</span>
      <span class="text-[8px] text-white/30 font-bold block mt-1">보상 지급 대기</span>
    </div>
  `;
}

// 🛡️ [V0.8 NEW] 명시적 어드민 권한 잠금 함수
function lockAdminSession() {
  sessionStorage.removeItem('admin_verified');
  stopAdminActivityDaemon();
  showToast('🔒 어드민 세션이 즉시 폐쇄 및 안전 잠금되었습니다.', 'warning');
  navigateTo('home');
}

// 8.2. 어드민 서브 탭 스위처
function switchAdminTab(tabName) {
  activeAdminTab = tabName;
  const tabIds = ['users', 'waiters', 'sponsors', 'reports', 'logs'];
  tabIds.forEach(id => {
    const btn = document.getElementById(`tab-ad-${id}`);
    if (id === tabName) {
      btn.className = "admin-tab-btn active";
    } else {
      btn.className = "admin-tab-btn";
    }
  });

  const content = document.getElementById('admin-tab-content');
  if (!content) return;
  content.innerHTML = '';

  switch (tabName) {
    case 'users':
      renderAdminUsers(content);
      break;
    case 'waiters':
      renderAdminWaiters(content);
      break;
    case 'sponsors':
      renderAdminSponsors(content);
      break;
    case 'reports':
      renderAdminReports(content);
      break;
    case 'logs':
      renderAdminLogs(content);
      break;
  }
}

// ==========================================================================
// 8.3. 탭별 관리자 상세 뷰 바인딩 및 제어 (Admin Sub-view Builders)
// ==========================================================================

// 8.3.1. [어드민 1] 회원현황 및 제재/블랙리스트/크레딧 지급 뷰
async function renderAdminUsers(content) {
  const cont = content || document.getElementById('admin-tab-content');
  if (!cont) return;
  
  // 전체 회원 패치
  const allUsersSnap = await db.collection('users').get();
  const allUsers = allUsersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));

  cont.innerHTML = `
    <div class="space-y-4">
      <div class="flex justify-between items-center mb-1 shrink-0">
        <h4 class="text-xs font-black text-white uppercase tracking-wider">👥 플랫폼 전체 회원 리스트 (${allUsers.length}명)</h4>
        <span class="text-[9px] text-white/40 block">휴면 제재 및 강제 포인트 1초 조작이 가능합니다.</span>
      </div>

      <div class="overflow-x-auto rounded-2xl border border-white/5">
        <table class="w-full text-left text-xs">
          <thead class="bg-surface-container/60 text-white/50 text-[10px] font-black uppercase border-b border-white/5">
            <tr>
              <th class="p-4">닉네임(이름)</th>
              <th class="p-4">역할</th>
              <th class="p-4">전화번호</th>
              <th class="p-4">보유 포인트</th>
              <th class="p-4">마지막 활동</th>
              <th class="p-4 text-center">계정 상태</th>
              <th class="p-4 text-right">관리 조작</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5 font-semibold">
            ${allUsers.map(u => `
              <tr class="hover:bg-white/5 transition-colors">
                <td class="p-4 flex items-center gap-2">
                  <span class="font-bold text-white text-xs">${u.nickname}</span>
                  <span class="text-[9px] text-white/30">(${u.name})</span>
                </td>
                <td class="p-4">
                  <span class="text-[9px] font-black px-1.5 py-0.5 rounded ${
                    u.role === 'coach' ? 'bg-accent/10 text-accent' : 'bg-primary/10 text-primary'
                  }">${u.role === 'coach' ? '웨이터' : '선수'}</span>
                </td>
                <td class="p-4 text-white/60">${u.phone || '미등록'}</td>
                <td class="p-4 text-secondary font-black">${u.credits || 0} CR</td>
                <td class="p-4 text-white/40 font-mono text-[10px]">${u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString() : '비활동'}</td>
                <td class="p-4 text-center">
                  <span class="text-[9px] font-black px-2 py-0.5 rounded-full ${
                    u.status === 'banned' ? 'bg-red-500/10 text-red-500 animate-pulse' :
                    u.status === 'inactive' ? 'bg-white/5 text-white/30' : 'bg-green-500/10 text-green-400'
                  }">${u.status === 'banned' ? '제재중' : u.status === 'inactive' ? '휴면' : '정상'}</span>
                </td>
                <td class="p-4 text-right space-x-1.5">
                  <button class="h-8 px-2 bg-secondary/10 border border-secondary/20 hover:bg-secondary/25 text-secondary text-[9px] rounded-lg btn-active-scale font-black" onclick="openAdminCreditModal('${u.uid}', '${u.nickname}')">포인트조작🪙</button>
                  
                  ${u.status === 'banned' ? `
                    <button class="h-8 px-2 bg-green-950/40 border border-green-500/30 text-green-400 text-[9px] rounded-lg btn-active-scale font-black" onclick="adjustUserBanStatus('${u.uid}', 'active')">해제</button>
                  ` : `
                    <button class="h-8 px-2 bg-red-950/40 border border-red-500/30 text-red-400 text-[9px] rounded-lg btn-active-scale font-black" onclick="adjustUserBanStatus('${u.uid}', 'banned')">제재BANNED</button>
                  `}

                  <button class="h-8 px-2 bg-white/5 border border-white/10 text-white/50 text-[9px] rounded-lg btn-active-scale font-black" onclick="openAdminTimeAcceleratorModal('${u.uid}', '${u.nickname}', '${u.role}')">시간가속⏳</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 🪙 관리자 수동 포인트 조작 모달창 -->
    <div id="admin-credit-modal" class="fixed inset-0 z-[10030] bg-black/90 backdrop-blur-xl hidden items-center justify-center px-6">
      <div class="glass-card p-6 rounded-3xl border border-secondary/40 w-full max-w-sm shadow-[0_20px_50px_rgba(233,195,73,0.25)]">
        <div class="flex justify-between items-center mb-1">
          <h3 class="text-base font-black text-white tracking-tight flex items-center gap-1.5">
            <span class="material-symbols-outlined text-secondary text-xl">payments</span> 어드민 포인트 수동 지급/회수
          </h3>
          <span class="material-symbols-outlined text-white/40 cursor-pointer p-1 hover:text-white transition" onclick="closeAdminCreditModal()">close</span>
        </div>
        <p class="text-[10px] text-on-surface-variant/80 mb-4">선택 회원에게 수동 포인트를 조작하고 사유를 투명 원장에 기록합니다.</p>

        <div class="bg-secondary/5 border border-secondary/15 rounded-2xl p-3 mb-4 text-xs flex justify-between items-center font-bold">
          <span class="text-white/60">조작 대상 회원</span>
          <span id="ad-credit-user-name" class="text-secondary">닉네임</span>
        </div>

        <form id="ad-credit-form" class="space-y-4" onsubmit="submitAdminCreditAdjust(event)">
          <input type="hidden" id="ad-credit-user-uid" value=""/>
          
          <div>
            <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">조작 크레딧 액수</label>
            <input type="number" id="ad-credit-amount" required placeholder="지급: 100 / 차감: -50" class="w-full h-10 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-secondary placeholder:text-white/20"/>
          </div>

          <div>
            <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">지급/차감 명확한 사유 (원장 의무 기재)</label>
            <input type="text" id="ad-credit-reason" required placeholder="예: 우수 제보자 포상 보상" class="w-full h-10 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-secondary placeholder:text-white/20"/>
          </div>

          <div class="flex gap-3 pt-2">
            <button type="button" class="flex-1 h-11 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white btn-active-scale" onclick="closeAdminCreditModal()">취소</button>
            <button type="submit" class="flex-1 h-11 bg-gold-gradient text-black rounded-xl text-xs font-black shadow-lg shadow-secondary/20 btn-active-scale">포인트 조작 확정 🪙</button>
          </div>
        </form>
      </div>
    </div>

    <!-- ⏳ 디버그용 QA 시간 가속 조작 모달창 (사용자 보완책 2 적용) -->
    <div id="admin-accelerator-modal" class="fixed inset-0 z-[10031] bg-black/90 backdrop-blur-xl hidden items-center justify-center px-6">
      <div class="glass-card p-6 rounded-3xl border border-primary/30 w-full max-w-sm shadow-[0_20px_50px_rgba(188,0,221,0.25)]">
        <div class="flex justify-between items-center mb-1">
          <h3 class="text-base font-black text-white tracking-tight flex items-center gap-1.5">
            <span class="material-symbols-outlined text-primary text-xl animate-pulse">hourglass_empty</span> QA 가상 접속일자 조작
          </h3>
          <span class="material-symbols-outlined text-white/40 cursor-pointer p-1 hover:text-white transition" onclick="closeAdminTimeAcceleratorModal()">close</span>
        </div>
        <p class="text-[10px] text-on-surface-variant/80 mb-4">회원의 미접속 기한을 가상 시간으로 조작하여 휴면 정리 삭제 룰을 1초 만에 QA 검증합니다.</p>

        <div class="bg-primary/5 border border-primary/10 rounded-2xl p-3 mb-4 text-xs font-bold flex justify-between items-center">
          <span class="text-white/60">가속 조작 유저</span>
          <span id="ad-acc-user-name" class="text-primary">닉네임</span>
        </div>

        <div class="space-y-3">
          <input type="hidden" id="ad-acc-user-uid" value=""/>
          <input type="hidden" id="ad-acc-user-role" value=""/>
          
          <button class="thumb-touch-btn w-full bg-accent/15 border border-accent/30 text-accent text-xs font-black rounded-xl btn-active-scale" onclick="triggerTimeAcceleration('2months')">
            🍾 2달 장기 미접속 상태로 즉각 시간 가속 (웨이터 정리용)
          </button>
          <button class="thumb-touch-btn w-full bg-primary/15 border border-primary/30 text-primary text-xs font-black rounded-xl btn-active-scale" onclick="triggerTimeAcceleration('2years')">
            👤 2년 장기 미접속 상태로 즉각 시간 가속 (선수 정리용)
          </button>

          <div class="border-t border-white/5 my-3 pt-3">
            <button class="thumb-touch-btn w-full bg-neon-gradient text-white text-xs font-black rounded-xl shadow-lg shadow-primary/20 btn-active-scale" onclick="triggerAdminManualCleanupBatch()">
              ⏰ 새벽 4시 스마트 휴면 청소 배치 즉시 수동 구동!
            </button>
          </div>

          <button type="button" class="w-full h-11 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white/80 btn-active-scale" onclick="closeAdminTimeAcceleratorModal()">닫기</button>
        </div>
      </div>
    </div>
  `;
}

// 8.3.1.1. 포인트 조작 모달 열기/닫기
function openAdminCreditModal(uid, nickname) {
  document.getElementById('ad-credit-user-uid').value = uid;
  document.getElementById('ad-credit-user-name').innerText = nickname;
  document.getElementById('admin-credit-modal').classList.remove('hidden');
}

function closeAdminCreditModal() {
  document.getElementById('admin-credit-modal').classList.add('hidden');
}

// 포인트 수동 지급 제출
async function submitAdminCreditAdjust(e) {
  e.preventDefault();
  const uid = document.getElementById('ad-credit-user-uid').value;
  const amount = Number(document.getElementById('ad-credit-amount').value);
  const reason = document.getElementById('ad-credit-reason').value;

  try {
    const res = await fetch(`/api/admin/users/${uid}/adjust-credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, reason })
    });
    const data = await res.json();
    
    if (data.success) {
      showToast(`${data.log.nickname}님의 포인트가 조작되었습니다. (잔액: ${data.balance} CR)`, 'success');
      closeAdminCreditModal();
      switchAdminTab('users');
    } else {
      showToast(data.error, 'danger');
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// 8.3.1.2. 시간 가속 모달 열기/닫기
function openAdminTimeAcceleratorModal(uid, nickname, role) {
  document.getElementById('ad-acc-user-uid').value = uid;
  document.getElementById('ad-acc-user-name').innerText = nickname;
  document.getElementById('ad-acc-user-role').value = role;
  document.getElementById('admin-accelerator-modal').classList.remove('hidden');
}

function closeAdminTimeAcceleratorModal() {
  document.getElementById('admin-accelerator-modal').classList.add('hidden');
}

// 시간 가속 조작 요청 발송
async function triggerTimeAcceleration(period) {
  const uid = document.getElementById('ad-acc-user-uid').value;
  
  try {
    const res = await fetch('/api/debug/accelerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, period })
    });
    const data = await res.json();
    
    if (data.success) {
      showToast(`${data.nickname}님의 접속일이 가속되었습니다! (${data.dateString})`, 'success');
      closeAdminTimeAcceleratorModal();
      switchAdminTab('users');
    }
  } catch(e) {
    showToast(e.message, 'danger');
  }
}

// 휴면 정리 수동 실행
async function triggerAdminManualCleanupBatch() {
  try {
    const res = await fetch('/api/debug/trigger-cleanup', { method: 'POST' });
    const data = await res.json();
    showToast(`🧹 스마트 청소기 수동 구동 완료! 일반회원 ${data.players}명, 웨이터 ${data.coaches}명이 안전하게 정리되었습니다.`, 'success', 5000);
    closeAdminTimeAcceleratorModal();
    switchAdminTab('users');
  } catch(e) {
    showToast(e.message, 'danger');
  }
}

// 회원 제재 토글
async function adjustUserBanStatus(uid, targetStatus) {
  showConfirm(`해당 회원의 계정을 즉시 [${targetStatus === 'banned' ? '제재/차단' : '해제'}] 처리하시겠습니까?`, async () => {
    try {
      await db.collection('users').doc(uid).update({ status: targetStatus });
      showToast(`해당 회원의 상태가 [${targetStatus}]로 즉시 실시간 차단되었습니다!`, 'success');
      switchAdminTab('users');
    } catch(e) {
      showToast(e.message, 'danger');
    }
  });
}

// 8.3.2. [어드민 2] 웨이터 가입 승인대기소 뷰
async function renderAdminWaiters(content) {
  const cont = content || document.getElementById('admin-tab-content');
  if (!cont) return;
  
  // 전체 코치 중 미승인 코치만 추출
  const waitersSnap = await db.collection('users').get();
  const allCoaches = waitersSnap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.role === 'coach');
  const pendingWaiters = allCoaches.filter(w => !w.isApproved);

  cont.innerHTML = `
    <div class="space-y-4">
      <div class="flex justify-between items-center mb-1 shrink-0">
        <h4 class="text-xs font-black text-white uppercase tracking-wider">🍾 VVIP 웨이터 가입 신청 대기목록 (${pendingWaiters.length}명)</h4>
        <span class="text-[9px] text-white/40 block">소속 클럽 확인 후 1초 승인 처리가 가능합니다.</span>
      </div>

      ${pendingWaiters.length === 0 ? `
        <div class="text-center py-12 text-white/30 text-xs font-bold bg-white/30 border border-white/5 rounded-2xl">
          현재 가입 신청 대기 중인 웨이터가 없습니다.
        </div>
      ` : `
        <div class="grid grid-cols-2 gap-4">
          ${pendingWaiters.map(w => `
            <div class="glass-card p-5 rounded-2xl border-white/5 bg-[#120e26]/35 space-y-4 flex flex-col justify-between">
              <div class="flex gap-3.5 items-start">
                <img src="${w.avatar || KoreanAvatars.james}" class="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0"/>
                <div class="min-w-0">
                  <h4 class="readable-text-title text-white text-xs truncate">${w.nickname} (${w.name})</h4>
                  <span class="text-[9px] text-secondary font-black block mt-0.5">${w.phone}</span>
                  <span class="text-[9px] text-accent font-semibold block mt-1.5 uppercase bg-accent/10 px-2 py-0.5 rounded-full w-max border border-accent/20">소속: ${w.club}</span>
                </div>
              </div>

              <div class="flex gap-2.5 pt-1 shrink-0">
                <button class="flex-1 h-10 bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-bold rounded-xl btn-active-scale" onclick="rejectWaiterEnrollment('${w.uid}', '${w.nickname}')">반려/거절</button>
                <button class="flex-1 h-10 bg-green-950/40 border border-green-500/30 text-green-400 text-xs font-bold rounded-xl btn-active-scale" onclick="approveWaiterEnrollment('${w.uid}', '${w.nickname}')">승인 완료 ⚡</button>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

// 웨이터 가입 승인 처리
async function approveWaiterEnrollment(uid, nickname) {
  try {
    const res = await fetch(`/api/admin/users/${uid}/approve`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`[${nickname}] 코치의 가입 승인이 실시간 통지 완료되었습니다!`, 'success');
      switchAdminTab('waiters');
    }
  } catch(e) {
    showToast(e.message, 'danger');
  }
}

// 웨이터 가입 반려 처리
async function rejectWaiterEnrollment(uid, nickname) {
  const reason = prompt(`[반려 사유 기재] ${nickname} 코치의 가입을 반려하는 사유를 입력하세요:`, '소속클럽 정보 오인 또는 본인확인 불가');
  if (reason === null) return;

  try {
    const res = await fetch(`/api/admin/users/${uid}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`[${nickname}] 코치 가입 반려를 실시간 전송했습니다.`, 'warning');
      switchAdminTab('waiters');
    }
  } catch(e) {
    showToast(e.message, 'danger');
  }
}

// 8.3.3. [어드민 3] 업소 광고 배너 등록 및 관리 뷰
function renderAdminSponsors(content) {
  const cont = content || document.getElementById('admin-tab-content');
  if (!cont) return;
  cont.innerHTML = `
    <div class="space-y-5">
      <div class="flex justify-between items-center mb-1 shrink-0">
        <h4 class="text-xs font-black text-white uppercase tracking-wider">👑 B2B 지역 타겟 스폰서 광고 관리소 (${AppState.sponsors.length}개)</h4>
        <button class="h-9 px-3 bg-neon-gradient rounded-xl text-[10px] font-black text-white btn-active-scale" onclick="openSponsorCreateForm()">신규 배너 등록 ➕</button>
      </div>

      <!-- 배너 추가 양식 폼 (기본 비활성) -->
      <div id="admin-sponsor-form-box" class="hidden glass-card p-5 rounded-2xl border-accent/20 bg-surface/50">
        <div class="flex justify-between items-center mb-3">
          <span class="text-xs font-black text-accent uppercase">🆕 신규 스폰서 광고 배너 등록</span>
          <span class="material-symbols-outlined text-white/40 cursor-pointer" onclick="closeSponsorCreateForm()">close</span>
        </div>
        <form class="space-y-3.5" onsubmit="submitSponsorCreate(event)">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-[8px] text-white/50 font-bold mb-1">스폰서 광고 제목</label>
              <input type="text" id="sp-title" required placeholder="대전 으뜸원나이트 DJ파티" class="w-full h-10 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-accent"/>
            </div>
            <div>
              <label class="block text-[8px] text-white/50 font-bold mb-1">노출 적용 지역(시/도)</label>
              <select id="sp-region" class="w-full h-10 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-accent">
                <option value="대전">대전광역시</option>
                <option value="서울">서울특별시</option>
                <option value="부산">부산광역시</option>
              </select>
            </div>
          </div>
          
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-[8px] text-white/50 font-bold mb-1">스폰서 업소(나이트클럽)</label>
              <input type="text" id="sp-club" required placeholder="예: 으뜸원나이트" class="w-full h-10 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-accent"/>
            </div>
            <div>
              <label class="block text-[8px] text-white/50 font-bold mb-1">노출 우선순위 (높을수록 롤링 우선)</label>
              <input type="number" id="sp-priority" required value="5" class="w-full h-10 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-accent"/>
            </div>
          </div>

          <div>
            <label class="block text-[8px] text-white/50 font-bold mb-1">스폰서 광고 고해상도 이미지 URL</label>
            <input type="url" id="sp-image" required placeholder="https://images.unsplash.com/photo-..." class="w-full h-10 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-accent"/>
          </div>

          <div class="flex gap-2 justify-end pt-2">
            <button type="button" class="h-9 px-4 bg-white/5 border border-white/10 text-white text-xs font-bold rounded-xl btn-active-scale" onclick="closeSponsorCreateForm()">취소</button>
            <button type="submit" class="h-9 px-4 bg-accent/20 border border-accent/40 text-accent text-xs font-black rounded-xl btn-active-scale shadow-lg shadow-accent/10">등록 활성화 🚀</button>
          </div>
        </form>
      </div>

      <!-- 배너 관리 목록 루프 -->
      <div class="grid grid-cols-2 gap-4">
        ${AppState.sponsors.map(s => `
          <div class="glass-card rounded-2xl overflow-hidden border-white/5 bg-[#120e26]/35 flex flex-col justify-between h-48">
            <div class="h-20 bg-cover bg-center" style="background-image: url('${s.imageUrl}')"></div>
            
            <div class="p-3 flex-1 flex flex-col justify-between">
              <h5 class="readable-text-title text-white text-[11px] line-clamp-1 leading-snug">${s.title}</h5>
              <div class="flex justify-between items-center text-[9px] text-white/50 my-1">
                <span>지역: <strong class="text-accent">${s.region}</strong></span>
                <span>우선순위: <strong class="text-secondary">${s.priority}</strong></span>
              </div>
              
              <div class="flex justify-between items-center border-t border-white/5 pt-2 mt-1.5 shrink-0">
                <span class="text-[9px] text-white/40 block font-bold">${s.club}</span>
                <div class="flex gap-1">
                  ${s.status === 'active' ? `
                    <button class="h-7 px-2.5 bg-green-950/40 border border-green-500/30 text-green-400 text-[8px] font-black rounded-lg btn-active-scale" onclick="toggleSponsorStatus('${s.id}', 'paused')">노출 ON</button>
                  ` : `
                    <button class="h-7 px-2.5 bg-white/5 border border-white/10 text-white/40 text-[8px] font-black rounded-lg btn-active-scale" onclick="toggleSponsorStatus('${s.id}', 'active')">중지 OFF</button>
                  `}
                  <button class="h-7 px-2 bg-red-950/40 border border-red-500/30 text-red-400 text-[8px] font-black rounded-lg btn-active-scale" onclick="deleteSponsorBanner('${s.id}')">삭제</button>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function openSponsorCreateForm() {
  document.getElementById('admin-sponsor-form-box').classList.remove('hidden');
}

function closeSponsorCreateForm() {
  document.getElementById('admin-sponsor-form-box').classList.add('hidden');
}

// 스폰서 배너 추가 저장
async function submitSponsorCreate(e) {
  e.preventDefault();
  
  const title = document.getElementById('sp-title').value;
  const region = document.getElementById('sp-region').value;
  const club = document.getElementById('sp-club').value;
  const priority = Number(document.getElementById('sp-priority').value);
  const imageUrl = document.getElementById('sp-image').value;

  try {
    const newItem = {
      title,
      region,
      club,
      priority,
      imageUrl,
      status: 'active',
      tag: '스폰서',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '2026-12-31'
    };

    await db.collection('sponsors').add(newItem);
    showToast('신규 스폰서 광고 배너가 활성화되었습니다!', 'success');
    closeSponsorCreateForm();
    switchAdminTab('sponsors');
  } catch(e) {
    showToast(e.message, 'danger');
  }
}

// 광고 상태 변경
async function toggleSponsorStatus(id, targetStatus) {
  try {
    await db.collection('sponsors').doc(id).update({ status: targetStatus });
    showToast(`광고 노출 상태가 [${targetStatus}]로 스위칭되었습니다!`, 'success');
    switchAdminTab('sponsors');
  } catch(e) {
    showToast(e.message, 'danger');
  }
}

// 광고 삭제
async function deleteSponsorBanner(id) {
  showConfirm('이 광고 배너를 영구히 삭제하시겠습니까?', async () => {
    try {
      await db.collection('sponsors').doc(id).delete();
      showToast('광고 배너가 영구 삭제되었습니다.', 'warning');
      switchAdminTab('sponsors');
    } catch(e) {
      showToast(e.message, 'danger');
    }
  });
}

// 8.3.4. [어드민 4] 크라우드소싱 신규/폐업 제보 원장 뷰 (제보 승인시 보상 연동)
function renderAdminReports(content) {
  const cont = content || document.getElementById('admin-tab-content');
  if (!cont) return;
  cont.innerHTML = `
    <div class="space-y-4">
      <div class="flex justify-between items-center mb-1 shrink-0">
        <h4 class="text-xs font-black text-white uppercase tracking-wider">📢 크라우드소싱 정보 제보 접수대 (${AppState.reports.length}건)</h4>
        <span class="text-[9px] text-white/40 block">승인 시 제보한 유저에게 **20 CR 보상 포인트**가 즉시 자동 적립됩니다.</span>
      </div>

      ${AppState.reports.length === 0 ? `
        <div class="text-center py-12 text-white/30 text-xs font-bold bg-white/30 border border-white/5 rounded-2xl">
          접수된 정보 제보 내역이 없습니다.
        </div>
      ` : `
        <div class="space-y-3">
          ${AppState.reports.map(r => `
            <div class="glass-card p-4.5 rounded-2xl border-white/5 bg-surface-container-low/60 flex justify-between items-center gap-3">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                    r.type === 'new_club' ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }">${r.type === 'new_club' ? '신규개업 제보' : '폐업 제보'}</span>
                  
                  <h4 class="readable-text-title text-white text-xs">${r.clubName}</h4>
                </div>
                <p class="readable-text-body text-white/70 text-[11px] leading-relaxed pt-1.5 whitespace-pre-wrap">${r.details}</p>
                <div class="flex items-center gap-3 text-[9px] text-white/40 font-bold pt-1">
                  <span>제보 유저 UID: <strong class="text-white/60">${r.userUid.substr(0,8)}...</strong></span>
                  <span>상태: <strong class="${r.status === 'approved' ? 'text-green-400' : 'text-secondary animate-pulse'}">${r.status === 'approved' ? '승인완료' : '대기중'}</strong></span>
                </div>
              </div>

              <div class="shrink-0 flex flex-col gap-2">
                ${r.status === 'pending' ? `
                  <button class="h-9 px-3 bg-green-950/40 border border-green-500/30 text-green-400 text-[10px] font-black rounded-xl btn-active-scale" onclick="approveUserReportSubmission('${r.id}')">승인 & 20CR🪙</button>
                ` : ''}
                <button class="h-8 px-2.5 bg-white/5 border border-white/10 text-white/40 text-[9px] font-bold rounded-lg btn-active-scale" onclick="deleteUserReportSubmission('${r.id}')">삭제</button>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

// 제보 승인 및 포인트 지급 요청
async function approveUserReportSubmission(id) {
  try {
    const res = await fetch(`/api/admin/reports/${id}/approve`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`제보를 최종 접수 승인하였으며, 제보 회원에게 20 CR이 지급 완료되었습니다!`, 'success');
      switchAdminTab('reports');
    }
  } catch(e) {
    showToast(e.message, 'danger');
  }
}

// 제보 삭제
async function deleteUserReportSubmission(id) {
  showConfirm('이 제보 데이터를 삭제하시겠습니까?', async () => {
    try {
      await db.collection('reports').doc(id).delete();
      showToast('제보가 목록에서 영구 삭제되었습니다.', 'warning');
      switchAdminTab('reports');
    } catch(e) {
      showToast(e.message, 'danger');
    }
  });
}

// 8.3.5. [어드민 5] 크레딧 지급 금융 원장 뷰 (Point Audit Log)
function renderAdminLogs(content) {
  const cont = content || document.getElementById('admin-tab-content');
  if (!cont) return;
  cont.innerHTML = `
    <div class="space-y-4">
      <div class="flex justify-between items-center mb-1 shrink-0">
        <h4 class="text-xs font-black text-white uppercase tracking-wider">🪙 실시간 포인트 지급/차감 금융 장부 원장 (${AppState.creditLogs.length}건)</h4>
        <span class="text-[9px] text-white/40 block">조작 액수 및 사유 히스토리가 평생 투명하게 박제 보존됩니다.</span>
      </div>

      ${AppState.creditLogs.length === 0 ? `
        <div class="text-center py-12 text-white/30 text-xs font-bold bg-white/30 border border-white/5 rounded-2xl">
          기록된 포인트 지급 내역이 존재하지 않습니다.
        </div>
      ` : `
        <div class="overflow-x-auto rounded-2xl border border-white/5">
          <table class="w-full text-left text-xs">
            <thead class="bg-surface-container/60 text-white/50 text-[10px] font-black uppercase border-b border-white/5">
              <tr>
                <th class="p-3">일시</th>
                <th class="p-3">대상 닉네임</th>
                <th class="p-3">유형</th>
                <th class="p-3 text-right">조작 액수</th>
                <th class="p-3 text-right">최종 잔액</th>
                <th class="p-3">지급/차감 사유</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5 font-semibold text-white/80">
              ${AppState.creditLogs.map(l => `
                <tr class="hover:bg-white/5 transition-colors">
                  <td class="p-3 font-mono text-[9px] text-white/40">${new Date(l.createdAt).toLocaleString()}</td>
                  <td class="p-3 text-white text-xs">${l.nickname}</td>
                  <td class="p-3">
                    <span class="text-[9px] font-black px-1.5 py-0.5 rounded ${
                      l.type.startsWith('admin_reward') || l.type.includes('reward')
                        ? 'bg-green-500/10 text-green-400' 
                        : 'bg-red-500/10 text-red-400'
                    }">${l.type}</span>
                  </td>
                  <td class="p-3 text-right font-black ${l.amount >= 0 ? 'text-green-400' : 'text-red-400'}">
                    ${l.amount >= 0 ? `+${l.amount}` : l.amount} CR
                  </td>
                  <td class="p-3 text-right text-secondary font-black">${l.balance} CR</td>
                  <td class="p-3 text-white/60 text-[11px] truncate max-w-xs" title="${l.reason}">${l.reason}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// ==========================================================================
// 9.0. 크라우드소싱 제보 팝업 서브밋 처리 (Report Form Actions)
// ==========================================================================
function showReportModal() {
  document.getElementById('report-modal').classList.remove('hidden');
}

function closeReportModal() {
  document.getElementById('report-modal').classList.add('hidden');
}

let selectedReportType = 'new_club';
function setReportType(type) {
  selectedReportType = type;
  const newBtn = document.getElementById('btn-report-new');
  const clsBtn = document.getElementById('btn-report-closed');
  
  if (type === 'new_club') {
    newBtn.className = "h-10 rounded-xl border border-accent/20 bg-accent/5 text-xs text-accent font-black transition-all btn-active-scale";
    clsBtn.className = "h-10 rounded-xl border border-white/10 bg-white/5 text-xs text-white/60 font-black transition-all btn-active-scale";
  } else {
    clsBtn.className = "h-10 rounded-xl border border-accent/20 bg-accent/5 text-xs text-accent font-black transition-all btn-active-scale";
    newBtn.className = "h-10 rounded-xl border border-white/10 bg-white/5 text-xs text-white/60 font-black transition-all btn-active-scale";
  }
}

// 제보 등록 신청 (제보 즉시 20 CR 포상 자동 충전 구현)
// 제보 등록 신청 (승인제 복원 - 제출 시점에는 pending으로 포인트 변동 없이 접수만 진행)
async function submitReportForm(e) {
  e.preventDefault();
  
  // 🛡️ 비로그인(게스트) 상태에서 제보 시 Null Exception 원천 차단 가드
  if (!AppState.currentUser) {
    showToast('⚠️ 로그인이 필요한 서비스입니다!', 'warning');
    closeReportModal();
    navigateTo('signup');
    return;
  }

  const clubName = document.getElementById('report-club-name').value;
  const details = document.getElementById('report-club-details').value;

  try {
    const reportItem = {
      type: selectedReportType,
      clubName: clubName,
      details: details,
      userUid: AppState.currentUser.uid,
      status: 'pending', // 어드민 최종 승인 대기 상태!
      createdAt: Date.now()
    };

    // 1. 제보 DB 등록 (포인트 가산 없이 pending 상태 등록만 진행)
    await db.collection('reports').add(reportItem);
    
    showToast('📢 클럽 신설/폐업 제보가 성공적으로 접수되었습니다. 관리자 최종 승인 시 20 CR 보상 포인트가 지급됩니다!', 'success', 6000);
    closeReportModal();
    
    // 모달값 청소
    document.getElementById('report-club-name').value = '';
    document.getElementById('report-club-details').value = '';
  } catch(err) {
    showToast(err.message, 'danger');
  }
}

// ==========================================================================
// 10.0. VVIP 포인트 결제 상점 (PayPal Sandbox Integration)
// ==========================================================================
function openStoreModal() {
  document.getElementById('store-modal').classList.remove('hidden');
  renderStorePackages();
  
  // 폼 입력 데이터 초기화 (Reset Fake Card Form Data)
  document.getElementById('fake-card-brand').value = '';
  document.getElementById('fake-card-number').value = '';
  document.getElementById('fake-card-expiry').value = '';
  document.getElementById('fake-card-cvc').value = '';
  document.getElementById('fake-card-name').value = '';
  document.getElementById('fake-card-brand-display').innerText = 'CARD';
  
  // 카드사 칩 하이라이트 스타일 초기화 (Reset Card Chips Selection Style)
  const chips = document.querySelectorAll('#store-card-chips span');
  chips.forEach(c => {
    c.className = "px-2 py-1 bg-white/5 border border-white/10 hover:border-secondary/40 rounded-lg text-[9px] text-white/80 font-black cursor-pointer transition active:scale-95";
  });

  // 입력 필드 자동 포맷터 이벤트 바인딩 (Bind Fake Card Input Auto Formatters)
  initFakeCardFormatters();
  
  // 첫 번째 패키지 자동 디폴트 선택
  if (StorePackages.length > 0) {
    selectStorePackage(StorePackages[0].price, StorePackages[0].credits, StorePackages[0].id);
  }
}

function closeStoreModal() {
  document.getElementById('store-modal').classList.add('hidden');
}

const StorePackages = [
  { id: 'pkg1', credits: 20, price: '1.99', desc: '⚡ 실시간 부킹 대화 걸기 2회권 패키지' },
  { id: 'pkg2', credits: 50, price: '4.50', desc: '🔥 [인기] 알짜배기 VVIP 부킹 5회권 패키지' },
  { id: 'pkg3', credits: 100, price: '8.00', desc: '🍾 [추천] 웨이터 주말 원격 룸 예약 우대권 포함' }
];

let storeSelectedPrice = '0.00';
let storeSelectedCredits = 0;

function renderStorePackages() {
  const container = document.getElementById('store-packages-list');
  if (!container) return;

  container.innerHTML = StorePackages.map(p => `
    <div class="glass-card p-3 rounded-2xl border-white/5 bg-[#120e26]/35 flex justify-between items-center gap-3 cursor-pointer hover:border-secondary/40 transition" onclick="selectStorePackage('${p.price}', ${p.credits}, '${p.id}')" id="store-pkg-card-${p.id}">
      <div>
        <h4 class="text-xs font-black text-white">+${p.credits} 크레딧</h4>
        <span class="text-[8px] text-white/50 block font-semibold mt-0.5">${p.desc}</span>
      </div>
      <span class="text-xs text-secondary font-black shrink-0">$${p.price} USD</span>
    </div>
  `).join('');
}

function selectStorePackage(price, credits, id) {
  storeSelectedPrice = price;
  storeSelectedCredits = credits;
  
  // 패키지 보더 강조 (Highlight Selected Package Border)
  StorePackages.forEach(p => {
    const el = document.getElementById(`store-pkg-card-${p.id}`);
    if (el) {
      if (p.id === id) {
        el.className = "glass-card p-3 rounded-2xl border-secondary/40 bg-secondary/5 flex justify-between items-center gap-3 cursor-pointer transition";
      } else {
        el.className = "glass-card p-3 rounded-2xl border-white/5 bg-[#120e26]/35 flex justify-between items-center gap-3 cursor-pointer hover:border-secondary/40 transition";
      }
    }
  });

  document.getElementById('store-selected-price').innerText = `$${price} USD`;
}

// 카드사 퀵 칩 선택 처리 함수 (Select Fake Card Brand Chip)
function selectFakeCardBrand(brand) {
  document.getElementById('fake-card-brand').value = brand;
  document.getElementById('fake-card-brand-display').innerText = brand.replace('카드', '').toUpperCase();
  
  const chips = document.querySelectorAll('#store-card-chips span');
  chips.forEach(c => {
    const cleanChipText = c.innerText.trim();
    const cleanBrandText = brand.replace('카드', '').replace('MasterCard', 'Master').trim();
    if (cleanChipText === cleanBrandText) {
      c.className = "px-2 py-1 bg-secondary/10 border-2 border-secondary rounded-lg text-[9px] text-secondary font-black cursor-pointer transition active:scale-95 shadow-[0_0_8px_rgba(233,195,73,0.3)]";
    } else {
      c.className = "px-2 py-1 bg-white/5 border border-white/10 hover:border-secondary/40 rounded-lg text-[9px] text-white/80 font-black cursor-pointer transition active:scale-95";
    }
  });
}

// 모의 신용카드 인풋 포맷터 유틸리티 (Initialize Card Input Auto Formatters)
function initFakeCardFormatters() {
  const cardInput = document.getElementById('fake-card-number');
  if (cardInput) {
    cardInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      let formatted = value.match(/.{1,4}/g)?.join(' ') || value;
      e.target.value = formatted.substring(0, 19);
    });
  }

  const expiryInput = document.getElementById('fake-card-expiry');
  if (expiryInput) {
    expiryInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      if (value.length > 2) {
        e.target.value = value.substring(0, 2) + '/' + value.substring(2, 4);
      } else {
        e.target.value = value;
      }
    });
  }

  const cvcInput = document.getElementById('fake-card-cvc');
  if (cvcInput) {
    cvcInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').substring(0, 3);
    });
  }
}

// 💳 VVIP 모의 카드 안전 결제 승인 비동기 시뮬레이터 (Process Fake Card Payment Simulation)
async function processFakeCardPayment() {
  const brand = document.getElementById('fake-card-brand').value;
  const number = document.getElementById('fake-card-number').value.trim();
  const expiry = document.getElementById('fake-card-expiry').value.trim();
  const cvc = document.getElementById('fake-card-cvc').value.trim();
  const name = document.getElementById('fake-card-name').value.trim() || '지노바디';

  if (!storeSelectedCredits || storeSelectedCredits <= 0) {
    showToast('❌ 충전할 크레딧 패키지를 먼저 선택해 주십시오!', 'warning');
    return;
  }
  if (!brand) {
    showToast('💳 결제하실 카드사를 선택해 주십시오!', 'warning');
    return;
  }
  if (number.replace(/\s/g, '').length < 15) {
    showToast('❌ 올바른 신용카드 번호(15~16자리)를 입력해 주십시오!', 'warning');
    return;
  }
  if (expiry.length < 5) {
    showToast('❌ 올바른 유효기간(MM/YY)을 입력해 주십시오!', 'warning');
    return;
  }
  if (cvc.length < 3) {
    showToast('❌ 3자리 CVC 코드를 정확히 입력해 주십시오!', 'warning');
    return;
  }

  const payBtn = document.getElementById('btn-fake-card-pay');
  if (!payBtn) return;
  const originalBtnHtml = payBtn.innerHTML;
  
  // 버튼 비활성화 및 로딩 연출 가동
  payBtn.disabled = true;
  payBtn.className = "w-full h-10 mt-2 bg-neutral-800 text-[10px] font-black text-neutral-500 rounded-xl flex items-center justify-center gap-1.5 cursor-not-allowed";

  // 3단계 역동적 로딩 연출 (Three-stage payment visual simulation)
  const steps = [
    { delay: 0, text: '🔒 모의 카드사 한도 조회 중...' },
    { delay: 500, text: '⚡ 0원 안전 모의 승인 통신 중...' },
    { delay: 500, text: '✍️ VVIP 크레딧 금융 장부 서명 중...' }
  ];

  try {
    for (const step of steps) {
      if (step.delay > 0) {
        await new Promise(r => setTimeout(r, step.delay));
      }
      payBtn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin text-secondary">sync</span> ${step.text}`;
    }
    
    // 최종 네트워크 전송 느낌을 위한 미세 딜레이
    await new Promise(r => setTimeout(r, 600));

    // 실제 Firestore 포인트 증가 트랜잭션 수행
    const originalCredits = Number(AppState.currentUser.credits) || 0;
    const finalCredits = originalCredits + storeSelectedCredits;
    
    await db.collection('users').doc(AppState.currentUser.uid).update({ credits: finalCredits });
    
    // 포인트 원장 기록 (Financial Ledger Record)
    const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    await db.collection('credit_logs').doc(logId).set({
      uid: AppState.currentUser.uid,
      nickname: AppState.currentUser.nickname,
      role: AppState.currentUser.role,
      type: 'fake_card_purchase',
      amount: storeSelectedCredits,
      balance: finalCredits,
      reason: `🪙 모의 VVIP 카드 결제 충전 ($${storeSelectedPrice} USD - 승인완료) [${brand}]`,
      createdAt: new Date().toISOString()
    });

    // 시스템 실시간 알림 발송 (Real-time Notification)
    const notifItem = {
      type: 'system',
      title: '🪙 크레딧 충전 완료',
      body: `모의 카드 안전 결제(${brand})가 성공적으로 승인되었습니다. +${storeSelectedCredits} CR 충전 완료! 현재 보유: ${finalCredits} CR`,
      isRead: false,
      targetUid: AppState.currentUser.uid,
      createdAt: '방금 전'
    };
    await db.collection('notifications').add(notifItem);

    showToast(`정상적으로 ${storeSelectedCredits} CR이 실시간 충전되었습니다!`, 'success');
    closeStoreModal();
  } catch (e) {
    showToast(e.message, 'danger');
  } finally {
    payBtn.disabled = false;
    payBtn.innerHTML = originalBtnHtml;
    payBtn.className = "w-full h-10 mt-2 bg-gradient-to-r from-secondary to-amber-500 text-[10px] font-black text-[#05050a] rounded-xl flex items-center justify-center gap-1.5 shadow-[0_4px_15px_rgba(233,195,73,0.3)] hover:brightness-110 active:scale-95 transition btn-active-scale";
  }
}


// ==========================================================================
// 11.0. 1초 테스터 퀵 계정 전환기 (Floating QA Switcher Mechanism)
// ==========================================================================
function openQuickSwitcherModal() {
  const currentText = AppState.currentUser 
    ? `접속 계정: [${AppState.currentUser.nickname}] ㆍ 등급: [${AppState.userRole === 'coach' ? '웨이터' : '선수'}]` 
    : '로그인 정보 없음 (게스트 상태)';
  document.getElementById('quick-switcher-current-user').innerText = currentText;
  document.getElementById('quick-switcher-modal').classList.remove('hidden');
  renderQuickSwitcherLists();
}

function closeQuickSwitcherModal() {
  document.getElementById('quick-switcher-modal').classList.add('hidden');
}

// 퀵 전환 리스트 동적 빌드
async function renderQuickSwitcherLists() {
  const playersContainer = document.getElementById('quick-players-list');
  const waitersContainer = document.getElementById('quick-waiters-list');
  if (!playersContainer || !waitersContainer) return;

  const usersSnap = await db.collection('users').get();
  const allUsers = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));

  const players = allUsers.filter(u => u.role === 'player');
  const waiters = allUsers.filter(u => u.role === 'coach');

  playersContainer.innerHTML = players.map(p => `
    <button class="w-full text-left bg-white/5 border border-white/5 hover:bg-primary/10 hover:border-primary/30 p-2.5 rounded-xl text-xs flex justify-between items-center transition" onclick="triggerQuickSessionSwap('${p.uid}', '${p.nickname}')">
      <span class="text-white font-bold">${p.nickname}</span>
      <span class="text-[9px] text-white/40 block">보유: ${p.credits} CR ㆍ ${p.style || '#성향무'}</span>
    </button>
  `).join('');

  waitersContainer.innerHTML = waiters.map(w => `
    <button class="w-full text-left bg-white/5 border border-white/5 hover:bg-accent/10 hover:border-accent/30 p-2.5 rounded-xl text-xs flex justify-between items-center transition" onclick="triggerQuickSessionSwap('${w.uid}', '${w.nickname}')">
      <div class="flex items-center gap-1.5">
        <span class="text-white font-bold">${w.nickname}</span>
        <span class="text-[8px] font-black uppercase px-1.5 py-0.2 rounded-full ${w.isApproved ? 'bg-green-500/10 text-green-400' : 'bg-secondary/10 text-secondary'}">${w.isApproved ? '승인' : '대기'}</span>
      </div>
      <span class="text-[9px] text-white/40 block">${w.club} ㆍ ${w.credits} CR</span>
    </button>
  `).join('');
}

// 1초 세션 퀵 스왑 핵심 엔진 (QA 테스터 2번 보완책 적용)
async function triggerQuickSessionSwap(uid, nickname) {
  try {
    // 🌟 [V0.8.1 중복로그인 킥] 퀵스왑 시에도 고유 세션 ID 생성하여 기기 충돌 감지 완벽 지원
    const newSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    localStorage.setItem('mock_session_id', newSessionId);
    await db.collection('users').doc(uid).update({ activeSessionId: newSessionId });

    // 가짜 로그인 세션 동기 스왑
    const fakeUser = { uid, email: `${uid}@test.com` };
    localStorage.setItem('mock_auth_user', JSON.stringify(fakeUser));
    
    // Auth 강제 발송 트리거 호출
    auth.signOut(); // 연결 리셋
    localStorage.setItem('mock_auth_user', JSON.stringify(fakeUser)); // 재주입
    
    // 수동 동기 바인딩 리로딩
    disconnectRealtimeSync();
    bindRealtimeSync(uid);

    showToast(`테스터 [${nickname}] 계정으로 1초 로그인 세션 스왑 완료!`, 'success');
    closeQuickSwitcherModal();
    
    // 홈 화면으로 초기 이동
    navigateTo('home');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// 1초 신규 테스터 초고속 가입 & 자동 세션 스왑
// 🌟 [V1.5.7 마이너 핫픽스] 정식 회원가입 제출 처리 엔진 전격 신설 구현
async function handleSignupSubmit(e) {
  e.preventDefault();
  
  if (!isPhoneVerified) {
    showToast('⚠️ 휴대폰 본인인증을 먼저 완료해 주세요!', 'warning');
    return;
  }
  
  const name = document.getElementById('su-name').value.trim();
  const gender = document.getElementById('su-gender').value;
  const nickname = document.getElementById('su-nickname').value.trim();
  const phone = document.getElementById('su-phone').value.trim();
  const role = signupSelectedRole; // 'player' | 'coach'
  
  if (!name || !nickname || !phone) {
    showToast('⚠️ 필수 가입 정보를 모두 입력해 주세요!', 'warning');
    return;
  }

  const mockUid = 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

  try {
    const baseData = {
      uid: mockUid,
      id: mockUid,
      name: name,
      gender: gender,
      nickname: nickname,
      phone: phone,
      role: role,
      credits: 1000, // 🌟 정식 가입 회원에게 1000 CR 기본 지급 정합성 일원화!
      lastActiveAt: Date.now(),
      isApproved: role === 'player', // 선수는 즉시 승인, 코치는 대기
      status: role === 'player' ? 'active' : 'pending'
    };

    if (role === 'player') {
      // 선택된 스타일 태그들 수집
      const selectedStyleChips = document.querySelectorAll('#style-tag-container-signup div.chip-active');
      const tags = Array.from(selectedStyleChips).map(el => el.innerText);
      baseData.style = tags.length > 0 ? tags.join(' ') : '#성향미등록';
      baseData.lat = 36.3289;
      baseData.lng = 127.4246;
      baseData.distance = 35;
    } else {
      // 웨이터 정보
      baseData.city = document.getElementById('su-city').value;
      baseData.district = document.getElementById('su-district').value;
      baseData.club = document.getElementById('su-club').value;
      baseData.score = 5.0;
      baseData.bookings = 0;
      baseData.promotion = `⚡ ${baseData.city} ${baseData.district} ${baseData.club} 소속 웨이터 ${nickname} 입니다!`;
      baseData.tags = ['친절상담', '즉시수락대기'];
      baseData.avatar = KoreanAvatars.james;
    }

    // 1. DB 주입
    await db.collection('users').doc(mockUid).set(baseData);
    
    // 2. Auth 모킹 가입 목록 주입
    const users = JSON.parse(localStorage.getItem('mock_auth_users')) || [];
    users.push({ email: `${mockUid}@test.com`, password: 'password', uid: mockUid, phone: phone });
    localStorage.setItem('mock_auth_users', JSON.stringify(users));

    // 3. 자동 로그인 연계
    AppState.currentUser = baseData;
    AppState.userRole = role;
    AppState.credits = 50;
    
    localStorage.setItem('mock_session_id', 'sess_' + mockUid);
    localStorage.setItem('mock_user_uid', mockUid);
    
    isPhoneVerified = false; // 플래그 초기화
    
    showToast(`🎉 축하합니다! ${nickname} 님, 회원가입 및 로그인이 성공적으로 완료되었습니다! (50 CR 보너스 자동 충전!)`, 'success', 6000);
    
    // 실시간 동기화 바인딩 작동
    bindRealtimeSync(mockUid);
    
    if (role === 'player') {
      navigateTo('home');
    } else {
      navigateTo('waiting');
    }
  } catch (err) {
    showToast('회원가입 실패: ' + err.message, 'danger');
  }
}
window.handleSignupSubmit = handleSignupSubmit;

async function quickCreateAndLogin() {
  const nickname = document.getElementById('quick-new-name').value.trim();
  const role = document.getElementById('quick-new-role').value;
  
  if (!nickname) {
    showToast('생성할 닉네임을 입력해 주세요!', 'warning');
    return;
  }

  const mockUid = 't_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const mockEmail = `${mockUid}@test.com`;

  try {
    const baseData = {
      uid: mockUid,
      id: mockUid,
      name: nickname + '실명',
      gender: '남',
      nickname: nickname,
      phone: '010-0000-0000',
      role: role,
      credits: 1000, // 테스트 원활화를 위해 기본 1000 CR 지급
      lastActiveAt: Date.now(),
      isApproved: role === 'player', // 선수는 즉시 승인, 코치는 대기
      status: role === 'player' ? 'active' : 'pending'
    };

    if (role === 'player') {
      baseData.style = '#QA즉석선수 #댄스머신';
      baseData.lat = 36.3289;
      baseData.lng = 127.4246;
      baseData.distance = 40;
    } else {
      baseData.city = '대전';
      baseData.district = '중구';
      baseData.club = '한국관나이트';
      baseData.score = 5.0;
      baseData.bookings = 0;
      baseData.promotion = `⚡ [퀵테스터] 대전 중구 한국관 소속 에이스 웨이터 ${nickname} 입니다!`;
      baseData.tags = ['1초승인대기', '전투부킹'];
      baseData.avatar = KoreanAvatars.james;
    }

    // DB에 강제 주입
    await db.collection('users').doc(mockUid).set(baseData);
    
    // Auth 모킹 리스트에 강제 주입
    const users = JSON.parse(localStorage.getItem('mock_auth_users')) || [];
    users.push({ uid: mockUid, email: mockEmail });
    localStorage.setItem('mock_auth_users', JSON.stringify(users));

    // 즉시 교차 스와핑
    await triggerQuickSessionSwap(mockUid, nickname);
    document.getElementById('quick-new-name').value = ''; // 청소
  } catch(e) {
    showToast(e.message, 'danger');
  }
}

// 데이터 CASCADE 완전 리셋
async function triggerDatabaseClearAll() {
  showConfirm('경고: 모든 테스트 데이터베이스가 지워지며 웨이터 기초 데이터가 재로딩됩니다. 정말 청소하시겠습니까?', async () => {
    try {
      localStorage.clear();
      const res = await fetch('/api/db/clear-all', { method: 'POST' });
      const data = await res.json();
      
      showToast(data.message, 'success');
      closeQuickSwitcherModal();
      
      // 게스트 락 해제 아웃
      auth.signOut();
      window.location.reload();
    } catch(e) {
      showToast(e.message, 'danger');
    }
  });
}

// ==========================================================================
// 12.0. 글로벌 보조 UI 피처 빌더 (Toast, Fullscreen, Confirm, prompt)
// ==========================================================================

// 12.1. 초감각 프리미엄 토스트 발송기
function showToast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  
  let typeClasses = 'bg-green-500/10 border-green-500/30 text-green-400 shadow-[0_4px_16px_rgba(34,197,94,0.15)]';
  let icon = 'check_circle';
  
  if (type === 'danger') {
    typeClasses = 'bg-red-500/10 border-red-500/30 text-red-400 shadow-[0_4px_16px_rgba(239,68,68,0.15)]';
    icon = 'error';
  } else if (type === 'warning') {
    typeClasses = 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 shadow-[0_4px_16px_rgba(234,179,8,0.15)]';
    icon = 'warning';
  } else if (type === 'info') {
    typeClasses = 'bg-accent/10 border-accent/30 text-accent shadow-[0_4px_16px_rgba(0,240,255,0.15)]';
    icon = 'info';
  }

  toast.className = `toast-message flex items-center gap-2.5 px-4.5 py-3 rounded-2xl border backdrop-blur-xl text-xs font-bold leading-normal w-full pointer-events-auto ${typeClasses}`;
  toast.innerHTML = `
    <span class="material-symbols-outlined text-[18px] shrink-0 font-bold">${icon}</span>
    <span class="flex-1">${message}</span>
  `;

  container.appendChild(toast);

  // 자동 제거
  setTimeout(() => {
    toast.classList.add('closing');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, duration);
}

// 12.2. 진짜 네이티브 전체화면 뷰 시뮬레이터 (Standalone WebApp Toggle)
function toggleFullscreenApp() {
  const el = document.documentElement;
  const icon = document.getElementById('fullscreen-icon');
  const text = document.getElementById('fullscreen-text');

  if (!document.fullscreenElement) {
    el.requestFullscreen().then(() => {
      icon.innerText = 'fullscreen_exit';
      text.innerText = '모바일 프레임 복구';
      showToast('네이티브 모바일 실기기 전체화면 뷰로 실행합니다.', 'success');
    }).catch(err => {
      showToast('본 기기(브라우저)는 네이티브 전체화면을 지원하지 않습니다.', 'warning');
    });
  } else {
    document.exitFullscreen().then(() => {
      icon.innerText = 'fullscreen';
      text.innerText = '진짜 앱(네이티브) 뷰로 실행';
      showToast('원래 모바일 프레임 모드로 복귀합니다.', 'info');
    });
  }
}

// 12.3. 글로벌 확인 모달 (Custom Confirm Modal)
let confirmOnOkCallback = null;
function showConfirm(message, onOkCallback) {
  confirmOnOkCallback = onOkCallback;
  document.getElementById('custom-confirm-msg').innerText = message;
  
  const modal = document.getElementById('custom-confirm-modal');
  const box = document.getElementById('custom-confirm-box');
  
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => {
    modal.classList.add('opacity-100');
    box.classList.add('scale-100');
  }, 50);
}

// 확인 모달 버튼 매핑
document.getElementById('custom-confirm-cancel').addEventListener('click', () => {
  closeConfirmModal();
});
document.getElementById('custom-confirm-ok').addEventListener('click', () => {
  if (confirmOnOkCallback) confirmOnOkCallback();
  closeConfirmModal();
});

function closeConfirmModal() {
  const modal = document.getElementById('custom-confirm-modal');
  const box = document.getElementById('custom-confirm-box');
  
  modal.classList.remove('opacity-100');
  box.classList.remove('scale-100');
  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }, 300);
}

// 12.4. [사용자 보완책 4] 포인트 차감 2중 컨펌 모달 (Double Confirm Point Modal)
let pointConfirmOnOkCallback = null;
function openDeductionConfirmModal(message, deductAmount, finalBalance, onOkCallback) {
  pointConfirmOnOkCallback = onOkCallback;
  document.getElementById('credit-confirm-msg').innerText = message;
  document.getElementById('credit-confirm-deduct').innerText = `-${deductAmount} CR`;
  document.getElementById('credit-confirm-balance').innerText = `${finalBalance - deductAmount} CR`;
  
  document.getElementById('credit-confirm-modal').classList.remove('hidden');
  document.getElementById('credit-confirm-modal').classList.add('flex');
}

function closeDeductionConfirmModal() {
  document.getElementById('credit-confirm-modal').classList.add('hidden');
}

document.getElementById('credit-confirm-cancel').addEventListener('click', () => {
  closeDeductionConfirmModal();
  showToast('채팅 신청 수락이 취소되었습니다. 포인트 차감 없음.', 'warning');
});
document.getElementById('credit-confirm-ok').addEventListener('click', () => {
  if (pointConfirmOnOkCallback) pointConfirmOnOkCallback();
  closeDeductionConfirmModal();
});

// 12.5. 모바일 사이드바 개방/폐쇄
function openSidebar() {
  document.getElementById('sidebar-overlay').style.pointerEvents = 'auto';
  document.getElementById('sidebar-overlay').style.opacity = '1';
  document.getElementById('sidebar-menu').classList.remove('-translate-x-full');
}

function closeSidebar() {
  document.getElementById('sidebar-overlay').style.pointerEvents = 'none';
  document.getElementById('sidebar-overlay').style.opacity = '0';
  document.getElementById('sidebar-menu').classList.add('-translate-x-full');
}

// 로그아웃 처리
async function logout() {
  if (AppState.currentUser && AppState.userRole === 'coach') {
    try {
      const uid = AppState.currentUser.uid;
      // 🌟 [V0.8.1-Hotfix2] 로그아웃 시 즉각 레이더 상에서 흔적 소거 (오프라인 상태로 갱신)
      await db.collection('users').doc(uid).update({
        status: 'inactive',
        lat: null,
        lng: null
      });
      await db.collection('waiters').doc(uid).update({
        status: 'inactive',
        lat: null,
        lng: null
      });
      console.log("🚪 [OfflineSync] 웨이터 로그아웃에 따른 레이더 흔적 즉시 소거 완료");
    } catch (e) {
      console.warn("⚠️ [OfflineSync] 로그아웃 시 오프라인 처리 실패:", e);
    }
  }

  localStorage.removeItem('mock_auth_user'); // 모킹 퀵스왑 세션 완전 청소
  sessionStorage.removeItem('admin_verified'); // 🛡️ [Security] 어드민 대시보드 권한 세션도 동시 전격 파기!
  stopAdminActivityDaemon(); // 비활동 감지 데몬 해제
  
  AppState.currentPage = 'signup'; // 🌟 동기적으로 페이지 상태를 먼저 회원가입/로그인으로 고정하여 비동기 튕김 방지!
  
  auth.signOut().then(() => {
    showToast('정상적으로 로그아웃되었습니다.', 'info');
    disconnectRealtimeSync();
    navigateTo('signup');
  });
}

// 12.6. PC 전용 실시간 모바일 무선 QR 접속기 업데이트 데몬
function initQATunnelUrlSync() {
  const qrImg = document.getElementById('qa-qr-img');
  const urlInput = document.getElementById('qa-tunnel-url-input');
  
  if (!qrImg || !urlInput) return;

  // 🌟 디폴트 실서버 고유 주소 우선 빌드
  const defaultUrl = 'https://club-rader2.onrender.com';
  urlInput.value = defaultUrl;
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(defaultUrl)}`;

  const fetchUrl = () => {
    fetch('/api/debug/tunnel-url')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        // 로컬 ngrok 터널링 주소가 명확히 들어올 때만 스왑 (아닐 경우 실서버 주소 안전 유지)
        if (data && data.url && (data.url.includes('.ngrok') || data.url.includes('.loca.lt'))) {
          urlInput.value = data.url;
          qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data.url)}`;
        }
      })
      .catch(() => {});
  };

  // 구동 즉시 실행 및 5초마다 실시간 체크 폴링
  fetchUrl();
  setInterval(fetchUrl, 5000);
}

// 터널 URL 복사 기능
function copyQATunnelUrl() {
  const urlInput = document.getElementById('qa-tunnel-url-input');
  if (urlInput) {
    urlInput.select();
    urlInput.setSelectionRange(0, 99999); // 모바일 보정
    navigator.clipboard.writeText(urlInput.value)
      .then(() => {
        showToast('📋 원격 접속 주소가 클립보드에 복사되었습니다! 카톡에 붙여넣어 공유하세요.', 'success');
      })
      .catch(() => {
        showToast('❌ 주소 복사에 실패했습니다.', 'danger');
      });
  }
}

// 7.2.8. 테스터 1초 즉시 계정 스왑 로그인 함수
async function quickLoginAs(uid) {
  try {
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) {
      const userData = snap.data();
      // 🌟 [V0.8.1 중복로그인] 기기 고유 세션 ID 생성 및 로컬/DB 주입
      const newSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      localStorage.setItem('mock_session_id', newSessionId);
      userData.activeSessionId = newSessionId;
      await db.collection('users').doc(uid).update({ activeSessionId: newSessionId });

      const mockUser = { uid, email: `test_\${uid}@test.com` };
      
      // 세션 저장
      localStorage.setItem('mock_auth_user', JSON.stringify(mockUser));
      
      // 🌟 [Security/Sync] 비동기 동기화 딜레이 방지를 위해 즉시 전역 상태 강제 씽크 바인딩!
      AppState.currentUser = { uid, ...userData };
      AppState.credits = Number(userData.credits) || 0;
      AppState.userRole = userData.role || 'player';
      
      showToast(`⚡ 1초 퀵로그인 성공: [\${userData.nickname}]님으로 접속했습니다!`, 'success');
      
      // 동기화 작동
      bindRealtimeSync(uid);
      
      if (userData.role === 'player') {
        navigateTo('home');
      } else {
        if (userData.isApproved) {
          navigateTo('home');
        } else {
          navigateTo('waiting');
        }
      }
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// 글로벌 등록
window.AppState = AppState;
window.copyQATunnelUrl = copyQATunnelUrl;
window.switchSignupTab = switchSignupTab;
window.quickLoginAs = quickLoginAs;
window.handleLoginSubmit = handleLoginSubmit;
window.lockAdminSession = lockAdminSession;
window.startDirectTalk = startDirectTalk;

// 7.7.1. 성공 수기 상세 모달 팝업창 동적 빌드 (V1.5.7 마이너 핫픽스: 실시간 리액티브 onSnapshot 및 싫어요 기능 추가)
let unsubPostModal = null;

async function openPostDetailModal(postId) {
  try {
    const postRef = db.collection('posts').doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      showToast('⚠️ 해당 게시물이 존재하지 않습니다.', 'warning');
      return;
    }
    const basePost = postSnap.data();

    // 🌟 [V1.5.7 마이너 핫픽스] 조회수 1 증가 즉시 로컬 캐시(AppState.posts)에 선반영하여 0초 반응 틱 효과 선사!
    const originalViews = Number(basePost.views) || 0;
    const postIdx = AppState.posts.findIndex(p => p.id === postId);
    if (postIdx > -1) {
      AppState.posts[postIdx].views = originalViews + 1;
    }
    
    // 백엔드 원장에도 안전 업데이트 즉시 발송
    postRef.update({ views: originalViews + 1 });

    let detailModal = document.getElementById('post-detail-modal');
    if (!detailModal) {
      detailModal = document.createElement('div');
      detailModal.id = 'post-detail-modal';
      detailModal.className = 'fixed inset-0 z-[10007] bg-[#05050a]/95 backdrop-blur-xl flex items-center justify-center px-6 hidden';
      document.body.appendChild(detailModal);
    }

    // 🔒 [Live Sync] 상세 모달이 열려 있는 동안 추천/싫어요/조회수가 깜빡임 없이 즉각 실시간 갱신되도록 onSnapshot 바인딩!
    if (unsubPostModal) unsubPostModal();
    unsubPostModal = postRef.onSnapshot((doc) => {
      if (!doc.exists) return;
      const post = doc.data();
      const isAuthor = AppState.currentUser && String(AppState.currentUser.uid) === String(post.authorUid);

      detailModal.innerHTML = `
        <div class="glass-card p-6 rounded-3xl border border-accent/30 w-full max-w-sm shadow-[0_20px_50px_rgba(0,240,255,0.2)]">
          <div class="flex justify-between items-center mb-1">
            <span class="text-[9px] text-accent font-black uppercase tracking-widest bg-accent/10 px-2.5 py-0.5 rounded-full">${post.clubName} 태그</span>
            <span class="material-symbols-outlined text-white/40 cursor-pointer p-1 hover:text-white transition" onclick="closePostDetailModal()">close</span>
          </div>
          
          <h3 class="text-sm font-black text-white leading-snug mt-3 mb-1.5">${post.title}</h3>
          
          <!-- 🌟 [V1.5.8] 추천, 싫어요, 조회수 고선명 리디자인 바 -->
          <div class="flex justify-between items-center text-[10px] text-white/50 font-bold mb-3 px-3 bg-white/5 py-1.5 rounded-xl border border-white/5">
            <span class="flex items-center gap-1">👁️ 조회 ${post.views || 0}회</span>
            <span class="flex items-center gap-2">👍 추천 ${post.likes || 0} · 👎 비추 ${post.dislikes || 0}</span>
          </div>

          <div class="flex justify-between items-center bg-white/5 p-3 rounded-2xl text-[10px] mb-4">
            <span class="text-white/60">작성자: <strong class="text-white">${post.author}</strong></span>
            <span class="text-secondary font-black">담당 웨이터: ${post.waiterName || '미지정'} (★ ${post.rating})</span>
          </div>

          <div class="bg-surface/50 border border-white/5 rounded-2xl p-4 min-h-[120px] max-h-[220px] overflow-y-auto mb-5 text-xs text-white/80 leading-relaxed readable-text-body hide-scrollbar">
            ${post.content.replace(/\n/g, '<br/>')}
          </div>

          ${isAuthor ? `
          <div class="flex gap-2.5 mb-4 shrink-0">
            <button type="button" class="flex-1 h-10 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 hover:bg-amber-500/20 active:scale-95 transition-all btn-active-scale" onclick="openEditPostModal('${postId}')">
              <span class="material-symbols-outlined text-xs">edit</span> 수기 수정
            </button>
            <button type="button" class="flex-1 h-10 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 hover:bg-red-500/20 active:scale-95 transition-all btn-active-scale" onclick="handleDeletePost('${postId}')">
              <span class="material-symbols-outlined text-xs">delete</span> 수기 삭제
            </button>
          </div>
          ` : ''}

          <div class="flex gap-2">
            <button type="button" class="flex-1 h-11 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white btn-active-scale" onclick="closePostDetailModal()">닫기</button>
            
            <button type="button" class="h-11 px-3 bg-accent/10 border border-accent/20 rounded-xl text-xs font-black text-accent flex items-center gap-1 btn-active-scale" onclick="likePost('${postId}')">
              <span class="material-symbols-outlined text-sm">thumb_up</span> <span id="post-detail-likes-cnt">${post.likes || 0}</span>
            </button>
            
            <button type="button" class="h-11 px-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-black text-red-400 flex items-center gap-1 btn-active-scale" onclick="dislikePost('${postId}')">
              <span class="material-symbols-outlined text-sm">thumb_down</span> <span id="post-detail-dislikes-cnt">${post.dislikes || 0}</span>
            </button>
          </div>
        </div>
      `;
    });

    detailModal.classList.remove('hidden');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

function closePostDetailModal() {
  const modal = document.getElementById('post-detail-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  // ⏱️ 모달 이탈 시 리액티브 리스너 자원 해제
  if (unsubPostModal) {
    unsubPostModal();
    unsubPostModal = null;
  }
}

async function likePost(postId) {
  try {
    if (!AppState.currentUser) {
      showToast('⚠️ 로그인이 필요한 서비스입니다!', 'warning');
      return;
    }
    const postRef = db.collection('posts').doc(postId);
    const postSnap = await postRef.get();
    if (postSnap.exists) {
      const post = postSnap.data();
      
      // 1. 셀프 추천 차단 가드
      if (String(AppState.currentUser.uid) === String(post.authorUid)) {
        showToast('⚠️ 본인이 작성한 글은 추천할 수 없습니다!', 'warning');
        return;
      }

      // 2. 2중 추천 방어막
      const likedUsers = post.likedUsers || [];
      if (likedUsers.includes(AppState.currentUser.uid)) {
        showToast('⚠️ 이미 추천한 게시글입니다!', 'warning');
        return;
      }

      const currentLikes = Number(post.likes) || 0;
      const updatedLikes = currentLikes + 1;
      const nextLikedUsers = [...likedUsers, AppState.currentUser.uid];

      await postRef.update({ 
        likes: updatedLikes,
        likedUsers: nextLikedUsers
      });
      
      showToast('👍 방문 수기를 추천하였습니다!', 'success');
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

async function dislikePost(postId) {
  try {
    if (!AppState.currentUser) {
      showToast('⚠️ 로그인이 필요한 서비스입니다!', 'warning');
      return;
    }
    const postRef = db.collection('posts').doc(postId);
    const postSnap = await postRef.get();
    if (postSnap.exists) {
      const post = postSnap.data();
      
      // 1. 셀프 비추천 차단 가드
      if (String(AppState.currentUser.uid) === String(post.authorUid)) {
        showToast('⚠️ 본인이 작성한 글은 비추천할 수 없습니다!', 'warning');
        return;
      }

      // 2. 2중 비추천 방어막
      const dislikedUsers = post.dislikedUsers || [];
      if (dislikedUsers.includes(AppState.currentUser.uid)) {
        showToast('⚠️ 이미 비추천한 게시글입니다!', 'warning');
        return;
      }

      const currentDislikes = Number(post.dislikes) || 0;
      const updatedDislikes = currentDislikes + 1;
      const nextDislikedUsers = [...dislikedUsers, AppState.currentUser.uid];

      await postRef.update({ 
        dislikes: updatedDislikes,
        dislikedUsers: nextDislikedUsers
      });
      
      showToast('👎 방문 수기에 아쉬운 싫어요 피드백을 전송했습니다.', 'warning');
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

window.openPostDetailModal = openPostDetailModal;
window.closePostDetailModal = closePostDetailModal;
window.likePost = likePost;
window.dislikePost = dislikePost;

// 🌟 [V1.6.0 NEW] 카카오톡형 배려 퇴장 (방안 C) - 채팅방 나가기 트랜잭션 함수
async function handleLeaveChatRoom(roomId, event) {
  console.log('[DEBUG-LEAVE] 🚀 handleLeaveChatRoom 진입! roomId:', roomId);
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  if (!roomId || roomId === 'null' || roomId === 'undefined') {
    roomId = AppState.activeChatRoomId;
  }

  if (!roomId) {
    console.error('[DEBUG-LEAVE] ❌ roomId 누락! AppState.activeChatRoomId가 빈값입니다.');
    showToast('대화방 ID를 찾을 수 없습니다.', 'danger');
    return;
  }

  showConfirm("채팅방을 나가시겠습니까?\n퇴장 시 기존 대화 내역은 모두 삭제되며 목록에서 완전히 사라집니다.", async () => {
    try {
      console.log('[DEBUG-LEAVE] ✉️ /api/chat/leave fetch 전송 시작... roomId:', roomId);
      const res = await fetch(`/api/chat/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Active-Session-Id': localStorage.getItem('mock_session_id') || '',
          'X-User-Uid': String(AppState.currentUser.uid)
        },
        body: JSON.stringify({
          roomId: roomId,
          userUid: AppState.currentUser.uid
        })
      });

      console.log('[DEBUG-LEAVE] 📬 /api/chat/leave 응답 수신완료. Status:', res.status, 'ok:', res.ok);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || '채팅방 나가기 처리 중 오류 발생');
      }

      showToast('대화방을 퇴장하였습니다.', 'info');
      
      // 만약 현재 열려있던 대화 상세 오버레이가 나간 방이었다면 강제 폐쇄
      if (AppState.activeChatRoomId === roomId) {
        closeChatRoomDetail();
      }
      
      renderTalkScreen();
    } catch (err) {
      console.error('[DEBUG-LEAVE] ❌ 퇴장 처리 예외 발생:', err.message);
      showToast(err.message, 'danger');
    }
  });
}
window.handleLeaveChatRoom = handleLeaveChatRoom;

// 🌟 [V1.6.1 NEW] 이모티콘 퀵 선택 패널 토글 제어
function toggleEmojiPicker() {
  const panel = document.getElementById('emoji-picker-panel');
  if (panel) {
    panel.classList.toggle('hidden');
    panel.classList.toggle('grid');
  }
}
window.toggleEmojiPicker = toggleEmojiPicker;

// 🌟 [V1.6.1 NEW] 인풋 창 포커스 위치에 이모지 추가 삽입
function insertEmojiToInput(emoji) {
  const textInput = document.getElementById('chat-message-input');
  if (textInput) {
    textInput.value = textInput.value + emoji;
    textInput.focus();
  }
}
window.insertEmojiToInput = insertEmojiToInput;

// 🌟 [V1.6.1 NEW] 성공 수기 수정 모달 팝업 개방
async function openEditPostModal(postId) {
  try {
    const postRef = db.collection('posts').doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      showToast('⚠️ 해당 게시물이 존재하지 않습니다.', 'warning');
      return;
    }
    const post = postSnap.data();

    let editModal = document.getElementById('post-edit-modal');
    if (!editModal) {
      editModal = document.createElement('div');
      editModal.id = 'post-edit-modal';
      editModal.className = 'fixed inset-0 z-[10008] bg-[#05050a]/95 backdrop-blur-xl flex items-center justify-center px-6';
      document.body.appendChild(editModal);
    }

    editModal.innerHTML = `
      <div class="glass-card p-6 rounded-3xl border border-primary/30 w-full max-w-sm shadow-[0_20px_50px_rgba(255,0,127,0.2)]">
        <div class="flex justify-between items-center mb-1 border-b border-white/10 pb-3">
          <h3 class="text-base font-black text-white tracking-tight flex items-center gap-1.5">
            <span class="material-symbols-outlined text-primary text-xl">edit</span> 성공 수기 내용 수정
          </h3>
          <span class="material-symbols-outlined text-white/40 cursor-pointer p-1 hover:text-white transition" onclick="closeEditPostModal()">close</span>
        </div>
        <p class="text-[10px] text-on-surface-variant/80 mb-4 mt-2">수기 글의 제목과 내용을 깔끔하게 정정하실 수 있습니다.</p>
        
        <form class="space-y-4" onsubmit="submitEditPostForm(event, '${postId}')">
          <div>
            <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">글 제목</label>
            <input type="text" id="post-edit-title" required value="${post.title}" class="w-full h-10 bg-surface border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary placeholder:text-white/20"/>
          </div>

          <div>
            <label class="block text-[10px] text-white/60 font-black mb-1.5 uppercase">수기 본문 내용</label>
            <textarea id="post-edit-content" required rows="7" class="w-full bg-surface border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-primary placeholder:text-white/20">${post.content}</textarea>
          </div>

          <div class="flex gap-3 pt-2">
            <button type="button" class="flex-1 h-11 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white btn-active-scale" onclick="closeEditPostModal()">취소</button>
            <button type="submit" class="flex-1 h-11 bg-neon-gradient text-white rounded-xl text-xs font-black shadow-lg shadow-primary/20 btn-active-scale">수정 완료 💾</button>
          </div>
        </form>
      </div>
    `;
    
    editModal.classList.remove('hidden');
    editModal.classList.add('flex');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}
window.openEditPostModal = openEditPostModal;

function closeEditPostModal() {
  const modal = document.getElementById('post-edit-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}
window.closeEditPostModal = closeEditPostModal;

// 🌟 [V1.6.1 NEW] 수기 수정 완료 폼 제출 트랜잭션
async function submitEditPostForm(e, postId) {
  e.preventDefault();
  const title = document.getElementById('post-edit-title').value.trim();
  const content = document.getElementById('post-edit-content').value.trim();

  if (!title || !content) {
    showToast('제목과 내용을 모두 입력해 주세요!', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/db/posts/${postId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Active-Session-Id': localStorage.getItem('mock_session_id') || '',
        'X-User-Uid': String(AppState.currentUser.uid)
      },
      body: JSON.stringify({
        title: title,
        content: content
      })
    });

    if (!res.ok) {
      throw new Error('수기 글 수정 처리에 실패했습니다.');
    }

    showToast('수기 글이 성공적으로 수정 갱신되었습니다!', 'success');
    closeEditPostModal();
    
    // 목록 갱신
    if (AppState.currentPage === 'board') {
      renderBoardScreen();
    }
  } catch (err) {
    showToast(err.message, 'danger');
  }
}
window.submitEditPostForm = submitEditPostForm;

// 🌟 [V1.6.1 NEW] 성공 수기 삭제 처리 트랜잭션
async function handleDeletePost(postId) {
  showConfirm("정말로 이 수기 글을 영구 삭제하시겠습니까?", async () => {
    try {
      const res = await fetch(`/api/db/posts/${postId}`, {
        method: 'DELETE',
        headers: {
          'X-Active-Session-Id': localStorage.getItem('mock_session_id') || '',
          'X-User-Uid': String(AppState.currentUser.uid)
        }
      });

      if (!res.ok) {
        throw new Error('글 삭제 중 오류가 발생했습니다.');
      }

      showToast('성공 수기 글이 깨끗이 영구 삭제되었습니다!', 'success');
      closePostDetailModal();
      
      // 목록 갱신
      if (AppState.currentPage === 'board') {
        renderBoardScreen();
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });
}
window.handleDeletePost = handleDeletePost;

// DOMContentLoaded 완료 후 실행에 결합
document.addEventListener('DOMContentLoaded', () => {
  initQATunnelUrlSync();
});
