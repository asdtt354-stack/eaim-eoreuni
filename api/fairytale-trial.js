// api/fairytale-trial.js — 어른이 동화마을 무료체험 중계 함수 (v1.0, 2026-10-06 — 뮤니의 동화마을 v1.1 을 복사)
// ※ 이용권은 eoreuniTrials/{uid} 에 셉니다(동화마을 trials/{uid} 와 따로). 환경변수 이름은 동화마을과 같지만 이 Vercel 프로젝트에 따로 넣습니다.
//
// 하는 일
//   - 무료체험 1회분(짧은 동화 1편)을 운영자 키로 대신 만들어 줍니다. 키는 서버 환경변수에만 있습니다.
//   - "이용권"은 Firestore trials/{uid} 문서로 셉니다. 문서는 사용자 본인 토큰으로만 쓰이고,
//     보안 규칙이 "처음 만들기 + 숫자 올리기"만 허용하므로 사용자가 되돌릴 수 없습니다.
//   - 따라서 Firestore 쓰기가 성공해야만 Gemini를 부릅니다. (위조 토큰이면 쓰기가 실패 → 호출 안 함)
//   - 나중에 유료화하면 같은 구조에서 "이용권 충전"만 더하면 됩니다(그때는 서버 전용 인증 필요).
//
// Vercel 환경변수
//   FAIRYTALE_TRIAL_KEY        (필수) 운영자 서버용 Gemini 키 — API 제한 + 하루 한도만, 웹사이트 제한 X
//   FAIRYTALE_TRIAL_UNTIL      (선택) 체험 마감일 예: 2026-12-31  (지나면 체험 닫힘)
//   FAIRYTALE_ALLOWED_ORIGINS  (선택) 허용 주소, 쉼표 구분. 비우면 "같은 주소에서 온 요청"만 허용
//   FIREBASE_PROJECT_ID        (선택) 기본값 eaim-kids

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'eaim-kids';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const MODELS = { text: 'gemini-flash-latest', image: 'gemini-3.1-flash-image', tts: 'gemini-2.5-flash-preview-tts' }; // 공통규칙 6-2 (js/app.js, js/ai-voice.js 와 같게)
const MAX_BODY_CHARS = 3500000; // Vercel 요청 한도(4.5MB)보다 여유 있게

function trialEnabled() {
  if (!process.env.FAIRYTALE_TRIAL_KEY) return false;
  const until = process.env.FAIRYTALE_TRIAL_UNTIL;
  if (until && Date.now() > new Date(`${until}T23:59:59+09:00`).getTime()) return false;
  return true;
}

function originAllowed(req) {
  const origin = req.headers.origin || '';
  if (!origin) return false;
  const list = (process.env.FAIRYTALE_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (list.length) return list.includes(origin);
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return origin === `https://${host}` || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function uidFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.user_id || payload.sub || '';
  } catch (e) { return ''; }
}

async function fsGetTrial(uid, token) {
  const r = await fetch(`${FS_BASE}/eoreuniTrials/${uid}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw Object.assign(new Error('login'), { code: r.status });
  const doc = await r.json();
  const f = doc.fields || {};
  return {
    createdAt: f.createdAt?.timestampValue ? new Date(f.createdAt.timestampValue).getTime() : 0,
    textUsed: Number(f.textUsed?.integerValue || 0),
    imagesUsed: Number(f.imagesUsed?.integerValue || 0)
  };
}

async function fsCommit(token, writes) {
  const r = await fetch(`${FS_BASE.replace(/\/documents$/, '')}/documents:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes })
  });
  return r.ok;
}

function docName(uid) {
  return `projects/${PROJECT}/databases/(default)/documents/eoreuniTrials/${uid}`;
}

// 이용권 한 칸 쓰기. 보안 규칙이 한도·시간(30분)을 최종 판정합니다.
async function useTicket(uid, token, kind) {
  const field = kind === 'text' ? 'textUsed' : kind === 'tts' ? 'ttsUsed' : 'imagesUsed';
  if (kind === 'text') {
    const existing = await fsGetTrial(uid, token);
    if (!existing) {
      return fsCommit(token, [{
        update: {
          name: docName(uid),
          fields: { textUsed: { integerValue: '1' }, imagesUsed: { integerValue: '0' }, ttsUsed: { integerValue: '0' }, pages: { integerValue: '4' } }
        },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false }
      }]);
    }
  }
  return fsCommit(token, [{
    transform: { document: docName(uid), fieldTransforms: [{ fieldPath: field, increment: { integerValue: '1' } }] },
    currentDocument: { exists: true }
  }]);
}

