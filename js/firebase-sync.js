// 어른이 동화마을 클라우드 마음 서재 (v1.1, 2026-10-06)
// Firebase 프로젝트: eaim-eoreuni (어른이 동화마을 전용 — 뮤니의 동화마을 eaim-kids 와 완전히 따로)
//   마음 서재: eoreuniUsers/{uid}/stories/...   (본인만 읽고 쓰기 — firestore.rules.txt)
//   무료체험:  eoreuniTrials/{uid}               (api/fairytale-trial.js 와 짝)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, deleteDoc, writeBatch
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA4ZlWmeKXF3ojR2e_kegnWy5mwuWAJVHM',
  authDomain: 'eaim-eoreuni.firebaseapp.com',
  projectId: 'eaim-eoreuni',
  storageBucket: 'eaim-eoreuni.firebasestorage.app',
  messagingSenderId: '207221758650',
  appId: '1:207221758650:web:00723df8ac54ee9e288083'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
let currentUser = null;

const USERS_COL = 'eoreuniUsers';
const TRIALS_COL = 'eoreuniTrials';
const IMAGE_CHUNK_SIZE = 650000; // Firestore 문서 1MiB 제한보다 여유 있게 분할

function cleanForFirestore(value) {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(cleanForFirestore);
  if (typeof value === 'object') {
    const out = {};
    for (const [k,v] of Object.entries(value)) {
      if (v !== undefined && k !== 'id' && k !== 'pages') out[k] = cleanForFirestore(v);
    }
    return out;
  }
  return String(value);
}

