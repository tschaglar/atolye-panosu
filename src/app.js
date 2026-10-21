import * as B from './backend.js';
import * as N from './native.js';
import { buildPdf } from './pdf.js';
import FONTS from './fonts.json';
import { jsPDF } from 'jspdf';

document.documentElement.lang='tr';

/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LS={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,String(v))}catch(e){}}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>ymd(new Date());
const nowHM=()=>{const d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes())};
const toMin=hm=>{const [h,m]=String(hm).split(':').map(Number);return h*60+m};
const dayDate=day=>new Date(day+'T12:00:00');
const addDays=(day,n)=>{const d=dayDate(day);d.setDate(d.getDate()+n);return ymd(d)};
const lower=s=>String(s||'').toLocaleLowerCase('tr');
function fmtDay(day){
  if(!day) return '';
  const t=today();
  if(day===t) return 'Bugün';
  if(day===addDays(t,1)) return 'Yarın';
  if(day===addDays(t,-1)) return 'Dün';
  const d=dayDate(day), o={day:'numeric',month:'short'};
  if(d.getFullYear()!==new Date().getFullYear()) o.year='numeric';
  return d.toLocaleDateString('tr-TR',o);
}
function fmtAgo(ms){
  const s=(Date.now()-ms)/1000;
  if(s<60) return 'az önce';
  if(s<3600) return Math.floor(s/60)+' dk önce';
  if(s<86400) return Math.floor(s/3600)+' sa önce';
  const d=Math.floor(s/86400);
  return d===1?'dün':d+' gün önce';
}
const fmtStamp=ms=>new Date(ms).toLocaleString('tr-TR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const TL=new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2});
const money=n=>TL.format(n||0);
const fnum=(n,d=2)=>Number(n).toLocaleString('tr-TR',{maximumFractionDigits:d});
const fnumIn=n=>n==null?'':Number(n).toLocaleString('tr-TR',{useGrouping:false,maximumFractionDigits:2});
function parseNum(s){
  s=String(s??'').trim().replace(/\s|₺/g,'');
  if(!s) return null;
  if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(s)) s=s.replace(/\./g,'');
  const n=Number(s);
  return isFinite(n)?n:NaN;
}
const initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(w=>w.charAt(0)).join('').toLocaleUpperCase('tr')||'?';
const VAT=0.20;
const JOB_TYPES=['Cephe giydirme','Totem tabela','Kompozit tabela','Kutu harf','Folyo / baskı','Araç','Montaj','Diğer'];
const VEHICLE='Araç';
function normPlate(s){
  const raw=String(s||'').toUpperCase().replace(/\s+/g,' ').trim(), m=raw.replace(/\s/g,'').match(/^(\d{2})([A-Z]{1,3})(\d{2,5})$/);
  return m?m[1]+' '+m[2]+' '+m[3]:raw;
}
const plateHtml=p=>p?`<span class="plate" aria-label="Plaka ${esc(p)}"><i>TR</i><b>${esc(p)}</b></span>`:'';
const tl=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' TL';
const dmy=day=>{const p=String(day||'').split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:''};
const REPEAT={none:'Tek sefer',daily:'Her gün',weekdays:'Hafta içi'};

const ICON={
  today:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  team:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.5c2.4-.2 4.2 1.3 4.6 4.5"/>',
  firms:'<path d="M4 20V10l8-6 8 6v10"/><path d="M9.5 20v-5h5v5"/><path d="M2.5 20h19"/>',
  bell:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  check:'<path d="M5.5 12.5l4 4L18.5 7.5"/>',
  back:'<path d="M15 5l-7 7 7 7"/>',
  chev:'<path d="M9 5l7 7-7 7"/>',
  repeat:'<path d="M17 3l3 3-3 3"/><path d="M4 12v-2a4 4 0 0 1 4-4h12"/><path d="M7 21l-3-3 3-3"/><path d="M20 12v2a4 4 0 0 1-4 4H4"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert:'<path d="M12 3.5l9 16H3z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  price:'<path d="M3.5 12.5V4h8.5l9 9-8.5 8.5z"/><circle cx="8" cy="8.5" r="1.4"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11.5v6M9.5 15l2.5 2.5 2.5-2.5"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'
};
const ic=(n,c='')=>`<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]||''}</svg>`;

/* ---------- state ---------- */
const S={
  phase:'boot',err:null,lastLoad:0,push:'unknown',vapid:'',update:null,
  staff:new Map(),tasks:new Map(),firms:new Map(),jobs:new Map(),settings:new Map(),
  loaded:{staff:false,tasks:false,firms:false,jobs:false,settings:false},
  meId:null,tab:LS.get('atp.tab')||'bugun',firmOpen:null,person:null,jobFilter:'all',keep:{},
  seenAt:Number(LS.get('atp.seen'))||0,prevSeen:0,day:today(),firmLoaded:new Set()
};
if(!['bugun','ekip','firmalar','bildirim'].includes(S.tab)) S.tab='bugun';
if(!S.seenAt){S.seenAt=Date.now();LS.set('atp.seen',S.seenAt)}
S.prevSeen=S.seenAt;

const allLoaded=()=>Object.values(S.loaded).every(Boolean);
const activeStaff=()=>[...S.staff].filter(([,s])=>s.active!==false).sort((a,b)=>String(a[1].name).localeCompare(String(b[1].name),'tr'));
const nm=id=>(S.staff.get(id)||{}).name||'Kayıtsız kişi';
const isMgr=id=>(S.staff.get(id)||{}).role==='yonetici';
const amMgr=()=>isMgr(S.meId);
const canW=()=>S.phase==='ready';
const firmName=id=>(S.firms.get(id)||{}).name||'Silinmiş firma';
const isRep=t=>t.repeat==='daily'||t.repeat==='weekdays';
const m2=j=>(j.w&&j.h)?j.w*j.h*(j.qty||1)/10000:null;
const net=j=>j.price==null?0:(j.vat==='dahil'?j.price/(1+VAT):j.price);
const pendingJobs=()=>[...S.jobs].filter(([,j])=>j.status!=='fiyatlandi').sort((a,b)=>(a[1].createdAt||0)-(b[1].createdAt||0));

/* ---------- task logic ---------- */
function applies(t,day){
  if(!t.due||t.due>day) return false;
  if(t.repeat==='daily') return true;
  if(t.repeat==='weekdays'){const w=dayDate(day).getDay();return w>=1&&w<=5}
  return false;
}
function taskState(t){
  const d=today(), hm=nowHM();
  if(isRep(t)){
    if(!applies(t,d)) return null;
    if(t.done&&t.done[d]) return 'done';
    return (t.time&&t.time<hm)?'late':'today';
  }
  if(t.status==='done') return (t.doneAt&&ymd(new Date(t.doneAt))===d)?'done':'old';
  if(!t.due||t.due<d) return 'overdue';
  if(t.due===d) return (t.time&&t.time<hm)?'late':'today';
  return 'upcoming';
}
const byTime=(a,b)=>((a[1].time||'99:99').localeCompare(b[1].time||'99:99'))||((a[1].createdAt||0)-(b[1].createdAt||0));
function bucket(sid){
  const lim=addDays(today(),7), r={late:[],open:[],done:[],up:[]};
  for(const e of S.tasks){
    const t=e[1]; if(t.assignee!==sid) continue;
    const st=taskState(t);
    if(st==='overdue'||st==='late') r.late.push(e);
    else if(st==='today') r.open.push(e);
    else if(st==='done') r.done.push(e);
    else if(st==='upcoming'&&t.due<=lim) r.up.push(e);
  }
  r.late.sort((a,b)=>(a[1].due||'').localeCompare(b[1].due||'')||byTime(a,b));
  r.open.sort((a,b)=>(b[1].urgent?1:0)-(a[1].urgent?1:0)||byTime(a,b));
  r.up.sort((a,b)=>a[1].due.localeCompare(b[1].due)||byTime(a,b));
  r.done.sort(byTime);
  return r;
}
function missedYesterday(t){
  const y=addDays(today(),-1);
  return isRep(t)&&applies(t,y)&&!(t.done&&t.done[y]);
}

/* ---------- notifications (derived) ---------- */
function events(){
  const ev=[], since=Date.now()-14*864e5, me=S.meId;
  for(const [id,t] of S.tasks){
    if(t.assignee===me&&t.createdBy!==me&&(t.createdAt||0)>since)
      ev.push({ts:t.createdAt,kind:'task',icon:'today',text:nm(t.createdBy)+' sana görev verdi',sub:t.title,act:'task',id});
    if(t.createdBy===me&&t.assignee!==me){
      if(!isRep(t)&&t.status==='done'&&(t.doneAt||0)>since)
        ev.push({ts:t.doneAt,kind:'done',icon:'check',text:nm(t.doneBy||t.assignee)+' görevi tamamladı',sub:t.title,act:'task',id});
      if(isRep(t)&&t.done) for(const v of Object.values(t.done)) if(v&&(v.at||0)>since)
        ev.push({ts:v.at,kind:'done',icon:'check',text:nm(v.by||t.assignee)+' görevi tamamladı',sub:t.title,act:'task',id});
    }
  }
  for(const [id,j] of S.jobs){
    if(amMgr()&&j.enteredBy!==me&&(j.createdAt||0)>since)
      ev.push({ts:j.createdAt,kind:'job',icon:'price',text:nm(j.enteredBy)+' iş girdi · '+firmName(j.firm),sub:j.title,act:'job',id});
    if(j.enteredBy===me&&j.status==='fiyatlandi'&&j.pricedBy!==me&&(j.pricedAt||0)>since)
      ev.push({ts:j.pricedAt,kind:'priced',icon:'price',text:'Girdiğin iş fiyatlandırıldı · '+firmName(j.firm),sub:j.title+' · '+money(j.price)+(j.vat==='dahil'?' KDV dahil':' + KDV'),act:'job',id});
  }
  return ev.sort((a,b)=>b.ts-a.ts).slice(0,40);
}
function badges(){
  const unseen=events().filter(e=>e.ts>S.seenAt).length;
  const pend=amMgr()?pendingJobs().length:0;
  return {unseen,pend,inbox:unseen+pend,today:bucket(S.meId).late.length};
}

