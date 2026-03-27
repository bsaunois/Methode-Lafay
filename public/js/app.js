"use strict";
// ═══════════════════════════════ STORE ═══════════════════════════════
const S={
  _g(k){try{return JSON.parse(localStorage.getItem(k))}catch{return null}},
  _s(k,v){try{localStorage.setItem(k,JSON.stringify(v));debouncedPush();}catch{}},
  get mode(){return this._g('lf2_mode')||'M'},set mode(v){this._s('lf2_mode',v)},
  get profile(){return this.mode==='F'?this._g('lf2_profile_f'):this._g('lf2_profile_m')},
  set profile(v){if(this.mode==='F')this._s('lf2_profile_f',v);else this._s('lf2_profile_m',v);},
  get profileM(){return this._g('lf2_profile_m')},
  get profileF(){return this._g('lf2_profile_f')},
  get sessions(){return this._g('lf2_sessions')||[]},set sessions(v){this._s('lf2_sessions',v)},
  get active(){return this._g('lf2_active')},set active(v){this._s('lf2_active',v)},
  get targets(){return this._g('lf2_targets')||{}},set targets(v){this._s('lf2_targets',v)},
};

// ═══════════════════════════════ APP STATE ═══════════════════════════════
let A={
  tab:'seance',phase:'idle',wuStep:0,
  timerEnd:null,timerTotal:0,timerTick:null,elTick:null,sessStart:null,
  wuTimerRunning:false,wuTimerEnd:null,wuTimerTotal:0,wuTimerTick:null,wuTimerBeeped:false,wuTimerStart:null,wuTimerTarget:0,wuTimerMode:'down',
  reps:{},feeling:3,expandSess:null,obLevel:'niveau_1',calWeek:0,
  stretchIdx:null,stretchEnd:null,stretchTick:null,stretchTotal:0,
};

// ═══════════════════════════════ UTILS ═══════════════════════════════
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const p2=n=>String(Math.max(0,n)).padStart(2,'0');
const fmtS=s=>{s=Math.max(0,Math.floor(s));return p2(Math.floor(s/60))+':'+p2(s%60)};
const feelE=f=>['','😤','😐','💪','🔥','🏆'][f]||'💪';
const rLbl=r=>({normal:'Normal',rapide:'Rapide',lent:'Lent',iso:'Iso'}[r]||r);
const dCol=d=>['','#22c55e','#3b82f6','#f97316','#ef4444'][d]||'#888';
const dLbl=d=>['','Débutant','Entraîné','Confirmé','Haut niveau'][d]||'';
const fDay=iso=>new Date(iso).getDate();
const fMon=iso=>new Date(iso).toLocaleDateString('fr-FR',{month:'short'}).toUpperCase();
const fDate=iso=>new Date(iso).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});

function getProfile(){return S.profile}
function getSessions(){return S.sessions}
function getActive(){return S.active}

function getCurProg(){
  if(isF())return getCurProgF();
  const p=getProfile();if(!p)return null;
  const ids=LVL_PROGS[p.levelId]||[];if(!ids.length)return null;
  // For niveau_1, use the test-assigned program
  if(p.levelId==='niveau_1'){
    const test=getTestResults();
    if(test&&test.assignedProgramId&&PROGS[test.assignedProgramId])return PROGS[test.assignedProgramId];
    if(p.assignedProgram&&PROGS[p.assignedProgram])return PROGS[p.assignedProgram];
  }
  // For levels with alternating sessions (10,12,12bis,12ter), rotate
  const sess=getSessions().filter(s=>s.levelId===p.levelId);
  return PROGS[ids[sess.length%ids.length]]||PROGS[ids[0]];
}

function getLastPerf(exoId){
  const ss=getSessions();
  for(const s of ss){
    if(!s.exercises)continue;
    const e=s.exercises.find(e=>e.exoId===exoId);
    if(e&&e.sets.length)return e.sets.map(s=>s.reps);
  }
  return null;
}

function getTarget(exoId,setCount){
  const t=S.targets[exoId];
  if(t&&Array.isArray(t))return t;
  const lp=getLastPerf(exoId);
  return lp||null;
}

// ═══════════════════════════════ TIMER ═══════════════════════════════
function startTimer(secs,cb){
  stopTimer();
  A.timerEnd=Date.now()+secs*1000;A.timerTotal=secs;
  updateTimerUI();
  A.timerTick=setInterval(()=>{
    const rem=(A.timerEnd-Date.now())/1000;
    if(rem<=0){stopTimer();beep();if(cb)cb();return;}
    updateTimerUI(rem);
  },100);
}
function stopTimer(){if(A.timerTick){clearInterval(A.timerTick);A.timerTick=null;}}
function updateTimerUI(rem){
  if(rem===undefined)rem=A.timerTotal;
  const prog=Math.max(0,rem/A.timerTotal);
  const el=document.getElementById('rd');const er=document.getElementById('rr');
  if(el)el.textContent=fmtS(rem);
  if(er)er.style.strokeDashoffset=314.159*(1-prog);
}
function showRest(msg){
  const ov=document.getElementById('rov');if(!ov)return;
  ov.classList.add('on');
  const nx=document.getElementById('rnxt');if(nx)nx.textContent=msg||'';
}
function hideRest(){const ov=document.getElementById('rov');if(ov)ov.classList.remove('on');stopTimer();A.timerEnd=null;}
function skipRest(){hideRest();renderActive();}

function beep(){
  try{
    navigator.vibrate&&navigator.vibrate([200,100,200]);
    const ac=new(window.AudioContext||window.webkitAudioContext)();
    [880,660,880].forEach((f,i)=>{
      const o=ac.createOscillator(),g=ac.createGain();
      o.connect(g);g.connect(ac.destination);
      o.frequency.value=f;o.type='sine';
      const t=ac.currentTime+i*.14;
      g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.001,t+.15);
      o.start(t);o.stop(t+.18);
    });
  }catch(e){}
}

function startElapsed(){
  if(A.elTick)clearInterval(A.elTick);
  A.elTick=setInterval(()=>{
    const el=document.getElementById('sel');
    if(el&&A.sessStart)el.textContent=fmtS((Date.now()-A.sessStart)/1000);
  },1000);
}
function stopElapsed(){if(A.elTick){clearInterval(A.elTick);A.elTick=null;}}

// ═══════════════════════════════ RÉÉQUILIBRAGE STRETCH STEPS ═══════════════════════════════
function buildReequilStretchSteps(){
  const p=getProfile();
  const variant=p?.reequil?.variant||'moinsMot';
  const rp=REEQUIL_F[variant];
  const nums=rp.stretchNums;
  const stretches=nums?STRETCH.filter(s=>nums.includes(s.n)):STRETCH;
  return stretches.map(s=>({icon:'🧘',title:s.title,desc:s.desc,dur:s.dur||30,isCardio:true}));
}
function getWuSteps(){
  if(isF()&&isReequilActive())return buildReequilStretchSteps();
  return buildWarmupSteps();
}

// ═══════════════════════════════ WARMUP ═══════════════════════════════
// Exactement comme page 21 du livre :
// 3 rounds de [cardio 15-30s + 10 reps exercice A]
// Si séance commence par B/B1/B2 → ajouter 1 série de B1
// Si séance commence par C/C1 → ajouter 1 série de C1
// Puis 2 min de repos
function buildWarmupSteps(){
  const prog=getCurProg();
  const firstExo=prog?prog.slots[0].exo:'';
  const steps=[
    {icon:'🏃',title:'Cardio — Round 1',desc:'15 à 30 secondes de saut à la corde, de sautillements sur place ou de l\'exercice E6. Objectif : s\'échauffer sans s\'épuiser.',dur:30,isCardio:true},
    {icon:'💪',title:'Exercice A — Round 1',desc:'10 répétitions de l\'exercice A (pompes classiques), sans chercher la performance. Arrêtez-vous avant la fatigue.',dur:0},
    {icon:'🏃',title:'Cardio — Round 2',desc:'15 à 30 secondes. Essayez de tenir un peu plus longtemps qu\'au 1er round.',dur:30,isCardio:true},
    {icon:'💪',title:'Exercice A — Round 2',desc:'10 répétitions de l\'exercice A. Reposez-vous tranquillement entre chaque enchaînement.',dur:0},
    {icon:'🏃',title:'Cardio — Round 3',desc:'15 à 30 secondes. Dernier round de cardio.',dur:30,isCardio:true},
    {icon:'💪',title:'Exercice A — Round 3',desc:'10 répétitions de l\'exercice A.',dur:0},
  ];
  if(['B','B1','B2'].includes(firstExo)){
    steps.push({icon:'🎯',title:'Échauffement spécifique : B1',desc:'1 série de B1 en vous arrêtant avant que ce soit difficile. Juste un échauffement, pas une performance. Puis 2 minutes de repos.',dur:0});
  } else if(['C','C1'].includes(firstExo)){
    steps.push({icon:'🎯',title:'Échauffement spécifique : C1',desc:'1 série de C1 en vous arrêtant avant la fatigue. Puis 2 minutes de repos.',dur:0});
  }
  steps.push({icon:'⏸',title:'Repos — 2 minutes',desc:'Reposez-vous 2 minutes avant de commencer votre séance de musculation.',dur:120,isRest:true});
  return steps;
}

function skipWu(){stopWuTimer();A.wuTimerRunning=false;A.wuTimerBeeped=false;A.phase='workout';A.wuStep=0;renderSeance();}

// ═══════════════════════════════ SESSION ═══════════════════════════════
function startSession(){
  const prog=getCurProg();const p=getProfile();
  if(!prog||!p)return;
  const sess={
    id:uid(),date:new Date().toISOString(),levelId:p.levelId,programId:prog.id,
    startedAt:new Date().toISOString(),exoIdx:0,setNum:1,
    exercises:prog.slots.map(sl=>({exoId:sl.exo,sets:[]})),complete:false
  };
  if(isF())sess.zoneId=p.zoneId;
  S.active=sess;A.sessStart=Date.now();A.phase=(isF()&&isReequilActive())||!isF()?'warmup':'workout';A.wuStep=0;A.reps={};A.wuTimerRunning=false;A.wuTimerBeeped=false;
  renderSeance();
}

function getSlot(){
  const sess=getActive();if(!sess)return null;
  const prog=isF()?getCurProg():PROGS[sess.programId];if(!prog)return null;
  return prog.slots[sess.exoIdx]||null;
}
function repKey(){const s=getActive();return s?`${s.exoIdx}_${s.setNum}`:'';}

function chReps(d){
  const k=repKey();const sl=getSlot();
  const def=sl?(sl.reps||0):0;
  const cur=A.reps[k]!==undefined?A.reps[k]:def;
  A.reps[k]=Math.max(0,cur+d);
  const el=document.getElementById('rpv');if(el)el.textContent=A.reps[k];
}

function editReps(){
  const k=repKey();const sl=getSlot();
  const def=sl?(sl.reps||0):0;
  const cur=A.reps[k]!==undefined?A.reps[k]:def;
  const el=document.getElementById('rpv');if(!el)return;
  const inp=document.createElement('input');
  inp.type='number';inp.inputMode='numeric';inp.pattern='[0-9]*';
  inp.className='rpv-input';inp.value=cur;inp.min=0;inp.max=999;
  el.replaceWith(inp);inp.focus();inp.select();
  const finish=()=>{
    const v=Math.max(0,parseInt(inp.value)||0);
    A.reps[k]=v;
    const div=document.createElement('div');
    div.className='rpv';div.id='rpv';div.textContent=v;
    div.onclick=editReps;
    inp.replaceWith(div);
  };
  inp.addEventListener('blur',finish);
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();inp.blur();}});
}

