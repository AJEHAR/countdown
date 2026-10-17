/* Exam Clock / Papan Masa Peperiksaan — shared logic for the display (/) and phone remote (/kawal/) */
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
  document.title=MODE==='control'?t('ctlTitle'):t('appTitle');
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n)});
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{el.placeholder=t(el.dataset.i18nPh)});
  document.querySelectorAll('.lang-switch button').forEach(b=>b.classList.toggle('on',b.dataset.lang===LANG));
}
function setLang(l){LANG=l==='ms'?'ms':'en';lsSet(LANGKEY,LANG);dateFmt=null;applyStatic();renderStage();if(settingsOpen())renderEditor();updConn();if(!$('pair')||$('pair').hidden)return;openPair()}

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
const blankPage=f=>({id:uid(),title:t('newPageTitle'),notes:'',align:'center',footer:f||'',mode:'separate',timers:[]});
function normSet(s){
  const pages=(Array.isArray(s.pages)?s.pages:[]).map(p=>({id:uid(),title:String(p.title??''),notes:String(p.notes??''),
    align:['left','center','right'].includes(p.align)?p.align:'center',footer:String(p.footer??''),mode:p.mode==='continuous'?'continuous':'separate',
    timers:(Array.isArray(p.timers)?p.timers:[]).slice(0,3).map(x=>({id:uid(),label:String(x.label??''),min:Math.max(.1,+x.min||1),alert:!!x.alert,alertMin:Math.max(0,+x.alertMin||0),sound:validSound(x.sound)?x.sound:'loceng'}))}));
  if(!pages.length)pages.push(blankPage(''));
  return {id:uid(),name:String(s.name||'Import'),clock24:!!s.clock24,secs:!!s.secs,showDate:s.showDate!==false,scale:Math.min(1.5,Math.max(.6,+s.scale||1)),pi:0,pages};
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
    const stage=$('stage');stage.classList.toggle('no-timers',!n);
    const rows=[`<div class="row r-clock"><div class="plate"><div class="clock" id="clock"></div>${st.showDate!==false?'<div class="date" id="date"></div>':''}</div></div>`];
    if(p.title)rows.push(`<div class="row r-title"><h1 class="title">${esc(p.title)}</h1></div>`);
    if(p.notes||p.footer)rows.push(`<div class="row r-notes">${p.notes?`<div class="notes" style="text-align:${p.align}">${esc(p.notes)}</div>`:''}${p.footer?`<div class="footer">${esc(p.footer)}</div>`:''}</div>`);
    stage.innerHTML=`<section class="info" style="grid-template-rows:repeat(${rows.length},minmax(0,1fr))">${rows.join('')}</section>`+
      (n?`<aside class="panel" style="--n:${n}" aria-label="${esc(t('countdowns'))}">${p.timers.map(x=>`
        <div class="tcard" data-tid="${x.id}"><div class="tc-label">${esc(x.label||t('cdN',{n:''}))}</div><div class="tc-digits">--:--</div><div class="tc-sub"></div></div>`).join('')}</aside>`:'');
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
function tick(){
  const n=now(),d=new Date(n),st=set();
  const c=$('clock');if(c){const v=fmtClock(d,st,st.secs);if(c.textContent!==v)c.textContent=v}
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
function closeOverlay(id){const o=$(id);if(!o||o.hidden)return;o.classList.add('closing');o.classList.remove('open');
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
function openSettings(){renderEditor();openOverlay('ed');setTimeout(()=>{const f=$('ed').querySelector('.m-tab[aria-selected="true"]');if(f)f.focus({preventScroll:true})},200)}
function toggleSettings(){settingsOpen()?closeOverlay('ed'):openSettings()}

/* ---------- Actions ---------- */
function go(i){const st=set();st.pi=Math.min(Math.max(0,i),st.pages.length-1);save();renderStage();if(settingsOpen())renderEditor()}
function armed(btn,fn,key){if(btn.dataset.armed){delete btn.dataset.armed;fn();return}
  const old=btn.textContent;btn.dataset.armed='1';btn.textContent=t(key||'armDelete');
  setTimeout(()=>{if(btn.isConnected&&btn.dataset.armed){delete btn.dataset.armed;btn.textContent=old}},3000)}
function flash(s){const m=$('ed-msg');if(m){m.textContent=s;m.className='msg';clearTimeout(flash.t);flash.t=setTimeout(()=>{if(m.isConnected){m.textContent=t('saved');m.className=''}},4000)}}
function exportCode(){return JSON.stringify({app:'papan-masa',v:2,sets:S.sets.map(s=>({name:s.name,clock24:s.clock24,secs:s.secs,showDate:s.showDate!==false,scale:s.scale,
  pages:s.pages.map(p=>({title:p.title,notes:p.notes,align:p.align,footer:p.footer,mode:p.mode||'separate',timers:p.timers.map(x=>({label:x.label,min:x.min,alert:x.alert,alertMin:x.alertMin,sound:x.sound||'loceng'}))}))}))})}
let edTab='content';

document.addEventListener('click',async e=>{
  if(e.target.id==='pair'){closeOverlay('pair');return}
  if(e.target.id==='ed'){closeOverlay('ed');return}
  const b=e.target.closest('[data-act]');if(!b)return;
  const a=b.dataset.act,st=set(),p=page(),i=+b.dataset.i;
  switch(a){
    case 'start':{if(isChain()){startAll();break}const x=findT(b.dataset.tid);if(x){startT(x);save();tick()}break}
    case 'pause':{if(isChain()){pauseAll();break}const x=findT(b.dataset.tid);if(x){pauseT(x);save();tick()}break}
    case 'mode':p.mode=b.dataset.v==='continuous'?'continuous':'separate';p.timers.forEach(x=>delete R[x.id]);save();renderStage();renderEditor();break;
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
    case 'tab':edTab=b.dataset.tab;renderEditor();{const f=$('ed').querySelector('.m-tab[aria-selected="true"]');if(f)f.focus()}break;
    case 'lang':setLang(b.dataset.lang);break;
    case 'goto':go(i);break;
    case 'newroom':{const c=genCode();lsSet(ROOMKEY,c);flash(t('newRoomMsg'));await connect(c,true);renderEditor();closeOverlay('ed');openPair();break}
    case 'leave':disconnect();lsSet(CTLKEY,'');history.replaceState(null,'',location.pathname);closeOverlay('ed');showJoin('');break;
    case 'newset':S.sets.push({id:uid(),name:t('newSessionName'),clock24:false,secs:false,showDate:true,scale:1,pi:0,pages:[blankPage('')]});S.cur=S.sets.length-1;save();renderStage();renderEditor();break;
    case 'dupset':{const c=normSet(JSON.parse(JSON.stringify(st)));c.name=st.name+t('copySuffix');S.sets.push(c);S.cur=S.sets.length-1;save();renderStage();renderEditor();break}
    case 'delset':if(S.sets.length<2){flash(t('needSession'));break}
      armed(b,()=>{S.sets.splice(S.cur,1);S.cur=0;save();renderStage();renderEditor()});break;
    case 'addpage':st.pages.splice(st.pi+1,0,blankPage(p.footer));st.pi++;save();renderStage();edTab='content';renderEditor();break;
    case 'duppage':{const c=JSON.parse(JSON.stringify(p));c.id=uid();c.timers.forEach(x=>x.id=uid());st.pages.splice(st.pi+1,0,c);st.pi++;save();renderStage();renderEditor();break}
    case 'movepage':{const j=st.pi+(+b.dataset.d);if(j<0||j>=st.pages.length)break;const [x]=st.pages.splice(st.pi,1);st.pages.splice(j,0,x);st.pi=j;save();renderStage();renderEditor();break}
    case 'delpage':if(st.pages.length<2){flash(t('needPage'));break}
      armed(b,()=>{p.timers.forEach(x=>delete R[x.id]);st.pages.splice(st.pi,1);save();renderStage();renderEditor()});break;
    case 'align':p.align=b.dataset.v;save();renderStage();renderEditor();break;
    case 'addtimer':if(p.timers.length<3){p.timers.push(timer(p.timers.length?t('cdN',{n:p.timers.length+1}):t('defaultLabel'),p.timers.length?30:60));save();renderStage();renderEditor()}break;
    case 'deltimer':{const [x]=p.timers.splice(i,1);if(x)delete R[x.id];save();renderStage();renderEditor();break}
    case 'testsound':playSound((p.timers[i]||{}).sound||'loceng');break;
    case 'export':$('ed-export').value=exportCode();flash(t('codeMade'));break;
    case 'copy':{const ta=$('ed-export');if(!ta.value)ta.value=exportCode();
      const fb=()=>{ta.focus();ta.select();flash(t('selectCopy'))};
      try{navigator.clipboard.writeText(ta.value).then(()=>flash(t('copied')),fb)}catch(err){fb()}break}
    case 'import':{const txt=$('ed-import').value.trim();if(!txt){flash(t('pasteFirst'));break}
      try{const d=JSON.parse(txt);const sets=(Array.isArray(d.sets)?d.sets:[d]).map(normSet);
        S.sets.push(...sets);S.cur=S.sets.length-sets.length;save();renderStage();renderEditor();flash(t('imported',{n:sets.length}))}
      catch(err){flash(t('badCode'))}break}
  }
});

document.addEventListener('keydown',e=>{
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
function renderEditor(){
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
      <div class="field"><label for="ed-footer">${esc(t('footer'))}</label>
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
    const modeBar=p.timers.length>1?`<div class="modebar"><span class="flabel">${esc(t('modeLbl'))}</span>
      <div class="seg" role="group" aria-label="${esc(t('modeLbl'))}">${['separate','continuous'].map(v=>`<button data-act="mode" data-v="${v}" class="${(p.mode||'separate')===v?'on':''}" aria-pressed="${(p.mode||'separate')===v}">${esc(t(v==='separate'?'modeSep':'modeCont'))}</button>`).join('')}</div>
      <span class="hint">${esc(t(p.mode==='continuous'?'modeHintCont':'modeHintSep'))}</span></div>`:'';
    body=modeBar+`<div class="tgrid">${p.timers.map((x,i)=>`
      <div class="tbox">
        <div class="tb-head"><strong>${esc(t('cdN',{n:i+1}))}</strong><button class="btn small danger" data-act="deltimer" data-i="${i}">${esc(t('remove'))}</button></div>
        <div class="field"><label for="ed-tl-${i}">${esc(t('label'))}</label><input type="text" id="ed-tl-${i}" data-f="tlabel" data-i="${i}" value="${esc(x.label)}"></div>
        <div class="field"><label for="ed-tm-${i}">${esc(t('minutes'))}</label><input type="number" id="ed-tm-${i}" data-f="tmin" data-i="${i}" min="1" step="1" value="${x.min}"></div>
        <div class="field"><label class="check"><input type="checkbox" id="ed-tc-${i}" data-f="talert" data-i="${i}"${x.alert?' checked':''}> ${esc(t('blink'))}</label>
          <div class="inline"><input type="number" id="ed-ta-${i}" data-f="talertmin" data-i="${i}" min="0" step="1" value="${x.alertMin}"${x.alert?'':' disabled'} aria-label="${esc(t('blinkWhen'))}"><span class="hint">${esc(t('blinkWhen'))}</span></div></div>
        <div class="field"><label for="ed-ts-${i}">${esc(t('sound'))}</label>
          <div class="inline"><select id="ed-ts-${i}" data-f="tsound" data-i="${i}">${sl.map(s=>`<option value="${esc(s.key)}"${(x.sound||'loceng')===s.key?' selected':''}>${esc(s.name)}</option>`).join('')}</select>
          <button class="btn small" data-act="testsound" data-i="${i}">${esc(t('test'))}</button></div></div>
      </div>`).join('')}
      ${p.timers.length<3?`<button class="tbox add" data-act="addtimer"><span class="plus" aria-hidden="true">+</span><span>${esc(t('addCd').replace('+ ',''))}</span></button>`:''}</div>
    <p class="hint">${esc(t('cdHint'))} ${esc(t('blinkHint'))}</p>`;}
  }else if(edTab==='display'){
    body=`
    <div class="grid2">
      <div class="field"><span class="flabel">${esc(t('language'))}</span>
        <div class="seg" role="group" aria-label="${esc(t('language'))}"><button data-act="lang" data-lang="en" class="${LANG==='en'?'on':''}">English</button><button data-act="lang" data-lang="ms" class="${LANG==='ms'?'on':''}">Bahasa Melayu</button></div>
        <p class="hint">${esc(t('langHint'))}</p></div>
      <div class="field"><label for="ed-clk">${esc(t('clockFmt'))}</label>
        <select id="ed-clk" data-f="clock24"><option value="0"${st.clock24?'':' selected'}>${esc(t('h12'))}</option><option value="1"${st.clock24?' selected':''}>${esc(t('h24'))}</option></select></div>
    </div>
    <div class="grid2">
      <div class="field"><label class="check"><input type="checkbox" id="ed-secs" data-f="secs"${st.secs?' checked':''}> ${esc(t('secs'))}</label>
        <label class="check"><input type="checkbox" id="ed-date" data-f="showDate"${st.showDate!==false?' checked':''}> ${esc(t('showDate'))}</label></div>
      <div class="field"><label for="ed-scale">${esc(t('size'))}: <span id="ed-scalev">${Math.round(st.scale*100)}%</span></label>
        <input type="range" id="ed-scale" data-f="scale" min="60" max="150" step="5" value="${Math.round(st.scale*100)}"></div>
    </div>
    <p class="hint">${esc(db?t('timeHintFb'):t('timeHint'))}</p>`;
  }else{
    const phone=MODE==='display'
      ?(db?`<p>${esc(t('roomCode'))}: <b>${room||'…'}</b></p>
          <div class="row-btns"><button class="btn small" data-act="pair">${esc(t('showQr'))}</button><button class="btn small" data-act="newroom">${esc(t('newRoom'))}</button></div>
          <p class="hint">${esc(t('roomHint'))}</p>`:`<p class="hint">${esc(t('noFb'))}</p>`)
      :`<p>${esc(t('roomConnected',{code:room||'-'}))}</p><div class="row-btns"><button class="btn small" data-act="leave">${esc(t('changeRoom'))}</button></div>`;
    body=`
    <div class="group"><h3>${esc(t('sessionGrp'))}</h3>
      <div class="field"><label for="ed-setname">${esc(t('sessionName'))}</label><input type="text" id="ed-setname" data-f="setname" value="${esc(st.name)}"></div>
      <div class="row-btns"><button class="btn small" data-act="newset">${esc(t('newSession'))}</button><button class="btn small" data-act="dupset">${esc(t('dupSession'))}</button><button class="btn small danger" data-act="delset">${esc(t('delSession'))}</button></div></div>
    <div class="group"><h3>${esc(t('phoneGrp'))}</h3>${phone}</div>
    <div class="group"><h3>${esc(t('backupGrp'))}</h3>
      <p class="hint">${esc(t('backupHint'))}</p>
      <div class="row-btns"><button class="btn small" data-act="export">${esc(t('genCode'))}</button><button class="btn small" data-act="copy">${esc(t('copy'))}</button></div>
      <textarea id="ed-export" rows="3" readonly aria-label="${esc(t('exportLbl'))}"></textarea>
      <div class="field"><label for="ed-import">${esc(t('importLbl'))}</label>
        <textarea id="ed-import" rows="3" placeholder="${esc(t('importPh'))}"></textarea>
        <input type="file" id="ed-file" accept=".json,.txt,application/json,text/plain" aria-label="${esc(t('importLbl'))}"></div>
      <div class="row-btns"><button class="btn small primary" data-act="import">${esc(t('importBtn'))}</button></div></div>
    ${MODE==='display'?`<div class="group"><h3>${esc(t('keysGrp'))}</h3><div class="keys">
      <kbd>→</kbd><span>${esc(t('kNext'))}</span><kbd>←</kbd><span>${esc(t('kPrev'))}</span><kbd>F</kbd><span>${esc(t('kFs'))}</span>
      <kbd>S</kbd><span>${esc(t('kStart'))}</span><kbd>P</kbd><span>${esc(t('kPause'))}</span><kbd>E</kbd><span>${esc(t('kSettings'))}</span></div></div>`:''}`;
  }
  $('ed').innerHTML=`
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ed-h">
    <div class="m-head">
      <h2 id="ed-h">${esc(t('settings').replace('✎ ',''))}</h2>
      <div class="m-session"><label for="ed-set">${esc(t('sessionLbl'))}</label>
        <select id="ed-set">${S.sets.map((s,i)=>`<option value="${i}"${i===S.cur?' selected':''}>${esc(s.name)}</option>`).join('')}</select></div>
      <button class="icon-btn" data-act="close" aria-label="${esc(t('close'))}">✕</button>
    </div>
    <div class="m-pages">${st.pages.map((pg,i)=>`<button class="chip${i===st.pi?' on':''}" data-act="goto" data-i="${i}">${i+1}. ${esc(pg.title||t('untitled'))}</button>`).join('')}
      <button class="chip add" data-act="addpage">${esc(t('addPage'))}</button></div>
    <div class="m-tabs" role="tablist">${tabs.map(([k,l])=>`<button class="m-tab" role="tab" data-act="tab" data-tab="${k}" aria-selected="${edTab===k}">${esc(t(l))}</button>`).join('')}</div>
    <div class="m-body" role="tabpanel">${body}</div>
    <div class="m-foot"><span id="ed-msg">${esc(t('saved'))}</span><span>${esc(t('escHint'))}</span></div>
  </div>`;
  const nb=$('ed').querySelector('.m-body');if(nb)nb.scrollTop=scroll;
}

$('ed').addEventListener('input',e=>{
  const el=e.target,f=el.dataset.f,st=set(),p=page(),i=+el.dataset.i;
  if(el.id==='ed-set'){S.cur=+el.value;save();renderStage();renderEditor();return}
  if(!f)return;
  switch(f){
    case 'setname':{st.name=el.value;const o=document.querySelector(`#ed-set option[value="${S.cur}"]`);if(o)o.textContent=el.value;break}
    case 'title':{p.title=el.value;const ch=$('ed').querySelector(`.m-pages .chip[data-i="${st.pi}"]`);if(ch)ch.textContent=(st.pi+1)+'. '+(el.value||t('untitled'));break}
    case 'notes':p.notes=el.value;break;
    case 'footer':p.footer=el.value;break;
    case 'tlabel':p.timers[i].label=el.value;break;
    case 'tmin':{const v=parseFloat(el.value);if(v>0)p.timers[i].min=v;break}
    case 'talertmin':{const v=parseFloat(el.value);if(v>=0)p.timers[i].alertMin=v;break}
    case 'talert':{p.timers[i].alert=el.checked;const am=$('ed-ta-'+i);if(am)am.disabled=!el.checked;break}
    case 'tsound':p.timers[i].sound=el.value;playSound(el.value);break;
    case 'clock24':st.clock24=el.value==='1';break;
    case 'secs':st.secs=el.checked;break;
    case 'showDate':st.showDate=el.checked;break;
    case 'scale':st.scale=+el.value/100;$('ed-scalev').textContent=el.value+'%';break;
  }
  save(true);renderStage();
});
$('ed').addEventListener('change',e=>{
  if(e.target.id==='ed-file'&&e.target.files[0]){const r=new FileReader();
    r.onload=()=>{$('ed-import').value=r.result;flash(t('fileRead'))};r.readAsText(e.target.files[0])}
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