/* ---------- oturum ve canlı veri ---------- */
async function boot(){
  initShell(); render();
  N.init({onRoute:routeTo,onBack,onResume,onForegroundPush});
  if(!B.configured){S.phase='noconfig';render();return}
  B.onAuth((ev)=>{if(ev==='SIGNED_OUT'&&S.phase!=='login'&&S.phase!=='setup') resetToLogin()});
  let s=null; try{s=await B.session()}catch(e){}
  if(!s){await toLogin();return}
  await startData(s.user.id);
}
async function toLogin(){
  S.phase='login'; render();
  try{const st=await B.adminCall('status'); if(!st.ready){S.phase='setup';render()}}catch(e){}
}
function resetToLogin(){
  B.unsubscribe();
  for(const k of ['staff','tasks','firms','jobs','settings']) S[k]=new Map();
  for(const k in S.loaded) S.loaded[k]=false;
  S.meId=null; S.firmOpen=null; S.person=null; S.firmLoaded=new Set(); closeSheet();
  toLogin();
}
async function startData(uid){
  S.meId=uid; S.phase='loading'; render();
  try{await loadData()}catch(e){
    if(/JWT|token|session/i.test(String(e&&e.message))){await B.logout();resetToLogin();return}
    S.phase='offline'; S.err=B.explain(e); render(); return;
  }
  const me=S.staff.get(uid);
  if(!me||!me.active){S.phase='inactive';render();return}
  S.phase='ready'; S.err=null;
  B.subscribe(onChange,onConn);
  render();
  handleHash();
  initPush();
  N.checkUpdate().then(u=>{S.update=u;scheduleRender()});
}
async function loadData(){
  const d=await B.loadAll();
  for(const k of Object.keys(d)) S[k]=new Map(d[k]);
  for(const k in S.loaded) S.loaded[k]=true;
  S.lastLoad=Date.now(); S.firmLoaded=new Set();
}
async function onResume(){
  if(S.phase==='offline'&&S.meId){startData(S.meId);return}
  if(S.phase!=='ready') return;
  if(Date.now()-S.lastLoad>20000){try{await loadData();scheduleRender()}catch(e){}}
  N.checkUpdate().then(u=>{S.update=u;scheduleRender()});
  if(S.push!=='granted') N.pushState().then(st=>{if(st!==S.push){S.push=st;scheduleRender()}});
}
function onConn(st){
  const bad=st==='CHANNEL_ERROR'||st==='TIMED_OUT'||st==='CLOSED';
  if(st==='SUBSCRIBED'&&S.err){S.err=null;loadData().then(scheduleRender,()=>{})}
  else if(bad&&S.phase==='ready') S.err='conn';
  scheduleRender();
}
function onChange(key,type,id,val){
  const old=S[key].get(id);
  if(type==='DELETE') S[key].delete(id); else S[key].set(id,val);
  if(key==='staff'&&id===S.meId&&val&&!val.active){S.phase='inactive';render();return}
  if(S.phase==='ready') try{notifyLive(key,type,old,val)}catch(e){}
  scheduleRender();
}
function notifyLive(name,type,old,v){
  if(!v) return;
  const fresh=ms=>ms&&Date.now()-ms<5*60e3, d=today();
  if(name==='tasks'){
    if(type==='INSERT'&&v.assignee===S.meId&&v.createdBy!==S.meId&&fresh(v.createdAt)){toast(nm(v.createdBy)+' sana görev verdi: '+v.title,'warn');buzz()}
    if(type==='UPDATE'&&old&&v.createdBy===S.meId&&v.assignee!==S.meId){
      if(!isRep(v)&&old.status!=='done'&&v.status==='done'&&v.doneBy!==S.meId) toast(nm(v.doneBy||v.assignee)+' tamamladı: '+v.title,'ok');
      if(isRep(v)&&!(old.done&&old.done[d])&&v.done&&v.done[d]&&v.done[d].by!==S.meId) toast(nm(v.done[d].by||v.assignee)+' tamamladı: '+v.title,'ok');
    }
  }
  if(name==='jobs'){
    if(type==='INSERT'&&amMgr()&&v.enteredBy!==S.meId&&fresh(v.createdAt)){toast('Fiyat talebi: '+firmName(v.firm)+' · '+v.title,'warn');buzz()}
    if(type==='UPDATE'&&old&&v.enteredBy===S.meId&&old.status!=='fiyatlandi'&&v.status==='fiyatlandi'&&v.pricedBy!==S.meId) toast('Fiyatlandırıldı: '+v.title+' · '+money(v.price),'ok');
  }
}
function onForegroundPush(n){
  const d=(n&&n.data)||{};
  if(String(d.rem)==='1'){toast((n.title||'Hatırlatma')+(n.body?' · '+n.body:''),'warn');buzz()}
}
function routeTo(data){
  if(!data) return;
  const go=()=>{
    const r=data.route, id=data.id;
    if(r==='task'){S.tab='bugun';S.person=null;S.firmOpen=null;render();if(id) openTask(id)}
    else if(r==='job'){if(id) openJobById(id)}
    else if(r==='inbox'){S.tab='bildirim';render()}
    else if(r==='team'){S.tab='ekip';S.person=null;render()}
    else if(r==='today'){S.tab='bugun';S.person=null;S.firmOpen=null;render()}
  };
  if(S.phase==='ready') go(); else S.pendingRoute=go;
}
function handleHash(){
  if(S.pendingRoute){const f=S.pendingRoute;S.pendingRoute=null;f();return}
  const h=decodeURIComponent((location.hash||'').slice(1)); if(!h) return;
  const m=h.match(/^(task|job|today|inbox|team)(?:-(.+))?$/);
  if(m) routeTo({route:m[1],id:m[2]});
  try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
}
async function openJobById(id){
  if(!S.jobs.get(id)){try{const r=await B.loadOne('jobs',id);if(r) S.jobs.set(r[0],r[1])}catch(e){}}
  openJob(id);
}
function onBack(){
  if(!$('#sheetWrap').hidden){closeSheet();return}
  if(S.firmOpen){S.firmOpen=null;render();return}
  if(S.person){S.person=null;render();return}
  if(S.tab!=='bugun'&&S.phase==='ready'){S.tab='bugun';LS.set('atp.tab','bugun');render();return}
  N.minimize();
}

/* ---------- bildirim izni ---------- */
async function initPush(){
  S.push=await N.pushState(); scheduleRender();
  if(S.push==='granted') return enablePush(false);
  if(N.isNative&&S.push==='prompt'&&!LS.get('atp.asked')){LS.set('atp.asked','1');enablePush(true)}
}
async function enablePush(ask){
  try{
    if(!N.isNative&&!S.vapid) S.vapid=await B.vapidKey();
    S.push=await N.enablePush((k,t,keys)=>B.registerPush(k,t,keys),S.vapid,ask);
    if(ask&&S.push==='granted') toast('Bildirimler açık','ok');
    if(ask&&S.push==='denied') toast('Bildirim izni verilmedi. Telefon ayarlarından açabilirsin.','err');
  }catch(e){if(ask) toast('Bildirimler açılamadı: '+(e&&e.message||e),'err')}
  scheduleRender();
}

/* ---------- yazma ---------- */
const busy=new Set();
async function w(fn,okMsg,key){
  if(key){if(busy.has(key)) return false;busy.add(key)}
  try{const r=await fn();if(okMsg) toast(okMsg,'ok');return r===undefined?true:r}
  catch(e){toast(B.explain(e),'err');return false}
  finally{if(key) busy.delete(key)}
}
async function ins(key,obj){const [id,v]=await B.insert(key,obj);S[key].set(id,v);scheduleRender();return id}
async function upd(key,id,patch){const [,v]=await B.update(key,id,patch);S[key].set(id,v);scheduleRender();return id}
async function del(key,id){await B.remove(key,id);S[key].delete(id);scheduleRender();return true}
function toast(msg,kind){
  const el=document.createElement('div');
  el.className='toast '+(kind||''); el.textContent=msg; el.setAttribute('role','status');
  $('#toasts').appendChild(el);
  setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),320)},kind==='err'?6500:4000);
}
function buzz(){try{navigator.vibrate&&navigator.vibrate([120,60,120])}catch(e){}}

/* ---------- render ---------- */
let rq=false;
function scheduleRender(){if(rq) return;rq=true;requestAnimationFrame(()=>{rq=false;render(false)})}
/* Live updates never rebuild the screen while someone is typing in it; they wait for the field to lose focus. */
function render(force=true){
  const act=document.activeElement, aid=act&&act.closest&&act.closest('#view')?act.id:null;
  if(!force&&aid&&/^(INPUT|TEXTAREA|SELECT)$/.test(act.tagName)){S.deferred=true;updateChrome();return}
  S.deferred=false;
  let sel=null; try{if(aid&&act.selectionStart!=null) sel=[act.selectionStart,act.selectionEnd]}catch(e){}
  let html;
  if(S.phase==='noconfig') html=viewState('Uygulama ayarlanmamış','Sunucu adresi bu sürüme eklenmemiş. Yeni sürümü indir.');
  else if(S.phase==='boot'||S.phase==='loading') html=viewLoading();
  else if(S.phase==='login') html=viewLogin();
  else if(S.phase==='setup') html=viewBootstrap();
  else if(S.phase==='offline') html=viewOffline();
  else if(S.phase==='inactive') html=viewInactive();
  else {
    if(S.tab==='bildirim'){S.seenAt=Date.now();LS.set('atp.seen',S.seenAt)}
    html=({bugun:viewToday,ekip:viewTeam,firmalar:viewFirms,bildirim:viewInbox})[S.tab]();
    if(S.err) html=`<div class="banner soft">${ic('alert')}<div>Canlı bağlantı kesildi. Yeniden bağlanıyor; bu arada yaptığın değişiklikler kaydedilir.</div></div>`+html;
    if(S.update) html=`<a class="banner info" href="${esc(S.update.apk||'')}">${ic('file')}<div><strong>Yeni sürüm hazır.</strong> İndirip kurmak için dokun.</div>${ic('chev')}</a>`+html;
  }
  $('#view').innerHTML=html;
  updateChrome();
  if(aid){const el=document.getElementById(aid);if(el){el.focus({preventScroll:true});if(sel) try{el.setSelectionRange(sel[0],sel[1])}catch(e){}}}
}
function initShell(){
  $('#tabsIn').innerHTML=[['bugun','today','Bugün'],['ekip','team','Ekip'],['firmalar','firms','Firmalar'],['bildirim','bell','Bildirim']]
    .map(([k,i,l])=>`<button class="tab" data-act="tab" data-tab="${k}" id="tab-${k}">${ic(i)}<span>${l}</span><b class="badge" id="b-${k}" hidden></b></button>`).join('');
  $('#fab').innerHTML=ic('plus');
}
function updateChrome(){
  const ready=S.phase==='ready';
  $('#tabs').hidden=!ready; $('#fab').hidden=!ready||!canW(); $('#meChip').hidden=!ready;
  $('#hdrDate').textContent=new Date().toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long'});
  if(!ready) return;
  const n=nm(S.meId); $('#meName').textContent=n; $('#meAv').textContent=initials(n);
  for(const k of ['bugun','ekip','firmalar','bildirim']) $('#tab-'+k).setAttribute('aria-current',S.tab===k?'page':'false');
  const b=badges();
  setBadge('bugun',b.today,'');
  setBadge('bildirim',S.tab==='bildirim'?b.pend:b.inbox,(b.pend&&(S.tab==='bildirim'||!b.unseen))?'caution':'');
}
function setBadge(k,n,cls){const el=$('#b-'+k);el.hidden=!n;el.textContent=n>99?'99+':String(n);el.className='badge '+(cls||'')}

const viewState=(h,p)=>`<section class="state">${ic('alert')}<h2>${esc(h)}</h2><p>${esc(p)}</p></section>`;
const viewLoading=()=>`<div class="top-stack" aria-label="Yükleniyor"><div class="skel" style="height:120px"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>`;
const roBanner=()=>pushBanner();
const empty=(h,p,btn)=>`<div class="empty"><h3>${esc(h)}</h3><p>${esc(p)}</p>${btn||''}</div>`;

const apkUrl=()=>(B.CFG.pagesUrl||'')+'atolye-panosu.apk';
function installHint(){
  if(N.isNative) return '';
  if(N.isIOS&&!N.isStandalone()) return `<div class="help"><h3>iPhone'da uygulama gibi kullan</h3><p>Safari'de alttaki Paylaş düğmesine dokun, "Ana Ekrana Ekle"yi seç. Sonra uygulamayı ana ekrandaki simgeden aç; bildirimler ancak böyle gelir.</p></div>`;
  if(/Android/i.test(navigator.userAgent)) return `<div class="help"><h3>Android uygulaması</h3><p>Bildirimlerin uygulama kapalıyken de gelmesi için Android uygulamasını kur.</p><p><a class="btn sm" href="${esc(apkUrl())}">${ic('file')}APK'yı indir</a></p></div>`;
  return '';
}
function viewLogin(){
  return `<section class="setup">
    <p class="eyebrow">Atölye Panosu</p>
    <h1 class="display">Giriş yap</h1>
    <p class="lead">Kullanıcı adını ve şifreni yöneticin verir.</p>
    <form data-form="login" class="stack" novalidate>
      <div class="field"><label for="li-user">Kullanıcı adı</label><input id="li-user" data-keep autocapitalize="none" autocomplete="username" spellcheck="false" value="${esc(S.keep['li-user']||LS.get('atp.user')||'')}"></div>
      <div class="field"><label for="li-pass">Şifre</label><input id="li-pass" type="password" autocomplete="current-password"></div>
      <p class="form-err" id="li-err" hidden></p>
      <button class="btn primary" type="submit">Giriş yap</button>
    </form>
    ${installHint()}
  </section>`;
}
function viewBootstrap(){
  return `<section class="setup">
    <p class="eyebrow">İlk kurulum</p>
    <h1 class="display">Yönetici hesabını aç</h1>
    <p class="lead">Bu ekran yalnızca bir kez açılır. Kurulum kodunu Claude'dan aldın.</p>
    <form data-form="bootstrap" class="stack" novalidate>
      <div class="field"><label for="bs-code">Kurulum kodu</label><input id="bs-code" data-keep autocapitalize="characters" autocomplete="off" spellcheck="false" value="${esc(S.keep['bs-code']||'')}"></div>
      <div class="field"><label for="bs-name">Adın</label><input id="bs-name" data-keep maxlength="40" autocomplete="name" value="${esc(S.keep['bs-name']||'')}" placeholder="Örn. Ahmet"></div>
      <div class="field"><label for="bs-user">Kullanıcı adın <span class="opt">Türkçe karakter kullanma</span></label><input id="bs-user" data-keep autocapitalize="none" spellcheck="false" value="${esc(S.keep['bs-user']||'')}" placeholder="Örn. ahmet"></div>
      <div class="field"><label for="bs-email">E-posta adresin</label><input id="bs-email" data-keep type="email" autocomplete="email" value="${esc(S.keep['bs-email']||'')}"><span class="hint">Ekip hesapları bu adrese bağlanır. Kimseye e-posta gönderilmez.</span></div>
      <div class="row2"><div class="field"><label for="bs-pass">Şifre</label><input id="bs-pass" type="password" autocomplete="new-password"></div><div class="field"><label for="bs-pass2">Şifre tekrar</label><input id="bs-pass2" type="password" autocomplete="new-password"></div></div>
      <p class="form-err" id="bs-err" hidden></p>
      <button class="btn primary" type="submit">Hesabımı aç</button>
    </form>
  </section>`;
}
const viewOffline=()=>`<section class="state">${ic('alert')}<h2>Sunucuya bağlanılamadı</h2><p>${esc(S.err||'İnternet bağlantını kontrol et.')}</p><div class="btnrow"><button class="btn primary" data-act="retry">Tekrar dene</button><button class="btn ghost" data-act="logout">Çıkış yap</button></div></section>`;
const viewInactive=()=>`<section class="state">${ic('alert')}<h2>Hesabın kapalı</h2><p>Bu hesap yönetici tarafından kapatılmış ya da silinmiş. Yöneticine sor.</p><div><button class="btn" data-act="logout">Çıkış yap</button></div></section>`;
function pushBanner(){
  if(LS.get('atp.pushHide')===S.push) return '';
  const hide=`<button class="btn ghost sm" data-act="pushHide">Kapat</button>`;
  if(S.push==='prompt') return `<div class="banner info">${ic('bell')}<div><strong>Bildirimleri aç.</strong> Görev verildiğinde ve saati geldiğinde uygulama kapalıyken de haber verelim.</div><button class="btn sm primary" data-act="pushOn">Aç</button></div>`;
  if(S.push==='needs-install') return `<div class="banner info">${ic('bell')}<div><strong>Bildirim almak için ana ekrana ekle.</strong> Safari'de Paylaş > Ana Ekrana Ekle, sonra simgeden aç.</div>${hide}</div>`;
  if(S.push==='denied') return `<div class="banner soft">${ic('bell')}<div>Bildirimler kapalı. Telefon ayarlarında Atölye Panosu için bildirimlere izin ver.</div>${hide}</div>`;
  return '';
}

