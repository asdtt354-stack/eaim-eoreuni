// 🎬 어른이 동화마을 — 동화 녹화 모드
// - PC(크롬/엣지): 화면+소리를 영상 파일(mp4 또는 webm)로 저장
// - 휴대폰: 녹화용 큰 화면만 띄우고, 휴대폰 자체 화면녹화 기능으로 녹화
(function () {
  let stageEl = null;
  let stageMode = null;          // 'record' | 'view' | null
  let captureStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordedMime = '';
  let isFinishing = false;
  // 🎁 로고송 인트로: 어른이 동화마을은 지금 쓰지 않아요(2026-10-06 선생님 결정 — 아이용 뮤토니즈 로고송이 밤 분위기와 달라서).
  //    어른 버전 로고송을 만들면 assets/intro/ 에 파일을 넣고 아래 INTRO_ON 을 true 로 바꾸면 다시 켜져요.
  const INTRO_ON = false;
  const INTRO_SRC = './assets/intro/eoreuni-intro.mp4';
  const INTRO_PREF_KEY = 'eoreuni_intro_pref';

  function wantIntro() {
    const box = stageEl && stageEl.querySelector('.rec-intro-check');
    return INTRO_ON && !!(box && box.checked && document.body.classList.contains('is-creator'));
  }

  // 🎁 뮤토니즈 인트로(로고송) 재생 — 끝나면(또는 문제가 생기면) 다음으로
  // 인트로 영상을 무대에 미리 올려 첫 장면에 멈춰 두기 — 녹화 준비 중에는 이 첫 장면이 보이고,
  // 녹화가 시작되면 곧바로 재생된다. (제목 카드가 인트로 앞에 잠깐 찍히던 문제 해결)
  function prepareIntroEl() {
    const frame = $('.rec-frame');
    if (!frame) return null;
    const v = document.createElement('video');
    v.className = 'rec-intro';
    v.src = INTRO_SRC;
    v.playsInline = true;
    v.preload = 'auto';
    v.onerror = () => { v.remove(); };   // 인트로 파일이 없으면 조용히 빼고 제목 카드로
    frame.appendChild(v);
    try { v.load(); } catch (e) {}
    return v;
  }

  function playIntro(existing) {
    return new Promise((resolve) => {
      const frame = $('.rec-frame');
      if (!frame) { resolve(); return; }
      const v = (existing && existing.isConnected) ? existing : prepareIntroEl();
      if (!v) { resolve(); return; }
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        v.classList.add('out');
        setTimeout(() => { v.remove(); resolve(); }, 450);
      };
      v.onended = finish;
      v.onerror = finish;
      setTimeout(finish, 9000); // 혹시 멈춰도 9초 뒤에는 넘어가기
      const p = v.play();
      if (p && p.catch) p.catch(finish);
    });
  }

  const $ = (sel) => stageEl && stageEl.querySelector(sel);
  // ⚠️ AI 성우 목소리가 빠진 페이지가 있으면 녹화 준비 화면에서 미리 알려 주기
  //    (녹화·화면 공유 중에는 기본 음성이 막혀 화면이 멈춘 것처럼 보일 수 있음)
  function addMissingVoiceWarning() {
    try {
      const n = getActiveStoryPages(currentStoryBookObject).length;
      const missing = [];
      const pages = getActiveStoryPages(currentStoryBookObject);
      const fix = [];
      for (let i = 0; i < n; i++) {
        if (!(typeof hasAiVoice === 'function' && hasAiVoice(i))) missing.push(i + 1);
        else if (typeof pageNeedsVoice === 'function' && currentStoryBookObject.pages?.[i] === pages[i] && pageNeedsVoice(pages[i])) fix.push(i + 1);
      }
      if (missing.length && missing.length < n) {
        $('.rec-ready-desc').innerHTML += `<br><span class="rec-warn">⚠️ ${missing.join(', ')}페이지에 AI 성우 목소리가 없어요. 녹화 중에는 기본 음성이 나오지 않을 수 있으니, 먼저 <b>🎙️ 목소리 채우기</b>를 눌러 주세요.</span>`;
      }
      if (fix.length) {
        $('.rec-ready-desc').innerHTML += `<br><span class="rec-warn">🔤 ${fix.join(', ')}페이지는 ㄱ·ㄴ 같은 글자를 예전 방식(그, 느)으로 읽은 목소리예요. <b>🎙️ 목소리 채우기·고치기</b>를 누르면 기역·니은으로 다시 만들어요.</span>`;
      }
    } catch (e) {}
  }


  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function canRecordToFile() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder);
  }

  function pickMimeType() {
    const candidates = [
      'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    return candidates.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || '';
  }

  function getMuniImageSrc() {
    // 🌙 녹화 카드에는 '들려주는 뮤인이'(눈을 감고 조용히 지휘)를 씁니다. 첫 화면은 '맞이하는 뮤인이'(guide.png)
    return new URL('./assets/guide-listen.png', location.href).href;
  }

  // ---------- 무대(녹화 화면) 만들기 ----------
  function buildStage() {
    if (stageEl) stageEl.remove();
    stageEl = document.createElement('div');
    stageEl.className = 'rec-stage';
    const title = typeof getActiveStoryTitle === 'function' ? getActiveStoryTitle(currentStoryBookObject) : (currentStoryBookObject?.title || '');
    const author = currentStoryBookObject?.author || '';
    const muni = getMuniImageSrc();
    const isEn = typeof isEnglishStoryMode === 'function' && isEnglishStoryMode();
    const txt = isEn
      ? { village: "Eoreuni Story Village", by: `Written by ${esc(author)}`, end: 'The End', endSub: "Eoreuni Story Village · Mutonies" }
      : { village: '어른이 동화마을', by: `글 · ${esc(author)} 작가`, end: '끝', endSub: '어른이 동화마을 · Mutonies' };
    stageEl.innerHTML = `
      <div class="rec-frame">
        <div class="rec-bg"></div>
        <img class="rec-img" alt="">
        <div class="rec-page"></div>
        <div class="rec-sub"><span class="rec-sub-text"></span></div>

        <div class="rec-card rec-title-card">
          ${muni ? `<img src="${muni}" alt="안내자">` : ''}
          <div class="rec-card-kicker">${txt.village}</div>
          <div class="rec-card-title">${esc(title)}</div>
          ${author ? `<div class="rec-card-author">${txt.by}</div>` : ''}
        </div>

        <div class="rec-card rec-end-card">
          ${muni ? `<img src="${muni}" alt="안내자">` : ''}
          <div class="rec-card-title">${txt.end}</div>
          <div class="rec-card-kicker">${txt.endSub}</div>
        </div>

        <div class="rec-ready">
          <div class="rec-ready-box">
            <div class="rec-ready-title">🎬 녹화 준비 완료</div>
            <p class="rec-ready-desc"></p>
            ${INTRO_ON ? '<label class="rec-intro-opt creator-only"><input type="checkbox" class="rec-intro-check"> 🎁 어른이 동화마을 인트로(로고송) 먼저 넣기</label>' : ''}
            <button type="button" class="rec-start-btn">▶ 시작하기</button>
            <button type="button" class="rec-cancel-btn">취소</button>
          </div>
        </div>
      </div>
      <button type="button" class="rec-close" title="끝내기">✕ 끝내기</button>
    `;
    document.body.appendChild(stageEl);
    const introCheck = $('.rec-intro-check');
    if (introCheck) {
      let saved = null;
      try { saved = localStorage.getItem(INTRO_PREF_KEY); } catch (e) {}
      introCheck.checked = saved !== 'off';
      introCheck.onchange = () => { try { localStorage.setItem(INTRO_PREF_KEY, introCheck.checked ? 'on' : 'off'); } catch (e) {} };
    }
    // 인트로 영상을 미리 불러 두기 (시작할 때 바로 재생되게)
    if (INTRO_ON && document.body.classList.contains('is-creator')) {
      try { const pre = document.createElement('video'); pre.preload = 'auto'; pre.src = INTRO_SRC; pre.load(); stageEl.__introPre = pre; } catch (e) {}
    }
    $('.rec-start-btn').onclick = beginPlayback;
    $('.rec-cancel-btn').onclick = () => finishRecording(true);
    $('.rec-close').onclick = () => finishRecording(false);
    showCard('title');
    updateStagePage(0);
  }

  function showCard(which) {
    if (!stageEl) return;
    stageEl.classList.toggle('show-title', which === 'title');
    stageEl.classList.toggle('show-end', which === 'end');
  }

  function updateStagePage(index) {
    if (!stageEl || !currentStoryBookObject) return;
    const page = currentStoryBookObject.pages[index];
    const img = $('.rec-img');
    const bg = $('.rec-bg');
    const src = page?.imageBase64 ? `data:image/png;base64,${page.imageBase64}` : '';
    if (img) {
      img.classList.remove('in');
      img.src = src;
      img.style.display = src ? 'block' : 'none';
      void img.offsetWidth;
      img.classList.add('in');
    }
    if (bg) bg.style.backgroundImage = src ? `url("${src}")` : 'none';
    const total = currentStoryBookObject.pages.length;
    const pageEl = $('.rec-page');
    if (pageEl) pageEl.textContent = `${index + 1} / ${total}`;
  }

  function updateSubtitle(role, text) {
    if (!stageEl) return;
    const clean = String(text || '').replace(/[*#"]/g, '').trim();
    if (/^(제목|Title)\s*:/.test(clean)) { showCard('title'); return; }
    showCard(null);
    const box = $('.rec-sub-text');
    if (!box) return;
    const icon = role === 'narrator' ? '' :
      (role === 'villain' || role === 'monster') ? '👹 ' :
      role === 'elder' ? '🧙 ' : role === 'friend' ? '🐾 ' : '🧒 ';
    box.textContent = icon + clean;
    box.parentElement.classList.toggle('is-dialogue', role !== 'narrator');
  }

  // ---------- 기존 낭독 함수에 무대 연결 ----------
  function hookReading() {
    if (window.__recHooked) return;
    window.__recHooked = true;
    const origShowPage = window.showPage;
    window.showPage = function (index) {
      const r = origShowPage.apply(this, arguments);
      if (stageEl) updateStagePage(currentPageIndex);
      return r;
    };
    // 🎙️ AI 성우 목소리 재생 중 자막
    window.onStoryLine = function (role, text) { if (stageEl) updateSubtitle(role, text); };
    const origSpeak = window.speakDynamicLine;
    window.speakDynamicLine = function (role, emotion, text) {
      if (stageEl) updateSubtitle(role, text);
      return origSpeak.apply(this, arguments);
    };
  }

  // ---------- 시작 ----------
  async function openRecorder() {
    if (!currentStoryBookObject || !currentStoryBookObject.pages?.length) {
      alert('먼저 동화를 만들거나 내 서재에서 동화를 열어주세요.');
      return;
    }
    hookReading();
    if (typeof stopVoice === 'function') stopVoice();

    if (!canRecordToFile()) {
      // 휴대폰/태블릿: 큰 화면 모드만
      stageMode = 'view';
      buildStage();
      stageEl.classList.add('mode-view');
      $('.rec-ready-desc').innerHTML = '휴대폰에서는 <b>휴대폰의 화면 녹화 기능</b>을 먼저 켠 뒤<br>아래 버튼을 눌러주세요. 동화가 크게 재생돼요.';
      addMissingVoiceWarning();
      return;
    }

    const ok = confirm(
      '🎬 동화를 영상 파일로 녹화할게요.\n\n' +
      '곧 뜨는 "공유할 화면 선택" 창에서\n' +
      '① [전체 화면] 탭을 고르고\n' +
      '② 아래쪽 [시스템 오디오도 공유]를 꼭 켠 뒤\n' +
      '③ [공유]를 눌러주세요.\n\n' +
      (currentStoryBookObject.pages.some(p => p.aiVoice?.blob)
        ? '※ 🎙️ AI 성우 목소리 동화는 [Chrome 탭 → 이 탭 + 탭 오디오 공유]로도 목소리가 깔끔하게 녹음돼요.'
        : '※ 낭독 목소리는 컴퓨터 소리로 나오기 때문에\n   [전체 화면 + 시스템 오디오]로 해야 목소리까지 녹음돼요.')
    );
    if (!ok) return;

    try {
      captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: {
          systemAudio: 'include',
          suppressLocalAudioPlayback: false,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        selfBrowserSurface: 'include',
        monitorTypeSurfaces: 'include'
      });
    } catch (e) {
      console.log('display capture cancelled:', e);
      return;
    }

    if (!captureStream.getAudioTracks().length) {
      const goOn = confirm('⚠️ 소리가 공유되지 않았어요.\n이대로 하면 목소리·배경음악 없이 화면만 녹화돼요.\n\n그래도 계속할까요?\n(취소를 누르고 다시 하면서 "시스템 오디오 공유"를 켜주세요.)');
      if (!goOn) { stopCaptureTracks(); return; }
    }

    captureStream.getVideoTracks()[0].addEventListener('ended', () => finishRecording(false));

    stageMode = 'record';
    buildStage();
    stageEl.classList.add('mode-record');
    $('.rec-ready-desc').innerHTML = '시작하면 전체화면으로 바뀌고 녹화가 시작돼요.<br>동화가 끝나면 자동으로 녹화가 멈춰요.<br><small>중간에 끝내려면 <b>Esc</b> 키를 누르세요.</small>';
    addMissingVoiceWarning();
  }

  async function beginPlayback() {
    if (!stageEl) return;
    $('.rec-ready').style.display = 'none';

    try {
      if (stageEl.requestFullscreen) await stageEl.requestFullscreen();
    } catch (e) { console.log('fullscreen notice:', e); }

    // 전체화면 전환 모습·크롬 안내 문구("Esc를 눌러…")·준비 창이 영상 첫 화면에 찍히지 않도록
    // 제목 카드를 띄운 채 화면이 가라앉을 때까지 기다렸다가 녹화를 시작한다.
    showCard('title');
    const withIntro = wantIntro();
    // 인트로를 넣을 때는 준비하는 동안 제목 카드 대신 인트로 첫 장면이 보이게 덮어 둔다
    const introEl = withIntro ? prepareIntroEl() : null;
    if (stageMode === 'record' && captureStream) {
      await new Promise(r => setTimeout(r, 2600));
      if (!stageEl) return;
      recordedChunks = [];
      recordedMime = pickMimeType();
      try {
        mediaRecorder = new MediaRecorder(captureStream, recordedMime ? { mimeType: recordedMime, videoBitsPerSecond: 5000000 } /* 어른이: 8→5Mbps — 낭독이 느려 영상이 길어지므로 메모리를 줄임(크롬 STATUS_BREAKPOINT 대비) */ : undefined);
      } catch (e) {
        mediaRecorder = new MediaRecorder(captureStream);
        recordedMime = mediaRecorder.mimeType || 'video/webm';
      }
      mediaRecorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) recordedChunks.push(ev.data); };
      mediaRecorder.onstop = saveRecording;
      mediaRecorder.start(1000);
    }

    // 녹화가 시작된 뒤 (인트로 →) 제목 카드부터 낭독 시작
    setTimeout(async () => {
      if (!stageEl) return;
      if (withIntro) {
        await playIntro(introEl);
        if (!stageEl) return;
      }
      showCard('title');
      startContinuousReading(onStoryDone, 0);
    }, stageMode === 'record' ? (withIntro ? 60 : 300) : (withIntro ? 500 : 900));
  }

  function onStoryDone() {
    if (!stageEl) return;
    showCard('end');
    setTimeout(() => {
      if (typeof stopBgm === 'function') stopBgm();
      isPlaying = false;
      setTimeout(() => finishRecording(false), 1200);
    }, 3000);
  }

  // Esc로 전체화면이 풀리면 녹화도 끝냄
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && stageEl && stageMode && $('.rec-ready')?.style.display === 'none') {
      finishRecording(false);
    }
  });

  function stopCaptureTracks() {
    if (captureStream) captureStream.getTracks().forEach(t => t.stop());
    captureStream = null;
  }

  function finishRecording(cancelled) {
    if (isFinishing) return;
    isFinishing = true;
    try { if (typeof stopVoice === 'function') stopVoice(); } catch (e) {}
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

    const wasRecording = mediaRecorder && mediaRecorder.state !== 'inactive';
    if (wasRecording) {
      if (cancelled) mediaRecorder.onstop = null;
      mediaRecorder.stop();
    }
    stopCaptureTracks();
    if (stageEl) { stageEl.remove(); stageEl = null; }
    stageMode = null;
    mediaRecorder = wasRecording ? mediaRecorder : null;
    setTimeout(() => { isFinishing = false; }, 300);
  }

  function saveRecording() {
    const type = (recordedMime || 'video/webm').split(';')[0];
    const blob = new Blob(recordedChunks, { type });
    recordedChunks = [];
    mediaRecorder = null;
    if (!blob.size) { alert('녹화된 내용이 없어요. 다시 시도해 주세요.'); return; }

    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const rawTitle = (typeof getActiveStoryTitle === 'function' ? getActiveStoryTitle(currentStoryBookObject) : '') || '동화';
    const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40) || '동화';
    const fileName = `${safeTitle}_어른이동화마을.${ext}`;
    const url = URL.createObjectURL(blob);

    const modal = document.createElement('div');
    modal.className = 'rec-result';
    modal.innerHTML = `
      <div class="rec-result-box">
        <h3>🎉 녹화가 끝났어요!</h3>
        <video src="${url}" controls playsinline></video>
        <p class="rec-result-info">${esc(fileName)} · ${(blob.size / 1048576).toFixed(1)}MB
          ${ext === 'webm' ? '<br><small>webm 파일은 유튜브에는 바로 올릴 수 있어요. 카톡 전송이 안 되면 mp4로 변환해 주세요.</small>' : ''}</p>
        <div class="rec-result-actions">
          <a class="rec-download" href="${url}" download="${esc(fileName)}">⬇️ 영상 저장하기</a>
          <button type="button" class="rec-result-close">닫기</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.rec-result-close').onclick = () => {
      modal.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }

  window.openStoryRecorder = openRecorder;
})();