async function callGemini(model, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.FAIRYTALE_TRIAL_KEY },
      body: JSON.stringify(body)
    });
    if ((r.status === 503 || r.status === 429) && attempt === 0) {
      await new Promise(res => setTimeout(res, 1500));
      continue;
    }
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요.' });
  if (!originAllowed(req)) return res.status(403).json({ error: '허용되지 않은 주소에서 온 요청이에요.' });

  const body = req.body || {};
  if (body.action === 'config') return res.status(200).json({ enabled: trialEnabled() });
  if (!trialEnabled()) return res.status(403).json({ error: '지금은 무료체험을 운영하지 않아요.' });

  const token = String(body.idToken || '');
  const uid = uidFromToken(token);
  if (!uid) return res.status(401).json({ error: 'Google 로그인이 필요해요.' });

  try {
    if (body.action === 'text') {
      const prompt = String(body.prompt || '');
      if (!prompt || prompt.length > 20000) return res.status(400).json({ error: '요청 내용이 올바르지 않아요.' });
      if (!(await useTicket(uid, token, 'text'))) {
        return res.status(403).json({ error: '무료체험을 이미 사용했어요. 내 API 키를 넣으면 계속 만들 수 있어요.', used: true });
      }
      const genCfg = { responseMimeType: 'application/json', maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } };
      const t = Number(body.temperature);
      if (Number.isFinite(t) && t >= 0 && t <= 1.5) genCfg.temperature = t;
      const out = await callGemini(MODELS.text, { contents: [{ parts: [{ text: prompt }] }], generationConfig: genCfg });
      return res.status(out.status).json(out.data);
    }

    if (body.action === 'image') {
      const parts = Array.isArray(body.parts) ? body.parts : [];
      const size = JSON.stringify(parts).length;
      const okShape = parts.length > 0 && parts.length <= 12 && parts.every(p =>
        (typeof p.text === 'string' && p.text.length < 6000) ||
        (p.inlineData && /^image\/(jpeg|png|webp)$/.test(p.inlineData.mimeType) && typeof p.inlineData.data === 'string'));
      if (!okShape || size > MAX_BODY_CHARS) return res.status(400).json({ error: '그림 요청 내용이 올바르지 않아요.' });
      if (!(await useTicket(uid, token, 'image'))) {
        return res.status(403).json({ error: '무료체험 그림 수를 모두 썼어요.', used: true });
      }
      const imgCfg = { responseModalities: ['TEXT', 'IMAGE'] };
      if (['16:9', '1:1'].includes(body.aspectRatio)) imgCfg.imageConfig = { aspectRatio: body.aspectRatio }; // 동화 삽화는 16:9
      const out = await callGemini(MODELS.image, {
        contents: [{ parts }],
        generationConfig: imgCfg
      });
      return res.status(out.status).json(out.data);
    }

    if (body.action === 'tts') {
      const text = String(body.text || '');
      const voices = Array.isArray(body.voices) ? body.voices : [];
      const okVoices = voices.length >= 1 && voices.length <= 2 && voices.every(v =>
        ['Narrator', 'Character'].includes(v.speaker) && /^[A-Z][a-z]{2,20}$/.test(v.voiceName || ''));
      if (!text || text.length > 5000 || !okVoices) return res.status(400).json({ error: '목소리 요청 내용이 올바르지 않아요.' });
      if (!(await useTicket(uid, token, 'tts'))) {
        return res.status(403).json({ error: '무료체험 목소리를 모두 사용했어요.', used: true });
      }
      const speechConfig = voices.length > 1
        ? { multiSpeakerVoiceConfig: { speakerVoiceConfigs: voices.map(v => ({ speaker: v.speaker, voiceConfig: { prebuiltVoiceConfig: { voiceName: v.voiceName } } })) } }
        : { voiceConfig: { prebuiltVoiceConfig: { voiceName: voices[0].voiceName } } };
      const out = await callGemini(MODELS.tts, {
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig }
      });
      return res.status(out.status).json(out.data);
    }

    return res.status(400).json({ error: '알 수 없는 요청이에요.' });
  } catch (e) {
    if (e.code === 401 || e.code === 403) return res.status(401).json({ error: '로그인이 만료됐어요. 다시 로그인해 주세요.' });
    console.error('eoreuni-trial error:', e);
    return res.status(500).json({ error: '잠시 후 다시 시도해 주세요.' });
  }
};