function taskRow(e,o={}){
  const [id,t]=e, st=taskState(t), done=st==='done', late=st==='late'||st==='overdue', meta=[];
  if(o.who) meta.push(`<span><b>${esc(nm(t.assignee))}</b></span>`);
  else if(t.createdBy&&t.createdBy!==t.assignee) meta.push(`<span>Veren: ${esc(nm(t.createdBy))}</span>`);
  if(isRep(t)) meta.push(`<span>${ic('repeat')}${REPEAT[t.repeat]}</span>`);
  else if(st!=='today'&&st!=='done'&&st!=='late') meta.push(`<span class="${st==='overdue'?'red':''}">${esc(fmtDay(t.due))}</span>`);
  if(t.time) meta.push(`<span class="${late&&!done?'red':''}">${ic('clock')}${esc(t.time)}</span>`);
  if(t.firm&&S.firms.get(t.firm)) meta.push(`<span>${ic('firms')}${esc(firmName(t.firm))}</span>`);
  if(!done&&missedYesterday(t)) meta.push(`<span class="red">Dün yapılmadı</span>`);
  return `<div class="task ${st||''}">
    <button class="check" data-act="toggle" data-id="${esc(id)}" aria-pressed="${done}" aria-label="${done?'Geri al':'Tamamlandı olarak işaretle'}: ${esc(t.title)}" ${canW()?'':'disabled'}>${ic('check')}</button>
    <button class="task-main" data-act="task" data-id="${esc(id)}"><span class="t-title">${t.urgent&&!done?'<span class="tag">ACİL</span>':''}${esc(t.title)}</span>${meta.length?`<span class="t-meta">${meta.join('')}</span>`:''}</button>
    ${late&&!done?'<span class="pill danger">Gecikti</span>':''}
  </div>`;
}
function group(title,rows,o={}){
  if(!rows.length) return '';
  return `<section><h2 class="sec-h">${esc(title)}<span class="cnt">${rows.length}</span></h2><div class="list">${rows.map(r=>taskRow(r,o)).join('')}</div></section>`;
}

function viewToday(){
  const b=bucket(S.meId), total=b.late.length+b.open.length+b.done.length, doneN=b.done.length;
  const pct=total?Math.round(doneN/total*100):0, all=total&&doneN===total;
  let top=roBanner();
  top+=`<section class="hero" aria-label="Bugünkü ilerleme">
    <div class="hero-num"><span class="big">${doneN}</span><span class="of">/${total}</span></div>
    <div class="hero-txt"><strong>${total?(all?'Bugünlük hepsi tamam':'bugün tamamlandı'):'Bugün için görevin yok'}</strong><span>${esc(nm(S.meId))}${amMgr()?' · Yönetici':''}</span></div>
    <span class="bar ${all?'full':''}"><i style="width:${pct}%"></i></span>
  </section>`;
  if(b.late.length) top+=`<div class="banner danger">${ic('alert')}<div><strong>${b.late.length} görevin gecikti.</strong> Önce bunları bitir ya da tarihini güncelle.</div></div>`;
  if(amMgr()){
    const pend=pendingJobs().length;
    if(pend) top+=`<button class="banner caution" data-act="tab" data-tab="bildirim"><span class="hatch"></span><div><strong>${pend} iş fiyat bekliyor.</strong> Fiyatlandırmak için dokun.</div>${ic('chev')}</button>`;
    let teamLate=0; for(const [sid] of activeStaff()) if(sid!==S.meId) teamLate+=bucket(sid).late.length;
    if(teamLate) top+=`<button class="banner soft" data-act="tab" data-tab="ekip">${ic('team')}<div>Ekipte <strong>${teamLate} geciken görev</strong> var.</div>${ic('chev')}</button>`;
  }
  let h=`<div class="top-stack">${top}</div>`;
  h+=group('Gecikenler',b.late);
  h+=group('Bugün',b.open);
  if(!total&&!b.up.length) h+=empty('Liste boş','Sağ alttaki + ile kendine ya da ekipten birine görev ekle. Her gün tekrarlanan işler için "Her gün" seç; yapılmadığında burada kırmızıyla uyarılırsın.');
  h+=group('Önümüzdeki 7 gün',b.up);
  h+=group('Bugün bitenler',b.done);
  return h;
}

function personRow([id,s]){
  const b=bucket(id), tot=b.late.length+b.open.length+b.done.length, pct=tot?b.done.length/tot*100:0;
  return `<button class="person" data-act="person" data-id="${esc(id)}"><span class="av">${esc(initials(s.name))}</span>
    <span class="p-body"><span class="p-name">${esc(s.name)}${id===S.meId?'<span class="me-tag">sen</span>':''}${s.role==='yonetici'?'<span class="pill accent">Yönetici</span>':''}</span>
    <span class="p-stats">${b.late.length?`<b class="red">${b.late.length} gecikti</b>`:''}<span>${b.open.length} açık</span><span>${b.done.length} bitti</span>${b.up.length?`<span>${b.up.length} yaklaşan</span>`:''}</span>
    <span class="bar thin"><i style="width:${pct}%"></i></span></span>${ic('chev')}</button>`;
}
function viewTeam(){
  if(S.person) return viewPerson(S.person);
  const people=activeStaff();
  let h=`<div class="page-top"><h1 class="page-h">Ekip</h1>${amMgr()&&canW()?`<button class="btn sm" data-act="staffForm">${ic('plus')}Kişi ekle</button>`:''}</div>`;
  const given=[...S.tasks].filter(([,t])=>t.createdBy===S.meId&&t.assignee!==S.meId&&['today','late','overdue','upcoming'].includes(taskState(t)))
    .sort((a,b)=>{const r=x=>({overdue:0,late:0,today:1,upcoming:2})[taskState(x[1])];return r(a)-r(b)||(a[1].due||'').localeCompare(b[1].due||'')});
  h+=group('Verdiğin açık görevler',given.slice(0,10),{who:true});
  h+=`<section><h2 class="sec-h">Bugün ekip<span class="cnt">${people.length}</span></h2><div class="list">${people.map(personRow).join('')}</div></section>`;
  if(people.length<2&&amMgr()) h+=empty('Ekibini ekle','Her çalışan için kullanıcı adı ve şifre aç. Onlara görev verebilir, kimin neyi bitirdiğini buradan görebilirsin.',canW()?`<button class="btn primary" data-act="staffForm">Kişi ekle</button>`:'');
  return h;
}
function viewPerson(id){
  const s=S.staff.get(id); if(!s){S.person=null;return viewTeam()}
  const b=bucket(id), any=b.late.length+b.open.length+b.done.length+b.up.length;
  let h=`<div class="person-head"><button class="back" data-act="personBack">${ic('back')}Ekip</button>
    <div class="who"><span class="av">${esc(initials(s.name))}</span><div style="min-width:0"><h1 class="page-h">${esc(s.name)}</h1><span class="hint">${s.role==='yonetici'?'Yönetici':'Personel'}${id===S.meId?' · sen':''}${amMgr()&&s.username?' · kullanıcı adı: '+esc(s.username):''}</span></div></div>
    ${canW()?`<div class="btnrow"><button class="btn primary" data-act="newTask" data-assignee="${esc(id)}">${ic('plus')}Görev ver</button>${amMgr()?`<button class="btn" data-act="staffForm" data-id="${esc(id)}">${ic('edit')}Düzenle</button>`:''}</div>`:''}
  </div>`;
  h+=group('Gecikenler',b.late);
  h+=group('Bugün',b.open);
  h+=group('Önümüzdeki 7 gün',b.up);
  h+=group('Bugün bitenler',b.done);
  if(!any) h+=`<p class="empty-s">${esc(s.name)} için açık görev yok.</p>`;
  return h;
}