function confirmSet(){
  const sess=getActive();if(!sess)return;
  const prog=isF()?getCurProg():PROGS[sess.programId];if(!prog)return;
  const sl=prog.slots[sess.exoIdx];if(!sl)return;
  const k=repKey();
  const reps=A.reps[k]!==undefined?A.reps[k]:(sl.reps||0);
  sess.exercises[sess.exoIdx].sets.push({setNum:sess.setNum,reps});
  const totalSets=sl.sets||1;
  const lastSet=sess.setNum>=totalSets;
  const lastExo=sess.exoIdx>=prog.slots.length-1;

  if(lastSet){
    sess.exoIdx++;sess.setNum=1;S.active=sess;
    if(lastExo){
      if(sl.r2>0){showRest('🏁 Dernière série !');startTimer(sl.r2,()=>{hideRest();A.phase='complete';renderSeance();});}
      else{A.phase='complete';renderSeance();}
    } else {
      const rd=sl.r2||0;
      if(rd>0){
        const nx=getExo(prog.slots[sess.exoIdx].exo);
        showRest('Prochain : '+(nx?nx.name:prog.slots[sess.exoIdx].exo));
        startTimer(rd,()=>{hideRest();renderActive();});
      } else renderActive();
    }
  } else {
    sess.setNum++;S.active=sess;
    const rd=sl.r1||0;
    if(rd>0){
      const tgt=sl.reps?sl.reps+' reps':'max';
      showRest(`Série ${sess.setNum}/${totalSets} — objectif ${tgt}`);
      startTimer(rd,()=>{hideRest();renderActive();});
    } else renderActive();
  }
}

function saveSession(){
  const sess=getActive();if(!sess){A.phase='idle';renderSeance();return;}
  const dur=A.sessStart?Math.floor((Date.now()-A.sessStart)/1000):0;

  // Auto-update targets: suggest +1 rep on last sets where perf was met
  const prog=isF()?getCurProg():PROGS[sess.programId];
  if(prog){
    const newTargets={...S.targets};
    prog.slots.forEach(sl=>{
      const ex=sess.exercises.find(e=>e.exoId===sl.exo);
      if(!ex||!ex.sets.length)return;
      const repsArr=ex.sets.map(s=>s.reps);
      const lp=getLastPerf(sl.exo);
      const lpTotal=lp?lp.reduce((a,b)=>a+b,0):0;
      const curTotal=repsArr.reduce((a,b)=>a+b,0);
      // If improved, save as new target suggestion (same as achieved)
      if(curTotal>=lpTotal)newTargets[sl.exo]=repsArr;
    });
    S.targets=newTargets;
  }

  const saved={...sess,complete:true,endedAt:new Date().toISOString(),durationSeconds:dur,feeling:A.feeling};
  
  // Track PRs — check best single-set reps for each exercise
  if(sess.exercises){
    sess.exercises.forEach(ex=>{
      if(!ex.sets.length)return;
      const bestSet=Math.max(...ex.sets.map(s=>s.reps||0));
      if(bestSet>0)updatePR(ex.exoId,bestSet,'session');
    });
  }
  
  const ss=getSessions();ss.unshift(saved);S.sessions=ss;
  S.active=null;stopElapsed();A.phase='idle';A.sessStart=null;A.reps={};
  renderSeance();
}

function abandonSession(){
  if(!confirm('Abandonner la séance en cours ?'))return;
  stopTimer();stopElapsed();stopWuTimer();
  S.active=null;A.phase='idle';A.sessStart=null;A.reps={};A.wuTimerRunning=false;A.wuTimerBeeped=false;
  hideRest();renderSeance();
}

// ═══════════════════════════════ RENDER — SÉANCE ═══════════════════════════════
function renderSeance(){
  const sc=document.getElementById('screen-seance');
  if(A.phase==='warmup'){renderWuScreen(buildWarmupSteps());if(!A.elTick)startElapsed();return;}
  if(A.phase==='workout'){renderActive();if(!A.elTick)startElapsed();return;}
  if(A.phase==='complete'){renderComplete();return;}
  renderIdle();
}

