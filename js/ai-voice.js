// 🎙️ 어른이 동화마을 — AI 성우 목소리 (Gemini TTS, 어른이 동화마을 엔진을 복사해 씀)
// - 동화를 만들 때 페이지마다 한 번만 목소리를 만들고, 서재(이 기기)에 함께 저장합니다.
// - 다시 듣기·반복·녹화는 저장된 소리를 재생하므로 추가 비용이 없습니다.
// - 내 키가 있으면 내 키로(보호자 결제), 없으면 무료체험 서버로 만듭니다.
// - 한 페이지 = 요청 1번. 해설자(Narrator)와 등장인물(Character) 두 목소리로 읽습니다.

const AI_TTS_MODEL = 'gemini-2.5-flash-preview-tts'; // 공통규칙 6-2 (서버 api/fairytale-trial.js 와 같게)
// 기본 모델이 없어졌거나(404) 이 키에서 쓸 수 없을 때 한 번 더 시도할 새 음성 모델 (공식 문서 2026-04 공개)
const AI_TTS_FALLBACK_MODEL = 'gemini-3.1-flash-tts-preview';
const AI_VOICES = {
  dynamic_theater: { narrator: 'Sulafat', character: 'Achird' },    // 따뜻한 해설 + 친근한 등장인물
  bedtime_calm:    { narrator: 'Gacrux', character: 'Sulafat' }      // 낮고 차분한 어른 해설 (기본)
};
const AI_VOICE_WON_PER_MINUTE = 21; // 오디오 1분 ≈ 1,500토큰 × $10/1M ≈ $0.015 ≈ 21원 (대략)

let aiVoicePlayer = null;
let aiVoiceUrl = '';
let aiVoiceStopper = null;

function aiVoiceEnabledByUser() {
  return !!document.getElementById('aiVoiceToggle')?.checked;
}

function estimateVoiceWon(minutes) {
  return Math.max(10, Math.round((Number(minutes) || 3) * AI_VOICE_WON_PER_MINUTE / 10) * 10);
}

function updateAiVoiceCostLabel() {
  const el = document.getElementById('aiVoiceCost');
  if (!el) return;
  const minutes = document.getElementById('storyLength')?.value || '3';
  el.textContent = `약 ${estimateVoiceWon(minutes)}원`;
}
document.addEventListener('change', (e) => { if (e.target && e.target.id === 'storyLength') updateAiVoiceCostLabel(); });
document.addEventListener('DOMContentLoaded', updateAiVoiceCostLabel);

