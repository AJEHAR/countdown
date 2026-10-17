/* Papan Masa Peperiksaan — logik dikongsi oleh paparan (/) dan alat kawalan (/kawal/) */
(function(){
'use strict';
const MODE=window.APP_MODE==='control'?'control':'display';
document.body.classList.add('mode-'+MODE);
const CFG=window.FIREBASE_CONFIG||{};
const HAS_FB=!!(window.firebase&&CFG.apiKey&&CFG.databaseURL&&!/GANTI/i.test(CFG.apiKey));
const KEY='papanMasa.v1',RKEY='papanMasa.run.v1',ROOMKEY='papanMasa.room.v1',CTLKEY='papanMasa.ctlroom.v1';

const $=id=>document.getElementById(id);
const uid=()=>Math.random().toString(36).slice(2,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null}catch(e){return null}}
function lsGet(k){try{return localStorage.getItem(k)||''}catch(e){return ''}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
const CODE_CH='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode=()=>Array.from({length:6},()=>CODE_CH[Math.floor(Math.random()*CODE_CH.length)]).join('');
const cleanCode=c=>String(c||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);

/* ---------- Data ---------- */
const timer=(label,min,alert=true,alertMin=5,sound='loceng')=>({id:uid(),label,min,alert,alertMin,sound});
const SOUNDS={loceng:'Loceng sekolah',dingdong:'Ding-dong',bip:'Bip 3 kali',gong:'Gong',penggera:'Penggera',none:'Tiada bunyi'};
/* Bunyi fail: senarai dalam sounds/sounds.json. Tambah fail mp3 ke folder sounds/ dan satu baris dalam sounds.json. */
const BASE=MODE==='control'?'../':'';
let FILE_SOUNDS=[];
const validSound=k=>!!SOUNDS[k]||(typeof k==='string'&&k.startsWith('f:'));
fetch(BASE+'sounds/sounds.json',{cache:'no-cache'}).then(r=>r.ok?r.json():[]).then(list=>{
  FILE_SOUNDS=(Array.isArray(list)?list:[]).filter(x=>x&&typeof x.fail==='string').map(x=>({key:'f:'+x.fail,file:x.fail,name:String(x.nama||x.fail),rep:Math.min(10,Math.max(1,x.ulang|0||1))}));
  if(typeof renderEditor==='function'&&document.getElementById('ed')&&!document.getElementById('ed').hidden)renderEditor();
}).catch(()=>{});
function soundOptions(cur){
  const o=(k,v)=>`<option value="${k}"${cur===k?' selected':''}>${esc(v)}</option>`;
  let h='<optgroup label="Bunyi asas">'+Object.entries(SOUNDS).map(([k,v])=>o(k,v)).join('')+'</optgroup>';
  if(FILE_SOUNDS.length)h+='<optgroup label="Bunyi fail">'+FILE_SOUNDS.map(s=>o(s.key,s.name)).join('')+'</optgroup>';
  else if(cur.startsWith('f:'))h+=o(cur,cur.slice(2));
  return h;
}
let curAudio=null;
function playFile(key){
  const f=FILE_SOUNDS.find(s=>s.key===key),file=f?f.file:key.slice(2);let left=f?f.rep:1;
  try{if(curAudio){curAudio.pause()}
    const a=new Audio(BASE+'sounds/'+encodeURIComponent(file));curAudio=a;
    a.addEventListener('ended',()=>{if(--left>0&&curAudio===a){a.currentTime=0;a.play().catch(()=>{})}});
    a.play().catch(()=>{});
  }catch(e){}
}
function sampleSet(){
  const f='MUET SESI 3 2026';
  return {id:uid(),name:'MUET Sesi 3 2026 (contoh)',clock24:false,secs:false,scale:1,pi:0,pages:[
    {id:uid(),title:'LISTENING 800/1',notes:'12:00 – 12:50\n50 MINIT\n17/10/2026',align:'center',footer:f,timers:[timer('Masa menjawab',50)]},
    {id:uid(),title:'READING 800/3',notes:'14:00 – 15:15\n75 MINIT',align:'center',footer:f,timers:[timer('Masa menjawab',75,true,10)]},
    {id:uid(),title:'WRITING 800/4',notes:'Jawab SEMUA soalan.\nTulis nombor angka giliran pada setiap helaian.',align:'left',footer:f,
      timers:[timer('Bahagian 1',30,true,5),timer('Bahagian 2',45,true,5),timer('Kumpul kertas',80,false,0)]}
  ]};
}
const blankPage=f=>({id:uid(),title:'Kertas baru',notes:'',align:'center',footer:f||'',timers:[timer('Masa menjawab',60)]});
function normSet(s){
  const pages=(Array.isArray(s.pages)?s.pages:[]).map(p=>({id:uid(),title:String(p.title??''),notes:String(p.notes??''),
    align:['left','center','right'].includes(p.align)?p.align:'center',footer:String(p.footer??''),
    timers:(Array.isArray(p.timers)?p.timers:[]).slice(0,3).map(t=>({id:uid(),label:String(t.label??''),min:Math.max(.1,+t.min||1),alert:!!t.alert,alertMin:Math.max(0,+t.alertMin||0),sound:validSound(t.sound)?t.sound:'loceng'}))}));
  if(!pages.length) pages.push(blankPage(''));
  return {id:uid(),name:String(s.name||'Set import'),clock24:!!s.clock24,secs:!!s.secs,scale:Math.min(1.5,Math.max(.6,+s.scale||1)),pi:0,pages};
}
const validState=d=>d&&Array.isArray(d.sets)&&d.sets.length&&d.sets.every(s=>s&&Array.isArray(s.pages)&&s.pages.length);

let S=load(KEY), R=load(RKEY)||{};
if(!validState(S)) S={sets:[sampleSet()],cur:0};
if(!(S.cur>=0&&S.cur<S.sets.length)) S.cur=0;
const set=()=>S.sets[S.cur];
const page=()=>{const s=set();s.pi=Math.min(Math.max(0,s.pi|0),s.pages.length-1);s.pages.forEach(p=>{if(!Array.isArray(p.timers))p.timers=[]});return s.pages[s.pi]};

/* ---------- Masa ---------- */
let clockOff=0;
const now=()=>Date.now()+clockOff;
let headLabel='';
async function headSync(){
  try{const t0=Date.now();
    const r=await fetch(location.pathname+'?t='+t0,{method:'HEAD',cache:'no-store'});
    const t1=Date.now(),h=r.headers.get('date');if(!h)throw 0;
    const off=Date.parse(h)+500-(t0+t1)/2;
    clockOff=Math.abs(off)>3000?off:0;
    headLabel=clockOff?`● Jam peranti lari ${Math.round(clockOff/1000)}s, sudah dibetulkan`:'● Masa disemak';
  }catch(e){headLabel='○ Ikut jam peranti'}
  updConn();
}

/* ---------- Simpan & Firebase ---------- */
let db=null,roomRef=null,room=null,presRef=null,lastJSON='',pushT=null,online=false,ctlCount=0,dispCount=0;
function store(){try{localStorage.setItem(KEY,JSON.stringify(S));localStorage.setItem(RKEY,JSON.stringify(R))}catch(e){}}
function save(debounce){store();if(!roomRef)return;clearTimeout(pushT);if(debounce)pushT=setTimeout(push,400);else push()}
function push(){
  pushT=null;if(!roomRef)return;
  const str=JSON.stringify({S,R});if(str===lastJSON)return;lastJSON=str;
  roomRef.child('state').set(str).catch(err=>flash('Gagal simpan ke Firebase: '+(err.code||err.message)));
}
function applyRemote(str){
  if(str===lastJSON)return;
  let d;try{d=JSON.parse(str)}catch(e){return}
  if(!d||!validState(d.S))return;
  lastJSON=str;S=d.S;R=d.R||{};if(!(S.cur>=0&&S.cur<S.sets.length))S.cur=0;
  clearTimeout(pushT);pushT=null;store();renderStage();
  if(!$('ed').hidden){const a=document.activeElement;if(!(a&&$('ed').contains(a)&&a.matches('input,textarea,select')))renderEditor()}
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
    if(MODE==='display'&&n>ctlCount&&!$('pair').hidden)$('pair').hidden=true;
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
function updConn(){
  if(MODE==='display'){
    const el=$('conn');if(!el)return;
    if(!db){el.textContent=headLabel;return}
    el.innerHTML=room?`<span class="${online?'on-dot':''}">${online?'●':'○'}</span> Bilik <b>${room}</b> · 📱 ${ctlCount} alat kawalan`:'○ Menyambung…';
  }else{
    const el=$('k-status');if(!el)return;
    el.innerHTML=!online?'○ Luar talian':dispCount?'<span class="on-dot">●</span> Projektor bersambung':'○ Projektor belum dibuka';
  }
}

/* ---------- Countdown ---------- */
function tstate(t,n){const r=R[t.id];if(!r)return 'idle';if(r.st==='run')return r.end<=n?'done':'run';return r.st}
function remaining(t,n){const r=R[t.id],s=tstate(t,n);if(s==='idle')return t.min*60000;if(s==='run')return Math.max(0,r.end-n);if(s==='pause')return r.left;return 0}
function fmt(ms){const s=Math.ceil(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60,p=n=>String(n).padStart(2,'0');return h?`${h}:${p(m)}:${p(x)}`:`${p(m)}:${p(x)}`}
function startT(t){const n=now(),r=R[t.id],s=tstate(t,n);if(s==='run')return;R[t.id]=s==='pause'?{st:'run',end:n+r.left}:{st:'run',end:n+t.min*60000}}
function pauseT(t){const n=now();if(tstate(t,n)==='run')R[t.id]={st:'pause',left:Math.max(0,R[t.id].end-n)}}
const findT=id=>page().timers.find(t=>t.id===id);
const startAll=()=>{const n=now();page().timers.forEach(t=>{if(tstate(t,n)!=='done')startT(t)});save();tick()};
const pauseAll=()=>{page().timers.forEach(pauseT);save();tick()};

function timerCard(t){return `
  <div class="timer" data-tid="${t.id}">
    <div class="t-label">${esc(t.label||'Countdown')}</div>
    <div class="t-digits">--:--</div>
    <div class="t-state"></div>
    <div class="t-ctrl">
      <button class="btn small b-start" data-act="start" data-tid="${t.id}">▶ Mula</button>
      <button class="btn small b-pause" data-act="pause" data-tid="${t.id}">❚❚ Jeda</button>
      <button class="btn small" data-act="reset" data-tid="${t.id}">↺ Set semula</button>
    </div>
  </div>`}

/* ---------- Paparan ---------- */
function renderStage(){
  const st=set(),p=page();
  if(MODE==='display'){
    document.documentElement.style.setProperty('--scale',st.scale);
    const n=p.timers.length;
    $('stage').innerHTML=
      `<div class="clock" id="clock"></div>`+
      (p.title?`<h1 class="title">${esc(p.title)}</h1>`:'')+
      (p.notes?`<div class="notes" style="text-align:${p.align}">${esc(p.notes)}</div>`:'')+
      (n?`<div class="timers" style="--td:${[0,12,9,7][n]}vmin">${p.timers.map(timerCard).join('')}</div>`:'')+
      (p.footer?`<div class="footer">${esc(p.footer)}</div>`:'');
    $('pinfo').innerHTML=`<b>${esc(st.name)}</b> · Halaman ${st.pi+1} / ${st.pages.length}`;
  }else{
    $('k-title').textContent=p.title||'Tanpa tajuk';
    $('k-page').textContent=`${st.name} · Halaman ${st.pi+1} / ${st.pages.length}`;
    $('k-timers').innerHTML=p.timers.length?p.timers.map(timerCard).join(''):'<p class="hint">Tiada countdown pada halaman ini.</p>';
    $('k-pages').innerHTML=st.pages.map((pg,i)=>`<button class="chip${i===st.pi?' on':''}" data-act="goto" data-i="${i}">${i+1}. ${esc(pg.title||'Tanpa tajuk')}</button>`).join('');
  }
  $('b-prev').disabled=st.pi===0;
  $('b-next').disabled=st.pi===st.pages.length-1;
  tick();
}

function tick(){
  const n=now(),d=new Date(n),st=set(),p2=x=>String(x).padStart(2,'0');
  const c=$('clock');
  if(c){const h=d.getHours();
    c.textContent=(st.clock24?p2(h):String(h%12||12))+':'+p2(d.getMinutes())+(st.secs?':'+p2(d.getSeconds()):'')+(st.clock24?'':(h<12?' AM':' PM'))}
  page().timers.forEach(t=>{
    const el=document.querySelector(`.timer[data-tid="${t.id}"]`);if(!el)return;
    const s=tstate(t,n),left=remaining(t,n);
    el.querySelector('.t-digits').textContent=fmt(left);
    el.dataset.st=s;
    el.querySelector('.t-state').textContent={idle:'Sedia',run:'Sedang berjalan',pause:'Dijeda',done:'Masa tamat'}[s];
    el.querySelector('.b-start').textContent=s==='pause'?'▶ Sambung':'▶ Mula';
  });
  checkEvents(n);
  const sn=$('snd');
  if(sn){const need=set().pages.some(pg=>pg.timers.some(t=>(t.sound||'loceng')!=='none'));
    const txt=!need?'':(actx&&actx.state==='running')?'🔊 Bunyi aktif':'🔇 Klik skrin sekali untuk aktifkan bunyi';
    if(sn.textContent!==txt)sn.textContent=txt}
}

/* ---------- Berkelip 3 kali & bunyi ---------- */
const prevS={};
function checkEvents(n){
  set().pages.forEach(pg=>pg.timers.forEach(t=>{
    const s=tstate(t,n),left=remaining(t,n),pv=prevS[t.id];prevS[t.id]={s,left};
    if(!pv)return;
    const thr=t.alertMin*60000;
    if(t.alert&&thr>0&&s==='run'&&pv.s==='run'&&pv.left>thr&&left<=thr)blink(t.id);
    if(s==='done'&&pv.s==='run'){if(t.alert)blink(t.id);if(MODE==='display')playSound(t.sound||'loceng')}
  }));
}
function blink(id){const el=document.querySelector(`.timer[data-tid="${id}"]`);if(!el)return;
  el.classList.remove('blink');void el.offsetWidth;el.classList.add('blink')}
document.addEventListener('animationend',e=>{if(e.target.classList&&e.target.classList.contains('blink'))e.target.classList.remove('blink')});

let actx=null;
function audio(){
  if(!actx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;try{actx=new C()}catch(e){return null}}
  if(actx.state==='suspended')actx.resume().catch(()=>{});
  return actx;
}
function playSound(name){
  if(!name||name==='none')return;
  if(name.startsWith('f:')){playFile(name);return}
  const c=audio();if(!c)return;
  const t=c.currentTime+.05,out=c.createGain();out.gain.value=.9;out.connect(c.destination);
  const note=(f,st,dur,o={})=>{const type=o.type||'sine',vol=o.vol??.3,hold=o.hold;
    const osc=c.createOscillator(),g=c.createGain();osc.type=type;osc.frequency.value=f;
    g.gain.setValueAtTime(0,st);g.gain.linearRampToValueAtTime(vol,st+.01);
    if(hold){g.gain.setValueAtTime(vol,st+dur-.02);g.gain.linearRampToValueAtTime(0,st+dur)}
    else g.gain.exponentialRampToValueAtTime(.0001,st+dur);
    osc.connect(g);g.connect(out);osc.start(st);osc.stop(st+dur+.05)};
  switch(name){
    case 'bip':for(let i=0;i<3;i++)note(1000,t+i*.4,.25,{type:'square',vol:.12,hold:true});break;
    case 'dingdong':note(659,t,1.4,{vol:.35});note(1318,t,.8,{vol:.07});note(523,t+.7,1.9,{vol:.35});note(1046,t+.7,1,{vol:.07});break;
    case 'gong':[[110,.4],[165,.25],[220,.2],[293,.12],[415,.08]].forEach(([f,v])=>note(f,t,4.5,{vol:v}));break;
    case 'penggera':for(let i=0;i<8;i++)note(i%2?660:880,t+i*.25,.25,{type:'sawtooth',vol:.08,hold:true});break;
    default:for(let i=0;i<36;i++){const st=t+i*.07;note(1250,st,.12,{vol:.18});note(2500,st,.08,{vol:.05})}
  }
}
['pointerdown','keydown'].forEach(ev=>document.addEventListener(ev,()=>{if(MODE==='display')audio()},{passive:true}));
setInterval(tick,250);

/* ---------- Skrin penuh (paparan sahaja) ---------- */
let uiTimer;
function setPresent(on){document.body.classList.toggle('present',on);if(on){$('ed').hidden=true;pokeUI();
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

/* ---------- Kod bilik & QR ---------- */
function controlURL(){return location.origin+location.pathname.replace(/[^/]*$/,'')+'kawal/?r='+room}
function openPair(){
  const box=$('pair-body');
  if(!db){box.innerHTML='<p>Firebase belum disediakan. Isi fail <b>firebase-config.js</b> dahulu.</p>'}
  else if(!room){box.innerHTML='<p>Sedang menyambung ke Firebase…</p>'}
  else{
    const url=controlURL();let qr='';
    try{if(window.qrcode){const q=qrcode(0,'M');q.addData(url);q.make();qr=`<div class="qr">${q.createSvgTag(6,2)}</div>`}}catch(e){}
    box.innerHTML=`${qr}<p>Imbas QR, atau buka</p><div class="url">${esc(location.host+location.pathname.replace(/[^/]*$/,'')+'kawal')}</div><p>dan masukkan kod</p><div class="code">${room}</div>`;
  }
  $('pair').hidden=false;
}

/* ---------- Tindakan ---------- */
function go(i){const st=set();st.pi=Math.min(Math.max(0,i),st.pages.length-1);save();renderStage();if(!$('ed').hidden)renderEditor()}
function armed(btn,fn,label){if(btn.dataset.armed){delete btn.dataset.armed;fn();return}
  const old=btn.textContent;btn.dataset.armed='1';btn.textContent=label||'Tekan lagi untuk padam';
  setTimeout(()=>{if(btn.isConnected&&btn.dataset.armed){delete btn.dataset.armed;btn.textContent=old}},3000)}
function flash(t){const m=$('ed-msg');if(m)m.textContent=t}
function exportCode(){return JSON.stringify({app:'papan-masa',v:1,sets:S.sets.map(s=>({name:s.name,clock24:s.clock24,secs:s.secs,scale:s.scale,
  pages:s.pages.map(p=>({title:p.title,notes:p.notes,align:p.align,footer:p.footer,timers:p.timers.map(t=>({label:t.label,min:t.min,alert:t.alert,alertMin:t.alertMin,sound:t.sound||'loceng'}))}))}))})}
function toggleEditor(){$('ed').hidden=!$('ed').hidden;if(!$('ed').hidden)renderEditor()}

document.addEventListener('click',async e=>{
  if(e.target.id==='pair'){$('pair').hidden=true;return}
  const b=e.target.closest('[data-act]');if(!b)return;
  const a=b.dataset.act,st=set(),p=page(),i=+b.dataset.i;
  switch(a){
    case 'start':{const t=findT(b.dataset.tid);if(t){startT(t);save();tick()}break}
    case 'pause':{const t=findT(b.dataset.tid);if(t){pauseT(t);save();tick()}break}
    case 'reset':delete R[b.dataset.tid];save();tick();break;
    case 'testsound':playSound((p.timers[i]||{}).sound||'loceng');break;
    case 'startall':startAll();break;
    case 'pauseall':pauseAll();break;
    case 'resetall':armed(b,()=>{p.timers.forEach(t=>delete R[t.id]);save();tick();b.textContent='↺ Set semula semua'},'Tekan lagi untuk sahkan');break;
    case 'prev':go(st.pi-1);break;
    case 'next':go(st.pi+1);break;
    case 'fs':toggleFS();break;
    case 'pair':if($('pair').hidden)openPair();else $('pair').hidden=true;break;
    case 'edit':toggleEditor();break;
    case 'goto':go(i);break;
    case 'newroom':{const c=genCode();lsSet(ROOMKEY,c);flash('Membuka bilik baru…');await connect(c,true);renderEditor();openPair();break}
    case 'leave':disconnect();lsSet(CTLKEY,'');history.replaceState(null,'',location.pathname);$('ed').hidden=true;showJoin('');break;
    case 'newset':S.sets.push({id:uid(),name:'Set baru',clock24:false,secs:false,scale:1,pi:0,pages:[blankPage('')]});S.cur=S.sets.length-1;save();renderStage();renderEditor();break;
    case 'dupset':{const c=normSet(JSON.parse(JSON.stringify(st)));c.name=st.name+' (salinan)';S.sets.push(c);S.cur=S.sets.length-1;save();renderStage();renderEditor();break}
    case 'delset':if(S.sets.length<2){flash('Perlu ada sekurang-kurangnya satu set.');break}
      armed(b,()=>{S.sets.splice(S.cur,1);S.cur=0;save();renderStage();renderEditor()});break;
    case 'addpage':st.pages.splice(st.pi+1,0,blankPage(p.footer));st.pi++;save();renderStage();renderEditor();break;
    case 'duppage':{const c=JSON.parse(JSON.stringify(p));c.id=uid();c.timers.forEach(t=>t.id=uid());st.pages.splice(st.pi+1,0,c);st.pi++;save();renderStage();renderEditor();break}
    case 'movepage':{const j=st.pi+(+b.dataset.d);if(j<0||j>=st.pages.length)break;const [x]=st.pages.splice(st.pi,1);st.pages.splice(j,0,x);st.pi=j;save();renderStage();renderEditor();break}
    case 'delpage':if(st.pages.length<2){flash('Set perlu ada sekurang-kurangnya satu halaman.');break}
      armed(b,()=>{p.timers.forEach(t=>delete R[t.id]);st.pages.splice(st.pi,1);save();renderStage();renderEditor()});break;
    case 'align':p.align=b.dataset.v;save();renderStage();renderEditor();break;
    case 'addtimer':if(p.timers.length<3){p.timers.push(timer('Countdown '+(p.timers.length+1),30));save();renderStage();renderEditor()}break;
    case 'deltimer':{const [t]=p.timers.splice(i,1);if(t)delete R[t.id];save();renderStage();renderEditor();break}
    case 'export':$('ed-export').value=exportCode();flash('Kod dijana. Salin dan simpan, atau tampal di peranti lain.');break;
    case 'copy':{const ta=$('ed-export');if(!ta.value)ta.value=exportCode();
      const fb=()=>{ta.focus();ta.select();flash('Teks sudah dipilih. Tekan Ctrl+C untuk salin.')};
      try{navigator.clipboard.writeText(ta.value).then(()=>flash('Disalin ke papan klip.'),fb)}catch(err){fb()}break}
    case 'import':{const txt=$('ed-import').value.trim();if(!txt){flash('Tampal kod atau pilih fail dahulu.');break}
      try{const d=JSON.parse(txt);const sets=(Array.isArray(d.sets)?d.sets:[d]).map(normSet);
        S.sets.push(...sets);S.cur=S.sets.length-sets.length;save();renderStage();renderEditor();flash(sets.length+' set berjaya diimport.')}
      catch(err){flash('Kod tidak sah. Pastikan semua teks kod disalin dengan lengkap.')}break}
  }
});

document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,select')||e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key.toLowerCase(),st=set();
  if(k==='arrowright'||k==='pagedown'){go(st.pi+1);e.preventDefault()}
  else if(k==='arrowleft'||k==='pageup'){go(st.pi-1);e.preventDefault()}
  else if(k==='s')startAll();
  else if(k==='p')pauseAll();
  else if(k==='e')toggleEditor();
  else if(MODE==='display'&&k==='f')toggleFS();
  else if(k==='escape'){if($('pair')&&!$('pair').hidden)$('pair').hidden=true;
    else if(document.body.classList.contains('present')&&!document.fullscreenElement)setPresent(false)}
});

/* ---------- Tetapan ---------- */
function renderEditor(){
  const st=set(),p=page();
  const roomSec=MODE==='display'
    ?`<section><h3>Kawal dari telefon</h3>${db
      ?`<p>Kod bilik: <b>${room||'…'}</b></p><div class="row"><button class="btn small" data-act="pair">Tunjuk kod &amp; QR</button><button class="btn small" data-act="newroom">Tukar ke bilik baru</button></div>
        <p class="hint">Tukar ke bilik baru jika kod lama sudah diketahui orang lain. Telefon perlu sambung semula dengan kod baru.</p>`
      :`<p class="hint">Firebase belum disediakan. Isi fail firebase-config.js untuk kawal dari telefon.</p>`}</section>`
    :`<section><h3>Bilik</h3><p>Disambung ke bilik <b>${room||'-'}</b></p><button class="btn small" data-act="leave" style="align-self:flex-start">Tukar bilik</button></section>`;
  $('ed').innerHTML=`
  <div class="ed-head"><h2>Tetapan</h2><button class="btn" data-act="edit">Tutup ✕</button></div>
  <p class="hint" style="margin:8px 0 12px">Perubahan terus kelihatan pada projektor dan semua alat kawalan dalam bilik yang sama.</p>
  ${roomSec}
  <section><h3>Set peperiksaan</h3>
    <label for="ed-set">Set aktif</label>
    <select id="ed-set">${S.sets.map((s,i)=>`<option value="${i}"${i===S.cur?' selected':''}>${esc(s.name)}</option>`).join('')}</select>
    <label for="ed-setname">Nama set</label>
    <input type="text" id="ed-setname" data-f="setname" value="${esc(st.name)}">
    <div class="row"><button class="btn small" data-act="newset">+ Set baru</button><button class="btn small" data-act="dupset">Salin set</button><button class="btn small danger" data-act="delset">Padam set</button></div>
  </section>
  <section><h3>Halaman dalam set ini</h3>
    <div class="chips">${st.pages.map((pg,i)=>`<button class="chip${i===st.pi?' on':''}" data-act="goto" data-i="${i}">${i+1}. ${esc(pg.title||'Tanpa tajuk')}</button>`).join('')}</div>
    <div class="row">
      <button class="btn small" data-act="addpage">+ Halaman</button>
      <button class="btn small" data-act="duppage">Salin halaman</button>
      <button class="btn small" data-act="movepage" data-d="-1"${st.pi===0?' disabled':''}>◀ Alih</button>
      <button class="btn small" data-act="movepage" data-d="1"${st.pi===st.pages.length-1?' disabled':''}>Alih ▶</button>
      <button class="btn small danger" data-act="delpage">Padam halaman</button>
    </div>
  </section>
  <section><h3>Kandungan halaman ${st.pi+1}</h3>
    <label for="ed-title">Tajuk</label>
    <input type="text" id="ed-title" data-f="title" value="${esc(p.title)}" placeholder="cth. LISTENING 800/1">
    <label for="ed-notes">Catatan (satu baris setiap maklumat)</label>
    <textarea id="ed-notes" data-f="notes" rows="5" placeholder="cth.&#10;12:00 – 12:50&#10;50 MINIT">${esc(p.notes)}</textarea>
    <label>Jajaran catatan</label>
    <div class="seg" role="group" aria-label="Jajaran catatan">${[['left','Kiri'],['center','Tengah'],['right','Kanan']].map(([v,l])=>`<button data-act="align" data-v="${v}" class="${p.align===v?'on':''}" aria-pressed="${p.align===v}">${l}</button>`).join('')}</div>
    <label for="ed-footer">Footer</label>
    <input type="text" id="ed-footer" data-f="footer" value="${esc(p.footer)}" placeholder="cth. MUET SESI 3 2026">
  </section>
  <section><h3>Countdown (${p.timers.length}/3)</h3>
    ${p.timers.map((t,i)=>`<div class="tbox">
      <div class="tb-head"><strong>Countdown ${i+1}</strong><button class="btn small danger" data-act="deltimer" data-i="${i}">Buang</button></div>
      <label for="ed-tl-${i}">Label</label>
      <input type="text" id="ed-tl-${i}" data-f="tlabel" data-i="${i}" value="${esc(t.label)}">
      <div class="grid2">
        <div><label for="ed-tm-${i}">Tempoh (minit)</label><input type="number" id="ed-tm-${i}" data-f="tmin" data-i="${i}" min="1" step="1" value="${t.min}"></div>
        <div><label for="ed-ta-${i}">Berkelip bila tinggal (minit)</label><input type="number" id="ed-ta-${i}" data-f="talertmin" data-i="${i}" min="0" step="1" value="${t.alertMin}"${t.alert?'':' disabled'}></div>
      </div>
      <label class="check"><input type="checkbox" id="ed-tc-${i}" data-f="talert" data-i="${i}"${t.alert?' checked':''}> Berkelip 3 kali (bila tinggal masa di atas, dan bila tamat)</label>
      <label for="ed-ts-${i}">Bunyi bila tamat</label>
      <div class="row" style="flex-wrap:nowrap"><select id="ed-ts-${i}" data-f="tsound" data-i="${i}">${soundOptions(t.sound||'loceng')}</select>
        <button class="btn small" data-act="testsound" data-i="${i}">▶ Uji</button></div>
    </div>`).join('')}
    ${p.timers.length<3?'<button class="btn small" data-act="addtimer" style="align-self:flex-start">+ Tambah countdown</button>':''}
    <p class="hint">Countdown bermula hanya bila ▶ Mula ditekan. Bunyi dimainkan di projektor. Letak 0 minit jika mahu berkelip hanya bila tamat.</p>
  </section>
  <section><h3>Paparan set ini</h3>
    <div class="grid2">
      <div><label for="ed-clk">Format jam</label><select id="ed-clk" data-f="clock24"><option value="0"${st.clock24?'':' selected'}>12 jam (AM/PM)</option><option value="1"${st.clock24?' selected':''}>24 jam</option></select></div>
      <div><label for="ed-scale">Saiz teks: <span id="ed-scalev">${Math.round(st.scale*100)}%</span></label><input type="range" id="ed-scale" data-f="scale" min="60" max="150" step="5" value="${Math.round(st.scale*100)}"></div>
    </div>
    <label class="check"><input type="checkbox" id="ed-secs" data-f="secs"${st.secs?' checked':''}> Tunjuk saat pada jam</label>
    <p class="hint">${db?'Jam ikut masa pelayan Firebase, jadi projektor dan telefon sentiasa sama.':'Jam disemak dengan masa pelayan setiap 10 minit.'}</p>
  </section>
  <section><h3>Simpan ke fail kod</h3>
    <p class="hint">Untuk simpanan atau bawa set ke bilik lain: jana kod, salin, kemudian tampal di bahagian Import.</p>
    <div class="row"><button class="btn small" data-act="export">Jana kod</button><button class="btn small" data-act="copy">Salin kod</button></div>
    <textarea id="ed-export" rows="3" readonly aria-label="Kod eksport"></textarea>
    <label for="ed-import">Import</label>
    <textarea id="ed-import" rows="3" placeholder="Tampal kod di sini"></textarea>
    <input type="file" id="ed-file" accept=".json,.txt,application/json,text/plain" aria-label="Pilih fail kod">
    <button class="btn small primary" data-act="import" style="align-self:flex-start">Import set</button>
  </section>
  <div class="msg" id="ed-msg" role="status"></div>
  ${MODE==='display'?`<section><h3>Pintasan papan kekunci</h3>
    <div class="keys"><kbd>→</kbd><span>Halaman seterusnya</span><kbd>←</kbd><span>Halaman sebelum</span><kbd>F</kbd><span>Skrin penuh</span><kbd>S</kbd><span>Mula / sambung semua</span><kbd>P</kbd><span>Jeda semua</span><kbd>E</kbd><span>Buka/tutup tetapan</span></div>
  </section>`:''}`;
}

$('ed').addEventListener('input',e=>{
  const el=e.target,f=el.dataset.f,st=set(),p=page(),i=+el.dataset.i;
  if(el.id==='ed-set'){S.cur=+el.value;save();renderStage();renderEditor();return}
  if(!f)return;
  switch(f){
    case 'setname':{st.name=el.value;const o=document.querySelector(`#ed-set option[value="${S.cur}"]`);if(o)o.textContent=el.value;break}
    case 'title':{p.title=el.value;const ch=$('ed').querySelector(`.chip[data-i="${st.pi}"]`);if(ch)ch.textContent=(st.pi+1)+'. '+(el.value||'Tanpa tajuk');break}
    case 'notes':p.notes=el.value;break;
    case 'footer':p.footer=el.value;break;
    case 'tlabel':p.timers[i].label=el.value;break;
    case 'tmin':{const v=parseFloat(el.value);if(v>0)p.timers[i].min=v;break}
    case 'talertmin':{const v=parseFloat(el.value);if(v>=0)p.timers[i].alertMin=v;break}
    case 'tsound':p.timers[i].sound=el.value;playSound(el.value);break;
    case 'talert':{p.timers[i].alert=el.checked;const am=$('ed-ta-'+i);if(am)am.disabled=!el.checked;break}
    case 'clock24':st.clock24=el.value==='1';break;
    case 'secs':st.secs=el.checked;break;
    case 'scale':st.scale=+el.value/100;$('ed-scalev').textContent=el.value+'%';break;
  }
  save(true);renderStage();
});
$('ed').addEventListener('change',e=>{
  if(e.target.id==='ed-file'&&e.target.files[0]){const r=new FileReader();
    r.onload=()=>{$('ed-import').value=r.result;flash('Fail dibaca. Tekan Import set.')};r.readAsText(e.target.files[0])}
});

/* ---------- Alat kawalan: sambung bilik ---------- */
function showJoin(msg){$('k-joinform').hidden=false;$('k-main').hidden=true;$('k-joinmsg').textContent=msg||'';$('k-room').textContent=''}
async function join(code){
  code=cleanCode(code);
  if(code.length!==6){showJoin('Kod perlu 6 aksara.');return}
  $('k-joinmsg').textContent='Menyambung…';
  const r=await connect(code,false);
  if(r==='missing'){showJoin(`Bilik ${code} tidak dijumpai. Buka paparan projektor dahulu, kemudian semak kod.`);return}
  if(r!=='ok'){showJoin('Tidak dapat sambung ke Firebase ('+r.replace('error:','')+').');return}
  lsSet(CTLKEY,code);history.replaceState(null,'','?r='+code);
  $('k-joinform').hidden=true;$('k-main').hidden=false;$('k-room').textContent='Bilik '+code;
  renderStage();
}

/* ---------- Mula ---------- */
if(MODE==='display'){
  renderStage();
  if(db){
    const qs=new URLSearchParams(location.search);
    let code=cleanCode(qs.get('r'))||cleanCode(lsGet(ROOMKEY));
    if(code.length!==6)code=genCode();
    lsSet(ROOMKEY,code);
    connect(code,true).then(r=>{if(r!=='ok')$('conn').textContent='○ Firebase gagal: '+r.replace('error:','')});
  }
}else{
  $('k-joinform').addEventListener('submit',e=>{e.preventDefault();join($('k-code').value)});
  $('k-code').addEventListener('input',e=>{e.target.value=cleanCode(e.target.value)});
  if(!db){showJoin('Firebase belum disediakan. Isi fail firebase-config.js dahulu.');$('k-joinbtn').disabled=true}
  else{
    const code=cleanCode(new URLSearchParams(location.search).get('r'))||cleanCode(lsGet(CTLKEY));
    if(code.length===6){$('k-code').value=code;join(code)}else showJoin('');
  }
}
})();