function renderIdle(){
  if(isF()){renderIdleF();return;}
  const sc=document.getElementById('screen-seance');
  const p=getProfile();const prog=getCurProg();const lv=p?LVL[p.levelId]:null;
  const ss=getSessions();
  const today=new Date();
  const todaySess=ss.filter(s=>new Date(s.date).toDateString()===today.toDateString());

  let slotsHtml='';
  if(prog){
    prog.slots.slice(0,6).forEach((sl,i)=>{
      const e=EXO[sl.exo];if(!e)return;
      const lp=getLastPerf(sl.exo);
      const lpHtml=lp?`<div style="font-size:10px;color:var(--info);font-weight:600;margin-top:1px">Préc. : ${lp.join('·')} = ${lp.reduce((a,b)=>a+b,0)}</div>`:'';
      slotsHtml+=`<div class="er"><span class="eid">${i+1}</span><div class="ebody"><div class="ename">${e.name}</div><div class="esub">${e.ms.slice(0,2).join(' · ')}</div>${lpHtml}</div><span class="ebadge">${sl.sets}×${sl.reps||'∞'}<br><span style="font-size:10px;color:var(--dim)">${rLbl(sl.rh)}</span></span></div>`;
    });
    if(prog.slots.length>6)slotsHtml+=`<div style="padding:8px 14px;font-size:12px;color:var(--dim)">+${prog.slots.length-6} exercices de plus…</div>`;
  }

  const altIds=LVL_PROGS[p?.levelId]||[];
  const altTag=altIds.length>1&&prog?`<div style="font-size:10px;font-weight:800;letter-spacing:2px;color:var(--accent);text-transform:uppercase;margin-bottom:2px">${prog.label}</div>`:'';
  const todayBanner=todaySess.length?`<div style="margin:10px 14px 2px;padding:8px 12px;background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.2);border-radius:10px;display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:var(--ok)">✔ Séance déjà réalisée aujourd'hui</div>`:'';

  sc.innerHTML=`
    <div class="tb"><h1>LAFAY</h1><div class="sp"></div>${lv?`<div class="lv-pill"><b>${lv.num}</b>${lv.short}</div>`:''}</div>
    <div class="sa">
      ${todayBanner}
      ${prog?`
        <div class="slab">Programme du jour</div>
        <div class="card card0">
          <div style="padding:12px 14px 8px;border-bottom:1px solid var(--border)">${altTag}<div style="font-size:17px;font-weight:800">${prog.label}</div><div style="font-size:12px;color:var(--dim);margin-top:3px">${prog.slots.length} exercices · Échauffement inclus</div></div>
          ${slotsHtml}
        </div>
        <div style="margin:10px 14px 0"><button class="btn bp bw" onclick="startSession()">▶ DÉMARRER LA SÉANCE</button></div>
      `:`<div class="empty"><div class="ic">⚙️</div><p>Configure ton niveau dans l'onglet Moi</p></div>`}
      ${lv&&lv.promo?`<div class="slab" style="margin-top:6px">Pour progresser</div><div class="promo-box"><div class="pt">📈 Critère de passage au niveau suivant</div><p>${lv.promo}</p></div>`:''}
      <div style="height:10px"></div>
    </div>`;
}

function renderWuScreen(steps){
  const sc=document.getElementById('screen-seance');
  const el=A.sessStart?fmtS((Date.now()-A.sessStart)/1000):'00:00';
  const isReequilStretch=isF()&&isReequilActive();
  const curStep=steps[A.wuStep];
  const lastStep=A.wuStep>=steps.length-1;
  
  // Progress dots
  const dots=steps.map((_,i)=>{
    const cls=i<A.wuStep?'done':i===A.wuStep?'act':'';
    return `<div class="wu-dot ${cls}"></div>`;
  }).join('');
  
  // Done chips
  const doneChips=steps.slice(0,A.wuStep).map(s=>
    `<span class="wu-done-chip">✓ ${s.title.replace(/—.*/,'').trim()}</span>`
  ).join('');
  
  // Timer section for cardio/rest
  let timerHtml='';
  if(curStep.isCardio||curStep.isRest){
    const dur=curStep.isRest?120:curStep.dur||30;
    const isUp=curStep.isCardio;
    const initTime=isUp?'0:00':fmtS(dur);
    const initOffset=isUp?'314.159':'0'; // empty ring for count-up
    const pastTarget=A.wuTimerBeeped;
    const ringColor=pastTarget?'var(--ok)':'var(--accent)';
    const labelText=curStep.isRest
      ?'Repose-toi avant de commencer la séance'
      :(A.wuTimerRunning
        ?(pastTarget?'✓ Objectif atteint — continue si tu veux !':'Objectif : '+fmtS(dur))
        :'Chrono croissant · objectif '+fmtS(dur));
    timerHtml=`
      <div class="wu-timer-wrap">
        <div class="wu-timer-ring">
          <svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="50" fill="none" stroke="var(--s3)" stroke-width="7"/><circle id="wur" cx="55" cy="55" r="50" fill="none" stroke="${ringColor}" stroke-width="7" stroke-linecap="round" stroke-dasharray="314.159" stroke-dashoffset="${initOffset}" transform="rotate(-90 55 55)" style="transition:stroke-dashoffset .1s linear"/></svg>
          <div class="wu-timer-val" id="wutime">${initTime}</div>
        </div>
        <div class="wu-timer-label">${labelText}</div>
      </div>`;
  }
  
  // Button label
  let btnLbl,btnIcon;
  if(curStep.isRest){
    if(A.wuTimerRunning){btnLbl=null;} // hide button during rest countdown
    else{btnLbl='LANCER 2 MIN';btnIcon='⏱';}
  } else if(curStep.isCardio){
    if(!A.wuTimerRunning){btnLbl='LANCER LE CHRONO';btnIcon='▶';}
    else{btnLbl='TERMINÉ →';btnIcon='✓';}
  } else {
    btnLbl='FAIT — SUIVANT';btnIcon='✓';
  }
  
  const stepNum=`${A.wuStep+1}/${steps.length}`;
  
  sc.innerHTML=`
    <div class="shdr"><span class="lbl">${isReequilStretch?'🧘 SOUPLESSE':'🔥 ÉCHAUFFEMENT'} · ${stepNum}</span><span class="el" id="sel">${el}</span><button class="xb" onclick="abandonSession()">✕</button></div>
    <div class="wu-wrap">
      <div class="wu-dots">${dots}</div>
      <div class="wu-card">
        <div class="wu-card-top">
          <div class="wu-icon">${curStep.icon}</div>
          <div class="wu-card-title">${curStep.title}</div>
          <div class="wu-card-sub">${curStep.desc}</div>
        </div>
        ${timerHtml}
      </div>
      <div class="wu-action">
        ${btnLbl?`<button class="btn bp bw" onclick="wuAction()">${btnIcon} ${btnLbl}</button>`:''}
      </div>
      ${doneChips?`<div class="wu-done-list">${doneChips}</div>`:''}
      <div class="wu-skip" onclick="skipWu()">${isReequilStretch?'Passer la souplesse →':'Passer l\'échauffement →'}</div>
    </div>`;
  
  // Auto-start rest timer
  if(curStep.isRest&&!A.timerEnd&&!A.wuTimerRunning){
    // Don't auto-start, wait for button press
  }
}

// Unified warmup action handler
function wuAction(){
  const steps=getWuSteps();
  const curStep=steps[A.wuStep];

  if(curStep.isRest){
    // Start rest countdown
    A.wuTimerRunning=true;
    renderWuScreen(steps);
    startWuTimer(120,()=>{
      A.wuTimerRunning=false;
      A.wuStep++;
      if(A.wuStep>=steps.length){A.phase='workout';renderSeance();}
      else renderWuScreen(getWuSteps());
    },'down');
    return;
  }

  if(curStep.isCardio){
    if(!A.wuTimerRunning){
      // Start cardio count-UP timer
      A.wuTimerRunning=true;
      renderWuScreen(steps);
      startWuTimer(curStep.dur||30,null,'up');
      return;
    } else {
      // User says done — stop and advance
      stopWuTimer();
      A.wuTimerRunning=false;
      A.wuTimerBeeped=false;
    }
  }

  // Advance to next step
  A.wuStep++;
  if(A.wuStep>=steps.length){A.phase='workout';renderSeance();return;}
  renderWuScreen(getWuSteps());
}

// Warmup-specific timer
// mode='up' → counts up, beeps at target, keeps going (for cardio)
// mode='down' → counts down, callback at 0 (for rest)
function startWuTimer(secs,cb,mode){
  stopWuTimer();
  A.wuTimerMode=mode||'down';
  A.wuTimerTarget=secs;
  A.wuTimerStart=Date.now();
  A.wuTimerBeeped=false;
  if(mode==='down') A.wuTimerEnd=Date.now()+secs*1000;
  A.wuTimerTick=setInterval(()=>{
    const elapsed=(Date.now()-A.wuTimerStart)/1000;
    const el=document.getElementById('wutime');
    const ring=document.getElementById('wur');
    if(A.wuTimerMode==='up'){
      // Count up
      if(el)el.textContent=fmtS(elapsed);
      const prog=Math.min(1,elapsed/A.wuTimerTarget);
      if(ring){
        ring.style.strokeDashoffset=314.159*(1-prog);
        if(elapsed>=A.wuTimerTarget)ring.style.stroke='var(--ok)';
      }
      // Beep at target but don't stop
      if(!A.wuTimerBeeped&&elapsed>=A.wuTimerTarget){
        A.wuTimerBeeped=true;
        beep();
      }
    } else {
      // Count down
      const rem=(A.wuTimerEnd-Date.now())/1000;
      if(rem<=0){stopWuTimer();if(cb)cb();return;}
      if(el)el.textContent=fmtS(rem);
      if(ring)ring.style.strokeDashoffset=314.159*(1-rem/A.wuTimerTarget);
    }
  },100);
}
function stopWuTimer(){if(A.wuTimerTick){clearInterval(A.wuTimerTick);A.wuTimerTick=null;}A.wuTimerEnd=null;A.wuTimerStart=null;}

function renderActive(){
  const sc=document.getElementById('screen-seance');
  const sess=getActive();
  const prog=isF()?getCurProg():PROGS[sess?.programId];
  if(!sess||!prog){A.phase='idle';renderSeance();return;}
  const sl=prog.slots[sess.exoIdx];if(!sl){A.phase='complete';renderSeance();return;}
  const exo=getExo(sl.exo);
  const totalSets=sl.sets||1;
  const el=A.sessStart?fmtS((Date.now()-A.sessStart)/1000):'';
  const k=`${sess.exoIdx}_${sess.setNum}`;
  const def=sl.reps||0;
  const curReps=A.reps[k]!==undefined?A.reps[k]:def;

  // Previous perfs and targets
  const lp=getLastPerf(sl.exo);
  const tgt=getTarget(sl.exo,totalSets);
  const lpHtml=lp?`<span class="pv">Préc. : ${lp.join('·')}</span>`:'';
  const tgtRep=tgt&&tgt[sess.setNum-1]!==undefined?tgt[sess.setNum-1]:sl.reps;
  const tgtLabel=tgtRep!==null&&tgtRep!==undefined?tgtRep+' reps':'MAX';

  const exoList=prog.slots.map((s,i)=>{
    const e=getExo(s.exo);
    const done=i<sess.exoIdx,cur=i===sess.exoIdx;
    return`<div class="er${done?' edone':cur?' ecur':''}"><span class="eid">${i+1}</span><div class="ebody"><div class="ename" style="font-size:13px">${e?e.name:s.exo}</div></div><span class="ebadge" style="font-size:11px">${done?'✓':`${s.sets}×${s.reps||'∞'}`}</span></div>`;
  }).join('');

  const isLastExo=sess.exoIdx>=prog.slots.length-1;
  const isLastSet=sess.setNum>=totalSets;
  const btnLbl=isLastExo&&isLastSet?'🏁 FIN DE SÉANCE':isLastSet?'→ EXERCICE SUIVANT':'✓ SÉRIE FAITE';

  sc.innerHTML=`
    <div class="shdr"><span class="lbl">${prog.label}</span><span class="el mono" id="sel">${el}</span><button class="xb" onclick="abandonSession()">✕</button></div>
    <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:80px;position:relative">
      <div class="cec">
        <div class="cec-top">
          <div class="cec-info">SÉRIE ${sess.setNum} / ${totalSets} · ${rLbl(sl.rh).toUpperCase()}</div>
          <div class="cec-name">${exo?exo.name:sl.exo}</div>
          <div class="cec-ms">${exo?exo.ms.join(' · '):''}</div>
        </div>
        ${exo?`<div class="cec-desc">${exo.desc}</div>`:''}
        ${sl.note?`<div class="cec-note">ℹ ${sl.note}</div>`:''}
      </div>
      <div class="rpw">
        <div class="rpt">
          <span class="rl">REPS</span>
          <span class="tg">${tgtLabel}</span>
          ${lpHtml}
          ${sl.r1>0?`<span style="font-size:10px;color:var(--dim)">repos ${fmtS(sl.r1)}</span>`:''}
        </div>
        <div class="rpc">
          <button class="rpb" onclick="chReps(-1)">−</button>
          <div class="rpv" id="rpv" onclick="editReps()">${curReps}</div>
          <button class="rpb" onclick="chReps(1)">+</button>
        </div>
      </div>
      <div class="arow">
        <button class="btn bp" style="flex:1" onclick="confirmSet()">${btnLbl}</button>
      </div>
      <div class="slab">Exercices</div>
      <div class="card card0">${exoList}</div>
    </div>
    <div id="rov" class="rov">
      <div class="rlbl">REPOS</div>
      <div class="rwrap">
        <svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="50" fill="none" stroke="var(--s3)" stroke-width="8"/><circle id="rr" cx="55" cy="55" r="50" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="314.159" stroke-dashoffset="0" transform="rotate(-90 55 55)" style="transition:stroke-dashoffset .1s linear"/></svg>
        <div class="rdisp" id="rd">—</div>
      </div>
      <div class="rnxt" id="rnxt"></div>
      <button class="rskip" onclick="skipRest()">PASSER →</button>
    </div>`;
}

function renderComplete(){
  const sc=document.getElementById('screen-seance');
  const sess=getActive();const prog=isF()?getCurProg():(sess?PROGS[sess.programId]:null);
  const dur=A.sessStart?Math.floor((Date.now()-A.sessStart)/1000):0;
  let totalReps=0;
  if(sess)sess.exercises.forEach(e=>e.sets.forEach(s=>totalReps+=(s.reps||0)));

  // Build progression comparison
  let progHtml='';
  if(sess&&prog){
    const rows=prog.slots.map(sl=>{
      const ex=sess.exercises.find(e=>e.exoId===sl.exo);
      if(!ex||!ex.sets.length)return'';
      const repsArr=ex.sets.map(s=>s.reps);
      const total=repsArr.reduce((a,b)=>a+b,0);
      const lp=getLastPerf(sl.exo);
      const lpTotal=lp?lp.reduce((a,b)=>a+b,0):0;
      const up=lpTotal>0&&total>lpTotal;
      const same=lpTotal>0&&total===lpTotal;
      return`<div style="display:flex;align-items:center;gap:8px;padding:7px 14px;border-bottom:1px solid var(--border)">
        <span style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:var(--accent);min-width:24px">${sl.exo}</span>
        <div style="flex:1;display:flex;gap:3px;flex-wrap:wrap">${repsArr.map(r=>`<span style="font-family:'JetBrains Mono',monospace;font-size:11px;background:${up?'rgba(34,197,94,.08)':'var(--s2)'};border:1px solid ${up?'rgba(34,197,94,.3)':'var(--border)'};border-radius:4px;padding:2px 6px;color:${up?'var(--ok)':'var(--text)'}">${r}</span>`).join('')}</div>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--dim)">=${total}</span>
        ${up?'<span style="color:var(--ok);font-size:14px">↑</span>':same?'<span style="color:var(--dim);font-size:12px">=</span>':''}
      </div>`;
    }).join('');
    if(rows)progHtml=`<div class="slab">Résultats de la séance</div><div class="card card0" style="margin-bottom:10px">${rows}</div>`;
  }

  const feelBtns=[1,2,3,4,5].map(f=>`<button class="feel-btn ${A.feeling===f?'on':''}" onclick="A.feeling=${f};renderComplete()">${feelE(f)}</button>`).join('');

  sc.innerHTML=`
    <div class="sa" style="padding-bottom:20px">
      <div class="scw">
        <div class="trophy">🏆</div>
        <h2>BRAVO !</h2>
        <div class="sub">${prog?prog.label:''}</div>
        <div class="stat-row" style="margin:8px 0;width:100%;max-width:280px">
          <div class="stat"><div class="v">${fmtS(dur)}</div><div class="l">Durée</div></div>
          <div class="stat"><div class="v">${totalReps}</div><div class="l">Reps</div></div>
        </div>
        <div style="font-size:11px;font-weight:800;letter-spacing:2px;color:var(--dim);text-transform:uppercase">Ressenti ?</div>
        <div class="feel-row">${feelBtns}</div>
        <button class="btn bp bw" style="max-width:300px;margin-top:4px" onclick="saveSession()">💾 ENREGISTRER</button>
        <button class="btn bg" onclick="abandonSession()">Annuler</button>
      </div>
      ${progHtml}
    </div>`;
}

// ═══════════════════════════════ RENDER — PROGRAMME ═══════════════════════════════
function renderProgramme(){
  if(isF()){renderProgrammeF();return;}
  const sc=document.getElementById('screen-programme');
  const p=getProfile();
  if(!p){sc.innerHTML=`<div class="tb"><h1>PROGRAMME</h1></div><div class="empty"><div class="ic">⚙️</div><p>Configure ton profil d'abord</p></div>`;return;}
  const lv=LVL[p.levelId];const prog=getCurProg();
  const progIds=LVL_PROGS[p.levelId]||[];
  const ss=getSessions();const levelSess=ss.filter(s=>s.levelId===p.levelId);

  // CALENDAR
  const sch=lv&&lv.schedule;
  const weekKeys=sch?Object.keys(sch):[];
  const cwk=Math.min(A.calWeek,weekKeys.length-1);
  const curSch=sch&&weekKeys[cwk]?sch[weekKeys[cwk]]:null;
  const trainDays=curSch?curSch.days:[];
  const today=new Date();const dow=today.getDay()||7;
  const weekDates=Array.from({length:7},(_,i)=>{const d=new Date(today);d.setDate(today.getDate()-(dow-1)+i);return d;});
  const dayNames=['L','M','Me','J','V','S','D'];

  const weekRow=dayNames.map((dn,i)=>{
    const isTrain=trainDays.includes(i+1);
    const isToday=weekDates[i].toDateString()===today.toDateString();
    const isDone=ss.some(s=>{const sd=new Date(s.date);return sd.toDateString()===weekDates[i].toDateString()&&s.levelId===p.levelId;});
    let cls='ddot';
    if(isTrain)cls+=' train';
    if(isDone)cls+=' done';
    if(isToday)cls+=' today';
    return`<div class="dc"><div class="dn">${dn}</div><div class="${cls}">${isDone?'✓':isToday&&isTrain?'•':''}</div></div>`;
  }).join('');

  const wtabs=weekKeys.length>1?`<div class="wtabs">${weekKeys.map((wk,i)=>`<div class="wtab ${i===cwk?'on':''}" onclick="A.calWeek=${i};renderProgramme()">${sch[wk].label.split(':')[0]}</div>`).join('')}</div>`:'';

  const calHtml=sch?`
    <div class="wcal">
      <div class="wch"><h3>Planning hebdo</h3><span>${levelSess.length} séances faites</span></div>
      ${wtabs}
      <div class="week-row">${weekRow}</div>
      <div style="padding:4px 14px 10px;font-size:12px;color:var(--dim)">${curSch?curSch.label:''}</div>
    </div>`:'';

  // ALT SESSIONS
  let altHtml='';
  if(progIds.length>1){
    altHtml=`<div class="slab">Séances alternées</div><div style="display:flex;gap:8px;margin:0 14px 10px">
      ${progIds.map((pid,i)=>{const pr=PROGS[pid];const cur=prog&&prog.id===pid;return`<div style="flex:1;background:${cur?'var(--adim)':'var(--s1)'};border:1px solid ${cur?'rgba(249,115,22,.4)':'var(--border)'};border-radius:10px;padding:10px 12px"><div style="font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${cur?'var(--accent)':'var(--dim)'};margin-bottom:3px">SÉANCE ${i+1}${cur?' · PROCHAINE':''}</div><div style="font-size:12px;font-weight:700">${pr?pr.label:pid}</div><div style="font-size:11px;color:var(--dim);margin-top:2px">${pr?pr.slots.length+' exercices':''}</div></div>`;}).join('')}
    </div>`;
  }

  // PROG DETAIL
  let detailHtml='';
  if(prog){
    detailHtml=`<div class="slab">Exercices — ${prog.label}</div><div class="card card0">`;
    prog.slots.forEach((sl,i)=>{
      const e=EXO[sl.exo];if(!e)return;
      const lp=getLastPerf(sl.exo);
      const lpHtml=lp?`<div class="pdr-prev">${lp.map(r=>`<span class="pset">${r}</span>`).join('')}<span style="font-size:10px;color:var(--dim);align-self:center">= ${lp.reduce((a,b)=>a+b,0)}</span></div>`:'';
      detailHtml+=`<div class="pdr">
        <div class="pdr-top">
          <span class="pdr-idx">${i+1}</span>
          <div style="flex:1"><span class="pdr-name">${e.name}</span><span style="font-size:11px;color:var(--dim);margin-left:6px">${e.ms.slice(0,2).join(' · ')}</span></div>
          <span class="pdr-sets">${sl.sets}×${sl.reps||'∞'}</span>
        </div>
        <div class="pdr-meta">
          <span class="chip" style="font-size:9px">${rLbl(sl.rh)}</span>
          ${sl.r1>0?`<span class="chip" style="font-size:9px">⏱ ${fmtS(sl.r1)}</span>`:''}
          ${sl.r2>0?`<span class="chip" style="font-size:9px">⏸ ${fmtS(sl.r2)}</span>`:''}
          <span class="chip" style="font-size:9px;color:${dCol(e.d)}">${dLbl(e.d)}</span>
        </div>
        ${sl.note?`<div style="padding-left:26px;font-size:11px;color:var(--accent);line-height:1.4;font-weight:600;margin-top:2px">ℹ ${sl.note}</div>`:''}
        ${lpHtml}
      </div>`;
    });
    detailHtml+='</div>';
  }

  sc.innerHTML=`
    <div class="tb"><h1>PROGRAMME</h1><div class="sp"></div><button class="btn bs bsm" onclick="switchTab('moi')">Changer niveau</button></div>
    <div class="sa">
      <div class="lv-hero">
        <div class="lvh-top">
          <div class="n">NIVEAU ${lv?lv.num:'—'}</div>
          <h2>${lv?lv.label:'Non configuré'}</h2>
          <p>${lv?lv.desc:''}</p>
        </div>
        <div class="lvh-bot">
          <span class="chip cac">${lv?lv.freq:''}</span>
          ${lv&&lv.promo?`<span class="chip cwn">→ ${lv.promo.substring(0,35)}</span>`:''}
        </div>
      </div>
      ${calHtml}
      ${altHtml}
      ${lv&&lv.promo?`<div class="promo-box"><div class="pt">📈 Pour passer au niveau suivant</div><p>${lv.promo}</p></div>`:''}
      ${detailHtml}
    </div>`;
}