// ---------- 대본 만들기 ----------
function buildPageVoiceScript(page, titleText) {
  const lines = [];
  if (titleText) lines.push({ role: 'narrator', text: `제목: ${titleText}` });
  const src = Array.isArray(page.dialogue_list) && page.dialogue_list.length
    ? page.dialogue_list
    : [{ role: 'narrator', text: page.full_text || '' }];
  for (const d of src) {
    const text = String(d.text || '').replace(/[*#"]/g, '').trim();
    if (text) lines.push({ role: d.role || 'narrator', text });
  }
  const speakerOf = (role) => (role === 'narrator' ? 'Narrator' : 'Character');
  const speakers = new Set(lines.map(l => speakerOf(l.role)));
  // 읽기용 대본에서만 ㄱ→기역, ㄴ→니은 … 으로 바꿔 보낸다(자막은 원래 글자 그대로)
  const say = (typeof speakableKorean === 'function') ? speakableKorean : (x => x);
  const script = lines.map(l => `${speakerOf(l.role)}: ${say(l.text)}`).join('\n');
  return { lines, speakers, script };
}

function buildTtsPrompt(script, styleMode) {
  const style = styleMode === 'bedtime_calm'
    ? '잠들기 전 듣는 라디오처럼 낮고 차분하게, 문장 사이에 여유를 두고 느리게 읽어 주세요.'
    : '오디오북처럼 생동감 있게, 그러나 과장하지 말고 자연스럽게 읽어 주세요.';
  return `20~40대 어른을 위한 한국어 오디오 동화를 읽어 주세요. Narrator는 차분한 이야기꾼, Character는 동화 속 등장인물(어른, 동물, 사물)이에요. 아이에게 말하듯 높고 들뜬 목소리는 쓰지 마세요. ${style}\n\n${script}`;
}

// ---------- 요청 ----------
async function requestPageVoice(aiRoute, prompt, speakers, voiceSet) {
  const voices = [];
  if (speakers.has('Narrator')) voices.push({ speaker: 'Narrator', voiceName: voiceSet.narrator });
  if (speakers.has('Character')) voices.push({ speaker: 'Character', voiceName: voiceSet.character });

  const callOnce = async (model) => {
    let data;
    if (aiRoute.mode === 'trial') {
      data = await callTrialServer({ action: 'tts', text: prompt, voices });
    } else {
      const speechConfig = voices.length > 1
        ? { multiSpeakerVoiceConfig: { speakerVoiceConfigs: voices.map(v => ({ speaker: v.speaker, voiceConfig: { prebuiltVoiceConfig: { voiceName: v.voiceName } } })) } }
        : { voiceConfig: { prebuiltVoiceConfig: { voiceName: voices[0].voiceName } } };
      const res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(aiRoute.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig }
        })
      });
      data = await res.json().catch(() => ({ error: { message: `응답을 읽지 못했어요 (${res.status})`, code: res.status } }));
    }
    if (data?.error) { const e = new Error(data.error.message || '목소리를 만들지 못했어요.'); e.code = data.error.code; throw e; }
    const part = (data?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data);
    if (!part) { const e = new Error(`목소리 데이터가 없어요 (${data?.candidates?.[0]?.finishReason || '이유 모름'})`); e.noAudio = true; throw e; }
    const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1] || 24000);
    return pcmBase64ToWavBlob(part.inlineData.data, rate);
  };

  try {
    return await callOnce(AI_TTS_MODEL);
  } catch (e) {
    // 음성 모델이 가끔 소리 대신 글만 돌려주는 경우 → 한 번 더
    if (e.noAudio) { try { return await callOnce(AI_TTS_MODEL); } catch (e2) { e = e2; } }
    // 모델이 없어졌거나 쓸 수 없는 경우 → 새 모델로 한 번
    if (aiRoute.mode !== 'trial' && (e.code === 404 || /not found|not supported|is not available|deprecated/i.test(e.message))) {
      console.warn('TTS model fallback:', e.message);
      return await callOnce(AI_TTS_FALLBACK_MODEL);
    }
    throw e;
  }
}

function pcmBase64ToWavBlob(b64, sampleRate) {
  const bin = atob(b64);
  const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  writeStr(36, 'data'); v.setUint32(40, pcm.length, true);
  return new Blob([header, pcm], { type: 'audio/wav' });
}

// ---------- 동화 전체에 목소리 입히기 ----------
// 목소리를 새로 만들어야 하는 페이지: 목소리가 없거나, 자음·모음 글자(ㄱ, ㄴ…)가 있는데 예전 방식(그, 느…)으로 읽은 목소리
function pageNeedsVoice(page) {
  if (!page?.aiVoice?.blob) return true;
  const text = [page.full_text, ...(page.dialogue_list || []).map(d => d.text)].join(' ');
  return (typeof hasHangulJamo === 'function' && hasHangulJamo(text)) && !page.aiVoice.jamoOk;
}

async function generateVoiceForStory(aiRoute, book, onProgress, opts = {}) {
  if (!book || !Array.isArray(book.pages)) return { done: 0, failed: 0 };
  const styleMode = document.getElementById('actingStyle')?.value || 'dynamic_theater';
  const voiceSet = AI_VOICES[styleMode] || AI_VOICES.dynamic_theater;
  let done = 0, failed = 0, firstError = '';
  for (let i = 0; i < book.pages.length; i++) {
    const page = book.pages[i];
    if (opts.onlyMissing && !pageNeedsVoice(page)) continue;   // 이미 괜찮은 목소리가 있는 페이지는 건너뛰기
    if (onProgress) onProgress(i, book.pages.length);
    const { lines, speakers, script } = buildPageVoiceScript(page, i === 0 ? book.title : '');
    if (!lines.length) continue;
    try {
      const blob = await requestPageVoice(aiRoute, buildTtsPrompt(script, styleMode), speakers, voiceSet);
      page.aiVoice = { blob, lines, lang: 'ko', style: styleMode, voices: voiceSet, model: AI_TTS_MODEL, jamoOk: true };
      done++;
    } catch (e) {
      console.error(`Page ${i + 1} voice error:`, e);
      failed++;
      if (!firstError) firstError = e.message || String(e);
      if (aiRoute.mode === 'trial' && /사용|모두/.test(e.message)) break;
    }
  }
  book.hasAiVoice = book.pages.some(p => p.aiVoice?.blob);
  return { done, failed, firstError };
}

