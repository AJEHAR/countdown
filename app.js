/* AZ=R Countdown — shared logic for the display (/) and phone remote (/kawal/) */
(function(){
'use strict';
const MODE=window.APP_MODE==='control'?'control':'display';
document.body.classList.add('mode-'+MODE);
const CFG=window.FIREBASE_CONFIG||{};
const HAS_FB=!!(window.firebase&&CFG.apiKey&&CFG.databaseURL&&!/GANTI/i.test(CFG.apiKey));
const KEY='papanMasa.v1',RKEY='papanMasa.run.v1',ROOMKEY='papanMasa.room.v1',CTLKEY='papanMasa.ctlroom.v1',LANGKEY='papanMasa.lang';
const BASE=MODE==='control'?'../':'';

const $=id=>document.getElementById(id);
const uid=()=>Math.random().toString(36).slice(2,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null}catch(e){return null}}
function lsGet(k){try{return localStorage.getItem(k)||''}catch(e){return ''}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
const CODE_CH='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode=()=>Array.from({length:6},()=>CODE_CH[Math.floor(Math.random()*CODE_CH.length)]).join('');
const cleanCode=c=>String(c||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);

/* ---------- Language ---------- */
const DICT=window.I18N||{en:{}};
let LANG=lsGet(LANGKEY)==='ms'?'ms':'en';
function t(k,v){let s=(DICT[LANG]&&DICT[LANG][k])??(DICT.en[k])??k;if(v)for(const x in v)s=s.split('{'+x+'}').join(v[x]);return s}
function applyStatic(){
  document.documentElement.lang=LANG==='ms'?'ms':'en';
  document.title=MODE==='control'?t('appTitle')+' · '+t('ctlTitle'):t('appTitle');
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n)});
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{el.placeholder=t(el.dataset.i18nPh)});
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{el.setAttribute('aria-label',t(el.dataset.i18nAria))});
  document.querySelectorAll('.lang-switch button').forEach(b=>b.classList.toggle('on',b.dataset.lang===LANG));
}
function setLang(l){LANG=l==='ms'?'ms':'en';lsSet(LANGKEY,LANG);dateFmt=null;applyStatic();renderStage();if(settingsOpen())renderEditor();if(tourOpen())renderTour();updConn();if(!$('pair')||$('pair').hidden)return;openPair()}

/* ---------- Data ---------- */
const timer=(label,min,alert=true,alertMin=5,sound='loceng')=>({id:uid(),label,min,alert,alertMin,sound});
const BUILTIN=['loceng','dingdong','bip','gong','penggera'];
let FILE_SOUNDS=[];
const validSound=k=>k==='none'||BUILTIN.includes(k)||(typeof k==='string'&&k.startsWith('f:'));
function sampleSet(){
  const f=t('sampleFooter');
  return {id:uid(),name:t('sampleName'),clock24:false,secs:false,showDate:true,scale:1,pi:0,pages:[
    {id:uid(),title:t('s1t'),notes:t('s1n'),align:'center',footer:f,mode:'separate',timers:[]},
    {id:uid(),title:t('s2t'),notes:t('s2n'),align:'left',footer:f,mode:'separate',timers:[]}
  ]};
}
/* Per-page size of each part of the display (1 = default). Bigger parts also get more room, so text is never cut off. */
const SIZE_KEYS=['clock','date','title','notes','footer','cd'];
function normSizes(z){const o={};SIZE_KEYS.forEach(k=>{const v=+(z&&z[k]);o[k]=v>=.6&&v<=1.6?v:1});return o}
const sizes=p=>normSizes(p.sizes);
const blankPage=f=>({id:uid(),title:t('newPageTitle'),notes:'',align:'center',footer:f||'',mode:'separate',timers:[]});
function normSet(s){
  const pages=(Array.isArray(s.pages)?s.pages:[]).map(p=>({id:uid(),title:String(p.title??''),notes:String(p.notes??''),
    align:['left','center','right'].includes(p.align)?p.align:'center',footer:String(p.footer??''),mode:p.mode==='continuous'?'continuous':'separate',sizes:normSizes(p.sizes),
    timers:(Array.isArray(p.timers)?p.timers:[]).slice(0,3).map(x=>({id:uid(),label:String(x.label??''),min:Math.max(.1,+x.min||1),alert:!!x.alert,alertMin:Math.max(0,+x.alertMin||0),sound:validSound(x.sound)?x.sound:'loceng'}))}));
  if(!pages.length)pages.push(blankPage(''));
  return {id:uid(),name:String(s.name||'Import'),clock24:!!s.clock24,secs:!!s.secs,showDate:s.showDate!==false,blinkColon:s.blinkColon!==false,scale:Math.min(1.5,Math.max(.6,+s.scale||1)),pi:0,pages};
}
const validState=d=>d&&Array.isArray(d.sets)&&d.sets.length&&d.sets.every(s=>s&&Array.isArray(s.pages)&&s.pages.length);

let S=load(KEY),R=load(RKEY)||{};
if(!validState(S))S={sets:[sampleSet()],cur:0};
if(!(S.cur>=0&&S.cur<S.sets.length))S.cur=0;
const set=()=>S.sets[S.cur];
const page=()=>{const s=set();s.pi=Math.min(Math.max(0,s.pi|0),s.pages.length-1);s.pages.forEach(p=>{if(!Array.isArray(p.timers))p.timers=[]});return s.pages[s.pi]};

/* ---------- Time ---------- */
let clockOff=0,headState='';
const now=()=>Date.now()+clockOff;
async function headSync(){
  try{const t0=Date.now();
    const r=await fetch(location.pathname+'?t='+t0,{method:'HEAD',cache:'no-store'});
    const t1=Date.now(),h=r.headers.get('date');if(!h)throw 0;
    const off=Date.parse(h)+500-(t0+t1)/2;
    clockOff=Math.abs(off)>3000?off:0;headState=clockOff?'fixed':'ok';
  }catch(e){headState='device'}
  updConn();
}
const p2=x=>String(x).padStart(2,'0');
function fmtClock(d,st,secs){const h=d.getHours();
  return (st.clock24?p2(h):String(h%12||12))+':'+p2(d.getMinutes())+(secs?':'+p2(d.getSeconds()):'')+(st.clock24?'':(h<12?' AM':' PM'))}