// ═══════════════════════════════ RENDER — SOUPLESSE ═══════════════════════════════
// ═══════════════════════════════ FÉMININ RENDERS ═══════════════════════════════
let viewZoneF=null;

function renderProgrammeF(){
  const sc=document.getElementById('screen-programme');
  if(viewZoneF){renderZoneDetailF(sc);return;}
  const p=getProfile();const ss=getSessions();
  let h=`<div class="tb"><h1>ZONES</h1><div class="sp"></div><span class="fem-badge" style="font-size:9px;padding:2px 7px;background:var(--adim);border:1px solid rgba(232,121,160,.25);border-radius:10px;color:var(--accent);font-weight:800;letter-spacing:1.5px">FÉMININ</span></div><div class="sa">`;
  h+=`<div style="padding:14px 14px 6px"><div style="font-size:20px;font-weight:900">Tes zones</div><div style="font-size:12px;color:var(--dim);margin-top:3px">Programme progressif par partie du corps</div></div>`;
  ZONES.forEach(z=>{
    const zs=ss.filter(s=>s.zoneId===z.id);
    const isCur=p&&p.zoneId===z.id;
    const li=isCur?z.levels.findIndex(l=>l.id===p.levelId):-1;
    const pct=z.levels.length?Math.round(((li+1)/z.levels.length)*100):0;
    h+=`<div class="zcard" onclick="viewZoneF='${z.id}';renderProgramme()" style="${isCur?'border-color:'+z.color:''}">
      <div class="zcard-top"><div class="zcard-icon" style="background:${z.color}22;color:${z.color}">${z.icon}</div>
      <div class="zcard-body"><div class="zcard-title">${z.label}</div><div class="zcard-sub">${z.sub} · ${zs.length} séance${zs.length!==1?'s':''}</div></div>
      <div class="zcard-arrow">›</div></div>
      ${isCur?`<div class="zcard-prog"><div class="zcard-prog-fill" style="width:${pct}%;background:${z.color}"></div></div>`:''}
    </div>`;
  });
  h+=`</div>`;sc.innerHTML=h;
}

function renderZoneDetailF(sc){
  const z=ZONE_MAP[viewZoneF];if(!z){viewZoneF=null;renderProgrammeF();return;}
  const p=getProfile();
  let h=`<div class="tb"><h1>${z.icon} ${z.label}</h1></div><div class="sa">`;
  h+=`<div class="zd-back" onclick="viewZoneF=null;renderProgramme()">‹ Retour aux zones</div>`;
  h+=`<div style="padding:0 14px 10px"><div style="font-size:13px;color:var(--dim)">${z.sub}</div></div>`;
  h+=`<div class="slab">NIVEAUX</div><div class="card card0">`;
  z.levels.forEach(l=>{
    const isCur=p&&p.zoneId===z.id&&p.levelId===l.id;
    h+=`<div class="lvo ${isCur?'sel':''}" onclick="selLevelF('${z.id}','${l.id}')">
      <div class="n" style="color:${z.color}">${l.label.charAt(0)}</div>
      <div class="i"><div class="na">${l.label}</div><div class="de">${l.desc} · ${l.freq}</div></div>
      <div class="ck">${isCur?'✓':''}</div>
    </div>`;
  });
  h+=`</div>`;
  // Show current level exercises
  const cur=p&&p.zoneId===z.id?z.levels.find(l=>l.id===p.levelId):z.levels[0];
  if(cur){
    h+=`<div class="slab">EXERCICES — ${cur.label}</div><div class="card card0">`;
    cur.slots.forEach((s,i)=>{
      const exo=getExo(s.exo);
      h+=`<div class="pdr"><div class="pdr-top"><div class="pdr-idx">${i+1}</div><div class="pdr-name">${exo?exo.name:s.exo}</div>
        <div class="pdr-sets">${s.sets||'—'}×${s.reps||'max'}</div></div>
        <div class="pdr-meta"><span class="chip">${rLbl(s.rh)}</span><span class="chip">⏱ ${s.r1}s</span>${s.note?`<span class="chip cac">${s.note}</span>`:''}</div></div>`;
    });
    h+=`</div>`;
  }
  h+=`</div>`;sc.innerHTML=h;
}

function selLevelF(zoneId,levelId){
  const p=getProfile()||{};p.zoneId=zoneId;p.levelId=levelId;S.profile=p;
  renderProgramme();renderSeance();
}

function renderIdleF(){
  const el=document.getElementById('screen-seance');
  const p=getProfile();
  if(!p||!p.zoneId){el.innerHTML=`<div class="tb"><h1>LAFAY</h1><div class="sp"></div><span class="fem-badge" style="font-size:9px;padding:2px 7px;background:var(--adim);border:1px solid rgba(232,121,160,.25);border-radius:10px;color:var(--accent);font-weight:800;letter-spacing:1.5px">FÉMININ</span></div><div class="sa"><div class="empty"><div class="ic">🌸</div><p>Configure ta zone dans l'onglet Zones</p></div></div>`;return;}

  const inReequil=isReequilActive();
  const prog=getCurProg();
  const femBadge=`<span class="fem-badge" style="font-size:9px;padding:2px 7px;background:var(--adim);border:1px solid rgba(232,121,160,.25);border-radius:10px;color:var(--accent);font-weight:800;letter-spacing:1.5px">FÉMININ</span>`;
  let h=`<div class="tb"><h1>LAFAY</h1><div class="sp"></div>${femBadge}</div><div class="sa">`;

  if(inReequil){
    const daysLeft=reequilDaysLeft();
    const endDate=reequilEndDate();
    const endStr=endDate?endDate.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'';
    const variant=p.reequil.variant||'moinsMot';
    const rp=REEQUIL_F[variant];
    const stretchList=rp.stretchNums?rp.stretchNums:STRETCH.map(s=>s.n);
    const stretchCount=stretchList.length;
    const ss=getSessions().filter(s=>s.programId&&s.programId.startsWith('reequil'));
    const last=ss[0];

    h+=`<div style="padding:14px 14px 8px">
      <div style="font-size:10px;font-weight:800;letter-spacing:3px;color:var(--accent);margin-bottom:6px">PHASE DE RÉÉQUILIBRAGE</div>
      <div style="font-size:24px;font-weight:900">${daysLeft} jours restants</div>
      <div style="font-size:12px;color:var(--dim);margin-top:3px">Fin le ${endStr} · ${p.reequil.months} mois · ${rp.freq}</div>
    </div>`;
    h+=`<div class="stat-row"><div class="stat"><div class="v">${ss.length}</div><div class="l">Séances</div></div>
      <div class="stat"><div class="v">${last?fDate(last.date):'—'}</div><div class="l">Dernière</div></div></div>`;

    // Stretching section
    h+=`<div class="slab">Souplesse à faire aussi</div>
    <div class="card" style="padding:12px 14px">
      <div style="font-size:12px;color:var(--dim);margin-bottom:6px">${stretchCount} exercices · onglet Souplesse</div>
      <div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--accent);line-height:1.8;word-break:break-all">Exos ${stretchList.join(', ')}</div>
    </div>`;

    // Transverse exercises
    h+=`<div class="slab">Exercices transversaux</div>`;
    if(prog){
      h+=`<div class="card card0">`;
      prog.slots.forEach((s,i)=>{const exo=getExo(s.exo);
        h+=`<div class="er"><div class="eid">${i+1}</div><div class="ebody"><div class="ename">${exo?exo.name:s.exo}</div>
          <div class="esub">${s.sets}×max · ${rLbl(s.rh)} · repos ${s.r1}s</div></div></div>`;
      });
      h+=`</div>`;
    }
    h+=`<div style="padding:14px 14px 6px"><button class="btn bp bw" onclick="startSession()">DÉMARRER LA SÉANCE</button></div>`;
    h+=`<div style="padding:0 14px 4px;display:flex;gap:8px">
      <button class="btn bs bsm" onclick="toggleReequilOpt()" style="flex:1">Transversaux : Option ${p.reequil.transOpt||1} ↔</button>
    </div>`;
    h+=`<div style="padding:0 14px 14px"><button class="btn bg bsm bw" onclick="endReequil()">Terminer le rééquilibrage</button></div>`;

  } else {
    const z=ZONE_MAP[p.zoneId];
    const ss=getSessions().filter(s=>s.zoneId===p.zoneId);const last=ss[0];
    h+=`<div style="padding:16px 14px 8px"><div style="font-size:22px;font-weight:900">Prête à t'entraîner ?</div>
      <div style="font-size:13px;color:var(--dim);margin-top:4px">${z?z.icon+' '+z.label:''} — ${prog?prog.label:''}</div></div>`;
    h+=`<div class="stat-row"><div class="stat"><div class="v">${ss.length}</div><div class="l">Séances</div></div>
      <div class="stat"><div class="v">${last?fDate(last.date):'—'}</div><div class="l">Dernière</div></div></div>`;
    if(prog){
      h+=`<div class="card card0">`;
      prog.slots.forEach((s,i)=>{const exo=getExo(s.exo);
        h+=`<div class="er"><div class="eid">${i+1}</div><div class="ebody"><div class="ename">${exo?exo.name:s.exo}</div>
          <div class="esub">${s.sets?s.sets+'×':''}${s.reps||'max'} · ${rLbl(s.rh)} · repos ${s.r1}s</div></div></div>`;
      });
      h+=`</div>`;
    }
    h+=`<div style="padding:14px"><button class="btn bp bw" onclick="startSession()">DÉMARRER LA SÉANCE</button></div>`;
  }

  h+=`</div>`;
  el.innerHTML=h;
}

