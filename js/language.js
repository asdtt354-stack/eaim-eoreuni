// EAIM Muni Story Village - Korean + two-level English story module
// English is a language/view mode, not a story genre.

let currentStoryLanguage = 'ko'; // ko | en-preschool | en-child
let showKoreanAlongsideEnglish = false;
let isTranslatingStory = false;

const ENGLISH_LEVELS = {
  preschool: {
    mode: 'en-preschool',
    label: '유아 영어',
    age: '약 4~7세',
    version: 'preschool-easy-v3-short',
    titleKey: 'preschoolEnglishTitle',
    pagesKey: 'preschoolEnglishPages',
    createdAtKey: 'preschoolEnglishCreatedAt',
    versionKey: 'preschoolEnglishVersion'
  },
  child: {
    mode: 'en-child',
    label: '어린이 영어',
    age: '약 7~10세',
    version: 'child-easy-v1',
    titleKey: 'childEnglishTitle',
    pagesKey: 'childEnglishPages',
    createdAtKey: 'childEnglishCreatedAt',
    versionKey: 'childEnglishVersion'
  }
};

function isEnglishStoryMode(mode = currentStoryLanguage) {
  return mode === 'en-preschool' || mode === 'en-child';
}

function getCurrentEnglishLevel(mode = currentStoryLanguage) {
  return mode === 'en-child' ? 'child' : 'preschool';
}

function getEnglishConfig(level = getCurrentEnglishLevel()) {
  return ENGLISH_LEVELS[level] || ENGLISH_LEVELS.preschool;
}

function getEnglishBundle(book, level = getCurrentEnglishLevel()) {
  if (!book) return { title: '', pages: [], version: '' };
  const cfg = getEnglishConfig(level);
  let title = book[cfg.titleKey] || '';
  let pages = Array.isArray(book[cfg.pagesKey]) ? book[cfg.pagesKey] : [];
  let version = book[cfg.versionKey] || '';

  // v17까지의 쉬운 영어는 유아 영어로 자연스럽게 이어받습니다.
  if (level === 'preschool' && (!pages.length || !title)) {
    if (Array.isArray(book.englishPages) && book.englishPages.length) {
      title = title || book.englishTitle || '';
      pages = pages.length ? pages : book.englishPages;
      version = version || book.englishAdaptationVersion || '';
    }
  }
  return { title, pages, version };
}

function getActiveStoryTitle(book = currentStoryBookObject) {
  if (!book) return '';
  if (isEnglishStoryMode()) {
    return getEnglishBundle(book).title || book.title || '';
  }
  return book.title || '';
}

function getActiveStoryPages(book = currentStoryBookObject) {
  if (!book) return [];
  if (isEnglishStoryMode()) {
    const pages = getEnglishBundle(book).pages;
    if (pages.length) return pages;
  }
  return Array.isArray(book.pages) ? book.pages : [];
}

function getSpeechLanguageCode() {
  return isEnglishStoryMode() ? 'en-US' : 'ko-KR';
}

function resetStoryLanguageToKorean(render = true) {
  currentStoryLanguage = 'ko';
  showKoreanAlongsideEnglish = false;
  updateLanguageButtons();
  if (render && currentStoryBookObject) {
    renderBookPages(currentStoryBookObject);
    showPage(Math.min(currentPageIndex, Math.max(0, currentStoryBookObject.pages.length - 1)));
  }
}

