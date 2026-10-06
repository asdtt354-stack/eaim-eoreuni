// 🌙 어른이 동화마을 — 어른 동화 고르기·지시문·안전장치 (v1.0, 2026-10-06)
//
// 하는 일
//   - 주인공(선택) · 장르 · 오늘의 마음 · 자리를 칩으로 고릅니다.
//   - 고른 것으로 AI 지시문(buildAdultStoryPrompt)을 만듭니다. app.js 의 generateStoryAndImages() 가 부릅니다.
//   - 위기 신호 안전장치(공통규칙 10-5): ① 앱이 낱말로 먼저 거르고 ② AI 지시문에도 같은 지시를 넣습니다.
//     위기 신호가 보이면 동화를 만들지 않고 109 · 1577-0199 안내 화면을 띄웁니다.
//   - 하루 이야기(dayNote)는 지시문에만 넣고 어디에도 저장하지 않습니다.
//   - 동화 끝 질문(closingQuestion)과 사용자가 남긴 한 줄(reflection)을 동화와 함께 저장합니다.
//   - 어른이 동화마을의 배움동화(learning.js) 함수 이름을 빈 함수로 남겨 app.js 가 그대로 돌아가게 합니다.

// ---------- 고를 거리 ----------
const ADULT_HEROES = {
  young: { label: '시작하는 어른', age: '20대', voice: '조금 가볍고 빠른 호흡' },
  mid:   { label: '한창인 어른',   age: '30대', voice: '따뜻하고 단단한 호흡' },
  deep:  { label: '깊어지는 어른', age: '40대', voice: '깊고 잔잔한 호흡' }
};

const ADULT_MOODS = {
  heavy: [
    { key: '지침', emoji: '🫠', color: '#5b6b8c' }, { key: '서운함', emoji: '🥀', color: '#8a5f73' },
    { key: '외로움', emoji: '🌫️', color: '#5f6f86' }, { key: '불안', emoji: '🌀', color: '#6b5f8c' },
    { key: '미안함', emoji: '🧵', color: '#7a6a55' }, { key: '답답함', emoji: '🧱', color: '#6e6a62' },
    { key: '그리움', emoji: '🕯️', color: '#7d6a4a' }, { key: '그냥 멍함', emoji: '☁️', color: '#7d8494' }
  ],
  bright: [
    { key: '설렘', emoji: '🌷', color: '#b0607a' }, { key: '뿌듯함', emoji: '🏅', color: '#a9853f' },
    { key: '기쁨', emoji: '🌻', color: '#b8892a' }, { key: '고마움', emoji: '💌', color: '#a35f5f' },
    { key: '행복', emoji: '🍀', color: '#4f8a63' }, { key: '편안함', emoji: '🛋️', color: '#5f8a85' },
    { key: '사랑스러움', emoji: '💗', color: '#b0607a' }, { key: '설레는 기대', emoji: '🎈', color: '#6a6fb3' },
    { key: '홀가분함', emoji: '🪁', color: '#4f7fa8' }, { key: '따뜻함', emoji: '☕', color: '#9a6a45' },
    { key: '자신감', emoji: '✨', color: '#8c6fb0' }
  ]
};

const ADULT_PLACES = ['회사', '연애', '가족', '친구', '혼자 있는 밤', '출퇴근길', '나 자신'];

const ADULT_GENRE_LABELS = { comfort: '🕯️ 따뜻한 위로', humor: '😄 유머', fantasy: '🌌 판타지 모험', daily: '☕ 잔잔한 일상', fable: '🦉 반전 우화' };

let adultHero = '';
let adultMood = '';
let adultPlace = '';

function adultMoodInfo(key) {
  return [...ADULT_MOODS.heavy, ...ADULT_MOODS.bright].find(m => m.key === key) || null;
}
function adultMoodIsBright(key) { return ADULT_MOODS.bright.some(m => m.key === key); }

function renderAdultChips() {
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chip = (m) => `<button type="button" class="pick-chip" data-mood="${esc(m.key)}" style="--mc:${m.color}" onclick="pickAdultMood(this)">${m.emoji} ${esc(m.key)}</button>`;
  const h = document.getElementById('moodChipsHeavy'); if (h) h.innerHTML = ADULT_MOODS.heavy.map(chip).join('');
  const b = document.getElementById('moodChipsBright'); if (b) b.innerHTML = ADULT_MOODS.bright.map(chip).join('');
  const p = document.getElementById('placeChips');
  if (p) p.innerHTML = ADULT_PLACES.map(k => `<button type="button" class="pick-chip" data-place="${esc(k)}" onclick="pickAdultPlace(this)">${esc(k)}</button>`).join('');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderAdultChips);