function renderMoiF(){
  const el=document.getElementById('screen-moi');
  const p=getProfile();const ss=getSessions();
  const totalReps=ss.reduce((s,sess)=>{if(!sess.exercises)return s;return sess.exercises.reduce((a,e)=>a+(e.sets||[]).reduce((b,st)=>b+st.reps,0),s);},(0));
  const thisWk=ss.filter(s=>(Date.now()-new Date(s.date))/(86400000)<7).length;

  let h=`<div class="tb"><h1>MOI</h1><div class="sp"></div><span id="sync-badge"></span></div><div class="sa" style="padding-bottom:80px">`;
  h+=`<div class="stat-row" style="margin-top:10px"><div class="stat"><div class="v">${ss.length}</div><div class="l">Séances</div></div>
    <div class="stat"><div class="v">${thisWk}</div><div class="l">Cette sem.</div></div>
    <div class="stat"><div class="v">${totalReps}</div><div class="l">Reps</div></div></div>`;

  h+=renderTestCardF();
  h+=`<div class="slab">ZONE ACTIVE</div>`;
  ZONES.forEach(z=>{
    const isCur=p&&p.zoneId===z.id;
    h+=`<div class="card" style="cursor:pointer;${isCur?'border-color:'+z.color+';':''}padding:12px 14px;display:flex;align-items:center;gap:10px" onclick="selLevelF('${z.id}','${z.levels[0].id}');renderMoi();">
      <div style="font-size:20px">${z.icon}</div><div style="flex:1"><div style="font-weight:700">${z.label}</div>
      <div style="font-size:11px;color:var(--dim)">${z.sub}</div></div>
      ${isCur?'<span class="chip cac">Actif</span>':''}
    </div>`;
  });

  if(ss.length>0){
    h+=`<div class="slab">HISTORIQUE</div>`;
    ss.slice(0,20).forEach(sess=>{
      const z=ZONE_MAP[sess.zoneId];const lv=z?z.label:'Séance';
      const reps=sess.exercises?sess.exercises.reduce((a,e)=>a+(e.sets||[]).reduce((b,st)=>b+st.reps,0),0):0;
      h+=`<div class="si"><div class="si-hdr">
        <div class="si-date"><div class="d">${fDay(sess.date)}</div><div class="m">${fMon(sess.date)}</div></div>
        <div class="si-info"><div class="si-prog">${lv}</div><div class="si-meta">${sess.durationSeconds?fmtS(sess.durationSeconds):''} · ${reps} reps</div></div>
        <div class="si-feel">${feelE(sess.feeling||3)}</div></div></div>`;
    });
  }

  h+=`<div class="slab">Programme</div>
  <div class="card" style="border-color:rgba(232,121,160,.25)">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <div style="font-size:22px">🌸</div>
      <div style="flex:1"><div style="font-size:14px;font-weight:800">Mode Féminin</div><div style="font-size:11px;color:var(--dim)">4 zones · Musculation au féminin</div></div>
      <span class="chip cac">Actif</span>
    </div>
    <button class="btn bs bsm bw" onclick="switchMode('M')">🏋️ Passer au programme Homme</button>
    ${S.profileM?`<div style="font-size:10px;color:var(--ok);text-align:center;margin-top:6px">✓ Profil homme existant — tes données seront conservées</div>`:'<div style="font-size:10px;color:var(--dim);text-align:center;margin-top:6px">Tu feras le test de capacité initial</div>'}
  </div>`;

  h+=`<div class="slab">Compte</div>
  <div class="card card0">
    <div style="display:flex;align-items:center;gap:10px;padding:12px 14px">
      ${syncUser&&syncUser.photoURL?`<img src="${syncUser.photoURL}" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border)">`:`<div style="width:32px;height:32px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#000">${(syncUser?.displayName||'?')[0]}</div>`}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${syncUser?.displayName||'Connecté'}</div>
        <div style="font-size:11px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${syncUser?.email||''}</div>
      </div>
      <button class="btn bs bsm" onclick="signOut()">Déconnexion</button>
    </div>
  </div>`;

  h+=`<div class="slab">Zone danger</div>
  <div class="card" style="border-color:rgba(239,68,68,.25)">
    <div style="font-size:12px;color:var(--dim);line-height:1.5;margin-bottom:10px">Supprime <b>toutes</b> tes données (homme + femme). Irréversible.</div>
    <button class="btn be bsm bw" onclick="resetStep1()">🗑 Tout effacer</button>
  </div></div>`;
  el.innerHTML=h;
  renderSyncBadge();
}

function renderSouplesse(){
  const sc=document.getElementById('screen-souplesse');
  const zones=[
    {key:'h',icon:'💪',label:'Haut du corps',sub:'Épaules, bras, poignets, cou — exos 1–15'},
    {key:'m',icon:'🔄',label:'Milieu du corps',sub:'Dos, hanches, colonne — exos 16–29'},
    {key:'b',icon:'🦵',label:'Bas du corps',sub:'Cuisses, mollets, pieds — exos 30–35'},
  ];
  const totDur=STRETCH.reduce((a,s)=>a+(s.dur||30),0);
  const activeS=A.stretchIdx!==null?STRETCH[A.stretchIdx]:null;

  const activeHtml=activeS?`
    <div class="ast">
      <button class="ast-close" onclick="A.stretchIdx=null;A.stretchEnd=null;if(A.stretchTick){clearInterval(A.stretchTick);A.stretchTick=null;}renderSouplesse()">✕</button>
      <div class="an">EXERCICE ${activeS.n}</div>
      <div class="at">${activeS.title||'Exercice '+activeS.n}</div>
      <div class="ast-ctl">
        <button class="ast-play" onclick="toggleStretchTimer()">${A.stretchTick?'⏸':'▶'}</button>
        <div class="ast-ring">
          <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--s3)" stroke-width="3"/><circle id="ast-r" cx="18" cy="18" r="15" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-dasharray="94.248" stroke-dashoffset="${A.stretchTick&&A.stretchEnd?(94.248*(1-(A.stretchEnd-Date.now())/(A.stretchTotal*1000))):0}" transform="rotate(-90 18 18)" style="transition:stroke-dashoffset .1s"/></svg>
        </div>
        <div class="ast-time" id="ast-t">${A.stretchEnd?fmtS((A.stretchEnd-Date.now())/1000):fmtS(activeS.dur||30)}</div>
        <div class="ast-hint">Tenir sans forcer. Respirer calmement et profondément.</div>
      </div>
    </div>`:
    `<div class="slab" style="padding-top:10px">Sélectionne un exercice pour lancer le timer</div>`;

  const zonesHtml=zones.map(z=>{
    const items=STRETCH.filter(s=>s.z===z.key);
    const itmHtml=items.map(s=>`
      <div class="sti">
        <div class="stn">${s.n}</div>
        <div class="stb">
          <div class="sttitle">${s.title||'Exercice '+s.n}</div>
          <div class="stdesc">${s.desc}</div>
          <div class="stfoot">
            <span class="zone-tag zt-${s.z}">${z.label}</span>
            <span class="chip" style="font-size:9px">${s.dur||30}s</span>
            <button class="stbtn" onclick="startStretch(${s.n-1})">▶ TIMER</button>
          </div>
        </div>
      </div>`).join('');
    return`
      <div class="szone">
        <div class="szh" onclick="this.classList.toggle('open')">
          <span class="ic">${z.icon}</span><h3>${z.label}</h3>
          <span class="cnt">${items.length} exos</span>
          <span class="chv">▾</span>
        </div>
        <div class="szb">${itmHtml}</div>
      </div>`;
  }).join('');

  sc.innerHTML=`
    <div class="tb"><h1>SOUPLESSE</h1><div class="sp"></div><span class="chip cin">35 exos · ${Math.round(totDur/60)}min</span></div>
    <div class="sa">
      <div class="card">
        <div style="font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin-bottom:6px">La séance idéale (p.31)</div>
        <div style="font-size:13px;color:var(--dim);line-height:1.5">1h de musculation + <b style="color:var(--text)">20 min de souplesse</b> + 15 min de diaphragme = séance complète (~1h30). La souplesse peut aussi se faire le soir séparément.</div>
      </div>
      ${activeHtml}
      ${zonesHtml}
      <div style="padding:14px;text-align:center;font-size:11px;color:var(--dim);line-height:1.5">Tenez chaque position sans jamais forcer. La souplesse s'acquiert progressivement, séance après séance.</div>
    </div>`;
}

function startStretch(idx){
  if(A.stretchTick){clearInterval(A.stretchTick);A.stretchTick=null;}
  A.stretchIdx=idx;A.stretchEnd=null;A.stretchTotal=STRETCH[idx]?.dur||30;
  renderSouplesse();
}

function toggleStretchTimer(){
  if(A.stretchTick){clearInterval(A.stretchTick);A.stretchTick=null;renderSouplesse();return;}
  const s=STRETCH[A.stretchIdx];if(!s)return;
  const dur=s.dur||30;
  A.stretchTotal=dur;
  A.stretchEnd=Date.now()+dur*1000;
  A.stretchTick=setInterval(()=>{
    const rem=(A.stretchEnd-Date.now())/1000;
    const te=document.getElementById('ast-t');
    const tr=document.getElementById('ast-r');
    if(te)te.textContent=fmtS(rem);
    if(tr)tr.style.strokeDashoffset=94.248*(1-Math.max(0,rem)/dur);
    if(rem<=0){
      clearInterval(A.stretchTick);A.stretchTick=null;
      beep();
      A.stretchIdx=A.stretchIdx<STRETCH.length-1?A.stretchIdx+1:null;
      A.stretchEnd=null;
      renderSouplesse();
    }
  },200);
  renderSouplesse();
}

// ═══════════════════════════════ RENDER — MOI ═══════════════════════════════
function renderMoi(){
  if(isF()){renderMoiF();return;}
  const sc=document.getElementById('screen-moi');
  const p=getProfile()||{};
  const ss=getSessions();
  const lv=LVL[p.levelId];
  const totalR=ss.reduce((a,s)=>{if(!s.exercises)return a;return a+s.exercises.reduce((b,e)=>b+e.sets.reduce((c,st)=>c+(st.reps||0),0),0);},0);
  const thisWk=ss.filter(s=>(Date.now()-new Date(s.date))/(86400000)<7).length;
  const days=ss.length?Math.ceil((Date.now()-new Date(ss[ss.length-1].date))/86400000):0;

  let sessHtml='';
  if(!ss.length){
    sessHtml=`<div class="empty"><div class="ic">📋</div><p>Tes séances s'afficheront ici</p></div>`;
  } else {
    ss.slice(0,20).forEach(s=>{
      const isExp=A.expandSess===s.id;
      const pr=PROGS[s.programId];
      const dur=s.durationSeconds?fmtS(s.durationSeconds):'—';
      const tr=s.exercises?s.exercises.reduce((a,e)=>a+e.sets.reduce((b,st)=>b+(st.reps||0),0),0):0;
      const expHtml=isExp&&s.exercises?`<div class="si-inner"><div style="margin-top:8px">${s.exercises.map(e=>{const ex=EXO[e.exoId];const rs=e.sets.map(st=>st.reps).join('·');const tot=e.sets.reduce((a,st)=>a+(st.reps||0),0);return`<div class="mr"><span class="mr-id">${e.exoId}</span><span class="mr-nm">${ex?ex.name:e.exoId}</span><span class="mr-rp">${rs} = ${tot}</span></div>`;}).join('')}</div></div>`:'';
      sessHtml+=`
        <div class="si" onclick="toggleSi('${s.id}')">
          <div class="si-hdr">
            <div class="si-date"><div class="d">${fDay(s.date)}</div><div class="m">${fMon(s.date)}</div></div>
            <div class="si-info"><div class="si-prog">${pr?pr.label:s.programId}</div><div class="si-meta">${dur} · ${tr} reps · ${fDate(s.date)}</div></div>
            <div class="si-feel">${feelE(s.feeling||3)}</div>
          </div>
          <div class="si-exp ${isExp?'open':''}">${expHtml}</div>
        </div>`;
    });
  }

  const lvHtml=LEVELS.map(l=>`
    <div class="lvo ${p.levelId===l.id?'sel':''}" onclick="selLevel('${l.id}')">
      <span class="n">${l.num}</span>
      <div class="i"><div class="na">${l.label}</div><div class="de">${l.short}</div></div>
      <div class="ck">${p.levelId===l.id?'✓':''}</div>
    </div>`).join('');

  sc.innerHTML=`
    <div class="tb"><h1>MOI</h1><div class="sp"></div><span id="sync-badge"></span></div>
    <div class="sa">
      <div class="stat-row" style="margin-top:10px">
        <div class="stat"><div class="v">${ss.length}</div><div class="l">Séances</div></div>
        <div class="stat"><div class="v">${thisWk}</div><div class="l">Cette sem.</div></div>
        <div class="stat"><div class="v">${days}</div><div class="l">Jours</div></div>
        <div class="stat"><div class="v">${(totalR/1000).toFixed(1)}k</div><div class="l">Reps</div></div>
      </div>

      ${renderTestCard()}

      <div class="slab">Historique</div>
      ${sessHtml}

      <div class="slab">Équipement</div>
      <div class="card card0">
        <div class="trr"><div class="trl"><div class="main">🏋️ Barre de traction</div><div class="sub">Barre fixe, espalier, porte</div></div><label class="tgl"><input type="checkbox" ${p.hasBar?'checked':''} onchange="setEquip('bar',this.checked)"><span class="tgl-t"></span><span class="tgl-h"></span></label></div>
        <div class="trr"><div class="trl"><div class="main">🪑 Chaises disponibles</div><div class="sub">Chaises solides, tabourets</div></div><label class="tgl"><input type="checkbox" ${p.hasChairs!==false?'checked':''} onchange="setEquip('chairs',this.checked)"><span class="tgl-t"></span><span class="tgl-h"></span></label></div>
      </div>

      <div class="slab">Niveau actuel</div>
      <div class="card card0" style="max-height:380px;overflow-y:auto">${lvHtml}</div>

      <div class="slab">Programme</div>
      <div class="card" style="border-color:rgba(249,115,22,.25)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div style="font-size:22px">🏋️</div>
          <div style="flex:1"><div style="font-size:14px;font-weight:800">Mode Homme</div><div style="font-size:11px;color:var(--dim)">13 niveaux · Protéo-System</div></div>
          <span class="chip cac">Actif</span>
        </div>
        <button class="btn bs bsm bw" onclick="switchMode('F')">🌸 Passer au programme Féminin</button>
        ${S.profileF?`<div style="font-size:10px;color:var(--ok);text-align:center;margin-top:6px">✓ Profil féminin existant — tes données seront conservées</div>`:'<div style="font-size:10px;color:var(--dim);text-align:center;margin-top:6px">Tu configureras ton premier programme féminin</div>'}
      </div>

      <div class="slab">Compte</div>
      <div class="card card0">
        <div style="display:flex;align-items:center;gap:10px;padding:12px 14px">
          ${syncUser&&syncUser.photoURL?`<img src="${syncUser.photoURL}" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border)">`:`<div style="width:32px;height:32px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#000">${(syncUser?.displayName||'?')[0]}</div>`}
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${syncUser?.displayName||'Connecté'}</div>
            <div style="font-size:11px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${syncUser?.email||''}</div>
          </div>
          <button class="btn bs bsm" onclick="signOut()">Déconnexion</button>
        </div>
      </div>

      <div class="slab">Zone danger</div>
      <div class="card" style="border-color:rgba(239,68,68,.25)">
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">
          <span style="font-size:20px">⚠️</span>
          <div>
            <div style="font-size:14px;font-weight:800;color:var(--err)">Réinitialiser toutes les données</div>
            <div style="font-size:12px;color:var(--dim);line-height:1.5;margin-top:4px">Supprime l'intégralité de ta progression : séances, records, test de capacité, niveau. Tu reviendras à l'écran de test initial. <b style="color:var(--err)">Cette action est irréversible.</b></div>
          </div>
        </div>
        <button class="btn be bsm bw" onclick="resetStep1()">🗑 Tout effacer et recommencer</button>
      </div>
    </div>`;
}

function toggleSi(id){A.expandSess=A.expandSess===id?null:id;renderMoi();}
function setEquip(t,v){const p=getProfile()||{};if(t==='bar')p.hasBar=v;if(t==='chairs')p.hasChairs=v;S.profile=p;}
function selLevel(id){const p=getProfile()||{};p.levelId=id;S.profile=p;renderMoi();renderProgramme();}

function resetStep1(){
  if(!confirm('Effacer TOUTES tes données (homme + femme) ? Cette action est irréversible.')) return;
  resetStep2();
}
function resetStep2(){
  try{
    'lf2_mode lf2_profile_m lf2_profile_f lf2_sessions lf2_active lf2_targets lf2_test lf2_test_f lf2_prs'.split(' ').forEach(k=>localStorage.removeItem(k));
    // Also clear old key if exists
    localStorage.removeItem('lf2_profile');
    // Clear cloud too
    try{ const ref=userDocRef(); if(ref) ref.delete().catch(()=>{}); }catch(e){}
  }catch(e){}
  location.reload();
}

function renderTestCard(){
  const test=getTestResults();
  const prs=getPRs();
  
  if(!test && Object.keys(prs).length===0) return `
    <div class="slab">Test de capacité</div>
    <div class="card" style="text-align:center">
      <div style="font-size:30px;margin-bottom:6px">🎯</div>
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">Aucun test enregistré</div>
      <div style="font-size:12px;color:var(--dim);margin-bottom:12px">Fais le test initial pour calibrer ton programme</div>
      <button class="btn bp bsm bw" onclick="openTest(false)">FAIRE LE TEST</button>
    </div>`;
  
  // PR section - show all recorded PRs
  const prIds=['A','B','C','E','B1','B2','A2','A3','C1','C3','I','I1'];
  const prRows=prIds.filter(id=>prs[id]).map(id=>{
    const pr=prs[id];
    const e=EXO[id];
    const d=new Date(pr.date);
    const ds=d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
    const src=pr.source==='test_initial'?'test':'séance';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--border)">
      <span style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:var(--accent);min-width:24px">${id}</span>
      <span style="flex:1;font-size:13px;font-weight:600">${e?e.name:id}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:700">${pr.reps}</span>
      <span style="font-size:10px;color:var(--dim);min-width:40px;text-align:right">${ds}</span>
    </div>`;
  }).join('');
  
  // Test result summary
  let testHtml='';
  if(test){
    const d=new Date(test.date);
    const dateStr=d.toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
    const bR=test.bReps||0;
    const pillClass=bR>=8?'test-pill-2':bR>=5?'test-pill-2':'test-pill-1';
    const pillText=bR>=8?'NIV. 2':bR>=5?'PROG. 2':'PROG. 1';
    const resultCells=test.results.map(r=>`<div style="text-align:center"><span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent);font-weight:700">${r.exerciseId}</span><br><span style="font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700">${r.maxReps}</span></div>`).join('');
    testHtml=`
      <div class="test-card">
        <div class="test-card-hdr">
          <span class="icon">🎯</span>
          <span class="title">Test initial</span>
          <span class="date">${dateStr}</span>
        </div>
        <div style="padding:12px 14px;display:flex;gap:16px;justify-content:center;border-bottom:1px solid var(--border)">
          ${resultCells}
        </div>
        <div style="padding:8px 14px;display:flex;align-items:center;gap:8px">
          <span class="test-pill ${pillClass}" style="font-size:10px">${pillText}</span>
          <span style="flex:1"></span>
          <button class="btn bs bsm" onclick="openTest(false)">REFAIRE</button>
        </div>
      </div>`;
  }

  return `
    <div class="slab">Test & Records</div>
    ${testHtml}
    ${prRows?`<div class="card card0" style="margin-top:${test?'10':'0'}px">
      <div style="padding:10px 14px;background:var(--s2);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px">
        <span style="font-size:14px">🏅</span>
        <span style="font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--dim);flex:1">Records personnels</span>
      </div>
      ${prRows}
    </div>`:''}`;
}

