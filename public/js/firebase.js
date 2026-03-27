'use strict';

// ═══════════════════════════════ FIREBASE ═══════════════════════════════
// Safe init — works even if Firebase SDK scripts fail to load
const FIREBASE_OK = typeof firebase !== 'undefined';
let auth = null, db = null;

if(FIREBASE_OK){
  firebase.initializeApp({
    apiKey: "AIzaSyBaYgIuST-dXM-bUwwVrzA8ZT2kfN24BlM",
    authDomain: "methode-lafay-c0041.firebaseapp.com",
    projectId: "methode-lafay-c0041",
    storageBucket: "methode-lafay-c0041.firebasestorage.app",
    messagingSenderId: "1007635668637",
    appId: "1:1007635668637:web:4450dc3b55f62ec136fe74",
  });
  auth = firebase.auth();
  db = firebase.firestore();
  db.enablePersistence({synchronizeTabs:true}).catch(()=>{});
}

const SYNC_KEYS = ['lf2_mode','lf2_profile_m','lf2_profile_f','lf2_sessions','lf2_targets','lf2_test','lf2_prs'];
let syncUser = null;
let syncStatus = 'offline';
let syncListener = null;

function userDocRef(){
  if(!syncUser||!db) return null;
  return db.collection('users').doc(syncUser.uid);
}

async function pushToCloud(){
  const ref = userDocRef(); if(!ref) return;
  syncStatus='syncing'; renderSyncBadge();
  try {
    const data = {};
    SYNC_KEYS.forEach(k => { const v=localStorage.getItem(k); if(v) data[k]=v; });
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    data.email = syncUser.email || '';
    await ref.set(data, {merge:true});
    syncStatus='synced'; renderSyncBadge();
  } catch(e) { console.error('Push error:',e); syncStatus='error'; renderSyncBadge(); }
}

async function pullFromCloud(){
  const ref = userDocRef(); if(!ref) return false;
  syncStatus='syncing'; renderSyncBadge();
  try {
    const snap = await ref.get();
    if(snap.exists){
      const data = snap.data();
      SYNC_KEYS.forEach(k => { if(data[k]) localStorage.setItem(k, data[k]); });
      syncStatus='synced'; renderSyncBadge();
      return true;
    }
    syncStatus='synced'; renderSyncBadge();
    return false;
  } catch(e) { console.error('Pull error:',e); syncStatus='error'; renderSyncBadge(); return false; }
}

function startSyncListener(){
  if(syncListener) syncListener();
  const ref = userDocRef(); if(!ref) return;
  syncListener = ref.onSnapshot(snap => {
    if(!snap.exists) return;
    const data = snap.data();
    let changed = false;
    SYNC_KEYS.forEach(k => {
      if(data[k] && data[k] !== localStorage.getItem(k)){ localStorage.setItem(k, data[k]); changed=true; }
    });
    if(changed){ syncStatus='synced'; renderSyncBadge(); if(A?.tab) renderTab(A.tab); }
  }, err => console.error('Listener error:',err));
}

function stopSyncListener(){ if(syncListener){ syncListener(); syncListener=null; } }

let _pushTimer = null;
function debouncedPush(){
  if(!syncUser||!FIREBASE_OK) return;
  if(_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(()=>{ _pushTimer=null; pushToCloud(); }, 1500);
}

async function googleSignIn(){
  if(!FIREBASE_OK){
    showLoginError('Firebase non disponible. Le fichier doit être hébergé (pas ouvert en fichier local).');
    return;
  }
  const loading=document.getElementById('login-loading');
  const errEl=document.getElementById('login-error');
  if(loading) loading.classList.add('on');
  if(errEl) errEl.classList.remove('on');
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch(e) {
    if(loading) loading.classList.remove('on');
    if(e.code==='auth/popup-blocked'||e.code==='auth/popup-closed-by-user'){
      try { await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider()); } catch(e2){ showLoginError(e2.message); }
    } else { showLoginError(e.message); }
  }
}

function showLoginError(msg){
  const el=document.getElementById('login-error');
  if(el){ el.textContent=msg; el.classList.add('on'); }
}

function showApp(){
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').style.display='';
  applyGenderTheme();
}

function showLogin(){
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').style.display='none';
  const loading=document.getElementById('login-loading');
  if(loading) loading.classList.remove('on');
}

async function signOut(){
  if(!confirm('Se déconnecter ?')) return;
  try{ stopSyncListener(); }catch(e){}
  try{ if(auth) await auth.signOut(); }catch(e){}
  syncUser=null; syncStatus='offline';
  if(FIREBASE_OK){ showLogin(); }
  else { location.reload(); }
}

// Auth state listener — only if Firebase loaded
if(FIREBASE_OK){
  auth.onAuthStateChanged(async user => {
    syncUser = user;
    if(user){
      showApp();
      const hadCloud = await pullFromCloud();
      if(!hadCloud) await pushToCloud();
      startSyncListener();
      if(typeof renderTab==='function' && A?.tab) renderTab(A.tab);
    } else {
      stopSyncListener(); syncStatus='offline';
      showLogin();
    }
    renderSyncBadge();
  });
} else {
  // Firebase not loaded — local mode only
  document.addEventListener('DOMContentLoaded',()=>{
    // Hide Google login, show local mode
    document.getElementById('login-screen').innerHTML=`
      <div class="login-logo">LAFAY</div>
      <div class="login-sub">Méthode · Tracker</div>
      <div class="login-card">
        <p>Firebase n'a pas pu charger. Tu peux utiliser l'app en mode local (les données restent sur cet appareil).</p>
        <button class="login-google" style="background:var(--accent);color:#000" onclick="showApp();const p=S.profileM||S.profileF;if(p){switchTab('seance');}else{document.getElementById('ob').classList.add('on');}">
          📱 Continuer en mode local
        </button>
        <div style="font-size:11px;color:var(--dim);margin-top:12px;line-height:1.4">Pour la synchronisation Google, ouvre l'app depuis un serveur web (pas en fichier local).</div>
      </div>`;
  });
}

function renderSyncBadge(){
  const el=document.getElementById('sync-badge'); if(!el) return;
  if(!syncUser){ el.innerHTML=''; return; }
  const icons={syncing:'🔄',synced:'☁️',error:'⚠️',offline:'📴'};
  const labels={syncing:'Sync…',synced:'Synchronisé',error:'Erreur sync',offline:'Hors ligne'};
  const colors={syncing:'var(--warn)',synced:'var(--ok)',error:'var(--err)',offline:'var(--dim)'};
  el.innerHTML=`<span style="font-size:10px;font-weight:700;color:${colors[syncStatus]};display:flex;align-items:center;gap:3px">${icons[syncStatus]} ${labels[syncStatus]}</span>`;
}