else renderAdultChips();

function toggleChipGroup(selector, btn, current, attr) {
  const key = btn?.dataset?.[attr] || '';
  const next = current === key ? '' : key;
  document.querySelectorAll(selector).forEach(b => b.classList.toggle('active', b.dataset[attr] === next));
  return next;
}
function pickHero(btn) { adultHero = toggleChipGroup('#heroChips .pick-chip', btn, adultHero, 'hero'); }
function pickAdultMood(btn) { adultMood = toggleChipGroup('.mood-chips .pick-chip', btn, adultMood, 'mood'); }
function pickAdultPlace(btn) { adultPlace = toggleChipGroup('#placeChips .pick-chip', btn, adultPlace, 'place'); }
function pickAdultGenre(btn) {
  const key = btn?.dataset?.genre || 'comfort';
  document.querySelectorAll('#genreChips .pick-chip').forEach(b => b.classList.toggle('active', b.dataset.genre === key));
  if (typeof pickGenre === 'function') pickGenre(key);
}

function getAdultSelection() {
  return {
    hero: adultHero,
    mood: adultMood,
    place: adultPlace,
    dayNote: String(document.getElementById('dayNote')?.value || '').trim().slice(0, 200)
  };
}

// ---------- 위기 신호 안전장치 ----------
// 낱말은 넉넉하게 거릅니다(놓치는 것보다 한 번 더 안내하는 쪽이 안전).
const CRISIS_PATTERNS = [
  /죽고\s*싶/, /죽어\s*버리/, /죽을\s*까/, /죽어야\s*겠/, /자살/, /자해/, /극단\s*적\s*선택/,
  /목숨\s*을?\s*끊/, /사라지고\s*싶/, /살고\s*싶지\s*않/, /살기\s*싫/, /그만\s*살/, /뛰어\s*내리/,
  /손목\s*을?\s*긋/, /유서/, /인생\s*을?\s*끝내/, /삶\s*을?\s*끝내/, /다\s*끝내\s*버리/, /세상\s*을?\s*떠나고\s*싶/,
  /없어지고\s*싶/, /태어나지\s*말/, /수면제\s*를?\s*모으/
];
function hasCrisisSignal(text) {
  const t = String(text || '');
  return CRISIS_PATTERNS.some(re => re.test(t));
}
function showCareGate() {
  const g = document.getElementById('careGate');
  if (g) g.style.display = 'grid';
  const note = document.getElementById('dayNote');
  if (note) note.value = ''; // 적은 글은 남기지 않음
}
function closeCareGate() {
  const g = document.getElementById('careGate');
  if (g) g.style.display = 'none';
}

// ---------- 장르 · 화풍 ----------
// 화풍은 뮤니(아이용)와 다른 어른용 그림체: 차분한 수채·과슈, 밤빛, 절제된 색.
const ADULT_ART_BASE = 'painterly illustration for an adult picture book, muted watercolor and gouache textures, soft grain, restrained palette, cinematic quiet composition, realistic adult proportions (not cute, not chibi, not cartoonish)';
const adultGenreGuides = {
  comfort: {
    storyGuide: '따뜻한 위로. 교훈이나 "힘내요" 같은 응원 문구를 넣지 마. 문제를 해결해 주지 않고, 주인공이 그 마음과 함께 잠시 머무르게 해. 끝은 열린 결말에 작은 빛 하나(감각적인 장면)로.',
    artStyle: `${ADULT_ART_BASE}, deep blue night with warm lamp light, gentle melancholic yet warm mood`
  },
  humor: {
    storyGuide: '어른이 피식 웃는 유머. 일상을 엉뚱하게 과장하거나(예: 끝나지 않는 회의의 왕국, 월요일을 먹는 고양이), 재치 있는 말장난과 자기를 놀리는 듯한 유머를 써. 누구를 비하하거나 조롱하지 마. 웃다가 마지막에 살짝 마음이 풀리게.',
    artStyle: `${ADULT_ART_BASE}, witty whimsical editorial illustration, playful exaggeration, soft pastel accents on muted tones`
  },
  fantasy: {
    storyGuide: '은유 판타지 모험. 퇴근길·새벽 같은 일상의 틈에서 다른 세계로 들어가, 그 마음을 닮은 장소와 존재를 만나게 해. 세계는 신비롭되 감정은 현실적으로.',
    artStyle: `${ADULT_ART_BASE}, dreamy surreal night fantasy, deep indigo and soft gold glow, luminous details`
  },
  daily: {
    storyGuide: '잔잔한 일상 동화. 큰 사건 없이 계절·음식·창밖·작은 순간을 그려. 소리·온도·빛 같은 감각 묘사를 살리고, 평범한 하루 속 작은 반짝임을 발견하게.',
    artStyle: `${ADULT_ART_BASE}, calm slice-of-life scene, soft natural light, earthy muted colors`
  },
  fable: {
    storyGuide: '짧은 반전 우화. 동물이나 사물이 주인공이 되어 어른의 하루를 빗대. 마지막 장면에 뼈 있는 한 줄로 반전을 주되, 설교하지 마.',
    artStyle: `${ADULT_ART_BASE}, elegant modern fable illustration, limited palette, graphic shapes, subtle paper texture`
  }
};