function firmStats(fid){
  const jobs=[...S.jobs].filter(([,j])=>j.firm===fid).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  let pend=0,netSum=0;
  for(const [,j] of jobs){if(j.status==='fiyatlandi') netSum+=net(j); else pend++}
  return {jobs,pend,net:netSum,last:jobs.length?jobs[0][1].createdAt:0};
}
function firmsSorted(byActivity){
  const arr=[...S.firms];
  if(!byActivity) return arr.sort((a,b)=>String(a[1].name).localeCompare(String(b[1].name),'tr'));
  const st=new Map(arr.map(([id])=>[id,firmStats(id)]));
  return arr.sort((a,b)=>(st.get(b[0]).pend>0)-(st.get(a[0]).pend>0)||st.get(b[0]).last-st.get(a[0]).last||String(a[1].name).localeCompare(String(b[1].name),'tr'));
}
function firmRow([id,f]){
  const s=firmStats(id), meta=[`<span>${s.jobs.length} iş</span>`];
  if(s.last) meta.push(`<span>son giriş ${esc(fmtDay(ymd(new Date(s.last))))}</span>`);
  if(s.net) meta.push(`<span>${esc(money(s.net))} + KDV</span>`);
  return `<button class="firm" data-act="firm" data-id="${esc(id)}"><span class="f-mark">${esc(initials(f.name))}</span><span class="f-body"><span class="f-name">${esc(f.name)}</span><span class="f-meta">${meta.join('')}</span></span>${s.pend?`<span class="pill caution"><span class="hatch"></span>${s.pend} bekliyor</span>`:''}${ic('chev')}</button>`;
}
function viewFirms(){
  if(S.firmOpen) return viewFirm(S.firmOpen);
  let h=`<div class="page-top"><h1 class="page-h">Firmalar</h1>${canW()?`<button class="btn sm" data-act="firmForm">${ic('plus')}Firma ekle</button>`:''}</div>`;
  if(!S.firms.size) return h+empty('Henüz firma hesabı yok','Çalıştığın firmaları ekle. Her firmaya yapılan işler o firmanın hesabına girilir, yöneticiler de fiyatlandırır.',canW()?`<button class="btn primary" data-act="firmForm">İlk firmayı ekle</button>`:'');
  h+=`<div class="search"><label class="hint" for="firm-q" style="display:block;margin-bottom:6px">Firma ara</label><input id="firm-q" data-keep type="search" autocomplete="off" placeholder="Firma adı, yetkili ya da plaka" value="${esc(S.keep['firm-q']||'')}"></div>`;
  return h+`<div id="firmList">${firmListHtml()}</div>`;
}
function firmListHtml(){
  const raw=(S.keep['firm-q']||'').trim(), q=lower(raw), qp=raw.toUpperCase().replace(/\s/g,'');
  const plateHit=new Set();
  if(qp.length>=3) for(const [,j] of S.jobs) if(j.plate&&j.plate.replace(/\s/g,'').includes(qp)) plateHit.add(j.firm);
  const list=firmsSorted(true).filter(([id,f])=>!q||lower(f.name).includes(q)||lower(f.contact).includes(q)||plateHit.has(id));
  return list.length?`<div class="list">${list.map(firmRow).join('')}</div>`:`<p class="empty-s">“${esc(raw)}” ile eşleşen firma yok.</p>`;
}
function jobRow([id,j],o={}){
  const priced=j.status==='fiyatlandi', a=m2(j), meta=[];
  if(o.firm) meta.push(`<span><b>${esc(firmName(j.firm))}</b></span>`);
  if(j.type) meta.push(`<span>${esc(j.type)}</span>`);
  if(j.plate) meta.push(`<span>${plateHtml(j.plate)}</span>`);
  if(j.w&&j.h) meta.push(`<span>${fnum(j.w,1)}×${fnum(j.h,1)} cm</span>`);
  if((j.qty||1)>1) meta.push(`<span>${fnum(j.qty,0)} adet</span>`);
  if(a) meta.push(`<span>${fnum(a)} m²</span>`);
  meta.push(`<span>${esc(fmtDay(j.workDate||ymd(new Date(j.createdAt||Date.now()))))} · ${esc(nm(j.enteredBy))}</span>`);
  return `<button class="job" data-act="job" data-id="${esc(id)}">
    <span class="job-top"><span class="job-title">${esc(j.title)}</span>${priced?'<span class="pill ok">Fiyatlandı</span>':'<span class="pill caution"><span class="hatch"></span>Fiyat bekliyor</span>'}</span>
    <span class="job-meta">${meta.join('')}</span>
    ${priced?`<span class="job-price">${esc(money(j.price))}<small>${j.vat==='dahil'?'KDV dahil':'+ KDV'}</small></span>`:''}
  </button>`;
}
function viewFirm(fid){
  const f=S.firms.get(fid); if(!f){S.firmOpen=null;return viewFirms()}
  if(!S.firmLoaded.has(fid)){S.firmLoaded.add(fid);B.loadFirmJobs(fid).then(rows=>{for(const [id,v] of rows) S.jobs.set(id,v);scheduleRender()},()=>S.firmLoaded.delete(fid))}
  const s=firmStats(fid), flt=S.jobFilter;
  const jobs=s.jobs.filter(([,j])=>flt==='all'||(flt==='bekliyor'?j.status!=='fiyatlandi':j.status==='fiyatlandi'));
  const contact=[];
  if(f.contact) contact.push(`<span>Yetkili: <span class="sel">${esc(f.contact)}</span></span>`);
  if(f.phone) contact.push(`<span>Tel: <span class="sel" id="ph-${esc(fid)}">${esc(f.phone)}</span> <a class="copy" href="tel:${esc(f.phone.replace(/[^0-9+]/g,''))}">Ara</a> <button class="copy" data-act="copy" data-text="${esc(f.phone)}" data-target="ph-${esc(fid)}">${ic('copy')}Kopyala</button></span>`);
  let h=`<div class="firm-head"><button class="back" data-act="firmBack">${ic('back')}Firmalar</button>
    <div class="page-top"><h1 class="page-h">${esc(f.name)}</h1>${canW()?`<button class="btn sm ghost" data-act="firmForm" data-id="${esc(fid)}">${ic('edit')}Düzenle</button>`:''}</div>
    ${contact.length?`<div class="contact">${contact.join('')}</div>`:''}
    ${f.note?`<p class="note">${esc(f.note)}</p>`:''}
    ${canW()?`<div class="btnrow">${canW()?`<button class="btn primary" data-act="newJob" data-firm="${esc(fid)}">${ic('plus')}İş girişi</button><button class="btn" data-act="newTask" data-firm="${esc(fid)}">Görev</button>`:''}${amMgr()&&s.jobs.length?`<button class="btn" data-act="exportForm" data-id="${esc(fid)}">${ic('file')}PDF</button>`:''}</div>`:''}
  </div>`;
  if(s.jobs.length) h+=`<div class="totals"><div class="tot"><span>Fiyatlanan, KDV hariç</span><b>${esc(money(s.net))}</b></div><div class="tot"><span>KDV dahil (%20)</span><b>${esc(money(s.net*(1+VAT)))}</b></div><div class="tot"><span>Fiyat bekleyen</span><b>${s.pend} iş</b></div></div>`;
  if(!s.jobs.length) h+=empty('Bu firmaya henüz iş girilmedi','Yapılan her işi buradan gir: ölçü, adet ve not ekle. Kaydedince yöneticilere fiyatlandırma talebi düşer.',canW()?`<button class="btn primary" data-act="newJob" data-firm="${esc(fid)}">İlk işi gir</button>`:'');
  else{
    h+=`<section><div class="filters" style="margin-bottom:10px">${[['all','Tümü',s.jobs.length],['bekliyor','Fiyat bekliyor',s.pend],['fiyatlandi','Fiyatlandı',s.jobs.length-s.pend]].map(([k,l,n])=>`<button class="fbtn" data-act="jobFilter" data-v="${k}" aria-pressed="${flt===k}">${l} · ${n}</button>`).join('')}</div>
      ${jobs.length?`<div class="list">${jobs.map(r=>jobRow(r)).join('')}</div>`:'<p class="empty-s">Bu filtrede iş yok.</p>'}</section>`;
  }
  const ft=[...S.tasks].filter(([,t])=>t.firm===fid&&['today','late','overdue','upcoming'].includes(taskState(t)));
  h+=group('Bu firmayla ilgili açık görevler',ft,{who:true});
  return h;
}

function viewInbox(){
  let h=`<h1 class="page-h">Bildirimler</h1>`;
  const pend=pendingJobs();
  if(amMgr()){
    h+=`<section><h2 class="sec-h"><span class="hatch"></span>Fiyat bekleyen işler<span class="cnt">${pend.length}</span></h2>${pend.length?`<div class="list">${pend.map(([id,j])=>`<div class="req"><button class="req-main" data-act="job" data-id="${esc(id)}"><span class="req-firm">${esc(firmName(j.firm))}</span><span class="job-title">${esc(j.title)}</span><span class="job-meta">${j.plate?`<span>${plateHtml(j.plate)}</span>`:''}<span>${esc(nm(j.enteredBy))}</span><span>${esc(fmtAgo(j.createdAt||Date.now()))}</span>${m2(j)?`<span>${fnum(m2(j))} m²</span>`:''}</span></button>${canW()?`<button class="btn sm caution" data-act="price" data-id="${esc(id)}">Fiyatlandır</button>`:''}</div>`).join('')}</div>`:'<p class="empty-s">Bekleyen fiyat talebi yok.</p>'}</section>`;
  } else {
    const mine=pend.filter(([,j])=>j.enteredBy===S.meId);
    if(mine.length) h+=`<section><h2 class="sec-h"><span class="hatch"></span>Fiyat bekleyen girişlerin<span class="cnt">${mine.length}</span></h2><div class="list">${mine.map(r=>jobRow(r,{firm:true})).join('')}</div></section>`;
  }
  const ev=events();
  h+=`<section><h2 class="sec-h">Son hareketler</h2>${ev.length?`<div class="list">${ev.map(e=>`<button class="ev ${e.ts>S.prevSeen?'new':''}" data-act="${e.act}" data-id="${esc(e.id)}"><span class="ev-ic ${e.kind}">${ic(e.icon)}</span><span class="ev-body"><span class="ev-t">${esc(e.text)}</span><span class="ev-s">${esc(e.sub)}</span></span><span class="ev-time">${esc(fmtAgo(e.ts))}</span></button>`).join('')}</div>`:'<p class="empty-s">Son 14 günde sana gelen bir hareket yok. Sana görev verildiğinde, verdiğin bir görev bittiğinde ya da girdiğin iş fiyatlandığında burada görünür.</p>'}</section>`;
  return h;
}

/* ---------- sheets ---------- */
function openSheet(html){$('#sheetBody').innerHTML=html;$('#sheetWrap').hidden=false;document.body.classList.add('locked');$('.sheet').scrollTop=0}
function closeSheet(){$('#sheetWrap').hidden=true;$('#sheetBody').innerHTML='';document.body.classList.remove('locked')}
function formErr(id,msg){const el=$('#'+id);if(el){el.textContent=msg;el.hidden=false}return false}
const staffOptions=sel=>{
  const opts=activeStaff().map(([id,s])=>`<option value="${esc(id)}" ${id===sel?'selected':''}>${esc(s.name)}${id===S.meId?' (ben)':''}</option>`);
  if(sel&&S.staff.get(sel)&&S.staff.get(sel).active===false) opts.unshift(`<option value="${esc(sel)}" selected>${esc(nm(sel))} (listeden çıkarıldı)</option>`);
  return opts.join('');
};

function openAdd(){
  openSheet(`<div class="stack"><h2 class="sheet-h">Ne eklemek istiyorsun?</h2>
    <button class="big-choice" data-act="newTask">${ic('today')}<span><strong>Görev</strong><small>Kendine ya da ekipten birine iş ver</small></span></button>
    <button class="big-choice" data-act="newJob">${ic('price')}<span><strong>Firma için iş girişi</strong><small>Yapılan işi gir, yöneticilere fiyat talebi gitsin</small></span></button>
    <button class="big-choice" data-act="firmForm">${ic('firms')}<span><strong>Firma hesabı</strong><small>Yeni müşteri firmayı ekle</small></span></button>
  </div>`);
}

function openTaskForm(o={}){
  const t=o.id?S.tasks.get(o.id):null;
  const v=t||{title:'',assignee:o.assignee||S.meId,due:today(),time:'',repeat:'none',firm:o.firm||'',urgent:false,note:''};
  const rep=v.repeat||'none';
  const firmOpts='<option value="">Firma yok</option>'+firmsSorted().map(([id,f])=>`<option value="${esc(id)}" ${id===v.firm?'selected':''}>${esc(f.name)}</option>`).join('');
  openSheet(`<form data-form="task" data-id="${esc(o.id||'')}" class="stack" novalidate>
    <h2 class="sheet-h">${t?'Görevi düzenle':'Yeni görev'}</h2>
    <div class="field"><label for="t-title">Ne yapılacak?</label><input id="t-title" maxlength="120" value="${esc(v.title)}" placeholder="Örn. Totem tabela montajı için iskeleyi hazırla"></div>
    <div class="field"><label for="t-assignee">Kime</label><select id="t-assignee">${staffOptions(v.assignee)}</select></div>
    <fieldset class="field"><legend>Tekrar</legend><div class="chips">${Object.entries(REPEAT).map(([k,l])=>`<label class="chip"><input type="radio" name="t-repeat" id="t-rep-${k}" value="${k}" ${rep===k?'checked':''}><span>${l}</span></label>`).join('')}</div></fieldset>
    <div class="row2">
      <div class="field"><label for="t-due" id="t-due-l">${rep==='none'?'Tarih':'Başlangıç'}</label><input id="t-due" type="date" value="${esc(v.due||today())}"></div>
      <div class="field"><label for="t-time">Saat <span class="opt">isteğe bağlı</span></label><input id="t-time" type="time" value="${esc(v.time||'')}"></div>
    </div>
    <p class="hint">Saat verirsen 15 dakika önce ve saatinde telefona bildirim gider. 1 saat geçip yapılmamışsa hem kişiye hem görevi verene hatırlatılır.</p>
    <div class="field"><label for="t-firm">Firma <span class="opt">isteğe bağlı</span></label><select id="t-firm">${firmOpts}</select></div>
    <label class="switch"><input type="checkbox" id="t-urgent" ${v.urgent?'checked':''}><span>Acil olarak işaretle</span></label>
    <div class="field"><label for="t-note">Not <span class="opt">isteğe bağlı</span></label><textarea id="t-note" rows="3" maxlength="1000" placeholder="Adres, ölçü, malzeme gibi detaylar">${esc(v.note||'')}</textarea></div>
    <p class="form-err" id="t-err" hidden></p>
    <div class="actions"><button type="button" class="btn ghost" data-act="closeSheet">Vazgeç</button><button class="btn primary" type="submit">${t?'Kaydet':'Görevi ekle'}</button></div>
  </form>`);
}
async function submitTask(f){
  const id=f.dataset.id, title=$('#t-title').value.trim();
  if(!title) return formErr('t-err','Görevin adını yaz.');
  const assignee=$('#t-assignee').value;
  if(!S.staff.get(assignee)) return formErr('t-err','Görevi verecek birini seç.');
  const data={title,assignee,due:$('#t-due').value||today(),time:$('#t-time').value||'',
    repeat:(f.querySelector('input[name="t-repeat"]:checked')||{}).value||'none',
    firm:$('#t-firm').value||'',urgent:$('#t-urgent').checked,note:$('#t-note').value.trim()};
  lockForm(f,true);
  let ok;
  if(id) ok=await w(()=>upd('tasks',id,data),'Görev güncellendi','tasks/'+id);
  else{
    Object.assign(data,{status:'open',done:{}});
    ok=await w(()=>ins('tasks',data),assignee===S.meId?'Görev eklendi':nm(assignee)+' için görev eklendi, bildirim gitti');
  }
  if(ok) closeSheet(); else lockForm(f,false);
}
function lockForm(f,on){f.querySelectorAll('button[type=submit]').forEach(b=>b.disabled=on)}