// 이미 만든 동화(서재에서 연 동화 포함)에 목소리 입히기 버튼
async function addAiVoiceToCurrentStory(btn) {
  if (!currentStoryBookObject?.pages?.length) { alert('먼저 동화를 만들거나 서재에서 열어주세요.'); return; }
  if (!isGuardianConfirmed()) { showGuardianGate(); return; }
  const apiKey = (document.getElementById('apiKey')?.value || '').trim();
  let aiRoute;
  if (apiKey.length >= 5) aiRoute = { mode: 'key', apiKey };
  else {
    const trial = await checkTrialReady();
    if (!trial.ok) { alert('AI 성우 목소리를 만들려면 API 키가 필요해요.'); return; }
    aiRoute = { mode: 'trial' };
  }
  const missingCount = currentStoryBookObject.pages.filter(pageNeedsVoice).length;
  const onlyMissing = missingCount > 0 && missingCount < currentStoryBookObject.pages.length;
  const minutes = Math.max(1, Math.round((onlyMissing ? missingCount : currentStoryBookObject.pages.length) / 2));
  if (aiRoute.mode === 'key' && !confirm(`🎙️ AI 성우 목소리를 만들까요?\n내 API 키로 결제돼요 (약 ${estimateVoiceWon(minutes)}원).\n한 번 만들면 다시 들을 때는 비용이 들지 않아요.`)) return;

  stopVoice();
  const old = btn ? btn.textContent : '';
  if (btn) btn.disabled = true;
  const r = await generateVoiceForStory(aiRoute, currentStoryBookObject, (i, n) => { if (btn) btn.textContent = `🎙️ 목소리 녹음 중... ${i + 1}/${n}`; }, { onlyMissing });
  if (btn) { btn.disabled = false; btn.textContent = old; }
  updateAiVoiceButton();
  if (aiRoute.mode === 'trial') refreshTrialStatus();
  if (r.done) {
    if (currentStoryBookObject.id) await saveCurrentStoryToDB({ silent: true, localOnly: true });
    else storyUnsaved = true;
  }
  const why = r.firstError ? `\n\n[이유] ${r.firstError}` : '';
  alert(r.done ? `🎉 ${r.done}페이지에 AI 성우 목소리를 입혔어요!${r.failed ? `\n(${r.failed}페이지는 실패해서 기본 음성으로 읽어요)${why}` : ''}${currentStoryBookObject.id ? '' : '\n💾 서재에 저장하면 목소리도 함께 보관돼요.'}` : `⚠️ 목소리를 만들지 못했어요. 잠시 후 다시 시도해 주세요.${why}`);
}

function updateAiVoiceButton() {
  const btn = document.getElementById('aiVoiceAddBtn');
  if (!btn) return;
  const pages = currentStoryBookObject?.pages || [];
  const has = pages.some(p => p.aiVoice?.blob);
  const missing = pages.filter(pageNeedsVoice).length;
  // 목소리가 없거나, 일부 페이지가 빠졌거나 고칠 페이지가 있을 때 버튼을 보여 준다
  btn.style.display = currentStoryBookObject && missing > 0 ? '' : 'none';
  btn.textContent = has && missing > 0 ? `🎙️ ${missing}페이지 AI 성우 목소리 채우기·고치기` : '🎙️ AI 성우 목소리 입히기';
  const badge = document.getElementById('aiVoiceBadge');
  if (badge) badge.style.display = has ? '' : 'none';
}