function buildAdultStoryPrompt({ genreKey, author, char, pages, minutes }) {
  const sel = getAdultSelection();
  const g = adultGenreGuides[genreKey] || adultGenreGuides.comfort;
  const hero = ADULT_HEROES[sel.hero];
  const moodLine = sel.mood
    ? (adultMoodIsBright(sel.mood)
      ? `${sel.mood} — 나누고 싶은 좋은 마음이야. 이 기분을 축하하고 오래 간직하도록 장면으로 담아 줘. 억지로 슬픈 반전을 넣지 마.`
      : `${sel.mood} — 다독이고 싶은 마음이야. 그 마음을 고치려 하지 말고, 알아봐 주고 곁에 머무르게 해 줘.`)
    : '고르지 않음 — 하루를 보낸 어른이 편히 쉬어 갈 수 있는 이야기로.';

  return `
너는 20~40대 어른이 잠들기 전 듣는 '어른 동화'를 쓰는 작가야.
동화의 말투("~했어요", "~였지요")로 따뜻하게 쓰되, 내용은 어른의 실제 하루에서 가져와.

[먼저 확인]
- 아래 [하루 이야기]에 죽고 싶다는 표현, 자해, 삶을 끝내려는 뜻 같은 위기 신호가 있으면 동화를 쓰지 말고 {"crisis": true} 만 출력해.

[이야기 결]
- 장르: ${ADULT_GENRE_LABELS[genreKey] || '따뜻한 위로'}
- 연출: ${g.storyGuide}

[오늘의 재료]
- 서재 이름(작가): ${author}
- 주인공: ${char ? `${char}` : '이름 있는 평범한 어른(동물·사물이 어울리는 장르면 그래도 좋아)'}${hero ? ` · ${hero.age} 주인공, 말과 호흡은 ${hero.voice}` : ''}
- 오늘의 마음: ${moodLine}
- 이야기 자리: ${sel.place || '자유롭게'}
- 하루 이야기: ${sel.dayNote ? `"${sel.dayNote.replace(/["\n\r]/g, ' ')}" — 그대로 옮기지 말고 은유와 장면으로 바꿔서 "내 얘기인데 내 얘기가 아닌" 거리를 지켜. 실명·회사 이름·지명은 쓰지 마.` : '없음'}

[이야기 원칙]
1. 반드시 정확히 ${pages}페이지(약 ${minutes}분 낭독)로 써. pages 배열 항목 수는 정확히 ${pages}개.
2. 마음을 물건이나 장면으로 바꿔 보여 줘(예: 삼킨 말 = 구겨진 종이, 미안함 = 옷깃의 단추).
3. 소리·온도·빛 같은 감각 묘사를 쓰고, 소리 내어 읽기 좋게 짧은 문장으로.
4. "힘내요", "괜찮아질 거예요" 같은 직접적인 응원·교훈 문장은 쓰지 마. 치유·상담·심리 치료라는 말도 쓰지 마.
5. 결말은 다 해결하지 않아도 돼. 내일 할 수 있는 아주 작은 행동 하나나, 작은 빛 하나로 끝내.
6. 성경·경전·실존 종교 인물이나 종교 사건을 중심 소재로 삼지 마. 실존 인물을 지어내지 마.
7. 폭력·성적인 묘사, 특정 집단을 비하하는 표현은 쓰지 마.
8. closing_question에는 동화를 다 들은 사람에게 건네는 질문 한 줄을 적어(예: "오늘 당신의 코트에는 어떤 얼룩이 묻어 있나요?"). 이야기 속 상징을 이용하고, 답하기 쉽게.

