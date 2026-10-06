function pickGenre(value){
  const sel=document.getElementById('storyGenre');
  if(sel){ sel.value=value; handleGenreChange(value); }
}

// ⭐ 이야기 주제 — 장르와 따로 고릅니다(주제: 무엇에 관한 이야기 / 장르: 어떤 분위기의 이야기)
let selectedStoryTheme = '';
function pickStoryTheme(btn){
  const key = btn?.dataset?.theme || '';
  selectedStoryTheme = selectedStoryTheme === key ? '' : key;
  document.querySelectorAll('.theme-chip[data-theme]').forEach(b => b.classList.toggle('active', b.dataset.theme === selectedStoryTheme));
}

let currentStoryBookObject = null;

// 💾 저장하지 않은 동화가 있는지 (자동 저장 실패·저장 전 이동 대비)
let storyUnsaved = false;
window.addEventListener('beforeunload', (e) => {
  if (!storyUnsaved) return;
  e.preventDefault();
  e.returnValue = '저장하지 않은 동화가 있어요!';
  return e.returnValue;
});
  let db = null;
  let isPlaying = false;
  let isRepeatMode = false;
  let isLibraryPlayingMode = false;
  let myLibraryBooks = [];
  let currentLibraryIndex = 0;
  let currentPageIndex = 0;

  // 👨‍👩‍👧 등장인물 사진 목록 (최대 4명) — { id, name, base64, mime, previewUrl }
  const MAX_CAST = 4;
  let castMembers = [];
  let castIdSeq = 0;
  let pendingCastPhotoId = null;

  // 🎵 --- BGM 오디오 엔진 ---
  let bgmAudio = new Audio();
  bgmAudio.loop = true;
  bgmAudio.preload = 'auto';
  bgmAudio.playsInline = true;
  let isBgmEnabled = true;
  let targetBgmVolume = 0.42;

  const BGM_TRACKS = {
    // 🎵 선생님이 국어 시낭송용으로 만든 곡(2026-10-06 가져옴). 파일은 assets/bgm/<이름>.mp3
    'waltz-of-comfort':    { name: '위로의 왈츠 (피아노 & 바이올린)', url: './assets/bgm/waltz-of-comfort.mp3', mood: 'warm' },
    'clarinet-twilight':   { name: '클라리넷과 피아노의 포근한 황혼', url: './assets/bgm/clarinet-twilight.mp3', mood: 'warm' },
    'cello-piano-dialogue':{ name: '첼로와 피아노의 깊은 대화', url: './assets/bgm/cello-piano-dialogue.mp3', mood: 'calm' },
    'sunset-strings':      { name: '노을빛 회상과 현악 앙상블', url: './assets/bgm/sunset-strings.mp3', mood: 'warm' },
    'music-box-memory':    { name: '기억 속의 아련한 오르골', url: './assets/bgm/music-box-memory.mp3', mood: 'calm' },
    'lofi-reflection':     { name: '따뜻한 로파이 질감의 사색', url: './assets/bgm/lofi-reflection.mp3', mood: 'bright' },
    'spring-piano':        { name: '잔잔한 피아노와 봄날의 햇살', url: './assets/bgm/spring-piano.mp3', mood: 'bright' },
    'morning-dew-harp':    { name: '아침 이슬과 맑은 하프 선율', url: './assets/bgm/morning-dew-harp.mp3', mood: 'bright' },
    'seaside-breeze':      { name: '바닷가 언덕과 산들바람', url: './assets/bgm/seaside-breeze.mp3', mood: 'bright' },
    'starry-night-dream':  { name: '별이 빛나는 밤의 몽환적인 멜로디', url: './assets/bgm/starry-night-dream.mp3', mood: 'calm' },
    'moonlight-daegeum':   { name: '달빛 아래 대금과 피아노', url: './assets/bgm/moonlight-daegeum.mp3', mood: 'calm' },
    'vast-land-epic':      { name: '대자연과 넓은 대지의 서사', url: './assets/bgm/vast-land-epic.mp3', mood: 'warm' },
    'quiet-forest-flute':  { name: '고요한 숲과 은은한 플루트', url: './assets/bgm/quiet-forest-flute.mp3', mood: 'calm' },
    'haegeum-guitar':      { name: '바람에 흔들리는 해금과 잔잔한 기타', url: './assets/bgm/haegeum-guitar.mp3', mood: 'calm' },
    'rainy-window-guitar': { name: '비 내리는 창가와 어쿠스틱 기타', url: './assets/bgm/rainy-window-guitar.mp3', mood: 'calm' },
    'felt-piano':          { name: '미니멀리즘 펠트 피아노', url: './assets/bgm/felt-piano.mp3', mood: 'calm' },
    'dawn-ambient':        { name: '새벽의 고독과 앰비언트 사운드', url: './assets/bgm/dawn-ambient.mp3', mood: 'dark' },
    'before-storm':        { name: '폭풍 전의 침묵과 다크 앰비언트', url: './assets/bgm/before-storm.mp3', mood: 'dark' },
    'cello-fate':          { name: '격정적인 운명과 첼로 독주', url: './assets/bgm/cello-fate.mp3', mood: 'dark' }
  };
  // 장르마다 어울리는 곡 묶음 — 동화마다 이 중 한 곡을 골라 동화에 기억(bgmKey)해 두고, 다시 들을 때도 같은 곡
  const BGM_POOLS = {
    comfort: ['waltz-of-comfort', 'clarinet-twilight', 'cello-piano-dialogue', 'sunset-strings', 'music-box-memory', 'rainy-window-guitar', 'dawn-ambient'],
    humor:   ['lofi-reflection', 'spring-piano', 'morning-dew-harp', 'seaside-breeze'],
    fantasy: ['starry-night-dream', 'moonlight-daegeum', 'quiet-forest-flute', 'haegeum-guitar', 'vast-land-epic'],
    daily:   ['rainy-window-guitar', 'lofi-reflection', 'spring-piano', 'seaside-breeze', 'morning-dew-harp', 'haegeum-guitar'],
    fable:   ['felt-piano', 'music-box-memory', 'quiet-forest-flute', 'cello-fate', 'before-storm']
  };
  function pickBgmKey(genreKey, seedText, moodKey) {
    let pool = (BGM_POOLS[genreKey] || BGM_POOLS.comfort).slice();
    // 나누고 싶은(밝은) 마음이면 어두운 곡은 빼요
    if (moodKey && typeof adultMoodIsBright === 'function' && adultMoodIsBright(moodKey)) {
      const lighter = pool.filter(k => BGM_TRACKS[k].mood !== 'dark');
      if (lighter.length) pool = lighter;
    }
    const seed = String(seedText || '') + Date.now();
    let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return pool[h % pool.length];
  }
  function bgmKeyForBook(book, genreKey) {
    if (book && BGM_TRACKS[book.bgmKey]) return book.bgmKey;
    // 예전 동화·명작: 제목으로 늘 같은 곡이 되게
    const pool = BGM_POOLS[genreKey] || BGM_POOLS.comfort;
    let h = 0; for (const ch of String(book?.title || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return pool[h % pool.length];
  }
  const bgmPlaylist = { custom: BGM_TRACKS['waltz-of-comfort'] }; // 예전 이름 호환

  function getCurrentBgmSelection() {
    // 🎵 제작자가 이 동화에 넣은 곡이 있으면 그 곡을 씁니다
    const custom = typeof window.getCustomBgmData === 'function' ? window.getCustomBgmData(currentStoryBookObject) : null;
    if (custom) return { key: 'custom', data: custom, volume: targetBgmVolume };

    const actingStyle = document.getElementById('actingStyle')?.value || 'bedtime_calm';
    const genreEl = document.getElementById('storyGenre');
    const genreKey =
      (currentStoryBookObject && currentStoryBookObject.genre) ||
      (genreEl ? genreEl.value : 'comfort');
    const key = currentStoryBookObject ? bgmKeyForBook(currentStoryBookObject, genreKey) : (BGM_POOLS[genreKey] || BGM_POOLS.comfort)[0];
    return {
      key,
      data: BGM_TRACKS[key] || BGM_TRACKS['waltz-of-comfort'],
      volume: actingStyle === 'bedtime_calm' ? Math.min(targetBgmVolume, 0.34) : targetBgmVolume // 🌙 차분한 밤 낭독은 음악을 조금 작게
    };
  }

  function handleActingStyleChange() {
    const selection = getCurrentBgmSelection();
    const textEl = document.getElementById('bgmTitleText');
    if (textEl) textEl.innerText = `배경음악: ${selection.data.name}`;

    const wasPlaying = bgmAudio && !bgmAudio.paused;
    if (bgmAudio.getAttribute('src') !== selection.data.url) {
      bgmAudio.src = selection.data.url;
      try { bgmAudio.load(); } catch (e) {}
    }
    bgmAudio.volume = selection.volume;

    if (wasPlaying && isBgmEnabled) {
      try {
        const p = bgmAudio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {}
    }
  }

  function handleGenreChange(genreKey) {
    updateBgmGenrePreview(genreKey);
  }

  function updateBgmGenrePreview(genreKey) {
    const selection = getCurrentBgmSelection();
    const bgmData = selection.data;
    const textEl = document.getElementById('bgmTitleText');
    if (textEl) textEl.innerText = `배경음악: ${bgmData.name}`;
    bgmAudio.src = bgmData.url;
    bgmAudio.volume = selection.volume;
  }

  function playBgmForCurrentStory() {
    if (!isBgmEnabled || !bgmAudio) return Promise.resolve(false);

    const selection = getCurrentBgmSelection();
    const bgmData = selection.data;
    const textEl = document.getElementById('bgmTitleText');
    if (textEl) textEl.innerText = `배경음악: ${bgmData.name}`;

    // src 속성 기준으로 비교해 불필요한 재로딩을 줄입니다.
    if (bgmAudio.getAttribute('src') !== bgmData.url) {
      bgmAudio.src = bgmData.url;
      try { bgmAudio.load(); } catch (e) {}
    }

    bgmAudio.muted = false;
    bgmAudio.volume = selection.volume;

    try {
      const p = bgmAudio.play();
      if (p && typeof p.then === 'function') {
        return p.then(() => true).catch(e => {
          console.log("BGM 재생 대기:", e);
          return false;
        });
      }
      return Promise.resolve(true);
    } catch (e) {
      console.log("BGM 재생 오류:", e);
      return Promise.resolve(false);
    }
  }

  function stopBgm() {
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
  }

  function toggleBgmSound() {
    isBgmEnabled = !isBgmEnabled;
    const topBtn = document.getElementById('bgmSwitchTopBtn');
    const bottomBtn = document.getElementById('bgmControlBtn');
    const icon = document.getElementById('bgmIcon');

    if (isBgmEnabled) {
      if (topBtn) { topBtn.className = "bgm-switch-btn"; topBtn.innerText = "🎵 BGM: ON"; }
      if (bottomBtn) { bottomBtn.className = "bgm-btn"; bottomBtn.innerText = "🎵 배경음악: ON"; }
      if (icon) icon.innerText = "🎵";
      if (isPlaying) playBgmForCurrentStory();
    } else {
      if (topBtn) { topBtn.className = "bgm-switch-btn off"; topBtn.innerText = "🔇 BGM: OFF"; }
      if (bottomBtn) { bottomBtn.className = "bgm-btn off"; bottomBtn.innerText = "🔇 배경음악: OFF"; }
      if (icon) icon.innerText = "🔇";
      bgmAudio.pause();
    }
  }

  function changeBgmVolume(val) {
    targetBgmVolume = parseFloat(val);
    bgmAudio.volume = targetBgmVolume;
  }

  // 💡 [모바일 음성 합성 엔진 안정화]
  // iOS Safari / Android Chrome에서 Web Speech API가 늦게 준비되거나
  // cancel 직후 무음 상태가 되는 문제를 줄이기 위한 상태값입니다.
  let availableVoices = [];
  let currentUtterance = null;
  let speechSessionId = 0;
  let speechWatchdog = null;
  let isSpeechPaused = false;
  let lastStoppedPageIndex = 0;
  let wasStoppedByUser = false;

  function initVoices() {
    if (typeof window.speechSynthesis === 'undefined') return;
    const voices = window.speechSynthesis.getVoices() || [];
    if (voices.length) availableVoices = voices;
    updateVoiceStatus();
  }

  if (typeof window.speechSynthesis !== 'undefined') {
    initVoices();
    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = initVoices;
    }
    // 일부 모바일 브라우저는 첫 getVoices()가 빈 배열을 반환합니다.
    setTimeout(initVoices, 250);
    setTimeout(initVoices, 1000);
  }

  function clearSpeechWatchdog() {
    if (speechWatchdog) {
      clearInterval(speechWatchdog);
      speechWatchdog = null;
    }
  }

  function safeCancelSpeech() {
    if (typeof window.speechSynthesis === 'undefined') return;
    clearSpeechWatchdog();
    try {
      // pause 상태에서 cancel만 하면 iOS가 다음 speak를 무시하는 경우가 있어
      // 먼저 resume 한 뒤 cancel 합니다.
      window.speechSynthesis.resume();
      window.speechSynthesis.cancel();
    } catch (e) {
      console.log('speech cancel notice:', e);
    }
    currentUtterance = null;
    isSpeechPaused = false;
  }

  // BGM만 사용자 터치로 미리 활성화합니다.
  // 음성합성에 빈 문장을 speak()하지 않습니다. (iOS 무음 원인 가능)
  function unlockMobileAudio() {
    if (!bgmAudio) return;
    const oldVolume = bgmAudio.volume;
    bgmAudio.volume = 0;
    const p = bgmAudio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        bgmAudio.pause();
        bgmAudio.currentTime = 0;
        bgmAudio.volume = oldVolume || targetBgmVolume;
      }).catch(() => {
        bgmAudio.volume = oldVolume || targetBgmVolume;
      });
    }
  }

  // 💡 [동화 제작 함수]
  async function generateStoryAndImages() {
    if (!requireGuardian()) return;
    try {
      const apiKeyEl = document.getElementById('apiKey');
      const authorEl = document.getElementById('authorName');
      const genreEl = document.getElementById('storyGenre');
      const charEl = document.getElementById('character');
      const lengthEl = document.getElementById('storyLength');
      const btn = document.getElementById('generateBtn');
      const statusLog = document.getElementById('status-log');
      const bookContainer = document.getElementById('book-container');
      const pagesWrapper = document.getElementById('story-pages-wrapper');
      const controlPanel = document.getElementById('controlPanel');

      const apiKey = (apiKeyEl ? apiKeyEl.value : '').trim();
      const author = (authorEl ? authorEl.value : '').trim();
      
      if (!isGuardianConfirmed()) {
        showGuardianGate();
        return;
      }

      // 🕯️ 위기 신호 안전장치 — 하루 이야기에 위기 신호가 보이면 동화를 만들지 않고 안내 화면 (공통규칙 10-5)
      if (hasCrisisSignal(getAdultSelection().dayNote) || hasCrisisSignal((charEl ? charEl.value : ''))) {
        showCareGate();
        return;
      }

      if (!author) {
        alert('✍️ 마음 서재에 저장할 [서재 이름]을 적어 주세요!');
        if (authorEl) authorEl.focus();
        return;
      }

      // 🔑 내 키가 있으면 내 키로, 없으면 무료체험(서버 중계)으로
      let aiRoute;
      if (apiKey && apiKey.length >= 5) {
        aiRoute = { mode: 'key', apiKey };
      } else {
        const trial = await checkTrialReady();
        if (!trial.ok) {
          alert(trial.message);
          if (apiKeyEl) apiKeyEl.focus();
          return;
        }
        aiRoute = { mode: 'trial' };
      }

      const genreKey = genreEl ? genreEl.value : "comfort";
      const char = (charEl ? charEl.value : '').trim();
      const lengthVal = aiRoute.mode === 'trial' ? "3" : (lengthEl ? lengthEl.value : "3");
      const learning = getLearningSelection();
      const adultSel = getAdultSelection(); // 하루 이야기(dayNote)는 지시문에만 쓰고 저장하지 않음

      saveUserSession();
      updateBgmGenrePreview(genreKey);

      const config = lengthConfig[lengthVal] || { pages: 6 };

      if (btn) btn.disabled = true;
      if (controlPanel) controlPanel.style.display = 'none';
      if (bookContainer) bookContainer.style.display = 'none';
      if (statusLog) statusLog.innerText = `✨ [${lengthVal}분 · ${config.pages}페이지] ${author} 님의 오늘의 동화를 만드는 중이에요...${aiRoute.mode === 'trial' ? ' (🎁 무료체험)' : ''}`;
      if (pagesWrapper) pagesWrapper.innerHTML = '';
      stopVoice();

      const promptText = buildAdultStoryPrompt({ genreKey, author, char, pages: config.pages, minutes: lengthVal });

      const geminiData = await callStoryText(aiRoute, promptText);
      if (geminiData.error) throw new Error(geminiData.error.message);

      const storyData = JSON.parse(geminiData.candidates[0].content.parts[0].text);
      if (storyData && storyData.crisis) { showCareGate(); if (statusLog) statusLog.innerText = ''; return; }
      
      
      // ✅ 선택 시간에 맞춰 페이지 수 고정
      if (!Array.isArray(storyData.pages)) storyData.pages = [];
      storyData.pages = storyData.pages.slice(0, config.pages);

      if (storyData.pages.length < config.pages) {
        throw new Error(`AI가 ${storyData.pages.length}페이지만 생성했습니다. 다시 만들기를 눌러주세요. (필요: ${config.pages}페이지)`);
      }

currentStoryBookObject = {
        userId: getUniqueUserIdentifier(),
        author: author,
        genre: genreKey,
        storyPurpose: learning.purpose,
        learningMode: learning.mode,
        learningTopic: learning.topic,
        title: storyData.title,
        villagePlace: normalizeVillagePlace(storyData.village_place, genreKey),
        storyTheme: selectedStoryTheme || '',
        mood: { mood: adultSel.mood, place: adultSel.place, hero: adultSel.hero }, // 고른 마음만 저장(하루 이야기는 저장 안 함)
        closingQuestion: String(storyData.closing_question || '').slice(0, 120),
        bgmKey: pickBgmKey(genreKey, storyData.title, adultSel.mood), // 🎵 이 동화의 배경음악(다시 들을 때도 같은 곡)
        reflection: '',
        characterSheet: normalizeCharacterSheet(storyData.character_sheet),
        createdAt: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        pages: []
      };

      currentStoryLanguage = 'ko';
      showKoreanAlongsideEnglish = false;
      updateLanguageButtons();

      const titleEl = document.getElementById('story-main-title');
      if (titleEl) titleEl.innerText = `📖 ${storyData.title}`;
      if (bookContainer) bookContainer.style.display = 'block';

      const characterSheet = normalizeCharacterSheet(storyData.character_sheet);
      lastImageError = '';
      let firstPageRef = null, lastPageRef = null;
      for (let i = 0; i < storyData.pages.length; i++) {
        const page = storyData.pages[i];
        if (statusLog) statusLog.innerText = `🎨 ${i + 2}/${storyData.pages.length + 1}. ${page.page_num}페이지 삽화를 그리는 중... (${i + 1}/${storyData.pages.length})`;

        let imgBase64 = "";
        try {
          imgBase64 = await generateGeminiImage(aiRoute, page.image_prompt, getActiveCast(), {
            sheet: characterSheet,
            refs: [firstPageRef, lastPageRef].filter((r, k, arr) => r && arr.indexOf(r) === k)
          });
          // 🎨 다음 페이지가 같은 모습으로 그려지도록 앞 페이지 그림을 작게 줄여 기준으로 넘깁니다
          if (imgBase64) {
            const small = await shrinkImageForRef(imgBase64);
            if (small) { if (!firstPageRef) firstPageRef = small; lastPageRef = small; }
          }
        } catch (imgErr) {
          console.error(`Page ${i+1} Image Error:`, imgErr);
          lastImageError = imgErr?.message || String(imgErr);
        }

        currentStoryBookObject.pages.push({
          page_num: page.page_num,
          full_text: page.full_text || page.text,
          dialogue_list: page.dialogue_list || [{ role: 'narrator', emotion: 'calm', text: page.full_text || page.text }],
          image_prompt: page.image_prompt || '', // 🎨 나중에 이 페이지 그림만 다시 그릴 때 씀
          imageBase64: imgBase64
        });
      }

      // 💾 그림까지 완성되면 바로 자동 저장 (저장 버튼을 깜빡해도 사라지지 않게)
      storyUnsaved = true;
      if (statusLog) statusLog.innerText = '💾 동화를 마음 서재에 자동으로 저장하는 중...';
      await saveCurrentStoryToDB({ silent: true });

      // 🎙️ AI 성우 목소리 (무료체험은 항상 포함)
      if (aiRoute.mode === 'trial' || aiVoiceEnabledByUser()) {
        const vr = await generateVoiceForStory(aiRoute, currentStoryBookObject, (i, n) => {
          if (statusLog) statusLog.innerText = `🎙️ AI 성우가 ${i + 1}/${n}페이지를 녹음하는 중...`;
        });
        if (vr.failed && statusLog) console.log(`voice failed pages: ${vr.failed}`);
        if (vr.done) {
          storyUnsaved = true;
          await saveCurrentStoryToDB({ silent: true, localOnly: true }); // 목소리는 이 기기에만 저장
        }
      }

      renderBookPages(currentStoryBookObject);
      showPage(0);

      if (statusLog) {
        const vp = currentStoryBookObject.villagePlace;
        statusLog.innerText = `🌙 [${author}] 님의 오늘의 동화가 완성됐어요. 아래에서 들어 보세요.`
          + (storyUnsaved
            ? '\n⚠️ 자동 저장에 실패했어요. 아래 [💾 마음 서재에 저장]을 꼭 눌러 주세요!'
            : `\n💾 마음 서재에 자동으로 저장했어요.${vp && villageVisible() ? (window.EAIMCloud?.getUser?.()
                ? ` ${vp.emoji} '${vp.name}'이(가) 뮤니마을 재료가 됐어요!`
                : ` Google 로그인하면 ${vp.emoji} '${vp.name}'이(가) 뮤니마을 재료가 돼요!`) : ''}`);
      }
      const missingImgs = currentStoryBookObject.pages.filter(pg => !pg.imageBase64).length;
      if (missingImgs && statusLog) {
        statusLog.innerText += `\n🎨 그림 ${missingImgs}장을 그리지 못했어요. 까닭: ${friendlyAiError(lastImageError) || '알 수 없음'}\n아래 [🎨 빠진 그림 다시 그리기]를 눌러 주세요. 글과 목소리는 그대로예요.`;
      }
      if (aiRoute.mode === 'trial') refreshTrialStatus();
      if (controlPanel) controlPanel.style.display = 'flex';

      setTimeout(() => {
        const bookView = document.getElementById('book-container');
        if (bookView) {
          bookView.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);

    } catch (err) {
      const statusLog = document.getElementById('status-log');
      const nice = friendlyAiError(err.message);
      if (statusLog) statusLog.innerText = `⚠️ ${nice}`;
      alert(`⚠️ ${nice}`);
    } finally {
      const btn = document.getElementById('generateBtn');
      if (btn) btn.disabled = false;
    }
  }

  // 🏡 --- 뮤니마을 재료 ---
  const VILLAGE_TYPES = ['forest','sea','sky','space','castle','town','school','farm','mountain','cave','shop','home','other'];
  const VILLAGE_GOAL = 10;
  // 🚧 뮤니마을 화면이 완성될 때까지 마을 안내는 제작자에게만 보여요 (true 로 바꾸면 모두에게 공개)
  const VILLAGE_PUBLIC = false;
  function villageVisible() { return false; } // 어른이 동화마을에는 마을 게임이 없어요(별 정원은 3단계 예정)

  function normalizeVillagePlace(raw, genreKey) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const fb = (window.villageFallbackPlace ? window.villageFallbackPlace(genreKey) : { name: '이야기 언덕', emoji: '📖', type: 'town' });
    return {
      name: String(p.name || fb.name).slice(0, 20),
      emoji: String(p.emoji || fb.emoji).slice(0, 8),
      type: VILLAGE_TYPES.includes(p.type) ? p.type : fb.type,
      description: String(p.description || '').slice(0, 80)
    };
  }

  async function refreshVillageProgress() {
    const box = document.getElementById('villageProgress');
    if (!box) return;
    const user = window.EAIMCloud?.getUser?.();
    if (!user) {
      box.innerHTML = `<p class="side-note">Google 로그인 후 서재에 저장한 동화가 <b>계정에 쌓여요.</b> ${VILLAGE_GOAL}편을 모으면 뮤니마을이 열려요!</p>`;
      return;
    }
    try {
      const prog = await window.EAIMCloud.getVillageProgress();
      lastVillageProgress = prog;
      const n = prog.storyCount || 0;
      const pct = Math.min(100, Math.round(n / VILLAGE_GOAL * 100));
      const places = (prog.places || []).slice(-6).map(pl => `<span class="village-chip" title="${escapeCastText(pl.title || '')}">${escapeCastText(pl.emoji)} ${escapeCastText(pl.name)}</span>`).join('');
      box.innerHTML = `
        <div class="village-count"><b>${n}</b> / ${VILLAGE_GOAL}편</div>
        <div class="village-bar"><span style="width:${pct}%"></span></div>
        <p class="side-note">${n >= VILLAGE_GOAL ? '🎉 뮤니마을이 열렸어요! 마을은 곧 문을 열어요.' : `${VILLAGE_GOAL - n}편만 더 만들면 뮤니마을이 열려요!`}</p>
        ${places ? `<div class="village-chips">${places}</div>` : ''}`;
      return prog;
    } catch (e) {
      box.innerHTML = '<p class="side-note">마을 진행 상황을 불러오지 못했어요.</p>';
      return null;
    }
  }

  let lastVillageProgress = null;
  let muniToastTimer = null;

  // 뮤니가 화면 아래에서 살짝 알려주는 말풍선
  function showMuniToast(html, ms = 5200) {
    let t = document.getElementById('muniToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'muniToast';
      t.className = 'muni-toast';
      document.body.appendChild(t);
    }
    t.innerHTML = `<img src="./assets/guide.png" alt=""><div>${html}</div>`;
    t.classList.add('show');
    clearTimeout(muniToastTimer);
    muniToastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function announceVillageProgress(prog, place) {
    if (!villageVisible()) return;
    const n = prog.storyCount || 0;
    const placeText = place ? ` ${escapeCastText(place.emoji)} <b>${escapeCastText(place.name)}</b>` : '';
    if (n === VILLAGE_GOAL) { showVillageOpenCelebration(prog); return; }
    if (n > VILLAGE_GOAL) { showMuniToast(`🏡 뮤니마을에 새 장소가 생겼어요!${placeText}`); return; }
    if (n === VILLAGE_GOAL - 1) { showMuniToast(`🎉 한 편만 더 만들면 뮤니마을이 열려요! (${n}/${VILLAGE_GOAL})${placeText}`, 7000); return; }
    showMuniToast(`🏡 뮤니마을 재료가 하나 늘었어요! (${n}/${VILLAGE_GOAL})${placeText}`);
  }

  function showVillageOpenCelebration(prog) {
    const places = (prog.places || []).map(pl => `<span class="village-chip">${escapeCastText(pl.emoji)} ${escapeCastText(pl.name)}</span>`).join('');
    const wrap = document.createElement('div');
    wrap.className = 'village-celebrate';
    wrap.innerHTML = `
      <div class="village-celebrate-box">
        <div class="village-confetti">🎉🎵🏡🎵🎉</div>
        <img src="./assets/guide.png" alt="안내자">
        <h2>뮤니마을이 열렸어요!</h2>
        <p>동화 ${VILLAGE_GOAL}편이 모여 마을이 생겼어요.<br>그동안 만든 동화 속 장소들이 마을이 되었어요.</p>
        <div class="village-chips">${places}</div>
        <p class="village-soon">🚧 마을 입장은 곧 열려요. 동화를 더 만들면 마을이 더 커져요!</p>
        <button type="button">좋아요!</button>
      </div>`;
    wrap.querySelector('button').onclick = () => wrap.remove();
    document.body.appendChild(wrap);
  }
  window.addEventListener('eaim-auth-changed', () => refreshVillageProgress());

  // 🎨 마지막 그림 오류(빠진 그림 안내용)
  let lastImageError = '';

  // 🎨 빠진 그림 다시 그리기 — 누구나 쓸 수 있음. 그림이 없는 페이지만 새로 그리고 저장해요(글·목소리는 그대로).
  async function redrawMissingImages(btn) {
    const book = currentStoryBookObject;
    if (!book || !Array.isArray(book.pages) || book.isLibraryBook) return;
    const todo = book.pages.map((p, i) => i).filter(i => !book.pages[i].imageBase64);
    if (!todo.length) { alert('빠진 그림이 없어요.'); updateMissingImageButton(); return; }
    const apiKey = (document.getElementById('apiKey')?.value || '').trim();
    let aiRoute;
    if (apiKey && apiKey.length >= 5) aiRoute = { mode: 'key', apiKey };
    else {
      const trial = await checkTrialReady();
      if (!trial.ok) { alert(trial.message); return; }
      aiRoute = { mode: 'trial' };
    }
    const statusLog = document.getElementById('status-log');
    if (btn) btn.disabled = true;
    let ok = 0; lastImageError = '';
    const style = (genreGuides[book.genre] || genreGuides.custom).artStyle;
    for (const i of todo) {
      if (statusLog) statusLog.innerText = `🎨 ${i + 1}페이지 그림을 다시 그리는 중... (${todo.indexOf(i) + 1}/${todo.length})`;
      const page = book.pages[i];
      const plain = String(page.full_text || (page.dialogue_list || []).map(d => d.text).join(' ')).replace(/[\n\r]+/g, ' ');
      const prompt = page.image_prompt || `Illustrate the single most important moment of this page of the story "${book.title}". The page text is in Korean and is given only so you understand the scene — never write it in the picture: ${plain} Art style: ${style}`;
      const refs = [];
      for (const k of [0, i - 1, i + 1]) {
        if (k < 0 || !book.pages[k] || !book.pages[k].imageBase64 || refs.some(r => r._k === k)) continue;
        const r = await shrinkImageForRef(book.pages[k].imageBase64);
        if (r) { r._k = k; refs.push(r); }
      }
      try {
        const img = await generateGeminiImage(aiRoute, prompt, [], { sheet: book.characterSheet || [], refs });
        if (img) { page.imageBase64 = img; ok++; }
      } catch (e) { console.error('redraw missing', i, e); lastImageError = e?.message || String(e); }
    }
    renderBookPages(book); showPage(todo[0] || 0);
    if (ok) { storyUnsaved = true; await saveCurrentStoryToDB({ silent: true }); }
    const left = book.pages.filter(pg => !pg.imageBase64).length;
    if (statusLog) statusLog.innerText = left
      ? `🎨 ${ok}장을 그렸고 ${left}장은 아직이에요. 까닭: ${friendlyAiError(lastImageError) || '알 수 없음'}`
      : `✅ 빠진 그림 ${ok}장을 모두 그려서 마음 서재에 저장했어요.`;
    if (btn) btn.disabled = false;
  }
  window.redrawMissingImages = redrawMissingImages;

  function updateMissingImageButton() {
    const btn = document.getElementById('redrawMissingBtn');
    if (!btn) return;
    const book = currentStoryBookObject;
    const n = book && !book.isLibraryBook && Array.isArray(book.pages) ? book.pages.filter(pg => !pg.imageBase64).length : 0;
    btn.style.display = n ? '' : 'none';
    btn.textContent = `🎨 빠진 그림 다시 그리기 (${n}장)`;
  }

  // 🤖 --- AI 호출 창구 (내 키 / 무료체험) ---
  // 모델 이름은 공통규칙 6-2 기준. 무료체험은 서버(api/fairytale-trial.js)가 같은 모델을 씁니다.
  const AI_MODELS = { text: 'gemini-flash-latest', image: 'gemini-3.1-flash-image' };
  let trialConfigCache = null;

  // 🔁 구글 AI가 붐빌 때(503·500) 기다렸다가 다시 시도 — 3초 → 8초 → 15초 (총 4번)
  //    429(한도 초과)는 다시 시도해도 소용없어서(예: 무료 등급 그림 한도 0, 몇 시간 뒤 풀림) 바로 알려 줘요.
  //    기다리는 동안 상태 줄에 남은 시간을 보여 줘요.
  const AI_RETRY_WAITS = [3, 8, 15];
  async function fetchWithRetry(url, options) {
    let res;
    for (let attempt = 0; attempt <= AI_RETRY_WAITS.length; attempt++) {
      res = await fetch(url, options);
      if (!(res.status === 503 || res.status === 500) || attempt === AI_RETRY_WAITS.length) return res;
      const wait = AI_RETRY_WAITS[attempt];
      const log = document.getElementById('status-log');
      const keep = log ? log.innerText : '';
      for (let s = wait; s > 0; s--) {
        if (log) log.innerText = `⏳ 지금 구글 AI가 붐벼요. ${s}초 뒤에 다시 시도할게요... (${attempt + 1}/${AI_RETRY_WAITS.length})`;
        await new Promise(r => setTimeout(r, 1000));
      }
      if (log) log.innerText = keep;
    }
    return res;
  }

  // 영어 오류 문구를 쉬운 말로
  function friendlyAiError(msg) {
    const m = String(msg || '');
    if (/high demand|overloaded|UNAVAILABLE|503|try again later/i.test(m)) return '지금 구글 AI를 쓰는 사람이 많아 붐벼요. 1~2분 뒤에 다시 눌러 주세요. (만들던 내용은 그대로 남아 있어요)';
    if (/free_tier/i.test(m) && /limit:\s*0/i.test(m)) return '이 API 키는 무료 등급이라 그림 모델을 쓸 수 없어요(무료 한도 0장). Google AI Studio에서 이 키의 프로젝트에 결제를 연결하면 바로 그려져요. 글과 목소리는 무료 키로도 돼요.';
    if (/quota|RESOURCE_EXHAUSTED|429|rate/i.test(m)) return 'API 키의 사용 한도에 닿았어요. 잠시 뒤에 다시 하거나, Google AI Studio에서 한도·결제 설정을 확인해 주세요.';
    if (/API key not valid|API_KEY_INVALID|permission|PERMISSION_DENIED/i.test(m)) return 'API 키가 맞지 않아요. 키를 다시 복사해 넣어 주세요.';
    if (/JSON|Unexpected token|Unterminated/i.test(m)) return 'AI 답이 중간에 끊겼어요. 한 번 더 눌러 주세요.';
    if (/IMAGE_SAFETY|SAFETY|PROHIBITED|blocked/i.test(m)) return `그림이 구글의 안전 기준에 걸려 그려지지 않았어요. 다시 그리기를 누르면 대부분 그려져요. (${m.slice(0, 80)})`;
    if (/billing|FAILED_PRECONDITION|free tier|not available in your|paid/i.test(m)) return `그림 모델은 결제(유료 등급)가 연결된 API 키에서만 될 수 있어요. Google AI Studio의 결제 설정을 확인해 주세요. (${m.slice(0, 80)})`;
    if (/not found|NOT_FOUND|404|is not supported/i.test(m)) return `그림 모델 이름이 바뀌었을 수 있어요. 이 문구를 Claude에게 보여 주세요: ${m.slice(0, 120)}`;
    return m;
  }
  window.friendlyAiError = friendlyAiError;

  async function callTrialServer(payload) {
    const idToken = await window.EAIMCloud?.getIdToken?.();
    if (!idToken) throw new Error('무료체험은 Google 로그인 후 사용할 수 있어요.');
    const res = await fetchWithRetry('api/fairytale-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, idToken })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && data.error && typeof data.error === 'string') {
      refreshTrialStatus();
      throw new Error(data.error);
    }
    return data;
  }

  async function callStoryText(aiRoute, promptText, extra = {}) {
    const temperature = typeof extra.temperature === 'number' ? extra.temperature : undefined;
    if (aiRoute.mode === 'trial') {
      return callTrialServer({ action: 'text', prompt: promptText, temperature });
    }
    const res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.text}:generateContent?key=${encodeURIComponent(aiRoute.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 }, ...(temperature !== undefined ? { temperature } : {}) }
      })
    });
    return res.json();
  }

  // aspectRatio: 동화 삽화는 '16:9'(가로) — 녹화·유튜브 화면에 꽉 차게. 마을 꾸미기 등은 지정하지 않음(모델 기본).
  async function callImageModel(aiRoute, parts, aspectRatio = null) {
    if (aiRoute.mode === 'trial') {
      return callTrialServer(aspectRatio ? { action: 'image', parts, aspectRatio } : { action: 'image', parts });
    }
    const genCfg = { responseModalities: ['TEXT', 'IMAGE'] };
    if (aspectRatio) genCfg.imageConfig = { aspectRatio };
    const res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.image}:generateContent?key=${encodeURIComponent(aiRoute.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: genCfg })
    });
    return res.json();
  }

  async function getTrialConfig() {
    if (trialConfigCache) return trialConfigCache;
    try {
      const res = await fetch('api/fairytale-trial', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'config' })
      });
      trialConfigCache = res.ok ? await res.json() : { enabled: false };
    } catch (e) {
      trialConfigCache = { enabled: false };
    }
    return trialConfigCache;
  }

  async function checkTrialReady() {
    const noKeyMsg = '🔑 Google AI Studio API Key를 입력해 주세요.';
    const cfg = await getTrialConfig();
    if (!cfg.enabled) return { ok: false, message: noKeyMsg };
    if (!window.EAIMCloud?.getUser?.()) {
      return { ok: false, message: `${noKeyMsg}\n\n🎁 키가 없다면: 위의 [Google로 로그인]을 하면 짧은 동화 1편을 무료로 만들어 볼 수 있어요.` };
    }
    const st = await window.EAIMCloud.getTrialStatus();
    if (st.state === 'available' || st.state === 'active' || st.state === 'unknown') return { ok: true };
    return { ok: false, message: '🎁 무료체험을 이미 사용했어요.\n내 API 키를 넣으면 계속 만들 수 있어요.' };
  }

  async function refreshTrialStatus() {
    const box = document.getElementById('trialStatus');
    if (!box) return;
    const cfg = await getTrialConfig();
    if (!cfg.enabled) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    const user = window.EAIMCloud?.getUser?.();
    if (!user) {
      box.className = 'trial-status';
      box.innerHTML = '🎁 <b>무료체험 1회</b> — API 키가 없어도 Google 로그인만 하면 짧은 동화(3분·4페이지) 1편을 만들어 볼 수 있어요.';
      return;
    }
    const st = await window.EAIMCloud.getTrialStatus();
    if (st.state === 'available') {
      box.className = 'trial-status ready';
      box.innerHTML = '🎁 <b>무료체험 사용 가능!</b> API 키 칸을 비워 두고 동화를 만들면 짧은 동화 1편이 무료로 만들어져요.';
    } else if (st.state === 'active') {
      box.className = 'trial-status ready';
      box.innerHTML = '🎁 <b>무료체험 진행 중</b> — 30분 안에 이어서 만들 수 있어요.';
    } else if (st.state === 'used') {
      box.className = 'trial-status used';
      box.innerHTML = '🎁 무료체험을 사용했어요. <b>내 API 키</b>를 넣으면 계속 만들 수 있어요.';
    } else {
      box.className = 'trial-status';
      box.innerHTML = '🎁 무료체험 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
    }
  }

  window.addEventListener('eaim-auth-changed', () => refreshTrialStatus());

  // 🎨 등장인물 모습 고정용 도우미
  function normalizeCharacterSheet(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(c => c && c.name && c.look).slice(0, 8)
      .map(c => ({ name: String(c.name).slice(0, 30), look: String(c.look).slice(0, 220) }));
  }

  // 앞 페이지 그림을 기준 그림으로 보낼 때 용량을 줄입니다(512px JPEG)
  function shrinkImageForRef(base64) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 512 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve({ mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.82).split(',')[1] });
      };
      img.onerror = () => resolve(null);
      img.src = `data:image/png;base64,${base64}`;
    });
  }

  // 🔤 그림 속 글씨 막기 — 요청 맨 끝에도 한 번 더(AI가 책 페이지처럼 보이려고 한글 비슷한 글씨를 그려 넣는 일이 있음)
  const NO_TEXT_TAIL = 'IMPORTANT: This is a wordless illustration. Absolutely no text of any kind anywhere in the image — no letters, no Korean Hangul or any other writing, no captions, titles, signs, labels, numbers or speech bubbles.';

  async function generateGeminiImage(aiRoute, prompt, cast = [], extra = {}) {
    const parts = [];
    const promptLower = String(prompt || '').toLowerCase();
    // 이 장면에 이름이 나온 인물의 설명만 보냅니다(나오지 않는 인물이 끼어들지 않게). allSheet면 모두
    const sheet = (Array.isArray(extra.sheet) ? extra.sheet : []).filter(c => extra.allSheet || promptLower.includes(String(c.name).toLowerCase()));
    prompt = `${prompt} ${NO_TEXT_TAIL}`;
    const refs = Array.isArray(extra.refs) ? extra.refs : [];

    // 앞 페이지 그림 = 같은 동화 속 인물·화풍 기준
    refs.forEach((r, idx) => {
      parts.push({ text: `Earlier page ${idx + 1} of this same storybook (reference for character designs and art style):` });
      parts.push({ inlineData: { mimeType: r.mime, data: r.data } });
    });

    const sheetText = sheet.length
      ? `Characters in this scene — draw them exactly like this and exactly like in the earlier pages: ${sheet.map(c => `${c.name}: ${c.look}`).join('; ')}. Never replace them with different animals or people.`
      : '';
    const rules = [
      refs.length ? 'Keep the same character designs, faces, colors, clothing and the same art style as the earlier pages of this storybook.' : '',
      sheetText,
      'Draw ONLY the characters named in the scene description. Anyone not named must not appear anywhere in the image, not even small in the background — even if they appear in the earlier pages.',
      'Do not put any text, letters, words, sound effects or speech bubbles in the image.'
    ].filter(Boolean).join(' ');

    if (cast && cast.length === 1) {
      const m = cast[0];
      parts.push({ inlineData: { mimeType: m.mime, data: m.base64 } });
      parts.push({
        text: `Create a children's book illustration where ${m.name ? `the character "${m.name}"` : 'the main character'} has the exact facial appearance, hairstyle, and likeness of the child in the provided image. ${rules} Scene description: ${prompt}`
      });
    } else if (cast && cast.length > 1) {
      const labels = [];
      cast.forEach((m, idx) => {
        const label = m.name || `Character ${idx + 1}`;
        labels.push(`Reference photo ${idx + 1} = "${label}"`);
        parts.push({ text: `Reference photo ${idx + 1}: this is "${label}".` });
        parts.push({ inlineData: { mimeType: m.mime, data: m.base64 } });
      });
      parts.push({
        text: `Create a children's book illustration. The reference photos above show different people: ${labels.join(', ')}. Whenever one of these characters appears in the scene, draw them with the exact facial appearance, hairstyle, and likeness of their own reference photo. Keep each person clearly distinct — never mix or swap faces between them. Only include the characters that the scene calls for. ${rules} Scene description: ${prompt}`
      });
    } else {
      parts.push({
        text: `Illustration for a picture book for adults (not a children's book style). ${rules} Scene description: ${prompt}`
      });
    }

    const data = await callImageModel(aiRoute, parts, '16:9');
    if (data.error) throw new Error(data.error.message || data.error.status || '그림 요청 오류');
    const cand = data.candidates?.[0];
    const resParts = cand?.content?.parts || [];
    for (const part of resParts) {
      if (part.inlineData && part.inlineData.data) return part.inlineData.data;
    }
    // 🔎 그림이 오지 않은 까닭을 남겨요(안전 필터·글만 돌려줌 등) — 화면에 보여 원인을 찾기 쉽게
    const why = data.promptFeedback?.blockReason || cand?.finishReason || '';
    const said = resParts.map(pt => pt.text || '').join(' ').trim().slice(0, 120);
    throw new Error(`그림이 오지 않았어요${why ? ` (${why})` : ''}${said ? ` — AI 답: ${said}` : ''}`);
  }

  function getLegacyUserIdentifier() {
    const key = (document.getElementById('apiKey')?.value || '').trim();
    const author = (document.getElementById('authorName')?.value || '').trim();
    if (key.length >= 8) return (author ? author + "_" : "user_") + key.slice(-8);
    return author ? author : "default_guest";
  }

  function getUniqueUserIdentifier() {
    const uid = window.EAIMCloud?.getUser?.()?.uid;
    return uid ? `firebase_${uid}` : getLegacyUserIdentifier();
  }

  function saveUserSession() {
    try {
      const key = (document.getElementById('apiKey')?.value || '').trim();
      const author = (document.getElementById('authorName')?.value || '').trim();
      localStorage.setItem("eoreuni_api_key", key);
      localStorage.setItem("eoreuni_author", author);
      const status = document.getElementById('apiStatus');
      if (status) {
        status.style.display = 'inline';
        setTimeout(() => { status.style.display = 'none'; }, 1500);
      }
    } catch(e) {}
    if (!window.EAIMCloud?.getUser?.()) loadLibraryList();
  }

  function clearUserSession() {
    try {
      localStorage.removeItem("eoreuni_api_key");
      localStorage.removeItem("eoreuni_author");
    } catch(e) {}
    const k = document.getElementById('apiKey');
    const a = document.getElementById('authorName');
    if (k) k.value = '';
    if (a) a.value = '';
    loadLibraryList();
    alert('사용자 정보가 초기화되었습니다.');
  }

  try {
    if (typeof indexedDB !== 'undefined') {
      const dbRequest = indexedDB.open("EoreuniStoryDB", 1);
      dbRequest.onupgradeneeded = (e) => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("books")) {
          const store = db.createObjectStore("books", { keyPath: "id", autoIncrement: true });
          store.createIndex("userId", "userId", { unique: false });
        }
      };
      dbRequest.onsuccess = (e) => {
        db = e.target.result;
        try {
          const savedKey = localStorage.getItem("eoreuni_api_key");
          const savedAuthor = localStorage.getItem("eoreuni_author");
          if (savedKey && document.getElementById('apiKey')) document.getElementById('apiKey').value = savedKey;
          if (savedAuthor && document.getElementById('authorName')) document.getElementById('authorName').value = savedAuthor;
        } catch(e) {}
        loadLibraryList();
      };
    }
  } catch(e) {
    console.log("DB Init Notice:", e);
  }

  // 👨‍👩‍👧 --- 보호자 확인 (Gemini API 약관: 보호자용 도구로 운영) ---
  const GUARDIAN_KEY = 'eoreuni_adult_ok'; // 만 18세 이상 확인 (공통규칙 10-5)

  function isGuardianConfirmed() {
    try { return localStorage.getItem(GUARDIAN_KEY) === 'yes'; } catch (e) { return false; }
  }

  function showGuardianGate() {
    const gate = document.getElementById('guardianGate');
    if (!gate) return;
    const msg = document.getElementById('guardianChildMsg');
    if (msg) msg.style.display = 'none';
    gate.style.display = 'grid';
  }

  function confirmGuardian() {
    try { localStorage.setItem(GUARDIAN_KEY, 'yes'); } catch (e) {}
    const gate = document.getElementById('guardianGate');
    if (gate) gate.style.display = 'none';
  }

  // 📖 무료 동화(다시 읽는 명작)만 보려는 분은 보호자 확인 없이 도서관으로 — AI를 쓰지 않는 공간이라서.
  //    동화 만들기·서재 탭으로 가거나 만들기 버튼을 누르면 보호자 확인 창이 다시 나온다.
  function skipGuardianToLibrary() {
    const gate = document.getElementById('guardianGate');
    if (gate) gate.style.display = 'none';
    if (typeof goMuniLibrary === 'function') goMuniLibrary();
    else if (typeof showMuniLibrary === 'function') showMuniLibrary();
  }
  function requireGuardian() {
    if (isGuardianConfirmed()) return true;
    showGuardianGate();
    return false;
  }

  function notGuardian() {
    const msg = document.getElementById('guardianChildMsg');
    if (msg) msg.style.display = 'block';
  }

  const __libDeepLink = /[?&](library|story=)/.test(location.search);
  if (!isGuardianConfirmed() && !__libDeepLink) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showGuardianGate);
    else showGuardianGate();
  }

  // 👨‍👩‍👧 --- 등장인물 사진 관리 ---
  function escapeCastText(str) {
    return String(str || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function getActiveCast() {
    return castMembers.filter(m => m.base64);
  }

  function buildCastPromptBlock() {
    // 사진이 있거나 이름이 적힌 인물은 모두 이야기에 등장시킵니다.
    const cast = castMembers.filter(m => m.base64 || m.name);
    if (!cast.length) return '';
    const names = cast.map((m, i) => m.name ? m.name : `사진 속 인물 ${i + 1}`);
    if (cast.length === 1) {
      return `- 꼭 등장할 주인공: ${names[0]} (이 인물을 주인공으로 등장시켜줘)\n`;
    }
    return `- 꼭 등장할 인물 ${cast.length}명: ${names.join(', ')} (첫 번째 인물이 주인공이고, 나머지도 모두 이야기에 비중 있게 함께 등장시켜줘)\n`;
  }

  function addCastMember() {
    if (castMembers.length >= MAX_CAST) {
      alert(`등장인물 사진은 최대 ${MAX_CAST}명까지 넣을 수 있어요.`);
      return;
    }
    castMembers.push({ id: ++castIdSeq, name: '', base64: null, mime: 'image/jpeg', previewUrl: '' });
    renderCastList();
  }

  function removeCastMember(id) {
    castMembers = castMembers.filter(m => m.id !== id);
    if (!castMembers.length) addCastMember();
    else renderCastList();
  }

  function updateCastName(id, value) {
    const m = castMembers.find(x => x.id === id);
    if (m) m.name = value.trim();
  }

  function pickCastPhoto(id) {
    pendingCastPhotoId = id;
    const input = document.getElementById('castPhotoInput');
    if (input) { input.value = ''; input.click(); }
  }

  function handleCastPhotoUpload(event) {
    const file = event.target.files[0];
    const targetId = pendingCastPhotoId;
    if (!file || targetId == null) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 512;
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h *= maxDim / w; w = maxDim; }
        else if (h > maxDim) { w *= maxDim / h; h = maxDim; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        // 어떤 형식의 사진이든 JPEG로 통일해서 전송 (용량↓, 호환성↑)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const m = castMembers.find(x => x.id === targetId);
        if (!m) return;
        m.base64 = dataUrl.split(',')[1];
        m.mime = 'image/jpeg';
        m.previewUrl = dataUrl;
        renderCastList();
      };
      img.onerror = () => alert('이 사진은 열 수 없어요. JPG나 PNG 사진으로 다시 골라주세요.');
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function renderCastList() {
    const list = document.getElementById('castPhotoList');
    if (!list) return;
    list.innerHTML = castMembers.map((m, idx) => `
      <div class="cast-card">
        ${castMembers.length > 1 || m.base64 ? `<button type="button" class="cast-remove" title="빼기" onclick="removeCastMember(${m.id})">✕</button>` : ''}
        <span class="cast-role">${idx === 0 ? '⭐ 주인공' : `🤝 등장인물 ${idx + 1}`}</span>
        <button type="button" class="cast-photo" onclick="pickCastPhoto(${m.id})">
          ${m.previewUrl ? `<img src="${m.previewUrl}" alt="${escapeCastText(m.name || '등장인물')} 사진">` : '📷<br>사진 선택'}
        </button>
        <input type="text" maxlength="12" placeholder="${idx === 0 ? '이름 (예: 민우)' : '이름 (예: 지아)'}"
          value="${escapeCastText(m.name)}" oninput="updateCastName(${m.id}, this.value)">
      </div>
    `).join('');
    const addBtn = document.getElementById('addCastBtn');
    if (addBtn) {
      addBtn.disabled = castMembers.length >= MAX_CAST;
      addBtn.textContent = castMembers.length >= MAX_CAST ? `최대 ${MAX_CAST}명까지 넣을 수 있어요` : '＋ 등장인물 추가하기';
    }
  }

  // 예전 함수 이름 호환용 (다른 곳에서 호출해도 안전하게)
  function clearChildPhoto() {
    castMembers = [];
    addCastMember();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { if (!castMembers.length) addCastMember(); });
  } else {
    addCastMember();
  }

  const lengthConfig = {
    "3": { pages: 4 },
    "5": { pages: 6 },
    "7": { pages: 8 }
  };

  const genreGuides = { ...adultGenreGuides, custom: adultGenreGuides.comfort }; // js/adult-story.js

  // =====================================================================
  // 🎨 이 페이지 그림만 다시 그리기 (제작자) — 글·목소리는 그대로, 그림 한 장만 새로
  // =====================================================================
  //   mode 'erase' = ✏️ 글씨만 지우기: 지금 그림을 그대로 두고 글씨·말풍선만 지움(인물 모습이 바뀌지 않음)
  //   mode 'new'   = 🎨 새로 그리기: 장면을 새로 그림(지금 그림과 앞뒤 페이지를 보고 인물 모습을 맞춤)
  async function redrawPageImage(i, mode = 'new') {
    const book = currentStoryBookObject;
    if (!book || !Array.isArray(book.pages) || !book.pages[i]) return;
    if (!document.body.classList.contains('is-creator')) return;
    const page = book.pages[i];
    const what = mode === 'erase' ? '그림 속 글씨만 지울까요?\n인물과 장면은 그대로 둬요.' : '그림을 새로 그릴까요?\n지금 그림과 앞뒤 페이지를 보고 인물 모습을 맞춰 그려요.';
    if (!confirm(`${page.page_num || i + 1}페이지 ${what}\n글과 AI 성우 목소리는 그대로예요. (그림 한 장 값이 들어요)`)) return;

    const apiKey = (document.getElementById('apiKey')?.value || '').trim();
    let aiRoute;
    if (apiKey && apiKey.length >= 5) aiRoute = { mode: 'key', apiKey };
    else {
      const trial = await checkTrialReady();
      if (!trial.ok) { alert(trial.message); return; }
      aiRoute = { mode: 'trial' };
    }

    const btns = [...document.querySelectorAll(`#book-page-${i} .redraw-btn`)];
    const btn = btns.find(b => b.dataset.mode === mode);
    btns.forEach(b => { b.disabled = true; });
    if (btn) btn.textContent = mode === 'erase' ? '✏️ 지우는 중...' : '🎨 그리는 중...';
    try {
      if (mode === 'erase') {
        if (!page.imageBase64) throw new Error('지울 그림이 없어요.');
        const mime = page.imageBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
        const data = await callImageModel(aiRoute, [
          { inlineData: { mimeType: mime, data: page.imageBase64 } },
          { text: 'Edit this children\'s storybook illustration: remove ALL text, letters, Korean Hangul characters, captions, titles, signs and speech bubbles. Fill those areas naturally with the surrounding background (sky, trees, walls). Keep everything else exactly the same — same characters, faces, hairstyles, clothes, poses, colors, composition, size and art style. Do not add anything new.' }
        ]);
        if (data.error) throw new Error(data.error.message);
        const out = (data.candidates?.[0]?.content?.parts || []).find(pt => pt.inlineData && pt.inlineData.data);
        if (!out) throw new Error('그림이 오지 않았어요. 잠시 뒤 다시 눌러 주세요.');
        page.imageBase64 = out.inlineData.data;
      } else {
      const style = (genreGuides[book.genre] || genreGuides.custom).artStyle;
      // 예전 동화는 image_prompt가 저장되어 있지 않아 페이지 글로 장면을 알려 준다(글은 이해용, 그림에 쓰지 않음)
      const plain = String(page.full_text || (page.dialogue_list || []).map(d => d.text).join(' ')).replace(/[\n\r]+/g, ' ');
      const prompt = page.image_prompt
        ? page.image_prompt
        : `Illustrate the single most important moment of this page of the children's story "${book.title}". The page text is in Korean and is given only so you understand the scene — never write it in the picture: ${plain} Art style: ${style}`;
      // 인물 모습 기준: 지금 이 페이지 그림 → 첫 페이지 → 앞·뒤 페이지 (최대 3장)
      const refs = [];
      for (const k of [i, 0, i - 1, i + 1]) {
        if (k < 0 || !book.pages[k] || !book.pages[k].imageBase64) continue;
        if (refs.some(r => r._k === k)) continue;
        const r = await shrinkImageForRef(book.pages[k].imageBase64);
        if (r) { r._k = k; refs.push(r); }
        if (refs.length >= 3) break;
      }
      const img = await generateGeminiImage(aiRoute, `${prompt} Keep every character looking exactly the same as in the reference pages — same faces, hairstyles, ages, clothes and colors.`, getActiveCast(), {
        sheet: book.characterSheet || [], allSheet: !page.image_prompt, refs
      });
      if (!img) throw new Error('그림이 오지 않았어요. 잠시 뒤 다시 눌러 주세요.');
      page.imageBase64 = img;
      }
      renderBookPages(book);
      showPage(i);
      if (!book.isLibraryBook) {
        storyUnsaved = true;
        await saveCurrentStoryToDB({ silent: true });
      }
      alert(book.isLibraryBook
        ? '✅ 다시 그렸어요. 도서관에 반영하려면 "📚 다시 읽는 명작에 올리기"로 묶음을 다시 만들어 올려 주세요.'
        : '✅ 다시 그려서 내 서재에 저장했어요. 도서관에 이미 올린 동화라면 "📚 다시 읽는 명작에 올리기"로 다시 올려 주세요.');
    } catch (err) {
      console.error(err);
      alert(`⚠️ 다시 그리지 못했어요: ${err.message || err}`);
      btns.forEach(b => { b.disabled = false; b.textContent = b.dataset.mode === 'erase' ? '✏️ 글씨만 지우기' : '🎨 새로 그리기'; });
    }
  }
  window.redrawPageImage = redrawPageImage;

  function renderBookPages(book) {
    const wrapper = document.getElementById('story-pages-wrapper');
    if (!wrapper) return;
    wrapper.innerHTML = '';

    const activePages = getActiveStoryPages(book);
    activePages.forEach((p, i) => {
      const originalPage = Array.isArray(book.pages) ? book.pages[i] : null;
      const pageDiv = document.createElement('div');
      pageDiv.className = `page-item ${i === 0 ? 'active' : ''}`;
      pageDiv.id = `book-page-${i}`;
      
      const imageBase64 = originalPage?.imageBase64 || p.imageBase64 || '';
      const imgHtml = imageBase64
        ? `<img src="data:image/png;base64,${imageBase64}" class="page-img" alt="삽화 ${p.page_num}">` 
        : `<div class="page-loading-text">🎨 (삽화 준비 중)</div>`;

      const formattedText = p.dialogue_list 
        ? p.dialogue_list.map(d => {
            let icon = '📖';
            let roleClass = '';
            if (d.role === 'hero' || d.role === 'child') { icon = '🗨️'; roleClass = 'dialogue-hero'; }
            else if (d.role === 'villain' || d.role === 'monster') { icon = '👹'; roleClass = 'dialogue-villain'; }
            else if (d.role === 'elder') { icon = '🧙‍♂️'; roleClass = 'dialogue-elder'; }
            else if (d.role === 'friend') { icon = '🐾'; roleClass = 'dialogue-hero'; }

            let emotionBadge = '';
            if (d.emotion === 'excited') emotionBadge = '<span class="emotion-tag">✨ 신남</span>';
            else if (d.emotion === 'urgent') emotionBadge = '<span class="emotion-tag">🔥 긴박</span>';
            else if (d.emotion === 'angry') emotionBadge = '<span class="emotion-tag">💥 호통</span>';
            else if (d.emotion === 'whisper') emotionBadge = '<span class="emotion-tag">🤫 속삭임</span>';

            if (d.role === 'narrator') {
              return `${d.text}<br>`;
            } else {
              // AI가 대사에 따옴표를 이미 붙여 온 경우 두 겹("" "")이 되지 않게 겉 따옴표를 떼고 한 번만 붙인다
              const said = String(d.text || '').trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim();
              return `<span class="dialogue-char ${roleClass}">${icon}</span> "${said}" ${emotionBadge}<br>`;
            }
          }).join('')
        : p.full_text;

      let koreanTranslationHtml = '';
      if (isEnglishStoryMode() && showKoreanAlongsideEnglish && originalPage) {
        const originalText = originalPage.dialogue_list
          ? originalPage.dialogue_list.map(d => d.text || '').join(' ')
          : (originalPage.full_text || '');
        koreanTranslationHtml = `<div class="korean-translation"><strong>🇰🇷 한국어 해석</strong><br>${originalText}</div>`;
      }

      pageDiv.innerHTML = `
        ${imgHtml}
        ${originalPage ? `<div class="redraw-box creator-only"><button type="button" class="redraw-btn" data-mode="erase" onclick="redrawPageImage(${i},'erase')">✏️ 글씨만 지우기</button><button type="button" class="redraw-btn" data-mode="new" onclick="redrawPageImage(${i},'new')">🎨 새로 그리기</button></div>` : ''}
        <div class="page-overlay-box">
          <div class="page-num-badge">${p.page_num}페이지</div>
          <p class="page-text">${formattedText}${koreanTranslationHtml}</p>
        </div>
      `;
      wrapper.appendChild(pageDiv);
    });

    const titleEl = document.getElementById('story-main-title');
    if (titleEl) titleEl.innerText = `📖 ${getActiveStoryTitle(book)}`;
    updateLanguageButtons();
    const bookContainer = document.getElementById('book-container');
    if (bookContainer) bookContainer.style.display = 'block';
    const controlPanel = document.getElementById('controlPanel');
    if (controlPanel) controlPanel.style.display = 'flex';
    if (typeof updateAiVoiceButton === 'function') updateAiVoiceButton();
    if (typeof window.updateMusicButtonLabel === 'function') window.updateMusicButtonLabel();
    if (typeof window.updateLibraryBookBar === 'function') window.updateLibraryBookBar();
    if (typeof window.renderClosingBox === 'function') window.renderClosingBox(book);
    updateMissingImageButton();
    try { const t = document.getElementById('bgmTitleText'); if (t) t.innerText = `배경음악: ${getCurrentBgmSelection().data.name}`; } catch (e) {}
  }

  function showPage(index) {
    if (!currentStoryBookObject || !currentStoryBookObject.pages.length) return;
    const total = currentStoryBookObject.pages.length;
    if (index < 0) index = 0;
    if (index >= total) index = total - 1;
    currentPageIndex = index;

    document.querySelectorAll('.page-item').forEach((el, i) => {
      if (i === currentPageIndex) el.classList.add('active');
      else el.classList.remove('active');
    });

    const ind = document.getElementById('pageIndicator');
    if (ind) ind.innerText = `${currentPageIndex + 1} / ${total}`;
    const prev = document.getElementById('prevPageBtn');
    if (prev) prev.disabled = (currentPageIndex === 0);
    const next = document.getElementById('nextPageBtn');
    if (next) next.disabled = (currentPageIndex === total - 1);
  }

  function goToPrevPage() { 
    if (isPlaying) stopVoice();
    showPage(currentPageIndex - 1); 
  }
  function goToNextPage() { 
    if (isPlaying) stopVoice();
    showPage(currentPageIndex + 1); 
  }

  // 💡 [모바일 안정형 연속 낭독 루프]
  async function startContinuousReading(onCompleteCallback = null, startPageIndex = 0) {
    if (!currentStoryBookObject) return;

    // 🎵 모바일 핵심:
    // '낭독 시작/이어듣기' 버튼을 누른 바로 그 순간 BGM을 재생합니다.
    // await나 음성 onstart 뒤에 play()를 호출하면 모바일 브라우저가 자동재생으로 막을 수 있습니다.
    if (isBgmEnabled) {
      playBgmForCurrentStory();
    }
    // 🎙️ AI 성우 목소리가 있으면 버튼을 누른 이 순간 재생 권한을 열어둡니다.
    if (typeof unlockAiVoicePlayer === 'function' && currentStoryBookObject.pages.some(p => p.aiVoice?.blob)) {
      unlockAiVoicePlayer();
    }

    // 📱 카카오톡·네이버·인스타 같은 앱 안의 브라우저는 기본 음성(speechSynthesis)이 없는 경우가 많다.
    //    모든 페이지에 🎙️ AI 성우 목소리가 있으면 기본 음성 없이도 끝까지 들을 수 있으니 막지 않는다.
    if (typeof window.speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      const total = getActiveStoryPages(currentStoryBookObject).length;
      let allAi = total > 0;
      for (let i = 0; i < total; i++) { if (!(typeof hasAiVoice === 'function' && hasAiVoice(i))) { allAi = false; break; } }
      if (!allAi) {
        const ua = navigator.userAgent || '';
        if (/KAKAOTALK/i.test(ua)) {
          if (confirm('카카오톡 안에서는 동화 읽어주기 소리가 나오지 않아요.\n\n[확인]을 누르면 크롬·사파리 같은 인터넷 앱으로 열어요.')) {
            location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
          }
        } else if (/NAVER|Instagram|FBAN|FBAV|Line\//i.test(ua)) {
          alert('이 앱 안의 화면에서는 동화 읽어주기 소리가 나오지 않아요.\n\n오른쪽 위(또는 아래) ⋮ 메뉴 → [다른 브라우저로 열기]를 눌러 크롬이나 사파리로 열어 주세요.');
        } else {
          alert('이 브라우저는 동화 읽어주기 소리를 지원하지 않아요.\n크롬이나 사파리 최신 버전으로 열어 주세요.');
        }
        return;
      }
    }

    // 중요: 예전 코드는 unlockMobileAudio() 직후 stopVoice()가 speak()를 cancel하여
    // 모바일에서 첫 낭독이 사라질 수 있었습니다. 이제 기존 음성을 먼저 정리합니다.
    speechSessionId += 1;
    const mySession = speechSessionId;
    safeCancelSpeech();
    initVoices();

    isPlaying = true;
    isSpeechPaused = false;
    wasStoppedByUser = false;

    const safeStartPage = Math.max(0, Math.min(
      Number(startPageIndex) || 0,
      Math.max(0, currentStoryBookObject.pages.length - 1)
    ));
    showPage(safeStartPage);

    // 처음부터 들을 때만 제목을 읽습니다. (AI 성우 목소리는 1페이지 소리에 제목이 들어 있어요)
    if (safeStartPage === 0 && !(typeof hasAiVoice === 'function' && hasAiVoice(0))) {
      const firstOk = await speakDynamicLine(
        'narrator',
        'calm',
        `${isEnglishStoryMode() ? 'Title' : '제목'}: ${getActiveStoryTitle(currentStoryBookObject)}`,
        { sessionId: mySession, startBgmOnStart: false }
      );
      if (!firstOk || !isPlaying || mySession !== speechSessionId) return;
    } else if (isBgmEnabled) {
      playBgmForCurrentStory();
    }

    const readingPages = getActiveStoryPages(currentStoryBookObject);
    for (let i = safeStartPage; i < readingPages.length; i++) {
      if (!isPlaying || mySession !== speechSessionId) break;
      showPage(i);

      const pageData = readingPages[i];

      if (typeof hasAiVoice === 'function' && hasAiVoice(i)) {
        const ok = await playPageAiVoice(i, mySession);
        if (!isPlaying || mySession !== speechSessionId) break;
        if (ok) {
          await new Promise(r => setTimeout(r, 350));
          continue;
        }
        // AI 성우 소리를 틀지 못한 페이지는 동화를 멈추지 말고 기본 음성으로 이어 읽는다
        console.warn('AI voice failed on page', i, '— using browser voice');
      }

      if (pageData.dialogue_list && pageData.dialogue_list.length > 0) {
        for (const line of pageData.dialogue_list) {
          if (!isPlaying || mySession !== speechSessionId) break;
          const ok = await speakDynamicLine(
            line.role || 'narrator',
            line.emotion || 'calm',
            line.text,
            { sessionId: mySession }
          );
          if (!isPlaying || mySession !== speechSessionId) break;
          const delay = line.emotion === 'urgent' ? 100 : 160;
          await new Promise(r => setTimeout(r, delay));
        }
      } else {
        const ok = await speakDynamicLine(
          'narrator',
          'calm',
          pageData.full_text,
          { sessionId: mySession }
        );
        if (!isPlaying || mySession !== speechSessionId) break;
      }
    }

    if (isPlaying && mySession === speechSessionId) {
      if (onCompleteCallback && typeof onCompleteCallback === 'function') {
        onCompleteCallback();
      } else if (isRepeatMode) {
        setTimeout(() => {
          if (isPlaying && isRepeatMode && mySession === speechSessionId) {
            startContinuousReading();
          }
        }, 700);
      } else {
        isPlaying = false;
        clearSpeechWatchdog();
        stopBgm();
      }
    }
  }

  // 💡 [모바일 안정형 단일 발화 함수]
  
  function getKoreanVoices() {
    const all = Array.isArray(availableVoices) ? availableVoices : [];
    const ko = all.filter(v => v.lang && String(v.lang).toLowerCase().startsWith('ko'));
    const unique = [];
    const seen = new Set();
    for (const v of ko) {
      const key = v.voiceURI || `${v.name}|${v.lang}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(v);
      }
    }
    return unique;
  }

  function getEnglishVoices() {
    const all = Array.isArray(availableVoices) ? availableVoices : [];
    const en = all.filter(v => v.lang && String(v.lang).toLowerCase().startsWith('en'));
    const unique = [];
    const seen = new Set();
    for (const v of en) {
      const key = v.voiceURI || `${v.name}|${v.lang}`;
      if (!seen.has(key)) { seen.add(key); unique.push(v); }
    }
    return unique;
  }

  function updateVoiceStatus() {
    const el = document.getElementById('voiceStatus');
    if (!el) return;
    const isEnglish = isEnglishStoryMode();
    const voices = isEnglish ? getEnglishVoices() : getKoreanVoices();
    const langName = isEnglish ? '영어' : '한국어';
    if (voices.length >= 3) {
      el.innerHTML = `🎙️ ${langName} 음성 <b>${voices.length}개</b>를 찾았어요. 역할별로 다른 음성을 우선 사용합니다.`;
    } else if (voices.length === 2) {
      el.innerHTML = `🎙️ ${langName} 음성 <b>2개</b>를 찾았어요. 음성 2개와 음높이·속도 연기로 역할을 나눕니다.`;
    } else if (voices.length === 1) {
      el.innerHTML = `🎙️ ${langName} 음성이 <b>1개</b>라서 음높이·속도를 달리해 역할을 구분합니다.`;
    } else {
      el.innerHTML = `🎙️ ${langName} 음성을 불러오는 중이에요. 낭독 버튼을 누르면 다시 확인합니다.`;
    }
  }

  function getRoleVoiceProfile(role, emotion, styleMode, languageCode = 'ko-KR') {
    const voices = String(languageCode).toLowerCase().startsWith('en') ? getEnglishVoices() : getKoreanVoices();
    const r = String(role || '').toLowerCase();
    const em = String(emotion || '').toLowerCase();

    let idx = 0; // narrator
    if (r.includes('hero') || r.includes('child')) idx = 1;
    else if (r.includes('friend')) idx = 2;
    else if (r.includes('villain') || r.includes('monster') || r.includes('giant')) idx = 3;
    else if (r.includes('elder') || r.includes('king')) idx = 4;

    const voice = voices.length ? voices[idx % voices.length] : null;

    let rate = 1.0, pitch = 1.0;
    if (styleMode === 'bedtime_calm') {
      if (r.includes('villain') || r.includes('elder') || r.includes('king')) { rate = 0.82; pitch = 0.72; }
      else if (r.includes('friend')) { rate = 0.92; pitch = 1.18; }
      else if (r.includes('hero') || r.includes('child')) { rate = 0.90; pitch = 1.10; }
      else { rate = 0.86; pitch = 0.94; }
    } else {
      if (r.includes('villain') || r.includes('monster') || r.includes('giant')) { rate = 0.88; pitch = 0.62; }
      else if (r.includes('elder') || r.includes('king')) { rate = 0.82; pitch = 0.78; }
      else if (r.includes('friend')) { rate = 1.12; pitch = 1.32; }
      else if (r.includes('hero') || r.includes('child')) { rate = 1.05; pitch = 1.18; }
      else { rate = 0.96; pitch = 0.98; }

      if (em === 'excited' || em === 'happy') { rate += 0.08; pitch += 0.08; }
      else if (em === 'urgent') { rate += 0.13; pitch += 0.03; }
      else if (em === 'angry') { rate += 0.04; pitch -= 0.08; }
      else if (em === 'whisper') { rate -= 0.12; pitch -= 0.06; }
      else if (em === 'curious') { pitch += 0.10; }
    }

    // 영어 난이도별 낭독 속도: 유아 영어는 더 천천히, 어린이 영어는 자연스럽지만 여유 있게.
    if (String(languageCode).toLowerCase().startsWith('en')) {
      rate *= currentStoryLanguage === 'en-preschool' ? 0.70 : 0.84;
    }

    rate = Math.max(0.52, Math.min(1.35, rate));
    pitch = Math.max(0.5, Math.min(1.6, pitch));
    return { voice, rate, pitch };
  }


// 🔤 한글 자음·모음 글자를 소리 내어 읽을 이름으로 바꾸기 (화면 글자는 그대로, 읽기용만)
//    예: "ㄱ은 기차의 ㄱ" → "기역은 기차의 기역". 음성이 ㄱ을 "그", ㅇ을 "아"로 읽던 문제 해결.
const HANGUL_JAMO_NAMES = {
  'ㄱ':'기역','ㄲ':'쌍기역','ㄴ':'니은','ㄷ':'디귿','ㄸ':'쌍디귿','ㄹ':'리을','ㅁ':'미음','ㅂ':'비읍','ㅃ':'쌍비읍',
  'ㅅ':'시옷','ㅆ':'쌍시옷','ㅇ':'이응','ㅈ':'지읒','ㅉ':'쌍지읒','ㅊ':'치읓','ㅋ':'키읔','ㅌ':'티읕','ㅍ':'피읖','ㅎ':'히읗',
  'ㄳ':'기역시옷','ㄵ':'니은지읒','ㄶ':'니은히읗','ㄺ':'리을기역','ㄻ':'리을미음','ㄼ':'리을비읍','ㄽ':'리을시옷',
  'ㄾ':'리을티읕','ㄿ':'리을피읖','ㅀ':'리을히읗','ㅄ':'비읍시옷',
  'ㅏ':'아','ㅐ':'애','ㅑ':'야','ㅒ':'얘','ㅓ':'어','ㅔ':'에','ㅕ':'여','ㅖ':'예','ㅗ':'오','ㅘ':'와','ㅙ':'왜','ㅚ':'외',
  'ㅛ':'요','ㅜ':'우','ㅝ':'워','ㅞ':'웨','ㅟ':'위','ㅠ':'유','ㅡ':'으','ㅢ':'의','ㅣ':'이'
};
function hasHangulJamo(text) { return /[\u3131-\u3163]/.test(String(text || '')); }
function speakableKorean(text) {
  let t = String(text || '');
  if (!hasHangulJamo(t)) return t;
  // "ㄱ(기역)"처럼 이름이 이미 붙어 있으면 이름만 한 번 읽기
  t = t.replace(/([\u3131-\u3163])\s*[(（]\s*([가-힣]{1,5})\s*[)）]/g, (m, j, name) => (HANGUL_JAMO_NAMES[j] === name ? name : m));
  return t.replace(/[\u3131-\u3163]/g, j => HANGUL_JAMO_NAMES[j] || j);
}

function speakDynamicLine(role, emotion, rawText, options = {}) {
    return new Promise((resolve) => {
      if (typeof window.speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
        resolve(false);
        return;
      }

      const cleanText = String(rawText || '').replace(/[*#"]/g, '').trim();
      if (!cleanText) { resolve(true); return; }

      const sessionId = options.sessionId ?? speechSessionId;
      if (!isPlaying || sessionId !== speechSessionId) { resolve(false); return; }

      initVoices();

      const utterance = new SpeechSynthesisUtterance(speakableKorean(cleanText));
      currentUtterance = utterance;
      const speechLang = getSpeechLanguageCode();
      utterance.lang = speechLang;
      utterance.volume = 1;

      const styleEl = document.getElementById('actingStyle');
      const styleMode = styleEl ? styleEl.value : 'dynamic_theater';
      const profile = getRoleVoiceProfile(role, emotion, styleMode, speechLang);

      if (profile.voice) utterance.voice = profile.voice;
      utterance.rate = profile.rate;
      utterance.pitch = profile.pitch;

      let finished = false;
      let hardTimeout = null;

      const finish = (ok = true) => {
        if (finished) return;
        finished = true;
        if (hardTimeout) clearTimeout(hardTimeout);
        clearSpeechWatchdog();
        if (currentUtterance === utterance) currentUtterance = null;
        if (isBgmEnabled && bgmAudio && !bgmAudio.paused) {
          bgmAudio.volume = getCurrentBgmSelection().volume;
        }
        resolve(ok);
      };

      let startGuard = null;
      utterance.onstart = () => {
        if (startGuard) { clearTimeout(startGuard); startGuard = null; }
        if (options.startBgmOnStart && isBgmEnabled) playBgmForCurrentStory();
        if (isBgmEnabled && bgmAudio && !bgmAudio.paused) {
          bgmAudio.volume = getCurrentBgmSelection().volume * 0.68;
        }
        clearSpeechWatchdog();
        speechWatchdog = setInterval(() => {
          if (!isPlaying || sessionId !== speechSessionId || isSpeechPaused) return;
          try { window.speechSynthesis.resume(); } catch (e) {}
        }, 4000);
      };

      utterance.onend = () => finish(true);
      utterance.onerror = () => finish(false);

      // 🗣️ 기본 음성이 4초 안에 시작조차 하지 않으면(녹화·화면 공유 중 브라우저가 음성을 막는 경우) 오래 멈춰 있지 않고 넘어간다
      startGuard = setTimeout(() => {
        if (!finished && !(window.speechSynthesis && window.speechSynthesis.speaking)) {
          console.warn('browser voice did not start — skipping line');
          try { window.speechSynthesis.cancel(); } catch (e) {}
          finish(true);
        }
      }, 4000);
      const estimatedMs = Math.max(18000, Math.min(90000, cleanText.length * 430));
      hardTimeout = setTimeout(() => {
        if (!finished) {
          try { window.speechSynthesis.cancel(); } catch (e) {}
          finish(false);
        }
      }, estimatedMs);

      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        finish(false);
      }
    });
  }

  function toggleRepeatMode() {
    isRepeatMode = !isRepeatMode;
    const loopBtn = document.getElementById('loopBtn');
    if (loopBtn) {
      if (isRepeatMode) {
        loopBtn.classList.add('active');
        loopBtn.innerText = '🔁 반복 재생: ON';
      } else {
        loopBtn.classList.remove('active');
        loopBtn.innerText = '🔁 반복 재생: OFF';
      }
    }
  }

  async function playAllBooksSequentially() {
    if (myLibraryBooks.length === 0) {
      alert('마음 서재에 저장된 동화가 없어요.');
      return;
    }
    isLibraryPlayingMode = true;
    currentLibraryIndex = 0;
    playNextBookInLibrary();
  }

  function playNextBookInLibrary() {
    if (!isPlaying && currentLibraryIndex > 0) return;

    if (currentLibraryIndex >= myLibraryBooks.length) {
      if (isRepeatMode) {
        currentLibraryIndex = 0;
      } else {
        alert('📚 마음 서재의 동화를 모두 들었어요.');
        isLibraryPlayingMode = false;
        isPlaying = false;
        stopBgm();
        return;
      }
    }

    const nextBook = myLibraryBooks[currentLibraryIndex];
    currentStoryBookObject = nextBook;
    currentStoryLanguage = 'ko';
    showKoreanAlongsideEnglish = false;
    renderBookPages(nextBook);
    showPage(0);
    switchTab('create');

    // 첫 책은 사용자의 '연속 재생' 터치 흐름을 유지한 채 바로 낭독을 시작합니다.
    // iOS Safari는 setTimeout 뒤의 최초 speak()를 사용자 제스처로 인정하지 않을 수 있습니다.
    startContinuousReading(() => {
      currentLibraryIndex++;
      playNextBookInLibrary();
    });
  }

  async function saveCurrentStoryToDB(options = {}) {
    if (!currentStoryBookObject || !db) return;

    const cloudUser = window.EAIMCloud?.getUser?.() || null;
    const wasNewInCloud = !currentStoryBookObject.cloudId;
    delete currentStoryBookObject._repairCloud; // 저장하면 클라우드 사본도 온전해짐
    currentStoryBookObject.userId = getUniqueUserIdentifier();
    currentStoryBookObject.author = (document.getElementById('authorName')?.value || '').trim() || "어른이";
    currentStoryBookObject.genre = currentStoryBookObject.genre || document.getElementById('storyGenre')?.value || "comfort";
    const currentLearning = getLearningSelection();
    currentStoryBookObject.storyPurpose = currentLearning.purpose;
    currentStoryBookObject.learningMode = currentLearning.mode;
    currentStoryBookObject.learningTopic = currentLearning.topic;
    currentStoryBookObject.updatedAt = new Date().toISOString();

    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction("books", "readwrite");
        const store = tx.objectStore("books");
        const req = currentStoryBookObject.id ? store.put(currentStoryBookObject) : store.add(currentStoryBookObject);
        req.onsuccess = () => { if (!currentStoryBookObject.id) currentStoryBookObject.id = req.result; };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('IndexedDB save failed'));
      });

      storyUnsaved = false;
      let cloudSaved = false;
      if (cloudUser && !options.localOnly && window.EAIMCloud?.saveStory) {
        try {
          const result = await window.EAIMCloud.saveStory(currentStoryBookObject);
          if (result?.cloudId) {
            currentStoryBookObject.cloudId = result.cloudId;
            currentStoryBookObject.userId = `firebase_${cloudUser.uid}`;
            await new Promise((resolve) => {
              const tx = db.transaction("books", "readwrite");
              tx.objectStore("books").put(currentStoryBookObject);
              tx.oncomplete = resolve; tx.onerror = resolve;
            });
          }
          cloudSaved = true;
          const prog = await refreshVillageProgress();
          if (wasNewInCloud && prog) announceVillageProgress(prog, currentStoryBookObject.villagePlace);
        } catch (e) {
          console.error('Cloud save:', e);
          setCloudStatus('⚠️ 기기에는 저장됐지만 클라우드 저장에 실패했어요: ' + (e.message || e));
        }
      }

      if (!options.silent) {
        alert(cloudSaved
          ? `[${currentStoryBookObject.title}]이(가) 기기와 클라우드 마음 서재에 저장했어요.`
          : `[${currentStoryBookObject.title}]이(가) 이 기기의 마음 서재에 저장했어요.${cloudUser ? '\n클라우드 저장 상태를 확인해 주세요.' : '\nGoogle 로그인하면 다른 기기와 동기화할 수 있어요.'}`);
      }
      await loadLibraryList();
    } catch(e) {
      console.error(e);
      if (!options.silent) alert('서재 저장 중 오류가 발생했습니다.');
    }
  }

  function getLocalBooks() {
    return new Promise((resolve) => {
      if (!db) return resolve([]);
      try {
        const tx = db.transaction("books", "readonly");
        const req = tx.objectStore("books").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch(e) { resolve([]); }
    });
  }

  async function loadLibraryList() {
    if (!db) return;
    const currentUserId = getUniqueUserIdentifier();
    const legacyUserId = getLegacyUserIdentifier();
    const authorName = (document.getElementById('authorName')?.value || '').trim() || "나";
    const cloudUser = window.EAIMCloud?.getUser?.() || null;
    const titleEl = document.getElementById('libraryTitleLabel');
    if (titleEl) titleEl.innerText = cloudUser ? `📚 ${cloudUser.displayName || authorName}님의 마음 서재 (클라우드)` : `📚 [${authorName}] 님의 마음 서재 (이 기기)`;

    const localAll = await getLocalBooks();
    let localBooks = localAll.filter(book => !book.userId || book.userId === currentUserId || book.userId === legacyUserId);
    let cloudBooks = [];
    if (cloudUser && window.EAIMCloud?.loadStories) {
      try { cloudBooks = await window.EAIMCloud.loadStories(); }
      catch(e) { console.error('Cloud load:', e); setCloudStatus('⚠️ 클라우드 서재를 불러오지 못했어요: ' + (e.message || e)); }
    }

    const merged = [];
    const byCloudId = new Map();
    for (const b of localBooks) {
      merged.push(b);
      if (b.cloudId) byCloudId.set(b.cloudId, merged.length - 1);
    }
    for (const cb of cloudBooks) {
      if (cb.cloudId && byCloudId.has(cb.cloudId)) {
        const idx = byCloudId.get(cb.cloudId);
        // 클라우드 데이터가 새 기기에서도 완전한 책을 제공하도록 우선합니다.
        const localPages = merged[idx].pages || [];
        const mergedBook = { ...merged[idx], ...cb, id: merged[idx].id };
        // 🛟 클라우드 사본이 덜 저장됐으면(페이지 수가 적거나 그림이 빠짐) 이 기기의 온전한 페이지를 씁니다
        const cloudPages = Array.isArray(cb.pages) ? cb.pages : [];
        const cloudBroken = cb._cloudIncomplete || cloudPages.length < localPages.length ||
          cloudPages.some((pg, i) => !pg.imageBase64 && localPages[i]?.imageBase64);
        if (cloudBroken && localPages.length) { mergedBook.pages = localPages; mergedBook._repairCloud = true; }
        delete mergedBook._cloudIncomplete;
        // 🎙️ AI 성우 목소리는 이 기기에만 저장되므로 클라우드 데이터로 덮어쓸 때 다시 붙여줍니다.
        if (Array.isArray(mergedBook.pages)) {
          mergedBook.pages = mergedBook.pages.map((pg, i) => localPages[i]?.aiVoice && !pg.aiVoice ? { ...pg, aiVoice: localPages[i].aiVoice } : pg);
          mergedBook.hasAiVoice = mergedBook.pages.some(pg => pg.aiVoice?.blob);
        }
        if (merged[idx].customBgm && !(mergedBook.customBgm && mergedBook.customBgm.blob)) {
          mergedBook.customBgm = merged[idx].customBgm; // 🎵 제작자 음악도 이 기기에만 있으므로 다시 붙이기
        }
        merged[idx] = mergedBook;
      } else merged.push(cb);
    }
    myLibraryBooks = merged.sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

    const listEl = document.getElementById("library-list");
    if (!listEl) return;
    if (myLibraryBooks.length === 0) {
      listEl.innerHTML = `<p style="text-align:center;color:#94a3b8;padding:20px">${cloudUser ? '클라우드 서재' : `[${authorName}] 님의 서재`}에 저장된 동화가 없어요.</p>`;
      return;
    }

    listEl.innerHTML = myLibraryBooks.map((book, index) => `
      <div class="library-item">
        <div class="library-info">
          <h4>📖 ${escapeCastText(book.title)}</h4>
          <p>서재: <b>${escapeCastText(book.author || '익명')}</b> | 저장일: ${book.createdAt || '-'} (총 ${(book.pages || []).length}p)
            <span class="library-tag">${storyPurposeLabel(book.storyPurpose, book.learningMode, book)}</span>
            ${book.mood?.mood ? `<span class="library-tag">💭 ${escapeCastText(book.mood.mood)}</span>` : ''}
            ${book.reflection ? `<span class="library-tag">✏️ 한 줄</span>` : ''}
            ${book.cloudId ? '<span class="library-tag">☁️ Cloud</span>' : '<span class="library-tag">📱 기기</span>'}
            ${(book.preschoolEnglishPages?.length || book.englishPages?.length) ? '<span class="library-tag">🐣 유아 EN</span>' : ''}
            ${book.childEnglishPages?.length ? '<span class="library-tag">🌱 어린이 EN</span>' : ''}
            ${(book.pages || []).some(pg => pg.aiVoice?.blob) ? '<span class="library-tag">🎙️ AI 성우</span>' : ''}
          </p>
        </div>
        <div class="library-actions">
          <button type="button" class="btn-load" onclick="loadSingleBook(${index})">열기</button>
          <button type="button" class="btn-delete" onclick="deleteSavedBook(${index})">삭제</button>
        </div>
      </div>`).join('');
  }

  async function persistCloudBookLocally(book) {
    if (!db || !book) return book;
    const existing = (await getLocalBooks()).find(b => b.cloudId && b.cloudId === book.cloudId);
    const localBook = { ...book, id: existing?.id };
    await new Promise((resolve) => {
      try {
        const tx = db.transaction('books','readwrite');
        const req = localBook.id ? tx.objectStore('books').put(localBook) : tx.objectStore('books').add(localBook);
        req.onsuccess = () => { if (!localBook.id) localBook.id = req.result; };
        tx.oncomplete = resolve; tx.onerror = resolve;
      } catch(e) { resolve(); }
    });
    return localBook;
  }

  async function loadSingleBook(index) {
    let book = myLibraryBooks[index];
    if (!book) return;
    if (book.cloudId && !book.id) book = await persistCloudBookLocally(book);
    currentStoryBookObject = book;
    const genreEl = document.getElementById('storyGenre');
    const learningEl = document.getElementById('learningMode');
    const learningTopicEl = document.getElementById('learningTopic');
    if (genreEl) genreEl.value = book.genre || 'comfort';
    document.querySelectorAll('#genreChips .pick-chip').forEach(b => b.classList.toggle('active', b.dataset.genre === (book.genre || 'comfort')));
    const legacyLearningMode = book.learningMode || 'general';
    const savedPurpose = book.storyPurpose || (legacyLearningMode && legacyLearningMode !== 'general' ? 'learning' : 'story');
    setStoryPurpose(savedPurpose, { silent: true });
    if (learningEl && legacyLearningMode !== 'general') learningEl.value = legacyLearningMode;
    if (typeof setLearningTopicFromSaved === 'function' && savedPurpose === 'learning') setLearningTopicFromSaved(book.learningTopic || '', legacyLearningMode || 'science');
    else if (learningTopicEl) learningTopicEl.value = book.learningTopic || '';
    handleLearningModeChange();
    currentStoryLanguage = 'ko'; showKoreanAlongsideEnglish = false;
    renderBookPages(book); showPage(0); switchTab('create'); updateBgmGenrePreview(book.genre || 'comfort');
    setTimeout(() => document.getElementById('book-container')?.scrollIntoView({ behavior:'smooth', block:'start' }), 200);
  }

  async function deleteSavedBook(index) {
    const book = myLibraryBooks[index];
    if (!book || !confirm('이 동화를 마음 서재에서 지울까요?')) return;
    if (book.id && db) {
      await new Promise((resolve) => {
        try { const tx=db.transaction('books','readwrite'); tx.objectStore('books').delete(book.id); tx.oncomplete=resolve; tx.onerror=resolve; }
        catch(e){ resolve(); }
      });
    }
    if (book.cloudId && window.EAIMCloud?.getUser?.() && window.EAIMCloud?.deleteStory) {
      try { await window.EAIMCloud.deleteStory(book.cloudId); }
      catch(e) { alert('기기에서는 삭제했지만 클라우드 삭제에 실패했어요: ' + (e.message || e)); }
    }
    await loadLibraryList();
    if (typeof refreshVillageProgress === 'function') refreshVillageProgress(); // 🏡 지운 동화는 마을에서도 빠져요
  }

  function setCloudStatus(message) {
    const el = document.getElementById('cloudAuthStatus');
    if (el) el.textContent = message;
  }

  async function loginEAIMKids() {
    if (!window.EAIMCloud?.login) return alert('Firebase 연결을 준비하는 중이에요. 잠시 후 다시 눌러 주세요.');
    try { setCloudStatus('Google 로그인 중...'); await window.EAIMCloud.login(); }
    catch(e) { console.error(e); setCloudStatus('로그인 실패: ' + (e.message || e)); }
  }

  async function logoutEAIMKids() {
    if (!window.EAIMCloud?.logout) return;
    try { await window.EAIMCloud.logout(); }
    catch(e) { console.error(e); }
  }

  function updateCloudAuthUI(user) {
    const login=document.getElementById('googleLoginBtn'), logout=document.getElementById('googleLogoutBtn');
    const sync=document.getElementById('cloudSyncBtn'), box=document.getElementById('cloudUserBox');
    const name=document.getElementById('cloudUserName'), photo=document.getElementById('cloudUserPhoto');
    if (user) {
      if(login) login.style.display='none'; if(logout) logout.style.display='inline-block'; if(sync) sync.style.display='inline-block'; if(box) box.style.display='flex';
      if(name) name.textContent=user.displayName || user.email || 'Google 사용자';
      if(photo){ if(user.photoURL){photo.src=user.photoURL;photo.style.display='block';}else photo.style.display='none'; }
      setCloudStatus('✅ 로그인했어요. 새로 저장하는 동화는 클라우드 마음 서재에도 저장돼요.');
    } else {
      if(login) login.style.display='inline-block'; if(logout) logout.style.display='none'; if(sync) sync.style.display='none'; if(box) box.style.display='none';
      setCloudStatus('로그인하지 않아도 이 기기에는 저장됩니다. Google 로그인하면 여러 기기에서 같은 서재를 사용할 수 있어요.');
    }
    loadLibraryList();
  }

  async function syncLocalLibraryToCloud() {
    const user = window.EAIMCloud?.getUser?.();
    if (!user) return alert('먼저 Google로 로그인해 주세요.');
    const legacyId = getLegacyUserIdentifier();
    const currentId = `firebase_${user.uid}`;
    const books = (await getLocalBooks()).filter(b => !b.userId || b.userId===legacyId || b.userId===currentId);
    if (!books.length) return alert('이 기기에 동기화할 동화책이 없습니다.');
    if (!confirm(`이 기기의 동화 ${books.length}편을 클라우드 마음 서재와 동기화할까요?`)) return;
    let ok=0, fail=0;
    setCloudStatus(`☁️ ${books.length}권 동기화 중...`);
    for (const book of books) {
      try {
        book.userId=currentId; book.updatedAt=book.updatedAt || new Date().toISOString();
        const r=await window.EAIMCloud.saveStory(book);
        if(r?.cloudId) book.cloudId=r.cloudId;
        await new Promise((resolve)=>{try{const tx=db.transaction('books','readwrite');tx.objectStore('books').put(book);tx.oncomplete=resolve;tx.onerror=resolve;}catch(e){resolve();}});
        ok++;
      } catch(e) { console.error(e); fail++; }
    }
    setCloudStatus(`✅ 동기화 완료: ${ok}권${fail ? ` / 실패 ${fail}권` : ''}`);
    await loadLibraryList();
    alert(`클라우드 동기화가 끝났어요. 성공 ${ok}권${fail ? `, 실패 ${fail}권` : ''}`);
  }

  window.addEventListener('eaim-auth-changed', (event) => updateCloudAuthUI(event.detail || null));
  function exportToPDF() {
    if (!currentStoryBookObject) return;
    const esc = (t) => String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const title = getActiveStoryTitle(currentStoryBookObject);
    const author = currentStoryBookObject.author || '어른이';
    const pages = getActiveStoryPages(currentStoryBookObject);
    const firstImg = currentStoryBookObject.pages[0]?.imageBase64 || '';

    // A4 한 장 = 794×1123px. 한 장에 동화 한 페이지(그림 위, 글 아래)만 들어가게 만듭니다.
    const PAGE = 'width:794px;height:1110px;box-sizing:border-box;padding:56px 60px;display:flex;flex-direction:column;align-items:center;background:#fff;overflow:hidden;font-family:"Noto Sans KR","Malgun Gothic",sans-serif;';
    const printContainer = document.createElement('div');
    printContainer.style.cssText = 'width:794px;background:#fff;';

    let html = `
      <div class="pdf-page${pages.length ? ' pdf-break' : ''}" style="${PAGE}justify-content:center;gap:26px;">
        ${firstImg ? `<img src="data:image/png;base64,${firstImg}" style="width:560px;height:560px;object-fit:cover;border-radius:22px;">` : ''}
        <div style="font-size:34px;font-weight:900;color:#1d2147;text-align:center;line-height:1.3;word-break:keep-all;">${esc(title)}</div>
        <div style="font-size:18px;color:#6b7280;">글·그림 ${esc(author)}</div>
        <div style="font-size:14px;color:#a9853f;font-weight:800;">어른이 동화마을</div>
      </div>`;
    pages.forEach((p, i) => {
      const img = currentStoryBookObject.pages[i]?.imageBase64 || p.imageBase64 || '';
      html += `
      <div class="pdf-page${i < pages.length - 1 ? ' pdf-break' : ''}" style="${PAGE}gap:28px;">
        ${img ? `<img src="data:image/png;base64,${img}" style="width:620px;height:620px;object-fit:cover;border-radius:20px;flex:none;">` : '<div style="height:620px"></div>'}
        <div style="width:620px;font-size:21px;line-height:1.75;color:#1f2937;word-break:keep-all;">${esc(p.full_text || p.text)}</div>
        <div style="margin-top:auto;font-size:13px;color:#9ca3af;">— ${i + 1} —</div>
      </div>`;
    });
    printContainer.innerHTML = html;

    const opt = {
      margin: 0,
      filename: `${title}_${author}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css'], after: '.pdf-break' }
    };
    html2pdf().set(opt).from(printContainer).save();
  }

  function switchTab(tab) {
    const cv = document.getElementById('create-view');
    const lv = document.getElementById('library-view');
    const tbC = document.getElementById('tabCreateBtn');
    const tbL = document.getElementById('tabLibraryBtn');

    if (cv) cv.style.display = tab === 'create' ? 'block' : 'none';
    if (lv) lv.style.display = tab === 'library' ? 'block' : 'none';
    if (tbC) tbC.className = `tab-btn ${tab === 'create' ? 'active' : ''}`;
    if (tbL) tbL.className = `tab-btn ${tab === 'library' ? 'active' : ''}`;
    if (tab === 'library') loadLibraryList();
  }

  function pauseVoice() {
    isSpeechPaused = true;
    if (typeof pauseAiVoice === 'function') pauseAiVoice();
    if (typeof window.speechSynthesis !== 'undefined') {
      try { window.speechSynthesis.pause(); } catch (e) {}
    }
    if (bgmAudio) bgmAudio.pause();
  }

  function resumeVoice() {
    if (!currentStoryBookObject) return;

    if (isPlaying && isSpeechPaused) {
      isSpeechPaused = false;
      if (typeof resumeAiVoice === 'function') resumeAiVoice();
      if (typeof window.speechSynthesis !== 'undefined') {
        try { window.speechSynthesis.resume(); } catch (e) {}
      }
      if (isBgmEnabled && bgmAudio) {
        bgmAudio.volume = currentUtterance ? targetBgmVolume * 0.35 : targetBgmVolume;
        const p = bgmAudio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      return;
    }

    if (!isPlaying && wasStoppedByUser) {
      const pageToResume = Math.max(0, Math.min(
        lastStoppedPageIndex,
        Math.max(0, currentStoryBookObject.pages.length - 1)
      ));
      startContinuousReading(null, pageToResume);
      return;
    }

    if (!isPlaying) {
      startContinuousReading(null, currentPageIndex || 0);
    }
  }

  function stopVoice() {
    lastStoppedPageIndex = currentPageIndex || 0;
    wasStoppedByUser = true;

    isPlaying = false;
    isLibraryPlayingMode = false;
    isSpeechPaused = false;
    speechSessionId += 1;
    safeCancelSpeech();
    if (typeof stopAiVoice === 'function') stopAiVoice();
    stopBgm();
  }