// ═══════════════════════════════ TEST DE CAPACITÉ ═══════════════════════════════
// Test initial : max reps sur A (pompes), B (dips), C (tractions), E (squat 1 jambe)
// B ≤ 4 → Programme 1 (débutant complet, pas de B)
// B ≥ 5 → Programme 2 (inclut B dès le début)
// Tous les résultats servent de records initiaux.

const TEST_KEY='lf2_test';
const PR_KEY='lf2_prs';
function getTestResults(){try{return JSON.parse(localStorage.getItem(TEST_KEY))||null;}catch(e){return null;}}
function saveTestResults(r){localStorage.setItem(TEST_KEY,JSON.stringify(r));debouncedPush();}
function getPRs(){try{return JSON.parse(localStorage.getItem(PR_KEY))||{};}catch(e){return {};}}
function savePRs(p){localStorage.setItem(PR_KEY,JSON.stringify(p));debouncedPush();}
function updatePR(exoId,reps,source){
  const prs=getPRs();
  const cur=prs[exoId];
  if(!cur||reps>cur.reps){
    prs[exoId]={reps,date:new Date().toISOString(),source:source||'session'};
    savePRs(prs);
    return true; // new PR!
  }
  return false;
}

// Test exercises config
function getTestExercises(){
  const hasBar=T.hasBar;
  const exos=[
    {id:'A',label:'Pompes',why:'Référence haut du corps (poussée)'},
    {id:'B',label:'Dips',why:'⚡ Détermine ton niveau : ≤4 → Prog.1 · 5–7 → Prog.2 · ≥8 → Niveau 2 direct'},
  ];
  if(hasBar) exos.push({id:'C',label:'Tractions',why:'Référence dos/biceps. Comparé au niveau 5'});
  exos.push({id:'E',label:'Squat 1 jambe',why:'Référence jambes (chaque jambe séparément)'});
  return exos;
}

// Test state
const T={phase:'intro',reps:{},hasBar:false,fromOnboarding:false};

function openTest(fromOnboarding){
  T.phase='intro';T.reps={};T.fromOnboarding=!!fromOnboarding;
  const p=getProfile();
  if(p)T.hasBar=!!p.hasBar;
  else T.hasBar=document.getElementById('ob-bar')?.checked||false;
  document.getElementById('test-overlay').classList.add('on');
  renderTest();
}

function closeTest(){
  document.getElementById('test-overlay').classList.remove('on');
  T.phase='intro';
}

function testChReps(exoId,d){
  T.reps[exoId]=Math.max(0,(T.reps[exoId]||0)+d);
  const el=document.getElementById('trv-'+exoId);
  if(el)el.textContent=T.reps[exoId];
}

function editTestReps(exoId){
  const el=document.getElementById('trv-'+exoId);if(!el)return;
  const cur=T.reps[exoId]||0;
  const inp=document.createElement('input');
  inp.type='number';inp.inputMode='numeric';inp.pattern='[0-9]*';
  inp.value=cur;inp.min=0;inp.max=999;
  inp.style.cssText='font-family:"JetBrains Mono",monospace;font-size:36px;font-weight:700;text-align:center;width:80px;height:52px;background:var(--s3);border:2px solid var(--accent);border-radius:8px;color:var(--text);outline:none;-webkit-appearance:none';
  el.replaceWith(inp);inp.focus();inp.select();
  const finish=()=>{
    const v=Math.max(0,parseInt(inp.value)||0);
    T.reps[exoId]=v;
    const div=document.createElement('div');
    div.className='test-rep-val';div.id='trv-'+exoId;div.textContent=v;
    div.onclick=()=>editTestReps(exoId);
    inp.replaceWith(div);
  };
  inp.addEventListener('blur',finish);
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();inp.blur();}});
}

function testShowResults(){T.phase='result';renderTest();}

function testFinish(){
  const bReps=T.reps['B']||0;
  // Routing: B<=4 → Prog1, B 5-7 → Prog2, B>=8 → Niveau 2
  let assignedLevel='niveau_1';
  let assignedProg='niv1p1';
  if(bReps>=8){assignedLevel='niveau_2';assignedProg='niv2p';}
  else if(bReps>=5){assignedProg='niv1p2';}
  
  // Save test results
  const testExos=getTestExercises();
  const results=testExos.map(te=>({exerciseId:te.id,maxReps:T.reps[te.id]||0}));
  const result={
    id:uid(),date:new Date().toISOString(),
    results,assignedProgramId:assignedProg,assignedLevel,
    bReps:bReps,cReps:T.reps['C']||0
  };
  saveTestResults(result);

  // Save all as initial PRs
  testExos.forEach(te=>{
    const r=T.reps[te.id]||0;
    if(r>0)updatePR(te.id,r,'test_initial');
  });

  if(T.fromOnboarding){
    S.profile={levelId:assignedLevel,hasBar:document.getElementById('ob-bar')?.checked||false,hasChairs:document.getElementById('ob-chairs')?.checked!==false,startedAt:new Date().toISOString(),assignedProgram:assignedProg};
    document.getElementById('ob').classList.remove('on');
  } else {
    const p=getProfile()||{};
    p.levelId=assignedLevel;
    p.assignedProgram=assignedProg;
    S.profile=p;
  }
  closeTest();
  switchTab('seance');
}