function makeCloudId(book) {
  if (book?.cloudId) return String(book.cloudId);
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `story_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
}

function splitChunks(text='') {
  const chunks=[];
  for(let i=0;i<text.length;i+=IMAGE_CHUNK_SIZE) chunks.push(text.slice(i,i+IMAGE_CHUNK_SIZE));
  return chunks;
}

async function clearCollection(pathParts) {
  const ref = collection(firestore, ...pathParts);
  const snap = await getDocs(ref);
  let batch = writeBatch(firestore), count=0;
  for (const d of snap.docs) {
    batch.delete(d.ref); count++;
    if (count >= 400) { await batch.commit(); batch=writeBatch(firestore); count=0; }
  }
  if (count) await batch.commit();
}


async function clearStoryPages(uid, cloudId) {
  const pageRef = collection(firestore,USERS_COL,uid,'stories',cloudId,'pages');
  const pageSnap = await getDocs(pageRef);
  for (const pd of pageSnap.docs) {
    await clearCollection([USERS_COL,uid,'stories',cloudId,'pages',pd.id,'imageChunks']);
    await deleteDoc(pd.ref);
  }
}

// 🏡 뮤니마을 — 계정 기준 동화 수 (2026-09-24 변경: "내 서재 = 우리 마을")
// 지금 클라우드 서재에 있는 4페이지 이상 동화만 셉니다. 서재에서 지우면 마을에서도 빠져요.
// (다시 만들기·연습용으로 만들었다 지운 동화가 쌓이지 않게)
// 계산 결과는 users/{uid}/village/progress 에도 적어 둡니다(나중 마을 화면용).
const VILLAGE_MIN_PAGES = 4;
const GENRE_PLACES = {
  fantasy:{name:'마법의 숲',emoji:'🌳',type:'forest'}, heroic:{name:'용기의 성',emoji:'🏰',type:'castle'},
  mystery:{name:'비밀의 골목',emoji:'🔍',type:'town'}, scifi:{name:'별빛 우주정거장',emoji:'🚀',type:'space'},
  animal:{name:'동물 친구 들판',emoji:'🐰',type:'farm'}, comic:{name:'웃음 광장',emoji:'🎪',type:'town'},
  custom:{name:'이야기 언덕',emoji:'📖',type:'town'}
};
function fallbackPlace(genre){ return GENRE_PLACES[genre] || GENRE_PLACES.custom; }
window.villageFallbackPlace = fallbackPlace;

function placeEntry(cloudId, meta){
  const vp = meta.villagePlace || fallbackPlace(meta.genre);
  return { storyId:cloudId, title:String(meta.title||'').slice(0,40), name:vp.name, emoji:vp.emoji, type:vp.type, madeAt:String(meta.updatedAt || meta.createdAt || '') };
}

async function computeVillageProgress(uid){
  const stories=await getDocs(collection(firestore,USERS_COL,uid,'stories'));
  const places=[];
  for (const d of stories.docs){
    const m=d.data()||{};
    if ((m.pageCount||0) >= VILLAGE_MIN_PAGES) places.push(placeEntry(d.id, m));
  }
  places.sort((a,b)=>String(a.madeAt).localeCompare(String(b.madeAt)));
  const data={ storyCount:places.length, places, updatedAt:new Date().toISOString(), rule:'library-only' };
  try { await setDoc(doc(firestore,USERS_COL,uid,'village','progress'), data); } catch(e){ console.log('village cache notice:', e); }
  return data;
}

async function getVillageProgress(){ return { storyCount:0, places:[] }; } // 어른이 동화마을은 마을 게임 없음

// 💾 저장은 한 번에 하나씩(동시에 두 번 저장되면 한쪽이 지운 페이지를 다른 쪽이 못 채워 페이지·그림이 빠지는 일이 있었음)
let saveChain = Promise.resolve();
function saveStory(book) {
  const run = saveChain.then(() => saveStoryNow(book));
  saveChain = run.catch(() => {});
  return run;
}

async function saveStoryNow(book) {
  if (!currentUser) throw new Error('Google 로그인이 필요합니다.');
  const uid=currentUser.uid;
  const isNewStory=!book?.cloudId;
  const cloudId=makeCloudId(book);
  const storyRef=doc(firestore,USERS_COL,uid,'stories',cloudId);

  const meta=cleanForFirestore({ ...book, customBgm: undefined }); // 🎵 제작자 음악 파일은 이 기기에만
  delete meta.pages;
  meta.cloudId=cloudId;
  meta.ownerUid=uid;
  meta.updatedAt=new Date().toISOString();
  meta.pageCount=Array.isArray(book.pages)?book.pages.length:0;
  await setDoc(storyRef, meta, { merge:true });

  // 페이지와 이미지 조각은 별도 문서로 저장해 Firestore 1MiB 문서 제한을 피합니다.
  // 먼저 지우고 다시 쓰지 않고, 제자리에 덮어쓴 뒤 남는 것만 지웁니다(중간에 끊겨도 그림이 통째로 사라지지 않게).
  const pages=Array.isArray(book.pages)?book.pages:[];
  for(let i=0;i<pages.length;i++){
    const p=pages[i] || {};
    const pageId=String(i+1).padStart(3,'0');
    const image=String(p.imageBase64 || '');
    const imageChunks=splitChunks(image);
    for(let c=0;c<imageChunks.length;c++){
      await setDoc(doc(firestore,USERS_COL,uid,'stories',cloudId,'pages',pageId,'imageChunks',String(c).padStart(3,'0')),{
        index:c, data:imageChunks[c]
      });
    }
    const chunkSnap=await getDocs(collection(firestore,USERS_COL,uid,'stories',cloudId,'pages',pageId,'imageChunks'));
    for(const d of chunkSnap.docs){ if(Number(d.id)>=imageChunks.length) await deleteDoc(d.ref); }
    const pageData=cleanForFirestore({...p, imageBase64:undefined, aiVoice:undefined}); // 🎙️ 목소리는 용량이 커서 이 기기에만 저장
    pageData.pageIndex=i;
    pageData.imageChunkCount=imageChunks.length;
    await setDoc(doc(firestore,USERS_COL,uid,'stories',cloudId,'pages',pageId),pageData);
  }
  // 페이지 수가 줄었으면 남는 페이지 정리
  const pageSnap=await getDocs(collection(firestore,USERS_COL,uid,'stories',cloudId,'pages'));
  for(const pd of pageSnap.docs){
    if(Number(pd.id)>pages.length){
      await clearCollection([USERS_COL,uid,'stories',cloudId,'pages',pd.id,'imageChunks']);
      await deleteDoc(pd.ref);
    }
  }
  book.cloudId=cloudId;

  // 🏡 마을 수는 getVillageProgress()가 서재를 보고 다시 셉니다.
  return { cloudId };
}

async function loadOneStory(storyDoc) {
  const uid=currentUser.uid;
  const cloudId=storyDoc.id;
  const meta=storyDoc.data() || {};
  const pageSnap=await getDocs(collection(firestore,USERS_COL,uid,'stories',cloudId,'pages'));
  const pageDocs=[...pageSnap.docs].sort((a,b)=>a.id.localeCompare(b.id));
  const pages=[];
  for(const pd of pageDocs){
    const p={...pd.data()};
    const chunksSnap=await getDocs(collection(firestore,USERS_COL,uid,'stories',cloudId,'pages',pd.id,'imageChunks'));
    const chunks=[...chunksSnap.docs].sort((a,b)=>a.id.localeCompare(b.id)).map(d=>d.data()?.data || '');
    p.imageBase64=chunks.join('');
    if(Number(p.imageChunkCount||0)!==chunks.length) p._incomplete=true; // 그림 조각이 모자람
    delete p.imageChunkCount; delete p.pageIndex;
    pages.push(p);
  }
  // 저장이 중간에 끊긴 책 표시(기기에 온전한 사본이 있으면 그쪽을 씀)
  const incomplete = pages.length < Number(meta.pageCount||0) || pages.some(p=>p._incomplete);
  pages.forEach(p=>delete p._incomplete);
  return {...meta, cloudId, userId:`firebase_${uid}`, pages, _cloudIncomplete: incomplete};
}

async function loadStories() {
  if (!currentUser) return [];
  const snap=await getDocs(collection(firestore,USERS_COL,currentUser.uid,'stories'));
  const stories=[];
  for(const d of snap.docs) stories.push(await loadOneStory(d));
  return stories;
}

async function deleteStory(cloudId) {
  if (!currentUser || !cloudId) return;
  const uid=currentUser.uid;
  const pageSnap=await getDocs(collection(firestore,USERS_COL,uid,'stories',cloudId,'pages'));
  for(const pd of pageSnap.docs){
    await clearCollection([USERS_COL,uid,'stories',cloudId,'pages',pd.id,'imageChunks']);
    await deleteDoc(pd.ref);
  }
  await deleteDoc(doc(firestore,USERS_COL,uid,'stories',cloudId));
}

async function login(){
  return signInWithPopup(auth,provider);
}
async function logout(){ return signOut(auth); }
function getUser(){ return currentUser; }
async function getIdToken(){ return currentUser ? currentUser.getIdToken() : ''; }

// 🎁 무료체험 이용권 상태: 'available' | 'active' | 'used' | 'login'
async function getTrialStatus(){
  if (!currentUser) return { state:'login' };
  try {
    const snap = await getDoc(doc(firestore,TRIALS_COL,currentUser.uid));
    if (!snap.exists()) return { state:'available' };
    const d = snap.data() || {};
    const created = d.createdAt?.toMillis ? d.createdAt.toMillis() : 0;
    const inWindow = Date.now() - created < 29 * 60 * 1000;
    const left = (d.textUsed || 0) < 3;
    return { state: inWindow && left ? 'active' : 'used', textUsed:d.textUsed||0, imagesUsed:d.imagesUsed||0 };
  } catch (e) {
    console.log('trial status notice:', e);
    return { state:'unknown' };
  }
}

window.EAIMCloud={login,logout,getUser,getIdToken,getTrialStatus,getVillageProgress,saveStory,loadStories,deleteStory};
onAuthStateChanged(auth,(user)=>{
  currentUser=user || null;
  window.dispatchEvent(new CustomEvent('eaim-auth-changed',{detail: currentUser ? {
    uid:currentUser.uid, displayName:currentUser.displayName, email:currentUser.email, photoURL:currentUser.photoURL
  } : null}));
});