// ---------- 재생 ----------
function hasAiVoice(pageIndex) {
  if (typeof isEnglishStoryMode === 'function' && isEnglishStoryMode()) return false;
  return !!currentStoryBookObject?.pages?.[pageIndex]?.aiVoice?.blob;
}

function getAiVoicePlayer() {
  if (!aiVoicePlayer) {
    aiVoicePlayer = new Audio();
    aiVoicePlayer.preload = 'auto';
    aiVoicePlayer.playsInline = true;
  }
  return aiVoicePlayer;
}

// 버튼을 누른 순간 한 번 재생 권한을 열어둡니다(모바일 자동재생 제한 대비).
function unlockAiVoicePlayer() {
  const p = getAiVoicePlayer();
  try {
    p.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
    const r = p.play();
    if (r && r.catch) r.catch(() => {});
  } catch (e) {}
}

function playPageAiVoice(pageIndex, sessionId) {
  return new Promise((resolve) => {
    const voice = currentStoryBookObject?.pages?.[pageIndex]?.aiVoice;
    if (!voice?.blob) { resolve(false); return; }
    const player = getAiVoicePlayer();
    if (aiVoiceUrl) URL.revokeObjectURL(aiVoiceUrl);
    aiVoiceUrl = URL.createObjectURL(voice.blob);

    // 자막: 글자 수 비율로 줄마다 시간을 나눕니다.
    const weights = voice.lines.map(l => l.text.length + 6);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let shownLine = -1;
    const showLine = (i) => {
      if (i === shownLine || !voice.lines[i]) return;
      shownLine = i;
      if (typeof window.onStoryLine === 'function') window.onStoryLine(voice.lines[i].role, voice.lines[i].text);
    };

    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      clearInterval(watch);
      player.ontimeupdate = null; player.onended = null; player.onerror = null;
      aiVoiceStopper = null;
      if (isBgmEnabled && bgmAudio && !bgmAudio.paused) bgmAudio.volume = getCurrentBgmSelection().volume;
      resolve(ok);
    };
    aiVoiceStopper = () => { try { player.pause(); } catch (e) {} finish(false); };

    player.ontimeupdate = () => {
      if (!player.duration || !isFinite(player.duration)) return;
      const t = player.currentTime / player.duration * total;
      let acc = 0;
      for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (t < acc) { showLine(i); break; } }
    };
    player.onended = () => finish(true);
    player.onerror = () => finish(false);
    // ⏱️ 멈춤 감시: 재생 중인데 소리가 5초 넘게 앞으로 가지 않으면(브라우저가 소리를 멈춘 경우) 다음으로 넘어간다
    let lastT = -1, stuckMs = 0;
    const watch = setInterval(() => {
      if (!isPlaying || sessionId !== speechSessionId) { try { player.pause(); } catch (e) {} finish(false); return; }
      if (player.paused) { stuckMs = 0; return; }            // 일시정지 중에는 기다림
      if (player.currentTime === lastT) stuckMs += 300; else { stuckMs = 0; lastT = player.currentTime; }
      const dur = player.duration;
      const overrun = dur && isFinite(dur) && player.currentTime >= dur - 0.05;
      if (stuckMs >= 5000 || (overrun && stuckMs >= 900)) {
        console.warn('AI voice stalled on page', pageIndex, '— moving on');
        try { player.pause(); } catch (e) {}
        finish(true);
      }
    }, 300);

    if (isBgmEnabled && bgmAudio && !bgmAudio.paused) bgmAudio.volume = getCurrentBgmSelection().volume * 0.55;
    player.src = aiVoiceUrl;
    showLine(0);
    const p = player.play();
    if (p && p.catch) p.catch(() => finish(false));
  });
}

function pauseAiVoice() { if (aiVoicePlayer && !aiVoicePlayer.paused) aiVoicePlayer.pause(); }
function resumeAiVoice() { if (aiVoicePlayer && aiVoiceStopper && aiVoicePlayer.paused) { const p = aiVoicePlayer.play(); if (p && p.catch) p.catch(() => {}); } }
function stopAiVoice() { if (aiVoiceStopper) aiVoiceStopper(); }