function renderTest(){
  const ov=document.getElementById('test-overlay');
  const testExos=getTestExercises();

  if(T.phase==='intro'){
    const exoCards=testExos.map((te,i)=>{
      const e=EXO[te.id];
      const reps=T.reps[te.id]||0;
      const isBkey=te.id==='B';
      return `
        <div class="test-exo" ${isBkey?'style="border-color:rgba(249,115,22,.4)"':''}>
          <div class="test-exo-hdr">
            <div class="tag">${isBkey?'⚡ ':''} Exercice ${te.id} — ${te.label}</div>
            <div class="muscles">${e?e.ms.join(' · '):''}</div>
          </div>
          ${e?`<div class="test-exo-body"><div class="desc">${e.desc}</div></div>`:''}
          <div class="test-hint">${te.why}</div>
          <div style="padding:10px 16px">
            <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text)">Ton max de reps :</div>
            <div class="test-rep-input">
              <div class="label">MAX</div>
              <button class="test-rep-btn" onclick="testChReps('${te.id}',-1)">−</button>
              <div class="test-rep-val" id="trv-${te.id}" onclick="editTestReps('${te.id}')">${reps}</div>
              <button class="test-rep-btn" onclick="testChReps('${te.id}',1)">+</button>
            </div>
          </div>
        </div>`;
    }).join('');

    ov.innerHTML=`
      <div class="test-hdr"><h2>TEST DE CAPACITÉ</h2><button class="xb" onclick="closeTest()">✕</button></div>
      <div class="test-body">
        <div class="test-intro">
          <div class="icon">🎯</div>
          <h3>Test initial</h3>
          <p>Fais le maximum de reps sur chaque exercice. Ces résultats servent de référence pour toute ta progression.</p>
        </div>
        <div style="padding:10px;background:rgba(249,115,22,.04);border:1px solid rgba(249,115,22,.15);border-radius:var(--r2);font-size:12px;color:var(--dim);line-height:1.5;margin-bottom:16px">
          ⚠️ <b style="color:var(--accent)">Échauffe-toi d'abord !</b> 3 rounds de cardio + pompes, puis 2 min de repos entre chaque exercice testé.
        </div>
        ${exoCards}
        <button class="btn bp bw" style="margin-top:6px" onclick="testShowResults()">VOIR MES RÉSULTATS →</button>
      </div>`;
    return;
  }

  if(T.phase==='result'){
    const bReps=T.reps['B']||0;
    let routeLevel,routeLabel,routeDesc,pillClass,pillText;
    if(bReps>=8){
      routeLevel='Niveau 2';routeLabel='Direct au niveau 2 !';
      routeDesc='Tu maîtrises déjà les dips. Tu passes directement au niveau 2 : 6 séries, rythme rapide, 25s de repos. C\'est parti !';
      pillClass='test-pill-2';pillText='NIVEAU 2';
    } else if(bReps>=5){
      routeLevel='Niveau 1';routeLabel='Programme 2 — Niveau 1';
      routeDesc='Tu inclus les dips dès le départ. Objectif : 8 reps à B pour passer au niveau 2.';
      pillClass='test-pill-2';pillText='PROG. 2';
    } else {
      routeLevel='Niveau 1';routeLabel='Programme 1 — Débutant';
      routeDesc='Tu commences sans dips (exo B). Focus sur pompes (A1), dos (C1), triceps (D) et le reste du corps.';
      pillClass='test-pill-1';pillText='PROG. 1';
    }
    const btnLabel=bReps>=8?'COMMENCER LE NIVEAU 2 →':'COMMENCER LE NIVEAU 1 →';
    
    const rows=testExos.map(te=>{
      const r=T.reps[te.id]||0;
      return `<div class="test-result-row">
        <span class="exo">${te.id}</span>
        <span class="info">${te.label}</span>
        <span class="val">${r} <span style="font-size:12px;color:var(--dim)">reps</span></span>
      </div>`;
    }).join('');

    ov.innerHTML=`
      <div class="test-hdr"><h2>RÉSULTATS</h2><button class="xb" onclick="T.phase='intro';renderTest()" style="font-size:13px">← Modifier</button></div>
      <div class="test-body">
        <div class="test-result">
          <div class="test-result-hdr">
            <div class="icon">📊</div>
            <h3>Tes records initiaux</h3>
            <p>Ces valeurs sont sauvegardées pour suivre ta progression</p>
          </div>
          ${rows}
        </div>
        <div style="margin-top:18px;text-align:center">
          <div style="font-size:10px;font-weight:800;letter-spacing:3px;color:var(--dim);text-transform:uppercase;margin-bottom:6px">Orientation (B = ${bReps} reps)</div>
          <div class="test-pill ${pillClass}">${pillText}</div>
          <div style="font-size:18px;font-weight:900;margin-top:8px">${routeLabel}</div>
          <div style="font-size:13px;color:var(--dim);line-height:1.5;margin-top:6px;max-width:320px;margin-left:auto;margin-right:auto">${routeDesc}</div>
        </div>
        <div style="margin:16px 0 0;padding:10px;background:var(--s2);border:1px solid var(--border);border-radius:var(--r2);font-size:11px;color:var(--dim);line-height:1.5;text-align:center">
          B ≤ 4 → Prog. 1 · B 5–7 → Prog. 2 · <b style="color:var(--text)">B ≥ 8 → Niveau 2</b>
        </div>
        <button class="btn bp bw" style="margin-top:14px" onclick="testFinish()">${btnLabel}</button>
      </div>`;
    return;
  }
}

// ═══════════════════════════════ TEST CAPACITÉ FEMME ═══════════════════════════════
const TF_QUESTIONS=[
  {q:"Regardez votre ventre de profil. Il est naturellement…",opts:["Très bombé","Bombé","Plat"]},
  {q:"Exercice de souplesse 18 — penchez-vous en avant, jambes tendues. La pointe de vos doigts touche…",opts:["Le tibia","La cheville","Le sol"]},
  {q:"Pouvez-vous contracter consciemment votre périnée ? La contraction totale est…",opts:["Très difficile","Difficile","Facile"]},
  {q:"Prenez une grande inspiration, puis soufflez en rentrant le ventre de bas en haut au maximum. C'est…",opts:["Très difficile","Difficile","Facile"]},
  {q:"Exercice de souplesse 7 — arrivez-vous à atteindre…",opts:["Le genou","Le côté du mollet","La cheville"]},
  {q:"Exercice de souplesse 21 — arrivez-vous à poser…",opts:["Les mains","Les avant-bras","Le front"]},
  {q:"Exercice de souplesse 30 — arrivez-vous à toucher avec…",opts:["Les mains","Les coudes","Les épaules"]},
  {q:"Le grand écart latéral (exercice 23) est pour vous…",opts:["Très dur","Dur","Facile"]},
  {q:"Le grand écart facial (exercice 25) est pour vous…",opts:["Très dur","Dur","Facile"]},
];
const TF_LABELS=['a','b','c'];

const TEST_KEY_F='lf2_test_f';
function getTestResultsF(){try{return JSON.parse(localStorage.getItem(TEST_KEY_F))||null;}catch(e){return null;}}
function saveTestResultsF(r){localStorage.setItem(TEST_KEY_F,JSON.stringify(r));debouncedPush();}

const TF={phase:'questions',answers:{},zoneId:'bas',fromOnboarding:false};

function openTestF(fromOnboarding){
  TF.phase='questions';TF.answers={};TF.fromOnboarding=!!fromOnboarding;
  TF.zoneId=obFemZoneVal||(getProfile()?.zoneId)||'bas';
  document.getElementById('test-overlay-f').classList.add('on');
  renderTestF();
}
function closeTestF(){
  document.getElementById('test-overlay-f').classList.remove('on');
  TF.phase='questions';
}

function testFAnswer(q,choice){
  TF.answers[q]=choice;
  // Update option highlight
  const card=document.getElementById('tfq-'+q);
  if(card){card.querySelectorAll('.tf-opt').forEach((el,i)=>{el.classList.toggle('sel',i===choice);});}
  // Enable button when all answered
  const btn=document.getElementById('tf-see-results');
  if(btn)btn.disabled=Object.keys(TF.answers).length<TF_QUESTIONS.length;
}

function testFShowResults(){TF.phase='result';renderTestF();}

function testFFinish(){
  const counts={a:0,b:0,c:0};
  Object.values(TF.answers).forEach(ans=>counts[TF_LABELS[ans]]++);
  const usePrep=counts.a>counts.c;
  const z=ZONE_MAP[TF.zoneId];
  const levelId=usePrep?z.levels[0].id:z.levels[1].id;

  // Durée de rééquilibrage selon les résultats (p. 37)
  let reequilMonths=0;
  if(counts.a>=6) reequilMonths=3;
  else if(usePrep) reequilMonths=2;
  else if(counts.c<6) reequilMonths=1;
  const reequil=reequilMonths>0?{
    months:reequilMonths,
    startDate:new Date().toISOString(),
    variant:reequilMonths>=3?'moinsMot':'plusMot',
    active:true
  }:null;

  saveTestResultsF({date:new Date().toISOString(),answers:{...TF.answers},counts,zoneId:TF.zoneId,assignedLevel:levelId,reequilMonths});
  if(TF.fromOnboarding){
    S.profile={zoneId:TF.zoneId,levelId,reequil};
    document.getElementById('ob').classList.remove('on');
  } else {
    const p=getProfile()||{};p.levelId=levelId;p.reequil=reequil;S.profile=p;
  }
  closeTestF();
  applyGenderTheme();
  switchTab('seance');
}

function renderTestF(){
  const ov=document.getElementById('test-overlay-f');
  const z=ZONE_MAP[TF.zoneId];

  if(TF.phase==='questions'){
    const answered=Object.keys(TF.answers).length;
    const cards=TF_QUESTIONS.map((q,i)=>`
      <div class="tf-q" id="tfq-${i}">
        <div class="tf-q-hdr">
          <div class="tf-q-num">QUESTION ${i+1} / ${TF_QUESTIONS.length}</div>
          <div class="tf-q-text">${q.q}</div>
        </div>
        ${q.opts.map((opt,j)=>`
          <div class="tf-opt${TF.answers[i]===j?' sel':''}" onclick="testFAnswer(${i},${j})">
            <div class="tf-opt-l">${TF_LABELS[j].toUpperCase()}</div>
            <div class="tf-opt-text">${opt}</div>
          </div>`).join('')}
      </div>`).join('');

    ov.innerHTML=`
      <div class="test-hdr">
        <h2>TEST DE CAPACITÉ</h2>
        <button class="xb" onclick="closeTestF()">✕</button>
      </div>
      <div class="test-body">
        <div class="test-intro">
          <div class="icon">📋</div>
          <h3>Questionnaire initial</h3>
          <p>Réponds honnêtement à chaque question. Ces réponses déterminent ton niveau de départ optimal.</p>
        </div>
        <div style="padding:10px;background:rgba(232,121,160,.04);border:1px solid rgba(232,121,160,.2);border-radius:var(--r2);font-size:12px;color:var(--dim);line-height:1.5;margin-bottom:16px">
          ℹ️ <b style="color:var(--accent)">Ne force jamais les réponses.</b> Il n'y a pas de « bonne » réponse — tu risquerais de te blesser. Consulte les descriptions des exercices 18, 21, 30 dans l'onglet Souplesse.
        </div>
        ${cards}
        <button id="tf-see-results" class="btn bp bw" style="margin-top:6px" onclick="testFShowResults()" ${answered<TF_QUESTIONS.length?'disabled':''}>VOIR MON RÉSULTAT →</button>
      </div>`;
    return;
  }

  if(TF.phase==='result'){
    const counts={a:0,b:0,c:0};
    Object.values(TF.answers).forEach(ans=>counts[TF_LABELS[ans]]++);
    const usePrep=counts.a>counts.c;
    const assignedLevelId=usePrep?z.levels[0].id:z.levels[1].id;
    const lv=z.levels.find(l=>l.id===assignedLevelId);

    let routeLabel,routeDesc,pillClass;
    if(counts.a>=6){
      routeLabel='Préparation — 3 mois';
      routeDesc='Tu as besoin de préparer ton corps avant la musculation. Commence par le programme de rééquilibrage pendant 3 mois.';
      pillClass='test-pill-1';
    } else if(usePrep){
      routeLabel='Préparation — 2 mois';
      routeDesc='Deux mois de rééquilibrage sont recommandés avant d\'aborder pleinement la musculation.';
      pillClass='test-pill-1';
    } else if(counts.c>=6){
      routeLabel='Niveau 1 — Dès maintenant';
      routeDesc='Ton corps est prêt. Tu peux commencer la musculation directement au niveau 1.';
      pillClass='test-pill-2';
    } else {
      routeLabel='Niveau 1 — 1 mois de rééquilibrage';
      routeDesc='Tu es proche du niveau musculaire, mais un mois de rééquilibrage sera un bon investissement avant le niveau 1.';
      pillClass='test-pill-2';
    }

    const countRows=['a','b','c'].map(l=>`
      <div class="test-result-row">
        <span class="exo" style="font-size:15px">${l.toUpperCase()}</span>
        <span class="info">${l==='a'?'Réponses difficiles':l==='b'?'Réponses intermédiaires':'Réponses faciles'}</span>
        <span class="val">${counts[l]} <span style="font-size:12px;color:var(--dim)">/ 9</span></span>
      </div>`).join('');

    ov.innerHTML=`
      <div class="test-hdr">
        <h2>RÉSULTATS</h2>
        <button class="xb" onclick="TF.phase='questions';renderTestF()" style="font-size:13px">← Modifier</button>
      </div>
      <div class="test-body">
        <div class="test-result" style="margin-top:0">
          <div class="test-result-hdr">
            <div class="icon">📊</div>
            <h3>Ton profil</h3>
            <p>Zone sélectionnée : <b>${z.label}</b></p>
          </div>
          ${countRows}
        </div>
        <div style="margin-top:18px;text-align:center">
          <div style="font-size:10px;font-weight:800;letter-spacing:3px;color:var(--dim);text-transform:uppercase;margin-bottom:6px">Niveau recommandé</div>
          <div class="test-pill ${pillClass}">${lv?.label||assignedLevelId}</div>
          <div style="font-size:18px;font-weight:900;margin-top:8px">${routeLabel}</div>
          <div style="font-size:13px;color:var(--dim);line-height:1.5;margin-top:6px;max-width:320px;margin-left:auto;margin-right:auto">${routeDesc}</div>
        </div>
        <div style="margin:16px 0 0;padding:10px;background:var(--s2);border:1px solid var(--border);border-radius:var(--r2);font-size:11px;color:var(--dim);line-height:1.5;text-align:center">
          Surtout a → Préparation · Surtout b+c → <b style="color:var(--text)">Niveau 1 direct</b>
        </div>
        <button class="btn bp bw" style="margin-top:14px" onclick="testFFinish()">COMMENCER →</button>
      </div>`;
  }
}