function history(t){
  const d=today(), out=[];
  for(let i=6;i>=0;i--){
    const day=addDays(d,-i), ap=applies(t,day), dn=!!(t.done&&t.done[day]);
    const cls=!ap?'na':dn?'yes':(day===d?'pend':'no');
    out.push(`<div class="hd ${cls}"><span>${dayDate(day).toLocaleDateString('tr-TR',{weekday:'short'})}</span><i></i></div>`);
  }
  return `<div class="field"><span class="hint" style="font-weight:700">Son 7 gün</span><div class="hist">${out.join('')}</div><p class="hint">Yeşil yapıldı, kırmızı yapılmadı, kesik çizgi bugün.</p></div>`;
}
function openTask(id){
  const t=S.tasks.get(id); if(!t) return toast('Bu görev silinmiş.','err');
  const st=taskState(t), done=st==='done';
  const canEdit=canW()&&(t.createdBy===S.meId||t.assignee===S.meId||amMgr());
  const canDel=canW()&&(t.createdBy===S.meId||amMgr());
  const rows=[['Kime',nm(t.assignee)],['Veren',nm(t.createdBy)],[isRep(t)?'Başlangıç':'Tarih',fmtDay(t.due)]];
  if(t.time) rows.push(['Saat',t.time]);
  rows.push(['Tekrar',REPEAT[t.repeat||'none']]);
  if(t.firm) rows.push(['Firma',firmName(t.firm)]);
  rows.push(['Eklendi',fmtStamp(t.createdAt||Date.now())]);
  if(!isRep(t)&&t.status==='done') rows.push(['Tamamlayan',nm(t.doneBy)+' · '+fmtStamp(t.doneAt)]);
  if(isRep(t)&&done) rows.push(['Bugün',nm(t.done[today()].by)+' yaptı']);
  const late=st==='late'||st==='overdue';
  openSheet(`<div class="stack">
    <div class="sheet-top"><h2 class="sheet-h">${t.urgent?'<span class="tag">ACİL</span>':''}${esc(t.title)}</h2>${done?'<span class="pill ok">Tamam</span>':late?'<span class="pill danger">Gecikti</span>':''}</div>
    <dl class="dl">${rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${t.note?`<p class="note">${esc(t.note)}</p>`:''}
    ${isRep(t)?history(t):''}
    <div class="actions">
      ${canDel?`<button class="btn danger-t" data-act="delTask" data-id="${esc(id)}" data-confirm="Silmek için tekrar dokun">Sil</button>`:''}
      ${canEdit?`<button class="btn" data-act="editTask" data-id="${esc(id)}">${ic('edit')}Düzenle</button>`:''}
      ${canW()&&st!==null&&st!=='old'?`<button class="btn ${done?'':'primary'}" data-act="toggleClose" data-id="${esc(id)}">${done?'Geri al':ic('check')+'Tamamlandı'}</button>`:''}
    </div>
  </div>`);
}
async function toggleTask(id){
  const t=S.tasks.get(id); if(!t||!canW()) return;
  if(isRep(t)){
    const d=today(), on=!!(t.done&&t.done[d]);
    if(!applies(t,d)) return;
    const cut=addDays(d,-21), done={};
    for(const [k,v] of Object.entries(t.done||{})) if(v&&k>=cut) done[k]=v;
    if(on) delete done[d]; else done[d]={by:S.meId,at:Date.now()};
    await w(()=>upd('tasks',id,{done}),on?null:'Tamamlandı','tasks/'+id);
  }else{
    const on=t.status==='done';
    await w(()=>upd('tasks',id,on?{status:'open'}:{status:'done',doneBy:S.meId}),on?null:'Tamamlandı','tasks/'+id);
  }
}

function openFirmForm(id){
  const f=id?S.firms.get(id):null, v=f||{name:'',contact:'',phone:'',note:''};
  const hasJobs=id&&firmStats(id).jobs.length>0;
  openSheet(`<form data-form="firm" data-id="${esc(id||'')}" class="stack" novalidate>
    <h2 class="sheet-h">${f?'Firmayı düzenle':'Yeni firma hesabı'}</h2>
    <div class="field"><label for="f-name">Firma adı</label><input id="f-name" maxlength="80" value="${esc(v.name)}" placeholder="Örn. Akdeniz Yapı Market"></div>
    <div class="field"><label for="f-contact">Yetkili kişi <span class="opt">isteğe bağlı</span></label><input id="f-contact" maxlength="60" value="${esc(v.contact||'')}"></div>
    <div class="field"><label for="f-phone">Telefon <span class="opt">isteğe bağlı</span></label><input id="f-phone" type="tel" inputmode="tel" maxlength="30" value="${esc(v.phone||'')}" placeholder="05xx xxx xx xx"></div>
    <div class="field"><label for="f-note">Not <span class="opt">isteğe bağlı</span></label><textarea id="f-note" rows="3" maxlength="1000" placeholder="Adres, vergi dairesi, ödeme koşulu">${esc(v.note||'')}</textarea></div>
    <p class="form-err" id="f-err" hidden></p>
    <div class="actions">
      ${f&&amMgr()?(hasJobs?'':`<button type="button" class="btn danger-t" data-act="delFirm" data-id="${esc(id)}" data-confirm="Silmek için tekrar dokun">Sil</button>`):''}
      <button type="button" class="btn ghost" data-act="closeSheet">Vazgeç</button><button class="btn primary" type="submit">${f?'Kaydet':'Firmayı ekle'}</button>
    </div>
    ${f&&amMgr()&&hasJobs?'<p class="hint">İş girişi olan firma silinemez. Önce işlerini sil.</p>':''}
  </form>`);
}
async function submitFirm(f){
  const id=f.dataset.id, name=$('#f-name').value.trim();
  if(!name) return formErr('f-err','Firma adını yaz.');
  for(const [fid,x] of S.firms) if(fid!==id&&lower(x.name)===lower(name)) return formErr('f-err','Bu adla bir firma zaten var.');
  const data={name,contact:$('#f-contact').value.trim(),phone:$('#f-phone').value.trim(),note:$('#f-note').value.trim()};
  lockForm(f,true);
  let ok,newId=id;
  if(id) ok=await w(()=>upd('firms',id,data),'Firma güncellendi','firms/'+id);
  else{ok=await w(()=>ins('firms',data),'Firma eklendi');newId=ok}
  if(ok){closeSheet();S.tab='firmalar';S.firmOpen=newId;S.jobFilter='all';LS.set('atp.tab','firmalar');render();window.scrollTo(0,0)}
  else lockForm(f,false);
}