function updateLanguageButtons() {
  const koBtn = document.getElementById('langKoBtn');
  const preschoolBtn = document.getElementById('langPreschoolBtn');
  const childBtn = document.getElementById('langChildBtn');
  const transBtn = document.getElementById('showTranslationBtn');
  const status = document.getElementById('translationStatus');

  if (koBtn) koBtn.classList.toggle('active', currentStoryLanguage === 'ko');
  if (preschoolBtn) preschoolBtn.classList.toggle('active', currentStoryLanguage === 'en-preschool');
  if (childBtn) childBtn.classList.toggle('active', currentStoryLanguage === 'en-child');
  if (transBtn) {
    transBtn.style.display = isEnglishStoryMode() ? 'inline-flex' : 'none';
    transBtn.classList.toggle('active', showKoreanAlongsideEnglish);
    transBtn.textContent = showKoreanAlongsideEnglish ? '🇰🇷 해석 숨기기' : '🇰🇷 해석 함께 보기';
  }

  if (status && currentStoryBookObject) {
    if (isEnglishStoryMode()) {
      const level = getCurrentEnglishLevel();
      const cfg = getEnglishConfig(level);
      const bundle = getEnglishBundle(currentStoryBookObject, level);
      const valid = bundle.pages.length === currentStoryBookObject.pages.length && bundle.version === cfg.version;
      status.textContent = valid
        ? `${cfg.label} 버전이 저장되어 있어 바로 들을 수 있어요.`
        : `${cfg.label}(${cfg.age}) 버전을 만들 수 있어요.`;
    } else {
      status.textContent = '한국어 원문';
    }
  }
  try { updateVoiceStatus(); } catch (e) {}
}

async function switchStoryLanguage(lang) {
  if (!currentStoryBookObject) {
    alert('먼저 동화를 만들어 주세요.');
    return;
  }

  if (lang === 'ko') {
    stopVoice();
    currentStoryLanguage = 'ko';
    showKoreanAlongsideEnglish = false;
    updateLanguageButtons();
    renderBookPages(currentStoryBookObject);
    showPage(Math.min(currentPageIndex, currentStoryBookObject.pages.length - 1));
    return;
  }

  if (lang === 'en-preschool' || lang === 'en-child') {
    stopVoice();
    const level = getCurrentEnglishLevel(lang);
    const cfg = getEnglishConfig(level);
    const bundle = getEnglishBundle(currentStoryBookObject, level);
    const needsEnglish =
      !Array.isArray(bundle.pages) ||
      bundle.pages.length !== currentStoryBookObject.pages.length ||
      bundle.version !== cfg.version;

    if (needsEnglish) {
      const ok = await translateCurrentStoryToEnglish(level);
      if (!ok) return;
    }
    currentStoryLanguage = lang;
    updateLanguageButtons();
    renderBookPages(currentStoryBookObject);
    showPage(Math.min(currentPageIndex, currentStoryBookObject.pages.length - 1));
  }
}

function toggleKoreanTranslationView() {
  if (!isEnglishStoryMode() || !currentStoryBookObject) return;
  showKoreanAlongsideEnglish = !showKoreanAlongsideEnglish;
  updateLanguageButtons();
  renderBookPages(currentStoryBookObject);
  showPage(Math.min(currentPageIndex, currentStoryBookObject.pages.length - 1));
}

function showEnglishTranslationOverlay(level = 'preschool') {
  const overlay = document.getElementById('englishTranslationOverlay');
  const title = document.getElementById('englishOverlayTitle');
  const message = document.getElementById('englishOverlayMessage');
  const cfg = getEnglishConfig(level);
  if (title) title.textContent = `${cfg.label} 동화로 바꾸는 중이에요`;
  if (message) {
    message.innerHTML = level === 'preschool'
      ? '아주 짧고 쉬운 영어로 바꾸는 중이에요 ✨<br>천천히 들을 수 있게 준비하고 있어요.'
      : '조금 더 풍부한 어린이 영어로 바꾸는 중이에요 ✨<br>잠시만 기다려 주세요.';
  }
  if (overlay) overlay.classList.add('show');
}

function hideEnglishTranslationOverlay() {
  const overlay = document.getElementById('englishTranslationOverlay');
  if (overlay) overlay.classList.remove('show');
}