function renderTestCardF(){
  const test=getTestResultsF();
  if(!test)return`
    <div class="slab">Test de capacité</div>
    <div class="card" style="text-align:center">
      <div style="font-size:30px;margin-bottom:6px">📋</div>
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">Aucun test enregistré</div>
      <div style="font-size:12px;color:var(--dim);margin-bottom:12px">Fais le questionnaire pour calibrer ton niveau de départ</div>
      <button class="btn bp bsm bw" onclick="openTestF(false)">FAIRE LE TEST</button>
    </div>`;
  const z=ZONE_MAP[test.zoneId];const lv=z?.levels.find(l=>l.id===test.assignedLevel);
  const ds=new Date(test.date).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'});
  const c=test.counts||{a:0,b:0,c:0};
  return`
    <div class="slab">Test de capacité</div>
    <div class="test-card">
      <div class="test-card-hdr"><div class="icon">📋</div><div class="title">Questionnaire</div><div class="date">${ds}</div></div>
      <div style="padding:12px 14px">
        <div style="display:flex;gap:8px;margin-bottom:10px">
          ${['a','b','c'].map(l=>`<div style="flex:1;text-align:center;background:var(--s2);border-radius:8px;padding:8px 4px;border:1px solid var(--border)"><div style="font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700">${c[l]||0}</div><div style="font-size:10px;color:var(--dim);font-weight:700;letter-spacing:1px">Rép. ${l.toUpperCase()}</div></div>`).join('')}
        </div>
        <div style="font-size:12px;color:var(--dim);text-align:center;margin-bottom:10px">Niveau assigné : <b style="color:var(--text)">${lv?.label||test.assignedLevel}</b></div>
        ${test.reequilMonths>0?`<div style="font-size:12px;color:var(--accent);text-align:center;font-weight:700;margin-bottom:8px">Rééquilibrage : ${test.reequilMonths} mois</div>`:''}
        <button class="btn bs bsm" onclick="openTestF(false)">REFAIRE</button>
      </div>
    </div>`;
}

// ═══════════════════════════════ NAV ═══════════════════════════════
function switchTab(t){
  A.tab=t;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.tbn').forEach(b=>b.classList.remove('on'));
  document.getElementById('screen-'+t).classList.add('active');
  document.querySelector(`.tbn[data-tab="${t}"]`).classList.add('on');
  renderTab(t);
}
function renderTab(t){
  if(t==='seance')renderSeance();
  else if(t==='programme')renderProgramme();
  else if(t==='souplesse')renderSouplesse();
  else if(t==='moi')renderMoi();
}

// ═══════════════════════════════ GENDER HELPERS ═══════════════════════════════
function isF(){return S.mode==='F';}
function applyGenderTheme(){if(isF())document.body.classList.add('fem');else document.body.classList.remove('fem');}
function getExo(id){if(id&&id.startsWith('f_'))return EXO_F[id];return EXO[id];}

function switchMode(mode){
  // Abandon any active session first
  if(getActive()){S.active=null;stopElapsed();stopTimer();hideRest();A.phase='idle';A.sessStart=null;A.reps={};}
  S.mode=mode;
  applyGenderTheme();
  viewZoneF=null;
  const p=S.profile; // will now read from the new mode's key
  if(!p){
    // No profile for this mode yet → show mini-onboarding
    document.getElementById('ob').classList.add('on');
    document.querySelectorAll('.ob-step').forEach(s=>s.classList.remove('on'));
    if(mode==='F'){
      let html='';ZONES.forEach(z=>{html+=`<div class="fem-zone-opt" id="fzo_${z.id}" onclick="obFemZone('${z.id}')"><div class="fzi">${z.icon}</div><div class="fzn">${z.label}</div></div>`;});
      document.getElementById('fem-zone-grid').innerHTML=html;
      document.getElementById('ob_fem').classList.add('on');
    } else {
      document.getElementById('ob1').classList.add('on');
    }
  } else {
    switchTab('seance');
  }
}

// ═══════════════════════════════ GENDER ONBOARDING ═══════════════════════════════
let obGenderVal=null;
function obGender(g){
  obGenderVal=g;
  document.querySelectorAll('.gender-opt').forEach(el=>el.classList.remove('sel'));
  document.getElementById('gopt_'+g).classList.add('sel');
  const btn=document.getElementById('ob0-btn');btn.style.opacity='1';btn.style.pointerEvents='auto';
  if(g==='F')document.body.classList.add('fem');else document.body.classList.remove('fem');
}
function obBack(){
  document.querySelectorAll('.ob-step').forEach(s=>s.classList.remove('on'));
  document.getElementById('ob0').classList.add('on');
  S.mode=null;
  if(obGenderVal==='F')document.body.classList.add('fem');else document.body.classList.remove('fem');
}
function obGenderNext(){
  if(!obGenderVal)return;
  S.mode=obGenderVal;
  applyGenderTheme();
  document.getElementById('ob0').classList.remove('on');
  if(obGenderVal==='F'){
    let html='';ZONES.forEach(z=>{html+=`<div class="fem-zone-opt" id="fzo_${z.id}" onclick="obFemZone('${z.id}')"><div class="fzi">${z.icon}</div><div class="fzn">${z.label}</div></div>`;});
    document.getElementById('fem-zone-grid').innerHTML=html;
    document.getElementById('ob_fem').classList.add('on');
  } else {
    document.getElementById('ob1').classList.add('on');
  }
}
let obFemZoneVal=null;
function obFemZone(id){
  obFemZoneVal=id;
  document.querySelectorAll('.fem-zone-opt').forEach(el=>el.classList.remove('sel'));
  document.getElementById('fzo_'+id)?.classList.add('sel');
}
function obFemStartTest(){
  if(!obFemZoneVal)obFemZoneVal='bas';
  openTestF(true);
}
function obFemFinish(){
  if(!obFemZoneVal)obFemZoneVal='bas';
  const z=ZONE_MAP[obFemZoneVal];
  S.profile={zoneId:obFemZoneVal,levelId:z.levels[0].id};
  document.getElementById('ob').classList.remove('on');
  applyGenderTheme();
  switchTab('seance');
}

// ═══════════════════════════════ FEMME: rééquilibrage helpers ═══════════════════════════════
function isReequilActive(){
  const p=getProfile();
  if(!p?.reequil?.active)return false;
  const end=new Date(p.reequil.startDate);
  end.setMonth(end.getMonth()+p.reequil.months);
  return new Date()<end;
}
function reequilDaysLeft(){
  const p=getProfile();if(!p?.reequil)return 0;
  const end=new Date(p.reequil.startDate);
  end.setMonth(end.getMonth()+p.reequil.months);
  return Math.max(0,Math.ceil((end-new Date())/86400000));
}
function reequilEndDate(){
  const p=getProfile();if(!p?.reequil)return null;
  const end=new Date(p.reequil.startDate);
  end.setMonth(end.getMonth()+p.reequil.months);
  return end;
}
function endReequil(){
  if(!confirm('Terminer le rééquilibrage et passer au programme zone ?'))return;
  const p=getProfile();if(!p)return;
  if(p.reequil)p.reequil.active=false;
  S.profile=p;renderSeance();
}
function toggleReequilOpt(){
  const p=getProfile();if(!p?.reequil)return;
  p.reequil.transOpt=(p.reequil.transOpt||1)===1?2:1;
  S.profile=p;renderSeance();
}

// ═══════════════════════════════ FEMME: getCurProg override ═══════════════════════════════
function getCurProgF(){
  const p=getProfile();if(!p)return null;
  if(isReequilActive()){
    const variant=p.reequil.variant||'moinsMot';
    const opt=p.reequil.transOpt||1;
    const rp=REEQUIL_F[variant];
    const partie1=opt===2?rp.slotsOpt2:rp.slotsOpt1;
    const slots=[...partie1,...REEQUIL_F.partie2];
    return{id:rp.id,label:rp.label,slots,isReequil:true,stretchNums:rp.stretchNums};
  }
  if(!p.zoneId||!p.levelId)return null;
  const z=ZONE_MAP[p.zoneId];if(!z)return null;
  const lvl=z.levels.find(l=>l.id===p.levelId);
  return lvl?{id:lvl.id,levelId:p.zoneId,label:lvl.label,slots:lvl.slots}:null;
}

// ═══════════════════════════════ ONBOARDING ═══════════════════════════════
function obNext(){
  openTest(true);
}
function obFinish(){
  openTest(true);
}

// ═══════════════════════════════ BOOT ═══════════════════════════════
// Migrate old single-profile key to new dual-profile system
(function migrate(){
  try{
    const old=JSON.parse(localStorage.getItem('lf2_profile'));
    if(old && !localStorage.getItem('lf2_profile_m') && !localStorage.getItem('lf2_profile_f')){
      if(old.gender==='F'||old.zoneId){
        localStorage.setItem('lf2_profile_f',JSON.stringify(old));
        localStorage.setItem('lf2_mode',JSON.stringify('F'));
      } else {
        localStorage.setItem('lf2_profile_m',JSON.stringify(old));
        localStorage.setItem('lf2_mode',JSON.stringify('M'));
      }
      localStorage.removeItem('lf2_profile');
    }
  }catch(e){}
})();

document.querySelectorAll('.tbn').forEach(b=>b.addEventListener('click',()=>{viewZoneF=null;switchTab(b.dataset.tab);}));
window.addEventListener('load',()=>{
  const hasAny=S.profileM||S.profileF;
  if(hasAny){
    applyGenderTheme();
    document.getElementById('ob').classList.remove('on');
    const active=getActive();
    if(active){A.sessStart=Date.now()-((active.startedAt?Date.now()-new Date(active.startedAt).getTime():0));A.phase='workout';}
    switchTab('seance');
  } else {
    document.getElementById('ob').classList.add('on');
  }
});