function openJobForm(o={}){
  const j=o.id?S.jobs.get(o.id):null;
  if(!S.firms.size){
    openSheet(`<div class="stack"><h2 class="sheet-h">Önce bir firma ekle</h2><p class="lead">İş girişleri bir firma hesabına bağlanır. Firmayı ekleyip devam edebilirsin.</p><div class="actions"><button class="btn ghost" data-act="closeSheet">Vazgeç</button><button class="btn primary" data-act="firmForm">Firma ekle</button></div></div>`);
    return;
  }
  const v=j||{firm:o.firm||'',type:'',plate:'',title:'',w:null,h:null,qty:1,workDate:today(),note:''};
  const firmOpts=(v.firm?'':'<option value="" selected disabled>Firma seç</option>')+firmsSorted().map(([id,f])=>`<option value="${esc(id)}" ${id===v.firm?'selected':''}>${esc(f.name)}</option>`).join('');
  openSheet(`<form data-form="job" data-id="${esc(o.id||'')}" class="stack" novalidate>
    <h2 class="sheet-h">${j?'İş girişini düzenle':'Firma için iş girişi'}</h2>
    <div class="field"><label for="j-firm">Firma</label><select id="j-firm">${firmOpts}</select></div>
    <fieldset class="field"><legend>İş türü</legend><div class="chips">${JOB_TYPES.map((t,i)=>`<label class="chip"><input type="radio" name="j-type" id="j-type-${i}" value="${esc(t)}" ${v.type===t?'checked':''}><span>${esc(t)}</span></label>`).join('')}</div></fieldset>
    <div class="field" id="j-plate-wrap" ${v.type===VEHICLE?'':'hidden'}><label for="j-plate">Plaka</label><input id="j-plate" maxlength="14" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(v.plate||'')}" placeholder="Örn. 31 ABC 123"></div>
    <div class="field"><label for="j-title">Yapılan iş</label><input id="j-title" maxlength="140" value="${esc(v.title)}" placeholder="Örn. Mağaza cephesi LED'li kutu harf"></div>
    <div class="row3">
      <div class="field"><label for="j-w">En (cm)</label><input id="j-w" inputmode="decimal" value="${esc(fnumIn(v.w))}" placeholder="300"></div>
      <div class="field"><label for="j-h">Boy (cm)</label><input id="j-h" inputmode="decimal" value="${esc(fnumIn(v.h))}" placeholder="120"></div>
      <div class="field"><label for="j-qty">Adet</label><input id="j-qty" inputmode="numeric" value="${esc(fnumIn(v.qty||1))}"></div>
    </div>
    <p class="m2" id="j-m2"></p>
    <div class="field"><label for="j-date">İş tarihi</label><input id="j-date" type="date" value="${esc(v.workDate||today())}"></div>
    <div class="field"><label for="j-note">Not <span class="opt">malzeme, montaj yeri, fiyatı etkileyen detaylar</span></label><textarea id="j-note" rows="3" maxlength="1500" placeholder="Örn. 3 mm kompozit, 2 kat iskele, gece montajı">${esc(v.note||'')}</textarea></div>
    <p class="form-err" id="j-err" hidden></p>
    ${j?'':'<p class="hint">Kaydedince yöneticilere fiyatlandırma talebi olarak düşer.</p>'}
    <div class="actions"><button type="button" class="btn ghost" data-act="closeSheet">Vazgeç</button><button class="btn primary" type="submit">${j?'Kaydet':'İşi kaydet'}</button></div>
  </form>`);
  updM2();
}
function updM2(){
  const el=$('#j-m2'); if(!el) return;
  const wv=parseNum($('#j-w').value), hv=parseNum($('#j-h').value), q=parseNum($('#j-qty').value)||1;
  el.innerHTML=(wv>0&&hv>0)?`Toplam alan: <b>${fnum(wv*hv*q/10000)} m²</b>`:'Ölçü girersen alan m² olarak hesaplanır.';
}
async function submitJob(f){
  const id=f.dataset.id, firm=$('#j-firm').value, title=$('#j-title').value.trim();
  const type=(f.querySelector('input[name="j-type"]:checked')||{}).value||'';
  if(!firm||!S.firms.get(firm)) return formErr('j-err','İşin hangi firmaya yapıldığını seç.');
  const plate=type===VEHICLE?normPlate($('#j-plate').value):'';
  if(type===VEHICLE&&!plate) return formErr('j-err','Aracın plakasını yaz.');
  if(!title) return formErr('j-err','Yapılan işi kısaca yaz.');
  const wv=parseNum($('#j-w').value), hv=parseNum($('#j-h').value), q=parseNum($('#j-qty').value);
  if([wv,hv,q].some(x=>Number.isNaN(x)||(x!=null&&x<0))) return formErr('j-err','Ölçü ve adet sadece sayı olmalı.');
  const data={firm,type,plate,title,w:wv||null,h:hv||null,qty:q&&q>0?q:1,workDate:$('#j-date').value||today(),note:$('#j-note').value.trim()};
  lockForm(f,true);
  let ok;
  if(id) ok=await w(()=>upd('jobs',id,data),'İş güncellendi','jobs/'+id);
  else ok=await w(()=>ins('jobs',data),amMgr()?'İş kaydedildi':'İş kaydedildi, yöneticilere fiyat talebi gitti');
  if(ok) closeSheet(); else lockForm(f,false);
}
function openJob(id){
  const j=S.jobs.get(id); if(!j) return toast('Bu iş girişi silinmiş.','err');
  const priced=j.status==='fiyatlandi', a=m2(j), mgr=amMgr();
  const rows=[['Firma',firmName(j.firm)]];
  if(j.type) rows.push(['İş türü',j.type]);
  if(j.plate) rows.push(['Plaka',plateHtml(j.plate),true]);
  if(j.w&&j.h) rows.push(['Ölçü',fnum(j.w,1)+' × '+fnum(j.h,1)+' cm']);
  rows.push(['Adet',fnum(j.qty||1,0)]);
  if(a) rows.push(['Alan',fnum(a)+' m²']);
  rows.push(['İş tarihi',fmtDay(j.workDate)]);
  rows.push(['Giren',nm(j.enteredBy)+' · '+fmtStamp(j.createdAt||Date.now())]);
  let price='';
  if(priced){
    const extra=[j.vat==='dahil'?'KDV dahil · KDV hariç '+money(net(j)):'+ KDV · KDV dahil '+money(net(j)*(1+VAT))];
    if(j.unit) extra.push('m² fiyatı '+money(j.unit));
    price=`<div class="pricebox"><span>Fiyat</span><div class="amt">${esc(money(j.price))}</div><span>${esc(extra.join(' · '))}</span>${j.priceNote?`<span>${esc(j.priceNote)}</span>`:''}<span>${esc(nm(j.pricedBy)+' · '+fmtStamp(j.pricedAt||Date.now()))}</span></div>`;
  }else price=`<div class="pricebox pending"><span class="hatch"></span>Fiyat bekliyor. Yöneticilere bildirildi.</div>`;
  const mine=j.enteredBy===S.meId;
  const canEdit=canW()&&(mgr||(mine&&!priced)), canDel=canW()&&(mgr||(mine&&!priced));
  openSheet(`<div class="stack">
    <h2 class="sheet-h">${esc(j.title)}</h2>
    ${price}
    <dl class="dl">${rows.map(([k,v,raw])=>`<dt>${esc(k)}</dt><dd>${raw?v:esc(v)}</dd>`).join('')}</dl>
    ${j.note?`<p class="note">${esc(j.note)}</p>`:''}
    <div class="actions">
      ${canDel?`<button class="btn danger-t" data-act="delJob" data-id="${esc(id)}" data-confirm="Silmek için tekrar dokun">Sil</button>`:''}
      ${canEdit?`<button class="btn" data-act="editJob" data-id="${esc(id)}">${ic('edit')}Düzenle</button>`:''}
      ${mgr&&canW()?`<button class="btn ${priced?'':'caution'}" data-act="price" data-id="${esc(id)}">${priced?'Fiyatı değiştir':'Fiyatlandır'}</button>`:''}
    </div>
  </div>`);
}
function openPriceForm(id){
  const j=S.jobs.get(id); if(!j) return;
  const a=m2(j), vat=j.vat||'haric';
  openSheet(`<form data-form="price" data-id="${esc(id)}" class="stack" novalidate>
    <div><p class="eyebrow">${esc(firmName(j.firm))}</p><h2 class="sheet-h">${esc(j.title)}</h2></div>
    <p class="hint">${esc([j.type,j.plate?'Plaka '+j.plate:'',j.w&&j.h?fnum(j.w,1)+'×'+fnum(j.h,1)+' cm':'',(j.qty||1)>1?fnum(j.qty,0)+' adet':'',a?fnum(a)+' m²':''].filter(Boolean).join(' · '))}${j.note?'<br>'+esc(j.note):''}</p>
    ${a?`<div class="field"><label for="p-unit">m² fiyatı (₺) <span class="opt">yazarsan toplam hesaplanır</span></label><input id="p-unit" inputmode="decimal" value="${esc(fnumIn(j.unit))}" placeholder="Örn. 1850"></div>`:''}
    <div class="field"><label for="p-total">Toplam tutar (₺)</label><input id="p-total" inputmode="decimal" value="${esc(fnumIn(j.price))}" placeholder="Örn. 12500"></div>
    <fieldset class="field"><legend>KDV</legend><div class="chips">
      <label class="chip"><input type="radio" name="p-vat" id="p-vat-h" value="haric" ${vat==='haric'?'checked':''}><span>KDV hariç</span></label>
      <label class="chip"><input type="radio" name="p-vat" id="p-vat-d" value="dahil" ${vat==='dahil'?'checked':''}><span>KDV dahil</span></label>
    </div></fieldset>
    <p class="m2" id="p-sum"></p>
    <div class="field"><label for="p-note">Fiyat notu <span class="opt">isteğe bağlı</span></label><input id="p-note" maxlength="200" value="${esc(j.priceNote||'')}" placeholder="Örn. Montaj dahil, %10 iskonto"></div>
    <p class="form-err" id="p-err" hidden></p>
    <div class="actions"><button type="button" class="btn ghost" data-act="closeSheet">Vazgeç</button><button class="btn primary" type="submit">Fiyatı kaydet</button></div>
  </form>`);
  updSum();
}
function unitToTotal(){
  const id=$('form[data-form="price"]').dataset.id, j=S.jobs.get(id), a=j&&m2(j), u=parseNum($('#p-unit').value);
  if(a&&u>0) $('#p-total').value=fnumIn(Math.round(u*a*100)/100);
  updSum();
}
function updSum(){
  const el=$('#p-sum'); if(!el) return;
  const t=parseNum($('#p-total').value), dahil=(document.querySelector('input[name="p-vat"]:checked')||{}).value==='dahil';
  if(!(t>0)){el.textContent='';return}
  const n=dahil?t/(1+VAT):t;
  el.innerHTML=`KDV hariç <b>${esc(money(n))}</b> · KDV dahil <b>${esc(money(n*(1+VAT)))}</b>`;
}
async function submitPrice(f){
  const id=f.dataset.id, total=parseNum($('#p-total').value), uEl=$('#p-unit'), unit=uEl?parseNum(uEl.value):null;
  if(!(total>0)) return formErr('p-err','Toplam tutarı sayı olarak yaz. Örn. 12500 ya da 12.500,50');
  if(Number.isNaN(unit)) return formErr('p-err','m² fiyatı sayı olmalı.');
  const vat=(f.querySelector('input[name="p-vat"]:checked')||{}).value||'haric';
  lockForm(f,true);
  const ok=await w(()=>upd('jobs',id,{status:'fiyatlandi',price:total,unit:unit>0?unit:null,vat,priceNote:$('#p-note').value.trim()}),'Fiyat kaydedildi','jobs/'+id);
  if(ok) closeSheet(); else lockForm(f,false);
}

const trSlug=s=>String(s||'').toLocaleLowerCase('tr').replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u').replace(/[^a-z0-9]+/g,'').slice(0,20);
const genPass=()=>String(100000+Math.floor(Math.random()*900000));
function openStaffForm(id){
  const s=id?S.staff.get(id):null;
  if(!s){
    openSheet(`<form data-form="staff" data-id="" class="stack" novalidate>
      <h2 class="sheet-h">Ekibe kişi ekle</h2>
      <div class="field"><label for="s-name">Ad</label><input id="s-name" maxlength="40" placeholder="Örn. Mehmet"></div>
      <div class="row2">
        <div class="field"><label for="s-user">Kullanıcı adı</label><input id="s-user" autocapitalize="none" spellcheck="false" maxlength="24" placeholder="mehmet"></div>
        <div class="field"><label for="s-pass">Şifre</label><input id="s-pass" autocomplete="off" spellcheck="false" maxlength="40" value="${genPass()}"></div>
      </div>
      <fieldset class="field"><legend>Rol</legend><div class="chips">
        <label class="chip"><input type="radio" name="s-role" id="s-role-p" value="personel" checked><span>Personel</span></label>
        <label class="chip"><input type="radio" name="s-role" id="s-role-y" value="yonetici"><span>Yönetici</span></label>
      </div></fieldset>
      <p class="hint">Yöneticiler fiyat girer ve değiştirir, ekip hesaplarını açar, PDF döküm alır. Personel iş girer, görevlerini takip eder ve fiyatları görür.</p>
      <p class="form-err" id="s-err" hidden></p>
      <div class="actions"><button type="button" class="btn ghost" data-act="closeSheet">Vazgeç</button><button class="btn primary" type="submit">Hesabı aç</button></div>
    </form>`);
    return;
  }
  openSheet(`<form data-form="staff" data-id="${esc(id)}" class="stack" novalidate>
    <h2 class="sheet-h">${esc(s.name)}</h2>
    <p class="hint">Kullanıcı adı: <span class="sel">${esc(s.username||'')}</span>${s.active?'':' · Hesap kapalı'}</p>
    <div class="field"><label for="s-name">Ad</label><input id="s-name" maxlength="40" value="${esc(s.name)}"></div>
    <fieldset class="field"><legend>Rol</legend><div class="chips">
      <label class="chip"><input type="radio" name="s-role" id="s-role-p" value="personel" ${s.role!=='yonetici'?'checked':''}><span>Personel</span></label>
      <label class="chip"><input type="radio" name="s-role" id="s-role-y" value="yonetici" ${s.role==='yonetici'?'checked':''}><span>Yönetici</span></label>
    </div></fieldset>
    <div class="field"><label for="s-pass">Yeni şifre <span class="opt">boş bırakırsan değişmez</span></label><input id="s-pass" autocomplete="off" spellcheck="false" maxlength="40"></div>
    <p class="form-err" id="s-err" hidden></p>
    <div class="actions">
      ${id!==S.meId?(s.active?`<button type="button" class="btn danger-t" data-act="staffActive" data-id="${esc(id)}" data-v="0" data-confirm="Kapatmak için tekrar dokun">Hesabı kapat</button>`:`<button type="button" class="btn" data-act="staffActive" data-id="${esc(id)}" data-v="1">Hesabı aç</button>`):''}
      <button type="button" class="btn ghost" data-act="closeSheet">Vazgeç</button><button class="btn primary" type="submit">Kaydet</button>
    </div>
  </form>`);
}
async function submitStaff(f){
  const id=f.dataset.id, name=$('#s-name').value.trim(), pass=$('#s-pass').value.trim();
  const role=(f.querySelector('input[name="s-role"]:checked')||{}).value||'personel';
  if(!name) return formErr('s-err','Adı yaz.');
  if(!id){
    const username=$('#s-user').value.trim().toLowerCase();
    if(!/^[a-z0-9._-]{3,24}$/.test(username)) return formErr('s-err','Kullanıcı adı 3-24 karakter olmalı; harf, rakam, nokta ya da tire. Türkçe karakter kullanma.');
    if(pass.length<6) return formErr('s-err','Şifre en az 6 karakter olmalı.');
    lockForm(f,true);
    try{
      const r=await B.adminCall('createUser',{name,username,password:pass,role});
      const one=await B.loadOne('staff',r.id).catch(()=>null); if(one) S.staff.set(one[0],one[1]);
      showCredentials(name,username,pass); render();
    }catch(e){lockForm(f,false);formErr('s-err',e.message)}
    return;
  }
  if(pass&&pass.length<6) return formErr('s-err','Şifre en az 6 karakter olmalı.');
  lockForm(f,true);
  try{
    const body={id,name,role}; if(pass) body.password=pass;
    await B.adminCall('updateUser',body);
    const one=await B.loadOne('staff',id).catch(()=>null); if(one) S.staff.set(one[0],one[1]);
    closeSheet(); toast(pass?'Kaydedildi, yeni şifre: '+pass:'Kaydedildi','ok'); render();
  }catch(e){lockForm(f,false);formErr('s-err',e.message)}
}
function credText(name,username,pass){
  return 'Atölye Panosu giriş bilgilerin\n'+(B.CFG.pagesUrl?'Uygulama: '+B.CFG.pagesUrl+'\n':'')+'Kullanıcı adı: '+username+'\nŞifre: '+pass;
}
function showCredentials(name,username,pass){
  const txt=credText(name,username,pass);
  openSheet(`<div class="stack">
    <h2 class="sheet-h">${esc(name)} için hesap açıldı</h2>
    <p class="lead">Bu bilgileri ${esc(name)} ile paylaş. Android telefonda bağlantıdan uygulamayı indirir, iPhone'da Safari'de açıp ana ekrana ekler.</p>
    <pre class="note" id="cred-txt">${esc(txt)}</pre>
    <div class="actions"><button class="btn ghost" data-act="closeSheet">Kapat</button><button class="btn primary" data-act="copy" data-text="${esc(txt)}" data-target="cred-txt">${ic('copy')}Kopyala</button></div>
  </div>`);
}