function buildEnglishPrompt(level, compactPages) {
  const isPreschool = level === 'preschool';
  const targetRules = isPreschool
    ? `[유아 영어 난이도 - 아주 짧고 직관적으로]\n- 대상: 약 4~7세 한국 어린이, 영어를 처음 듣고 따라 하는 단계.\n- **한 문장은 2~5단어를 기본으로 하고, 최대 6단어를 넘기지 마.**\n- **각 페이지 full_text는 2~3문장만 써.** 정말 필요한 경우에만 4문장까지 허용해.\n- 그림을 보면서 바로 뜻을 짐작할 수 있는 문장만 써.\n- 주어+동사, 짧은 명령문, 감탄문을 많이 사용해. 예: "Bunny runs.", "Look! A seed!", "Come here!"\n- 아주 쉬운 일상 단어를 반복해서 사용해. 어려운 동사·형용사·추상어·관용구는 사용하지 마.\n- 긴 설명은 버리고 **장면의 핵심 행동·사물·감정 하나만** 말해.\n- 원문의 모든 내용을 번역하려 하지 마. 핵심 사건만 남겨 짧게 다시 들려줘.\n- 같은 핵심 단어를 자연스럽게 2~3번 반복해도 좋아.\n- 대사는 1~5단어 정도로 짧고, 아이가 바로 따라 말할 수 있게 해.\n- 의성어·감탄사(Oh!, Wow!, Tap tap!, Splash!)를 자연스럽게 활용해.\n- 소리 내어 읽었을 때 한 페이지가 아주 짧게 끝나야 해.`
    : `[어린이 영어 난이도]\n- 대상: 약 7~10세 한국 어린이, 영어 초급~초중급.\n- 한 문장은 보통 5~10단어 정도로 자연스럽고 명확하게 써.\n- 쉬운 기본 어휘를 중심으로 하되, 이야기 이해에 필요한 표현은 조금 더 풍부하게 써도 돼.\n- 문장이 길어지면 두 문장으로 나눠.\n- 각 페이지 full_text는 가능하면 3~6개의 짧은 문장으로 구성해.\n- 대사는 어린이가 듣고 따라 하기 좋은 자연스러운 영어로 만들어.\n- 유아 영어보다 사건과 감정을 조금 더 자세히 살려.`;

  return `다음 한국어 어린이 동화를 **${isPreschool ? '유아용 Easy English' : '어린이용 Easy English'}** 동화로 다시 써줘.\n\n[가장 중요한 목표]\n- 이것은 문장별 직역이 아니라 **같은 이야기를 영어 수준에 맞게 다시 들려주는 adaptation**이야.\n- 한국어 원문의 핵심 사건과 감정은 유지해.\n- 한국 어린이가 그림을 보며 영어 낭독을 듣는 상황을 가정해.\n- 듣는 시간이 지나치게 길지 않게 하고, 소리 내어 읽었을 때 자연스러워야 해.\n${isPreschool ? '- 유아 영어에서는 **짧음이 가장 중요해. 설명을 줄이고, 그림과 함께 들으면 바로 이해되는 영어만 남겨.**\n- 유아 영어의 목표는 완전한 번역이 아니라 **영어 소리와 핵심 단어에 친숙해지는 것**이야.\n' : ''}\n${targetRules}\n\n[내용 보존 원칙]\n- 원문의 핵심 사건, 인물, 감정, 이야기 순서는 바꾸지 마.\n- 새로운 사건, 인물, 지식, 교훈은 추가하지 마.\n- 과학·수학·음악·역사 내용이 있다면 원문의 의미와 사실 관계를 정확하게 보존해.\n- 역사 인명·지명·핵심 사건은 정확하게 유지해.\n- role과 emotion 값은 절대 번역하거나 바꾸지 마.\n- 페이지 수와 각 페이지의 dialogue_list 항목 수는 원문과 동일하게 유지해.\n- 각 dialogue_list의 text도 해당 연령 수준에 맞는 짧고 쉬운 영어로 바꿔.\n- JSON 이외의 설명은 출력하지 마.\n\n[원문]\n${JSON.stringify({ title: currentStoryBookObject.title, pages: compactPages })}\n\n[출력 JSON]\n{\n  \"title\": \"English title\",\n  \"pages\": [\n    {\n      \"page_num\": 1,\n      \"full_text\": \"English full text\",\n      \"dialogue_list\": [\n        {\"role\":\"narrator\",\"emotion\":\"calm\",\"text\":\"English sentence\"}\n      ]\n    }\n  ]\n}`;
}