let dateFmt=null;
function fmtDate(d){
  if(!dateFmt){try{dateFmt=new Intl.DateTimeFormat(LANG==='ms'?'ms-MY':'en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}catch(e){dateFmt={format:x=>x.toDateString()}}}
  return dateFmt.format(d);
}

/* ---------- Storage & Firebase ---------- */
let db=null,roomRef=null,room=null,presRef=null,lastJSON='',pushT=null,online=false,ctlCount=0,dispCount=0;
function store(){try{localStorage.setItem(KEY,JSON.stringify(S));localStorage.setItem(RKEY,JSON.stringify(R))}catch(e){}}
function save(debounce){store();if(!roomRef)return;clearTimeout(pushT);if(debounce)pushT=setTimeout(push,400);else push()}
function push(){
  pushT=null;if(!roomRef)return;
  const str=JSON.stringify({S,R});if(str===lastJSON)return;lastJSON=str;
  roomRef.child('state').set(str).catch(err=>flash('Firebase: '+(err.code||err.message)));
}
function applyRemote(str){
  if(str===lastJSON)return;
  let d;try{d=JSON.parse(str)}catch(e){return}
  if(!d||!validState(d.S))return;
  lastJSON=str;S=d.S;R=d.R||{};if(!(S.cur>=0&&S.cur<S.sets.length))S.cur=0;
  clearTimeout(pushT);pushT=null;store();renderStage();
  if(settingsOpen()){const a=document.activeElement;if(!(a&&$('ed').contains(a)&&a.matches('input,textarea,select')))renderEditor()}
}
if(HAS_FB){
  try{
    firebase.initializeApp(CFG);db=firebase.database();
    db.ref('.info/serverTimeOffset').on('value',s=>{clockOff=s.val()||0});
    db.ref('.info/connected').on('value',s=>{online=!!s.val();
      if(online&&presRef){presRef.onDisconnect().remove();presRef.set(true)}
      updConn()});
  }catch(e){db=null}
}
if(!db){headSync();setInterval(headSync,600000)}

async function connect(code,create){
  disconnect();
  const ref=db.ref('rooms/'+code);
  let snap;
  try{snap=await ref.child('state').get()}catch(e){return 'error:'+(e.code||e.message)}
  if(!snap.exists()&&!create)return 'missing';
  room=code;roomRef=ref;
  if(snap.exists())applyRemote(snap.val());else push();
  ref.child('state').on('value',s=>{if(s.exists())applyRemote(s.val())});
  presRef=ref.child(MODE==='control'?'ctl':'disp').push();
  presRef.onDisconnect().remove();presRef.set(true);
  ref.child('ctl').on('value',s=>{const n=s.numChildren();
    if(MODE==='display'&&n>ctlCount&&$('pair')&&!$('pair').hidden)closeOverlay('pair');
    ctlCount=n;updConn()});
  ref.child('disp').on('value',s=>{dispCount=s.numChildren();updConn()});
  updConn();
  return 'ok';
}
function disconnect(){
  if(roomRef){roomRef.child('state').off();roomRef.child('ctl').off();roomRef.child('disp').off()}
  if(presRef){presRef.onDisconnect().cancel();presRef.remove();presRef=null}
  roomRef=null;room=null;lastJSON='';ctlCount=0;dispCount=0;
}
let connErr='';
function updConn(){
  if(MODE==='display'){
    const el=$('conn');if(!el)return;
    if(!db){el.textContent=headState?t({ok:'timeChecked',fixed:'timeFixed',device:'timeDevice'}[headState],{s:Math.round(clockOff/1000)}):'';return}
    if(connErr){el.textContent=t('fbFail',{e:connErr});return}
    el.innerHTML=room?`<span class="${online?'on-dot':''}">${online?'●':'○'}</span> ${esc(t('room',{code:''}))}<b>${room}</b> · ${esc(t('remotes',{n:ctlCount}))}`:esc(t('connecting'));
  }else{
    const el=$('k-status');if(!el)return;
    el.innerHTML=!online?esc(t('offline')):dispCount?`<span class="on-dot">●</span> ${esc(t('dispOn').replace('● ',''))}`:esc(t('dispOff'));
  }
}

/* ---------- Countdown logic ---------- */
function tstate(x,n){const r=R[x.id];if(!r)return 'idle';if(r.st==='run'){if(r.start&&n<r.start)return 'wait';return r.end<=n?'done':'run'}return r.st}
function remaining(x,n){const r=R[x.id],s=tstate(x,n);if(s==='idle')return x.min*60000;if(s==='wait')return r.end-r.start;if(s==='run')return Math.max(0,r.end-n);if(s==='pause')return r.left;return 0}
function fmt(ms){const s=Math.ceil(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?`${h}:${p2(m)}:${p2(x)}`:`${p2(m)}:${p2(x)}`}
function startT(x){const n=now(),r=R[x.id],s=tstate(x,n);if(s==='run')return;R[x.id]=s==='pause'?{st:'run',end:n+r.left}:{st:'run',end:n+x.min*60000}}
function pauseT(x){const n=now();if(tstate(x,n)==='run')R[x.id]={st:'pause',left:Math.max(0,R[x.id].end-n)}}
const findT=id=>page().timers.find(x=>x.id===id);
/* Continuous mode: countdowns run one after another; each later one is scheduled to start when the previous ends. */
const isChain=()=>page().mode==='continuous';
function startChain(){const n=now();let cur=n;
  page().timers.forEach(x=>{const s=tstate(x,n),r=R[x.id];
    if(s==='done')return;if(s==='run'){cur=r.end;return}
    const dur=s==='pause'?r.left:x.min*60000;
    R[x.id]={st:'run',start:cur>n?cur:0,end:cur+dur};cur+=dur;});
}
function pauseChain(){const n=now();page().timers.forEach(x=>{const s=tstate(x,n);if(s==='run')pauseT(x);else if(s==='wait')delete R[x.id]})}
const startAll=()=>{const n=now();if(isChain())startChain();else page().timers.forEach(x=>{if(tstate(x,n)!=='done')startT(x)});save();tick()};
const pauseAll=()=>{if(isChain())pauseChain();else page().timers.forEach(pauseT);save();tick()};

/* ---------- Rendering ---------- */
function renderStage(){
  const st=set(),p=page(),n=p.timers.length;
  if(MODE==='display'){
    document.documentElement.style.setProperty('--scale',st.scale);
    const stage=$('stage'),z=sizes(p);stage.classList.toggle('no-timers',!n);
    const shrink=v=>Math.min(v,1);
    [['--k-clock',shrink(z.clock)],['--k-date',z.date],['--k-title',shrink(z.title)],['--k-notes',shrink(z.notes)],['--k-footer',z.footer],['--k-cd',shrink(z.cd)]]
      .forEach(([k,v])=>stage.style.setProperty(k,v));
    stage.style.setProperty('--cols',`2fr ${z.cd}fr`);stage.style.setProperty('--prows',`3fr ${2*z.cd}fr`);
    const rows=[`<div class="row r-clock"><div class="plate"><div class="clock" id="clock"></div>${st.showDate!==false?'<div class="date" id="date"></div>':''}</div></div>`];
    /* Title, notes and footer read as one group: one box, centred together, spaced by type size. fitContent() sizes the text. */
    const hasContent=!!(p.title||p.notes||p.footer);
    if(hasContent)rows.push(`<div class="row r-content"><div class="content" id="content">${p.title?`<h1 class="title">${esc(p.title)}</h1>`:''}${p.notes?`<div class="notes" style="text-align:${p.align}">${esc(p.notes)}</div>`:''}${p.footer?`<div class="footer">${esc(p.footer)}</div>`:''}</div></div>`);
    const weights=hasContent?[z.clock,2]:[1];
    stage.innerHTML=`<section class="info" style="grid-template-rows:${weights.map(w=>`minmax(0,${w}fr)`).join(' ')}">${rows.join('')}</section>`+
      (n?`<aside class="panel" style="--n:${n}" aria-label="${esc(t('countdowns'))}">${p.timers.map(x=>`
        <div class="tcard" data-tid="${x.id}"><div class="tc-label">${esc(x.label||t('cdN',{n:''}))}</div><div class="tc-digits">--:--</div><div class="tc-sub"></div></div>`).join('')}</aside>`:'');
    fitContent();
    $('pinfo').innerHTML=`<b>${esc(st.name)}</b> · ${esc(t('pageOf',{a:st.pi+1,b:st.pages.length}))}`;
  }else{
    $('k-title').textContent=p.title||t('untitled');
    $('k-page').textContent=`${st.name} · ${t('pageOf',{a:st.pi+1,b:st.pages.length})}`;
    $('k-timers').innerHTML=n?p.timers.map(x=>`
      <div class="timer" data-tid="${x.id}">
        <div class="t-label">${esc(x.label||t('cdN',{n:''}))}</div>
        <div class="t-digits">--:--</div>
        <div class="t-state"></div>
        <div class="t-ctrl">
          <button class="btn b-start" data-act="start" data-tid="${x.id}">${esc(t('start'))}</button>
          <button class="btn b-pause" data-act="pause" data-tid="${x.id}">${esc(t('pause'))}</button>
          <button class="btn" data-act="reset" data-tid="${x.id}">${esc(t('reset'))}</button>
        </div>
      </div>`).join(''):`<p class="hint">${esc(t('noTimers'))}</p>`;
    $('k-pages').innerHTML=st.pages.map((pg,i)=>`<button class="chip${i===st.pi?' on':''}" data-act="goto" data-i="${i}">${i+1}. ${esc(pg.title||t('untitled'))}</button>`).join('');
    const dt=$('date');if(dt)dt.hidden=st.showDate===false;
  }
  $('b-prev').disabled=st.pi===0;
  $('b-next').disabled=st.pi===st.pages.length-1;
  tick();
}

function subText(x,s,st){
  if(s==='run')return t('ends',{t:fmtClock(new Date(R[x.id].end),st,false)});
  if(s==='wait')return t('startsAt',{t:fmtClock(new Date(R[x.id].start),st,false)});
  return t('st_'+s);
}
/* Size title, notes and footer from the box height, then shrink all three together until the group fits. */
function fitContent(){
  const box=document.querySelector('.r-content'),c=$('content');if(!box||!c)return;
  const H=box.clientHeight,W=box.clientWidth;if(!H||!W)return;
  const z=sizes(page()),tl=c.querySelector('.title'),nt=c.querySelector('.notes'),ft=c.querySelector('.footer');
  const base={title:.2*z.title,notes:.085*z.notes,footer:.04*z.footer};
  let k=set().scale;
  const apply=()=>{if(tl)tl.style.fontSize=(H*base.title*k).toFixed(2)+'px';if(nt)nt.style.fontSize=(H*base.notes*k).toFixed(2)+'px';if(ft)ft.style.fontSize=(H*base.footer*k).toFixed(2)+'px'};
  apply();
  for(let i=0;i<60&&(c.offsetHeight>H+1||c.scrollWidth>W+1);i++){k*=.95;apply()}
}
if(MODE==='display'){addEventListener('resize',()=>fitContent());try{document.fonts&&document.fonts.ready.then(()=>fitContent())}catch(e){}}
function tick(){
  const n=now(),d=new Date(n),st=set();
  const c=$('clock');if(c){const v=fmtClock(d,st,st.secs);if(c.dataset.v!==v){c.dataset.v=v;c.innerHTML=esc(v).replace(/:/g,'<span class="colon">:</span>')}
    c.classList.toggle('tick-off',st.blinkColon!==false&&d.getMilliseconds()>=500)}
  const dt=$('date');if(dt){const v=fmtDate(d);if(dt.textContent!==v)dt.textContent=v}
  page().timers.forEach(x=>{
    const el=document.querySelector(`[data-tid="${x.id}"].tcard, [data-tid="${x.id}"].timer`);if(!el)return;
    const s=tstate(x,n),left=remaining(x,n);el.dataset.st=s;
    if(el.classList.contains('tcard')){
      el.querySelector('.tc-digits').textContent=fmt(left);
      el.querySelector('.tc-sub').textContent=subText(x,s,st);
    }else{
      el.querySelector('.t-digits').textContent=fmt(left);
      el.querySelector('.t-state').textContent=subText(x,s,st);
      el.querySelector('.b-start').textContent=s==='pause'?t('resume'):t('start');
    }
  });
  checkEvents(n);
  if(settingsOpen()&&edTab==='data')document.querySelectorAll('#ed [data-exp]').forEach(el=>{const x=+el.dataset.exp;if(!x)return;const v=leftText(x);if(el.textContent!==v)el.textContent=v;el.classList.toggle('soon',x-now()<DAY)});
  const sn=$('snd');
  if(sn){const need=set().pages.some(pg=>pg.timers.some(x=>(x.sound||'loceng')!=='none'));
    const txt=!need?'':(actx&&actx.state==='running')?t('soundOn'):t('soundOff');
    if(sn.textContent!==txt)sn.textContent=txt}
}
setInterval(tick,250);

/* ---------- Blink 3 times & sound ---------- */
const prevS={};
function checkEvents(n){
  set().pages.forEach(pg=>pg.timers.forEach(x=>{
    const s=tstate(x,n),left=remaining(x,n),pv=prevS[x.id];prevS[x.id]={s,left};
    if(!pv)return;
    const thr=x.alertMin*60000;
    if(x.alert&&thr>0&&s==='run'&&pv.s==='run'&&pv.left>thr&&left<=thr)blink(x.id);
    if(s==='done'&&pv.s==='run'){if(x.alert)blink(x.id);if(MODE==='display')playSound(x.sound||'loceng')}
  }));
}
function blink(id){const el=document.querySelector(`[data-tid="${id}"].tcard, [data-tid="${id}"].timer`);if(!el)return;
  el.classList.remove('blink');void el.offsetWidth;el.classList.add('blink')}
document.addEventListener('animationend',e=>{if(e.target.classList&&e.target.classList.contains('blink'))e.target.classList.remove('blink')});

fetch(BASE+'sounds/sounds.json',{cache:'no-cache'}).then(r=>r.ok?r.json():[]).then(list=>{
  FILE_SOUNDS=(Array.isArray(list)?list:[]).filter(x=>x&&typeof x.fail==='string').map(x=>({key:'f:'+x.fail,file:x.fail,nama:String(x.nama||x.fail),name:String(x.name||x.nama||x.fail),rep:Math.min(10,Math.max(1,x.ulang|0||1))}));
  if(settingsOpen())renderEditor();
}).catch(()=>{});
function soundList(){
  const list=BUILTIN.map(k=>({key:k,name:t('snd_'+k)})).concat(FILE_SOUNDS.map(s=>({key:s.key,name:LANG==='ms'?s.nama:s.name})));
  list.sort((a,b)=>a.name.localeCompare(b.name,LANG));
  list.push({key:'none',name:t('snd_none')});
  return list;
}
let actx=null,curAudio=null;
function audio(){
  if(!actx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;try{actx=new C()}catch(e){return null}}
  if(actx.state==='suspended')actx.resume().catch(()=>{});
  return actx;
}
function playFile(key){
  const f=FILE_SOUNDS.find(s=>s.key===key),file=f?f.file:key.slice(2);let left=f?f.rep:1;
  try{if(curAudio)curAudio.pause();
    const a=new Audio(BASE+'sounds/'+encodeURIComponent(file));curAudio=a;
    a.addEventListener('ended',()=>{if(--left>0&&curAudio===a){a.currentTime=0;a.play().catch(()=>{})}});
    a.play().catch(()=>{});
  }catch(e){}
}
function playSound(name){
  if(!name||name==='none')return;
  if(name.startsWith('f:')){playFile(name);return}
  const c=audio();if(!c)return;
  const t0=c.currentTime+.05,out=c.createGain();out.gain.value=.9;out.connect(c.destination);
  const note=(f,st,dur,o={})=>{const vol=o.vol??.3;
    const osc=c.createOscillator(),g=c.createGain();osc.type=o.type||'sine';osc.frequency.value=f;
    g.gain.setValueAtTime(0,st);g.gain.linearRampToValueAtTime(vol,st+.01);
    if(o.hold){g.gain.setValueAtTime(vol,st+dur-.02);g.gain.linearRampToValueAtTime(0,st+dur)}
    else g.gain.exponentialRampToValueAtTime(.0001,st+dur);
    osc.connect(g);g.connect(out);osc.start(st);osc.stop(st+dur+.05)};
  switch(name){
    case 'bip':for(let i=0;i<3;i++)note(1000,t0+i*.4,.25,{type:'square',vol:.12,hold:true});break;
    case 'dingdong':note(659,t0,1.4,{vol:.35});note(1318,t0,.8,{vol:.07});note(523,t0+.7,1.9,{vol:.35});note(1046,t0+.7,1,{vol:.07});break;
    case 'gong':[[110,.4],[165,.25],[220,.2],[293,.12],[415,.08]].forEach(([f,v])=>note(f,t0,4.5,{vol:v}));break;
    case 'penggera':for(let i=0;i<8;i++)note(i%2?660:880,t0+i*.25,.25,{type:'sawtooth',vol:.08,hold:true});break;
    default:for(let i=0;i<36;i++){const st=t0+i*.07;note(1250,st,.12,{vol:.18});note(2500,st,.08,{vol:.05})}
  }
}
['pointerdown','keydown'].forEach(ev=>document.addEventListener(ev,()=>{if(MODE==='display')audio()},{passive:true}));

/* ---------- Full screen (display only) ---------- */
let uiTimer;
function setPresent(on){document.body.classList.toggle('present',on);if(on){if(settingsOpen())closeOverlay('ed');pokeUI();
  try{navigator.wakeLock&&navigator.wakeLock.request('screen').catch(()=>{})}catch(e){}}}
function pokeUI(){document.body.classList.add('ui-on');clearTimeout(uiTimer);uiTimer=setTimeout(()=>document.body.classList.remove('ui-on'),2500)}
function toggleFS(){
  if(document.fullscreenElement){document.exitFullscreen().catch(()=>{});return}
  if(document.body.classList.contains('present')){setPresent(false);return}
  let pr;try{pr=document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen()}catch(e){}
  if(pr&&pr.then)pr.catch(()=>setPresent(true));else setPresent(true);
}
if(MODE==='display'){
  document.addEventListener('fullscreenchange',()=>setPresent(!!document.fullscreenElement));
  ['mousemove','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{if(document.body.classList.contains('present'))pokeUI()},{passive:true}));
}

/* ---------- Overlays ---------- */
function openOverlay(id){const o=$(id);o.classList.remove('closing');o.hidden=false;requestAnimationFrame(()=>requestAnimationFrame(()=>o.classList.add('open')))}
function closeOverlay(id){hideTip();const o=$(id);if(!o||o.hidden)return;o.classList.add('closing');o.classList.remove('open');
  setTimeout(()=>{if(!o.classList.contains('open')){o.hidden=true;o.classList.remove('closing')}},130)}
const settingsOpen=()=>!!$('ed')&&!$('ed').hidden&&!$('ed').classList.contains('closing');
function controlURL(){return location.origin+location.pathname.replace(/[^/]*$/,'')+'kawal/?r='+room}
function openPair(){
  const box=$('pair-body');
  if(!db)box.innerHTML=`<p>${esc(t('noFb'))}</p>`;
  else if(!room)box.innerHTML=`<p>${esc(t('pairConnecting'))}</p>`;
  else{
    const url=controlURL();let qr='';
    try{if(window.qrcode){const q=qrcode(0,'M');q.addData(url);q.make();qr=`<div class="qr">${q.createSvgTag(6,2)}</div>`}}catch(e){}
    box.innerHTML=`${qr}<p>${esc(t('pairScan'))}</p><div class="url">${esc(location.host+location.pathname.replace(/[^/]*$/,'')+'kawal')}</div><p>${esc(t('pairEnter'))}</p><div class="code">${room}</div>`;
  }
  $('pair-h').textContent=t('pairTitle');$('pair-close').textContent=t('close');
  if($('pair').hidden)openOverlay('pair');
}
function openSettings(){renaming=false;sessMenu=false;sessOpen=false;shareForm=false;newShare='';takePreview=null;renderEditor();openOverlay('ed');setTimeout(()=>{const f=$('ed').querySelector('.m-tab[aria-selected="true"]');if(f)f.focus({preventScroll:true})},200)}
function toggleSettings(){settingsOpen()?closeOverlay('ed'):openSettings()}


/* ---------- Guided tour (display only) ----------
   Shown once on a device's first visit; replay from Help. Spotlights one real button per step. */
const TOURKEY='papanMasa.tour.v1';
const TOUR=[
  {sel:null,h:'tour1h',p:'tour1p'},
  {sel:'#bar [data-act="edit"]',h:'tour2h',p:'tour2p'},
  {sel:'#bar [data-act="startall"]',h:'tour3h',p:'tour3p'},
  {sel:'#bar [data-act="pair"]',h:'tour4h',p:'tour4p'},
  {sel:'#bar [data-act="fs"]',h:'tour5h',p:'tour5p'},
  {sel:'#b-help',h:'tour6h',p:'tour6p'}
];
let tourI=-1,tourEls=null;
function tourOpen(){return tourI>=0}
function helpOpen(){const p=$('help-pop');return !!p&&!p.hidden}
function closeHelp(){const p=$('help-pop');if(!p||p.hidden)return;p.hidden=true;$('b-help').setAttribute('aria-expanded','false')}
function toggleHelp(){const p=$('help-pop');if(!p)return;if(p.hidden){p.hidden=false;$('b-help').setAttribute('aria-expanded','true');const f=p.querySelector('.hp-item');if(f)f.focus()}else closeHelp()}
function startTour(){
  if(MODE!=='display')return;
  closeHelp();if(settingsOpen())closeOverlay('ed');if($('pair')&&!$('pair').hidden)closeOverlay('pair');
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  if(document.body.classList.contains('present'))setPresent(false);
  if(!tourEls){
    const veil=document.createElement('div');veil.className='tour-veil';
    const spot=document.createElement('div');spot.className='tour-spot center';
    const card=document.createElement('div');card.className='tour-card';
    card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-labelledby','tour-h');card.setAttribute('aria-describedby','tour-p');
    document.body.append(veil,spot,card);tourEls={veil,spot,card};
  }
  tourEls.veil.hidden=tourEls.spot.hidden=tourEls.card.hidden=false;
  tourI=0;renderTour();
}
function renderTour(){
  const s=TOUR[tourI],last=tourI===TOUR.length-1,card=tourEls.card;
  card.innerHTML=`<div class="tc-step">${tourI+1} / ${TOUR.length}</div>
    <h2 id="tour-h">${esc(t(s.h))}</h2><p id="tour-p">${esc(t(s.p))}</p>
    <div class="tc-actions">
      <button class="btn small ghost" data-act="tourend">${esc(t(last?'tourClose':'tourSkip'))}</button>
      <span class="tc-right">
        ${tourI>0?`<button class="btn small" data-act="tourprev">${esc(t('tourBack'))}</button>`:''}
        ${last?`<a class="btn small" href="panduan/" target="_blank" rel="noopener">${esc(t('openGuide'))}</a>`:''}
        <button class="btn small primary" data-act="${last?'tourend':'tournext'}">${esc(t(last?'tourDone':(tourI===0?'tourGo':'tourNext')))}</button>
      </span>
    </div>`;
  placeTour();
  const f=card.querySelector('.btn.primary');if(f)f.focus({preventScroll:true});
}
function placeTour(){
  if(!tourOpen())return;
  const {spot,card}=tourEls,s=TOUR[tourI],vw=innerWidth,vh=innerHeight;
  const el=s.sel&&document.querySelector(s.sel);
  const r=el&&el.getClientRects().length?el.getBoundingClientRect():null;
  const cw=card.offsetWidth,ch=card.offsetHeight;
  card.classList.remove('arrow-up','arrow-down');
  if(!r){spot.classList.add('center');spot.removeAttribute('style');
    card.style.left=Math.max(16,(vw-cw)/2)+'px';card.style.top=Math.max(16,(vh-ch)/2)+'px';return}
  spot.classList.remove('center');
  const pad=6,gap=16;
  Object.assign(spot.style,{left:(r.left-pad)+'px',top:(r.top-pad)+'px',width:(r.width+pad*2)+'px',height:(r.height+pad*2)+'px'});
  const left=Math.min(vw-cw-16,Math.max(16,r.left+r.width/2-cw/2));
  let top=r.top-pad-gap-ch,below=false;
  if(top<16){top=Math.min(vh-ch-16,r.bottom+pad+gap);below=true}
  card.style.left=left+'px';card.style.top=top+'px';
  card.style.setProperty('--ax',Math.min(cw-24,Math.max(24,r.left+r.width/2-left))+'px');
  card.classList.add(below?'arrow-up':'arrow-down');
}
function moveTour(d){const j=tourI+d;if(j<0||j>=TOUR.length)return;tourI=j;renderTour()}
function endTour(){
  if(!tourOpen())return;tourI=-1;lsSet(TOURKEY,'1');
  if(tourEls){tourEls.veil.hidden=tourEls.spot.hidden=tourEls.card.hidden=true}
  const b=$('b-help');if(b)b.focus({preventScroll:true});
}
addEventListener('resize',()=>placeTour());

function newSession(){
  S.sets.push({id:uid(),name:t('newSessionName'),clock24:false,secs:false,showDate:true,scale:1,pi:0,pages:[blankPage('')]});
  S.cur=S.sets.length-1;sessMenu=false;sessOpen=false;edTab='content';save();renderStage();renaming=true;renderEditor();
  const i=$('ed-rename');if(i){i.focus();i.select()}flash(t('sessCreated'));
}
/* ---------- Actions ---------- */
function go(i){const st=set();st.pi=Math.min(Math.max(0,i),st.pages.length-1);save();renderStage();if(settingsOpen())renderEditor()}
function activeTimers(pg){const n=now();return pg.timers.some(x=>['run','pause','wait'].includes(tstate(x,n)))}
function armed(btn,fn,key){if(btn.dataset.armed){delete btn.dataset.armed;fn();return}
  const old=btn.textContent;btn.dataset.armed='1';btn.textContent=t(key||'armDelete');
  setTimeout(()=>{if(btn.isConnected&&btn.dataset.armed){delete btn.dataset.armed;btn.textContent=old}},3000)}
function flash(s){const m=$('ed-msg');if(m){m.textContent=s;m.className='msg';clearTimeout(flash.t);flash.t=setTimeout(()=>{if(m.isConnected){m.textContent=t('saved');m.className=''}},4000)}}
function exportObj(list){return {app:'papan-masa',v:2,sets:list.map(s=>({name:s.name,clock24:s.clock24,secs:s.secs,showDate:s.showDate!==false,blinkColon:s.blinkColon!==false,scale:s.scale,
  pages:s.pages.map(p=>({title:p.title,notes:p.notes,align:p.align,footer:p.footer,mode:p.mode||'separate',sizes:sizes(p),timers:p.timers.map(x=>({label:x.label,min:x.min,alert:x.alert,alertMin:x.alertMin,sound:x.sound||'loceng'}))}))}))}}
const exportCode=()=>JSON.stringify(exportObj(S.sets));
let edTab='content',renaming=false,sessMenu=false,sessOpen=false;
/* ---------- Share codes ----------
   A share code (XXXX-XXXX) points to a copy of chosen sessions stored in Firebase under shares/CODE.
   Firebase rules refuse reads after the expiry time or once cancelled. Cancelling needs the secret
   that only the creating device keeps (localStorage), stored unreadably under shareOwners/CODE. */
const SHAREKEY='papanMasa.shares.v1',DAY=864e5;
let shareForm=false,shareSel=new Set(),shareDur=3,newShare='',takeCode='',takePreview=null,takeBusy=false;
function loadShares(){const a=load(SHAREKEY);return (Array.isArray(a)?a:[]).filter(x=>x&&x.code&&(!x.exp||x.exp>now()))}
function saveShares(a){lsSet(SHAREKEY,JSON.stringify(a))}
const genShareCode=()=>Array.from({length:8},()=>CODE_CH[Math.floor(Math.random()*CODE_CH.length)]).join('');
const cleanShare=c=>String(c||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
const fmtShare=c=>c.length>4?c.slice(0,4)+'-'+c.slice(4):c;
function fmtDT(ms){try{return new Intl.DateTimeFormat(LANG==='ms'?'ms-MY':'en-GB',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(ms))}catch(e){return new Date(ms).toLocaleString()}}
function leftText(exp){
  if(!exp)return t('noExpiry');const ms=exp-now();if(ms<=0)return t('expired');
  const d=Math.floor(ms/DAY),h=Math.floor(ms%DAY/36e5),m=Math.max(1,Math.floor(ms%36e5/6e4));
  const parts=d?[t('dUnit',{n:d}),h?t('hUnit',{n:h}):'']:h?[t('hUnit',{n:h}),t('mUnit',{n:m})]:[t('mUnit',{n:m})];
  return t('endsIn',{t:parts.filter(Boolean).join(' ')});
}
async function createShare(){
  const idx=[...shareSel].filter(i=>S.sets[i]).sort((a,b)=>a-b);if(!idx.length){flash(t('shareNone'));return}
  const list=idx.map(i=>S.sets[i]),payload=JSON.stringify(exportObj(list)),created=Date.now()+clockOff,exp=shareDur?created+shareDur*DAY:0;
  let secret='';try{secret=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')}catch(e){secret=uid()+uid()+uid()}
  const btn=$('ed').querySelector('[data-act="sharecreate"]');if(btn){btn.disabled=true;btn.textContent=t('creating')}
  for(let tries=0;tries<4;tries++){
    const code=genShareCode();
    try{
      await db.ref().update({['shares/'+code]:{data:payload,exp,created},['shareOwners/'+code+'/'+secret]:true});
      const mine=loadShares();mine.unshift({code,secret,exp,created,names:list.map(s=>s.name)});saveShares(mine);
      shareForm=false;newShare=code;renderEditor();flash(t('shareMade'));return;
    }catch(e){if(!/permission/i.test(String(e&&(e.code||e.message))))break}
  }
  if(btn){btn.disabled=false;btn.textContent=t('shareCreate')}
  flash(t('shareFail'));
}
async function revokeShare(code){
  const mine=loadShares(),m=mine.find(x=>x.code===code);if(!m)return;
  try{await db.ref('shares/'+code+'/revoked').set(m.secret)}catch(e){}
  saveShares(mine.filter(x=>x.code!==code));if(newShare===code)newShare='';renderEditor();flash(t('shareRevoked'));
}
function takeErr(msg){const el=$('ed-take-err');if(el)el.textContent=msg;const i=$('ed-take');if(i){i.toggleAttribute('aria-invalid',!!msg);i.classList.toggle('bad',!!msg)}}
async function checkShare(){
  const code=cleanShare(takeCode);takePreview=null;
  if(code.length!==8){takeErr(t('shareBadFmt'));return}
  if(!db){takeErr(t('noFb'));return}
  takeBusy=true;renderEditor();
  let err='';
  try{
    const snap=await db.ref('shares/'+code).get(),v=snap.val();
    if(!v||v.revoked||(v.exp&&v.exp<=now()))err='shareGone';
    else{const d=JSON.parse(v.data),list=(Array.isArray(d.sets)?d.sets:[]).map(normSet);if(!list.length)err='shareGone';else takePreview={code,exp:v.exp||0,sets:list}}
  }catch(e){err=/permission/i.test(String(e&&(e.code||e.message)))?'shareGone':'shareNet'}
  takeBusy=false;renderEditor();if(err)takeErr(t(err));
}
function importSets(list){S.sets.push(...list);S.cur=S.sets.length-list.length;save();renderStage();renderEditor();flash(t('imported',{n:list.length}))}
function downloadCopy(){
  const d=new Date(now()),ymd=d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());
  const blob=new Blob([JSON.stringify(exportObj(S.sets),null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`azr-countdown-${ymd}.json`;
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},800);flash(t('downloaded'));
}
function shareHtml(){
  if(!db)return `<p class="hint">${esc(t('noFb'))}</p>`;
  const mine=loadShares();let h='';
  if(shareForm){
    const all=S.sets.every((_,i)=>shareSel.has(i));
    h+=`<div class="sharebox">
      <div class="field"><span class="flabel">${esc(t('shareWhich'))}</span>
        <div class="checklist">${S.sets.map((s,i)=>`<label class="ck-row"><input type="checkbox" id="ed-sh-${i}" data-f="sharesel" data-i="${i}"${shareSel.has(i)?' checked':''}>
          <span class="ck-name">${esc(s.name)}</span><span class="sl-meta">${esc(t(s.pages.length===1?'pageCount1':'pagesCount',{n:s.pages.length}))}</span></label>`).join('')}</div>
        ${S.sets.length>1?`<button class="linkbtn" data-act="shareall">${esc(t(all?'selectNone':'selectAll'))}</button>`:''}</div>
      <div class="field"><span class="flabel">${esc(t('shareFor'))}</span>
        <div class="seg" role="group" aria-label="${esc(t('shareFor'))}">${[1,2,3,7,0].map(d=>`<button data-act="sharedur" data-v="${d}" class="${shareDur===d?'on':''}" aria-pressed="${shareDur===d}">${esc(d?t(d===1?'day1':'days',{n:d}):t('noLimit'))}</button>`).join('')}</div>
        ${shareDur===0?`<p class="fnote">${esc(t('noLimitNote'))}</p>`:`<p class="hint">${esc(t('validUntil',{t:fmtDT(now()+shareDur*DAY)}))}</p>`}</div>
      <div class="row-btns"><button class="btn small primary" data-act="sharecreate"${shareSel.size?'':' disabled'}>${esc(t('shareCreate'))}</button><button class="btn small" data-act="sharecancel">${esc(t('cancel'))}</button></div>
    </div>`;
  }else h+=`<div class="row-btns"><button class="btn small primary" data-act="sharestart">${esc(t('shareStart'))}</button></div>`;
  if(mine.length)h+=`<div class="mycodes"><span class="flabel">${esc(t('myCodes'))}</span>${mine.map(m=>`
    <div class="mc-row${m.code===newShare?' new':''}">
      <div class="mc-main"><span class="mc-code">${fmtShare(m.code)}</span><span class="mc-names">${esc((m.names||[]).join(', '))}</span></div>
      <div class="mc-side"><span class="mc-left${m.exp&&m.exp-now()<DAY?' soon':''}" data-exp="${m.exp||0}" title="${m.exp?esc(t('validUntil',{t:fmtDT(m.exp)})):''}">${esc(leftText(m.exp))}</span>
        <button class="btn small" data-act="sharecopy" data-code="${m.code}">${esc(t('copyCode'))}</button>
        <button class="btn small danger" data-act="sharerevoke" data-code="${m.code}">${esc(t('revoke'))}</button></div>
    </div>`).join('')}</div>`;
  return h;
}
function takeHtml(){
  if(!db)return `<p class="hint">${esc(t('noFb'))}</p>`;
  let h=`<div class="takerow"><input type="text" id="ed-take" class="codein" value="${esc(fmtShare(cleanShare(takeCode)))}" placeholder="AB7K-29QD" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="${esc(t('takeGrp'))}" aria-describedby="ed-take-err">
    <button class="btn small" data-act="takecheck"${takeBusy?' disabled':''}>${esc(t(takeBusy?'checking':'takeCheck'))}</button></div>
    <p class="ferr" id="ed-take-err" role="alert"></p>`;
  if(takePreview){const p=takePreview;h+=`<div class="preview">
    <p class="pv-head"><b>${fmtShare(p.code)}</b> · ${esc(p.exp?t('validUntil',{t:fmtDT(p.exp)}):t('noExpiry'))}</p>
    <span class="flabel">${esc(t('takeContains'))}</span>
    <ul>${p.sets.map(s=>`<li><b>${esc(s.name)}</b> <span class="sl-meta">${esc(t(s.pages.length===1?'pageCount1':'pagesCount',{n:s.pages.length}))}</span></li>`).join('')}</ul>
    <div class="row-btns"><button class="btn small primary" data-act="takeimport">${esc(t('takeImport'))}</button><button class="btn small" data-act="takecancel">${esc(t('cancel'))}</button></div></div>`}
  return h;
}
function saveRename(){const i=$('ed-rename');if(i){const v=i.value.trim();if(v)set().name=v}renaming=false;save();renderStage();renderEditor()}

document.addEventListener('click',async e=>{
  if(tipOpen()&&!e.target.closest('.tip-btn,#tipbox'))hideTip();
  if(helpOpen()&&!e.target.closest('.help-wrap'))closeHelp();
  if(sessMenu&&!e.target.closest('.sess-wrap')){sessMenu=false;renderEditor()}
  if(sessOpen&&!e.target.closest('.sess-pick')){sessOpen=false;renderEditor()}
  if(e.target.id==='pair'){closeOverlay('pair');return}
  if(e.target.id==='ed'){closeOverlay('ed');return}
  const b=e.target.closest('[data-act]');if(!b)return;
  const a=b.dataset.act,st=set(),p=page(),i=+b.dataset.i;
  switch(a){
    case 'start':{if(isChain()){startAll();break}const x=findT(b.dataset.tid);if(x){startT(x);save();tick()}break}
    case 'pause':{if(isChain()){pauseAll();break}const x=findT(b.dataset.tid);if(x){pauseT(x);save();tick()}break}
    case 'mode':{const v=b.dataset.v==='continuous'?'continuous':'separate';if((p.mode||'separate')===v)break;
      const apply=()=>{p.mode=v;p.timers.forEach(x=>delete R[x.id]);save();renderStage();renderEditor()};
      if(activeTimers(p)){if(!b.dataset.armed)flash(t('modeWarn'));armed(b,apply,'armConfirm')}else apply();break}
    case 'reset':delete R[b.dataset.tid];save();tick();break;
    case 'startall':startAll();break;
    case 'pauseall':pauseAll();break;
    case 'resetall':armed(b,()=>{p.timers.forEach(x=>delete R[x.id]);save();tick();b.textContent=t('resetAll')},'armConfirm');break;
    case 'prev':go(st.pi-1);break;
    case 'next':go(st.pi+1);break;
    case 'fs':toggleFS();break;
    case 'pair':$('pair').hidden?openPair():closeOverlay('pair');break;
    case 'closepair':closeOverlay('pair');break;
    case 'edit':toggleSettings();break;
    case 'close':closeOverlay('ed');break;
    case 'tip':if(tipBtn===b&&tipPinned)hideTip();else showTip(b,true);break;
    case 'help':toggleHelp();break;
    case 'tour':startTour();break;
    case 'tournext':moveTour(1);break;
    case 'tourprev':moveTour(-1);break;
    case 'tourend':endTour();break;
    case 'tab':edTab=b.dataset.tab;renderEditor();{const f=$('ed').querySelector('.m-tab[aria-selected="true"]');if(f)f.focus()}break;
    case 'lang':setLang(b.dataset.lang);break;
    case 'goto':go(i);break;
    case 'newroom':{const c=genCode();lsSet(ROOMKEY,c);flash(t('newRoomMsg'));await connect(c,true);renderEditor();closeOverlay('ed');openPair();break}
    case 'leave':disconnect();lsSet(CTLKEY,'');history.replaceState(null,'',location.pathname);closeOverlay('ed');showJoin('');break;
    case 'newset':newSession();break;
    case 'sesslist':sessOpen=!sessOpen;sessMenu=false;renderEditor();if(sessOpen){const f=$('ed').querySelector('.sl-item.on')||$('ed').querySelector('.sl-item');if(f)f.focus()}break;
    case 'pickset':sessOpen=false;S.cur=i;save();renderStage();renderEditor();{const b=$('ed-set');if(b)b.focus()}break;
    case 'sessmenu':sessOpen=false;sessMenu=!sessMenu;renderEditor();if(sessMenu){const f=$('ed').querySelector('.sess-pop .hp-item');if(f)f.focus()}break;
    case 'rename':sessMenu=false;renaming=true;renderEditor();{const i=$('ed-rename');if(i){i.focus();i.select()}}break;
    case 'renamesave':saveRename();break;
    case 'renamecancel':renaming=false;renderEditor();break;
    case 'dupset':{sessMenu=false;const c=normSet(JSON.parse(JSON.stringify(st)));c.name=st.name+t('copySuffix');S.sets.push(c);S.cur=S.sets.length-1;save();renderStage();renderEditor();break}
    case 'delset':if(S.sets.length<2){flash(t('needSession'));break}
      armed(b,()=>{S.sets.splice(S.cur,1);S.cur=0;sessMenu=false;save();renderStage();renderEditor()});break;
    case 'addpage':st.pages.splice(st.pi+1,0,blankPage(p.footer));st.pi++;save();renderStage();edTab='content';renderEditor();break;
    case 'duppage':{const c=JSON.parse(JSON.stringify(p));c.id=uid();c.timers.forEach(x=>x.id=uid());st.pages.splice(st.pi+1,0,c);st.pi++;save();renderStage();renderEditor();break}
    case 'movepage':{const j=st.pi+(+b.dataset.d);if(j<0||j>=st.pages.length)break;const [x]=st.pages.splice(st.pi,1);st.pages.splice(j,0,x);st.pi=j;save();renderStage();renderEditor();break}
    case 'delpage':if(st.pages.length<2){flash(t('needPage'));break}
      armed(b,()=>{p.timers.forEach(x=>delete R[x.id]);st.pages.splice(st.pi,1);save();renderStage();renderEditor()});break;
    case 'align':p.align=b.dataset.v;save();renderStage();renderEditor();break;
    case 'addtimer':if(p.timers.length<3){p.timers.push(timer(p.timers.length?t('cdN',{n:p.timers.length+1}):t('defaultLabel'),p.timers.length?30:60));save();renderStage();renderEditor()}break;
    case 'deltimer':armed(b,()=>{const [x]=p.timers.splice(i,1);if(x)delete R[x.id];save();renderStage();renderEditor()});break;
    case 'sizesall':{const z=sizes(p);st.pages.forEach(pg=>pg.sizes={...z});save();renderStage();flash(t('sizesAllDone',{n:st.pages.length}));break}
    case 'sizesreset':p.sizes=normSizes({});save();renderStage();renderEditor();break;
    case 'testsound':playSound((p.timers[i]||{}).sound||'loceng');break;
    case 'export':{const ta=$('ed-export');ta.value=exportCode();ta.hidden=false;flash(t('codeMade'));break}
    case 'copy':{const ta=$('ed-export');if(!ta.value)ta.value=exportCode();ta.hidden=false;
      const fb=()=>{ta.focus();ta.select();flash(t('selectCopy'))};
      try{navigator.clipboard.writeText(ta.value).then(()=>flash(t('copied')),fb)}catch(err){fb()}break}
    case 'sharestart':shareForm=true;shareSel=new Set([S.cur]);newShare='';renderEditor();break;
    case 'sharecancel':shareForm=false;renderEditor();break;
    case 'shareall':{const all=S.sets.every((_,j)=>shareSel.has(j));shareSel=all?new Set():new Set(S.sets.map((_,j)=>j));renderEditor();break}
    case 'sharedur':shareDur=+b.dataset.v;renderEditor();break;
    case 'sharecreate':createShare();break;
    case 'sharecopy':{const c=fmtShare(b.dataset.code);const ok=()=>flash(t('codeCopied',{c}));
      try{navigator.clipboard.writeText(c).then(ok,()=>flash(c))}catch(err){flash(c)}break}
    case 'sharerevoke':armed(b,()=>revokeShare(b.dataset.code),'armConfirm');break;
    case 'takecheck':checkShare();break;
    case 'takeimport':if(takePreview){const l=takePreview.sets;takePreview=null;takeCode='';importSets(l)}break;
    case 'takecancel':takePreview=null;takeCode='';renderEditor();break;
    case 'download':downloadCopy();break;
    case 'import':{const txt=$('ed-import').value.trim();if(!txt){flash(t('pasteFirst'));break}
      try{const d=JSON.parse(txt);const sets=(Array.isArray(d.sets)?d.sets:[d]).map(normSet);
        S.sets.push(...sets);S.cur=S.sets.length-sets.length;save();renderStage();renderEditor();flash(t('imported',{n:sets.length}))}
      catch(err){flash(t('badCode'))}break}
  }
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&tipOpen()){const b=tipBtn;hideTip();if(b){tipQuiet=true;b.focus();tipQuiet=false}return}
  if(tourOpen()){
    if(e.key==='Escape')endTour();
    else if(e.key==='ArrowRight'){e.preventDefault();if(tourI<TOUR.length-1)moveTour(1);else endTour()}
    else if(e.key==='ArrowLeft'){e.preventDefault();moveTour(-1)}
    return;
  }
  if(e.key==='Escape'&&helpOpen()){closeHelp();$('b-help').focus();return}
  if(e.target&&e.target.id==='ed-take'&&e.key==='Enter'){e.preventDefault();takeCode=e.target.value;checkShare();return}
  if(e.target&&e.target.id==='ed-rename'){if(e.key==='Enter'){e.preventDefault();saveRename()}else if(e.key==='Escape'){renaming=false;renderEditor()}return}
  if(sessOpen&&e.target.closest&&e.target.closest('.sess-list')){
    const items=[...$('ed').querySelectorAll('.sl-item')],j=items.indexOf(e.target);
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=items[(j+(e.key==='ArrowDown'?1:-1)+items.length)%items.length];if(n)n.focus();return}
    if(e.key==='Home'||e.key==='End'){e.preventDefault();items[e.key==='Home'?0:items.length-1].focus();return}
  }
  if(e.key==='Escape'&&sessOpen){sessOpen=false;renderEditor();const b=$('ed-set');if(b)b.focus();return}
  if(e.key==='Escape'&&sessMenu){sessMenu=false;renderEditor();const b=$('ed').querySelector('.sess-more');if(b)b.focus();return}
  if(e.key==='Escape'){
    if($('pair')&&!$('pair').hidden){closeOverlay('pair');return}
    if(settingsOpen()){closeOverlay('ed');return}
    if(document.body.classList.contains('present')&&!document.fullscreenElement)setPresent(false);
    return;
  }
  if(e.target.closest('input,textarea,select')||e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key.toLowerCase(),st=set();
  if(settingsOpen()&&k!=='e')return;
  if(k==='arrowright'||k==='pagedown'){go(st.pi+1);e.preventDefault()}
  else if(k==='arrowleft'||k==='pageup'){go(st.pi-1);e.preventDefault()}
  else if(k==='s')startAll();
  else if(k==='p')pauseAll();
  else if(k==='e')toggleSettings();
  else if(MODE==='display'&&k==='f')toggleFS();
});

/* ---------- Settings popup ---------- */
/* ---------- Info tooltips (ⓘ) ----------
   Hover or focus shows a short explanation; tap/click pins it (phones have no hover). Esc or a click elsewhere closes it. */
const TIP_LINK={session:'sessions',page:'sessions',footer:'content',duration:'countdowns',timing:'timing',blink:'countdowns',sound:'sound',
  lang:'display-options',clock:'help',scale:'display-options',sizes:'display-options',colon:'display-options',room:'phone',share:'after',take:'after',file:'after'};
function info(k){return `<button type="button" class="tip-btn" data-act="tip" data-tip="${k}" aria-label="${esc(t('moreInfo'))}" aria-expanded="false"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.3v3.9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="4.9" r="1" fill="currentColor"/></svg></button>`}
let tipEl=null,tipBtn=null,tipPinned=false,tipHideT=null,tipQuiet=false;
function showTip(btn,pin){
  clearTimeout(tipHideT);
  if(!tipEl){tipEl=document.createElement('div');tipEl.id='tipbox';tipEl.setAttribute('role','tooltip');document.body.appendChild(tipEl)}
  if(tipBtn&&tipBtn!==btn){tipBtn.setAttribute('aria-expanded','false');tipBtn.removeAttribute('aria-describedby')}
  const k=btn.dataset.tip,a=TIP_LINK[k];
  tipEl.innerHTML=`<p>${esc(t('i_'+k))}</p>${a?`<a href="${BASE}panduan/#${a}" target="_blank" rel="noopener">${esc(t('readMore'))} →</a>`:''}`;
  tipEl.hidden=false;tipBtn=btn;tipPinned=!!pin;
  btn.setAttribute('aria-expanded',String(!!pin));btn.setAttribute('aria-describedby','tipbox');
  const r=btn.getBoundingClientRect(),w=tipEl.offsetWidth,h=tipEl.offsetHeight,gap=10;
  let left=Math.min(innerWidth-w-12,Math.max(12,r.left+r.width/2-w/2)),top=r.top-gap-h,below=false;
  if(top<12){top=r.bottom+gap;below=true}
  tipEl.style.left=left+'px';tipEl.style.top=top+'px';
  tipEl.style.setProperty('--ax',Math.min(w-14,Math.max(14,r.left+r.width/2-left))+'px');
  tipEl.classList.toggle('below',below);
}
function hideTip(){clearTimeout(tipHideT);if(tipEl)tipEl.hidden=true;if(tipBtn){tipBtn.setAttribute('aria-expanded','false');tipBtn.removeAttribute('aria-describedby')}tipBtn=null;tipPinned=false}
const tipOpen=()=>!!tipEl&&!tipEl.hidden;
const softHide=()=>{if(!tipPinned){clearTimeout(tipHideT);tipHideT=setTimeout(hideTip,160)}};
document.addEventListener('mouseover',e=>{const b=e.target.closest&&e.target.closest('.tip-btn');
  if(b){if(!(tipBtn===b&&tipPinned))showTip(b,false);return}
  if(e.target.closest&&e.target.closest('#tipbox'))clearTimeout(tipHideT)});
document.addEventListener('mouseout',e=>{const from=e.target.closest&&e.target.closest('.tip-btn,#tipbox');if(!from)return;
  const to=e.relatedTarget&&e.relatedTarget.closest&&e.relatedTarget.closest('.tip-btn,#tipbox');if(!to)softHide()});
document.addEventListener('focusin',e=>{const b=e.target.closest&&e.target.closest('.tip-btn');if(b&&tipBtn!==b&&!tipQuiet)showTip(b,false)});
document.addEventListener('focusout',e=>{if(!(e.target.closest&&e.target.closest('.tip-btn,#tipbox')))return;
  const to=e.relatedTarget&&e.relatedTarget.closest&&e.relatedTarget.closest('.tip-btn,#tipbox');if(!to)softHide()});
addEventListener('resize',()=>{if(tipOpen())hideTip()});

function renderEditor(){
  hideTip();
  const st=set(),p=page();
  const prevBody=$('ed').querySelector('.m-body'),scroll=prevBody?prevBody.scrollTop:0;
  const tabs=[['content','tabContent'],['countdown','tabCountdown'],['display','tabDisplay'],['data','tabData']];
  let body='';
  if(edTab==='content'){
    body=`
    <div class="field"><label for="ed-title">${esc(t('title'))}</label>
      <input type="text" id="ed-title" data-f="title" value="${esc(p.title)}" placeholder="${esc(t('titlePh'))}"></div>
    <div class="field"><label for="ed-notes">${esc(t('notes'))}</label>
      <textarea id="ed-notes" data-f="notes" rows="5" placeholder="${esc(t('notesPh'))}">${esc(p.notes)}</textarea></div>
    <div class="grid2">
      <div class="field"><span class="flabel">${esc(t('align'))}</span>
        <div class="seg" role="group" aria-label="${esc(t('align'))}">${['left','center','right'].map(v=>`<button data-act="align" data-v="${v}" class="${p.align===v?'on':''}" aria-pressed="${p.align===v}">${esc(t(v))}</button>`).join('')}</div></div>
      <div class="field"><div class="lbl-row"><label for="ed-footer">${esc(t('footer'))}</label>${info('footer')}</div>
        <input type="text" id="ed-footer" data-f="footer" value="${esc(p.footer)}" placeholder="${esc(t('footerPh'))}"></div>
    </div>
    <div class="group"><h3>${esc(t('thisPage'))}</h3><div class="row-btns">
      <button class="btn small" data-act="duppage">${esc(t('dupPage'))}</button>
      <button class="btn small" data-act="movepage" data-d="-1"${st.pi===0?' disabled':''}>${esc(t('moveL'))}</button>
      <button class="btn small" data-act="movepage" data-d="1"${st.pi===st.pages.length-1?' disabled':''}>${esc(t('moveR'))}</button>
      <button class="btn small danger" data-act="delpage">${esc(t('delPage'))}</button></div></div>`;
  }else if(edTab==='countdown'){
    const sl=soundList();
    if(!p.timers.length){body=`<div class="empty">
      <div class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5M12 2.5V5"/></svg></div>
      <h3>${esc(t('emptyTitle'))}</h3><p>${esc(t('emptyText'))}</p>
      <button class="btn primary" data-act="addtimer">${esc(t('addCd'))}</button></div>`}
    else{
    const modeBar=p.timers.length>1?`<div class="modebar"><span class="flabel lbl-row">${esc(t('modeLbl'))}${info('timing')}</span>
      <div class="seg" role="group" aria-label="${esc(t('modeLbl'))}">${['separate','continuous'].map(v=>`<button data-act="mode" data-v="${v}" class="${(p.mode||'separate')===v?'on':''}" aria-pressed="${(p.mode||'separate')===v}">${esc(t(v==='separate'?'modeSep':'modeCont'))}</button>`).join('')}</div></div>`:'';
    body=modeBar+`<div class="tgrid">${p.timers.map((x,i)=>`
      <div class="tbox">
        <div class="tb-head"><strong>${esc(t('cdN',{n:i+1}))}</strong><button class="btn small danger" data-act="deltimer" data-i="${i}">${esc(t('remove'))}</button></div>
        <div class="field"><label for="ed-tl-${i}">${esc(t('label'))}</label><input type="text" id="ed-tl-${i}" data-f="tlabel" data-i="${i}" value="${esc(x.label)}"></div>
        <div class="field"><div class="lbl-row"><label for="ed-tm-${i}">${esc(t('minutes'))}</label>${info('duration')}</div><input type="number" id="ed-tm-${i}" data-f="tmin" data-i="${i}" min="1" step="1" value="${x.min}" aria-describedby="ed-tm-err-${i}">
          <p class="ferr" id="ed-tm-err-${i}" role="alert"></p>
          ${['run','pause','wait'].includes(tstate(x,now()))?`<p class="fnote">${esc(t('durNote'))}</p>`:''}</div>
        <div class="field"><div class="lbl-row"><label class="check"><input type="checkbox" id="ed-tc-${i}" data-f="talert" data-i="${i}"${x.alert?' checked':''}> ${esc(t('blink'))}</label>${info('blink')}</div>
          <div class="inline"><input type="number" id="ed-ta-${i}" data-f="talertmin" data-i="${i}" min="0" step="1" value="${x.alertMin}"${x.alert?'':' disabled'} aria-label="${esc(t('blinkWhen'))}" aria-describedby="ed-ta-err-${i}"><span class="hint">${esc(t('blinkWhen'))}</span></div><p class="ferr" id="ed-ta-err-${i}" role="alert"></p></div>
        <div class="field"><div class="lbl-row"><label for="ed-ts-${i}">${esc(t('sound'))}</label>${info('sound')}</div>
          <div class="inline"><select id="ed-ts-${i}" data-f="tsound" data-i="${i}">${sl.map(s=>`<option value="${esc(s.key)}"${(x.sound||'loceng')===s.key?' selected':''}>${esc(s.name)}</option>`).join('')}</select>
          <button class="btn small" data-act="testsound" data-i="${i}">${esc(t('test'))}</button></div></div>
      </div>`).join('')}
      ${p.timers.length<3?`<button class="tbox add" data-act="addtimer"><span class="plus" aria-hidden="true">+</span><span>${esc(t('addCd').replace('+ ',''))}</span></button>`:''}</div>`;}
  }else if(edTab==='display'){
    body=`
    <div class="grid2">
      <div class="field"><span class="flabel lbl-row">${esc(t('language'))}${info('lang')}</span>
        <div class="seg" role="group" aria-label="${esc(t('language'))}"><button data-act="lang" data-lang="en" class="${LANG==='en'?'on':''}">English</button><button data-act="lang" data-lang="ms" class="${LANG==='ms'?'on':''}">Bahasa Melayu</button></div></div>
      <div class="field"><div class="lbl-row"><label for="ed-clk">${esc(t('clockFmt'))}</label>${info('clock')}</div>
        <select id="ed-clk" data-f="clock24"><option value="0"${st.clock24?'':' selected'}>${esc(t('h12'))}</option><option value="1"${st.clock24?' selected':''}>${esc(t('h24'))}</option></select></div>
    </div>
    <div class="grid2">
      <div class="field"><label class="check"><input type="checkbox" id="ed-secs" data-f="secs"${st.secs?' checked':''}> ${esc(t('secs'))}</label>
        <label class="check"><input type="checkbox" id="ed-date" data-f="showDate"${st.showDate!==false?' checked':''}> ${esc(t('showDate'))}</label>
        <div class="lbl-row"><label class="check"><input type="checkbox" id="ed-colon" data-f="blinkColon"${st.blinkColon!==false?' checked':''}> ${esc(t('blinkColon'))}</label>${info('colon')}</div></div>
      <div class="field"><div class="lbl-row"><label for="ed-scale">${esc(t('size'))}: <span id="ed-scalev">${Math.round(st.scale*100)}%</span></label>${info('scale')}</div>
        <input type="range" class="peek" id="ed-scale" data-f="scale" min="60" max="150" step="5" value="${Math.round(st.scale*100)}"></div>
    </div>
    <div class="group sizes"><h3 class="lbl-row">${esc(t('sizesGrp',{n:st.pi+1}))}${info('sizes')}</h3>
      <div class="szgrid">${SIZE_KEYS.map(k=>{const v=Math.round(sizes(p)[k]*100);return `
        <div class="sz"><label for="ed-sz-${k}">${esc(t('sz_'+k))}</label>
          <input type="range" class="peek" id="ed-sz-${k}" data-f="size" data-k="${k}" min="60" max="160" step="5" value="${v}">
          <output id="ed-szv-${k}" for="ed-sz-${k}">${v}%</output></div>`}).join('')}</div>
      <div class="row-btns"><button class="btn small" data-act="sizesall">${esc(t('sizesAll'))}</button><button class="btn small" data-act="sizesreset">${esc(t('sizesReset'))}</button></div>
    </div>`;
  }else{
    const phone=MODE==='display'
      ?(db?`<p>${esc(t('roomCode'))}: <b>${room||'…'}</b></p>
          <div class="row-btns"><button class="btn small" data-act="pair">${esc(t('showQr'))}</button><button class="btn small" data-act="newroom">${esc(t('newRoom'))}</button></div>`:`<p class="hint">${esc(t('noFb'))}</p>`)
      :`<p>${esc(t('roomConnected',{code:room||'-'}))}</p><div class="row-btns"><button class="btn small" data-act="leave">${esc(t('changeRoom'))}</button></div>`;
    body=`
    <div class="group"><h3 class="lbl-row">${esc(t('phoneGrp'))}${info('room')}</h3>${phone}</div>
    <div class="group"><h3 class="lbl-row">${esc(t('shareGrp'))}${info('share')}</h3>${shareHtml()}</div>
    <div class="group"><h3 class="lbl-row">${esc(t('takeGrp'))}${info('take')}</h3>${takeHtml()}</div>
    <div class="group"><h3 class="lbl-row">${esc(t('fileGrp'))}${info('file')}</h3>
      <div class="row-btns"><button class="btn small" data-act="download">${esc(t('download'))}</button>
        <input type="file" id="ed-file" class="sr-only" accept=".json,.txt,application/json,text/plain"><label for="ed-file" class="btn small">${esc(t('openFile'))}</label></div></div>
    <div class="group"><h3>${esc(t('helpGrp'))}</h3><div class="row-btns">
      ${MODE==='display'?`<button class="btn small" data-act="tour">${esc(t('tourStart'))}</button>`:''}
      <a class="btn small" href="${BASE}panduan/" target="_blank" rel="noopener">${esc(t('openGuide'))}</a></div></div>
    ${MODE==='display'?`<div class="group"><h3>${esc(t('keysGrp'))}</h3><div class="keys">
      <kbd>→</kbd><span>${esc(t('kNext'))}</span><kbd>←</kbd><span>${esc(t('kPrev'))}</span><kbd>F</kbd><span>${esc(t('kFs'))}</span>
      <kbd>S</kbd><span>${esc(t('kStart'))}</span><kbd>P</kbd><span>${esc(t('kPause'))}</span><kbd>E</kbd><span>${esc(t('kSettings'))}</span></div></div>`:''}`;
  }
  $('ed').innerHTML=`
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ed-h">
    <div class="m-head">
      <h2 id="ed-h">${esc(t('settings').replace('✎ ',''))}</h2>
      <div class="m-session">${renaming?`
        <label for="ed-rename">${esc(t('sessionName'))}</label>
        <input type="text" id="ed-rename" value="${esc(st.name)}" maxlength="80">
        <button class="btn small primary" data-act="renamesave">${esc(t('save'))}</button>
        <button class="btn small" data-act="renamecancel">${esc(t('cancel'))}</button>`:`
        <span class="flabel lbl-row"><span id="ed-set-l">${esc(t('sessionLbl'))}</span>${info('session')}</span>
        <span class="sess-pick">
          <button class="sess-btn" id="ed-set" data-act="sesslist" aria-haspopup="listbox" aria-expanded="${sessOpen}" aria-labelledby="ed-set-l ed-set-n">
            <span class="sb-name" id="ed-set-n">${esc(st.name)}</span>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          ${sessOpen?`<div class="sess-list" role="listbox" aria-labelledby="ed-set-l">
            ${S.sets.map((s,i)=>`<button class="sl-item${i===S.cur?' on':''}" role="option" aria-selected="${i===S.cur}" data-act="pickset" data-i="${i}">
              <span class="sl-check" aria-hidden="true">${i===S.cur?'<svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>':''}</span>
              <span class="sl-text"><span class="sl-name">${esc(s.name)}</span><span class="sl-meta">${esc(t(s.pages.length===1?'pageCount1':'pagesCount',{n:s.pages.length}))}</span></span>
            </button>`).join('')}
            <div class="sl-sep" role="separator"></div>
            <button class="sl-item sl-new" data-act="newset"><span class="sl-check" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span><span class="sl-name">${esc(t('newSession').replace(/^\+\s*/,''))}</span></button>
          </div>`:''}
        </span>
        <span class="sess-wrap">
          <button class="icon-btn sess-more" data-act="sessmenu" aria-haspopup="true" aria-expanded="${sessMenu}" aria-label="${esc(t('sessMore'))}">⋯</button>
          ${sessMenu?`<span class="sess-pop" role="menu">
            <button class="hp-item" role="menuitem" data-act="rename">${esc(t('rename'))}</button>
            <button class="hp-item" role="menuitem" data-act="dupset">${esc(t('dupSession'))}</button>
            <button class="hp-item danger" role="menuitem" data-act="delset">${esc(t('delSession'))}</button>
          </span>`:''}
        </span>`}</div>
      <button class="icon-btn" data-act="close" aria-label="${esc(t('close'))}">✕</button>
    </div>
    <div class="m-pages"><span class="mp-label lbl-row">${esc(t('pagesLbl'))}${info('page')}</span>${st.pages.map((pg,i)=>`<button class="chip${i===st.pi?' on':''}" data-act="goto" data-i="${i}">${i+1}. ${esc(pg.title||t('untitled'))}</button>`).join('')}
      <button class="chip add" data-act="addpage">${esc(t('addPage'))}</button></div>
    <div class="m-tabs" role="tablist">${tabs.map(([k,l])=>`<button class="m-tab" role="tab" data-act="tab" data-tab="${k}" aria-selected="${edTab===k}">${esc(t(l))}</button>`).join('')}</div>
    <div class="m-body" role="tabpanel">${body}</div>
    <div class="m-foot"><span id="ed-msg">${esc(t('saved'))}</span><span>${esc(t('escHint'))}</span></div>
  </div>`;
  const nb=$('ed').querySelector('.m-body');if(nb)nb.scrollTop=scroll;
}

function fieldErr(el,id,msg){const m=$(id);if(m)m.textContent=msg;el.toggleAttribute('aria-invalid',!!msg);el.classList.toggle('bad',!!msg)}
$('ed').addEventListener('input',e=>{
  const el=e.target,f=el.dataset.f,st=set(),p=page(),i=+el.dataset.i;
  if(el.id==='ed-take'){takeCode=el.value;takeErr('');const c=cleanShare(el.value),f=fmtShare(c);if(el.value!==f&&!/-$/.test(el.value)){el.value=f}return}
  if(el.dataset.f==='sharesel'){const j=+el.dataset.i;el.checked?shareSel.add(j):shareSel.delete(j);renderEditor();const n=$('ed-sh-'+j);if(n)n.focus();return}
  if(el.id==='ed-set'){if(el.value==='new'){newSession();return}S.cur=+el.value;save();renderStage();renderEditor();return}
  if(!f)return;
  switch(f){
    case 'setname':{st.name=el.value;const o=document.querySelector(`#ed-set option[value="${S.cur}"]`);if(o)o.textContent=el.value;break}
    case 'title':{p.title=el.value;const ch=$('ed').querySelector(`.m-pages .chip[data-i="${st.pi}"]`);if(ch)ch.textContent=(st.pi+1)+'. '+(el.value||t('untitled'));break}
    case 'notes':p.notes=el.value;break;
    case 'footer':p.footer=el.value;break;
    case 'tlabel':p.timers[i].label=el.value;break;
    case 'tmin':{const v=parseFloat(el.value),ok=v>=1;fieldErr(el,'ed-tm-err-'+i,ok?'':t('errMin'));if(ok)p.timers[i].min=v;else return;break}
    case 'talertmin':{const v=parseFloat(el.value),ok=v>=0;fieldErr(el,'ed-ta-err-'+i,ok?'':t('errZero'));if(ok)p.timers[i].alertMin=v;else return;break}
    case 'talert':{p.timers[i].alert=el.checked;const am=$('ed-ta-'+i);if(am)am.disabled=!el.checked;break}
    case 'tsound':p.timers[i].sound=el.value;playSound(el.value);break;
    case 'clock24':st.clock24=el.value==='1';break;
    case 'secs':st.secs=el.checked;break;
    case 'showDate':st.showDate=el.checked;break;
    case 'blinkColon':st.blinkColon=el.checked;break;
    case 'scale':st.scale=+el.value/100;$('ed-scalev').textContent=el.value+'%';break;
    case 'size':{const k=el.dataset.k;p.sizes=normSizes(p.sizes);p.sizes[k]=+el.value/100;const o=$('ed-szv-'+k);if(o)o.textContent=el.value+'%';break}
  }
  save(true);renderStage();
});
const endPeek=()=>$('ed').classList.remove('peek');
$('ed').addEventListener('pointerdown',e=>{if(e.target.matches('input.peek'))$('ed').classList.add('peek')});
addEventListener('pointerup',endPeek);addEventListener('pointercancel',endPeek);
$('ed').addEventListener('change',e=>{
  if(e.target.id==='ed-file'&&e.target.files[0]){const r=new FileReader();
    r.onload=()=>{try{const d=JSON.parse(r.result);const list=(Array.isArray(d.sets)?d.sets:[d]).map(normSet);if(!list.length)throw 0;importSets(list)}catch(err){flash(t('badFile'))}};r.readAsText(e.target.files[0]);e.target.value=''}
});

/* ---------- Phone remote: join a room ---------- */
function showJoin(msg){$('k-joinform').hidden=false;$('k-main').hidden=true;$('k-joinmsg').textContent=msg||'';$('k-room').textContent=''}
async function join(code){
  code=cleanCode(code);
  if(code.length!==6){showJoin(t('codeLen'));return}
  $('k-joinmsg').textContent=t('joining');
  const r=await connect(code,false);
  if(r==='missing'){showJoin(t('roomMissing',{code}));return}
  if(r!=='ok'){showJoin(t('joinFail',{e:r.replace('error:','')}));return}
  lsSet(CTLKEY,code);history.replaceState(null,'','?r='+code);
  $('k-joinform').hidden=true;$('k-main').hidden=false;$('k-room').textContent=t('room',{code});
  renderStage();
}

/* ---------- Start ---------- */
applyStatic();
if(MODE==='display'){
  renderStage();
  if(db){
    const qs=new URLSearchParams(location.search);
    let code=cleanCode(qs.get('r'))||cleanCode(lsGet(ROOMKEY));
    if(code.length!==6)code=genCode();
    lsSet(ROOMKEY,code);
    connect(code,true).then(r=>{if(r!=='ok'){connErr=r.replace('error:','');updConn()}});
  }
  if(!lsGet(TOURKEY))setTimeout(()=>{if(!tourOpen()&&!settingsOpen()&&!document.body.classList.contains('present')&&$('pair').hidden)startTour()},800);
}else{
  $('k-joinform').addEventListener('submit',e=>{e.preventDefault();join($('k-code').value)});
  $('k-code').addEventListener('input',e=>{e.target.value=cleanCode(e.target.value)});
  if(!db){showJoin(t('noFb'));$('k-joinbtn').disabled=true}
  else{
    const code=cleanCode(new URLSearchParams(location.search).get('r'))||cleanCode(lsGet(CTLKEY));
    if(code.length===6){$('k-code').value=code;join(code)}else showJoin('');
  }
}
updConn();
})();