function openMe(){
  const s=S.staff.get(S.meId)||{}, mgr=amMgr();
  const cutoff=Date.now()-30*864e5;
  const old=[...S.tasks].filter(([,t])=>!isRep(t)&&t.status==='done'&&(t.doneAt||0)<cutoff);
  const pushTxt={granted:'Açık. Uygulama kapalıyken de bildirim gelir.',prompt:'Kapalı.',denied:'Telefon ayarlarından kapatılmış. Ayarlar > Uygulamalar > Atölye Panosu > Bildirimler bölümünden aç.','needs-install':"iPhone'da bildirim için Safari'de Paylaş > Ana Ekrana Ekle, sonra simgeden aç.",unsupported:'Bu cihazda desteklenmiyor.',unknown:'Kontrol ediliyor.',error:'Açılamadı, tekrar dene.'}[S.push]||'';
  const imported=!!S.settings.get('import');
  openSheet(`<div class="stack">
    <div class="sheet-top"><h2 class="sheet-h">${esc(s.name||'')}</h2><span class="pill accent">${mgr?'Yönetici':'Personel'}</span></div>
    <p class="hint">Kullanıcı adı: <b>${esc(s.username||'')}</b></p>
    <div class="help"><h3>Bildirimler</h3><p>${esc(pushTxt)}</p>${S.push==='prompt'||S.push==='error'?`<div><button class="btn sm primary" data-act="pushOn">Bildirimleri aç</button></div>`:''}</div>
    <div class="help"><h3>Ne zaman bildirim gelir?</h3><p>Sana görev verildiğinde, görevin saatinden 15 dakika önce ve saatinde, saatinden 1 saat sonra hâlâ yapılmadıysa, sabah 08:30'da günün listesi ve 17:30'da yapılmayanlar. Yöneticilere yeni fiyat talepleri ve gün sonu durumu, iş girene de işi fiyatlandığında haber verilir.</p></div>
    <div class="help"><h3>Fiyatlar</h3><p>Girilen fiyatları herkes görür. Fiyatı yalnızca yöneticiler girer ve değiştirir; firma hesabını PDF olarak da yalnızca yöneticiler indirir.</p></div>
    ${mgr&&!imported?`<div class="help"><h3>Eski panodan aktar</h3><p>Claude'dan aldığın yedek dosyasını seç. Firmalar, işler ve açık görevler aktarılır; kişiler adlarına göre eşleşir, o yüzden önce ekibin hesaplarını aç.</p><div><label class="btn sm" for="imp-file">${ic('file')}Dosya seç</label><input id="imp-file" type="file" accept=".json,application/json" hidden></div></div>`:''}
    ${mgr?`<div class="help"><h3>Eski kayıtlar</h3><p>${old.length?`30 günden eski ${old.length} tamamlanmış görev var. Temizlemek listeyi hafif tutar; firma iş girişleri silinmez.`:'Temizlenecek eski görev yok.'}</p>${old.length?`<div><button class="btn danger-t sm" data-act="cleanup" data-confirm="Silmek için tekrar dokun">${old.length} görevi sil</button></div>`:''}</div>`:''}
    ${N.isNative?`<p class="hint">Sürüm ${esc(String(B.CFG.version||''))}${S.update?` · <a href="${esc(S.update.apk||apkUrl())}">yeni sürümü indir</a>`:''}</p>`:installHint()}
    <div class="actions"><button class="btn danger-t" data-act="logout">Çıkış yap</button></div>
  </div>`);
}

/* ---------- PDF statement (managers) ---------- */
function periodRange(p,from,to){
  const d=new Date(), y=d.getFullYear(), m=d.getMonth();
  if(p==='month') return [ymd(new Date(y,m,1)),ymd(new Date(y,m+1,0))];
  if(p==='prev') return [ymd(new Date(y,m-1,1)),ymd(new Date(y,m,0))];
  if(p==='year') return [y+'-01-01',y+'-12-31'];
  if(p==='custom') return [from,to];
  return null;
}
function readExport(){
  const f=$('form[data-form="export"]');
  return {fid:f.dataset.id,period:(f.querySelector('input[name="x-period"]:checked')||{}).value||'month',
    from:$('#x-from').value,to:$('#x-to').value,pending:$('#x-pend').checked,notes:$('#x-notes').checked};
}
function statementRows(o){
  const r=periodRange(o.period,o.from,o.to);
  return [...S.jobs].filter(([,j])=>j.firm===o.fid)
    .filter(([,j])=>{if(!r) return true;const d=j.workDate||ymd(new Date(j.createdAt||0));return d>=r[0]&&d<=r[1]})
    .filter(([,j])=>o.pending||j.status==='fiyatlandi')
    .sort((a,b)=>(a[1].workDate||'').localeCompare(b[1].workDate||'')||(a[1].createdAt||0)-(b[1].createdAt||0));
}
function statementTotals(rows){
  let n=0,p=0;
  for(const [,j] of rows){if(j.status==='fiyatlandi') n+=net(j); else p++}
  n=Math.round(n*100)/100; const v=Math.round(n*VAT*100)/100;
  return {count:rows.length,pending:p,net:n,vat:v,gross:Math.round((n+v)*100)/100};
}
function updExportSum(){
  const el=$('#x-sum'); if(!el) return;
  const o=readExport(); $('#x-range').hidden=o.period!=='custom';
  if(o.period==='custom'&&(!o.from||!o.to)){el.textContent='Başlangıç ve bitiş tarihini seç.';return}
  const t=statementTotals(statementRows(o));
  el.innerHTML=t.count?`<b>${t.count} iş</b>${t.pending?` · ${t.pending} fiyat bekliyor`:''} · Genel toplam <b>${esc(tl(t.gross))}</b>`:'Bu dönemde iş girişi yok.';
}
function openExportForm(fid){
  const f=S.firms.get(fid); if(!f) return;
  if(!S.firmLoaded.has(fid)){S.firmLoaded.add(fid);B.loadFirmJobs(fid).then(rows=>{for(const [id,v] of rows) S.jobs.set(id,v);updExportSum()},()=>S.firmLoaded.delete(fid))}
  const co=S.settings.get('company')||{};
  const per=[['month','Bu ay'],['prev','Geçen ay'],['year','Bu yıl'],['all','Tüm kayıtlar'],['custom','Tarih aralığı']];
  openSheet(`<form data-form="export" data-id="${esc(fid)}" class="stack" novalidate>
    <div><p class="eyebrow">${esc(f.name)}</p><h2 class="sheet-h">Hesap dökümü (PDF)</h2></div>
    <fieldset class="field"><legend>Dönem</legend><div class="chips">${per.map(([k,l],i)=>`<label class="chip"><input type="radio" name="x-period" id="x-per-${k}" value="${k}" ${i===0?'checked':''}><span>${l}</span></label>`).join('')}</div></fieldset>
    <div class="row2" id="x-range" hidden><div class="field"><label for="x-from">Başlangıç</label><input id="x-from" type="date"></div><div class="field"><label for="x-to">Bitiş</label><input id="x-to" type="date" value="${today()}"></div></div>
    <label class="switch"><input type="checkbox" id="x-pend" checked><span>Fiyat bekleyen işleri de listele</span></label>
    <label class="switch"><input type="checkbox" id="x-notes"><span>İş notlarını ekle</span></label>
    <p class="hint">İş notları atölye içi bilgi içerebilir. Döküm müşteriye gidecekse kapalı bırak.</p>
    <div class="field"><label for="x-co">Başlıktaki şirket adı</label><input id="x-co" maxlength="80" value="${esc(co.name||'')}" placeholder="Örn. Yıldız Reklam"></div>
    <div class="field"><label for="x-coinfo">Şirket bilgisi <span class="opt">adres, telefon, vergi no</span></label><textarea id="x-coinfo" rows="2" maxlength="300">${esc(co.info||'')}</textarea></div>
    <p class="m2" id="x-sum"></p>
    <p class="form-err" id="x-err" hidden></p>
    <div class="actions"><button type="button" class="btn ghost" data-act="closeSheet">Vazgeç</button><button class="btn primary" type="submit">${ic('file')}${N.isNative?'PDF oluştur ve paylaş':'PDF indir'}</button></div>
  </form>`);
  updExportSum();
}
const slug=s=>String(s||'').replace(/[çÇ]/g,'c').replace(/[ğĞ]/g,'g').replace(/[ıİ]/g,'i').replace(/[öÖ]/g,'o').replace(/[şŞ]/g,'s').replace(/[üÜ]/g,'u').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'firma';
async function submitExport(fm){
  const o=readExport(), firm=S.firms.get(o.fid); if(!firm) return;
  if(o.period==='custom'){
    if(!o.from||!o.to) return formErr('x-err','Başlangıç ve bitiş tarihini seç.');
    if(o.from>o.to) return formErr('x-err','Başlangıç tarihi bitişten sonra olamaz.');
  }
  const rows=statementRows(o); if(!rows.length) return formErr('x-err','Bu dönemde dökümde gösterilecek iş yok.');
  const coName=$('#x-co').value.trim(), coInfo=$('#x-coinfo').value.trim(), co=S.settings.get('company')||{};
  const btn=fm.querySelector('button[type=submit]'), label=btn.innerHTML;
  btn.disabled=true; btn.textContent='Hazırlanıyor…';
  const reset=()=>{btn.disabled=false;btn.innerHTML=label};
  if(coName!==(co.name||'')||coInfo!==(co.info||'')){if(await w(()=>B.setSetting('company',{name:coName,info:coInfo}),null,'settings/company')) S.settings.set('company',{name:coName,info:coInfo})}
  const r=periodRange(o.period,o.from,o.to);
  const data={
    title:firm.name+' hesap dökümü',
    company:{name:coName,info:coInfo},
    firm:{name:firm.name,contact:firm.contact||'',phone:firm.phone||''},
    period:r?dmy(r[0])+' – '+dmy(r[1]):'Tüm kayıtlar',
    generatedAt:new Date().toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),
    preparedBy:nm(S.meId), vatPct:Math.round(VAT*100), totals:statementTotals(rows),
    rows:rows.map(([,j])=>{
      const pr=j.status==='fiyatlandi', sub=[];
      if(j.plate) sub.push('Plaka: '+j.plate);
      if(pr&&j.vat==='dahil') sub.push('KDV dahil fiyat: '+tl(j.price));
      if(pr&&j.unit) sub.push('m² fiyatı: '+tl(j.unit));
      if(pr&&j.priceNote) sub.push(j.priceNote);
      if(o.notes&&j.note) sub.push(j.note);
      return {date:dmy(j.workDate||ymd(new Date(j.createdAt||0))),title:j.title,sub:sub.join(' · '),type:j.type||'',
        size:[j.w&&j.h?fnum(j.w,1)+'×'+fnum(j.h,1)+' cm':'',fnum(j.qty||1,0)+' adet'].filter(Boolean).join(' · '),
        m2:m2(j)?fnum(m2(j)):'',amount:pr?Math.round(net(j)*100)/100:null};
    })
  };
  let buf;
  try{buf=buildPdf(jsPDF,FONTS,data)}catch(e){reset();return formErr('x-err','PDF oluşturulamadı. Sayfayı yenileyip tekrar dene.')}
  const per={month:'bu-ay',prev:'gecen-ay',year:'bu-yil',all:'tum'}[o.period]||(o.from+'_'+o.to);
  try{
    const r=await N.savePdf(slug(firm.name)+'-hesap-dokumu-'+per+'.pdf',buf);
    if(r==='cancelled'){reset();return}
    closeSheet(); toast(r==='saved'?'PDF indirildi':'Hesap dökümü hazır','ok');
  }catch(e){reset();formErr('x-err','Dosya kaydedilemedi: '+(e&&e.message||e))}
}

/* ---------- giriş, kurulum, içe aktarma ---------- */
async function submitLogin(f){
  const u=$('#li-user').value.trim().toLowerCase(), p=$('#li-pass').value;
  if(!u||!p) return formErr('li-err','Kullanıcı adını ve şifreni yaz.');
  lockForm(f,true);
  try{await B.login(u,p);LS.set('atp.user',u);S.keep={};const s=await B.session();await startData(s.user.id)}
  catch(e){lockForm(f,false);formErr('li-err',e.message)}
}
async function submitBootstrap(f){
  const code=$('#bs-code').value.trim(), name=$('#bs-name').value.trim(), username=$('#bs-user').value.trim().toLowerCase(), email=$('#bs-email').value.trim();
  const p1=$('#bs-pass').value, p2=$('#bs-pass2').value;
  if(!code) return formErr('bs-err','Kurulum kodunu yaz.');
  if(!name) return formErr('bs-err','Adını yaz.');
  if(!/^[a-z0-9._-]{3,24}$/.test(username)) return formErr('bs-err','Kullanıcı adı 3-24 karakter olmalı; harf, rakam, nokta ya da tire. Türkçe karakter kullanma.');
  if(p1.length<6) return formErr('bs-err','Şifre en az 6 karakter olmalı.');
  if(p1!==p2) return formErr('bs-err','İki şifre aynı değil.');
  lockForm(f,true);
  try{
    await B.adminCall('bootstrap',{code,name,username,email,password:p1});
    await B.login(username,p1); LS.set('atp.user',username); S.keep={};
    const s=await B.session(); await startData(s.user.id);
    toast('Hoş geldin, '+name+'. Şimdi Ekip sekmesinden çalışanların hesaplarını aç.','ok');
  }catch(e){lockForm(f,false);formErr('bs-err',e.message)}
}
async function logout(){
  const tok=N.currentToken(); if(tok) await B.unregisterPush(tok);
  await B.logout(); resetToLogin();
}
async function runImport(file){
  let data; try{data=JSON.parse(await file.text())}catch(e){return toast('Dosya okunamadı. Claude\'dan aldığın .json dosyasını seç.','err')}
  const byName=new Map(activeStaff().map(([id,s])=>[lower(s.name),id]));
  const sMap=new Map(), missing=new Set();
  for(const r of data.staff||[]){const id=byName.get(lower(r.data&&r.data.name));if(id) sMap.set(r.id,id);else if(r.data&&r.data.active!==false) missing.add(r.data.name)}
  if(missing.size&&!confirmImport(missing)) return;
  closeSheet(); toast('Aktarılıyor…');
  const fMap=new Map(); let nf=0,nj=0,nt=0,skip=0;
  const firmByName=new Map([...S.firms].map(([id,f])=>[lower(f.name),id]));
  try{
    for(const r of data.firms||[]){const d=r.data||{};const ex=firmByName.get(lower(d.name));
      if(ex){fMap.set(r.id,ex);continue}
      const id=await ins('firms',{name:String(d.name||'Firma').slice(0,80),contact:d.contact||'',phone:d.phone||'',note:d.note||''});fMap.set(r.id,id);nf++}
    for(const r of data.jobs||[]){const d=r.data||{};const firm=fMap.get(d.firm);if(!firm){skip++;continue}
      await B.insert('jobs',{firm,type:d.type||'',plate:d.plate||'',title:String(d.title||'İş').slice(0,140),w:d.w??null,h:d.h??null,qty:d.qty||1,workDate:d.workDate||today(),note:d.note||'',
        status:d.status==='fiyatlandi'?'fiyatlandi':'bekliyor',price:d.price??null,unit:d.unit??null,vat:d.vat==='dahil'?'dahil':'haric',priceNote:d.priceNote||'',
        imported:true,enteredBy:sMap.get(d.enteredBy)||S.meId,pricedBy:sMap.get(d.pricedBy)||null,pricedAt:d.pricedAt||null,createdAt:d.createdAt||Date.now()});nj++}
    for(const r of data.tasks||[]){const d=r.data||{};const rep=d.repeat==='daily'||d.repeat==='weekdays';
      if(!rep&&d.status==='done') continue;
      const a=sMap.get(d.assignee); if(!a){skip++;continue}
      const done={}; for(const [k,v] of Object.entries(d.done||{})) if(v) done[k]={by:sMap.get(v.by)||a,at:v.at||0};
      await B.insert('tasks',{title:String(d.title||'Görev').slice(0,120),assignee:a,due:d.due||today(),time:d.time||'',repeat:rep?d.repeat:'none',firm:fMap.get(d.firm)||'',urgent:!!d.urgent,note:d.note||'',
        status:'open',done,imported:true,createdBy:sMap.get(d.createdBy)||S.meId,createdAt:d.createdAt||Date.now()});nt++}
    for(const r of data.settings||[]) if(r.id==='company'&&r.data) await B.setSetting('company',{name:r.data.name||'',info:r.data.info||''});
    await B.setSetting('import',{at:Date.now(),firms:nf,jobs:nj,tasks:nt});
    await loadData(); render();
    toast(`Aktarıldı: ${nf} firma, ${nj} iş, ${nt} görev${skip?` · ${skip} kayıt eşleşmediği için atlandı`:''}`,'ok');
  }catch(e){toast('Aktarma yarıda kaldı: '+B.explain(e),'err');await loadData().catch(()=>{});render()}
}
function confirmImport(missing){
  const box=$('#imp-warn');
  if(box&&box.dataset.ok==='1') return true;
  openSheet(`<div class="stack"><h2 class="sheet-h">Bazı kişilerin hesabı yok</h2>
    <p class="lead">${esc([...missing].join(', '))} için hesap açılmamış. Onlara verilmiş görevler aktarılmaz, girdikleri işler senin adına aktarılır.</p>
    <p class="hint">Önce Ekip sekmesinden bu kişilerin hesaplarını aynı adla açıp sonra tekrar dene ya da yine de devam et.</p>
    <div class="actions"><button class="btn ghost" data-act="closeSheet">Vazgeç</button><button class="btn primary" data-act="importAnyway">Yine de aktar</button></div>
    <span id="imp-warn" hidden></span></div>`);
  return false;
}

/* ---------- events ---------- */
const actions={
  tab(b){
    const t=b.dataset.tab;
    if(S.tab===t){S.person=null;S.firmOpen=null}
    if(S.tab==='bildirim'&&t!=='bildirim') S.prevSeen=S.seenAt;
    if(t==='bildirim'&&S.tab!=='bildirim') S.prevSeen=S.seenAt;
    S.tab=t; LS.set('atp.tab',t); closeSheet(); render(); window.scrollTo(0,0);
  },
  closeSheet, fab:openAdd, me:openMe,
  toggle(b){toggleTask(b.dataset.id)},
  toggleClose(b){toggleTask(b.dataset.id);closeSheet()},
  task(b){openTask(b.dataset.id)},
  editTask(b){openTaskForm({id:b.dataset.id})},
  async delTask(b){const id=b.dataset.id;if(await w(()=>del('tasks',id),'Görev silindi','tasks/'+id)) closeSheet()},
  newTask(b){openTaskForm({assignee:b.dataset.assignee||(S.tab==='ekip'&&S.person)||S.meId,firm:b.dataset.firm||(S.tab==='firmalar'&&S.firmOpen)||''})},
  newJob(b){openJobForm({firm:b.dataset.firm||(S.tab==='firmalar'&&S.firmOpen)||''})},
  firmForm(b){openFirmForm(b.dataset.id)},
  async delFirm(b){const id=b.dataset.id;if(await w(()=>del('firms',id),'Firma silindi','firms/'+id)){closeSheet();S.firmOpen=null;render()}},
  firm(b){S.firmOpen=b.dataset.id;S.jobFilter='all';render();window.scrollTo(0,0)},
  firmBack(){S.firmOpen=null;render();window.scrollTo(0,0)},
  jobFilter(b){S.jobFilter=b.dataset.v;render()},
  job(b){openJob(b.dataset.id)},
  editJob(b){openJobForm({id:b.dataset.id})},
  async delJob(b){const id=b.dataset.id;if(await w(()=>del('jobs',id),'İş girişi silindi','jobs/'+id)) closeSheet()},
  price(b){if(amMgr()) openPriceForm(b.dataset.id)},
  exportForm(b){if(amMgr()) openExportForm(b.dataset.id)},
  person(b){S.person=b.dataset.id;render();window.scrollTo(0,0)},
  personBack(){S.person=null;render();window.scrollTo(0,0)},
  staffForm(b){openStaffForm(b.dataset.id)},
  async staffActive(b){
    const id=b.dataset.id, on=b.dataset.v==='1';
    try{await B.adminCall('updateUser',{id,active:on});const one=await B.loadOne('staff',id).catch(()=>null);if(one) S.staff.set(one[0],one[1]);closeSheet();toast(on?'Hesap açıldı':'Hesap kapatıldı; bu kişi artık giriş yapamaz','ok');S.person=null;render()}
    catch(e){toast(e.message,'err')}
  },
  logout(){closeSheet();logout()},
  retry(){if(S.meId) startData(S.meId); else toLogin()},
  pushOn(){enablePush(true)},
  pushHide(){LS.set('atp.pushHide',S.push);render()},
  importAnyway(){const el=$('#imp-warn');if(el) el.dataset.ok='1';const f=S.pendingImport;if(f) runImport(f)},
  async cleanup(b){
    const cutoff=Date.now()-30*864e5;
    const old=[...S.tasks].filter(([,t])=>!isRep(t)&&t.status==='done'&&(t.doneAt||0)<cutoff).map(([id])=>id);
    b.disabled=true; let n=0;
    for(const id of old){if(await w(()=>del('tasks',id),null,'tasks/'+id)) n++}
    toast(n+' eski görev silindi','ok'); closeSheet();
  },
  copy(b){
    const text=b.dataset.text;
    const fallback=()=>{const el=document.getElementById(b.dataset.target);if(el){const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r)}toast('Numara seçildi, kopyalayabilirsin')};
    try{navigator.clipboard.writeText(text).then(()=>toast('Numara kopyalandı','ok'),fallback)}catch(e){fallback()}
  }
};
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]'); if(!b||b.disabled) return;
  if(b.dataset.confirm&&!b.dataset.armed){
    e.preventDefault(); b.dataset.armed='1'; b.dataset.orig=b.innerHTML; b.textContent=b.dataset.confirm; b.classList.add('armed');
    setTimeout(()=>{if(b.isConnected&&b.dataset.armed){delete b.dataset.armed;b.innerHTML=b.dataset.orig;b.classList.remove('armed')}},4000);
    return;
  }
  const fn=actions[b.dataset.act]; if(fn){e.preventDefault();fn(b,e)}
});
const forms={task:submitTask,firm:submitFirm,job:submitJob,price:submitPrice,staff:submitStaff,login:submitLogin,bootstrap:submitBootstrap,export:submitExport};
document.addEventListener('submit',e=>{const f=e.target;e.preventDefault();const fn=forms[f.dataset.form];if(fn) fn(f)});
document.addEventListener('input',e=>{
  const el=e.target;
  if(el.matches&&el.matches('[data-keep]')){S.keep[el.id]=el.value;if(el.id==='firm-q'){const box=$('#firmList');if(box) box.innerHTML=firmListHtml()}}
  if(['j-w','j-h','j-qty'].includes(el.id)) updM2();
  if(el.id==='s-name'){const u=$('#s-user');if(u&&!u.dataset.touched) u.value=trSlug(el.value)}
  if(el.id==='s-user') el.dataset.touched='1';
  if(el.id==='bs-name'){const u=$('#bs-user');if(u&&!u.dataset.touched){u.value=trSlug(el.value);S.keep['bs-user']=u.value}}
  if(el.id==='bs-user') el.dataset.touched='1';
  if(el.id==='p-unit') unitToTotal();
  if(el.id==='p-total') updSum();
  if(el.id==='x-from'||el.id==='x-to') updExportSum();
  const err=el.form&&el.form.querySelector('.form-err'); if(err) err.hidden=true;
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.name==='t-repeat'){const l=$('#t-due-l');if(l) l.textContent=el.value==='none'?'Tarih':'Başlangıç'}
  if(el.name==='p-vat') updSum();
  if(el.name==='x-period'||el.id==='x-pend') updExportSum();
  if(el.id==='imp-file'&&el.files&&el.files[0]){S.pendingImport=el.files[0];runImport(el.files[0])}
  if(el.name==='j-type'){const wrap=$('#j-plate-wrap');if(wrap){wrap.hidden=el.value!==VEHICLE;if(!wrap.hidden) setTimeout(()=>{const p=$('#j-plate');if(p&&!p.value) p.focus()},0)}}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sheetWrap').hidden) closeSheet()});

/* ---------- gün değişince ve saat ilerledikçe ekranı tazele ---------- */
setInterval(()=>{if(S.day!==today()){S.day=today();if(S.phase==='ready') loadData().catch(()=>{})}scheduleRender()},30000);
$('#view').addEventListener('focusout',()=>setTimeout(()=>{if(S.deferred) render(false)},0));

boot();