[대본 규칙]
- dialogue_list 의 role 은 "narrator"(해설) 또는 "hero"(주인공·등장인물 대사) 두 가지만.
- emotion 은 "calm", "whisper", "happy", "curious", "excited" 중에서. 대부분 calm.
- full_text 에는 그 페이지 본문 전체.
- character_sheet 에는 두 페이지 이상 나오는 인물(사람·동물·사물)을 모두 적고, look 에 매번 똑같이 그릴 영문 외모 설명(나이대·머리·옷·소품·색)을 구체적으로.
- image_prompt 는 그 페이지의 가장 중요한 한 순간을 영어로. 그 장면에 있는 인물만 character_sheet 이름으로 적고, 화풍('${g.artStyle}')을 반영해. 그림 속 글자는 없게.

[출력 규격: 순수 JSON만]
{
  "title": "동화 제목",
  "closing_question": "마지막 질문 한 줄",
  "character_sheet": [ { "name": "Jisu", "look": "a woman in her thirties with a shoulder-length bob, beige trench coat, worn black shoes" } ],
  "pages": [
    {
      "page_num": 1,
      "full_text": "본문",
      "dialogue_list": [
        { "role": "narrator", "emotion": "calm", "text": "문장..." },
        { "role": "hero", "emotion": "whisper", "text": "대사..." }
      ],
      "image_prompt": "English scene description, ${g.artStyle}"
    }
  ]
}
`;
}

// ---------- 동화 끝 질문과 한 줄 답 ----------
function renderClosingBox(book) {
  const box = document.getElementById('closingBox');
  const badge = document.getElementById('moodBadge');
  if (badge) {
    const m = book && book.mood ? adultMoodInfo(book.mood.mood) : null;
    if (m || (book && book.genre && ADULT_GENRE_LABELS[book.genre])) {
      badge.textContent = [m ? `${m.emoji} 그날의 마음: ${m.key}` : '', ADULT_GENRE_LABELS[book.genre] || ''].filter(Boolean).join(' · ');
      badge.style.display = 'inline-block';
    } else badge.style.display = 'none';
  }
  if (!box) return;
  const q = book && book.closingQuestion;
  if (!q || book.isLibraryBook) { box.style.display = q ? 'block' : 'none'; if (q) box.innerHTML = `<p class="closing-q">🌙 ${escAdult(q)}</p>`; return; }
  box.style.display = 'block';
  box.innerHTML = `
    <p class="closing-q">🌙 ${escAdult(q)}</p>
    <textarea id="reflectionInput" rows="2" maxlength="300" placeholder="한 줄로 남겨 보세요 (마음 서재에 함께 저장돼요)">${escAdult(book.reflection || '')}</textarea>
    <div class="closing-actions">
      <button type="button" onclick="saveReflection()">💾 한 줄 남기기</button>
      <span class="closing-saved" id="reflectionSaved">${book.reflection ? '남겨 둔 한 줄이 있어요.' : ''}</span>
    </div>`;
}
window.renderClosingBox = renderClosingBox;

function escAdult(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function saveReflection() {
  if (typeof currentStoryBookObject === 'undefined' || !currentStoryBookObject) return;
  const v = String(document.getElementById('reflectionInput')?.value || '').trim().slice(0, 300);
  if (hasCrisisSignal(v)) { showCareGate(); return; }
  currentStoryBookObject.reflection = v;
  storyUnsaved = true;
  await saveCurrentStoryToDB({ silent: true });
  const el = document.getElementById('reflectionSaved');
  if (el) el.textContent = v ? '✅ 마음 서재에 남겼어요.' : '지웠어요.';
}

// ---------- 서재 목록 표시 ----------
function storyPurposeLabel(_purpose, _mode, book) {
  return ADULT_GENRE_LABELS[book?.genre] || '🌙 어른 동화';
}

// ---------- 어른이 동화마을 배움동화 함수 자리(쓰지 않음) ----------
function getLearningSelection() { return { purpose: 'story', mode: 'general', topic: '' }; }
function buildLearningPromptBlock() { return ''; }
function setStoryPurpose() {}
function handleLearningModeChange() {}
function setLearningTopicFromSaved() {}