async function translateCurrentStoryToEnglish(level = 'preschool') {
  if (!currentStoryBookObject || isTranslatingStory) return false;
  const apiKey = (document.getElementById('apiKey')?.value || '').trim();
  let aiRoute = null;
  if (apiKey && apiKey.length >= 5) {
    aiRoute = { mode: 'key', apiKey };
  } else {
    const trial = await checkTrialReady();
    if (!trial.ok) {
      alert('영어 동화를 만들려면 Google AI Studio API Key가 필요합니다.');
      return false;
    }
    aiRoute = { mode: 'trial' };
  }

  const cfg = getEnglishConfig(level);
  const status = document.getElementById('translationStatus');
  const preschoolBtn = document.getElementById('langPreschoolBtn');
  const childBtn = document.getElementById('langChildBtn');
  isTranslatingStory = true;
  showEnglishTranslationOverlay(level);
  if (preschoolBtn) preschoolBtn.disabled = true;
  if (childBtn) childBtn.disabled = true;
  if (status) status.textContent = `🌐 ${cfg.label} 버전을 만드는 중...`;

  const compactPages = currentStoryBookObject.pages.map((p, i) => ({
    page_num: p.page_num || i + 1,
    full_text: p.full_text || '',
    dialogue_list: (p.dialogue_list || []).map(d => ({
      role: d.role || 'narrator',
      emotion: d.emotion || 'calm',
      text: d.text || ''
    }))
  }));

  const prompt = buildEnglishPrompt(level, compactPages);

  try {
    const data = await callStoryText(aiRoute, prompt, { temperature: 0.25 });
    if (data.error) throw new Error(data.error.message);
    const translated = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    if (!translated.title || !Array.isArray(translated.pages) || translated.pages.length !== currentStoryBookObject.pages.length) {
      throw new Error('영어 페이지 수가 원문과 맞지 않습니다.');
    }

    currentStoryBookObject[cfg.titleKey] = translated.title;
    currentStoryBookObject[cfg.pagesKey] = translated.pages.map((p, i) => ({
      page_num: currentStoryBookObject.pages[i]?.page_num || p.page_num || i + 1,
      full_text: p.full_text || '',
      dialogue_list: Array.isArray(p.dialogue_list) ? p.dialogue_list : [{ role:'narrator', emotion:'calm', text:p.full_text || '' }]
    }));
    currentStoryBookObject[cfg.createdAtKey] = new Date().toISOString();
    currentStoryBookObject[cfg.versionKey] = cfg.version;

    // 유아 영어는 이전 버전 필드에도 복사해 기존 저장 구조와의 호환성을 유지합니다.
    if (level === 'preschool') {
      currentStoryBookObject.englishTitle = currentStoryBookObject[cfg.titleKey];
      currentStoryBookObject.englishPages = currentStoryBookObject[cfg.pagesKey];
      currentStoryBookObject.englishCreatedAt = currentStoryBookObject[cfg.createdAtKey];
      currentStoryBookObject.englishAdaptationVersion = cfg.version;
    }

    if (currentStoryBookObject.id && db) {
      try {
        const tx = db.transaction('books', 'readwrite');
        tx.objectStore('books').put(currentStoryBookObject);
      } catch (e) { console.warn('영어 버전 DB 업데이트:', e); }
    }

    // Google 로그인 상태라면 영어 버전도 같은 클라우드 동화에 즉시 반영합니다.
    if (window.EAIMCloud?.getUser?.() && window.EAIMCloud?.saveStory) {
      try {
        const cloudResult = await window.EAIMCloud.saveStory(currentStoryBookObject);
        if (cloudResult?.cloudId) currentStoryBookObject.cloudId = cloudResult.cloudId;
      } catch (e) { console.warn('영어 버전 클라우드 업데이트:', e); }
    }

    if (!currentStoryBookObject.id) storyUnsaved = true; // 서재에 없는 동화면 나갈 때 알려주기
    if (status) status.textContent = `✅ ${cfg.label} 완성! 이 책에 함께 저장됩니다.`;
    return true;
  } catch (e) {
    console.error(e);
    if (status) status.textContent = `❌ ${cfg.label} 생성에 실패했어요. 다시 눌러 주세요.`;
    alert(`${cfg.label} 생성 중 오류가 발생했습니다: ` + (e.message || e));
    return false;
  } finally {
    hideEnglishTranslationOverlay();
    isTranslatingStory = false;
    if (preschoolBtn) preschoolBtn.disabled = false;
    if (childBtn) childBtn.disabled = false;
  }
}
