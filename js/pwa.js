let deferredInstallPrompt = null;

function isIOSDevice(){
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isKakaoTalkBrowser(){
  return /KAKAOTALK|DaumApps/i.test(navigator.userAgent || '');
}
function isStandaloneMode(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function closeKakaoGuide(){
  document.getElementById('kakaoGuideOverlay')?.classList.remove('show');
}
function copyCurrentLink(){
  const url = location.href;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(()=>alert('링크를 복사했어요. Chrome 또는 Safari 주소창에 붙여넣어 주세요.'));
  } else {
    const ta=document.createElement('textarea'); ta.value=url; document.body.appendChild(ta); ta.select();
    try{document.execCommand('copy')}catch(e){} ta.remove();
    alert('링크를 복사했어요. Chrome 또는 Safari 주소창에 붙여넣어 주세요.');
  }
}
function openInstallGuide(){
  const overlay=document.getElementById('installGuideOverlay');
  const steps=document.getElementById('installGuideSteps');
  const nativeBtn=document.getElementById('nativeInstallBtn');
  if (!overlay || !steps || !nativeBtn) return;

  if (isStandaloneMode()) {
    steps.innerHTML='<b>이미 앱처럼 설치되어 있어요.</b><br>홈 화면에서 어른이 동화마을 아이콘을 눌러 실행하면 됩니다.';
    nativeBtn.style.display='none';
  } else if (isIOSDevice()) {
    steps.innerHTML='<b>아이폰 / 아이패드 Safari</b><br>① 아래쪽 <b>공유 버튼(□↑)</b>을 누르세요.<br>② <b>홈 화면에 추가</b>를 선택하세요.<br>③ 이름을 확인하고 <b>추가</b>를 누르면 앱 아이콘이 생겨요.';
    nativeBtn.style.display='none';
  } else if (deferredInstallPrompt) {
    steps.innerHTML='<b>안드로이드 Chrome</b><br><b>앱으로 설치</b> 버튼을 누르면 홈 화면에 어른이 동화마을이 설치됩니다.';
    nativeBtn.style.display='block';
  } else {
    steps.innerHTML='<b>안드로이드 Chrome</b><br>오른쪽 위 <b>⋮</b> 메뉴를 누른 뒤 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 선택하세요.';
    nativeBtn.style.display='none';
  }
  overlay.classList.add('show');
}
function closeInstallGuide(){
  document.getElementById('installGuideOverlay')?.classList.remove('show');
}
async function triggerNativeInstall(){
  if (!deferredInstallPrompt) { openInstallGuide(); return; }
  deferredInstallPrompt.prompt();
  try { await deferredInstallPrompt.userChoice; } catch(e) {}
  deferredInstallPrompt = null;
  document.getElementById('nativeInstallBtn').style.display='none';
}
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredInstallPrompt=e;
  if (!isStandaloneMode()) document.getElementById('installAppBtn')?.classList.add('show');
});
window.addEventListener('appinstalled', ()=>{
  deferredInstallPrompt=null;
  document.getElementById('installAppBtn')?.classList.remove('show');
  closeInstallGuide();
});

document.addEventListener('DOMContentLoaded', ()=>{
  try { handleLearningModeChange(); updateLanguageButtons(); } catch(e) {}
  setTimeout(()=>{ try{initVoices(); updateVoiceStatus();}catch(e){} }, 500);

  if (!isStandaloneMode()) {
    document.getElementById('installAppBtn')?.classList.add('show');
  }

  if (isKakaoTalkBrowser()) {
    const ov=document.getElementById('kakaoGuideOverlay');
    const steps=document.getElementById('kakaoGuideSteps');
    if (steps) {
      steps.innerHTML = isIOSDevice()
        ? '<b>아이폰 / 아이패드</b><br>① 카카오톡의 <b>⋯</b> 메뉴를 누르세요.<br>② <b>Safari로 열기</b> 또는 <b>기본 브라우저로 열기</b>를 선택하세요.<br>③ 메뉴가 없으면 <b>링크 복사</b> 후 Safari 주소창에 붙여넣으세요.'
        : '<b>안드로이드</b><br>① 오른쪽 위 <b>⋮</b> 메뉴를 누르세요.<br>② <b>다른 브라우저로 열기</b> 또는 <b>Chrome으로 열기</b>를 선택하세요.<br>③ 메뉴가 없으면 <b>링크 복사</b> 후 Chrome 주소창에 붙여넣으세요.';
    }
    ov?.classList.add('show');
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(err=>console.log('SW:',err));
  }
});
