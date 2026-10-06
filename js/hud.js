// 🪞 증강 동화 모드 (HUD · 페퍼스 고스트 방식)
// 휴대폰·태블릿을 눕히고 그 위에 투명 아크릴(또는 투명 CD 케이스)을 45°로 세우면,
// 화면의 밝은 부분만 아크릴에 비쳐 동화 그림과 글자가 공중에 떠 있는 것처럼 보입니다.
//  - 검은색 = 투명(비치지 않음) → 배경은 완전 검정, 그림 가장자리는 검정으로 스르르 사라지게
//  - 반사되면 뒤집혀 보이므로 좌우/상하 반전 버튼으로 맞춤(설정은 기기에 기억)
//  - 동화 낭독(기본 음성·AI 성우)과 페이지 넘김을 그대로 따라감. AI를 새로 부르지 않음.
(function () {
  const PREF = 'eoreuni_hud_pref';
  let stage = null, prevOnLine = null, hooked = false;
  let pref = { flipX: false, flipY: true, scale: 1 };
  try { pref = Object.assign(pref, JSON.parse(localStorage.getItem(PREF) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(PREF, JSON.stringify(pref)); } catch (e) {} };
  const $ = (q) => stage && stage.querySelector(q);

  function applyTransform() {
    const inner = $('.hud-inner'); if (!inner) return;
    inner.style.transform = `scale(${pref.flipX ? -pref.scale : pref.scale}, ${pref.flipY ? -pref.scale : pref.scale})`;
    const fx = $('.hud-fx'), fy = $('.hud-fy');
    if (fx) fx.classList.toggle('on', pref.flipX);
    if (fy) fy.classList.toggle('on', pref.flipY);
  }

  function setPage(i) {
    if (!stage || !currentStoryBookObject) return;
    const p = currentStoryBookObject.pages[i];
    const img = $('.hud-img');
    if (img) {
      img.classList.remove('in');
      img.src = p && p.imageBase64 ? `data:image/png;base64,${p.imageBase64}` : '';
      void img.offsetWidth; img.classList.add('in');
    }
  }

  function setLine(role, text) {
    const el = $('.hud-sub'); if (!el) return;
    const t = String(text || '').replace(/[*#"]/g, '').trim();
    if (/^(제목|Title)\s*:/.test(t)) { el.textContent = t.replace(/^(제목|Title)\s*:\s*/, ''); el.className = 'hud-sub title'; return; }
    el.textContent = t;
    el.className = 'hud-sub' + (role && role !== 'narrator' ? ' talk' : '');
  }

  function hook() {
    if (hooked) return; hooked = true;
    const origShow = window.showPage;
    window.showPage = function () { const r = origShow.apply(this, arguments); if (stage) setPage(currentPageIndex); return r; };
    const origSpeak = window.speakDynamicLine;
    window.speakDynamicLine = function (role, emotion, text) { if (stage) setLine(role, text); return origSpeak.apply(this, arguments); };
  }

  function close() {
    try { stopVoice(); } catch (e) {}
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    window.onStoryLine = prevOnLine; prevOnLine = null;
    if (stage) { stage.remove(); stage = null; }
  }

  window.openHudMode = function () {
    if (!currentStoryBookObject || !currentStoryBookObject.pages?.length) { alert('먼저 동화를 열어주세요.'); return; }
    hook();
    try { stopVoice(); } catch (e) {}
    stage = document.createElement('div');
    stage.className = 'hud-stage';
    stage.innerHTML = `
      <div class="hud-inner">
        <img class="hud-img" alt="">
        <div class="hud-sub title"></div>
      </div>
      <div class="hud-guide">
        <div class="hud-guide-box">
          <b>🪞 증강 동화 준비</b>
          <ol>
            <li>방을 조금 어둡게 하고, 휴대폰·태블릿을 <b>화면이 위로</b> 오게 눕혀요.</li>
            <li>화면 위에 <b>투명 아크릴</b>(또는 투명 CD 케이스)을 <b>45°</b>로 비스듬히 세워요.</li>
            <li>아크릴을 바라보면 그림과 글자가 <b>공중에 떠 있어요!</b> 글자가 뒤집혀 보이면 아래 반전 버튼으로 맞춰요.</li>
          </ol>
          <button type="button" class="hud-start">▶ 시작하기</button>
        </div>
      </div>
      <div class="hud-bar">
        <button type="button" class="hud-fx">↔ 좌우 반전</button>
        <button type="button" class="hud-fy">↕ 상하 반전</button>
        <button type="button" class="hud-minus">－</button>
        <button type="button" class="hud-plus">＋</button>
        <button type="button" class="hud-close">✕ 끝내기</button>
      </div>`;
    document.body.appendChild(stage);
    setPage(0);
    setLine('narrator', `제목: ${typeof getActiveStoryTitle === 'function' ? getActiveStoryTitle(currentStoryBookObject) : currentStoryBookObject.title}`);
    applyTransform();

    // AI 성우 목소리 자막도 따라가기 (녹화 기능 등 다른 연결은 끝낼 때 되돌림)
    prevOnLine = window.onStoryLine;
    window.onStoryLine = function (role, text) { setLine(role, text); if (typeof prevOnLine === 'function') prevOnLine(role, text); };

    $('.hud-fx').onclick = () => { pref.flipX = !pref.flipX; save(); applyTransform(); };
    $('.hud-fy').onclick = () => { pref.flipY = !pref.flipY; save(); applyTransform(); };
    $('.hud-plus').onclick = () => { pref.scale = Math.min(1.4, +(pref.scale + 0.1).toFixed(2)); save(); applyTransform(); };
    $('.hud-minus').onclick = () => { pref.scale = Math.max(0.6, +(pref.scale - 0.1).toFixed(2)); save(); applyTransform(); };
    $('.hud-close').onclick = close;
    $('.hud-start').onclick = async () => {
      $('.hud-guide').style.display = 'none';
      try { if (stage.requestFullscreen) await stage.requestFullscreen(); } catch (e) {}
      setTimeout(() => { if (stage) startContinuousReading(null, 0); }, 500);
    };
    // 화면을 톡 누르면 조절 막대가 잠깐 보였다 사라짐
    let hideT = null;
    stage.addEventListener('click', (e) => {
      if (e.target.closest('.hud-bar') || e.target.closest('.hud-guide')) return;
      stage.classList.add('show-bar'); clearTimeout(hideT); hideT = setTimeout(() => stage && stage.classList.remove('show-bar'), 3500);
    });
    document.addEventListener('fullscreenchange', function onFs() {
      if (!document.fullscreenElement && stage && $('.hud-guide').style.display === 'none') { document.removeEventListener('fullscreenchange', onFs); close(); }
    });
  };
})();
