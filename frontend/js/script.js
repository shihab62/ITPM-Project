/* Presentation Registration - frontend application (single-page, hash routes: #admin #teacher #teams ...).
   Needs /api?boot=1 (window.__BOOT) loaded in <head>. */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BOOT=window.__BOOT||{};   /* filled by /api?boot=1 (CSRF token, site name, logo, default form fields) */
const API_URL=BOOT.apiUrl||'/api';
let CSRF=(($('meta[name=csrf]')||{}).content)||BOOT.csrf||'';
let SITE_NAME=BOOT.siteName||'Presentation Registration';
let SITE_LOGO=BOOT.logo||'';
const DEF_ICON="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%230d9488'/%3E%3Ctext x='50' y='68' font-size='56' text-anchor='middle'%3E%F0%9F%8E%93%3C/text%3E%3C/svg%3E";
function setSiteLogo(u){
  SITE_LOGO=u||'';const b=document.querySelector('.brand'),old=b.firstElementChild;
  const n=document.createElement(u?'img':'i');
  if(u){n.className='blogo';n.src=u;n.alt=''}else n.className='fa-solid fa-chalkboard-user';
  b.replaceChild(n,old);
  const ic=document.querySelector('link[rel=icon]');if(ic)ic.href=u||DEF_ICON;
}
/* round badge on the sign-in cards: the website logo if one is set, otherwise the icon */
const lav=(bg,ic)=>'<div class="av lg" style="margin:0 auto 10px;background:'+(SITE_LOGO?'#fff':bg)+';color:#fff;font-size:1.8rem">'+(SITE_LOGO?'<img src="'+esc(SITE_LOGO)+'" alt="" style="object-fit:contain;padding:5px">':'<i class="fa-solid '+ic+'"></i>')+'</div>';
function setSiteName(n){SITE_NAME=n;document.title=n;['#sitename','#sitename2'].forEach(q=>{const e=$(q);if(e)e.textContent=n})}
const DEF_FIELDS=BOOT.defFields||[];
/* branding that the old single-file page printed with PHP: name, logo, year, server/backend problems */
(function(){
  setSiteName(SITE_NAME);
  if(SITE_LOGO){setSiteLogo(SITE_LOGO);document.querySelectorAll('#splash .si,#instbar .ii').forEach(e=>{e.innerHTML='<img src="'+esc(SITE_LOGO)+'" alt="">'})}
  const sb=document.querySelector('#splash b');if(sb)sb.textContent=SITE_NAME;
  const yr=document.getElementById('year');if(yr)yr.textContent=new Date().getFullYear();
  const bar=m=>{const d=document.createElement('div');d.setAttribute('role','alert');d.style.cssText='position:fixed;left:0;right:0;top:0;z-index:99999;background:#d64550;color:#fff;padding:12px 16px;font:600 14px/1.45 system-ui,sans-serif;text-align:center';d.innerHTML=m;document.body.appendChild(d)};
  if(!window.__BOOT)bar('Backend not reachable. Start it with <code>php -S localhost:8000 router.php</code> in the project folder and open <b>http://localhost:8000</b>');
  else if(BOOT.error)bar('Server problem: '+esc(BOOT.error));
})();
/* v17: program full names + numeric-only batch */
const PROG_FULL={UG:'Undergraduate',DH:'Diploma'};
const progFull=p=>{p=String(p||'').trim();return PROG_FULL[p.toUpperCase()]||p};
const progLabel=p=>{p=progFull(p);return p.toLowerCase()==='both'?'Undergraduate & Diploma':p};
const batchNum=v=>{v=String(v==null?'':v).trim();const m=v.match(/^(\d{1,4})(?!\d)/);return m?m[1]:v.replace(/\D/g,'').slice(0,4)};
document.addEventListener('input',e=>{const x=e.target;if(x&&x.hasAttribute&&x.hasAttribute('data-num')){const c=x.value.replace(/\D/g,'').slice(0,4);if(c!==x.value)x.value=c}});
function progChecks(cur){
  const list=[...new Set(((Array.isArray(OPTS.programs)&&OPTS.programs.length)?OPTS.programs:['Undergraduate','Diploma']).map(progFull))];
  const sel=String(cur||'').split(',').map(progFull).filter(Boolean),both=sel.includes('Both');
  return '<div class="pchk" role="group" aria-label="Program" style="display:flex;flex-wrap:wrap;gap:8px 18px;padding:6px 0">'+list.map(p=>'<label class="row" style="gap:8px;font-weight:600;cursor:pointer"><input type="checkbox" class="sprog-cb" value="'+esc(p)+'" '+(both||sel.includes(p)?'checked':'')+'> '+esc(p)+'</label>').join('')+'</div>';
}
const progOpts3=extra=>[...new Set(['Undergraduate','Diploma','Both',...(extra||[]).map(progFull).filter(Boolean)])];
function readProg(){const v=$$('.sprog-cb:checked').map(c=>c.value);return v.length>=2?'Both':(v[0]||'')}
let loads=0;
let loadTm=0;
function busy(on){loads+=on?1:-1;if(loads<0)loads=0;const L=$('#loader');if(loads>0){if(!loadTm&&!L.classList.contains('show'))loadTm=setTimeout(()=>{loadTm=0;if(loads>0)L.classList.add('show')},450)}else{clearTimeout(loadTm);loadTm=0;L.classList.remove('show')}}   /* spinner only after 0.45 s and it never blocks clicks */
function toast(m,t='ok'){const d=document.createElement('div');d.className='toast '+(t==='ok'?'ok':'err2');d.innerHTML='<i class="fa-solid '+(t==='ok'?'fa-circle-check':'fa-circle-exclamation')+'"></i><span>'+esc(m)+'</span>';$('#toasts').append(d);setTimeout(()=>d.remove(),4200)}
const INFLIGHT=new Map();
function api(action,o={}){
  /* a double-click sends the SAME request twice (e.g. toggle = on+off = nothing happens): identical requests that are still running share one answer */
  const key=o.json!==undefined?action+'|'+JSON.stringify(o.json):'';
  if(key&&INFLIGHT.has(key))return INFLIGHT.get(key);
  const p=api1(action,o);
  if(key){INFLIGHT.set(key,p);const clr=()=>INFLIGHT.delete(key);p.then(clr,clr)}
  return p;
}
async function api1(action,o={}){
  busy(true);
  const ctl=new AbortController(),tmo=setTimeout(()=>ctl.abort(),o.form?180000:30000);   /* never wait forever: a stuck request used to freeze every button */
  try{
    let role='';try{role=A.role||''}catch(_e){}
    const opt={method:'GET',headers:{'X-CSRF-Token':CSRF,'X-Role':role},credentials:'same-origin',signal:ctl.signal};
    if(o.json!==undefined){opt.method='POST';opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(o.json)}
    if(o.form){opt.method='POST';opt.body=o.form}
    let r;
    try{r=await fetch(API_URL+'?api='+action+(o.q?'&'+new URLSearchParams(o.q):''),opt)}
    catch(x){const e=new Error(x&&x.name==='AbortError'?'The server is slow right now. Please try again in a moment.':'Network problem. Check your internet and try again.');e.status=0;throw e}
    const d=await r.json().catch(()=>({ok:false,error:'Unexpected server response ('+r.status+'). Please refresh the page.'}));
    if(!d.ok){const e=new Error(d.error||'Request failed');e.status=r.status;throw e}
    return d;
  }finally{clearTimeout(tmo);busy(false)}
}
const cap=s=>s?s[0].toUpperCase()+s.slice(1):'';
const GEM={male:'👨',female:'👩'};
const av=(p,c='',g='')=>'<div class="av '+c+'">'+(p?'<img src="'+esc(p)+'" alt="Student photo" loading="lazy" decoding="async">':'<span title="'+(g?cap(g):'No photo')+'">'+(GEM[g]||'👤')+'</span>')+'</div>';
const tav=(p,c='')=>'<div class="av tav '+c+'">'+(p?'<img src="'+esc(p)+'" alt="Course teacher" loading="lazy" decoding="async">':'<i class="fa-solid fa-user-tie"></i>')+'</div>';
const telHref=p=>'tel:'+String(p).replace(/[^\d+]/g,'');
const teacherLine=(s,c='')=>(s.teacher_name||s.teacher_photo||s.teacher_phone)?'<div class="tch" style="margin:2px 0">'+tav(s.teacher_photo,c||'sm')+'<div><span class="msg">Course teacher</span><b>'+(esc(s.teacher_name)||'—')+'</b>'+(s.teacher_dept?'<span class="msg">'+esc(s.teacher_dept)+'</span>':'')+(s.teacher_phone?'<span class="msg"><i class="fa-solid fa-phone"></i> <a href="'+esc(telHref(s.teacher_phone))+'">'+esc(s.teacher_phone)+'</a></span>':'')+'</div></div>':'';
const fmtD=d=>d?new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'';
const slotTxt=s=>[fmtD(s.date),s.label].filter(Boolean).join(' · ');
/* subject guidelines (written by the admin) */
const glBlocks=s=>(s.guidelines||[]).filter(b=>(b.items||[]).length);
const glBody=s=>'<div class="glb">'+glBlocks(s).map(b=>'<div><h4>'+esc(b.title)+'</h4><ul>'+b.items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>').join('')+'</div>';
const glHTML=(s,open)=>glBlocks(s).length?'<details class="card gl"'+(open?' open':'')+'><summary><i class="fa-solid fa-clipboard-list" style="color:var(--amber)"></i> Guidelines &amp; rules · '+esc(s.name)+'</summary>'+glBody(s)+'</details>':'';
function openModal(html){$('#mbox').innerHTML=html;$('#modal').classList.add('show')}
function closeModal(){$('#modal').classList.remove('show');$('#mbox').innerHTML=''}
$('#modal').addEventListener('mousedown',e=>{if(e.target.id==='modal')closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});

/* ===== Bangladesh time (UTC+6) + live countdown ===== */
let SRV_OFF=0;
const nowMs=()=>Date.now()+SRV_OFF;
const BDZ={timeZone:'Asia/Dhaka'};
const fmtBD=ts=>new Date(ts*1000).toLocaleString('en-GB',{...BDZ,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).replace(/\b[ap]m\b/,m=>m.toUpperCase());
const cdText=sec=>{if(sec<=0)return 'late open';const d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60),s=sec%60,p=n=>String(n).padStart(2,'0');return (d?d+'d ':'')+p(h)+':'+p(m)+':'+p(s)};
const cdHTML=ts=>ts?'<span class="cd" data-cd="'+ts+'"><i class="fa-regular fa-clock"></i><span class="cdl">Deadline in</span> <b class="cdv">'+cdText(Math.ceil(ts-nowMs()/1000))+'</b></span>':'';
const tCd=t=>(t&&t.open&&+t.due_ts>nowMs()/1000)?'<div class="cdb tcd">'+cdHTML(+t.due_ts)+'</div>':'';
const cdBanner=s=>s.late?'<div class="cdb"><span class="latebox"><i class="fa-solid fa-triangle-exclamation"></i> '+esc(s.message)+'</span></div>':s.close_ts?'<div class="cdb">'+cdHTML(s.close_ts)+'<span class="msg">Deadline: '+esc(fmtBD(s.close_ts))+' · Bangladesh Time (UTC+6)</span></div>':'';
function deadlineHit(){
  if(S.view==='home'){studentHome();return}
  toast('The deadline has passed. You can still submit, but it will be marked Late.','err');
}
function tick(){
  const n=nowMs()/1000;let hit=false;
  $$('[data-cd]').forEach(el=>{
    const left=Math.ceil(+el.dataset.cd-n);
    el.querySelector('.cdv').textContent=cdText(left);
    el.classList.toggle('urgent',left>0&&left<3600);
    if(left<=0&&!el.classList.contains('ended')){el.classList.add('ended');el.querySelector('.cdl').textContent='Deadline passed ·';hit=true}
  });
  const c=$('#bdclock');
  if(c)c.innerHTML='<i class="fa-regular fa-clock"></i> Bangladesh Time (UTC+6): '+new Date(nowMs()).toLocaleTimeString('en-GB',{...BDZ,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).toUpperCase();
  if(hit&&location.hash==='#teams-leader'&&L.d)leaderRefresh();
  else if(hit&&!isPanel(location.hash))deadlineHit();
}
setInterval(tick,1000);tick();

/* ================= shared: search bar + filters (Register page, Teams page, Leader profile) ================= */
const uniqF=a=>[...new Set(a.filter(Boolean))];
const swHTML=(id,on,a,b)=>'<button type="button" class="swt'+(on?' on':'')+'" id="'+id+'" role="switch" aria-checked="'+(on?'true':'false')+'" data-a="'+esc(a)+'" data-b="'+esc(b)+'"><span class="swk"></span><span class="swl">'+esc(on?a:b)+'</span></button>';
const swOn=id=>$('#'+id).classList.contains('on');
const swBind=id=>{const e=$('#'+id);e.onclick=()=>{const on=!e.classList.contains('on');e.classList.toggle('on',on);e.setAttribute('aria-checked',on?'true':'false');e.querySelector('.swl').textContent=on?e.dataset.a:e.dataset.b}};
const nq=s=>String(s==null?'':s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const subjHay=s=>nq([s.name,s.subject_name,s.code,semTxt(s),s.semester_term,s.semester_year||'',s.department,progLabel(s.program),s.teacher_name,s.teacher_dept,(s.batches||[]).join(' '),s.team_name,s.ref_code,s.xtra].join(' '));
function subjFilter(list,FL){
  const q=nq(FL.q||'').split(/\s+/).filter(Boolean);
  return list.filter(x=>(!FL.sem||semTxt(x)===FL.sem)&&(!FL.dept||x.department===FL.dept)&&(!FL.prog||x.program===FL.prog)&&(!FL.batch||(x.batches||[]).includes(FL.batch))&&(!q.length||q.every(w=>subjHay(x).includes(w))));
}
/* host: css selector, list: items (subjects / teams), FL: filter state {q,sem,dept,prog,batch}, redraw(): re-render the results only */
function filterBar(host,list,FL,redraw,ph){
  const sel=(id,label,vals,cur)=>vals.length?'<select id="'+id+'" aria-label="'+label+'"><option value="">'+label+'</option>'+vals.map(x=>'<option value="'+esc(x)+'" '+(x===cur?'selected':'')+'>'+esc(/p$/.test(id)?progLabel(x):x)+'</option>').join('')+'</select>':'';
  const sems=uniqF(list.map(semTxt)),depts=uniqF(list.map(x=>x.department)),progs=progOpts3(list.map(x=>x.program)),batches=uniqF(list.flatMap(x=>x.batches||[]));
  const h=$(host);if(!h)return;
  h.className='sbar';
  h.innerHTML='<div class="sq"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="'+host.slice(1)+'q" placeholder="'+esc(ph||'Search subject, course code, department, batch, semester…')+'" value="'+esc(FL.q||'')+'" autocomplete="off" aria-label="Search"><button type="button" class="sqx '+(FL.q?'show':'')+'" aria-label="Clear search"><i class="fa-solid fa-xmark"></i></button></div>'
    +'<div class="sfil">'+sel(host.slice(1)+'s','All semesters',sems,FL.sem)+sel(host.slice(1)+'d','All departments',depts,FL.dept)+sel(host.slice(1)+'p','All programs',progs,FL.prog)+sel(host.slice(1)+'b','All batches',batches,FL.batch)+'</div><span class="sfc" id="'+host.slice(1)+'c"></span>';
  const qi=h.querySelector('input'),x=h.querySelector('.sqx');let tm=0;
  qi.oninput=()=>{FL.q=qi.value;x.classList.toggle('show',!!qi.value);clearTimeout(tm);tm=setTimeout(redraw,120)};
  x.onclick=()=>{qi.value='';FL.q='';x.classList.remove('show');redraw();qi.focus()};
  [['s','sem'],['d','dept'],['p','prog'],['b','batch']].forEach(([c,k])=>{const e=h.querySelector('#'+host.slice(1)+c);if(e)e.onchange=()=>{FL[k]=e.value;redraw()}});
}
const filterCount=(host,n,t)=>{const e=$(host+'c');if(e)e.textContent=n===t?t+' total':n+' of '+t+' shown'};
const teamsTabs=a=>'<div class="ttabs"><a href="#teams" class="'+(a==='all'?'on':'')+'"><i class="fa-solid fa-users"></i> All teams</a><a href="#teams-leader" class="'+(a==='leader'?'on':'')+'"><i class="fa-solid fa-crown"></i> '+(L.d?'My teams (leader)':'Team leader login')+'</a></div>';

/* ================= ROUTER ================= */
const PANELS=['#admin','#teacher','#leader','#teams'];
const isTeamsHash=h=>h==='#teams'||h.startsWith('#teams-');
const isPanel=h=>PANELS.includes(h)||isTeamsHash(h);
function setPnav(nav,active,go,out,who){
  const p=$('#pnav');
  p.innerHTML='<div class="pin">'+(who?'<span class="who"><i class="fa-solid fa-circle-user"></i> '+esc(who)+'</span>':'')
    +nav.map(n=>'<button type="button" data-nav="'+n[0]+'" class="'+(active===n[0]?'on':'')+'"><i class="fa-solid '+n[1]+'"></i><span>'+n[2]+'</span></button>').join('')
    +'<button type="button" class="out" id="lo"><i class="fa-solid fa-right-from-bracket"></i><span>Sign out</span></button></div>';
  p.classList.add('show');document.body.classList.add('panel');
  {let ho=document.getElementById('hdrout');if(!ho){ho=document.createElement('button');ho.type='button';ho.id='hdrout';ho.className='hout';ho.setAttribute('aria-label','Sign out');ho.innerHTML='<i class="fa-solid fa-right-from-bracket"></i><span>Sign out</span>';const sb=document.getElementById('sitebtn');sb.parentNode.insertBefore(ho,sb)}ho.onclick=out}
  const syncHH=()=>{const h=document.querySelector('.top');if(h)document.documentElement.style.setProperty('--hh',h.offsetHeight+'px')};syncHH();if(!window._hhB){window._hhB=1;window.addEventListener('resize',syncHH)}
  $$('#pnav button[data-nav]').forEach(b=>b.onclick=()=>{window.scrollTo(0,0);go(b.dataset.nav)});
  {const on=p.querySelector('button.on'),pin=p.querySelector('.pin');if(on&&pin&&pin.scrollWidth>pin.clientWidth)pin.scrollLeft=Math.max(0,on.offsetLeft-(pin.clientWidth-on.offsetWidth)/2)}
  $('#lo').onclick=out;
}
function clearPnav(){const p=$('#pnav');const ho=document.getElementById('hdrout');if(ho)ho.remove();p.innerHTML='';p.classList.remove('show');document.body.classList.remove('panel');$('#mainnav').classList.remove('open')}
/* site menu (only used while a panel is open) */
$('#sitebtn').onclick=e=>{e.stopPropagation();const n=$('#mainnav'),o=n.classList.toggle('open');$('#sitebtn').setAttribute('aria-expanded',o)};
document.addEventListener('click',e=>{if(!e.target.closest('#mainnav,#sitebtn'))$('#mainnav').classList.remove('open')});
$('#mainnav').addEventListener('click',()=>$('#mainnav').classList.remove('open'));
/* every table becomes a stacked card list on phones (labels come from the header row) */
function mkRT(t){
  if(t.classList.contains('rt')||t.classList.contains('xlt')||t.closest('.xlw')||!t.rows.length)return;   /* v36: Excel-view tables keep their spreadsheet layout on phones (swipe sideways) */
  const hr=t.rows[0];if(!hr.querySelector('th'))return;
  const lb=[...hr.cells].map(c=>c.textContent.trim());hr.classList.add('rt-h');
  [...t.rows].slice(1).forEach(r=>[...r.cells].forEach((c,i)=>{if(c.colSpan>1){r.classList.add('rt-e');return}c.setAttribute('data-label',lb[i]||'')}));
  t.classList.add('rt');
}
new MutationObserver(()=>document.querySelectorAll('table:not(.rt)').forEach(mkRT)).observe(document.body,{childList:true,subtree:true});
/* show / hide button on every password box (also in popups) */
const EYE=o=>'<i class="fa-regular fa-eye'+(o?'-slash':'')+'"></i>';
function addEyes(){
  document.querySelectorAll('input[type=password]:not([data-eye])').forEach(i=>{
    i.dataset.eye='1';
    const w=document.createElement('span');w.className='pw';
    i.parentNode.insertBefore(w,i);w.appendChild(i);
    const b=document.createElement('button');b.type='button';b.className='pwe';b.setAttribute('aria-label','Show password');b.title='Show / hide password';b.innerHTML=EYE(0);
    b.onclick=e=>{e.preventDefault();e.stopPropagation();const hide=i.type==='password';i.type=hide?'text':'password';b.innerHTML=EYE(hide);b.setAttribute('aria-label',hide?'Hide password':'Show password')};
    w.appendChild(b);
  });
}
new MutationObserver(addEyes).observe(document.body,{childList:true,subtree:true});
/* password cell in the admin Teachers list: visible, with hide + copy */
const pwCell=p=>p?'<span class="pwv"><code class="pwt" data-pw="'+esc(p)+'" data-show="1">'+esc(p)+'</code><button type="button" class="pwm" data-pwt aria-label="Hide password" title="Hide / show">'+EYE(1)+'</button><button type="button" class="pwm" data-pwc aria-label="Copy password" title="Copy"><i class="fa-regular fa-copy"></i></button></span>':'<span class="msg">Not known yet — appears after the teacher signs in once, or set a new one with Edit.</span>';
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-pwt]'),c=e.target.closest('[data-pwc]');
  if(t){const s=t.parentElement.querySelector('.pwt'),show=s.dataset.show!=='1';s.dataset.show=show?'1':'0';s.textContent=show?s.dataset.pw:'••••••••';t.innerHTML=EYE(show)}
  if(c){const s=c.parentElement.querySelector('.pwt');(navigator.clipboard?navigator.clipboard.writeText(s.dataset.pw):Promise.reject()).then(()=>toast('Password copied.')).catch(()=>toast('Could not copy. Select it and copy manually.','err'))}
});
(()=>{const t=$('#totop');let tk=0;
  window.addEventListener('scroll',()=>{if(tk)return;tk=requestAnimationFrame(()=>{tk=0;t.classList.toggle('show',window.scrollY>500)})},{passive:true});
  t.onclick=()=>window.scrollTo({top:0,behavior:'smooth'})})();
async function doLogout(){if(A.role==='leader')L.d=null;resetAcct();try{const r=await api('logout',{json:{}});CSRF=r.csrf;$('meta[name=csrf]').content=CSRF}catch(e){}authView()}
function route(){
  const h=location.hash;
  if(h==='#leader'){location.replace('#teams-leader');return}   /* old link: team leader login now lives on the Teams page */
  if(h==='#submit'){location.replace('#assignment');return}   /* old link */
  clearTimeout(HUBT);chStop();setNav();document.body.classList.remove('chatfull');
  window.scrollTo(0,0);closeModal();clearPnav();
  h==='#admin'?adminInit():h==='#teacher'?teacherInit():h==='#assignment'?taskPage('assignment'):h==='#lab'?taskPage('lab'):h==='#presentation'?studentHome():(h==='#people'||h.startsWith('#people-'))?peoplePage(h==='#people'?0:(+h.slice(8)||0)):h==='#teams-leader'?leaderInit():h==='#chat'?chatPage():h==='#reviews'?fbPage():isTeamsHash(h)?teamsPage(h.startsWith('#teams-')?+h.slice(7):0):homeHub();
}
function setNav(){
  const h=location.hash;
  $('#nav-th').classList.toggle('on',h==='#teacher');$('#nav-t').classList.toggle('on',isTeamsHash(h));
  $('#nav-pe').classList.toggle('on',h==='#people'||h.startsWith('#people-'));
  $('#nav-c').classList.toggle('on',h==='#chat');
  $('#nav-s').classList.toggle('on',!isPanel(h)&&h!=='#chat'&&h!=='#reviews'&&h!=='#people'&&!h.startsWith('#people-'));
}
window.addEventListener('hashchange',route);

/* ================= v10 shared: subject info, presentation upload + presenter ================= */
let OPTS={terms:['Autumn','Spring','Summer'],depts:[],programs:[],pres_max_mb:20};
const semTxt=s=>s.semester_term?(s.semester_term+(+s.semester_year?' '+s.semester_year:'')):'';
const metaChips=s=>[[semTxt(s),'fa-calendar-days'],[s.department,'fa-building-columns'],[progLabel(s.program),'fa-graduation-cap']].filter(x=>x[0]).map(x=>'<span class="chip meta"><i class="fa-solid '+x[1]+'"></i> '+esc(x[0])+'</span>').join('');
const fmtSize=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
const PRES_VIEW=['pdf','ppt','pptx'],PRES_BAD=['php','php3','php4','php5','php7','php8','phtml','phar','pht','phps','exe','bat','cmd','com','msi','dll','scr','sh','cgi','pl','py','js','vbs','jar','html','htm','xhtml','svg','htaccess'];
const presIcon=k=>({pdf:'fa-file-pdf',ppt:'fa-file-powerpoint',pptx:'fa-file-powerpoint',odp:'fa-file-powerpoint',key:'fa-file-powerpoint',doc:'fa-file-word',docx:'fa-file-word',xls:'fa-file-excel',xlsx:'fa-file-excel',csv:'fa-file-csv',zip:'fa-file-zipper',rar:'fa-file-zipper','7z':'fa-file-zipper',jpg:'fa-file-image',jpeg:'fa-file-image',png:'fa-file-image',gif:'fa-file-image',webp:'fa-file-image',mp4:'fa-file-video',mov:'fa-file-video',webm:'fa-file-video',avi:'fa-file-video',mkv:'fa-file-video',txt:'fa-file-lines',md:'fa-file-lines'})[String(k).toLowerCase()]||'fa-file';
const presFile=p=>'<div class="pfile"><i class="fa-solid '+presIcon(p.kind)+'"></i><div><b>'+esc(p.name)+'</b><span class="msg">'+esc(String(p.kind).toUpperCase())+' · '+fmtSize(p.size)+' · uploaded '+esc((p.updated_at||'').slice(0,16))+' (UTC)</span></div></div>';
function presCheck(f,mx){
  if(!f)return 'Choose a file first.';
  const ex=(f.name.split('.').length>1?f.name.split('.').pop():'').toLowerCase();
  if(!/^[a-z0-9]{1,8}$/.test(ex))return 'The file needs a normal extension (for example .pdf, .pptx, .docx, .zip).';
  if(PRES_BAD.includes(ex))return 'For safety, .'+ex+' files are not allowed. Zip it or use another file type.';
  if(f.size>mx*1048576)return 'The file must be '+mx+' MB or smaller.';
  return '';
}
async function presDownload(rid){
  try{const d=await api('pres_link',{q:{rid,dl:1}});location.href=d.url}catch(e){toast(e.message,'err')}
}
function loadPdfJs(){
  if(window.pdfjsLib)return Promise.resolve();
  return new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload=()=>{try{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';ok()}catch(e){no(e)}};
    s.onerror=()=>no(new Error('pdf.js could not be loaded'));document.head.append(s)});
}
function closePresenter(){
  if(!PV)return;
  document.removeEventListener('keydown',PV.key);window.removeEventListener('resize',PV.rs);
  if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});
  PV.el.remove();document.body.classList.remove('pvopen');PV=null;
}
let PV=null;
async function openPresenter(rid,title){
  let r;
  try{r=await api('pres_link',{q:{rid}})}catch(e){toast(e.message,'err');return}
  if(!PRES_VIEW.includes(r.kind)){if(r.can_download)presDownload(rid);else toast('This file type cannot be previewed.','err');return}
  closePresenter();
  const o=document.createElement('div');o.className='pv';
  const isPdf=r.kind==='pdf';
  o.innerHTML='<div class="pvbar"><b class="pvt">'+esc(title||r.name)+'</b><span class="pvpg" id="pvpg"></span>'
    +(isPdf?'<button class="pvb" id="pvprev" title="Previous (←)"><i class="fa-solid fa-chevron-left"></i></button><button class="pvb" id="pvnext" title="Next (→ / Space)"><i class="fa-solid fa-chevron-right"></i></button>':'')
    +'<button class="pvb" id="pvfs" title="Fullscreen (F)"><i class="fa-solid fa-expand"></i></button>'
    +(r.can_download?'<button class="pvb" id="pvdl" title="Download"><i class="fa-solid fa-download"></i></button>':'')
    +'<button class="pvb" id="pvx" title="Close (Esc)"><i class="fa-solid fa-xmark"></i></button></div><div class="pvstage" id="pvstage"></div>';
  document.body.append(o);document.body.classList.add('pvopen');
  const stage=o.querySelector('#pvstage'),q=s=>o.querySelector(s);
  let go=()=>{},redraw=()=>{};
  PV={el:o,key:null,rs:null};
  PV.key=e=>{
    if(e.key==='Escape'){if(!document.fullscreenElement)closePresenter();return}
    if(e.key==='f'||e.key==='F'){fs();return}
    if(['ArrowRight','ArrowDown','PageDown',' ','Enter'].includes(e.key)){e.preventDefault();go(1)}
    else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].includes(e.key)){e.preventDefault();go(-1)}
    else if(e.key==='Home')go(-9999);else if(e.key==='End')go(9999);
  };
  PV.rs=()=>redraw();
  const fs=()=>{if(document.fullscreenElement)document.exitFullscreen();else if(o.requestFullscreen)o.requestFullscreen().catch(()=>{})};
  document.addEventListener('keydown',PV.key);window.addEventListener('resize',PV.rs);
  q('#pvx').onclick=closePresenter;q('#pvfs').onclick=fs;
  if(q('#pvdl'))q('#pvdl').onclick=()=>presDownload(rid);
  document.addEventListener('fullscreenchange',()=>{if(PV)setTimeout(()=>redraw(),150)});
  const abs=new URL(r.url,location.href).href;
  const nativeFrame=()=>{stage.style.cursor='auto';stage.innerHTML='<iframe src="'+esc(abs)+'" title="Presentation"></iframe>'};
  if(isPdf){
    stage.innerHTML='<div class="pvmsg"><i class="fa-solid fa-spinner fa-spin"></i>Loading presentation…</div>';
    try{
      await loadPdfJs();
      const buf=await (await fetch(abs,{credentials:'same-origin'})).arrayBuffer();
      const doc=await pdfjsLib.getDocument({data:buf}).promise;
      let n=1,busyR=false,again=false;
      stage.innerHTML='';const cv=document.createElement('canvas');cv.className='pvcv';stage.append(cv);
      const draw=async()=>{
        if(busyR){again=true;return}busyR=true;
        try{
          const pg=await doc.getPage(n),v0=pg.getViewport({scale:1}),dpr=window.devicePixelRatio||1;
          const sc=Math.min(stage.clientWidth/v0.width,stage.clientHeight/v0.height),vp=pg.getViewport({scale:sc*dpr});
          cv.width=vp.width;cv.height=vp.height;cv.style.width=Math.floor(vp.width/dpr)+'px';cv.style.height=Math.floor(vp.height/dpr)+'px';
          await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
          q('#pvpg').textContent=n+' / '+doc.numPages;
        }catch(e){}
        busyR=false;if(again){again=false;draw()}
      };
      go=d=>{const m=Math.min(doc.numPages,Math.max(1,n+d));if(m!==n){n=m;draw()}};
      redraw=draw;
      q('#pvprev').onclick=e=>{e.stopPropagation();go(-1)};q('#pvnext').onclick=e=>{e.stopPropagation();go(1)};
      stage.onclick=e=>{const b=stage.getBoundingClientRect();go(e.clientX-b.left>b.width/2?1:-1)};
      let sx=null;stage.addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});
      stage.addEventListener('touchend',e=>{if(sx===null)return;const dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)>50){e.preventDefault();go(dx<0?1:-1)}});
      draw();
    }catch(e){nativeFrame()}
  }else{
    const local=/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname)||location.hostname.endsWith('.local');
    stage.style.cursor='auto';
    if(local||location.protocol!=='https:'&&location.protocol!=='http:'){
      stage.innerHTML='<div class="pvmsg"><i class="fa-solid fa-triangle-exclamation"></i><b>PowerPoint preview needs a public website.</b><br>This site is running locally, so Microsoft Office Online cannot reach the file. '+(r.can_download?'Download it and present from PowerPoint, or':'Please')+' upload a <b>PDF</b> version for in-browser presenting.</div>';
    }else{
      stage.innerHTML='<iframe src="https://view.officeapps.live.com/op/embed.aspx?src='+encodeURIComponent(abs)+'" title="Presentation" allowfullscreen></iframe>';
      q('#pvpg').textContent='PowerPoint';
    }
  }
}
/* upload / replace / delete panel shared by admin, teacher and team leader. ctx: {rid, pres, mx, onChange(newPres)} */
function presPanelHTML(c){
  const p=c.pres;
  return '<div class="card pad prp" style="margin-top:16px"><h4><i class="fa-solid fa-display"></i> Presentation file</h4>'
    +(p?presFile(p)+'<div class="acts" style="margin:6px 0 10px">'+(PRES_VIEW.includes(p.kind)?'<button class="btn sm" id="pp-v"><i class="fa-solid fa-display"></i> Present</button>':'')+'<button class="btn sm sec" id="pp-d"><i class="fa-solid fa-download"></i> Download</button><button class="btn sm dng" id="pp-x"><i class="fa-solid fa-trash"></i> Delete</button></div>':'<p class="msg" style="margin:4px 0 10px">No presentation uploaded yet.</p>')
    +'<div class="pbox"><label class="f" style="flex:1 1 220px">'+(p?'Replace file':'Upload file')+' <small>Any file (PDF, PowerPoint, Word, ZIP …) · max '+c.mx+' MB · PDF / PowerPoint can be presented full-screen</small><input type="file" id="pp-f"></label><button class="btn sm" id="pp-u"><i class="fa-solid fa-upload"></i> '+(p?'Replace':'Upload')+'</button></div><div id="pp-e"></div></div>';
}
function wirePres(c){
  const err=m=>{const e=document.getElementById('pp-e');if(e)e.innerHTML=m?'<div class="err" style="margin:10px 0 0">'+esc(m)+'</div>':''};
  const v=document.getElementById('pp-v');if(v)v.onclick=()=>openPresenter(c.rid,c.title);
  const d=document.getElementById('pp-d');if(d)d.onclick=()=>presDownload(c.rid);
  const x=document.getElementById('pp-x');if(x)x.onclick=async()=>{
    if(!confirm('Delete this presentation file?'))return;
    try{await api('pres_delete',{json:{rid:c.rid}});toast('Presentation deleted.');c.onChange(null)}catch(e){c.fail(e,err)}};
  const up=document.getElementById('pp-u');if(!up)return;
  up.onclick=async()=>{
    const f=document.getElementById('pp-f').files[0],m=presCheck(f,c.mx);if(m){err(m);return}
    const fd=new FormData();fd.append('rid',c.rid);fd.append('pres',f);
    const b=document.getElementById('pp-u');b.disabled=true;
    try{const r=await api('pres_upload',{form:fd});toast('Presentation uploaded.');c.onChange(r.pres)}
    catch(e){b.disabled=false;c.fail(e,err)}
  };
}

/* ================= STUDENT ================= */
const S={subjects:[],subject:null,type:null,view:''};
const stepsHTML=n=>'<div class="steps">'+['Subject','Type','Details','Done'].map((t,i)=>'<span class="'+(i+1<n?'done':i+1===n?'on':'')+'"><i class="fa-solid '+(i+1<n?'fa-check':'fa-circle')+'" style="font-size:.7rem"></i>'+t+'</span>').join('')+'</div>';

const WEEK=7*86400;
const isPrev=(ts,now)=>ts&&now-ts>WEEK;   /* deadline ended more than 1 week ago */
const prevHead=(n,what)=>'<div class="prevhead"><i class="fa-solid fa-clock-rotate-left"></i><div><h3>Previous '+what+'</h3><p class="msg" style="margin:0">Deadline ended more than 1 week ago · '+n+' item'+(n===1?'':'s')+'</p></div></div>';
async function studentHome(){
  if(location.hash!=='#presentation'){history.replaceState(null,'','#presentation');setNav()}
  $('#app').innerHTML='<div class="wrap">'+stepsHTML(1)+'<p class="crumb"><a href="#"><i class="fa-solid fa-house"></i> Home</a> › Presentation</p><div class="hero"><h1>Which subject’s presentation slot would you like to register for?</h1><p class="hm">Pick a subject below. Each subject has its own registration dates, slots and team rules.</p></div><div id="sg" class="grid"></div><div id="sgp"></div></div>';
  S.view='home';
  try{const r0=await api('subjects');S.subjects=r0.subjects;if(r0.options)OPTS=Object.assign(OPTS,r0.options);SRV_OFF=r0.server_now*1000-Date.now()}catch(e){$('#sg').innerHTML='<div class="err">'+esc(e.message)+'</div>';return}
  if(!S.subjects.length){$('#sg').innerHTML='<div class="card empty" style="grid-column:1/-1"><i class="fa-regular fa-folder-open" style="font-size:2rem"></i><p>No subjects are available yet. Please check back soon.</p></div>';return}
  const FL=S.fl||(S.fl={q:'',sem:'',dept:'',prog:'',batch:''});
  $('#sg').insertAdjacentHTML('beforebegin','<div id="sfb"></div>');
  const drawSubs=()=>{
  const list=subjFilter(S.subjects,FL);filterCount('#sfb',list.length,S.subjects.length);
  if(!list.length){$('#sg').innerHTML='<div class="card empty" style="grid-column:1/-1"><i class="fa-regular fa-folder-open" style="font-size:2rem"></i><p>No subjects match your search or filters.</p></div>';$('#sgp').innerHTML='';return}
  const nowS=nowMs()/1000,cur=list.filter(s=>!isPrev(s.close_ts,nowS)),prev=list.filter(s=>isPrev(s.close_ts,nowS));
  const card=s=>{
    const left=s.slots.reduce((a,x)=>a+x.left,0);
    return '<div class="card sub '+s.state+'"><div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><h3>'+esc(s.name)+(s.code?' <span class="scode">'+esc(s.code)+'</span>':'')+'</h3><span class="badge b-'+s.state+'">'+(s.late?'Open · Late':({open:'Open',closed:'Closed',soon:'Not open yet',full:'Full'})[s.state])+'</span></div>'
    +teacherLine(s)+'<div class="chips">'+metaChips(s)+(s.allow_individual?'<span class="chip"><i class="fa-solid fa-user"></i> Individual</span>':'')+(s.allow_team?'<span class="chip"><i class="fa-solid fa-users"></i> Team '+s.min_team+'–'+s.max_team+'</span>':'')+(s.slots.length?'<span class="chip"><i class="fa-regular fa-calendar"></i> '+left+' slot'+(left===1?'':'s')+' left</span>':'')+'</div>'
    +(s.late?'<p class="msg latebox"><i class="fa-solid fa-triangle-exclamation"></i> '+esc(s.message)+'</p>':s.state==='open'?(s.close_ts?'<p class="msg"><i class="fa-regular fa-calendar-xmark"></i> Deadline: '+esc(fmtBD(s.close_ts))+' · Bangladesh Time (UTC+6)</p>'+cdHTML(s.close_ts):'<p class="msg">Registration is open.</p>'):'<p class="msg">'+esc(s.message)+'</p>')
    +(glBlocks(s).length?'<button class="btn sec sm" data-g="'+s.id+'"><i class="fa-solid fa-clipboard-list"></i> Guidelines &amp; rules</button>':'')
    +'<button class="btn" data-id="'+s.id+'" '+(s.state==='open'?'':'disabled')+'>'+(s.state==='open'?(s.late?'Register late':'Register for this subject'):'Registration unavailable')+'</button></div>'};
  $('#sg').innerHTML=cur.length?cur.map(card).join(''):'<div class="card empty" style="grid-column:1/-1"><i class="fa-regular fa-folder-open" style="font-size:2rem"></i><p>No current presentation registrations.</p></div>';
  $('#sgp').innerHTML=prev.length?'<div class="prevbox">'+prevHead(prev.length,'presentations')+'<div class="grid">'+prev.map(card).join('')+'</div></div>':'';
  $$('#sg button[data-g],#sgp button[data-g]').forEach(b=>b.onclick=()=>{const s=S.subjects.find(x=>x.id==b.dataset.g);openModal('<div class="mt"><h3><i class="fa-solid fa-clipboard-list" style="color:var(--amber)"></i> '+esc(s.name)+' · Guidelines</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>'+glBody(s))});
  $$('#sg button[data-id],#sgp button[data-id]').forEach(b=>b.onclick=()=>{S.subject=S.subjects.find(x=>x.id==b.dataset.id);chooseType()});
  };filterBar('#sfb',S.subjects,FL,drawSubs,'Search subject, course code, department, batch or semester…');drawSubs();
}
function chooseType(){
  const s=S.subject;S.view='type';
  $('#app').innerHTML='<div class="wrap">'+stepsHTML(2)+'<h2 style="font-size:1.8rem;margin-bottom:6px">How would you like to register?</h2><p class="msg" style="margin-bottom:20px">Subject: <b>'+esc(s.name)+'</b></p>'+teacherLine(s,'')+cdBanner(s)+glHTML(s,true)+'<div class="choice" style="margin-top:16px">'
  +'<button class="opt" id="o-i" '+(s.allow_individual?'':'disabled')+'><i class="fa-solid fa-user"></i><h3>Individual registration</h3><p>'+(s.allow_individual?'Present on your own.':'Not available for this subject.')+'</p></button>'
  +'<button class="opt" id="o-t" '+(s.allow_team?'':'disabled')+'><i class="fa-solid fa-users"></i><h3>Team registration</h3><p>'+(s.allow_team?'Register '+s.min_team+' to '+s.max_team+' members together.':'Not available for this subject.')+'</p></button></div>'
  +'<div class="acts"><button class="btn sec" id="back"><i class="fa-solid fa-arrow-left"></i> Change subject</button></div></div>';
  $('#back').onclick=studentHome;
  $('#o-i').onclick=()=>{S.type='individual';regForm()};$('#o-t').onclick=()=>{S.type='team';regForm()};
}
const slotSel=s=>s.slots.length?'<label class="f"><span class="req">Presentation slot</span><select id="slot"><option value="">Select a slot…</option>'+s.slots.map(x=>'<option value="'+x.id+'" '+(x.left<=0?'disabled':'')+'>'+esc(slotTxt(x))+(x.left<=0?' (full)':' ('+x.left+' left)')+'</option>').join('')+'</select></label>':'';
const ctl=(f,v)=>{
  if(f.key==='batch'&&f.type!=='select'&&f.type!=='photo')return '<input class="dyn" data-k="batch" data-num="1" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="e.g. 32" value="'+esc(batchNum(v))+'">';
  if(f.type==='select')return '<select class="dyn" data-k="'+esc(f.key)+'"><option value="">Select…</option>'+(f.opts||[]).map(o=>'<option '+(o===v||(!v&&(f.opts||[]).length===1)?'selected':'')+'>'+esc(o)+'</option>').join('')+'</select>';
  if(f.type==='photo')return '<input type="file" class="m-photo" data-mb="'+(f.mb||2)+'" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp">';
  return '<input class="dyn" data-k="'+esc(f.key)+'" type="'+({number:'number',tel:'tel',email:'email',date:'date'}[f.type]||'text')+'" maxlength="'+(f.max||200)+'" value="'+esc(v||'')+'"'+(f.type==='number'?' step="any"':'')+'>';
};
const fieldLabel=f=>{const must=f.req==='yes',ld=f.req==='leader';return '<span'+(must?' class="req"':'')+(ld?' data-rl="1"':'')+'>'+esc(f.label)+'</span>'+(must?'':'<small'+(ld?' data-rs="1"':'')+'>'+(ld?'Required for team leader':'Optional')+'</small>')};
const identOf=(s,v)=>{const nf=s.fields.find(f=>f.role==='name'),idf=s.fields.find(f=>f.role==='id');return{name:(nf&&v[nf.key])||Object.values(v).find(x=>x)||'—',uid:(idf&&v[idf.key])||''}};
const readCard=(c,fields)=>{const v={};fields.forEach(f=>{if(f.type==='photo')return;const el=c.querySelector('.dyn[data-k="'+f.key+'"]');v[f.key]=el?el.value.trim():''});return v};
/* OPTIONAL presentation upload inside the registration form (shown only while upload is open for the subject) */
function regPresHTML(s){
  if(!s.pres_open)return '';
  return '<h3 style="margin-top:26px;font-size:1.1rem"><i class="fa-solid fa-display" style="color:var(--amber)"></i> Presentation file <span class="msg">(optional)</span></h3>'
    +'<p class="msg">You can attach your presentation now, or skip this and upload it later from your panel'+(s.pres_close_ts?' (please upload by '+esc(fmtBD(s.pres_close_ts))+' · Bangladesh Time)':'')+'.</p>'
    +'<div class="pbox"><label class="f" style="flex:1 1 220px">Presentation file <small>Any file (PDF, PowerPoint, Word, ZIP …) · max '+(s.pres_max_mb||OPTS.pres_max_mb||20)+' MB</small><input type="file" id="rpres"></label><button type="button" class="btn sm sec" id="rpres-x" style="display:none"><i class="fa-solid fa-xmark"></i> Remove</button></div><div id="rpres-e"></div>';
}
function regForm(){
  const s=S.subject,team=S.type==='team';S.view='form';
  S.F=team?s.fields:s.fields.map(f=>f.req==='leader'?Object.assign({},f,{req:'yes'}):f);
  let h='<div class="wrap">'+stepsHTML(3)+'<div class="card pad form"><h2 style="font-size:1.6rem">'+(team?'Team':'Individual')+' registration</h2><p class="msg" style="margin:4px 0 18px">Subject: <b>'+esc(s.name)+'</b></p>'+(teacherLine(s)?'<div style="margin:-6px 0 16px">'+teacherLine(s)+'</div>':'')+cdBanner(s)+glHTML(s,false)+'<div id="ferr"></div>';
  if(!team){
    h+='<div class="fg"><label class="f"><span>Presentation topic name <small>(optional)</small></span><input type="text" id="ttp" maxlength="200" placeholder="e.g. Smart attendance system"></label>'+slotSel(s)+'</div><div id="mem"></div>';
  }else{
    h+='<div class="fg"><label class="f"><span class="req">Team name</span><input type="text" id="tn" maxlength="60"></label><label class="f"><span>Presentation topic name <small>(optional)</small></span><input type="text" id="ttp" maxlength="200" placeholder="e.g. Smart attendance system"></label>'+slotSel(s)+'</div>'
    +'<div class="lsum"><i class="fa-solid fa-crown" style="color:var(--amber)"></i><span id="lsum">Team leader: —</span></div>'
    +'<h3 style="margin-top:22px;font-size:1.1rem">Team members <span class="msg" id="cnt"></span></h3><p class="msg">Choose one leader. Allowed team size: '+s.min_team+'–'+s.max_team+'.</p><div id="mem"></div>'
    +'<div class="acts" style="margin-top:14px"><button class="btn sec" id="addm"><i class="fa-solid fa-user-plus"></i> Add member</button></div>';
  }
  h+='<h3 style="margin-top:26px;font-size:1.1rem"><i class="fa-solid fa-key" style="color:var(--amber)"></i> '+(team?'Team leader login':'Your login')+'</h3>'
    +'<div class="fg"><label class="f" style="grid-column:1/-1"><span class="req">Gmail or mobile number</span><input type="text" id="tle" maxlength="100" autocomplete="username" placeholder="Enter your Gmail or mobile number"></label></div>'
    +regPresHTML(s);
  h+='<div class="acts"><button class="btn" id="go"><i class="fa-solid fa-paper-plane"></i> Submit registration</button><button class="btn sec" id="back"><i class="fa-solid fa-arrow-left"></i> Back</button></div></div></div>';
  $('#app').innerHTML=h;
  $('#back').onclick=chooseType;
  const rp=$('#rpres'),rpx=$('#rpres-x');
  if(rp){
    rp.onchange=()=>{const f=rp.files[0],m=f?presCheck(f,s.pres_max_mb||OPTS.pres_max_mb||20):'';
      $('#rpres-e').innerHTML=m?'<div class="err" style="margin:8px 0 0">'+esc(m)+'</div>':'';
      if(m)rp.value='';rpx.style.display=rp.files[0]?'':'none'};
    rpx.onclick=()=>{rp.value='';rpx.style.display='none';$('#rpres-e').innerHTML=''};
  }
  if(!team)$('#mem').append(memCard(true));
  else{for(let i=0;i<s.min_team;i++)addMember();$('#addm').onclick=addMember}
  $('#go').onclick=submitReg;
}
/* ---- passwords: a single box (no confirm) + "Suggest a password": random, easy to remember (Colour + Thing + 2 digits) ---- */
function pwRandom(){
  const A=['Blue','Green','Red','Sunny','Happy','Quick','Brave','Calm','Bright','Lucky','Cool','Swift'],
        B=['Tiger','River','Moon','Star','Cloud','Lion','Rose','Bird','Tree','Ocean','Eagle','Garden'];
  const r=n=>{const u=new Uint32Array(1);(window.crypto||window.msCrypto).getRandomValues(u);return u[0]%n};
  return A[r(A.length)]+B[r(B.length)]+(10+r(90))+(r(3)===0?'!':'');
}
/* name + random digits, e.g. Rahim4837 / Rahim@529 (falls back to a random easy word when no name is typed yet) */
function pwFromName(src){
  let w=String(src||'').trim();if(w.indexOf('@')>0)w=w.split('@')[0];
  w=w.replace(/^(dr|md|mr|mrs|ms|mst|prof)\.?\s+/i,'').trim().split(/\s+/)[0].replace(/[^A-Za-z]/g,'');
  if(w.length<3)return pwRandom();
  w=w.charAt(0).toUpperCase()+w.slice(1,12).toLowerCase();
  const r=n=>{const u=new Uint32Array(1);(window.crypto||window.msCrypto).getRandomValues(u);return u[0]%n};
  const dg=k=>{let x='';for(let j=0;j<k;j++)x+=(j?r(10):1+r(9));return x};
  let o=[w+dg(4),w+'@'+dg(3),w+'#'+dg(4),w+'_'+dg(4)][r(4)];
  while(o.length<8)o+=dg(1);
  return o;
}
function pwSuggestBtn(inp,get){
  if(!inp||inp.dataset.sg)return;inp.dataset.sg='1';
  const row=document.createElement('div');row.style.cssText='grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:-4px';
  row.innerHTML='<button type="button" class="btn sm sec" data-sg><i class="fa-solid fa-wand-magic-sparkles"></i> Suggest a password</button><button type="button" class="btn sm sec" data-sh><i class="fa-solid fa-eye"></i> Show</button>';
  (inp.closest('label')||inp).after(row);
  let i=0;const sh=row.querySelector('[data-sh]');
  const paint=()=>{sh.innerHTML=inp.type==='password'?'<i class="fa-solid fa-eye"></i> Show':'<i class="fa-solid fa-eye-slash"></i> Hide'};
  sh.onclick=()=>{inp.type=inp.type==='password'?'text':'password';paint()};
  row.querySelector('[data-sg]').onclick=()=>{
    const g=get()||{};inp.value=pwFromName(g.name||g.email);inp.type='text';paint();inp.focus();
    toast('Suggested: '+inp.value+' · note it down. Tap again for another.');
  };
}

/* ================= v12 assignments & lab reports ================= */
const KIND={assignment:'Assignment',lab:'Lab report'},MODE={individual:'Individual only',team:'Team only',both:'Individual or team'};
const fsz=b=>b>1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';
const PGT={assignment:['Assignments','fa-file-lines','Submit your assignment — alone or as a team.'],lab:['Lab reports','fa-flask','Submit your lab report — alone or as a team.']};
async function taskPage(kind){
  $('#app').innerHTML='<div class="wrap"><div class="card pad" style="text-align:center">Loading…</div></div>';
  let r;try{r=await api('tasks_public')}catch(e){$('#app').innerHTML='<div class="wrap"><div class="err">'+esc(e.message)+'</div></div>';return}
  SRV_OFF=r.server_now*1000-Date.now();const nowS=nowMs()/1000,pg=PGT[kind];
  const all=r.tasks.filter(t=>t.kind===kind),cur=all.filter(t=>!isPrev(t.due_ts,nowS)),prev=all.filter(t=>isPrev(t.due_ts,nowS));
  const group=l=>{const by={};l.forEach(t=>{const k=t.subject+(t.batch_lock?' · Batch '+t.batch_lock:'');(by[k]=by[k]||[]).push(t)});return by};
  const tcard=t=>'<div class="card pad"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="badge b-'+(t.kind==='lab'?'pending':'approved')+'">'+KIND[t.kind]+'</span><span class="msg" style="margin:0">'+MODE[t.mode]+'</span></div><h3 style="margin:10px 0 4px">'+esc(t.title)+'</h3>'+(t.details?'<p class="msg" style="white-space:pre-line">'+esc(t.details)+'</p>':'')+'<p class="msg'+(t.late?' latebox':'')+'"><i class="fa-regular fa-clock"></i> '+esc(t.msg)+'</p>'+tCd(t)+'<button class="btn" data-sb="'+t.id+'" '+(t.open?'':'disabled')+'><i class="fa-solid fa-file-arrow-up"></i> '+(t.open?(t.late?'Submit late':'Submit'):'Closed')+'</button></div>';
  const sect=l=>{const by=group(l);return Object.keys(by).map(k=>'<h3 style="margin:22px 0 10px"><i class="fa-solid fa-book-open" style="color:var(--teal)"></i> '+esc(k)+'</h3><div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr))">'+by[k].map(tcard).join('')+'</div>').join('')};
  $('#app').innerHTML='<div class="wrap"><p class="crumb"><a href="#"><i class="fa-solid fa-house"></i> Home</a> › '+pg[0]+'</p><div class="hero"><h1 style="margin:0 0 6px"><i class="fa-solid '+pg[1]+'"></i> '+pg[0]+'</h1><p style="margin:0;opacity:.9">'+pg[2]+'</p></div>'
   +(cur.length?sect(cur):'<div class="card pad" style="margin-top:20px;text-align:center">No current '+pg[0].toLowerCase()+' right now.</div>')
   +(prev.length?'<div class="prevbox">'+prevHead(prev.length,pg[0].toLowerCase())+sect(prev)+'</div>':'')+'</div>';
  $$('[data-sb]').forEach(b=>b.onclick=()=>submitForm(r.tasks.find(x=>x.id==b.dataset.sb),r.exts));
}
/* ================= People: teachers & student creators (CR) ================= */
const PE={q:'',t:'all'};
const peKind=p=>p.acct_type==='cr'?'cr':'teacher';
const peBadge=p=>peKind(p)==='cr'?'<span class="badge b-pending"><i class="fa-solid fa-user-graduate"></i> Student creator'+(p.batch?' · Batch '+esc(p.batch):'')+'</span>':'<span class="badge b-approved"><i class="fa-solid fa-chalkboard-user"></i> Teacher</span>';
const peIni=n=>{const w=String(n||'').replace(/^(dr|prof|professor|mr|mrs|ms|md|engr)\.?\s+/i,'').replace(/[^\p{L}\p{N}\s]/gu,'').trim().split(/\s+/).filter(Boolean);return w.length?((w[0][0]||'')+(w.length>1?w[w.length-1][0]:'')).toUpperCase():'?'};
const peAv=(p,c='')=>{const k=peKind(p)==='cr'?'k-c':'k-t',ini=esc(peIni(p.name));return '<div class="av tav '+c+' '+k+(p.photo?'':' noimg')+'">'+(p.photo?'<img src="'+esc(p.photo)+'" alt="'+esc(p.name)+'" loading="lazy" decoding="async" onerror="this.parentNode.classList.add(\'noimg\');this.outerHTML=\'<span class=ini>'+ini+'</span>\'">':'<span class="ini">'+ini+'</span>')+'</div>'};
const peContact=p=>(p.phone?'<a class="pe-c" href="'+esc(telHref(p.phone))+'" onclick="event.stopPropagation()"><i class="fa-solid fa-phone"></i> '+esc(p.phone)+'</a>':'')+(p.email?'<a class="pe-c" href="mailto:'+esc(p.email)+'" onclick="event.stopPropagation()"><i class="fa-solid fa-envelope"></i> '+esc(p.email)+'</a>':'');
const peopleHubCard=()=>'<div class="card pad hubc" data-k="people"><a class="hubt" href="#people"><span class="hico"><i class="fa-solid fa-id-card big"></i></span><h3>Teachers &amp; creators</h3></a><p class="msg">Browse teacher and creator profiles, and register or submit from their page.</p><a class="btn sm" href="#people">Open <i class="fa-solid fa-arrow-right"></i></a></div>';
async function peopleData(){
  const [a,b,c]=await Promise.all([api('people_public'),api('subjects'),api('tasks_public')]);
  SRV_OFF=b.server_now*1000-Date.now();if(b.options)OPTS=Object.assign(OPTS,b.options);
  S.subjects=b.subjects;
  return{people:a.people,subjects:b.subjects,tasks:c.tasks,exts:c.exts};
}
async function peoplePage(id){
  S.view='people';
  $('#app').innerHTML='<div class="wrap"><div class="card pad" style="text-align:center">Loading…</div></div>';
  let D;try{D=await peopleData()}catch(e){$('#app').innerHTML='<div class="wrap"><div class="err">'+esc(e.message)+'</div></div>';return}
  if(!(location.hash==='#people'||location.hash.startsWith('#people-')))return;   /* user already moved on */
  id?personView(D,id):peopleList(D);
}
function peopleList(D){
  const nT=D.people.filter(p=>peKind(p)==='teacher').length,nC=D.people.length-nT;
  $('#app').innerHTML='<div class="wrap"><p class="crumb"><a href="#"><i class="fa-solid fa-house"></i> Home</a> › People</p>'
   +'<div class="hero"><h1 style="margin:0 0 6px"><i class="fa-solid fa-id-card"></i> Teachers &amp; student creators</h1><p style="margin:0;opacity:.9">Choose a teacher or student creator to see their subjects. From there you can register your presentation and submit assignments and lab reports.</p></div>'
   +'<div class="pe-bar"><label class="pe-s"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="peq" placeholder="Search name, department, Gmail, mobile or batch…" value="'+esc(PE.q)+'"></label><div class="pe-tabs" id="pet"></div></div><div id="peg" class="pe-grid"></div></div>';
  const tabs=[['all','All',D.people.length],['teacher','Teachers',nT],['cr','Student creators',nC]];
  const drawTabs=()=>{$('#pet').innerHTML=tabs.map(t=>'<button type="button" class="'+(PE.t===t[0]?'on':'')+'" data-t="'+t[0]+'">'+t[1]+' <span>'+t[2]+'</span></button>').join('');
    $$('#pet button').forEach(b=>b.onclick=()=>{PE.t=b.dataset.t;drawTabs();drawGrid()})};
  const drawGrid=()=>{
    const q=nq(PE.q.trim());
    const l=D.people.filter(p=>(PE.t==='all'||peKind(p)===PE.t)&&(!q||nq([p.name,p.department,p.email,p.phone,p.batch?'batch '+p.batch:''].join(' ')).includes(q)));
    if(!l.length){$('#peg').innerHTML='<div class="card pad empty" style="grid-column:1/-1;text-align:center"><i class="fa-regular fa-folder-open" style="font-size:2rem"></i><p>'+(D.people.length?'No profile matches your search.':'No teacher or student-creator profiles yet.')+'</p></div>';return}
    $('#peg').innerHTML=l.map(p=>'<div class="card pad pe-card'+(peKind(p)==='cr'?' k-c':' k-t')+'" data-id="'+p.id+'" role="link" tabindex="0"><div class="pe-top">'+peAv(p,'lg')+'<div class="pe-n"><h3>'+esc(p.name)+'</h3>'+peBadge(p)+(p.department?'<span class="msg">'+esc(p.department)+'</span>':'')+'</div></div>'
      +'<div class="pe-ct">'+peContact(p)+'</div><div class="pe-ft"><span class="chip"><i class="fa-solid fa-book-open"></i> '+p.subject_count+' subject'+(p.subject_count===1?'':'s')+'</span><span class="pe-go">View subjects <i class="fa-solid fa-arrow-right"></i></span></div></div>').join('');
    $$('#peg .pe-card').forEach(c=>{const go=()=>{location.hash='#people-'+c.dataset.id};c.onclick=go;c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});
  };
  $('#peq').oninput=e=>{PE.q=e.target.value;drawGrid()};
  drawTabs();drawGrid();
}
function personView(D,id){
  const p=D.people.find(x=>x.id===id),back='<p class="crumb"><a href="#"><i class="fa-solid fa-house"></i> Home</a> › <a href="#people">People</a>'+(p?' › '+esc(p.name):'')+'</p>';
  if(!p){$('#app').innerHTML='<div class="wrap">'+back+'<div class="card pad empty" style="text-align:center"><p>This profile was not found.</p><a class="btn sm" href="#people">All people</a></div></div>';return}
  const nowS=nowMs()/1000,M=new Map();let hidden=0;
  D.subjects.filter(s=>s.teacher_id===id).forEach(s=>{if(isPrev(s.close_ts,nowS)){hidden++;return}M.set(s.id,{id:s.id,name:s.name,code:s.code,pres:s,tasks:[]})});
  D.tasks.filter(t=>t.teacher_id===id).forEach(t=>{
    if(isPrev(t.due_ts,nowS)){hidden++;return}
    let e=M.get(t.subject_id);if(!e){e={id:t.subject_id,name:t.subject,code:t.subject_code,pres:null,tasks:[]};M.set(t.subject_id,e)}
    e.tasks.push(t)});
  const list=[...M.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const row=(ic,title,sub,btn)=>'<div class="pe-row"><div class="pe-ri"><b><i class="fa-solid '+ic+'"></i> '+title+'</b>'+(sub?'<span class="msg">'+sub+'</span>':'')+'</div>'+btn+'</div>';
  const tsec=(e,k,ic)=>{const l=e.tasks.filter(t=>t.kind===k);return l.length?'<h4 class="pe-h">'+KIND[k]+'s</h4>'+l.map(t=>row(ic,esc(t.title)+' <span class="chip">'+esc(MODE[t.mode])+'</span>',esc(t.msg)+tCd(t),'<button class="btn sm" data-sb="'+t.id+'" '+(t.open?'':'disabled')+'><i class="fa-solid fa-file-arrow-up"></i> '+(t.open?(t.late?'Submit late':'Submit'):'Closed')+'</button>')).join(''):''};
  const card=e=>{const s=e.pres,m=s||e.tasks[0]||{};
    return '<div class="card pad pe-sub"><h3 style="margin:0 0 6px"><i class="fa-solid fa-book-open" style="color:var(--teal)"></i> '+esc(e.name)+(e.code?' <span class="scode">'+esc(e.code)+'</span>':'')+'</h3><div class="chips" style="margin-bottom:8px">'+metaChips(m)+'</div>'
     +(s?'<h4 class="pe-h">Presentation</h4>'+row('fa-display','Presentation registration',s.late?esc(s.message):s.state==='open'?(s.close_ts?'Deadline: '+esc(fmtBD(s.close_ts))+' · Bangladesh Time':'Registration is open.'):esc(s.message),'<button class="btn sm" data-pr="'+s.id+'" '+(s.state==='open'?'':'disabled')+'><i class="fa-solid fa-pen-to-square"></i> '+(s.state==='open'?(s.late?'Register late':'Register'):'Unavailable')+'</button>'):'')
     +tsec(e,'assignment','fa-file-lines')+tsec(e,'lab','fa-flask')+'</div>'};
  $('#app').innerHTML='<div class="wrap">'+back+'<div class="card pad pe-head">'+peAv(p,'lg')+'<div class="pe-n"><h2 style="margin:0;font-size:1.5rem">'+esc(p.name)+'</h2>'+peBadge(p)+(p.department?'<span class="msg">'+esc(p.department)+'</span>':'')+'<div class="pe-ct">'+peContact(p)+'</div></div></div>'
   +'<h3 style="margin:24px 0 12px">Subjects &amp; submissions</h3>'
   +(list.length?'<div class="pe-subs">'+list.map(card).join('')+'</div>':'<div class="card pad empty" style="text-align:center"><i class="fa-regular fa-folder-open" style="font-size:2rem"></i><p>Nothing is open for this profile right now.</p></div>')
   +(hidden?'<p class="msg" style="margin-top:14px">'+hidden+' older item'+(hidden===1?'':'s')+' (deadline ended over a week ago) hidden — see the Presentation, Assignment and Lab report pages.</p>':'')
   +'<div class="acts" style="margin-top:18px"><a class="btn sec" href="#people"><i class="fa-solid fa-arrow-left"></i> All people</a></div></div>';
  $$('[data-pr]').forEach(b=>b.onclick=()=>{S.subject=D.subjects.find(x=>x.id==b.dataset.pr);if(S.subject)chooseType()});
  $$('[data-sb]').forEach(b=>b.onclick=()=>submitForm(D.tasks.find(x=>x.id==b.dataset.sb),D.exts));
}
let HUBT=0;
const HUB_SHOW=6;   /* rows shown on the card; the rest is behind "See more" (opens the page) */
async function homeHub(){
  clearTimeout(HUBT);try{sessionStorage.removeItem('ch_from')}catch(x){}
  if(location.hash!==''&&location.hash!=='#'){history.replaceState(null,'','#');setNav()}
  S.view='';
  if(!$('#hubg'))$('#app').innerHTML='<div class="wrap"><div class="hero hhero"><h1>What would you like to do today?</h1><p class="hm">Register for a presentation, submit an assignment or lab report, or find your teacher.</p><button type="button" class="hinst" aria-label="Install app"><i class="fa-solid fa-download"></i> Install App</button></div><div class="hubg" id="hubg"><div class="card pad" style="grid-column:1/-1;text-align:center">Loading…</div></div></div>';
  let sj=[],tk=[],now=Date.now()/1000;
  try{const [a,b]=await Promise.all([api('subjects'),api('tasks_public')]);sj=a.subjects;tk=b.tasks;now=a.server_now;SRV_OFF=a.server_now*1000-Date.now();if(a.options)OPTS=Object.assign(OPTS,a.options)}catch(e){}
  if(!$('#hubg'))return;
  const cnt=(l,f)=>{const c=l.filter(x=>!isPrev(f(x),now)).length,p=l.length-c;return '<span class="chip"><i class="fa-solid fa-circle" style="color:var(--green);font-size:.6rem"></i> '+c+' current</span>'+(p?'<span class="chip prevchip"><i class="fa-solid fa-clock-rotate-left"></i> '+p+' previous</span>':'')};
  /* "running now" = still open for registration / submission; once the deadline ends the row disappears by itself */
  const byDue=(a,b)=>{const n=nowMs()/1000,la=a.ts&&a.ts<=n?1:0,lb=b.ts&&b.ts<=n?1:0;return la-lb||(a.ts||9e12)-(b.ts||9e12)};
  const uniq=l=>{const seen=new Set();return l.filter(r=>{const k=(r.code||r.title)+'|'+(r.tn||'');if(seen.has(k))return false;seen.add(k);return true})};
  const live=r=>!isPrev(r.ts,nowMs()/1000);   /* deadline over => still shown (marked Late) for a week */
  const runPres=sj.filter(x=>x.state==='open').map(x=>({title:x.name,sub:'',code:x.code,ph:x.teacher_photo,tn:x.teacher_name,batch:(x.batches||[]).join(', '),ts:x.close_ts})).filter(live).sort(byDue);
  const runTask=k=>tk.filter(t=>t.kind===k&&t.open).map(t=>({title:t.title,sub:t.subject,code:t.subject_code,ph:t.teacher_photo,tn:t.teacher_name,batch:t.batch_lock||'',ts:t.due_ts})).filter(live).sort(byDue);
  const tile=(r,href)=>'<a class="hubtl" href="'+href+'" title="'+esc([r.tn,r.code||r.title].filter(Boolean).join(' · '))+'">'+tav(r.ph,'md')+'<span class="scode">'+esc(r.code||r.title)+'</span>'+(r.ts&&r.ts<=nowMs()/1000?'<span class="hubl2">Late</span>':'')+'</a>';
  const row=r=>'<div class="hubr">'+tav(r.ph,'sm')+'<div class="hubi"><b title="'+esc(r.title)+'">'+esc(r.title)+(r.code?' <span class="scode">'+esc(r.code)+'</span>':'')+'</b>'
    +(r.sub?'<span class="msg">'+esc(r.sub)+'</span>':'')+'</div>'
    +'<span class="hubb" title="Batch"><i class="fa-solid fa-user-graduate"></i> '+(r.batch?esc(r.batch):'All batches')+'</span></div>';
  const items=[['presentation','#presentation','fa-display','Presentation','Register for a presentation slot — individual or team.',cnt(sj,x=>x.close_ts),runPres],
    ['assignment','#assignment','fa-file-lines','Assignment','See assignments and upload your submission.',cnt(tk.filter(t=>t.kind==='assignment'),x=>x.due_ts),runTask('assignment')],
    ['lab','#lab','fa-flask','Lab report','See lab reports and upload your submission.',cnt(tk.filter(t=>t.kind==='lab'),x=>x.due_ts),runTask('lab')]];
  $('#hubg').innerHTML=items.map(x=>{
    const l=uniq(x[6]),more=l.length-HUB_SHOW;
    return '<div class="card hubc" data-k="'+x[0]+'"><div class="hubhd"><a class="hubt" href="'+x[1]+'"><span class="hico"><i class="fa-solid '+x[2]+' big"></i></span><h3>'+x[3]+'</h3></a><p class="hm">'+x[4]+'</p><div class="chips">'+x[5]+'</div></div><div class="hubbd">'
    +'<div class="hubl"><h4><i class="fa-solid fa-bolt" style="color:var(--amber)"></i> Running now</h4>'
    +(l.length?'<div class="hubtiles">'+l.slice(0,HUB_SHOW).map(r=>tile(r,x[1])).join('')+'</div>'+(more>0?'<a class="hubm" href="'+x[1]+'">See more ('+more+') <i class="fa-solid fa-arrow-right"></i></a>':''):'<p class="msg" style="margin:4px 0 0">Nothing is open right now.</p>')
    +'</div><a class="btn" href="'+x[1]+'">Open '+x[3].toLowerCase()+' <i class="fa-solid fa-arrow-right"></i></a></div></div>'}).join('')+hubExtra();hubRate();
  HUBT=setTimeout(()=>{if(location.hash===''||location.hash==='#')homeHub()},30000);   /* auto refresh: new items appear, ended ones vanish */
}
function submitForm(t,exts){
  const both=t.mode==='both';
  openModal('<div class="mt"><h3>'+esc(t.title)+'</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div id="merr"></div>'+(t.late?'<p class="msg latebox" style="margin-bottom:12px"><i class="fa-solid fa-triangle-exclamation"></i> '+esc(t.msg)+'</p>':'')+tCd(t)+'<div class="fg">'
   +'<label class="f" style="grid-column:1/-1"><span class="req">Submitting as</span><select id="sbt">'+(t.mode!=='team'?'<option value="individual">Individual</option>':'')+(t.mode!=='individual'?'<option value="team">Team</option>':'')+'</select></label>'
   +'<label class="f"><span class="req">Your name</span><input type="text" id="sbn" maxlength="80"></label>'
   +'<label class="f"><span class="req">Student ID</span><input type="text" id="sbi" maxlength="40"></label>'
   +'<label class="f" style="grid-column:1/-1">Email <small>Optional</small><input type="email" id="sbe" maxlength="100"></label>'
   +'<div id="sbteam" style="grid-column:1/-1;display:none;gap:12px;grid-template-columns:1fr"><label class="f"><span class="req">Team name</span><input type="text" id="sbtn" maxlength="80"></label><label class="f">Team members <small>Names and IDs, one per line</small><textarea id="sbm" rows="3" maxlength="1000" style="width:100%;padding:11px 12px;border:1.5px solid var(--line);border-radius:12px"></textarea></label></div>'
   +'<label class="f" style="grid-column:1/-1"><span class="req">File</span><small>'+exts.join(', ')+' · max '+t.max_mb+' MB</small><input type="file" id="sbf" accept="'+exts.map(x=>'.'+x).join(',')+'"></label></div>'
   +'<div class="acts"><button class="btn" id="sbgo"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</button><button class="btn sec" onclick="closeModal()">Cancel</button></div>');
  const tg=()=>{$('#sbteam').style.display=$('#sbt').value==='team'?'grid':'none'};$('#sbt').onchange=tg;tg();
  $('#sbgo').onclick=async()=>{
    const f=$('#sbf').files[0];if(!f){$('#merr').innerHTML='<div class="err">Choose a file to upload.</div>';return}
    const fd=new FormData();fd.append('task_id',t.id);fd.append('sub_type',$('#sbt').value);fd.append('name',$('#sbn').value);fd.append('student_id',$('#sbi').value);fd.append('email',$('#sbe').value);fd.append('team_name',$('#sbtn').value);fd.append('members',$('#sbm').value);fd.append('file',f);
    $('#sbgo').disabled=true;
    try{const r=await api('task_submit',{form:fd});openModal('<div style="text-align:center;padding:10px"><div class="tick"><i class="fa-solid fa-check"></i></div><h3>Submitted!</h3><p class="msg">Keep this receipt code:</p><p style="font-size:1.4rem;font-weight:800;letter-spacing:.06em">'+esc(r.ref)+'</p><button class="btn" onclick="closeModal();route()">Done</button></div>')}
    catch(e){$('#sbgo').disabled=false;$('#merr').innerHTML='<div class="err">'+esc(e.message)+'</div>'}
  };
}
const refreshTasks=()=>A.page==='subjects'?pgSubjects():pgTasks();
const TKF={q:'',batch:'',subj:'',prog:'',kind:''};
async function pgTasks(){
  const [r,sr]=await Promise.all([guard(()=>api('tasks_admin')),guard(()=>api('subjects_admin'))]);if(!r||!sr)return;
  const subs=sr.subjects,V=getView(),all=r.tasks;
  const ac=(t,l)=>'<button class="btn sm" data-v="'+t.id+'" title="Submissions" aria-label="Submissions"><i class="fa-solid fa-folder-open"></i>'+(l?' Submissions':'')+'</button><button class="btn sm sec" data-e="'+t.id+'" title="Edit" aria-label="Edit"><i class="fa-solid fa-pen"></i>'+(l?' Edit':'')+'</button><button class="btn sm '+(+t.is_open?'dng':'')+'" data-o="'+t.id+'" data-c="'+(+t.is_open?1:0)+'" title="'+(+t.is_open?'Close':'Open')+'" aria-label="'+(+t.is_open?'Close':'Open')+'"><i class="fa-solid fa-'+(+t.is_open?'lock':'lock-open')+'"></i>'+(l?' '+(+t.is_open?'Close':'Open'):'')+'</button><button class="btn sm dng" data-x="'+t.id+'" title="Delete" aria-label="Delete"><i class="fa-solid fa-trash"></i>'+(l?' Delete':'')+'</button>';
  const kb=t=>'<span class="badge b-'+(t.kind==='lab'?'pending':'approved')+'">'+KIND[t.kind]+'</span>';
  const stb=t=>'<span class="badge b-'+(t.open?'open':'closed')+'">'+(t.open?'Open':'Closed')+'</span>';
  const bchips=t=>((t.batches||[]).length?'<span class="chip meta"><i class="fa-solid fa-users-line"></i> Batch '+esc((t.batches||[]).join(', '))+'</span>':'')+(t.program?'<span class="chip meta"><i class="fa-solid fa-graduation-cap"></i> '+esc(progLabel(t.program))+'</span>':'');
  const sname=t=>esc(t.subject)+(t.subject_code?' <span class="scode">'+esc(t.subject_code)+'</span>':'');
  const cardsH=l=>'<div class="grid sgrid">'+l.map(t=>'<div class="card scard"><div class="sc-h"><h3>'+esc(t.title)+'</h3>'+stb(t)+'</div><div class="chips" style="margin:0 0 8px">'+kb(t)+'<span class="chip">'+esc(MODE[t.mode])+'</span>'+bchips(t)+'</div>'
    +'<dl class="kv"><div class="wide"><dt>Subject</dt><dd>'+sname(t)+'</dd></div><div class="wide"><dt>Deadline</dt><dd>'+esc(t.msg)+tCd(t)+'</dd></div><div><dt>Submissions</dt><dd>'+t.sub_count+'</dd></div></dl>'
    +'<div class="sc-a">'+ac(t,1)+'</div></div>').join('')+'</div>';
  const tblH=l=>'<div class="card"><div class="tw"><table class="tsktbl"><tr><th>Type</th><th>Title</th><th>Subject</th><th>Batch</th><th>Program</th><th>Who</th><th>Deadline</th><th>Submissions</th><th>Status</th><th></th></tr>'
    +l.map(t=>'<tr><td>'+kb(t)+'</td><td><b>'+esc(t.title)+'</b></td><td>'+sname(t)+'</td><td>'+(esc((t.batches||[]).join(', '))||'—')+'</td><td>'+(esc(progLabel(t.program))||'—')+'</td><td>'+esc(MODE[t.mode])+'</td><td>'+esc(t.msg)+tCd(t)+'</td><td>'+t.sub_count+'</td><td>'+stb(t)+'</td><td><div class="row">'+ac(t,0)+'</div></td></tr>').join('')+'</table></div></div>';
  const uq=a=>[...new Set(a.filter(Boolean))];
  const batches=uq(all.flatMap(t=>t.batches||[])).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const progs=['Undergraduate','Diploma'];
  const okBP=t=>(!TKF.batch||(t.batches||[]).includes(TKF.batch))&&(!TKF.prog||t.program===TKF.prog||t.program==='Both');
  const subjOpts=()=>{const m=new Map();all.filter(okBP).forEach(t=>m.set(String(t.subject_id),t.subject+(t.subject_code?' ('+t.subject_code+')':'')));return [...m.entries()].sort((a,b)=>a[1].localeCompare(b[1]))};
  const match=t=>{const q=nq(TKF.q).split(/\s+/).filter(Boolean);
    return okBP(t)&&(!TKF.subj||String(t.subject_id)===TKF.subj)&&(!TKF.kind||t.kind===TKF.kind)
      &&(!q.length||q.every(w=>nq([t.title,t.subject,t.subject_code,(t.batches||[]).join(' '),progLabel(t.program),t.department,KIND[t.kind],t.details].join(' ')).includes(w)))};
  const sopt=(v,l,c)=>'<option value="'+esc(v)+'"'+(v===c?' selected':'')+'>'+esc(l)+'</option>';
  const fillSubj=()=>{const o=subjOpts();if(TKF.subj&&!o.some(x=>x[0]===TKF.subj))TKF.subj='';$('#tkfs').innerHTML='<option value="">All subjects</option>'+o.map(x=>sopt(x[0],x[1],TKF.subj)).join('')};
  const bar=all.length?'<div class="sbar"><div class="sq"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="tkq" placeholder="Search title, subject, course code, batch, program…" value="'+esc(TKF.q)+'" autocomplete="off" aria-label="Search"><button type="button" class="sqx '+(TKF.q?'show':'')+'" id="tkqx" aria-label="Clear search"><i class="fa-solid fa-xmark"></i></button></div>'
    +'<div class="sfil"><select id="tkfb" aria-label="Batch"><option value="">All batches</option>'+batches.map(b=>sopt(b,'Batch '+b,TKF.batch)).join('')+'</select>'
    +'<select id="tkfs" aria-label="Subject"></select>'
    +'<select id="tkfp" aria-label="Program"><option value="">All programs</option>'+progs.map(p=>sopt(p,p,TKF.prog)).join('')+'</select>'
    +'<select id="tkfk" aria-label="Type"><option value="">Assignments &amp; lab reports</option>'+sopt('assignment','Assignments only',TKF.kind)+sopt('lab','Lab reports only',TKF.kind)+'</select></div>'
    +'<span class="sfc"><span id="tkc"></span> <button type="button" class="btn sm sec" id="tkclr" style="margin-left:8px"><i class="fa-solid fa-filter-circle-xmark"></i> Clear filters</button></span></div>':'';
  $('#pg').innerHTML='<div class="tools"><h2 style="margin:0;margin-right:auto">Assignments &amp; lab reports</h2>'+vtogHTML()+'<button class="btn" id="tadd"><i class="fa-solid fa-plus"></i> New</button></div>'+bar+'<div id="tkres"></div>';
  wireView(pgTasks);
  $('#tadd').onclick=()=>taskForm(null,subs);
  const draw=()=>{
    const l=all.filter(match);
    if($('#tkc'))$('#tkc').textContent=l.length===all.length?all.length+' total':l.length+' of '+all.length+' shown';
    if($('#tkclr'))$('#tkclr').style.display=(TKF.q||TKF.batch||TKF.subj||TKF.prog||TKF.kind)?'':'none';
    $('#tkres').innerHTML=!all.length?'<div class="card empty">Nothing yet.</div>':!l.length?'<div class="card empty"><i class="fa-regular fa-folder-open" style="font-size:2rem"></i><p>No assignments or lab reports match your search or filters.</p></div>':(V==='excel'?taskExcel(l):V==='table'?tblH(l):cardsH(l));
    $$('[data-e]').forEach(b=>b.onclick=()=>taskForm(all.find(x=>x.id==b.dataset.e),subs));
    $$('[data-o]').forEach(b=>b.onclick=async()=>{const cl=b.dataset.c==='1';if(cl&&!confirm('Close submissions? Nobody will be able to submit until you open it again.'))return;if(await guard(()=>api('task_toggle',{json:{id:+b.dataset.o}}))){toast(cl?'Submissions closed.':'Submissions opened.');pgTasks()}});
    $$('[data-x]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this form and all its uploaded files? This cannot be undone.'))return;if(await guard(()=>api('task_delete',{json:{id:+b.dataset.x}}))){toast('Deleted.');pgTasks()}});
    $$('[data-v]').forEach(b=>b.onclick=()=>subsView(+b.dataset.v));
  };
  if(all.length){
    fillSubj();
    let tm=0;const qi=$('#tkq');
    qi.oninput=()=>{TKF.q=qi.value;$('#tkqx').classList.toggle('show',!!qi.value);clearTimeout(tm);tm=setTimeout(draw,120)};
    $('#tkqx').onclick=()=>{qi.value='';TKF.q='';$('#tkqx').classList.remove('show');draw();qi.focus()};
    $('#tkfb').onchange=e=>{TKF.batch=e.target.value;fillSubj();draw()};
    $('#tkfp').onchange=e=>{TKF.prog=e.target.value;fillSubj();draw()};
    $('#tkfs').onchange=e=>{TKF.subj=e.target.value;draw()};
    $('#tkfk').onchange=e=>{TKF.kind=e.target.value;draw()};
    $('#tkclr').onclick=()=>{Object.assign(TKF,{q:'',batch:'',subj:'',prog:'',kind:''});pgTasks()};
  }
  draw();
}
function taskForm(t,subs){
  t=t||{id:0,subject_id:subs[0]?subs[0].id:0,kind:'assignment',title:'',details:'',mode:'both',due_local:'',max_mb:10};
  if(!subs.length){toast('Create a subject first.','err');return}
  const sel=(v,c)=>v==c?' selected':'';
  openModal('<div class="mt"><h3>'+(t.id?'Edit':'New')+' assignment / lab report</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div id="merr"></div><div class="swrow">'+swHTML('tsw',t.id?+t.is_open:1,'Submission OPEN','Submission CLOSED')+'<small>ON = students can submit. OFF = nobody can submit, not even late.</small></div><div class="fg">'
   +'<label class="f"><span class="req">Type</span><select id="tk"><option value="assignment"'+sel(t.kind,'assignment')+'>Assignment</option><option value="lab"'+sel(t.kind,'lab')+'>Lab report</option></select></label>'
   +'<label class="f"><span class="req">Subject</span><select id="ts">'+subs.map(s=>'<option value="'+s.id+'"'+sel(t.subject_id,s.id)+'>'+esc(s.name)+'</option>').join('')+'</select></label>'
   +'<label class="f" style="grid-column:1/-1"><span class="req">Title</span><input type="text" id="tt" maxlength="150" value="'+esc(t.title)+'" placeholder="e.g. Lab 3 — Sorting algorithms"></label>'
   +'<label class="f" style="grid-column:1/-1">Instructions <small>Optional</small><textarea id="td2" rows="3" maxlength="2000" style="width:100%;padding:11px 12px;border:1.5px solid var(--line);border-radius:12px">'+esc(t.details||'')+'</textarea></label>'
   +'<label class="f"><span class="req">Who can submit</span><select id="tm"><option value="both"'+sel(t.mode,'both')+'>Individual or team</option><option value="individual"'+sel(t.mode,'individual')+'>Individual only</option><option value="team"'+sel(t.mode,'team')+'>Team only</option></select></label>'
   +'<label class="f">Max file size (MB)<input type="number" id="tmb" min="1" max="50" value="'+(+t.max_mb||10)+'"></label>'
   +'<label class="f" style="grid-column:1/-1">Deadline <small>Optional · Bangladesh time</small><input type="datetime-local" id="tdu" value="'+esc(t.due_local||'')+'"></label></div>'
   +'<div class="acts"><button class="btn" id="tsv"><i class="fa-solid fa-floppy-disk"></i> Save</button><button class="btn sec" onclick="closeModal()">Cancel</button></div>');
  swBind('tsw');
  $('#tsv').onclick=async()=>{try{await api('task_save',{json:{is_open:swOn('tsw'),id:t.id,subject_id:+$('#ts').value,kind:$('#tk').value,title:$('#tt').value,details:$('#td2').value,mode:$('#tm').value,max_mb:+$('#tmb').value,due_at:$('#tdu').value}});closeModal();toast('Saved.');refreshTasks()}catch(e){$('#merr').innerHTML='<div class="err">'+esc(e.message)+'</div>'}};
}
async function subsView(id){
  const r=await guard(()=>api('subs_list',{q:{task_id:id}}));if(!r)return;
  openModal('<div class="mt"><h3>'+esc(r.task.title)+' · '+r.subs.length+' submission(s)</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>'
   +(r.subs.length?'<label class="pe-s" style="margin-bottom:10px"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="sbq" placeholder="Search name, ID, team, file or code…"></label><div class="tw"><table id="sbt2"><tr><th>Who</th><th>ID</th><th>File</th><th>Time</th><th></th></tr>'+r.subs.map(x=>'<tr><td>'+esc(x.name)+(+x.is_late?' <span class="badge b-rejected">Late</span>':'')+(x.sub_type==='team'?'<br><span class="badge b-pending">Team: '+esc(x.team_name||'')+'</span>'+(x.members?'<br><small style="white-space:pre-line">'+esc(x.members)+'</small>':''):'')+'</td><td>'+esc(x.student_id)+'</td><td><a href="'+API_URL+'?api=task_file&as='+encodeURIComponent(A.role)+'&id='+x.id+'"><i class="fa-solid fa-download"></i> '+esc(x.orig_name)+'</a><br><small>'+fsz(x.size)+' · '+esc(x.ref)+'</small></td><td><small>'+esc(x.created_at)+'</small></td><td><button class="btn sm dng" data-sd="'+x.id+'"><i class="fa-solid fa-trash"></i></button></td></tr>').join('')+'</table></div>':'<p class="msg">No submissions yet.</p>'));
  const sbq=$('#sbq');if(sbq)sbq.oninput=()=>{const q=nq(sbq.value).split(/\s+/).filter(Boolean);$$('#sbt2 tr').forEach((tr,i)=>{if(!i)return;const h=nq(tr.textContent);tr.style.display=q.every(w=>h.includes(w))?'':'none'})};
  $$('[data-sd]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this submission and its file?'))return;if(await guard(()=>api('sub_delete',{json:{id:+b.dataset.sd}}))){toast('Deleted.');subsView(id);refreshTasks()}});
}
function memCard(single){
  const d=document.createElement('div');d.className='mcard';if(single)d.style.marginTop='0';
  const fl=S.F.filter(f=>f.type!=='photo'),ph=S.F.find(f=>f.type==='photo');
  d.innerHTML=(single?'':'<div class="mhead"><h4></h4><label class="lead"><input type="radio" name="leader"> Team leader</label><button type="button" class="btn sm dng rm"><i class="fa-solid fa-user-minus"></i> Remove</button></div>')
  +'<div class="fg">'+fl.map(f=>'<label class="f">'+fieldLabel(f)+ctl(f,f.def)+'</label>').join('')+'</div>'
  +(ph?'<div class="pbox"><div class="m-av">'+av('')+'</div><label class="f">'+fieldLabel(ph)+'<small style="display:block">JPG, PNG or WEBP · max '+(ph.mb||2)+' MB</small>'+ctl(ph)+'</label></div>':'');
  const pi=d.querySelector('.m-photo');if(pi)bindPhoto(pi,d.querySelector('.m-av'));
  if(!single){
    d.querySelector('.rm').onclick=()=>{d.remove();renumber()};
    d.querySelector('input[name=leader]').onchange=renumber;
    d.querySelectorAll('input.dyn,select.dyn').forEach(i=>i.addEventListener('input',renumber));
  }
  return d;
}
function addMember(){
  const s=S.subject,n=$$('.mcard').length;
  if(n>=s.max_team){toast('Maximum '+s.max_team+' members allowed.','err');return}
  $('#mem').append(memCard(false));renumber();
}
function renumber(){
  const s=S.subject,cards=$$('.mcard');
  if(cards.length&&!cards.some(c=>c.querySelector('input[name=leader]').checked))cards[0].querySelector('input[name=leader]').checked=true;
  cards.forEach((c,i)=>{
    c.querySelector('h4').textContent='Member '+(i+1);
    const r=c.querySelector('input[name=leader]');r.value=i;
    c.querySelector('.rm').style.display=cards.length>s.min_team?'':'none';
    const L=r.checked;
    c.querySelectorAll('[data-rl]').forEach(e=>e.classList.toggle('req',L));c.querySelectorAll('[data-rs]').forEach(e=>e.style.display=L?'none':'');
  });
  $('#cnt').textContent='('+cards.length+' / '+s.max_team+')';
  $('#addm').disabled=cards.length>=s.max_team;
  const l=cards.find(c=>c.querySelector('input[name=leader]').checked);
  if(l){const id=identOf(s,readCard(l,S.F));$('#lsum').innerHTML='Team leader: <b>'+esc(id.name)+'</b>'+(id.uid?' · ID '+esc(id.uid):'')}else $('#lsum').innerHTML='Team leader: —';
}
function bindPhoto(inp,box,fn,gsel){
  fn=fn||av;
  const draw=()=>{box.innerHTML=fn(inp._u||'')};
  inp.onchange=()=>{
    inp._u='';
    const f=inp.files[0];
    if(f){
      if(!/^image\/(jpeg|png|webp)$/.test(f.type)){toast('Only JPG, JPEG, PNG or WEBP images are allowed.','err');inp.value=''}
      else if(f.size>(+inp.dataset.mb||2)*1024*1024){toast('Photo must be '+(+inp.dataset.mb||2)+' MB or smaller.','err');inp.value=''}
      else inp._u=URL.createObjectURL(f);
    }
    draw();
  };
  if(gsel)gsel.addEventListener('change',draw);
}
function setErr(m){$('#ferr').innerHTML=m?'<div class="err"><i class="fa-solid fa-circle-exclamation"></i> '+esc(m)+'</div>':'';if(m)$('#ferr').scrollIntoView({behavior:'smooth',block:'center'})}
const reIdv=/^[\p{L}\p{N}\-_\/. ]{1,40}$/u,rePh=/^\+?\d{10,14}$/;
function chkVal(f,v){
  if(f.type==='tel'&&!rePh.test(v.replace(/[\s-]/g,'')))return f.label+' must be 10–14 digits.';
  if(f.type==='email'&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))return f.label+' is not a valid email.';
  if(f.type==='number'&&!isFinite(+v))return f.label+' must be a number.';
  if(f.key==='batch'&&!/^\d{1,4}$/.test(v))return f.label+' must be a number (digits only, e.g. 32).';
  if(f.role==='id'&&!reIdv.test(v))return 'enter a valid '+f.label+'.';
  if(f.role==='name'&&v.length<2)return 'enter a valid '+f.label+'.';
  return '';
}
async function submitReg(){
  setErr('');$$('.bad').forEach(x=>x.classList.remove('bad'));
  const s=S.subject,F=S.F,team=S.type==='team',fd=new FormData();
  fd.append('subject_id',s.id);fd.append('type',S.type);
  const slot=$('#slot');
  if(slot){if(!slot.value){slot.classList.add('bad');return setErr('Please select a presentation slot.')}fd.append('slot_id',slot.value)}
  const bad=(el,m)=>{el.classList.add('bad');el.focus();setErr(m);return false};
  if(team){
    const tn=$('#tn');if(tn.value.trim().length<2)return bad(tn,'Enter a team name.');
    fd.append('team_name',tn.value.trim());
  }
  {const tp=$('#ttp');fd.append('topic',tp?tp.value.trim():'')}   /* optional */
  {   /* login Gmail (no password): team leader AND individual */
    const le=$('#tle').value.trim().toLowerCase();
    if(le.indexOf('@')>=0?!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(le):!rePh.test(le.replace(/[\s-]/g,'')))return bad($('#tle'),'Enter a valid Gmail address or mobile number for your login.');
    fd.append('leader_email',le);
  }
  const cards=$$('.mcard');
  if(team&&(cards.length<s.min_team||cards.length>s.max_team))return setErr('Team size must be between '+s.min_team+' and '+s.max_team+'.');
  const ids=new Set(),mem=[];let lead=team?-1:0;
  for(let i=0;i<cards.length;i++){
    const c=cards[i],L=!team||c.querySelector('input[name=leader]').checked,n=team?'Member '+(i+1):'Your details',vals={};
    if(team&&L)lead=i;
    for(const f of F){
      if(f.type==='photo')continue;
      const el=c.querySelector('.dyn[data-k="'+f.key+'"]');let v=el.value.trim();
      const must=f.req==='yes'||(f.req==='leader'&&L);
      if(!v){if(must)return bad(el,n+': '+f.label+' is required.');vals[f.key]='';continue}
      const e=chkVal(f,v);if(e)return bad(el,n+': '+e);
      if(f.type==='tel')v=v.replace(/[\s-]/g,'');
      if(f.role==='id'){const k=v.toLowerCase();if(ids.has(k))return bad(el,n+': this ID is already in the team.');ids.add(k)}
      vals[f.key]=v;
    }
    mem.push(vals);
    const pf=c.querySelector('.m-photo'),phf=F.find(f=>f.type==='photo');
    if(phf&&pf&&!pf.files[0]&&(phf.req==='yes'||(phf.req==='leader'&&L)))return bad(pf,n+': '+phf.label+' is required.');
    if(pf&&pf.files[0])fd.append('photo_'+i,pf.files[0]);
  }
  if(team&&lead<0)return setErr('Select one team leader.');
  fd.append('members',JSON.stringify(mem));fd.append('leader_index',lead);
  const pin=$('#rpres');
  if(pin&&pin.files[0]){const pm=presCheck(pin.files[0],s.pres_max_mb||OPTS.pres_max_mb||20);if(pm)return bad(pin,pm);fd.append('pres',pin.files[0])}
  const goB=$('#go'),goH=goB.innerHTML;
  goB.disabled=true;goB.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> '+(fd.has('pres')?'Submitting & uploading…':'Submitting…');
  try{const r=await api('register',{form:fd});doneScreen(r)}
  catch(e){setErr(e.message);toast(e.message,'err')}
  finally{const g=$('#go');if(g){g.disabled=false;g.innerHTML=goH}}
}
/* registration saved + the server already signed this person in: go straight to their profile (presentation upload is on that page) */
function enterPanelAfterReg(r){
  if(r.csrf){CSRF=r.csrf;$('meta[name=csrf]').content=CSRF}
  A.role='leader';L.d=r.leader;L.page='team';L.rf=0;L.go='';
  L.fresh={ref:r.ref,pres:!!r.pres_saved,warn:r.pres_warn||''};S.view='';
  try{history.replaceState(null,'','#teams-leader')}catch(e){}
  leaderShell();window.scrollTo(0,0);
  toast('Registration submitted successfully. Welcome to your profile.');
}
function doneScreen(r){
  if(r&&r.leader){enterPanelAfterReg(r);return}
  S.view='done';
  const g=r.registration||{members:[]},fl=S.subject.fields.filter(f=>f.type!=='photo'&&f.role!=='name'&&f.role!=='id');
  const extra=m=>fl.map(f=>(m.vals||{})[f.key]).filter(Boolean).map(esc).join(' · ');
  $('#app').innerHTML='<div class="wrap">'+stepsHTML(5)+'<div class="card pad done"><div class="tick"><i class="fa-solid fa-check"></i></div><h2>Registration submitted</h2><p class="msg">Keep this reference code. Your registration is <b>pending</b> until it is approved.</p><div class="ref">'+esc(r.ref)+'</div>'+(r.pres_saved?'<p class="msg"><i class="fa-solid fa-file-circle-check" style="color:var(--green,#16a34a)"></i> Your presentation file was uploaded with the registration.</p>':(r.pres_warn?'<div class="err" style="margin:10px 0">'+esc(r.pres_warn)+'</div>':(S.subject.pres_open?'<p class="msg"><i class="fa-solid fa-file-circle-exclamation"></i> No presentation file yet. Upload it from your panel'+(S.subject.pres_close_ts?' before '+esc(fmtBD(S.subject.pres_close_ts)):'')+'.</p>':'')))
  +(r.leader?'<p class="msg">Your panel is ready: edit your details and '+(r.pres_saved?'replace or present your presentation file':'<b>submit your presentation</b>')+' there. Next time sign in at <a href="#teams-leader"><b>Teams → Team leader login</b></a> with your Gmail and password.</p>':'<p class="msg">Sign in at <a href="#teams-leader"><b>Teams → Team leader login</b></a> with your Gmail and password to manage your registration.</p>')
  +'<p class="msg">'+esc(g.subject_name||S.subject.name)+(g.slot_date||g.slot_label?' · '+esc(slotTxt({date:g.slot_date,label:g.slot_label})):'')+(g.team_name?' · Team '+esc(g.team_name):'')+'</p>'
  +'<div class="sumlist">'+g.members.map(m=>'<div class="sumrow">'+av(m.photo,'sm')+'<div style="text-align:left"><b>'+esc(m.full_name)+'</b>'+(m.is_leader&&g.reg_type==='team'?' <span class="badge b-pending">Leader</span>':'')+'<br><span class="msg">'+[m.student_id?esc(m.student_id):'',extra(m)].filter(Boolean).join(' · ')+'</span></div></div>').join('')+'</div>'
  +'<div class="acts" style="justify-content:center">'+(r.leader?'<button class="btn" id="gopanel"><i class="fa-solid fa-arrow-right-to-bracket"></i> Open my panel'+(r.pres_saved?'':' &amp; submit presentation')+'</button>':'')+'<button class="btn sec" id="again"><i class="fa-solid fa-plus"></i> Register for another subject</button></div></div></div>';
  $('#again').onclick=studentHome;toast('Registration submitted successfully.');
  const gpn=$('#gopanel');
  if(gpn)gpn.onclick=()=>{if(r.csrf){CSRF=r.csrf;$('meta[name=csrf]').content=CSRF}L.go=r.pres_saved?'over':'pres';location.hash='#teams-leader';if(location.hash==='#teams-leader')route()};
}

/* ================= PUBLIC TEAM LIST ================= */
async function teamsPage(sid){
  S.view='teams';
  $('#app').innerHTML='<div class="wrap tmwrap">'+teamsTabs('all')+'<div class="hero tmhero"><h1 id="th">Who is in which team?</h1><p id="tpp">Search or choose a subject to see its teams and individual presenters. Team leaders: use <b>Team leader login</b> above.</p></div><div id="tp"></div></div>';
  let r;try{r=await api('teams_public')}catch(e){$('#tp').innerHTML='<div class="err">'+esc(e.message)+'</div>';return}
  if(!r.public){$('#tp').innerHTML='<div class="card empty"><i class="fa-solid fa-lock" style="font-size:2rem"></i><p>The team list is not public yet. Please check back later.</p></div>';return}
  const back='<a class="btn sec sm" href="#teams" style="margin-bottom:16px"><i class="fa-solid fa-arrow-left"></i> All subjects</a>';
  const hue=x=>{let h=0;for(const c of String(x||''))h=(h*31+c.codePointAt(0))%360;return h};
  const teacher=s=>(s.teacher_name||s.teacher_phone)?'<p class="msg" style="margin:0 0 12px">Course teacher: '+esc(s.teacher_name||'')+(s.teacher_phone?' · <i class="fa-solid fa-phone"></i> <a href="'+esc(telHref(s.teacher_phone))+'">'+esc(s.teacher_phone)+'</a>':'')+'</p>':'';
  const cnt=s=>{const nt=s.teams.length,ni=(s.individuals||[]).length;return [nt?nt+' team'+(nt===1?'':'s'):'',ni?ni+' individual'+(ni===1?'':'s'):''].filter(Boolean).join(' · ')||'No registrations yet'};
  if(!sid){
    if(!r.subjects.length){$('#tp').innerHTML='<div class="card empty"><i class="fa-regular fa-folder-open" style="font-size:2rem"></i><p>Nothing has been published yet.</p></div>';return}
    r.subjects.forEach(x=>{x.xtra=x.teams.map(t=>(t.team||'')+' '+t.members.map(m=>m.name+' '+(m.uid||'')).join(' ')).concat((x.individuals||[]).map(p=>p.name+' '+(p.uid||''))).join(' ')});
    const FL=S.tfl||(S.tfl={q:'',sem:'',dept:'',prog:'',batch:''});
    const card=s=>{const nt=s.teams.length,ni=(s.individuals||[]).length,nm=s.teams.reduce((a,t)=>a+t.members.length,0)+ni;
      return '<div class="card sub tsub" style="--h:'+hue(s.name)+'"><div class="ts-top"><span class="ts-ic"><i class="fa-solid fa-book-open"></i></span><div class="ts-ttl"><h3>'+esc(s.name)+'</h3>'+(s.code?'<span class="scode">'+esc(s.code)+'</span>':'')+'</div></div>'
      +'<div class="chips">'+metaChips(s)+((s.batches||[]).slice(0,3).map(b=>'<span class="chip meta"><i class="fa-solid fa-users-line"></i> '+esc(b)+'</span>').join(''))+'</div>'
      +(s.teacher_name?'<div class="ts-tch"><i class="fa-solid fa-chalkboard-user"></i><span><em>Teacher</em> '+esc(s.teacher_name)+'</span></div>':'')
      +'<div class="ts-stats"><div><b>'+nt+'</b><span>Teams</span></div><div><b>'+ni+'</b><span>Individual</span></div><div><b>'+nm+'</b><span>Students</span></div></div>'
      +'<a class="ts-go" href="#teams-'+s.id+'">View teams <i class="fa-solid fa-arrow-right"></i></a></div>'};
    $('#tp').innerHTML='<div id="tfb"></div><div class="grid" id="tgrid"></div>';
    const draw=()=>{const list=subjFilter(r.subjects,FL);filterCount('#tfb',list.length,r.subjects.length);
      $('#tgrid').innerHTML=list.length?list.map(card).join(''):'<div class="card empty" style="grid-column:1/-1"><i class="fa-regular fa-folder-open" style="font-size:2rem"></i><p>No subjects match your search or filters.</p></div>'};
    filterBar('#tfb',r.subjects,FL,draw,'Search subject, course code, department, batch, semester, team or student…');draw();
    return;
  }
  const s=r.subjects.find(x=>x.id===sid);
  if(!s){$('#tp').innerHTML=back+'<div class="card empty"><i class="fa-solid fa-lock" style="font-size:2rem"></i><p>This subject’s list is not public.</p></div>';return}
  $('#th').textContent=s.name+(s.code?' · '+s.code:'');$('#tpp').textContent=cnt(s);$('#tpp').insertAdjacentHTML('beforeend','<div class="chips" style="justify-content:center;margin-top:8px">'+metaChips(s)+'</div>');
  const slotLine=o=>(o.slot_date||o.slot_label)?'<i class="fa-regular fa-calendar"></i> '+esc(slotTxt({date:o.slot_date,label:o.slot_label})):'';
  const presBtn=o=>o.pres?'<div class="tc-act"><button class="btn sm" data-pr="'+o.rid+'" data-pt="'+esc(o.team||o.name||'Team')+'"><i class="fa-solid fa-display"></i> Present</button></div>':'';
  const teamCard=t=>{const n=t.members.length,no=String(s.teams.indexOf(t)+1).padStart(2,'0'),ms=t.members.slice().sort((x,y)=>(y.leader?1:0)-(x.leader?1:0));
    return '<div class="card tcard st-'+esc(t.status)+'" style="--h:'+hue(t.team||no)+'"><div class="tc-h"><span class="tc-ic">'+no+'</span><div class="tc-t"><h4>'+esc(t.team||'Team')+'</h4><span class="tc-m"><i class="fa-solid fa-user-group"></i> '+n+' member'+(n===1?'':'s')+'</span></div><span class="badge b-'+esc(t.status)+'">'+esc(t.status)+'</span></div>'
    +(t.topic?'<div class="tc-slot" style="font-weight:600"><i class="fa-solid fa-lightbulb" style="color:var(--amber)"></i> Topic: '+esc(t.topic)+'</div>':'')
    +(slotLine(t)?'<div class="tc-slot">'+slotLine(t)+'</div>':'')
    +'<div class="tc-body">'+ms.map(m=>'<div class="tm"><span class="tm-av'+(m.leader?' ld':'')+'" style="--h:'+hue(m.name)+'">'+esc(peIni(m.name))+'</span><div class="tm-n"><b>'+esc(m.name)+'</b>'+(m.leader?'<span class="tm-lead"><i class="fa-solid fa-crown"></i> Leader</span>':'')+(m.uid?'<span class="tm-id">'+esc(m.uid)+'</span>':'')+'</div></div>').join('')+'</div>'
    +presBtn(t)+'</div>'};
  const indRow=p=>'<div class="card tcard ind st-'+esc(p.status)+'" style="--h:'+hue(p.name)+'"><div class="tc-h"><span class="tm-av lg" style="--h:'+hue(p.name)+'">'+esc(peIni(p.name))+'</span><div class="tc-t"><h4>'+esc(p.name)+'</h4>'+(p.uid?'<span class="tc-m">ID: '+esc(p.uid)+'</span>':'')+'</div><span class="badge b-'+esc(p.status)+'">'+esc(p.status)+'</span></div>'+(p.topic?'<div class="tc-slot" style="font-weight:600"><i class="fa-solid fa-lightbulb" style="color:var(--amber)"></i> Topic: '+esc(p.topic)+'</div>':'')+(slotLine(p)?'<div class="tc-slot">'+slotLine(p)+'</div>':'')+presBtn(p)+'</div>';
  const nt=s.teams.length,ni=(s.individuals||[]).length,nmem=s.teams.reduce((x,t)=>x+t.members.length,0)+ni,npr=s.teams.filter(t=>t.pres).length+(s.individuals||[]).filter(q=>q.pres).length;
  const sum='<div class="tsum"><div><i class="fa-solid fa-people-group"></i><b>'+nt+'</b><span>Teams</span></div><div><i class="fa-solid fa-user"></i><b>'+ni+'</b><span>Individual</span></div><div><i class="fa-solid fa-user-graduate"></i><b>'+nmem+'</b><span>Students</span></div><div><i class="fa-solid fa-display"></i><b>'+npr+'</b><span>Presentations</span></div></div>';
  $('#tp').innerHTML=back+teacher(s)+sum+(nt+ni>3?'<div class="sq" style="max-width:520px"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="tsq" placeholder="Search team name, student name or ID…" autocomplete="off" aria-label="Search"></div>':'')+'<div id="tl"></div>';
  const drawT=()=>{
    const q=nq(($('#tsq')||{}).value||'').split(/\s+/).filter(Boolean),hit=t=>q.every(w=>t.includes(w));
    const tl=s.teams.filter(t=>hit(nq((t.team||'')+' '+(t.topic||'')+' '+t.members.map(m=>m.name+' '+(m.uid||'')).join(' '))));
    const il=(s.individuals||[]).filter(p=>hit(nq(p.name+' '+(p.uid||'')+' '+(p.topic||''))));
    $('#tl').innerHTML=(tl.length?(il.length?'<h3 class="tsec"><i class="fa-solid fa-people-group"></i> Teams <small>'+tl.length+'</small></h3>':'')+'<div class="grid">'+tl.map(teamCard).join('')+'</div>':'')
      +(il.length?'<h3 class="tsec"><i class="fa-solid fa-user"></i> Individual presenters <small>'+il.length+'</small></h3><div class="grid">'+il.map(indRow).join('')+'</div>':'')
      +(tl.length||il.length?'':'<div class="card empty"><i class="fa-regular fa-folder-open" style="font-size:2rem"></i><p>'+(nt+ni?'Nothing matches your search.':'No registrations yet for this subject.')+'</p></div>');
    $$('#tp [data-pr]').forEach(b=>b.onclick=()=>openPresenter(+b.dataset.pr,b.dataset.pt+' · '+s.name));
  };
  const tq=$('#tsq');if(tq)tq.oninput=drawT;
  drawT();
}

/* ================= ADMIN ================= */
const A={role:'admin',page:'dash',user:'',defpw:false,subjects:[],t:null,kb:null,f:{q:'',subject:'',batch:'',type:'',status:''}};
/* v19: forget everything that belongs to the previous account (subjects, batch list, registrations, filters) */
function resetAcct(){A.subjects=[];A.kb=null;A.t=null;A.user='';A.page='dash';A.f={q:'',subject:'',batch:'',type:'',status:''};try{REGS=[];REGT=0;REGSEQ++}catch(_e){}}
const authView=()=>A.role==='leader'?leaderLogin():A.role==='teacher'?teacherLogin():loginView();
async function adminInit(){
  resetAcct();A.role='admin';try{const r=await api('me');if(r.admin){A.user=r.user;A.defpw=r.default_pw;A.page='dash';shell()}else loginView()}catch(e){loginView()}
}
function loginView(){
  clearPnav();
  $('#app').innerHTML='<div class="wrap"><div class="card pad login"><div style="text-align:center;margin-bottom:16px">'+lav('var(--ink)','fa-lock')+'<h2>Admin sign in</h2></div><div id="lerr"></div>'
  +'<form id="lf" style="display:grid;gap:14px"><label class="f">Username<input type="text" id="lu" autocomplete="username" required></label><label class="f">Password<input type="password" id="lp" autocomplete="current-password" required></label><button class="btn" type="submit">Sign in</button></form></div></div>';
  $('#lf').onsubmit=async e=>{e.preventDefault();
    try{const r=await api('login',{json:{username:$('#lu').value,password:$('#lp').value}});CSRF=r.csrf;$('meta[name=csrf]').content=CSRF;resetAcct();A.role='admin';A.user=r.user;A.defpw=r.default_pw;A.page='dash';shell();toast('Welcome back, '+r.user+'.')}
    catch(x){$('#lerr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(x.message)+'</div>'}};
}
const NAV=[['dash','fa-chart-pie','Dashboard'],['subjects','fa-book-open','Subjects'],['teachers','fa-chalkboard-user','Teachers'],['regs','fa-clipboard-list','Presentations'],['tasks','fa-file-lines','Assignments'],['chat','fa-comments','Chat'],['fb','fa-star','Reviews'],['email','fa-envelope','Email'],['analytics','fa-chart-line','Analytics'],['backup','fa-box-archive','Backup'],['settings','fa-user-gear','Settings']];
const TNAV=[['tdash','fa-house','Home'],['subjects','fa-book-open','My subjects'],['regs','fa-clipboard-list','Presentation Registrations'],['tasks','fa-file-lines','Assignments'],['chat','fa-comments','Chat'],['reviews','fa-star','Reviews'],['tprofile','fa-id-card','Profile']];
function shell(){
  A.nav=(A.nav||0)+1;
  const T=A.role==='teacher';
  setPnav(T?TNAV:NAV,A.page,p=>{A.page=p;shell()},doLogout,T?((A.t&&A.t.name)||'Teacher'):A.user);
  $('#app').innerHTML='<main class="main"><div id="pg"></div></main>';
  (T?{tdash:pgTDash,subjects:pgSubjects,regs:pgRegs,tasks:pgTasks,chat:pgChat,reviews:pgPReviews,tprofile:pgTProfile}:{dash:pgDash,subjects:pgSubjects,teachers:pgTeachers,regs:pgRegs,tasks:pgTasks,chat:pgChat,fb:pgFb,email:pgEmail,analytics:pgAnalytics,backup:pgBackup,settings:pgSettings})[A.page]();
}
async function guard(fn){const tk=A.nav;try{const v=await fn();if(tk!==A.nav)return null;return v}catch(e){if(tk!==A.nav)return null;if(e.status===401){authView();toast('Session expired. Sign in again.','err')}else toast(e.message,'err');return null}}
const warnHTML=()=>A.defpw?'<div class="warn"><i class="fa-solid fa-triangle-exclamation"></i><span>You are still using the default password. <a href="#" id="wl">Change it now</a>.</span></div>':'';
function wireWarn(){const w=$('#wl');if(w)w.onclick=e=>{e.preventDefault();A.page='settings';shell()}}

async function pgDash(){
  const r=await guard(()=>api('stats'));if(!r)return;
  const mx=Math.max(1,...r.bySubject.map(s=>s.regs));
  $('#pg').innerHTML=warnHTML()+'<h2>Dashboard</h2><div class="stats">'
  +[['Total registrations',r.total,''],['Individual students',r.individual,'n'],['Teams',r.teams,'n'],['Registered students',r.students,''],['Pending',r.pending,'a'],['Approved',r.approved,'g'],['Rejected',r.rejected,'r']].map(x=>'<div class="card stat '+x[2]+'"><b>'+x[1]+'</b><span>'+x[0]+'</span></div>').join('')+'</div>'
  +'<div class="card pad"><h3 style="margin-bottom:12px">Subject-wise registrations</h3><div class="dlist">'
  +(r.bySubject.length?r.bySubject.map(s=>'<div class="dr"><div class="dn"><b>'+esc(s.name)+'</b><span class="msg">'+s.regs+' registration'+(s.regs==1?'':'s')+' · '+s.students+' student'+(s.students==1?'':'s')+'</span></div><div class="bar"><i style="width:'+(s.regs/mx*100)+'%"></i></div></div>').join(''):'<div class="empty">No subjects yet. Add one under Subjects.</div>')+'</div></div>';
  $('#pg').querySelector('.stats').insertAdjacentHTML('afterend','<button type="button" class="admrv" id="admrv"><span class="hm-ic"><i class="fa-solid fa-star"></i></span><span class="hm-tx"><b>Reviews &amp; feedback</b><small id="admrvt">Loading…</small></span><i class="fa-solid fa-chevron-right hm-go"></i></button>');
  $('#admrv').onclick=()=>{A.page='fb';shell()};
  (async()=>{try{const d=await api('fb_admin_list'),rt=d.items.filter(x=>x.kind==='review'&&x.stars&&x.status==='pub'),pend=d.items.filter(x=>x.status==='pending').length,e=$('#admrvt');
    if(e)e.innerHTML=(rt.length?'<i class="fa-solid fa-star" style="color:#f59e0b"></i> '+(rt.reduce((a,x)=>a+x.stars,0)/rt.length).toFixed(1)+' · ':'')+d.items.length+' message'+(d.items.length===1?'':'s')+(pend?' · <b style="color:#b45309">'+pend+' waiting</b>':'')}catch(x){const e=$('#admrvt');if(e)e.textContent='Read and reply to reviews'}})();
  wireWarn();
}

const teacherAdmin=s=>(s.teacher_id||s.teacher_name)?teacherLine(s)+'<span class="msg">'+[s.teacher_email].filter(Boolean).map(esc).join(' · ')+'</span>'+(s.teacher_id?'':'<br><span class="badge b-pending">No account</span>'):'<span class="msg">No teacher assigned</span>';
/* ---- batch-wise grouping (admin, teacher and CR panels): a subject's batch = its locked batch, else the default batch of its form ---- */
const subjBatch=s=>String(s.batch_lock||((s.fields||[]).find(f=>f.key==='batch')||{}).def||'').trim()||'No batch';
const batchCmp=(a,b)=>a==='No batch'?1:b==='No batch'?-1:b.localeCompare(a,undefined,{numeric:true,sensitivity:'base'});
const batchList=list=>[...new Set(list.map(subjBatch))].sort(batchCmp);
function batchGroups(list,card){
  const g={};list.forEach(s=>(g[subjBatch(s)]=g[subjBatch(s)]||[]).push(s));
  return Object.keys(g).sort(batchCmp).map(b=>'<section class="bgrp"><div class="bgh"><span class="bgi"><i class="fa-solid fa-users-rectangle"></i></span><h3>'+(b==='No batch'?'No batch set':'Batch '+esc(b))+'</h3><span class="bgc">'+g[b].length+' subject'+(g[b].length>1?'s':'')+'</span></div><div class="grid sgrid">'+g[b].map(card).join('')+'</div></section>').join('');
}
/* v20: ONE Table / Cards switch shared by every admin + teacher list. Default = Table. */
function getView(){if(!A.vw){try{A.vw=localStorage.getItem('pview20')}catch(e){}if(A.vw!=='card'&&A.vw!=='excel')A.vw='table'}return A.vw}
function setView(v){A.vw=v;try{localStorage.setItem('pview20',v)}catch(e){}}
const vtogHTML=()=>{const v=getView();return '<div class="vtog" role="group" aria-label="View"><button type="button" data-sv="table" class="'+(v==='table'?'on':'')+'" title="Table view" aria-label="Table view"><i class="fa-solid fa-table-list"></i><span>Table</span></button><button type="button" data-sv="card" class="'+(v==='card'?'on':'')+'" title="Card view" aria-label="Card view"><i class="fa-solid fa-table-cells-large"></i><span>Cards</span></button><button type="button" data-sv="excel" class="'+(v==='excel'?'on':'')+'" title="Excel view" aria-label="Excel view"><i class="fa-solid fa-file-excel"></i><span>Excel</span></button></div>'};
const wireView=redraw=>$$('#pg [data-sv]').forEach(b=>b.onclick=()=>{if(getView()===b.dataset.sv)return;setView(b.dataset.sv);redraw()});
/* v31: EXCEL VIEW - spreadsheet-style grid shared by every admin / teacher list (column letters, row numbers, cell borders, formula bar, CSV download) */
const xlCol=i=>{let s='';for(i++;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s};
const XLD={};let XLN=0;
const xlPlain=c=>c&&typeof c==='object'?(c.h!==undefined?null:String(c.t==null?'':c.t)):String(c==null?'':c);
const XLP=[['#e8f1ff','#2563eb'],['#e6f6ec','#16a34a'],['#fff3de','#d97706'],['#fde7ef','#db2777'],['#eee8ff','#7c3aed'],['#dff5f3','#0d9488'],['#ffeee3','#ea580c'],['#e9edf3','#64748b']];
let XLPREV=-1;
function xlShell(id,name,heads,body,info,tint){
  const t=tint||['#f7faf8','#217346'];
  const th=heads.map((h,i)=>'<th>'+xlCol(i)+'</th>').join(''),hh=heads.map(h=>'<th title="'+esc(h)+'">'+esc(h)+'</th>').join('');
  return '<div class="xlw" id="'+id+'" style="--xb:'+t[0]+';--xs:'+t[1]+'"><div class="xlbar"><span class="xlnb" data-nb>A1</span><span class="xlfx">fx</span><div class="xlfv" data-fv>'+esc(heads[0]||'')+'</div><button type="button" class="btn sm sec" data-xdl="'+id+'" title="Download as CSV (opens in Excel)"><i class="fa-solid fa-file-csv"></i><span> CSV</span></button></div>'
   +'<div class="xls"><table class="xlt"><thead><tr><th class="xc0"></th>'+th+'</tr><tr class="xh"><th class="xc0">1</th>'+hh+'</tr></thead><tbody>'+body+'</tbody></table></div>'
   +'<div class="xlst"><span class="xtab">'+esc(name)+'</span><span>'+esc(info)+'</span><span class="xlsw"><i class="fa-solid fa-arrows-left-right"></i> Swipe</span></div></div>';
}
function xlGrid(name,heads,rows,o){
  o=o||{};const id='xl'+(++XLN);XLD[id]={name:name,heads:heads,rows:rows};
  const body=rows.map((r,ri)=>'<tr'+(o.rowCls?' class="'+o.rowCls+'"':'')+'><th class="xc0">'+(ri+2)+'</th>'+r.map((c,ci)=>{
    if(c&&typeof c==='object'&&c.h!==undefined)return '<td class="xa">'+c.h+'</td>';
    const v=xlPlain(c),n=/^-?\d{1,9}(\.\d+)?$/.test(v);
    return '<td class="'+(n?'xn ':'')+(c&&typeof c==='object'&&c.c?'x-'+c.c:'')+'" data-xc="'+ci+'" title="'+esc(v)+'">'+esc(v)+'</td>'}).join('')+'</tr>').join('');
  return xlShell(id,name,heads,body,rows.length+' row'+(rows.length===1?'':'s')+' · '+heads.length+' columns',o.tint);
}
const xlSect=(title,count,ci,inner)=>'<section class="xsec"><div class="xsh" style="background:'+XLP[ci%XLP.length][1]+'"><i class="fa-solid fa-layer-group"></i><b>'+esc(title)+'</b><span>'+esc(count)+'</span></div>'+inner+'</section>';
document.addEventListener('click',e=>{
  const dl=e.target.closest&&e.target.closest('[data-xdl]');
  if(dl){const d=XLD[dl.dataset.xdl];if(!d)return;
    const keep=d.heads.map((h,i)=>d.rows.some(r=>xlPlain(r[i])!==null)?i:-1).filter(i=>i>=0),q=v=>'"'+String(v).replace(/"/g,'""')+'"';
    const csv=[keep.map(i=>q(d.heads[i])).join(',')].concat(d.rows.map(r=>keep.map(i=>q(xlPlain(r[i])||'')).join(','))).join('\r\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=d.name.replace(/[^\w\-]+/g,'_')+'.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);return}
  const td=e.target.closest&&e.target.closest('.xlt td[data-xc]');if(!td)return;
  const w=td.closest('.xlw');w.querySelectorAll('.xsel,.xrs').forEach(x=>x.classList.remove('xsel','xrs'));
  td.classList.add('xsel');const tr=td.parentNode;tr.classList.add('xrs');
  w.querySelector('[data-nb]').textContent=xlCol(+td.dataset.xc)+tr.firstChild.textContent;w.querySelector('[data-fv]').textContent=td.title;
});
const xlBtn=(c,a,ic,tt)=>'<button class="btn sm '+c+'" '+a+' title="'+tt+'" aria-label="'+tt+'"><i class="fa-solid '+ic+'"></i></button>';
function subjExcel(list,T,stTxt){
  const dt=ts=>ts?new Date(ts*1000).toLocaleString('en-GB',{...BDZ,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}):'';
  const cnt=(s,k)=>(A.tasks||[]).filter(t=>+t.subject_id===+s.id&&t.kind===k).length,cls={open:'ok',closed:'no',soon:'wn',full:'wn'};
  const heads=['Subject','Code','Batch','Semester','Department','Program'].concat(T?[]:['Teacher'],['Presentation','Deadline','Registrations','Files','Assignments','Lab reports','Actions']);
  const row=s=>[s.name,s.code||'',subjBatch(s)==='No batch'?'':subjBatch(s),semTxt(s),s.department||'',s.program?progLabel(s.program):''].concat(T?[]:[s.teacher_name||''],[
    +s.pres_on?{t:s.late?'Open · Late':(stTxt[s.state]||s.state),c:cls[s.state]||''}:'Not created',
    dt(s.close_ts),+s.reg_count||0,+s.pres_count||0,cnt(s,'assignment'),cnt(s,'lab'),
    {h:xlBtn('sec','data-e="'+s.id+'"','fa-pen','Edit subject')+xlBtn('sec','data-pr="'+s.id+'"','fa-clipboard-list','Presentation Registrations')+xlBtn('dng','data-d="'+s.id+'"','fa-trash','Delete subject')}]);
  const g={};list.forEach(s=>(g[subjBatch(s)]=g[subjBatch(s)]||[]).push(s));
  return Object.keys(g).sort(batchCmp).map((k,i)=>xlSect(k==='No batch'?'No batch set':'Batch '+k,g[k].length+' subject'+(g[k].length>1?'s':''),i,xlGrid(k==='No batch'?'Subjects':'Batch '+k,heads,g[k].map(row),{tint:XLP[i%XLP.length]}))).join('');
}
function teachExcel(list){
  const row=t=>{const on=t.status==='active';return [t.name,t.department||'',teachBatches(t),t.phone||'',t.email||'',+t.subject_count||0,{t:on?'Active':'Blocked',c:on?'ok':'no'},
    {h:xlBtn('sec','data-te="'+t.id+'"','fa-pen','Edit')+xlBtn('sec','data-tb="'+t.id+'"','fa-'+(on?'ban':'lock-open'),on?'Block':'Unblock')+xlBtn('dng','data-td="'+t.id+'"','fa-trash','Delete')}]};
  const g={};list.forEach(t=>(g[t.department||'No department']=g[t.department||'No department']||[]).push(t));
  return Object.keys(g).sort((x,y)=>x==='No department'?1:y==='No department'?-1:x.localeCompare(y)).map((k,i)=>xlSect(k,g[k].length+' teacher'+(g[k].length>1?'s':''),i,xlGrid(k,['Teacher','Department','Batches','Mobile','Gmail','Subjects','Status','Actions'],g[k].map(row),{rowCls:'trw',tint:XLP[i%XLP.length]}))).join('');
}
function taskExcel(list){
  const row=t=>[KIND[t.kind]||t.kind,t.title,t.subject,t.subject_code||'',(t.batches||[]).join(', '),t.program?progLabel(t.program):'',MODE[t.mode]||'',t.msg||'',+t.sub_count||0,{t:t.open?'Open':'Closed',c:t.open?'ok':'no'},
    {h:xlBtn('','data-v="'+t.id+'"','fa-folder-open','Submissions')+xlBtn('sec','data-e="'+t.id+'"','fa-pen','Edit')+xlBtn(+t.is_open?'dng':'','data-o="'+t.id+'" data-c="'+(+t.is_open?1:0)+'"','fa-'+(+t.is_open?'lock':'lock-open'),+t.is_open?'Close':'Open')+xlBtn('dng','data-x="'+t.id+'"','fa-trash','Delete')}];
  const g={};list.forEach(t=>{const k=t.subject+(t.subject_code?' · '+t.subject_code:'');(g[k]=g[k]||[]).push(t)});
  return Object.keys(g).sort((x,y)=>x.localeCompare(y)).map((k,i)=>xlSect(k,g[k].length+' form'+(g[k].length>1?'s':''),i,xlGrid(k,['Type','Title','Subject','Code','Batch','Program','Who','Deadline','Submissions','Status','Actions'],g[k].map(row),{tint:XLP[i%XLP.length]}))).join('');
}
const regBatch=g=>{const L=g.members.find(m=>m.is_leader)||g.members[0]||{},sub=A.subjects.find(x=>x.id===g.subject_id)||{},b=batchNum((L.vals||{}).batch||L.batch||'');if(b)return b;const sb=subjBatch(sub);return sb==='No batch'?'':(batchNum(sb)||sb)};
const batchChip=b=>b&&b!=='No batch'?'<span class="chip meta"><i class="fa-solid fa-users-line"></i> Batch '+esc(b)+'</span>':'';
const teachBatches=t=>{const a=[...new Set((A.subjects||[]).filter(s=>+s.teacher_id===+t.id).map(subjBatch).filter(b=>b&&b!=='No batch'))];return a.sort(batchCmp).map(b=>'Batch '+b).join(', ')};
/* registrations: ONE ROW PER MEMBER - a team shows all its members under one coloured block, an individual shows 1 row */
function regExcel(list){
  const heads=['Ref','Type','Team','Topic','Subject','Code','#','Member name','Student ID','Program','Batch','Phone','Email','Role','Slot','Presentation file','Status','Late','Submitted','Actions'];
  const f0=list[0]||{members:[]},L0=f0.members.find(m=>m.is_leader)||f0.members[0]||{},p0=progLabel(((L0.vals||{}).program)||((A.subjects.find(x=>x.id===f0.subject_id)||{}).program)||'');
  const tint=p0==='Undergraduate'?XLP[0]:p0==='Diploma'?XLP[2]:XLP[7];
  const id='xl'+(++XLN),flat=[];let body='',rn=0;
  const cell=(v,ci,o)=>{o=o||{};const t=xlPlain(v);return '<td'+(o.rs>1?' rowspan="'+o.rs+'"':'')+' class="'+(o.cls||'')+'" data-xc="'+ci+'" title="'+esc(t)+'">'+esc(t)+'</td>'};
  list.forEach((g,gi)=>{
    const col=XLP[gi%XLP.length],ms=g.members.length?g.members.slice().sort((a,b)=>(+!!b.is_leader)-(+!!a.is_leader)):[{}],n=ms.length,team=g.reg_type==='team';
    const sub=A.subjects.find(x=>x.id===g.subject_id)||{},fl=sub.fields||[],tel=fl.find(f=>f.type==='tel'),mail=fl.find(f=>f.type==='email'),st=g.status||'',stT=st?st[0].toUpperCase()+st.slice(1):'',rb=regBatch(g);
    const reg=[g.ref_code,team?'Team ('+n+')':'Individual',team?(g.team_name||''):'',g.topic||'',g.subject_name,sub.code||''];
    const reg2=[slotTxt({date:g.slot_date,label:g.slot_label})||'',g.pres?g.pres.name:'Not uploaded',stT,+g.is_late?'Late':'',(g.created_at||'').slice(0,16)];
    const acts=xlBtn('sec','data-v="'+g.id+'"','fa-eye','View')+xlBtn('','data-a="'+g.id+'"'+(st==='approved'?' disabled':''),'fa-check','Approve')+xlBtn('dng','data-r="'+g.id+'"'+(st==='rejected'?' disabled':''),'fa-ban','Reject')+(g.pres?xlBtn('','data-p="'+g.id+'"','fa-display','Present'):'')+xlBtn('sec','data-m="'+g.id+'"','fa-pen','Edit')+xlBtn('dng','data-x="'+g.id+'"','fa-trash','Delete');
    ms.forEach((m,k)=>{
      const mv=m.vals||{},isL=!!m.is_leader||!team,ph=(tel?mv[tel.key]:mv.phone)||'',em=(isL&&g.leader_email)||(mail?mv[mail.key]:mv.email)||'';
      const mem=[k+1,m.full_name||'',m.student_id||'',progLabel(mv.program||sub.program||'')||'',batchNum(mv.batch||m.batch||'')||rb,ph,em,team?(m.is_leader?'Leader ★':'Member'):'Student'];
      rn++;
      body+='<tr class="xg'+(k===0?' xf':'')+'" style="--rb:'+col[0]+';--rs:'+col[1]+'"><th class="xc0">'+(rn+1)+'</th>';
      if(k===0)reg.forEach((v,i)=>{body+=cell(v,i,{rs:n,cls:i===0?'xref':i===1?'xtype':''})});
      mem.forEach((v,i)=>{body+=cell(v,6+i,{cls:i===4?'xbat':''})});
      if(k===0){reg2.forEach((v,i)=>{body+=cell(v,14+i,{rs:n,cls:i===2?(st==='approved'?'x-ok':st==='rejected'?'x-no':'x-wn'):''})});body+='<td class="xa" rowspan="'+n+'">'+acts+'</td>'}
      body+='</tr>';
      flat.push(reg.concat(mem,reg2,[{h:''}]));
    });
  });
  XLD[id]={name:'Registrations',heads:heads,rows:flat};
  return xlShell(id,'Registrations',heads,body,list.length+' registration'+(list.length===1?'':'s')+' · '+rn+' row'+(rn===1?'':'s'),tint);
}
/* ===== v33: Contact admin (chat) + public Reviews & Feedback ===== */
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('[data-adm]:not(.ch-item)')){try{sessionStorage.setItem('ch_adm','1')}catch(x){}}});
const chSupPin=has=>{if(CH.rooms.some(r=>r.kind==='support')||!has('admin support contact admin'))return '';return '<div class="ch-item ch-adm" data-adm="1" role="button" tabindex="0"><div class="ch-ic"><i class="fa-solid fa-headset"></i></div><div class="ch-meta"><b>Admin Support</b><span>Ask a question, report a problem or share an idea</span></div><span class="btn sm">Message</span></div>'};
async function chOpenSupport(){
  try{const d=await chFetch('chat_support',null,{});await chLoadRooms();CH.tab='chats';CH.q='';const q=$('#chq');if(q)q.value='';chTabs();chRenderList();chOpen(d.room)}
  catch(x){if(x.status===401)chExpired();else toast(x.message,'err')}
}
/* v34: Home shows only ONE small Reviews card (Contact admin now lives inside the Reviews page) */
const hubExtra=()=>'<a class="hubmini" href="#reviews" aria-label="Reviews and feedback"><span class="hm-ic"><i class="fa-solid fa-star"></i></span><span class="hm-tx"><b>Reviews &amp; feedback</b><small id="hmrate">Rate the app, share an idea</small></span><i class="fa-solid fa-chevron-right hm-go"></i></a>';
async function hubRate(){try{const d=await api('fb_list',{q:{}});const e=$('#hmrate');if(e&&d&&d.sum&&d.sum.n)e.innerHTML='<i class="fa-solid fa-star" style="color:#f59e0b"></i> '+d.sum.avg.toFixed(1)+' · '+d.sum.n+' rating'+(d.sum.n>1?'s':'')}catch(e){}}
const FB={kind:'',items:[],more:false,d:null};
const FBK={review:['Review','fa-star'],feedback:['Feedback','fa-comment-dots'],idea:['Idea','fa-lightbulb']};
const fbK=k=>FBK[k]||FBK.review;
const fbWhen=ts=>new Date(ts*1000).toLocaleDateString('en-GB',{...BDZ,day:'2-digit',month:'short',year:'numeric'});
const fbStarsH=(v,sz)=>{v=Math.round((+v||0)*2)/2;let h='<span class="rv-st'+(sz?' '+sz:'')+'" aria-label="'+v+' out of 5 stars">';for(let i=1;i<=5;i++)h+='<i class="fa-solid fa-'+(v>=i-.5&&v<i?'star-half-stroke':'star')+(v>=i-.5?'':' off')+'"></i>';return h+'</span>'};
const FBCOL=['#0d9488','#4338ca','#b45309','#be185d','#0369a1','#7c3aed','#15803d','#c2410c'];
const fbCol=n=>{let h=0;for(const c of String(n||'?'))h=(h*31+c.charCodeAt(0))>>>0;return FBCOL[h%FBCOL.length]};
const fbKey=k=>FBK[k]?k:'review';
const FBL=['','Poor','Fair','Good','Very good','Excellent'];
const fbRoleCls=r=>'r-'+String(r||'').toLowerCase().replace(/[^a-z]+/g,'-');
const fbAvH=(x,cls)=>'<div class="fb-av'+(cls?' '+cls:'')+'" style="background:'+fbCol(x.name)+'">'+(x.photo?'<img src="'+esc(x.photo)+'" alt="" loading="lazy" decoding="async">':esc(String(x.name||'?').trim().charAt(0).toUpperCase()))+'</div>';
const fbCard=x=>'<article class="card fb-it fbc"><div class="fbc-h">'+fbAvH(x)+'<div class="fb-who"><b>'+esc(x.name)+(x.ut?' <i class="fa-solid fa-circle-check fbvf" title="Signed-in member"></i>':'')+'</b><span><em class="fbrole '+fbRoleCls(x.role)+'">'+esc(x.role)+'</em>'+fbWhen(x.ts)+'</span></div>'+(x.stars?'<div class="fbc-st">'+fbStarsH(x.stars)+'</div>':'')+'</div>'
  +'<div class="fbc-m"><span class="fbk '+fbKey(x.kind)+'"><i class="fa-solid '+fbK(x.kind)[1]+'"></i> '+fbK(x.kind)[0]+'</span></div><p class="fb-b">'+esc(x.body)+'</p>'
  +(x.reply?'<div class="fb-r"><b><i class="fa-solid fa-circle-check"></i> Reply from admin'+(x.rts?' · '+fbWhen(x.rts):'')+'</b><p>'+esc(x.reply)+'</p></div>':'')+'</article>';
/* the admin button: on the public page it opens the student chat; inside a teacher / CR / leader panel it opens that panel's own chat with the admin */
const fbAdmBtn=(cls,inner)=>FB.panel?'<button type="button" class="btn '+cls+'" data-pa="1">'+inner+'</button>':'<a class="btn '+cls+'" href="#chat" data-adm="1">'+inner+'</a>';
function fbPanelAdmin(){
  if(FB.panel==='leader'){leaderChat();return}
  try{sessionStorage.setItem('ch_adm','1')}catch(e){}
  A.page='chat';shell();
}
function fbHeroHTML(){
  return '<section class="fbhero"><div class="fbh-l"><span class="fbh-badge"><i class="fa-solid fa-star"></i> Community</span><h1>Reviews &amp; feedback</h1><p>Tell us what you think of this app. Anyone can write one and everyone can read what others wrote.</p>'
    +'<div class="fbh-act"><button type="button" class="btn fbb-w" data-fw="1"><i class="fa-solid fa-pen"></i> Write a review</button>'+fbAdmBtn('fbb-c','<i class="fa-solid fa-headset"></i> Chat with admin')+'</div></div>'
    +'<div class="fbh-r" id="fbhs"></div></section>'
    +'<div id="fbhost"><div class="fbgrid"><div class="fb-sk" style="height:230px"></div><div style="display:grid;gap:14px"><div class="fb-sk"></div><div class="fb-sk"></div></div></div></div>';
}
function fbStart(){$$('[data-fw]').forEach(b=>b.onclick=fbForm);$$('[data-pa]').forEach(b=>b.onclick=fbPanelAdmin);FB.kind='';return fbLoad(true)}
async function fbPage(){
  FB.as='';FB.panel='';
  $('#app').innerHTML='<div class="wrap fbw"><p class="crumb"><a href="#"><i class="fa-solid fa-house"></i> Home</a> › Reviews</p>'+fbHeroHTML()+'</div>';
  await fbStart();
}
/* v35: the same Reviews page inside the teacher / CR panel and the team leader panel (name, role and photo are filled in automatically) */
async function pgPReviews(){
  FB.panel=A.role==='leader'?'leader':'teacher';FB.as=FB.panel;
  $('#pg').innerHTML='<h2>Reviews &amp; feedback</h2><div class="fbw fbwp">'+fbHeroHTML()+'</div>';
  await fbStart();
}
async function fbLoad(reset){
  if(reset){FB.items=[];FB.more=false}
  const q={};if(FB.kind)q.kind=FB.kind;if(!reset&&FB.items.length)q.before=FB.items[FB.items.length-1].id;
  let d;try{d=await api('fb_list',{q})}catch(e){const h=$('#fbhost');if(h)h.innerHTML='<div class="card pad empty">'+esc(e.message)+'</div>';return}
  if(!$('#fbhost'))return;
  FB.d=d;FB.items=FB.items.concat(d.items);FB.more=d.more;fbRender();
}
function fbRender(){
  const d=FB.d,s=d.sum,h=$('#fbhost');if(!h||!d)return;
  const total=d.counts.review+d.counts.feedback+d.counts.idea;
  const bars='<div class="rv-bars">'+[5,4,3,2,1].map(i=>'<div class="rv-bar"><span>'+i+' ★</span><i><b style="width:'+(s.n?Math.round(s.dist[i-1]/s.n*100):0)+'%"></b></i><em>'+s.dist[i-1]+'</em></div>').join('')+'</div>';
  const sum='<div class="card fbsum"><div class="fbs-top"><b class="fbs-n">'+(s.n?s.avg.toFixed(1):'—')+'</b><div class="fbs-r">'+(s.n?fbStarsH(s.avg,'lg')+'<span>'+s.n+' rating'+(s.n>1?'s':'')+'</span>':'<span>No ratings yet</span>')+'</div></div>'+bars
    +(d.on?'<button type="button" class="btn fbsum-w" data-fw="1"><i class="fa-solid fa-pen"></i> Write a review or feedback</button>':'<p class="msg" style="margin:12px 0 0;text-align:center">Reviews are switched off right now.</p>')+'</div>';
  const adm='<div class="card fbadm"><div class="ic"><i class="fa-solid fa-headset"></i></div><h3>Need to talk to the admin?</h3><p>Ask a question, report a problem or share something privately. Start a direct chat with the admin.</p>'+fbAdmBtn('','<i class="fa-solid fa-comments"></i> Chat with admin')+'</div>';
  const tab=(k,l,ic,n)=>'<button type="button" class="fbtab'+(FB.kind===k?' on':'')+'" data-fk="'+k+'"><i class="fa-solid '+ic+'"></i> '+l+' <b>'+n+'</b></button>';
  const list=FB.items.length?'<div class="fb-list">'+FB.items.map(fbCard).join('')+'</div>'+(FB.more?'<div style="text-align:center;margin:16px 0 4px"><button type="button" class="btn sec" id="fbmore"><i class="fa-solid fa-angles-down"></i> Load more</button></div>':'')
    :'<div class="card fbempty"><i class="fa-regular fa-comments"></i><b>Nothing here yet</b><span>Be the first to share your thoughts.</span>'+(d.on?'<button type="button" class="btn" data-fw="1"><i class="fa-solid fa-pen"></i> Write one</button>':'')+'</div>';
  h.innerHTML='<div class="fbgrid"><aside class="fbside">'+sum+adm+'</aside><section class="fbmain"><div class="fbtabs" role="tablist">'+tab('','All','fa-layer-group',total)+tab('review','Reviews','fa-star',d.counts.review)+tab('feedback','Feedback','fa-comment-dots',d.counts.feedback)+tab('idea','Ideas','fa-lightbulb',d.counts.idea)+'</div>'+list+'</section></div>';
  const hs=$('#fbhs');if(hs)hs.innerHTML=s.n?'<b>'+s.avg.toFixed(1)+'</b>'+fbStarsH(s.avg,'lg')+'<span>'+s.n+' rating'+(s.n>1?'s':'')+'</span>':'';
  $$('[data-fk]').forEach(b=>b.onclick=()=>{FB.kind=b.dataset.fk;fbLoad(true)});
  $$('[data-fw]').forEach(b=>{b.onclick=fbForm;if(!d.on){b.disabled=true;b.style.opacity='.5'}else{b.disabled=false;b.style.opacity=''}});
  $$('[data-pa]').forEach(b=>b.onclick=fbPanelAdmin);
  const m=$('#fbmore');if(m)m.onclick=()=>fbLoad(false);
}
async function fbForm(){
  let nm='',me=null;try{nm=localStorage.getItem('fb_name')||''}catch(e){}
  try{const r=await api('fb_me',{q:{as:FB.as||''}});me=r.me||null}catch(e){}
  const V={kind:'review',stars:0,role:'Student',guest:!me};
  const meBox=me?'<div class="fbm-me" id="fbme">'+fbAvH(me)+'<div class="fbm-mt"><small>Posting as</small><b>'+esc(me.name)+'</b><em class="fbrole '+fbRoleCls(me.role)+'">'+esc(me.role)+'</em></div><button type="button" class="fbm-g" id="fbg">Not you? Post as guest</button></div>':'';
  openModal('<div class="mt"><h3>Share your thoughts</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div id="fberr"></div>'
    +meBox
    +'<div class="fbm-kinds" id="fbseg">'+Object.keys(FBK).map(k=>'<button type="button" class="fbm-kind'+(k==='review'?' on':'')+'" data-k="'+k+'"><i class="fa-solid '+FBK[k][1]+'"></i>'+FBK[k][0]+'</button>').join('')+'</div>'
    +'<div class="fbm-rate"><div class="rv-pick" id="fbpick">'+[1,2,3,4,5].map(i=>'<button type="button" data-v="'+i+'" aria-label="'+i+' star'+(i>1?'s':'')+'"><i class="fa-solid fa-star"></i></button>').join('')+'</div><span class="fbm-lbl" id="fbsl"></span></div>'
    +'<div id="fbgf"'+(me?' style="display:none"':'')+'><label class="f"><span class="req">Your name</span><input type="text" id="fbn" maxlength="60" value="'+esc(nm)+'" autocomplete="name" placeholder="e.g. Rahim Uddin"></label>'
    +'<div class="f" style="margin-top:10px"><span>I am a</span><div class="fbm-roles" id="fbr">'+['Student','Teacher','Other'].map((r,i)=>'<button type="button" class="fbm-role'+(i?'':' on')+'" data-r="'+r+'">'+r+'</button>').join('')+'</div></div></div>'
    +'<label class="f" style="margin-top:10px"><span class="req">Your message</span><textarea id="fbb" rows="4" maxlength="600" placeholder="What do you like? What is not working? What would you add?"></textarea></label><div class="rv-cnt"><span id="fbc">0</span>/600</div>'
    +'<input type="text" id="fbw" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">'
    +'<p class="msg" style="font-size:.8rem;margin:8px 0"><i class="fa-solid fa-eye"></i> Your name, role'+(me?', photo':'')+' and message will be shown publicly. Please be kind and do not share phone numbers or passwords.</p>'
    +'<div class="acts"><button class="btn" type="button" id="fbgo"><i class="fa-solid fa-paper-plane"></i> Send</button><button class="btn sec" type="button" onclick="closeModal()">Cancel</button></div>');
  const paint=()=>{$$('#fbpick button').forEach(b=>b.classList.toggle('on',+b.dataset.v<=V.stars));$$('#fbseg button').forEach(b=>b.classList.toggle('on',b.dataset.k===V.kind));$$('#fbr button').forEach(b=>b.classList.toggle('on',b.dataset.r===V.role));
    $('#fbsl').textContent=V.stars?FBL[V.stars]:(V.kind==='review'?'Tap a star to rate':'Rating is optional');
    $('#fbgf').style.display=V.guest?'':'none';const mb=$('#fbme');if(mb)mb.style.display=V.guest?'none':''};
  $$('#fbpick button').forEach(b=>b.onclick=()=>{const v=+b.dataset.v;V.stars=(V.kind!=='review'&&V.stars===v)?0:v;paint()});
  $$('#fbseg button').forEach(b=>b.onclick=()=>{V.kind=b.dataset.k;paint()});
  $$('#fbr button').forEach(b=>b.onclick=()=>{V.role=b.dataset.r;paint()});
  const g=$('#fbg');if(g)g.onclick=()=>{V.guest=true;paint()};
  const ta=$('#fbb'),cnt=()=>{$('#fbc').textContent=ta.value.length};ta.oninput=cnt;cnt();paint();
  $('#fbgo').onclick=async()=>{
    const b=$('#fbgo'),er=$('#fberr');er.innerHTML='';
    if((V.guest&&!$('#fbn').value.trim())||!ta.value.trim()){er.innerHTML='<div class="err">Please write '+(V.guest?'your name and ':'')+'a message.</div>';return}
    if(V.kind==='review'&&V.stars<1){er.innerHTML='<div class="err">Please choose a star rating.</div>';return}
    b.disabled=true;
    try{
      const r=await api('fb_add',{json:{kind:V.kind,stars:V.stars,as:FB.as||'',guest:V.guest?1:0,name:$('#fbn').value,role:V.role,body:ta.value,website:$('#fbw').value}});
      if(V.guest){try{localStorage.setItem('fb_name',$('#fbn').value.trim())}catch(e){}}
      openModal('<div style="text-align:center;padding:10px"><div class="tick"><i class="fa-solid fa-check"></i></div><h3>Thank you!</h3><p class="msg">'+(r.status==='pending'?'Your message was received. It will appear here after the admin approves it.':'Your message is now visible on the Reviews page.')+'</p><button class="btn" onclick="closeModal()">Done</button></div>');
      fbLoad(true);
    }catch(e){b.disabled=false;er.innerHTML='<div class="err">'+esc(e.message)+'</div>'}
  };
}
/* ----- admin: moderate public reviews & feedback ----- */
const fbBadge=st=>'<span class="badge b-'+(st==='pub'?'approved':st==='pending'?'pending':'closed')+'">'+(st==='pub'?'Visible':st==='pending'?'Waiting':'Hidden')+'</span>';
const fbActs=(x,ic)=>{const b=(c,a,i,t,l)=>'<button class="btn sm '+c+'" '+a+' title="'+t+'" aria-label="'+t+'"><i class="fa-solid '+i+'"></i>'+(ic?'':' '+l)+'</button>';
  return (x.status==='pub'?b('sec','data-fs="'+x.id+'" data-s="hidden"','fa-eye-slash','Hide','Hide'):b('','data-fs="'+x.id+'" data-s="pub"','fa-check',x.status==='pending'?'Approve':'Show',x.status==='pending'?'Approve':'Show'))+b('sec','data-fr="'+x.id+'"','fa-reply','Reply','Reply')+b('dng','data-fd="'+x.id+'"','fa-trash','Delete','')};
function fbAdminCard(x){return '<div class="card fb-it'+(x.status==='hidden'?' hid':'')+'"><div class="fb-h">'+fbAvH(x)+'<div class="fb-who"><b>'+esc(x.name)+(x.ut?' <i class="fa-solid fa-circle-check fbvf" title="Signed-in member"></i>':'')+'</b><span>'+esc(x.role)+' · '+fbWhen(x.ts)+'</span></div>'+fbBadge(x.status)+'</div>'
  +'<div class="chips"><span class="chip meta"><i class="fa-solid '+fbK(x.kind)[1]+'"></i> '+fbK(x.kind)[0]+'</span>'+(x.stars?fbStarsH(x.stars):'')+'</div><p class="fb-b">'+esc(x.body)+'</p>'
  +(x.reply?'<div class="fb-r"><b><i class="fa-solid fa-shield-halved"></i> Your reply</b><p>'+esc(x.reply)+'</p></div>':'')+'<div class="sc-a">'+fbActs(x,0)+'</div></div>'}
function fbAdminTable(list){return '<div class="card"><div class="tw"><table><tr><th>Type</th><th>Name</th><th>Role</th><th>Stars</th><th>Message</th><th>Status</th><th>Date</th><th></th></tr>'
  +list.map(x=>'<tr'+(x.status==='hidden'?' style="opacity:.55"':'')+'><td>'+esc(fbK(x.kind)[0])+'</td><td><b>'+esc(x.name)+'</b></td><td>'+esc(x.role)+'</td><td>'+(x.stars?fbStarsH(x.stars):'—')+'</td><td style="min-width:240px">'+esc(x.body)+(x.reply?'<br><small><b>Reply:</b> '+esc(x.reply)+'</small>':'')+'</td><td>'+fbBadge(x.status)+'</td><td>'+esc(fbWhen(x.ts))+'</td><td><div class="row">'+fbActs(x,1)+'</div></td></tr>').join('')+'</table></div></div>'}
function fbAdminExcel(list){
  const g={};list.forEach(x=>{(g[x.kind]=g[x.kind]||[]).push(x)});
  const heads=['Type','Name','Role','Stars','Message','Status','Admin reply','Date','Actions'];
  const row=x=>[fbK(x.kind)[0],x.name,x.role,x.stars||'',x.body,{t:x.status==='pub'?'Visible':x.status==='pending'?'Waiting':'Hidden',c:x.status==='pub'?'ok':x.status==='pending'?'wn':'no'},x.reply||'',new Date(x.ts*1000).toISOString().slice(0,16).replace('T',' '),{h:fbActs(x,1)}];
  return Object.keys(g).map((k,i)=>xlSect(fbK(k)[0]+'s',g[k].length+' item'+(g[k].length>1?'s':''),i,xlGrid(fbK(k)[0]+'s',heads,g[k].map(row),{tint:XLP[i%XLP.length]}))).join('');
}
async function pgFb(){
  const r=await guard(()=>api('fb_admin_list'));if(!r)return;
  const V=getView(),rows=r.items,rated=rows.filter(x=>x.kind==='review'&&x.stars&&x.status==='pub'),avg=rated.length?rated.reduce((a,x)=>a+x.stars,0)/rated.length:0;
  const stat=(n,l)=>'<div class="rv-stat"><b>'+n+'</b><span>'+l+'</span></div>';
  $('#pg').innerHTML=warnHTML()+'<div class="tools"><h2 style="margin:0;margin-right:auto">Reviews &amp; feedback</h2>'+vtogHTML()
    +'<button class="btn sm '+(r.moderate?'':'sec')+'" id="fbmod"><i class="fa-solid fa-'+(r.moderate?'toggle-on':'toggle-off')+'"></i> Approve first: '+(r.moderate?'ON':'OFF')+'</button>'
    +'<button class="btn sm '+(r.on?'sec':'dng')+'" id="fbon"><i class="fa-solid fa-'+(r.on?'toggle-on':'toggle-off')+'"></i> Public page: '+(r.on?'ON':'OFF')+'</button></div>'
    +'<p class="msg" style="margin:-6px 0 12px">Everyone can read the visible items on the <b>Reviews</b> page. Turn <b>Approve first</b> on if you want to check each new message before it appears.</p>'
    +'<div class="rv-stats">'+stat(rows.length,'Total')+stat(avg?avg.toFixed(1)+' ★':'—','Average rating')+stat(rows.filter(x=>x.status==='pending').length,'Waiting')+stat(rows.filter(x=>x.status==='hidden').length,'Hidden')+'</div>'
    +(rows.length?(V==='excel'?fbAdminExcel(rows):V==='table'?fbAdminTable(rows):'<div class="grid sgrid">'+rows.map(fbAdminCard).join('')+'</div>'):'<div class="card empty"><i class="fa-solid fa-star" style="font-size:1.8rem;display:block;margin-bottom:8px"></i>No reviews or feedback yet.</div>');
  wireView(pgFb);
  $('#fbmod').onclick=async()=>{if(await guard(()=>api('fb_admin_setting',{json:{moderate:r.moderate?0:1}}))){toast(r.moderate?'New messages now appear right away.':'New messages now wait for your approval.');pgFb()}};
  $('#fbon').onclick=async()=>{if(await guard(()=>api('fb_admin_setting',{json:{on:r.on?0:1}}))){toast(r.on?'Public reviews switched off.':'Public reviews switched on.');pgFb()}};
  $$('[data-fs]').forEach(b=>b.onclick=async()=>{if(await guard(()=>api('fb_admin_status',{json:{id:+b.dataset.fs,status:b.dataset.s}}))){toast(b.dataset.s==='pub'?'Now visible to everyone.':'Hidden from the public page.');pgFb()}});
  $$('[data-fd]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this message for good?'))return;if(await guard(()=>api('fb_admin_delete',{json:{id:+b.dataset.fd}}))){toast('Deleted.');pgFb()}});
  $$('[data-fr]').forEach(b=>b.onclick=()=>{
    const x=rows.find(y=>y.id===+b.dataset.fr);if(!x)return;
    openModal('<div class="mt"><h3>Reply to '+esc(x.name)+'</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><p class="msg" style="margin:0 0 10px">'+esc(x.body)+'</p>'
      +'<label class="f">Your public reply<textarea id="fbrt" rows="3" maxlength="400" placeholder="Everyone will see this reply under the message.">'+esc(x.reply)+'</textarea></label>'
      +'<div class="acts"><button class="btn" id="fbrs">Save reply</button><button class="btn sec" onclick="closeModal()">Cancel</button></div>');
    $('#fbrs').onclick=async()=>{if(await guard(()=>api('fb_admin_reply',{json:{id:x.id,reply:$('#fbrt').value}}))){closeModal();toast('Reply saved.');pgFb()}};
  });
}
async function pgSubjects(){
  const T=A.role==='teacher';
  const SV=getView();
  const [r,tr,tkr]=await Promise.all([guard(()=>api('subjects_admin')),T?null:guard(()=>api('teachers_admin')),guard(()=>api('tasks_admin'))]);
  if(!r)return;A.subjects=r.subjects;A.tasks=tkr?tkr.tasks:[];SRV_OFF=r.server_now*1000-Date.now();
  if(!T&&tr)A.teachers=tr.teachers;
  const stTxt={open:'Open',closed:'Closed',soon:'Not open yet',full:'Full'};
  if(r.options)OPTS=Object.assign(OPTS,r.options);
  const SF=A.sf||(A.sf={sem:'',dept:'',prog:'',batch:''}),uq=a=>[...new Set(a.filter(Boolean))];
  const SUBS=A.subjects.filter(x=>(!SF.sem||semTxt(x)===SF.sem)&&(!SF.dept||x.department===SF.dept)&&(!SF.prog||x.program===SF.prog)&&(!SF.batch||subjBatch(x)===SF.batch));
  const sfo=(id,label,list,cur)=>'<select class="sfsel" id="'+id+'"><option value="">'+label+'</option>'+list.map(x=>'<option value="'+esc(x)+'" '+(x===cur?'selected':'')+'>'+esc(id==='sf-prog'?progLabel(x):x)+'</option>').join('')+'</select>';
  const sfBar=A.subjects.length>1?'<div class="sfil">'+sfo('sf-sem','All semesters',uq(A.subjects.map(semTxt)),SF.sem)+sfo('sf-dept','All departments',uq(A.subjects.map(x=>x.department)),SF.dept)+sfo('sf-prog','All programs',progOpts3(A.subjects.map(x=>x.program)),SF.prog)+sfo('sf-batch','All batches',batchList(A.subjects),SF.batch)+'</div>':'';
  $('#pg').innerHTML=warnHTML()+'<div class="tools"><h2 style="margin:0;margin-right:auto">'+(T?'My subjects':'Subjects')+'</h2>'+vtogHTML()+'<button class="btn" id="add"><i class="fa-solid fa-plus"></i> '+(T?'Create new subject':'Add subject')+'</button></div>'
  +sfBar+(A.subjects.length?(SUBS.length?(SV==='excel'?subjExcel(SUBS,T,stTxt):SV==='table'?subjTables(SUBS,T,stTxt):batchGroups(SUBS,s=>'<div class="card scard"><div class="sc-h"><h3>'+esc(s.name)+(s.code?' <span class="scode">'+esc(s.code)+'</span>':'')+'</h3><span class="badge b-'+s.state+'">'+(s.late?'Open · Late':stTxt[s.state])+'</span></div>'
    +'<div class="chips" style="margin:2px 0 8px">'+batchChip(subjBatch(s))+metaChips(s)+'</div>'+(T?'':'<div class="sc-t">'+teacherAdmin(s)+'</div>')
    +actBlocks(s,T,stTxt)
    +'<div class="sc-a"><button class="btn sm sec" data-e="'+s.id+'"><i class="fa-solid fa-pen"></i> Edit subject</button><button class="btn sm dng" data-d="'+s.id+'"><i class="fa-solid fa-trash"></i> Delete subject</button></div></div>')):'<div class="card empty">No subjects match these filters.</div>')
  :'<div class="card empty"><i class="fa-solid fa-book-open" style="font-size:1.8rem;display:block;margin-bottom:8px"></i>'+(T?'You have no subjects yet. Click “Create new subject” to open a registration for your course.':'No subjects yet. Click “Add subject” to create the first one.')+'</div>');
  wireWarn();$('#add').onclick=()=>subjectForm();
  wireView(pgSubjects);
  [['sf-sem','sem'],['sf-dept','dept'],['sf-prog','prog'],['sf-batch','batch']].forEach(([i,k])=>{const e=$('#'+i);if(e)e.onchange=()=>{SF[k]=e.value;pgSubjects()}});
  $$('[data-e]').forEach(b=>b.onclick=()=>subjectForm(A.subjects.find(s=>s.id==b.dataset.e)));
  $$('[data-pe]').forEach(b=>b.onclick=()=>presForm(A.subjects.find(s=>s.id==b.dataset.pe)));
  $$('[data-ex]').forEach(b=>b.onclick=()=>extendForm(A.subjects.find(s=>s.id==b.dataset.ex)));
  $$('[data-t]').forEach(b=>b.onclick=async()=>{const cl=b.dataset.c==='1';if(cl&&!confirm('Close registration? Nobody will be able to register until you open it again.'))return;if(await guard(()=>api('subject_toggle',{json:{id:+b.dataset.t}}))){toast(cl?'Registration closed.':'Registration opened.');pgSubjects()}});
  $$('[data-d]').forEach(b=>b.onclick=async()=>{const s=A.subjects.find(x=>x.id==b.dataset.d);if(!confirm('Delete “'+s.name+'” and all '+s.reg_count+' registration(s) under it? This cannot be undone.'))return;if(await guard(()=>api('subject_delete',{json:{id:s.id}}))){toast('Subject deleted.');pgSubjects()}});
  $$('[data-ta]').forEach(b=>b.onclick=()=>{const[sid,k]=b.dataset.ta.split(':');taskForm({id:0,subject_id:+sid,kind:k,title:'',details:'',mode:'both',due_local:'',max_mb:10},A.subjects)});
  $$('[data-te]').forEach(b=>b.onclick=()=>taskForm(A.tasks.find(x=>x.id==b.dataset.te),A.subjects));
  $$('[data-tk]').forEach(b=>b.onclick=async()=>{const [sid,k]=b.dataset.tk.split(':'),cl=b.dataset.c==='1',L=(A.tasks||[]).filter(t=>+t.subject_id===+sid&&t.kind===k);if(cl&&!confirm('Close all '+(k==='lab'?'lab reports':'assignments')+' of this subject? Nobody will be able to submit until you open them again.'))return;for(const t of L){if((+t.is_open===1)===cl){if(!await guard(()=>api('task_toggle',{json:{id:t.id}})))return}}toast(cl?'Submissions closed.':'Submissions opened.');pgSubjects()});
  $$('[data-tt]').forEach(b=>b.onclick=async()=>{const cl=b.dataset.c==='1';if(cl&&!confirm('Close submissions? Nobody will be able to submit until you open it again.'))return;if(await guard(()=>api('task_toggle',{json:{id:+b.dataset.tt}}))){toast(cl?'Submissions closed.':'Submissions opened.');pgSubjects()}});
  $$('[data-tx]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this form and all its uploaded files? This cannot be undone.'))return;if(await guard(()=>api('task_delete',{json:{id:+b.dataset.tx}}))){toast('Deleted.');pgSubjects()}});
  $$('[data-tv]').forEach(b=>b.onclick=()=>subsView(+b.dataset.tv));
  $$('[data-pr]').forEach(b=>b.onclick=()=>{A.f.subject=b.dataset.pr;A.page='regs';shell()});
}
/* ---- table view of the Subjects page: compact, one row per subject (same buttons / handlers as the card view) ---- */
function subjTables(list,T,stTxt){
  const g={};list.forEach(s=>(g[subjBatch(s)]=g[subjBatch(s)]||[]).push(s));
  const sd=ts=>new Date(ts*1000).toLocaleString('en-GB',{...BDZ,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true}).replace(/\b[ap]m\b/,m=>m.toUpperCase());
  const ib=(cls,attr,ic,tt,txt)=>'<button class="btn sm '+cls+'" '+attr+' title="'+tt+'" aria-label="'+tt+'"><i class="fa-solid '+ic+'"></i>'+(txt?'<span>'+txt+'</span>':'')+'</button>';
  const tkc=(s,k)=>{
    const L=(A.tasks||[]).filter(t=>+t.subject_id===+s.id&&t.kind===k),any=L.some(t=>+t.is_open);
    return '<div class="tc-h"><b>'+L.length+'</b><span class="msg">created</span><span class="sp">'+ib('','data-ta="'+s.id+':'+k+'"','fa-plus','Create','')+(L.length?ib(any?'dng':'sec','data-tk="'+s.id+':'+k+'" data-c="'+(any?1:0)+'"','fa-'+(any?'lock':'lock-open'),(any?'Close':'Open')+(L.length>1?' all':''),'')+'':'')+'</span></div>'
      +L.map(t=>'<div class="trow"><div class="tt"><b title="'+esc(t.title)+'">'+esc(t.title)+'</b><span class="badge b-'+(t.open?'open':'closed')+'">'+(t.open?'Open':'Closed')+'</span></div><span class="msg tl">'+t.sub_count+' submission'+(+t.sub_count===1?'':'s')+' · '+MODE[t.mode]+'</span>'+tCd(t)
      +'<div class="tb">'+ib('','data-tv="'+t.id+'"','fa-folder-open','Submissions','')+ib('sec','data-te="'+t.id+'"','fa-pen','Edit','')+ib(+t.is_open?'dng':'sec','data-tt="'+t.id+'" data-c="'+(+t.is_open?1:0)+'"','fa-'+(+t.is_open?'lock':'lock-open'),+t.is_open?'Close':'Open','')+ib('dng','data-tx="'+t.id+'"','fa-trash','Delete','')+'</div></div>').join('');
  };
  const presCell=s=>+s.pres_on
    ?'<div class="tc-h"><span class="badge b-'+s.state+'">'+(s.late?'Open · Late':stTxt[s.state])+'</span><span class="sp">'+ib(+s.is_open?'dng':'sec','data-t="'+s.id+'" data-c="'+(+s.is_open?1:0)+'"','fa-'+(+s.is_open?'lock':'lock-open'),+s.is_open?'Close registration':'Open registration','')+'</span></div>'
      +'<div class="msg tl">'+(s.close_ts?'Due '+esc(sd(s.close_ts)):'No deadline')+'</div>'+(s.close_ts&&s.state==='open'?'<div class="cdb tcd">'+cdHTML(s.close_ts)+'</div>':'')
      +'<div class="msg tl"><b>'+s.reg_count+'</b> reg · <b>'+s.pres_count+'</b> files · '+s.slots.length+' slot'+(s.slots.length===1?'':'s')+'</div>'
      +'<div class="tb">'+ib('','data-pr="'+s.id+'"','fa-clipboard-list','Presentation Registrations','Regs')+ib('sec','data-pe="'+s.id+'"','fa-sliders','Settings','')+ib('sec','data-ex="'+s.id+'"','fa-clock-rotate-left','Extend','')+'</div>'
    :'<div class="tc-h"><b>0</b><span class="msg">created</span><span class="sp">'+ib('','data-pe="'+s.id+'"','fa-plus','Create','')+'</span></div>';
  const tct=s=>(s.teacher_id||s.teacher_name)?'<b>'+esc(s.teacher_name||'—')+'</b>'+(s.teacher_dept?'<div class="msg tl">'+esc(s.teacher_dept)+'</div>':'')+(s.teacher_id?'':'<span class="badge b-pending">No account</span>'):'<span class="msg">None</span>';
  const head='<thead><tr><th>Subject</th><th>Batch</th>'+(T?'':'<th>Teacher</th>')+'<th>Presentation</th><th>Assignment</th><th>Lab report</th><th>Actions</th></tr></thead>';
  return Object.keys(g).sort(batchCmp).map(b=>'<section class="bgrp"><div class="bgh"><span class="bgi"><i class="fa-solid fa-users-rectangle"></i></span><h3>'+(b==='No batch'?'No batch set':'Batch '+esc(b))+'</h3><span class="bgc">'+g[b].length+' subject'+(g[b].length>1?'s':'')+'</span></div>'
    +'<div class="card"><div class="tw"><table class="stbl">'+head+'<tbody>'+g[b].map(s=>'<tr>'
      +'<td class="tcs"><b>'+esc(s.name)+'</b>'+(s.code?' <span class="scode">'+esc(s.code)+'</span>':'')+'<div class="chips">'+metaChips(s)+'</div></td>'
      +'<td class="tcb">'+esc(subjBatch(s)==='No batch'?'—':subjBatch(s))+'</td>'
      +(T?'':'<td class="tct">'+tct(s)+'</td>')
      +'<td class="tcc">'+presCell(s)+'</td>'
      +'<td class="tcc">'+tkc(s,'assignment')+'</td>'
      +'<td class="tcc">'+tkc(s,'lab')+'</td>'
      +'<td class="tca"><div class="tb">'+ib('sec','data-e="'+s.id+'"','fa-pen','Edit subject','')+ib('dng','data-d="'+s.id+'"','fa-trash','Delete subject','')+'</div></td>'
    +'</tr>').join('')+'</tbody></table></div></div></section>').join('');
}
/* the three controls every subject card has: Presentation, Assignment, Lab report (each one is independent) */
function actBlocks(s,T,stTxt){
  const tk=k=>(A.tasks||[]).filter(t=>+t.subject_id===+s.id&&t.kind===k);
  const taskBlock=(k,ic,lab)=>{const L=tk(k);
    return '<div class="act"><div class="act-h"><span class="ai"><i class="fa-solid '+ic+'"></i></span><b>'+lab+'</b><span class="msg">'+L.length+' created</span><button class="btn sm sp" data-ta="'+s.id+':'+k+'"><i class="fa-solid fa-plus"></i> Create</button>'+(L.length?(()=>{const any=L.some(t=>+t.is_open);return '<button class="btn sm '+(any?'dng':'')+'" data-tk="'+s.id+':'+k+'" data-c="'+(any?1:0)+'" title="'+(any?'Close every '+lab.toLowerCase()+' of this subject':'Open every '+lab.toLowerCase()+' of this subject')+'"><i class="fa-solid fa-'+(any?'lock':'lock-open')+'"></i> '+(any?'Close':'Open')+(L.length>1?' all':'')+'</button>'})():'')+'</div>'
    +(L.length?L.map(t=>'<div class="trow"><div class="tt"><b>'+esc(t.title)+'</b><span class="badge b-'+(t.open?'open':'closed')+'">'+(t.open?'Open':'Closed')+'</span></div><span class="msg" style="margin:0">'+esc(t.msg)+' · '+MODE[t.mode]+' · '+t.sub_count+' submission'+(+t.sub_count===1?'':'s')+'</span>'+tCd(t)
      +'<div class="tb"><button class="btn sm" data-tv="'+t.id+'"><i class="fa-solid fa-folder-open"></i> Submissions</button><button class="btn sm sec" data-te="'+t.id+'"><i class="fa-solid fa-pen"></i> Edit</button><button class="btn sm '+(+t.is_open?'dng':'')+'" data-tt="'+t.id+'" data-c="'+(+t.is_open?1:0)+'" title="'+(+t.is_open?'Close now: nobody can submit, not even late':'Allow submissions again')+'"><i class="fa-solid fa-'+(+t.is_open?'lock':'lock-open')+'"></i> '+(+t.is_open?'Close':'Open')+'</button><button class="btn sm dng" data-tx="'+t.id+'" title="Delete"><i class="fa-solid fa-trash"></i></button></div></div>').join(''):'<p class="msg" style="margin:0">No '+lab.toLowerCase()+' yet. Tap Create to add one.</p>')+'</div>'};
  const presNone='<div class="act"><div class="act-h"><span class="ai"><i class="fa-solid fa-display"></i></span><b>Presentation</b><span class="msg">0 created</span><button class="btn sm sp" data-pe="'+s.id+'"><i class="fa-solid fa-plus"></i> Create</button></div><p class="msg" style="margin:0">No presentation yet. Tap Create to set up registration, slots and upload rules.</p></div>';
  return '<div class="acts3">'+(+s.pres_on?'<div class="act"><div class="act-h"><span class="ai"><i class="fa-solid fa-display"></i></span><b>Presentation</b><span class="badge b-'+s.state+' sp">'+(s.late?'Open · Late':stTxt[s.state])+'</span><button class="btn sm '+(+s.is_open?'dng':'')+'" data-t="'+s.id+'" data-c="'+(+s.is_open?1:0)+'" title="'+(+s.is_open?'Close now: nobody can register, not even late':'Allow registration again')+'"><i class="fa-solid fa-'+(+s.is_open?'lock':'lock-open')+'"></i> '+(+s.is_open?'Close':'Open')+'</button></div>'
    +'<dl class="kv"><div class="wide"><dt>Deadline</dt><dd>'+(s.close_ts?esc(fmtBD(s.close_ts)):'No deadline')+(s.close_ts&&s.state==='open'?'<div style="margin-top:6px">'+cdHTML(s.close_ts)+'</div>':'')+'</dd></div>'
    +'<div class="wide"><dt>Types</dt><dd>'+([s.allow_individual?'Individual':'',s.allow_team?'Team '+s.min_team+'–'+s.max_team:''].filter(Boolean).join(' · ')||'—')+'</dd></div>'
    +'<div><dt>Slots</dt><dd>'+s.slots.length+'</dd></div><div><dt>Presentation Registrations</dt><dd>'+s.reg_count+'</dd></div><div class="wide"><dt>Presentation files</dt><dd>'+s.pres_count+' uploaded · '+'upload always open'+'</dd></div></dl>'
    +'<div class="tb"><button class="btn sm" data-pr="'+s.id+'"><i class="fa-solid fa-clipboard-list"></i> Presentation Registrations</button><button class="btn sm sec" data-pe="'+s.id+'"><i class="fa-solid fa-sliders"></i> Settings</button><button class="btn sm sec" data-ex="'+s.id+'"><i class="fa-solid fa-clock-rotate-left"></i> Extend</button></div></div>':presNone)
    +taskBlock('assignment','fa-file-lines','Assignment')+taskBlock('lab','fa-flask','Lab report')+'</div>';
}
function slotRow(s={}){return '<div class="srow"><input type="date" class="s-d" value="'+esc(s.date||'')+'"><input type="text" class="s-l" maxlength="60" placeholder="Label, e.g. 10:00 AM" value="'+esc(s.label||'')+'"><input type="number" class="s-c" min="1" max="500" value="'+(s.capacity||1)+'" title="Capacity (registrations)"><button type="button" class="btn sm dng s-x"><i class="fa-solid fa-xmark"></i></button><input type="hidden" class="s-i" value="'+(s.id||0)+'"></div>'}
const FTYPES=[['text','Text'],['number','Number'],['tel','Phone number'],['email','Email'],['date','Date'],['select','Dropdown']];
function fieldRow(f,i,n){
  const o=(a,v)=>a.map(x=>'<option value="'+x[0]+'" '+(x[0]===v?'selected':'')+'>'+x[1]+'</option>').join('');
  return '<div class="mcard frow" data-k="'+esc(f.key)+'"><div class="mhead"><h4>Field '+(i+1)+'</h4><button type="button" class="btn sm sec fu" '+(i?'':'disabled')+' title="Move up"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="btn sm sec fd" '+(i<n-1?'':'disabled')+' title="Move down"><i class="fa-solid fa-arrow-down"></i></button><button type="button" class="btn sm dng fx" title="Delete field"><i class="fa-solid fa-trash"></i></button></div><div class="fg">'
  +'<label class="f">Label<input type="text" class="fl-l" maxlength="60" placeholder="e.g. Roll number" value="'+esc(f.label)+'"></label>'
  +'<label class="f">Field type<select class="fl-t">'+o(FTYPES,f.type)+'</select></label>'
  +'<label class="f">Required?<select class="fl-r">'+o([['yes','Required for everyone'],['leader','Required for team leader only'],['no','Optional']],f.req)+'</select></label>'
  +'<label class="f">Used as<select class="fl-o">'+o([['','Normal field'],['id','Unique ID (blocks duplicates)'],['name','Display name']],f.role||'')+'</select></label>'
  +'<label class="f fl-opw" style="'+(f.type==='select'?'':'display:none')+'">Dropdown options <small>Separate with commas</small><input type="text" class="fl-op" value="'+esc((f.opts||[]).join(', '))+'"></label>'
  +'<label class="f fl-dw">Default value <small>Optional</small><input type="text" class="fl-d" maxlength="60" value="'+esc(f.def||'')+'"></label></div></div>';
}
function readFields(){
  return $$('#flist .frow').map(r=>({key:r.dataset.k,label:r.querySelector('.fl-l').value.trim(),type:r.querySelector('.fl-t').value,req:r.querySelector('.fl-r').value,role:r.querySelector('.fl-o').value,opts:r.querySelector('.fl-op').value.split(',').map(x=>x.trim()).filter(Boolean),def:r.querySelector('.fl-d').value.trim()}));
}
function drawFields(list){
  list=list.filter(f=>f.type!=='photo');
  $('#flist').innerHTML=list.length?list.map((f,i)=>fieldRow(f,i,list.length)).join(''):'<div class="empty">No fields yet. Add at least one field.</div>';
  $$('#flist .frow').forEach((r,i)=>{
    const mv=d=>{const l=readFields();const j=i+d;[l[i],l[j]]=[l[j],l[i]];drawFields(l)};
    r.querySelector('.fu').onclick=()=>mv(-1);r.querySelector('.fd').onclick=()=>mv(1);
    r.querySelector('.fx').onclick=()=>{const l=readFields();l.splice(i,1);drawFields(l)};
    r.querySelector('.fl-t').onchange=e=>{const p=e.target.value==='photo';r.querySelector('.fl-opw').style.display=e.target.value==='select'?'':'none';r.querySelector('.fl-dw').style.display=p?'none':'';r.querySelector('.fl-r').disabled=p;r.querySelector('.fl-o').disabled=p};
    r.querySelector('.fl-t').dispatchEvent(new Event('change'));
  });
}
function glRow(b){
  return '<div class="mcard glrow"><div class="mhead"><h4>Section</h4><button type="button" class="btn sm sec gu" title="Move up"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="btn sm sec gd" title="Move down"><i class="fa-solid fa-arrow-down"></i></button><button type="button" class="btn sm dng gx" title="Delete section"><i class="fa-solid fa-trash"></i></button></div>'
  +'<label class="f">Title<input type="text" class="gl-t" maxlength="80" placeholder="e.g. Rules, How to present, Evaluation" value="'+esc(b.title||'')+'"></label>'
  +'<label class="f" style="margin-top:10px">Points <small>One point per line</small><textarea class="gl-i" rows="5" maxlength="8000" placeholder="Write each rule or instruction on its own line">'+esc((b.items||[]).join('\n'))+'</textarea></label></div>';
}
function readGl(){return $$('#glist .glrow').map(r=>({title:r.querySelector('.gl-t').value.trim(),items:r.querySelector('.gl-i').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}))}
function drawGl(list){
  $('#glist').innerHTML=list.length?list.map(glRow).join(''):'<div class="empty">No guidelines yet. Add a section to show rules or instructions to students.</div>';
  $$('#glist .glrow').forEach((r,i)=>{
    const mv=d=>{const l=readGl(),j=i+d;if(j<0||j>=l.length)return;[l[i],l[j]]=[l[j],l[i]];drawGl(l)};
    r.querySelector('.gu').onclick=()=>mv(-1);r.querySelector('.gd').onclick=()=>mv(1);
    r.querySelector('.gx').onclick=()=>{const l=readGl();l.splice(i,1);drawGl(l)};
  });
}
const optsOf=(list,cur)=>{list=(list||[]).slice();if(cur&&!list.includes(cur))list.push(cur);return list.map(x=>'<option '+(x===cur?'selected':'')+'>'+esc(x)+'</option>').join('')};
function subjectForm(s){
  s=s||{id:0,name:'',code:'',course_teacher:'',semester_term:'',semester_year:new Date().getFullYear(),department:'',program:'',teacher_id:0,batch_lock:''};
  const tOpts=(s.id&&!s.teacher_id&&s.teacher_name?'<option value="-1" selected>Keep: '+esc(s.teacher_name)+' (no account)</option>':'')+'<option value="0" '+(s.teacher_id||(s.id&&s.teacher_name)?'':'selected')+'>— No teacher —</option>'+(A.teachers||[]).map(t=>'<option value="'+t.id+'" '+(+s.teacher_id===t.id?'selected':'')+'>'+esc(t.name)+' · '+esc(t.department)+'</option>').join('');
  openModal('<div class="mt"><h3>'+(s.id?'Edit subject':'Add subject')+'</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div id="merr"></div><div class="fg">'
  +'<label class="f" style="grid-column:1/-1"><span class="req">Subject name</span><input type="text" id="sn" maxlength="120" value="'+esc(s.name)+'"></label>'
  +'<label class="f">Subject code <small>Optional · e.g. CSE-4101</small><input type="text" id="scode" maxlength="30" value="'+esc(s.code||'')+'"></label>'
  +((A.role==='teacher'&&A.t&&A.t.acct_type==='cr')?'<label class="f">Course teacher name <small>Optional · shown on the form</small><input type="text" id="sct" maxlength="80" value="'+esc(s.course_teacher||'')+'"></label>':'')
  +(A.role==='teacher'?'':'<label class="f">Course teacher <small>Manages this subject and its registrations</small><select id="stid">'+tOpts+'</select></label>')
  +'<h4 style="grid-column:1/-1;margin-top:6px"><i class="fa-solid fa-graduation-cap"></i> Semester, department, program &amp; batch</h4>'
  +'<label class="f"><span class="req">Semester</span><select id="sterm"><option value="">Select…</option>'+optsOf(OPTS.terms,s.semester_term)+'</select></label>'
  +'<label class="f"><span class="req">Year</span><input type="number" id="syear" min="2000" max="2100" value="'+esc(String(s.semester_year||''))+'"></label>'
  +'<label class="f"><span class="req">Department</span><select id="sdept"><option value="">Select…</option>'+optsOf(OPTS.depts,s.department)+'</select></label>'
  +'<div class="f" style="display:flex;flex-direction:column;gap:5px;font-weight:600;font-size:.88rem"><span class="req">Program</span>'+progChecks(s.program)+'<small style="font-weight:400;color:var(--mut)">Tick Undergraduate, Diploma or both</small></div>'
  +'<label class="f"><span class="req">Batch</span><input type="text" id="sbatch" data-num="1" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="e.g. 32" value="'+esc(batchNum(s.batch_lock||''))+'"><small>Number only · saved as the default Batch on the registration form</small></label></div>'
  +(s.id?'':'<p class="msg" style="margin-top:12px"><i class="fa-solid fa-circle-info"></i> Only the subject is created now. After saving, create <b>Presentation</b>, <b>Assignment</b> and <b>Lab report</b> separately from the subject card.</p>')
  +'<div class="acts" style="justify-content:flex-end"><button class="btn sec" onclick="closeModal()">Cancel</button><button class="btn" id="ssave"><i class="fa-solid fa-floppy-disk"></i> Save subject</button></div>');
  $('#ssave').onclick=async()=>{
    const prog=readProg();
    try{await api('subject_save',{json:{basic:true,id:s.id,name:$('#sn').value,code:$('#scode').value,course_teacher:$('#sct')?$('#sct').value:(s.course_teacher||''),semester_term:$('#sterm').value,semester_year:+$('#syear').value,department:$('#sdept').value,program:prog,batch:$('#sbatch').value,...(A.role==='teacher'?{}:{teacher_id:+$('#stid').value})}});closeModal();toast(s.id?'Subject saved.':'Subject created. Now create Presentation, Assignment or Lab report from its card.');pgSubjects()}
    catch(e){if(e.status===401){authView()}else $('#merr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(e.message)+'</div>'}
  };
}

function presForm(s){
  s=s||{id:0,name:'',semester_term:'',semester_year:new Date().getFullYear(),department:'',program:'',batch_lock:'',pres_upload:1,pres_public:1,pres_close_at:'',is_open:1,open_date:'',close_date:'',close_at:'',allow_individual:1,allow_team:1,min_team:2,max_team:5,slots:[],fields:DEF_FIELDS};
  s=Object.assign({},s,{is_open:+s.pres_on?s.is_open:1});
  const PH0=(s.fields||DEF_FIELDS).find(f=>f.type==='photo')||null;
  const tOpts=(s.id&&!s.teacher_id&&s.teacher_name?'<option value="-1" selected>Keep: '+esc(s.teacher_name)+' (no account)</option>':'')+'<option value="0" '+(s.teacher_id||(s.id&&s.teacher_name)?'':'selected')+'>— No teacher —</option>'+(A.teachers||[]).map(t=>'<option value="'+t.id+'" '+(+s.teacher_id===t.id?'selected':'')+'>'+esc(t.name)+' · '+esc(t.department)+'</option>').join('');
  const PT=[['basics','fa-graduation-cap','Basics','Which class is this for? Fill every required field (*).'],['reg','fa-calendar-check','Registration','When can students register, and can they join alone, in a team or both?'],['up','fa-cloud-arrow-up','Uploads','Photo in the registration form. Presentation files need no setting — team leaders upload any time with their Gmail and password.'],['fields','fa-list-check','Form fields','The details students fill in. Starter fields are already added — edit only if you need to.'],['slots','fa-clock','Slots','Optional. Leave empty if students do not choose a time slot.'],['guide','fa-clipboard-list','Guidelines','Optional. Rules shown only to this subject’s students.']];
  const tabsHTML='<div class="ptabs" role="tablist">'+PT.map((t,i)=>'<button type="button" role="tab" data-p="'+t[0]+'" class="'+(i?'':'on')+'"><i class="fa-solid '+t[1]+'"></i> '+t[2]+'</button>').join('')+'</div><p class="msg ptip" id="ptip">'+PT[0][3]+'</p>';
  openModal('<div class="mt"><h3>'+(+s.pres_on?'Presentation settings':'Create presentation')+' · '+esc(s.name)+'</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div id="merr"></div>'+tabsHTML+'<div class="ptab on" data-p="basics"><div class="fg">'
  +'<h4 style="grid-column:1/-1;margin-top:6px"><i class="fa-solid fa-graduation-cap"></i> Semester, department, program &amp; batch</h4>'
  +'<label class="f"><span class="req">Semester</span><select id="sterm"><option value="">Select…</option>'+optsOf(OPTS.terms,s.semester_term)+'</select></label>'
  +'<label class="f"><span class="req">Year</span><input type="number" id="syear" min="2000" max="2100" value="'+esc(String(s.semester_year||''))+'"></label>'
  +'<label class="f"><span class="req">Department</span><select id="sdept"><option value="">Select…</option>'+optsOf(OPTS.depts,s.department)+'</select></label>'
  +'<div class="f" style="display:flex;flex-direction:column;gap:5px;font-weight:600;font-size:.88rem"><span class="req">Program</span>'+progChecks(s.program)+'<small style="font-weight:400;color:var(--mut)">Tick Undergraduate, Diploma or both</small></div>'
  +'<label class="f"><span class="req">Batch</span><input type="text" id="sbatch" data-num="1" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="e.g. 32" value="'+esc(batchNum(s.batch_lock||''))+'"><small>Number only · saved as the default Batch on the registration form</small></label></div></div>'
  +'<div class="ptab" data-p="reg"><div class="infobox"><b>Deadline</b> = after this time students can still register, but it is marked <b>Late</b>.<br><b>Close</b> = nobody can register at all (use the Close / Open button or the switch below).</div><div class="swrow">'+swHTML('sopen',+s.is_open,'Registration OPEN','Registration CLOSED')+'<small>ON = students can register. OFF = nobody can register, not even late.</small></div><div class="fg">'
  +'<label class="f">Registration deadline <small>Bangladesh Time (UTC+6). After this time students can still register, but it is marked Late.</small><input type="datetime-local" id="sc" value="'+esc(s.close_at||'')+'"></label>'
  +'<label class="f">Min team members<input type="number" id="smin" min="1" max="30" value="'+s.min_team+'"></label><label class="f">Max team members<input type="number" id="smax" min="1" max="30" value="'+s.max_team+'"></label></div>'+'<div class="qk"><b>Quick deadline:</b>'+[[1,'1 day'],[3,'3 days'],[7,'1 week'],[14,'2 weeks'],[0,'No deadline']].map(x=>'<button type="button" class="btn sm sec" data-qd="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>'
  +'<div class="row" style="margin:14px 0;gap:18px"><label><input type="checkbox" id="sai" '+(+s.allow_individual?'checked':'')+'> Individual</label><label><input type="checkbox" id="sat" '+(+s.allow_team?'checked':'')+'> Team</label></div></div>'
  +'<div class="ptab" data-p="up"><h4><i class="fa-solid fa-image"></i> Photo upload</h4><div class="mcard" style="margin-top:6px"><label class="row" style="gap:8px;font-weight:600"><input type="checkbox" id="phon" '+(PH0?'checked':'')+'> Ask students for a photo in the registration form</label>'
  +'<div class="fg" id="phopts" style="margin-top:12px"><label class="f">Field label<input type="text" id="phl" maxlength="60" value="'+esc(PH0?PH0.label:'Photo')+'"></label>'
  +'<label class="f">Required?<select id="phr">'+[['no','Optional'],['yes','Required for everyone'],['leader','Required for team leader only']].map(x=>'<option value="'+x[0]+'" '+((PH0?PH0.req:'no')===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select></label>'
  +'<label class="f">Max file size<select id="phm">'+[1,2,3,5].map(x=>'<option value="'+x+'" '+((PH0?PH0.mb||2:2)===x?'selected':'')+'>'+x+' MB</option>').join('')+'</select></label></div><input type="hidden" id="phk" value="'+esc(PH0?PH0.key:'photo')+'"></div>'
  +'<p class="msg" style="margin-top:18px"><i class="fa-solid fa-display"></i> <b>Presentation file:</b> team leaders can upload or replace it any time after signing in with their Gmail and password. No setting or date is needed.</p></div>'
  +'<div class="ptab" data-p="fields"><h4 style="margin-top:0"><i class="fa-solid fa-list-check"></i> Registration form fields</h4><p class="msg">These are exactly the details students must fill in for this subject. Nothing is fixed — add, rename, reorder or delete any field. Mark one field as <b>Unique ID</b> to block duplicate registrations and one as <b>Display name</b> for lists.</p><div id="flist"></div>'
  +'<div class="acts"><button class="btn sec" id="addfield" type="button"><i class="fa-solid fa-plus"></i> Add field</button><button class="btn sec" id="resetfields" type="button"><i class="fa-solid fa-rotate-left"></i> Load starter fields</button></div></div>'
  +'<div class="ptab" data-p="slots"><h4 style="margin-top:0">Presentation slots</h4><p class="msg">Date, label and how many registrations each slot accepts. Leave empty for no slot choice.</p><div id="slots">'+s.slots.map(slotRow).join('')+'</div>'
  +'<div class="acts"><button class="btn sec" id="addslot" type="button"><i class="fa-solid fa-plus"></i> Add slot</button></div></div>'
  +'<div class="ptab" data-p="guide"><h4 style="margin-top:0"><i class="fa-solid fa-clipboard-list"></i> Guidelines for students</h4><p class="msg">Rules, how to present, time limit, marking… Only this subject’s students see them (subject card, registration steps and the team leader page). Write one point per line; sections with no points stay hidden.</p><div id="glist"></div>'
  +'<div class="acts"><button class="btn sec" id="addgl" type="button"><i class="fa-solid fa-plus"></i> Add section</button><button class="btn sec" id="sampgl" type="button"><i class="fa-solid fa-wand-magic-sparkles"></i> Add starter sections</button></div></div>'
  +'<div class="pfoot"><button class="btn sec" id="pback" type="button"><i class="fa-solid fa-arrow-left"></i> Back</button><button class="btn sec" id="pnext" type="button">Next <i class="fa-solid fa-arrow-right"></i></button><span style="flex:1"></span><button class="btn sec" type="button" onclick="closeModal()">Cancel</button><button class="btn" id="ssave"><i class="fa-solid fa-floppy-disk"></i> Save</button></div>');
  swBind('sopen');
  let pcur=0;
  const goTab=k=>{pcur=Math.max(0,PT.findIndex(x=>x[0]===k));$$('.ptab').forEach(t=>t.classList.toggle('on',t.dataset.p===PT[pcur][0]));$$('.ptabs button').forEach(b=>b.classList.toggle('on',b.dataset.p===PT[pcur][0]));$('#ptip').textContent=PT[pcur][3];$('#pback').style.visibility=pcur?'visible':'hidden';$('#pnext').style.display=pcur<PT.length-1?'':'none'};
  $$('.ptabs button').forEach(b=>b.onclick=()=>goTab(b.dataset.p));$('#pback').onclick=()=>goTab(PT[Math.max(0,pcur-1)][0]);$('#pnext').onclick=()=>goTab(PT[Math.min(PT.length-1,pcur+1)][0]);goTab('basics');
  const pad2=n=>String(n).padStart(2,'0');
  $$('[data-qd]').forEach(b=>b.onclick=()=>{const d=+b.dataset.qd;if(!d){$('#sc').value='';return}const t=new Date(Date.now()+d*864e5);$('#sc').value=t.getFullYear()+'-'+pad2(t.getMonth()+1)+'-'+pad2(t.getDate())+'T23:59'});
  const tmSync=()=>{['#smin','#smax'].forEach(i=>{const l=$(i).closest('label');if(l)l.style.display=$('#sat').checked?'':'none'})};$('#sat').onchange=tmSync;tmSync();
  const bind=()=>$$('.s-x').forEach(b=>b.onclick=()=>b.parentElement.remove());bind();
  drawFields((s.fields||DEF_FIELDS).map(f=>Object.assign({},f)));
  drawGl((s.guidelines||[]).map(b=>({title:b.title,items:(b.items||[]).slice()})));
  $('#addgl').onclick=()=>{const l=readGl();l.push({title:'',items:[]});drawGl(l);const r=$$('#glist .glrow').pop();if(r)r.querySelector('.gl-t').focus()};
  $('#sampgl').onclick=()=>{const l=readGl(),have=l.map(b=>b.title.toLowerCase());['Rules','How to present','Time & format','Evaluation'].forEach(t=>{if(!have.includes(t.toLowerCase()))l.push({title:t,items:[]})});drawGl(l)};
  const phSync=()=>{$('#phopts').style.display=$('#phon').checked?'':'none'};$('#phon').onchange=phSync;phSync();
  $('#addfield').onclick=()=>{const l=readFields();l.push({key:'f'+Math.random().toString(36).slice(2,9),label:'',type:'text',req:'no',role:'',opts:[],def:''});drawFields(l);const r=$$('#flist .frow').pop();if(r)r.querySelector('.fl-l').focus()};
  $('#resetfields').onclick=()=>{if(confirm('Replace the current fields with the starter set?'))drawFields(DEF_FIELDS.map(f=>Object.assign({},f)))};
  $('#addslot').onclick=()=>{$('#slots').insertAdjacentHTML('beforeend',slotRow());bind()};
  $('#ssave').onclick=async()=>{
    const slots=$$('.srow').map(r=>({id:+r.querySelector('.s-i').value,date:r.querySelector('.s-d').value,label:r.querySelector('.s-l').value,capacity:+r.querySelector('.s-c').value}));
    const prog=readProg(),bad=(k,m)=>{goTab(k);$('#merr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(m)+'</div>';$('#merr').scrollIntoView({block:'nearest'})};
    if(!$('#sterm').value||!$('#syear').value||!$('#sdept').value||!prog||!$('#sbatch').value.trim())return bad('basics','Please fill Semester, Year, Department, Program and Batch.');
    if(!$('#sai').checked&&!$('#sat').checked)return bad('reg','Tick at least one: Individual or Team.');
    if($('#sat').checked&&+$('#smin').value>+$('#smax').value)return bad('reg','Min team members cannot be more than Max.');
    try{const sr=await api('subject_save',{json:{id:s.id,course_teacher:s.course_teacher||'',code:s.code||'',semester_term:$('#sterm').value,semester_year:+$('#syear').value,department:$('#sdept').value,program:prog,batch:$('#sbatch').value,pres_upload:true,pres_close_at:'',pres_public:!!+s.pres_public,guidelines:readGl(),fields:readFields().concat($('#phon').checked?[{key:$('#phk').value||'photo',label:$('#phl').value.trim()||'Photo',type:'photo',req:$('#phr').value,role:'',opts:[],def:'',mb:+$('#phm').value}]:[]),name:s.name,open_date:'',close_at:$('#sc').value,min_team:+$('#smin').value,max_team:+$('#smax').value,is_open:swOn('sopen'),allow_individual:$('#sai').checked,allow_team:$('#sat').checked,slots}});closeModal();toast('Presentation saved.');pgSubjects()}
    catch(e){if(e.status===401){authView()}else $('#merr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(e.message)+'</div>'}
  };
}

function extendForm(s){
  const q=[[60,'+1 hour'],[360,'+6 hours'],[1440,'+1 day'],[4320,'+3 days'],[10080,'+7 days']];
  openModal('<div class="mt"><h3>Extend registration deadline</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div id="merr"></div>'
  +'<p style="margin:0 0 4px"><b>'+esc(s.name)+'</b></p>'
  +'<p class="msg" style="margin:0 0 10px">'+(s.close_ts?'Current deadline: <b>'+esc(fmtBD(s.close_ts))+'</b> (Bangladesh Time, UTC+6)':'No deadline is set for this subject.')+'</p>'
  +(s.close_ts?'<div class="cdb">'+cdHTML(s.close_ts)+'</div>':'')
  +(+s.is_open?'':'<div class="warn"><i class="fa-solid fa-triangle-exclamation"></i><span>Registration is switched off for this subject. Extending the deadline will not turn it back on — use the Open button afterwards.</span></div>')
  +'<h4>Quick extend</h4><div class="qx">'+q.map(x=>'<button type="button" class="btn sec" data-min="'+x[0]+'">'+x[1]+'</button>').join('')+'</div><p class="msg">Added to the current deadline, or to the current time if the deadline has already passed.</p>'
  +'<h4 style="margin-top:18px">Or set an exact deadline date &amp; time</h4><div class="row" style="align-items:center"><input type="datetime-local" id="xc" style="max-width:260px" value="'+esc(s.close_at||'')+'"><button type="button" class="btn" id="xset"><i class="fa-solid fa-clock"></i> Set deadline</button></div><p class="msg">Bangladesh Time (UTC+6)</p>');
  const go=async json=>{
    try{const r=await api('subject_extend',{json:Object.assign({id:s.id},json)});closeModal();toast('Deadline now: '+fmtBD(r.close_ts)+(r.disabled?' · registration is still disabled':''));pgSubjects()}
    catch(e){if(e.status===401)authView();else $('#merr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(e.message)+'</div>'}
  };
  $$('#mbox [data-min]').forEach(b=>b.onclick=()=>go({minutes:+b.dataset.min}));
  $('#xset').onclick=()=>{const v=$('#xc').value;if(!v){$('#merr').innerHTML='<div class="err" style="margin:0 0 12px">Pick a closing date and time.</div>';return}go({close_at:v})};
}

let tmr,PUBON=false;
async function togglePublic(){
  const r=await guard(()=>api('teams_public_set',{json:{on:!PUBON}}));
  if(r){PUBON=r.on;toast(PUBON?'Public team page is ON. Subjects ticked in Settings are shown.':'Public team page is private again.');return true}
}
const pubBtn=()=>PUBON?'<i class="fa-solid fa-eye-slash"></i> Make team page private':'<i class="fa-solid fa-earth-asia"></i> Make team page public';
async function pgRegs(){
  const T=A.role==='teacher';
  if(!A.subjects.length){const r=await guard(()=>api('subjects_admin'));if(r)A.subjects=r.subjects}
  const F=A.f;
  $('#pg').innerHTML=(T?'':warnHTML())+'<h2>Presentation Registrations</h2>'+(T?'':'<div class="stats" id="rstats"></div>')+'<div class="filters"><input type="text" id="fq" placeholder="Search by ID, name or any detail" value="'+esc(F.q)+'">'
  +(()=>{A.kb=A.kb||new Set();A.subjects.forEach(s=>{const b=batchNum(subjBatch(s));if(b)A.kb.add(b)});const sel=(id,list,cur)=>'<select id="'+id+'">'+list.map(x=>'<option value="'+esc(x[0])+'" '+(x[0]===cur?'selected':'')+'>'+esc(x[1])+'</option>').join('')+'</select>';const codes=[...new Set(A.subjects.map(s=>(s.code||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));return sel('fs',[['',T?'All my subjects':'All subjects']].concat(A.subjects.map(s=>[String(s.id),s.name+(s.code?' · '+s.code:'')])),String(A.f.subject||''))+sel('fcode',[['','All course codes']].concat(codes.map(c=>[c,c])),A.f.code||'')+sel('fprog',[['Undergraduate','Undergraduate (UG) only'],['Diploma','Diploma (DH) only'],['Both','Both — UG & DH']],A.f.program||'Both')+sel('fbatch',[['','All batches']].concat([...A.kb].sort((a,b)=>b-a).map(x=>[x,'Batch '+x])),A.f.batch||'')})()
  +'</div><details class="mf" style="margin:8px 0 4px"><summary class="msg" style="cursor:pointer"><i class="fa-solid fa-sliders"></i> More filters (type, status, semester, department)</summary><div class="filters" style="margin-top:8px">'
  +'<select id="ft"><option value="">All types</option><option value="individual" '+(F.type==='individual'?'selected':'')+'>Individual</option><option value="team" '+(F.type==='team'?'selected':'')+'>Team</option></select>'
  +'<select id="fx"><option value="">All statuses</option>'+['pending','approved','rejected'].map(x=>'<option value="'+x+'" '+(F.status===x?'selected':'')+'>'+x[0].toUpperCase()+x.slice(1)+'</option>').join('')+'</select></div>'
  +(()=>{const uq=a=>[...new Set(a.filter(Boolean))],F2=A.f,o=(id,label,list,cur)=>'<select id="'+id+'"><option value="">'+label+'</option>'+list.map(x=>'<option value="'+esc(x[0])+'" '+(x[0]===cur?'selected':'')+'>'+esc(x[1])+'</option>').join('')+'</select>';
    A.kb=A.kb||new Set();A.subjects.forEach(s=>{const b=batchNum(subjBatch(s));if(b)A.kb.add(b)});
    const sm=uq(A.subjects.filter(x=>x.semester_term).map(x=>x.semester_term+'|'+x.semester_year)).map(x=>[x,x.replace('|',' ')]);
    return '<div class="sfil">'+o('fsem','All semesters',sm,F2.sem||'')+o('fdept','All departments',uq(A.subjects.map(x=>x.department)).map(x=>[x,x]),F2.dept||'')+'</div></details>'})()
  +'<div class="tools"><span class="msg" id="rc"></span><span style="margin-left:auto"></span>'+(T?'':'<button class="btn sec sm" id="tpub"></button>')+''+vtogHTML()+'<button class="btn sec sm" id="ecsv"><i class="fa-solid fa-file-csv"></i> Export CSV</button><button class="btn sec sm" id="exls"><i class="fa-solid fa-file-excel"></i> Export Excel</button></div><div id="rt"></div>';
  if(!T){wireWarn();$('#tpub').onclick=async()=>{if(await togglePublic())$('#tpub').innerHTML=pubBtn()};guard(()=>api('settings_get')).then(sg=>{if(sg){PUBON=sg.teams_public;const b=$('#tpub');if(b)b.innerHTML=pubBtn()}})}
  const sync=()=>{F.sem=$('#fsem').value;F.dept=$('#fdept').value;F.program=$('#fprog').value;F.code=$('#fcode').value;F.batch=$('#fbatch').value;F.q=$('#fq').value;F.subject=$('#fs').value;F.type=$('#ft').value;F.status=$('#fx').value};
  $('#fq').oninput=()=>{clearTimeout(tmr);tmr=setTimeout(()=>{sync();loadRegs()},300)};
  ['fs','fcode','ft','fx','fsem','fdept','fprog','fbatch'].forEach(i=>$('#'+i).onchange=()=>{sync();loadRegs()});
  const ex=f=>{sync();location.href=API_URL+'?api=export&fmt='+f+'&as='+encodeURIComponent(A.role)+'&t='+encodeURIComponent(CSRF)+'&'+new URLSearchParams(F)};
  $('#ecsv').onclick=()=>ex('csv');$('#exls').onclick=()=>ex('xls');
  $$('#pg [data-sv]').forEach(b=>b.onclick=()=>{if(getView()===b.dataset.sv)return;setView(b.dataset.sv);$$('#pg [data-sv]').forEach(x=>x.classList.toggle('on',x.dataset.sv===b.dataset.sv));loadRegs()});
  if(!T)guard(()=>api('stats')).then(st=>{const b=$('#rstats');if(!st||!b)return;const files=A.subjects.reduce((n,x)=>n+(+x.pres_count||0),0);
    b.innerHTML=[['Total registrations',st.total,''],['Individual',st.individual,'n'],['Teams',st.teams,'n'],['Students',st.students,''],['Pending',st.pending,'a'],['Approved',st.approved,'g'],['Rejected',st.rejected,'r'],['Presentation files',files,'']].map(x=>'<div class="card stat '+x[2]+'"><b>'+x[1]+'</b><span>'+x[0]+'</span></div>').join('')});
  loadRegs();
}
/* admin / teacher table view of every registration with all details */
function regTable(list){
  const row=g=>{const l=g.members.find(m=>m.is_leader)||g.members[0]||{},lv=l.vals||{},sub=A.subjects.find(x=>x.id===g.subject_id)||{},fl=sub.fields||[];
    const tel=fl.find(f=>f.type==='tel'),mail=fl.find(f=>f.type==='email'),ph=(tel?lv[tel.key]:lv.phone)||'',em=g.leader_email||(mail?lv[mail.key]:lv.email)||'';
    return '<tr><td><b>'+esc(g.ref_code)+'</b></td><td>'+esc(g.subject_name)+(sub.code?'<br><small class="msg">'+esc(sub.code)+'</small>':'')+'</td><td><b>'+esc(regBatch(g)||'—')+'</b></td><td>'+(g.reg_type==='team'?'Team':'Individual')+'</td>'
    +'<td>'+(g.reg_type==='team'?'<b>'+esc(g.team_name)+'</b><br>':'')+(g.topic?'<small class="msg"><i class="fa-solid fa-lightbulb"></i> '+esc(g.topic)+'</small><br>':'')+g.members.map(m=>'<small>'+esc(m.full_name)+(m.student_id?' ('+esc(m.student_id)+')':'')+(m.is_leader&&g.reg_type==='team'?' ★':'')+'</small>').join('<br>')+'</td>'
    +'<td>'+(ph?'<small><i class="fa-solid fa-phone"></i> '+esc(ph)+'</small>':'')+(ph&&em?'<br>':'')+(em?'<small><i class="fa-regular fa-envelope"></i> '+esc(em)+'</small>':'')+(!ph&&!em?'—':'')+'</td>'
    +'<td>'+(esc(slotTxt({date:g.slot_date,label:g.slot_label}))||'—')+'</td>'
    +'<td>'+(g.pres?'<i class="fa-solid '+presIcon(g.pres.kind)+'"></i> '+esc(g.pres.name)+'<br><small class="msg">'+fmtSize(g.pres.size)+'</small>':'<span class="badge b-pending">Not uploaded</span>')+'</td>'
    +'<td><span class="badge b-'+g.status+'">'+g.status+'</span> '+(+g.is_late?' <span class="badge b-rejected">Late</span>':'')+'</td><td><small>'+esc((g.created_at||'').slice(0,16))+'</small></td>'
    +'<td><div class="row"><button class="btn sm sec" data-v="'+g.id+'" title="View"><i class="fa-solid fa-eye"></i></button><button class="btn sm" data-a="'+g.id+'" title="Approve" '+(g.status==='approved'?'disabled':'')+'><i class="fa-solid fa-check"></i></button><button class="btn sm dng" data-r="'+g.id+'" title="Reject" '+(g.status==='rejected'?'disabled':'')+'><i class="fa-solid fa-ban"></i></button>'+(g.pres?'<button class="btn sm" data-p="'+g.id+'" title="Present"><i class="fa-solid fa-display"></i></button>':'')+'<button class="btn sm sec" data-m="'+g.id+'" title="Edit"><i class="fa-solid fa-pen"></i></button><button class="btn sm dng" data-x="'+g.id+'" title="Delete"><i class="fa-solid fa-trash"></i></button></div></td></tr>'};
  return '<div class="card"><div class="tw"><table class="regt"><tr><th>Ref</th><th>Subject</th><th>Batch</th><th>Type</th><th>Team / Members</th><th>Contact</th><th>Slot</th><th>Presentation</th><th>Status</th><th>Submitted</th><th></th></tr>'+(list||REGS).map(row).join('')+'</table></div></div>';
}
/* Presentation Registrations: shown separately by Program (Undergraduate / Diploma) and, inside each, by Batch */
function groupRegs(list,draw){
  const L=g=>g.members.find(m=>m.is_leader)||g.members[0]||{},sj=g=>A.subjects.find(x=>x.id===g.subject_id)||{};
  const prog=g=>progLabel((L(g).vals||{}).program||sj(g).program)||'No program';
  const batch=g=>{const b=batchNum((L(g).vals||{}).batch||L(g).batch||'');if(b)return b;const sb=subjBatch(sj(g));return sb==='No batch'?'No batch':(batchNum(sb)||sb)};
  const po=p=>p==='Undergraduate'?0:p==='Diploma'?1:p==='No program'?9:5;
  const P={};list.forEach(g=>{const p=prog(g),b=batch(g);P[p]=P[p]||{};(P[p][b]=P[p][b]||[]).push(g)});
  return Object.keys(P).sort((a,b)=>po(a)-po(b)||a.localeCompare(b)).map(p=>{
    const n=Object.values(P[p]).reduce((s,x)=>s+x.length,0);
    return '<section class="bgrp"><div class="bgh"><span class="bgi"><i class="fa-solid fa-graduation-cap"></i></span><h3>'+esc(p)+'</h3><span class="bgc">'+n+' registration'+(n===1?'':'s')+'</span></div>'
    +Object.keys(P[p]).sort(batchCmp).map(b=>'<div class="bgh" style="margin:14px 0 8px"><span class="bgi"><i class="fa-solid fa-users-rectangle"></i></span><h4 style="margin:0">'+(b==='No batch'?'No batch set':'Batch '+esc(b))+'</h4><span class="bgc">'+P[p][b].length+'</span></div>'+draw(P[p][b])).join('')+'</section>'}).join('');
}
let REGS=[],REGT=0,REGSEQ=0;
async function loadRegs(more){
  const sq=++REGSEQ;if(more!==true)XLPREV=-1;
  const off=more===true?REGS.length:0,lim=more===true?(getView()==='excel'?200:40):Math.min(200,Math.max(40,REGS.length));
  const r=await guard(()=>api('regs',{q:Object.assign({},A.f,{limit:lim,offset:off})}));if(!r||sq!==REGSEQ)return;
  REGS=more===true?REGS.concat(r.regs):r.regs;
  {const kb=A.kb||(A.kb=new Set());REGS.forEach(g=>g.members.forEach(m=>{const b=batchNum((m.vals||{}).batch||m.batch||'');if(b)kb.add(b)}));const fb=$('#fbatch');if(fb){const cur=fb.value;fb.innerHTML='<option value="">All batches</option>'+[...kb].sort((a,b)=>b-a).map(x=>'<option value="'+esc(x)+'" '+(x===cur?'selected':'')+'>Batch '+esc(x)+'</option>').join('')}}if(r.total!==null&&r.total!==undefined)REGT=r.total;
  $('#rc').textContent=(REGT||REGS.length)+' registration'+((REGT||REGS.length)===1?'':'s')+(REGS.length<REGT?' · showing '+REGS.length:'');
  $('#rt').innerHTML=REGS.length?groupRegs(REGS,list=>'<div class="grid rgrid">'+list.map(g=>{const l=g.members.find(m=>m.is_leader)||g.members[0]||{};
    return '<div class="card rcard"><div class="sc-h"><b class="rc-ref">'+esc(g.ref_code)+'</b><span><span class="badge b-'+g.status+'">'+g.status+'</span> '+(+g.is_late?' <span class="badge b-rejected">Late</span>':'')+'</span></div>'
    +'<div class="rc-l">'+av(l.photo,'sm',l.gender)+'<div><b>'+esc(l.full_name)+'</b><br><span class="msg">'+esc(l.student_id)+(g.reg_type==='team'?(l.student_id?' · ':'')+esc(g.team_name)+' ('+g.members.length+')':'')+'</span></div></div>'
    +'<dl class="kv"><div class="wide"><dt>Subject</dt><dd>'+esc(g.subject_name)+'<div class="chips" style="margin-top:4px">'+batchChip(regBatch(g))+metaChips(A.subjects.find(s=>s.id===g.subject_id)||{})+'</div></dd></div><div><dt>Type</dt><dd>'+(g.reg_type==='team'?'Team':'Individual')+'</dd></div><div><dt>Slot</dt><dd>'+esc(slotTxt({date:g.slot_date,label:g.slot_label})||'—')+'</dd></div><div class="wide"><dt>Presentation topic</dt><dd>'+(g.topic?esc(g.topic):'<span class="msg">Not given</span>')+'</dd></div><div class="wide"><dt>Presentation</dt><dd>'+(g.pres?'<i class="fa-solid '+presIcon(g.pres.kind)+'"></i> '+esc(g.pres.name):'<span class="msg">Not uploaded</span>')+'</dd></div><div class="wide"><dt>Submitted</dt><dd>'+esc((g.created_at||'').slice(0,16))+'</dd></div></dl>'
    +'<div class="sc-a"><button class="btn sm sec" data-v="'+g.id+'" title="View"><i class="fa-solid fa-eye"></i> View</button><button class="btn sm" data-a="'+g.id+'" title="Approve" '+(g.status==='approved'?'disabled':'')+'><i class="fa-solid fa-check"></i> Approve</button><button class="btn sm dng" data-r="'+g.id+'" title="Reject" '+(g.status==='rejected'?'disabled':'')+'><i class="fa-solid fa-ban"></i> Reject</button>'+(g.pres?'<button class="btn sm" data-p="'+g.id+'" title="Present"><i class="fa-solid fa-display"></i> Present</button>':'')+'<button class="btn sm sec" data-m="'+g.id+'" title="Edit"><i class="fa-solid fa-pen"></i> Edit</button><button class="btn sm dng" data-x="'+g.id+'" title="Delete"><i class="fa-solid fa-trash"></i> Delete</button></div></div>'}).join('')+'</div>')+(REGS.length<REGT?'<div style="text-align:center;margin:14px 0"><button class="btn sec" id="rmore"><i class="fa-solid fa-angles-down"></i> Load more</button></div>':'')
  :'<div class="card empty"><i class="fa-solid fa-inbox" style="font-size:1.8rem;display:block;margin-bottom:8px"></i>No registrations match these filters.</div>';
  if(REGS.length&&getView()==='excel'){$('#rt').innerHTML='<div class="xleg"><b>How to read:</b> every colour block is one registration · a Team lists all its members together · an Individual is 1 row</div>'+groupRegs(REGS,regExcel)+(REGS.length<REGT?'<div class="msg" style="text-align:center;margin:12px">Loading all records… '+REGS.length+' of '+REGT+'</div>':'');
    if(REGS.length<REGT&&REGS.length!==XLPREV){XLPREV=REGS.length;setTimeout(()=>loadRegs(true),30)}else XLPREV=-1}
  if(REGS.length&&getView()==='table')$('#rt').innerHTML=groupRegs(REGS,regTable)+(REGS.length<REGT?'<div style="text-align:center;margin:14px 0"><button class="btn sec" id="rmore"><i class="fa-solid fa-angles-down"></i> Load more</button></div>':'');
  const mb=$('#rmore');if(mb)mb.onclick=()=>loadRegs(true);
  const g=id=>REGS.find(x=>x.id==id),st=async(id,s)=>{if(await guard(()=>api('reg_status',{json:{id,status:s}}))){toast('Registration '+s+'.');loadRegs()}};
  $$('[data-v]').forEach(b=>b.onclick=()=>viewReg(g(b.dataset.v)));
  $$('[data-a]').forEach(b=>b.onclick=()=>st(+b.dataset.a,'approved'));
  $$('[data-r]').forEach(b=>b.onclick=()=>st(+b.dataset.r,'rejected'));
  $$('[data-m]').forEach(b=>b.onclick=()=>editReg(g(b.dataset.m)));
  $$('#pg [data-p]').forEach(b=>b.onclick=()=>{const x=g(b.dataset.p);if(!x)return;openPresenter(x.id,(x.team_name||'Presentation')+' · '+x.subject_name)});
  $$('[data-x]').forEach(b=>b.onclick=async()=>{const x=g(b.dataset.x);if(!confirm('Delete registration '+x.ref_code+' permanently?'))return;if(await guard(()=>api('reg_delete',{json:{id:x.id}}))){toast('Registration deleted.');loadRegs()}});
}
const fieldsFor=g=>{const sub=A.subjects.find(s=>s.id===g.subject_id);return(sub?sub.fields:[]).filter(f=>f.type!=='photo')};
function viewReg(g){
  const fl=fieldsFor(g);
  openModal('<div class="mt"><h3>'+esc(g.ref_code)+'</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>'
  +'<p><span class="badge b-'+g.status+'">'+g.status+'</span> '+(+g.is_late?' <span class="badge b-rejected">Late</span>':'')+' &nbsp; <b>'+esc(g.subject_name)+'</b> · '+(g.reg_type==='team'?'Team “'+esc(g.team_name)+'”':'Individual')+'</p><p class="msg">Slot: '+esc(slotTxt({date:g.slot_date,label:g.slot_label})||'—')+' · Submitted '+esc(g.created_at)+'</p>'
  +'<div class="tw"><table><tr><th></th>'+fl.map(f=>'<th>'+esc(f.label)+'</th>').join('')+'</tr>'+g.members.map(m=>'<tr><td>'+av(m.photo,'sm')+(m.is_leader&&g.reg_type==='team'?'<br><span class="badge b-pending">Leader</span>':'')+'</td>'+fl.map(f=>'<td>'+(f.role==='name'?'<b>'+esc(m.vals[f.key]||'—')+'</b>':esc(m.vals[f.key]||'—'))+'</td>').join('')+'</tr>').join('')+'</table></div>'+presPanelHTML({pres:g.pres,mx:(A.subjects.find(s=>s.id===g.subject_id)||{}).pres_max_mb||OPTS.pres_max_mb||20}));
  wirePres({rid:g.id,title:(g.team_name||g.ref_code)+' · '+g.subject_name,pres:g.pres,mx:(A.subjects.find(s=>s.id===g.subject_id)||{}).pres_max_mb||OPTS.pres_max_mb||20,
    onChange:async()=>{await loadRegs();const n=REGS.find(x=>x.id===g.id);if(n)viewReg(n);else closeModal()},
    fail:(e,err)=>{if(e.status===401)authView();else err(e.message)}});
}
function editReg(g){
  const sub=A.subjects.find(s=>s.id===g.subject_id),slots=sub?sub.slots:[],fl=fieldsFor(g);
  openModal('<div class="mt"><h3>Edit '+esc(g.ref_code)+'</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div id="merr"></div><div class="fg">'
  +(g.reg_type==='team'?'<label class="f">Team name<input type="text" id="etn" maxlength="60" value="'+esc(g.team_name)+'"></label>':'')+'<label class="f">Presentation topic <small>(optional)</small><input type="text" id="etp" maxlength="200" value="'+esc(g.topic||'')+'"></label>'
  +'<label class="f">Status<select id="est">'+['pending','approved','rejected'].map(x=>'<option value="'+x+'" '+(g.status===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'
  +'<label class="f">Slot<select id="esl"><option value="0">No slot</option>'+slots.map(x=>'<option value="'+x.id+'" '+(g.slot_id==x.id?'selected':'')+'>'+esc(slotTxt(x))+'</option>').join('')+'</select></label>'
  +(g.reg_type==='team'?'<label class="f">Team leader Gmail <small>Leader login (Gmail or mobile number, no password)</small><input type="email" id="ele" maxlength="100" value="'+esc(g.leader_email||'')+'"></label>':'')
  +'</div>'
  +g.members.map(m=>'<div class="mcard" data-id="'+m.id+'"><div class="mhead"><h4>'+esc(m.full_name)+'</h4>'+(g.reg_type==='team'?'<label class="lead"><input type="radio" name="eld" value="'+m.id+'" '+(m.is_leader?'checked':'')+'> Leader</label>':'<input type="radio" name="eld" value="'+m.id+'" checked style="display:none">')+'</div><div class="fg">'
  +fl.map(f=>'<label class="f">'+esc(f.label)+ctl(f,m.vals[f.key])+'</label>').join('')+'</div>'
  +(m.photo?'<div class="pbox">'+av(m.photo,'sm')+'<label><input type="checkbox" class="e-rp"> Remove photo</label></div>':'')+'</div>').join('')
  +'<div class="acts" style="justify-content:flex-end"><button class="btn sec" onclick="closeModal()">Cancel</button><button class="btn" id="esave"><i class="fa-solid fa-floppy-disk"></i> Save changes</button></div>');
  $('#esave').onclick=async()=>{
    const members=$$('#mbox .mcard').map(c=>({id:+c.dataset.id,vals:readCard(c,fl),remove_photo:!!(c.querySelector('.e-rp')&&c.querySelector('.e-rp').checked)}));
    const ld=document.querySelector('input[name=eld]:checked');
    try{await api('reg_update',{json:{id:g.id,team_name:$('#etn')?$('#etn').value:'',topic:$('#etp')?$('#etp').value:undefined,status:$('#est').value,slot_id:+$('#esl').value,leader_id:ld?+ld.value:0,leader_email:$('#ele')?$('#ele').value:undefined,members}});closeModal();toast('Registration updated.');loadRegs()}
    catch(e){if(e.status===401)authView();else $('#merr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(e.message)+'</div>'}
  };
}
/* v34: VISITOR ANALYTICS page (admin only): who visits, from where, on which device, and what they do */
const AN_ACT={register:'Registered',teacher_register:'Teacher sign-up',login:'Admin sign-in',teacher_login:'Teacher sign-in',leader_login:'Leader sign-in',chat_start:'Chat sign-in',chat_send:'Chat message',task_submit:'Assignment submitted',pres_upload:'Presentation uploaded',fb_add:'Review / feedback',forgot_request:'Password reset asked',leader_update:'Team details edited'};
const AN_ROLE={guest:'Guest',student:'Student',teacher:'Teacher',cr:'CR',leader:'Team leader',admin:'Admin'};
const anD=s=>{const d=new Date(String(s||'').replace(' ','T')+'Z');return isNaN(d)?null:d};
const anDT=(s,y)=>{const d=anD(s);return d?d.toLocaleString('en-GB',{...BDZ,day:'2-digit',month:'short',...(y?{year:'numeric'}:{}),hour:'2-digit',minute:'2-digit',hour12:true}):''};
const anAgo=s=>{const d=anD(s);if(!d)return '';const t=Math.max(0,Math.round((Date.now()-d)/1000));return t<45?'just now':t<3600?Math.max(1,Math.round(t/60))+' min ago':t<86400?Math.round(t/3600)+' h ago':Math.round(t/86400)+' d ago'};
const anDur=s=>{s=+s||0;return s<60?s+' s':s<3600?Math.round(s/60)+' min':(s/3600).toFixed(1)+' h'};
const anFlag=c=>c&&c.length===2?String.fromCodePoint(...[...c.toUpperCase()].map(x=>127397+x.charCodeAt(0))):'';
const anLoc=v=>[v.city,v.region,v.country].filter((x,i,a)=>x&&a.indexOf(x)===i).join(', ')||'Unknown';
const anPage=p=>{p=p||'#home';return p==='#home'?'Home (registration)':p==='#presentation'?'Presentation':p.startsWith('#teams-leader')?'Team leader':p.startsWith('#teams')?'Teams':p==='#chat'?'Chat':p==='#teacher'?'Teacher panel':p==='#assignment'?'Assignments':p==='#lab'?'Lab reports':p.startsWith('#people')?'People':p==='#reviews'?'Reviews':p};
const anIcon=t=>t==='mobile'?'fa-mobile-screen':t==='tablet'?'fa-tablet-screen-button':'fa-desktop';
const anName=v=>v.who||('Guest · '+String(v.vid||'').slice(0,5));
const anCol=s=>{let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))>>>0;return 'hsl('+(h%360)+',52%,46%)'};
const anAv=v=>'<div class="an-av" style="background:'+anCol(v.vid)+'">'+(v.who?esc(v.who.trim().charAt(0).toUpperCase()):'<i class="fa-solid '+anIcon(v.type)+'" style="font-size:.95rem"></i>')+'</div>';
const anWho=v=>'<div class="an-who">'+anAv(v)+'<div style="min-width:0"><b>'+esc(anName(v))+'</b><small>'+(v.role&&v.role!=='guest'?'<span class="an-tag '+esc(v.role)+'">'+esc(AN_ROLE[v.role]||v.role)+'</span> ':'')+esc(anFlag(v.cc))+' '+esc(anLoc(v))+'</small></div></div>';
const anList=(t,ic,rows,o)=>{o=o||{};const m=Math.max(1,...rows.map(x=>x.c));return '<div class="card pad"><h3 style="margin-bottom:8px"><i class="fa-solid '+ic+'"></i> '+t+'</h3>'+(o.pg?'<p class="msg" style="margin:-4px 0 6px;font-size:.78rem">Tap a page to see who visited it.</p>':'')+(rows.length?rows.map(x=>'<div class="an-row"'+(o.pg?' data-pg="'+esc(x.k)+'" style="cursor:pointer"':'')+'><div class="k" title="'+esc(x.k)+'">'+(o.f?o.f(x):esc(x.k))+'</div><div class="n">'+x.c+'</div><div class="bar"><i style="width:'+(x.c/m*100)+'%"></i></div></div>').join(''):'<div class="msg" style="padding:8px 0">No data yet.</div>')+'</div>'};
const anCsvSave=(name,heads,rows)=>{const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"',csv=[heads.map(q).join(',')].concat(rows.map(r=>r.map(q).join(','))).join('\r\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)};
async function pgAnalytics(){
  const S=A.an=A.an||{days:7,tab:'over',q:'',flt:'',role:'',off:0};
  clearInterval(A.anT);A.anT=0;
  $('#pg').innerHTML=warnHTML()+'<div class="an-top"><h2 style="margin:0">Visitor analytics</h2><div id="an-rng"></div></div><div class="an-tabs" id="an-tabs"></div><div id="an-body"><div class="empty">Loading…</div></div>';
  wireWarn();
  $('#an-tabs').innerHTML=[['over','Overview','fa-chart-pie'],['vis','Visitors','fa-users'],['feed','Live activity','fa-bolt'],['set','Settings','fa-sliders']].map(t=>'<button data-t="'+t[0]+'" class="'+(S.tab===t[0]?'on':'')+'"><i class="fa-solid '+t[2]+'"></i> '+t[1]+'</button>').join('');
  $$('#an-tabs [data-t]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.t;S.off=0;pgAnalytics()});
  $('#an-rng').innerHTML=S.tab==='over'?'<div class="an-seg">'+[[1,'Today'],[7,'7 days'],[30,'30 days'],[90,'90 days']].map(r=>'<button data-d="'+r[0]+'" class="'+(S.days===r[0]?'on':'')+'">'+r[1]+'</button>').join('')+'</div>':'';
  $$('#an-rng [data-d]').forEach(b=>b.onclick=()=>{S.days=+b.dataset.d;pgAnalytics()});
  ({over:anOver,vis:anVisitors,feed:anFeed,set:anSettings})[S.tab](S);
}
function anAuto(S,tab,fn,ms){
  const tk=A.nav;A.anT=setInterval(()=>{if(A.page!=='analytics'||A.nav!==tk||S.tab!==tab||document.hidden){if(A.page!=='analytics'||A.nav!==tk||S.tab!==tab){clearInterval(A.anT);A.anT=0}return}fn()},ms);
}
async function anOver(S){
  const r=await guard(()=>api('an_data',{q:{days:S.days}}));if(!r||S.tab!=='over')return;
  const k=r.k,mx=Math.max(1,...r.series.map(x=>x.v)),mh=Math.max(1,...r.hours);
  const kp=[['Online now',k.online,'g'],['Visitors',k.visitors,''],['Page views',k.views,'n'],['Sessions',k.sessions,''],['New visitors',k.newv,'a'],['Returning',Math.max(0,k.visitors-k.newv),'n'],['Avg time / visitor',anDur(k.avg_secs),''],['Unique IPs',k.ips,'n'],['Signed-in people',k.identified,'g'],['All-time visitors',k.total,'']];
  const dl=s=>{const d=new Date(s+'T00:00:00');return d.getDate()+' '+d.toLocaleString('en-GB',{month:'short'})};
  const chart=S.days>1?'<div class="card pad" style="margin-bottom:18px"><h3 style="margin-bottom:4px"><i class="fa-solid fa-chart-column"></i> Visits per day</h3><p class="msg" style="margin:0 0 6px"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--teal)"></span> visitors &nbsp; <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#bfe6e0"></span> page views</p><div class="an-chart" style="margin-bottom:22px">'
    +r.series.map((x,i)=>'<div class="col" title="'+esc(dl(x.d))+': '+x.u+' visitors, '+x.v+' page views"><b style="height:'+(x.v/mx*100)+'%"><i style="height:'+(x.v?x.u/x.v*100:0)+'%"></i></b>'+(r.series.length<=14||i%5===0?'<span>'+esc(dl(x.d).split(' ')[0])+'</span>':'')+'</div>').join('')+'</div></div>':'';
  const hrs='<div class="card pad"><h3 style="margin-bottom:10px"><i class="fa-regular fa-clock"></i> Busy hours (Bangladesh time)</h3><div class="an-hours">'+r.hours.map((c,h)=>'<i title="'+((h%12)||12)+(h<12?' am':' pm')+': '+c+' views" style="opacity:'+(c?(0.18+0.82*c/mh).toFixed(2):'.07')+'"></i>').join('')+'</div><div class="an-hl"><span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span><span>11 pm</span></div></div>';
  const live='<div class="card pad" style="margin-bottom:18px"><h3 style="margin-bottom:8px"><span class="an-live"><i></i> Online now</span> <span class="msg" style="display:inline">· '+r.online.length+' visitor'+(r.online.length===1?'':'s')+' in the last 5 minutes</span></h3>'
    +(r.online.length?r.online.map(v=>'<div class="tm" style="cursor:pointer;gap:12px" data-v="'+esc(v.vid)+'">'+anAv(v)+'<div style="min-width:0;flex:1"><b style="font-size:.92rem">'+esc(anName(v))+'</b><div class="msg" style="font-size:.8rem">'+esc(anFlag(v.cc))+' '+esc(anLoc(v))+' · <span class="an-ip">'+esc(v.ip)+'</span></div><div class="msg" style="font-size:.8rem"><i class="fa-solid '+anIcon(v.type)+'"></i> '+esc(v.device)+' · '+esc(v.os)+' · '+esc(v.browser)+'</div></div><div style="text-align:right"><span class="badge b-approved">'+esc(anPage(v.page))+'</span><div class="msg" style="font-size:.76rem;margin-top:3px">'+esc(anAgo(v.last))+'</div></div></div>').join(''):'<div class="msg" style="padding:8px 0">Nobody is on the site right now.</div>')+'</div>';
  const sec=r.fails.length?'<div class="card pad" style="margin-bottom:18px;border-color:#f3c7cb"><h3 style="margin-bottom:8px;color:#a02a35"><i class="fa-solid fa-shield-halved"></i> Failed sign-ins (by IP)</h3>'+r.fails.map(f=>'<div class="an-row"><div class="k"><span class="an-ip">'+esc(f.ip)+'</span> <span class="msg" style="display:inline;font-size:.8rem">'+esc(f.place)+' · last '+esc(anAgo(f.last))+'</span></div><div class="n" style="color:#a02a35">'+f.c+'</div></div>').join('')+'<p class="msg" style="margin-top:8px;font-size:.8rem">Many failures from one IP can mean someone is guessing passwords.</p></div>':'';
  $('#an-body').innerHTML=(r.cfg.on?'':'<div class="err" style="margin:0 0 14px"><i class="fa-solid fa-circle-pause"></i> Tracking is switched OFF (Settings tab). Nothing new is being recorded.</div>')
    +'<div class="stats">'+kp.map(x=>'<div class="card stat '+x[2]+'"><b>'+x[1]+'</b><span>'+x[0]+'</span></div>').join('')+'</div>'+live+chart+'<div class="an-grid">'+hrs+anList('Pages visited','fa-file-lines',r.pages,{pg:1,f:x=>esc(anPage(x.k))+' <span class="msg" style="display:inline;font-size:.76rem">'+x.u+' visitor'+(x.u===1?'':'s')+'</span>'})
    +anList('Countries','fa-earth-asia',r.countries,{f:x=>esc(anFlag(x.cc))+' '+esc(x.k)})+anList('Cities / areas','fa-location-dot',r.cities)+anList('Device type','fa-mobile-screen-button',r.types,{f:x=>'<i class="fa-solid '+anIcon(x.k)+'"></i> '+esc(x.k.charAt(0).toUpperCase()+x.k.slice(1))})
    +anList('Phone / device models','fa-mobile',r.devices)+anList('Operating systems','fa-microchip',r.os)+anList('Browsers','fa-globe',r.browsers)+anList('Internet providers (network)','fa-network-wired',r.isps)
    +anList('Who they are','fa-id-badge',r.roles,{f:x=>esc(AN_ROLE[x.k]||x.k)})+anList('Screen sizes','fa-expand',r.screens)+anList('Languages','fa-language',r.langs)+anList('Came from','fa-arrow-right-to-bracket',r.refs)
    +'<div class="card pad"><h3 style="margin-bottom:8px"><i class="fa-solid fa-bolt"></i> What visitors did</h3>'+(r.actions.length?r.actions.map(x=>'<div class="an-row"><div class="k">'+esc(AN_ACT[x.k]||x.k)+(x.f?' <span class="an-tag fail">'+x.f+' failed</span>':'')+'</div><div class="n">'+x.c+'</div></div>').join(''):'<div class="msg" style="padding:8px 0">No activity yet.</div>')+'</div></div>'+sec;
  $$('#an-body [data-v]').forEach(e=>e.onclick=()=>anDetail(e.dataset.v));
  $$('#an-body [data-pg]').forEach(e=>e.onclick=()=>anPageWho(e.dataset.pg,S.days));
  anAuto(S,'over',async()=>{const x=await api('an_data',{q:{days:S.days}}).catch(()=>null);if(x&&S.tab==='over'&&A.page==='analytics')anOver(S)},60000);
}
async function anVisitors(S){
  const load=async()=>{
    const r=await guard(()=>api('an_visitors',{q:{q:S.q,flt:S.flt,role:S.role,off:S.off,limit:40}}));if(!r||S.tab!=='vis')return;
    const rows=r.rows.map(v=>'<tr data-v="'+esc(v.vid)+'" style="cursor:pointer"><td data-label="Visitor">'+anWho(v)+'</td><td data-label="IP address"><span class="an-ip">'+esc(v.ip)+'</span><br><span class="msg" style="font-size:.78rem">'+esc(v.isp)+'</span></td>'
      +'<td data-label="Device"><i class="fa-solid '+anIcon(v.type)+'"></i> <b>'+esc(v.device)+'</b><br><span class="msg" style="font-size:.78rem">'+esc([v.os,v.browser].filter(Boolean).join(' · '))+(v.screen?' · '+esc(v.screen):'')+(v.pwa?' · app':'')+'</span></td>'
      +'<td data-label="Pages visited">'+(v.pages&&v.pages.length?v.pages.map(p=>'<span class="chip" style="display:inline-block;margin:0 4px 4px 0;font-size:.74rem">'+esc(anPage(p.k))+' ×'+p.c+'</span>').join(''):'<span class="msg">—</span>')+(v.page?'<br><span class="msg" style="font-size:.76rem">now / last: <b>'+esc(anPage(v.page))+'</b></span>':'')+'</td><td data-label="Activity">'+v.visits+' visit'+(v.visits===1?'':'s')+' · '+v.hits+' pages<br><span class="msg" style="font-size:.78rem">'+anDur(v.secs)+' active</span></td>'
      +'<td data-label="Last seen"><span class="an-dot'+(v.online?' on':'')+'"></span>'+(v.online?'<b style="color:var(--green)">Online</b>':esc(anAgo(v.last)))+'<br><span class="msg" style="font-size:.78rem">'+esc(anDT(v.last))+'</span></td><td data-label="First seen">'+esc(anDT(v.first,1))+'</td></tr>').join('');
    $('#an-list').innerHTML=(r.rows.length?'<div class="tw"><table class="rt"><tr class="rt-h"><th>Visitor</th><th>IP address</th><th>Device</th><th>Pages visited</th><th>Activity</th><th>Last seen</th><th>First seen</th></tr>'+rows+'</table></div>':'<div class="empty">No visitors found.</div>')
      +'<div class="acts" style="justify-content:space-between;align-items:center;margin-top:12px"><span class="msg">'+(r.total?(S.off+1)+'–'+(S.off+r.rows.length)+' of '+r.total:'0')+' visitors</span><span style="display:flex;gap:8px"><button class="btn sm sec" id="an-pv"'+(S.off?'':' disabled')+'><i class="fa-solid fa-chevron-left"></i> Prev</button><button class="btn sm sec" id="an-nx"'+(S.off+40<r.total?'':' disabled')+'>Next <i class="fa-solid fa-chevron-right"></i></button></span></div>';
    $$('#an-list [data-v]').forEach(e=>e.onclick=()=>anDetail(e.dataset.v));
    $('#an-pv').onclick=()=>{S.off=Math.max(0,S.off-40);load()};$('#an-nx').onclick=()=>{S.off+=40;load()};
  };
  const sel=(id,cur,opts)=>'<select id="'+id+'" style="max-width:180px">'+opts.map(o=>'<option value="'+o[0]+'"'+(cur===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>';
  $('#an-body').innerHTML='<div class="card pad" style="margin-bottom:14px"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><input type="text" id="an-q" placeholder="Search IP, name, city, phone model, browser…" value="'+esc(S.q)+'" style="flex:1;min-width:200px">'
    +sel('an-f',S.flt,[['','All visitors'],['online','Online now'],['today','Active today'],['new','New (7 days)'],['known','Signed-in people']])+sel('an-r',S.role,[['','Any role'],['guest','Guests'],['student','Students'],['leader','Team leaders'],['teacher','Teachers'],['cr','CRs']])
    +'<button class="btn sm sec" id="an-csv"><i class="fa-solid fa-file-csv"></i> CSV</button></div></div><div id="an-list"><div class="empty">Loading…</div></div>';
  let tm=0;$('#an-q').oninput=e=>{clearTimeout(tm);tm=setTimeout(()=>{S.q=e.target.value.trim();S.off=0;load()},350)};
  $('#an-f').onchange=e=>{S.flt=e.target.value;S.off=0;load()};$('#an-r').onchange=e=>{S.role=e.target.value;S.off=0;load()};
  $('#an-csv').onclick=async()=>{
    const all=[];for(let off=0;off<5000;off+=100){const r=await guard(()=>api('an_visitors',{q:{q:S.q,flt:S.flt,role:S.role,off,limit:100}}));if(!r)return;all.push(...r.rows);if(all.length>=r.total||!r.rows.length)break}
    anCsvSave('visitors.csv',['Name / ID','Role','IP address','Country','Region','City','Network (ISP)','Device','Device type','OS','Browser','Screen','Language','Time zone','Installed app','Visits','Pages viewed','Active seconds','Last page','Pages visited','Viewport','Pixel ratio','Dark mode','CPU cores','RAM (GB)','Touch points','Network speed (Mbps)','Data saver','UTC offset (min)','First load (ms)','First seen (UTC)','Last seen (UTC)'],all.map(v=>[v.who||'Guest '+v.vid.slice(0,5),AN_ROLE[v.role]||v.role,v.ip,v.country,v.region,v.city,v.isp,v.device,v.type,v.os,v.browser,v.screen,v.lang,v.tz,v.pwa?'yes':'no',v.visits,v.hits,v.secs,anPage(v.page),(v.pages||[]).map(p=>anPage(p.k)+' x'+p.c).join('; '),v.extra.vp||'',v.extra.dpr||'',v.extra.dark===undefined?'':(v.extra.dark?'yes':'no'),v.extra.cores||'',v.extra.mem||'',v.extra.touch||'',v.extra.down||'',v.extra.save===undefined?'':(v.extra.save?'yes':'no'),v.extra.tzo===undefined?'':v.extra.tzo,v.extra.load||'',v.first,v.last]));
  };
  load();
}
async function anFeed(S){
  const draw=async()=>{
    const r=await guard(()=>api('an_feed'));if(!r||S.tab!=='feed')return;
    $('#an-body').innerHTML='<div class="an-note"><i class="fa-solid fa-rotate"></i> The newest 120 events. This list refreshes by itself every 15 seconds.</div>'
    +(r.rows.length?'<div class="card"><div class="tw"><table class="rt"><tr class="rt-h"><th>Time</th><th>Who</th><th>What</th><th>IP address</th><th>Place</th><th>Device</th></tr>'
    +r.rows.map(e=>{const what=e.kind==='action'?'<span class="an-tag '+(e.res==='fail'?'fail':'ok')+'">'+esc(AN_ACT[e.action]||e.action)+(e.res==='fail'?' · failed':'')+'</span>':(e.kind==='visit'?'<span class="an-tag">New visit</span> ':'')+esc(anPage(e.page))+(e.ref?' <span class="msg" style="display:inline;font-size:.76rem">from '+esc(e.ref)+'</span>':'');
      return '<tr'+(e.vid?' data-v="'+esc(e.vid)+'" style="cursor:pointer"':'')+'><td data-label="Time" style="white-space:nowrap">'+esc(anDT(e.ts))+'</td><td data-label="Who"><b>'+esc(e.who||('Guest'+(e.vid?' · '+e.vid.slice(0,5):'')))+'</b></td><td data-label="What">'+what+'</td><td data-label="IP address"><span class="an-ip">'+esc(e.ip)+'</span></td><td data-label="Place">'+esc([e.city,e.country].filter(Boolean).join(', ')||'—')+'</td><td data-label="Device">'+esc([e.device,e.browser].filter(Boolean).join(' · ')||'—')+'</td></tr>'}).join('')+'</table></div></div>':'<div class="empty">No activity recorded yet. Open the site in another browser (not signed in as admin) to see the first entry.</div>');
    $$('#an-body [data-v]').forEach(e=>e.onclick=()=>anDetail(e.dataset.v));
  };
  await draw();anAuto(S,'feed',draw,15000);
}
async function anSettings(S){
  const r=await guard(()=>api('an_data',{q:{days:1}}));if(!r||S.tab!=='set')return;
  const c=r.cfg,ck=(id,on,t,s)=>'<label style="display:flex;gap:10px;align-items:flex-start;margin:0 0 14px;cursor:pointer"><input type="checkbox" id="'+id+'"'+(on?' checked':'')+' style="width:auto;margin-top:5px"><span><b>'+t+'</b><br><span class="msg">'+s+'</span></span></label>';
  $('#an-body').innerHTML='<div class="card pad form" style="margin-bottom:18px"><h3 style="margin-bottom:10px"><i class="fa-solid fa-sliders"></i> Analytics settings</h3>'
    +ck('an-on',c.on,'Record visitors','Page views, IP address, approximate place (from the IP), device, browser and what people do (register, sign in, upload, chat).')
    +ck('an-sk',c.skip_admin,'Ignore my own visits while I am signed in as admin','So your testing does not fill the statistics. Turn this OFF only to test the tracker from your own browser.')
    +'<label class="f" style="max-width:260px">Keep data for (days)<input type="number" id="an-kd" min="7" max="365" value="'+c.keep_days+'"></label><p class="msg" style="margin:6px 0 14px">Older records are deleted automatically.</p>'
    +'<div class="acts"><button class="btn" id="an-sv"><i class="fa-solid fa-floppy-disk"></i> Save settings</button></div></div>'
    +'<div class="an-note"><b>What is recorded:</b> IP address, approximate city / country and network (looked up from the IP, not GPS), device model, OS, browser, screen size, language, which pages were opened and for how long, and the name of a signed-in teacher / CR / team leader / chat user. <b>Not recorded:</b> passwords, message text, exact GPS location. It is good practice to mention analytics in your privacy / terms page.</div>'
    +'<div class="card pad" style="border-color:#f3c7cb"><h3 style="margin-bottom:6px;color:#a02a35"><i class="fa-solid fa-trash"></i> Delete all analytics data</h3><p class="msg" style="margin:0 0 12px">Removes every visitor and activity record. Registrations, teachers and chats are not touched.</p><button class="btn sm" style="background:var(--red)" id="an-cl"><i class="fa-solid fa-trash"></i> Delete analytics data</button></div>';
  $('#an-sv').onclick=async()=>{if(await guard(()=>api('an_set',{json:{on:$('#an-on').checked,skip_admin:$('#an-sk').checked,keep_days:+$('#an-kd').value||90}})))toast('Settings saved.')};
  $('#an-cl').onclick=async()=>{if(!confirm('Delete ALL visitor analytics data? This cannot be undone.'))return;if(await guard(()=>api('an_clear',{json:{}}))){toast('Analytics data deleted.');pgAnalytics()}};
}
async function anDetail(vid){
  const r=await guard(()=>api('an_visitor',{q:{vid}}));if(!r)return;
  const v=r.v,x=v.extra||{},kv=(a,b)=>b?'<dt>'+a+'</dt><dd>'+b+'</dd>':'';
  openModal('<h3 style="margin-bottom:12px">Visitor details</h3><div style="margin-bottom:14px">'+anWho(v)+'</div><dl class="an-kv">'
    +kv('Status',v.online?'<span class="an-dot on"></span><b style="color:var(--green)">Online now</b> on '+esc(anPage(v.page)):'Last seen '+esc(anAgo(v.last))+' ('+esc(anDT(v.last,1))+')')
    +kv('First seen',esc(anDT(v.first,1)))+kv('Visits / pages',v.visits+' visits · '+v.hits+' pages · '+anDur(v.secs)+' active')
    +kv('IP address','<span class="an-ip">'+esc(v.ip)+'</span>')+kv('Place (from IP)',esc(anFlag(v.cc))+' '+esc(anLoc(v)))+kv('Network',esc(v.isp))
    +kv('Device','<i class="fa-solid '+anIcon(v.type)+'"></i> <b>'+esc(v.device)+'</b> ('+esc(v.type)+')')+kv('System',esc([v.os,v.browser].filter(Boolean).join(' · ')))
    +kv('Screen',esc(v.screen))+kv('Browser window',esc(x.vp||''))+kv('Pixel ratio',x.dpr?esc(x.dpr)+'x':'')+kv('Dark mode',x.dark===undefined?'':(x.dark?'Yes':'No'))+kv('CPU cores',x.cores?esc(x.cores):'')+kv('RAM (approx.)',x.mem?esc(x.mem)+' GB':'')+kv('Touch screen',x.touch?'Yes ('+esc(x.touch)+' points)':(x.touch===0?'No':''))+kv('Network speed',x.down?esc(x.down)+' Mbps':'')+kv('Data saver',x.save===undefined?'':(x.save?'On':'Off'))+kv('First page load',x.load?esc(x.load)+' ms':'')+kv('Cookies allowed',x.ck===undefined?'':(x.ck?'Yes':'No'))+kv('Language',esc(v.lang))+kv('Time zone',esc(v.tz))+kv('Connection',esc(v.conn))+kv('Installed app',v.pwa?'Yes (opened from home screen)':'No (browser)')+kv('Raw browser string','<span class="msg" style="font-size:.76rem">'+esc(r.ua)+'</span>')+'</dl>'
    +(r.ips.length>1?'<h4 style="margin:18px 0 6px">IP addresses used</h4><div class="an-tl">'+r.ips.map(x=>'<div><span class="an-ip">'+esc(x.ip)+'</span><span style="flex:1" class="msg">'+esc([x.city,x.country].filter(Boolean).join(', '))+'</span><time>'+esc(anDT(x.l))+'</time></div>').join('')+'</div>':'')
    +(r.pages.length?'<h4 style="margin:18px 0 6px">Pages visited</h4><div class="an-tl">'+r.pages.map(p=>'<div><span style="flex:1">'+esc(anPage(p.k))+'</span><b>'+p.c+'×</b></div>').join('')+'</div>':'')+'<h4 style="margin:18px 0 6px">Activity timeline</h4><div class="an-tl">'+(r.events.length?r.events.map(e=>'<div><time>'+esc(anDT(e.ts))+'</time><span style="flex:1">'+(e.kind==='action'?'<span class="an-tag '+(e.res==='fail'?'fail':'ok')+'">'+esc(AN_ACT[e.action]||e.action)+(e.res==='fail'?' · failed':'')+'</span>':(e.kind==='visit'?'<span class="an-tag">New visit</span> ':'')+esc(anPage(e.page))+(e.ref?' <span class="msg" style="display:inline;font-size:.76rem">from '+esc(e.ref)+'</span>':''))+'</span></div>').join(''):'<div class="msg">No events.</div>')+'</div>'
    +'<div class="acts" style="justify-content:flex-end;margin-top:16px"><button class="btn sec" onclick="closeModal()">Close</button></div>');
}

async function anPageWho(pg,days){
  const r=await guard(()=>api('an_page',{q:{page:pg,days}}));if(!r)return;
  openModal('<h3 style="margin-bottom:4px">'+esc(anPage(pg))+'</h3><p class="msg" style="margin:0 0 12px">'+r.rows.length+' visitor'+(r.rows.length===1?'':'s')+' opened this page ('+(days===1?'today':'last '+days+' days')+'). Tap a visitor for full details.</p>'
    +(r.rows.length?'<div class="an-tl" style="max-height:60vh">'+r.rows.map(v=>'<div data-pv="'+esc(v.vid)+'" style="cursor:pointer;gap:12px">'+anAv(v)+'<span style="flex:1;min-width:0"><b style="font-size:.9rem">'+esc(anName(v))+'</b><br><span class="msg" style="font-size:.78rem">'+esc(anFlag(v.cc))+' '+esc(anLoc(v))+' · <span class="an-ip">'+esc(v.ip)+'</span><br>'+esc(v.device)+' · '+esc(v.browser)+'</span></span><span style="text-align:right"><b>'+v.n+'×</b><br><span class="msg" style="font-size:.74rem">'+esc(anAgo(v.lt))+'</span></span></div>').join('')+'</div>':'<div class="empty">Nobody yet.</div>')
    +'<div class="acts" style="justify-content:flex-end;margin-top:16px"><button class="btn sec" onclick="closeModal()">Close</button></div>');
  $$('#mbox [data-pv]').forEach(e=>e.onclick=()=>{closeModal();anDetail(e.dataset.pv)});
}

/* v21: Backup & Restore page */
async function pgBackup(){
  const r=await guard(()=>api('backup_list'));if(!r)return;
  const sz=b=>b>=1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';
  const dl=n=>{location.href=API_URL+'?api=backup_download&name='+encodeURIComponent(n)+'&t='+encodeURIComponent(CSRF)};
  const ck=(id,on,t,s)=>'<label style="display:flex;gap:10px;align-items:flex-start;margin:0 0 12px;cursor:pointer"><input type="checkbox" id="'+id+'"'+(on?' checked':'')+' style="width:auto;margin-top:5px"><span><b>'+t+'</b><br><span class="msg">'+s+'</span></span></label>';
  const rows=r.backups.map(b=>'<tr><td><b>'+esc(b.name)+'</b></td><td>'+esc(b.time)+'</td><td>'+sz(b.size)+'</td><td style="white-space:nowrap"><button class="btn sm sec" data-bd="'+esc(b.name)+'"><i class="fa-solid fa-download"></i> Download</button> <button class="btn sm" data-br="'+esc(b.name)+'"><i class="fa-solid fa-rotate-left"></i> Restore</button> <button class="btn sm dng" data-bx="'+esc(b.name)+'"><i class="fa-solid fa-trash"></i></button></td></tr>').join('');
  $('#pg').innerHTML=warnHTML()+'<h2>Backup &amp; Restore</h2>'
  +(r.zip?'':'<div class="err" style="margin-bottom:14px"><i class="fa-solid fa-triangle-exclamation"></i> The PHP <b>zip</b> extension is not enabled on this server, so backups cannot be made. Ask your hosting provider to enable it.</div>')
  +'<div class="card pad form" style="margin-bottom:18px"><h3 style="margin-bottom:6px"><i class="fa-solid fa-box-archive"></i> Create a full backup</h3>'
  +'<p class="msg" style="margin:0 0 12px">One ZIP file with the <b>whole website</b>: the database ('+esc(r.driver)+' – every table), all uploads, presentation files, assignment files, settings, and the website code. Keep it somewhere safe (your computer / Google Drive) and <b>do not share it</b>: it contains <code>index.php</code> with the database password.</p>'
  +'<div class="acts" style="margin-top:0"><button class="btn" id="bkc"'+(r.zip?'':' disabled')+'><i class="fa-solid fa-file-zipper"></i> Create backup &amp; download</button></div></div>'
  +'<div class="card pad form" style="margin-bottom:18px"><h3 style="margin-bottom:6px"><i class="fa-solid fa-rotate-left"></i> Restore from a backup</h3>'
  +'<p class="msg" style="margin:0 0 14px">Use this after you update the website (or move to a new host): upload the ZIP and everything comes back as it was. <b>A safety backup of the current site is made automatically first.</b></p>'
  +ck('bk-db',true,'Database','All registrations, subjects, teachers, teams, assignments, settings and admin accounts. <b>Current data will be replaced.</b>')
  +ck('bk-data',true,'Uploaded files','Photos, presentations, assignment files and the data folder.')
  +ck('bk-mir',true,'Make uploaded files exactly like the backup','Also remove uploaded files that are not in the backup.')
  +ck('bk-code',false,'Website code (PHP files)','Leave this OFF when you just updated the website (the new version and its MySQL login stay). Turn ON only to bring back the old code too.')
  +'<div class="fg" style="margin-top:6px"><label class="f">Backup file (.zip)<input type="file" id="bkf" accept=".zip,application/zip"></label></div>'
  +'<div class="acts"><button class="btn" id="bku"><i class="fa-solid fa-upload"></i> Upload &amp; restore</button></div>'
  +'<p class="msg" style="margin:12px 0 0;font-size:.82rem">Server upload limit: '+esc(r.limit)+'. For a bigger ZIP, upload it into the <b>data/backups</b> folder with cPanel File Manager – it will appear in the list below. After restoring the database you will be asked to sign in again (with the admin password from the backup).</p></div>'
  +'<div class="card pad" style="margin-bottom:18px"><h3 style="margin-bottom:10px"><i class="fa-solid fa-server"></i> Backups saved on the server</h3>'
  +(r.backups.length?'<div class="tw"><table><tr><th>File</th><th>Created</th><th>Size</th><th></th></tr>'+rows+'</table></div>':'<div class="empty">No backups yet. Press “Create backup &amp; download”.</div>')+'</div>';
  wireWarn();
  const opts=fd=>{fd.append('db',$('#bk-db').checked?'1':'0');fd.append('data',$('#bk-data').checked?'1':'0');fd.append('code',$('#bk-code').checked?'1':'0');fd.append('mirror',$('#bk-mir').checked?'1':'0');return fd};
  const doRestore=async(fd,label)=>{
    if(!$('#bk-db').checked&&!$('#bk-data').checked&&!$('#bk-code').checked){toast('Tick at least one thing to restore.','err');return}
    if(!confirm('Restore from '+label+'?\n\nThe ticked parts of the current website will be REPLACED by the backup. A safety backup of the current site is created first.'))return;
    const x=await guard(()=>api('backup_restore',{form:opts(fd)}));
    if(x){alert('Restore complete.\n\nDatabase rows: '+x.rows+'\nFiles restored: '+x.files+(x.deleted?'\nOld files removed: '+x.deleted:'')+'\n\nSafety backup of the previous state: '+x.safety+(x.relogin?'\n\nPlease sign in again.':''));location.reload()}
  };
  $('#bkc').onclick=async()=>{const x=await guard(()=>api('backup_create',{form:new FormData()}));if(x){toast('Backup ready ('+sz(x.size)+'). Downloading…');dl(x.name);pgBackup()}};
  $('#bku').onclick=()=>{const f=$('#bkf').files[0];if(!f){toast('Choose a backup .zip file first.','err');return}const fd=new FormData();fd.append('zip',f);doRestore(fd,'“'+f.name+'”')};
  $$('[data-bd]').forEach(b=>b.onclick=()=>dl(b.dataset.bd));
  $$('[data-br]').forEach(b=>b.onclick=()=>{const fd=new FormData();fd.append('name',b.dataset.br);doRestore(fd,'“'+b.dataset.br+'”')});
  $$('[data-bx]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this backup file from the server?'))return;if(await guard(()=>api('backup_delete',{json:{name:b.dataset.bx}}))){toast('Backup deleted.');pgBackup()}});
}
function pgEmail(){
  $('#pg').innerHTML=warnHTML()+'<h2>Email</h2><div class="card pad form" style="margin-bottom:18px"><h3 style="margin-bottom:6px"><i class="fa-solid fa-envelope"></i> Email (Gmail) for password reset <span class="badge b-pending" id="smst" style="margin-left:6px">…</span></h3>'
  +'<p class="msg" style="margin:0 0 12px">Teachers and team leaders can reset a forgotten password with a 6-digit code sent from this Gmail. Type the Gmail and its App Password, then press <b>Save &amp; send test email</b>.</p>'
  +'<details class="smhow"><summary>How do I get an App Password?</summary><ol><li>Open the Google account of the sending Gmail and turn ON <b>2-Step Verification</b> (Security).</li><li>Open <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">myaccount.google.com/apppasswords</a>, type any name (for example Presentation) and press Create.</li><li>Copy the 16-letter code Google shows (spaces are fine) and paste it below. Do not use your normal Gmail password.</li></ol></details>'
  +'<div id="smlast"></div><div id="smerr"></div><div class="fg" style="margin-top:14px"><label class="f">Sending Gmail<input type="email" id="smu" maxlength="100" autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="email" placeholder="yourname@gmail.com"></label><label class="f">App Password<input type="password" id="smp" maxlength="64" autocomplete="new-password" spellcheck="false" placeholder="16-character App Password"></label><label class="f">Sender name <small>Optional</small><input type="text" id="smn" maxlength="60" autocomplete="off"></label></div>'
  +'<div class="acts"><button class="btn" id="smts"><i class="fa-solid fa-paper-plane"></i> Save &amp; send test email</button><button class="btn sec" id="smsv"><i class="fa-solid fa-floppy-disk"></i> Save only</button></div><p class="msg" style="margin:12px 0 0;font-size:.82rem">The test email is sent to the Gmail above. The App Password is stored encrypted and is never shown again.</p></div>';
  wireWarn();
  let SM=null;
  const pwc=v=>String(v||'').replace(/[\s\u00A0\u200B-\u200D\u2060\uFEFF\u202F]+/g,'');
  const smMsg=(m,ok)=>{$('#smerr').innerHTML=m?'<div class="'+(ok?'okb':'err')+'" style="margin:0 0 12px"><i class="fa-solid '+(ok?'fa-circle-check':'fa-circle-exclamation')+'" style="margin-top:3px"></i><span>'+esc(m)+'</span></div>':''};
  const smPaint=d=>{SM=d;const st=$('#smst');st.className='badge b-'+(d.configured?'approved':'pending');st.textContent=d.configured?'Ready':'Not set up';$('#smu').value=d.user||'';$('#smn').value=d.name||'';$('#smn').placeholder=d.site||'';$('#smp').placeholder=(d.configured&&d.src==='panel')?'Saved — leave empty to keep it':'16-character App Password';$('#smlast').innerHTML=d.last_err?'<div class="err" style="margin:0 0 12px"><i class="fa-solid fa-triangle-exclamation"></i> <b>Last password-reset email failed'+(d.last_err_at?' ('+esc(d.last_err_at)+')':'')+':</b> '+esc(d.last_err)+'</div>':''};
  const smCheck=()=>{
    const u=$('#smu').value.trim(),p=pwc($('#smp').value);
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u))return 'Enter the Gmail address used to send emails.';
    const keep=!!(SM&&SM.configured&&SM.src==='panel'&&String(SM.user).toLowerCase()===u.toLowerCase());
    if(p===''&&!keep)return 'Enter the 16-character App Password for this Gmail.';
    if(p!==''&&!/^[A-Za-z0-9]{16}$/.test(p))return 'The App Password must be 16 letters, like abcd efgh ijkl mnop. Your normal Gmail password will not work.';
    return '';
  };
  const smRun=async act=>{
    smMsg('');const bad=smCheck();if(bad){smMsg(bad);return}
    const bs=$$('#smsv,#smts');bs.forEach(b=>b.disabled=true);
    try{
      const d=await api(act,{json:{user:$('#smu').value.trim(),pass:$('#smp').value,name:$('#smn').value.trim()}});
      $('#smp').value='';smPaint(d);
      smMsg(d.message||'Email settings saved. Press "Save & send test email" to check that it works.',true);
      toast(act==='smtp_test'?'Saved and test email sent.':'Email settings saved.');
    }catch(e){
      if(e.status===401){authView();return}
      smMsg(e.message);
      if(/^Saved, but/.test(e.message)){try{const d=await api('smtp_get');SM=d;const st=$('#smst');st.className='badge b-'+(d.configured?'approved':'pending');st.textContent=d.configured?'Ready':'Not set up'}catch(_){}}
    }finally{bs.forEach(b=>b.disabled=false)}
  };
  (async()=>{const d=await guard(()=>api('smtp_get'));if(d)smPaint(d)})();
  $('#smp').addEventListener('input',function(){const c=pwc(this.value);if(/^[A-Za-z0-9]{0,16}$/.test(c)){const g=c.replace(/(.{4})(?=.)/g,'$1 ');if(g!==this.value)this.value=g}});
  ['#smu','#smp','#smn'].forEach(q=>$(q).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();smRun('smtp_test')}}));
  $('#smsv').onclick=()=>smRun('smtp_set');
  $('#smts').onclick=()=>smRun('smtp_test');
}
function optCardHTML(){
  return '<div class="card pad form" style="margin-bottom:18px"><h3 style="margin-bottom:6px"><i class="fa-solid fa-graduation-cap"></i> Semester, department &amp; program lists</h3><p class="msg" style="margin:0 0 12px">These lists fill the drop-downs when you add or edit a subject. One item per line. Changing a name here does not rename subjects that already use it.</p><div id="opterr"></div>'
  +'<div class="optg"><label class="f">Semesters<textarea id="o-terms"></textarea></label><label class="f">Departments<textarea id="o-depts"></textarea></label><label class="f">Programs<textarea id="o-progs"></textarea></label></div>'
  +'<div class="fg" style="margin-top:14px"><label class="f">Presentation file limit (MB)<small id="o-php" style="display:block"></small><input type="number" id="o-mb" min="1" max="200"></label></div>'
  +'<div class="acts"><button class="btn" id="o-save"><i class="fa-solid fa-floppy-disk"></i> Save lists</button></div></div>';
}
function wireOpt(){
  (async()=>{const sg=await guard(()=>api('settings_get'));if(!sg)return;const o=sg.options;OPTS=Object.assign(OPTS,o);
    $('#o-terms').value=o.terms.join('\n');$('#o-depts').value=o.depts.join('\n');$('#o-progs').value=o.programs.join('\n');$('#o-mb').value=o.pres_max_mb;
    $('#o-php').textContent='Server limit: '+sg.php_limit+'. The smaller value wins.'})();
  $('#o-save').onclick=async()=>{
    try{const r=await api('options_set',{json:{terms:$('#o-terms').value,depts:$('#o-depts').value,programs:$('#o-progs').value,pres_max_mb:+$('#o-mb').value}});
      OPTS=Object.assign(OPTS,r.options);$('#opterr').innerHTML='';toast('Lists saved.')}
    catch(e){if(e.status===401)authView();else $('#opterr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(e.message)+'</div>'}};
}
function pgSettings(){
  $('#pg').innerHTML=warnHTML()+'<h2>Settings</h2>'+optCardHTML()+'<div class="card pad form" style="margin-bottom:18px"><h3 style="margin-bottom:6px"><i class="fa-solid fa-signature"></i> Website name</h3><p class="msg" style="margin:0 0 12px">This name appears in the top bar, the browser tab title and the footer.</p><div id="snerr"></div><div class="sn"><label class="f" style="flex:1 1 260px">Name<input type="text" id="snm" maxlength="60" value="'+esc(SITE_NAME)+'"></label><button class="btn" id="snb"><i class="fa-solid fa-floppy-disk"></i> Save name</button></div></div><div class="card pad form" style="margin-bottom:18px"><h3 style="margin-bottom:6px"><i class="fa-solid fa-image"></i> Website logo</h3><p class="msg" style="margin:0 0 12px">Shown in the top bar and as the browser tab icon. A square image works best · JPG, PNG or WEBP · max 2 MB.</p><div id="lgerr"></div><div class="pbox"><div id="lgpv" class="lgpv"></div><label class="f" style="flex:1 1 220px">Choose logo<input type="file" id="lgf" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"></label></div><div class="acts"><button class="btn" id="lgsv"><i class="fa-solid fa-upload"></i> Upload logo</button><button class="btn sec" id="lgrm"><i class="fa-solid fa-trash"></i> Remove logo</button></div></div><div class="card pad form" style="margin-bottom:18px"><h3 style="margin-bottom:6px"><i class="fa-solid fa-chalkboard-user"></i> Teacher sign-up</h3><p class="msg" style="margin:0 0 12px">When ON, any teacher can create an account (name, department, mobile, Gmail, photo) and open registrations for their own subjects. You can still block or delete any teacher under Teachers.</p><div class="pub"><span class="badge" id="tsst">…</span><button class="btn" id="tsbtn" disabled>…</button></div></div><div class="card pad form" style="margin-bottom:18px"><h3 style="margin-bottom:6px">Public team list</h3><p class="msg" style="margin:0 0 12px">Master switch for the <b>Teams</b> page. While it is Private nobody sees anything. When it is Public, only the subjects you tick below appear, with all their teams and individuals (names, IDs and slots only — phone numbers and emails stay private).</p><div class="pub"><span class="badge" id="pubst">…</span><button class="btn" id="pubbtn" disabled>…</button></div><h4 style="margin:20px 0 0"><i class="fa-solid fa-list-check"></i> What to show, subject by subject</h4><p class="msg" style="margin:4px 0 0">Every subject gets its own public page (its own link, copy it here). Tick the subjects you want public. Every team and every individual registration of a ticked subject is shown. Changes save instantly. Rejected registrations are never shown.</p><div class="pubs" id="pubs"><span class="msg">Loading…</span></div></div><div class="card pad form"><h3 style="margin-bottom:12px">Admin account</h3><div id="serr"></div><div class="fg">'
  +'<label class="f">Username<input type="text" id="au" value="'+esc(A.user)+'" autocomplete="username"></label><label class="f">Current password<input type="password" id="ac" autocomplete="current-password"></label>'
  +'<label class="f">New password <small>8+ characters, letters and numbers. Leave empty to keep.</small><input type="password" id="an" autocomplete="new-password"></label></div><div class="acts"><button class="btn" id="asv"><i class="fa-solid fa-floppy-disk"></i> Update account</button></div></div>';
  wireWarn();wireOpt();
  const lgDraw=u=>{$('#lgpv').innerHTML=u?'<img src="'+esc(u)+'" alt="Logo">':'<i class="fa-solid fa-chalkboard-user"></i>';$('#lgrm').style.display=SITE_LOGO?'':'none'};
  const lgErr=m=>{$('#lgerr').innerHTML=m?'<div class="err" style="margin:0 0 12px">'+esc(m)+'</div>':''};
  lgDraw(SITE_LOGO);
  $('#lgf').onchange=()=>{lgErr('');const f=$('#lgf').files[0];if(!f){lgDraw(SITE_LOGO);return}
    if(!/^image\/(jpeg|png|webp)$/.test(f.type)){toast('Only JPG, PNG or WEBP images are allowed.','err');$('#lgf').value='';lgDraw(SITE_LOGO);return}
    if(f.size>2*1024*1024){toast('Logo must be 2 MB or smaller.','err');$('#lgf').value='';lgDraw(SITE_LOGO);return}
    lgDraw(URL.createObjectURL(f))};
  $('#lgsv').onclick=async()=>{const f=$('#lgf').files[0];if(!f){lgErr('Choose an image first.');return}
    const fd=new FormData();fd.append('logo',f);
    try{const r=await api('logo_set',{form:fd});setSiteLogo(r.logo);$('#lgf').value='';lgErr('');lgDraw(SITE_LOGO);toast('Logo updated.')}
    catch(e){if(e.status===401)authView();else lgErr(e.message)}};
  $('#lgrm').onclick=async()=>{if(!confirm('Remove the website logo?'))return;
    try{await api('logo_set',{json:{remove:true}});setSiteLogo('');$('#lgf').value='';lgErr('');lgDraw('');toast('Logo removed.')}
    catch(e){if(e.status===401)authView();else lgErr(e.message)}};
  $('#snb').onclick=async()=>{try{const r=await api('site_name_set',{json:{site_name:$('#snm').value}});setSiteName(r.site_name);$('#snm').value=r.site_name;$('#snerr').innerHTML='';toast('Website name updated.')}catch(e){if(e.status===401)authView();else $('#snerr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(e.message)+'</div>'}};
  (async()=>{const sg=await guard(()=>api('settings_get'));if(!sg)return;let ton=sg.teacher_signup;const tp=()=>{$('#tsst').className='badge b-'+(ton?'approved':'pending');$('#tsst').textContent=ton?'Open':'Closed';$('#tsbtn').innerHTML=ton?'<i class="fa-solid fa-lock"></i> Close teacher sign-up':'<i class="fa-solid fa-lock-open"></i> Open teacher sign-up';$('#tsbtn').disabled=false};tp();$('#tsbtn').onclick=async()=>{const r=await guard(()=>api('teacher_signup_set',{json:{on:!ton}}));if(r){ton=r.on;tp();toast(ton?'Teacher sign-up is open.':'Teacher sign-up is closed.')}}})();
  (async()=>{const sg=await guard(()=>api('settings_get'));if(!sg)return;PUBON=sg.teams_public;const paint=()=>{$('#pubst').className='badge b-'+(PUBON?'approved':'pending');$('#pubst').textContent=PUBON?'Public':'Private';$('#pubbtn').innerHTML=pubBtn();$('#pubbtn').disabled=false};paint();$('#pubbtn').onclick=async()=>{if(await togglePublic())paint()}})();
  (async()=>{
    const r=await guard(()=>api('subjects_admin'));if(!r)return;A.subjects=r.subjects;
    $('#pubs').innerHTML=r.subjects.length?r.subjects.map(s=>'<div class="pr" data-id="'+s.id+'"><b>'+esc(s.name)+'</b><label><input type="checkbox" class="pt" '+(+s.pub_teams?'checked':'')+'> <i class="fa-solid fa-earth-asia"></i> Show publicly</label><button type="button" class="btn sm sec cp"><i class="fa-regular fa-copy"></i> Copy link</button></div>').join(''):'<span class="msg">No subjects yet.</span>';
    $$('#pubs .cp').forEach(b=>b.onclick=async()=>{const u=location.origin+location.pathname+'#teams-'+b.closest('.pr').dataset.id;try{await navigator.clipboard.writeText(u);toast('Link copied.')}catch(e){prompt('Copy this link:',u)}});
    $$('#pubs .pr').forEach(row=>row.querySelectorAll('input').forEach(c=>c.onchange=async()=>{
      const t=c.checked;
      const ok=await guard(()=>api('subject_public_set',{json:{id:+row.dataset.id,public:t}}));
      if(ok){const sj=A.subjects.find(x=>x.id==row.dataset.id);if(sj){sj.pub_teams=+t;sj.pub_individuals=+t}toast('Saved.')}else c.checked=!c.checked;
    }));
  })();
  $('#asv').onclick=async()=>{
    try{const r=await api('account',{json:{username:$('#au').value,current:$('#ac').value,new_password:$('#an').value}});A.user=r.user;A.defpw=r.default_pw;toast('Account updated.');pgSettings()}
    catch(e){if(e.status===401)authView();else $('#serr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(e.message)+'</div>'}
  };
}
/* ================= TEACHER ================= */
let TSIGNUP=true;
function tStart(p){resetAcct();A.role='teacher';A.t=p;A.page='tdash';shell()}
async function teacherInit(){
  resetAcct();A.role='teacher';
  try{const r=await api('me');TSIGNUP=r.teacher_signup!==false;if(r.teacher)tStart(r.teacher.profile);else teacherLogin()}catch(e){teacherLogin()}
}
const phFile='<input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" data-mb="2">';
function teacherLogin(mode){
  clearPnav();A.role='teacher';mode=mode||'in';const up=mode==='up'&&TSIGNUP;
  const ROLES=[
    ['teacher','fa-chalkboard-user','Teacher','Create subjects, open registrations and review work.'],
    ['cr','fa-people-roof','Class Representative','Run forms for your own batch (CR).']
  ].concat(up?[]:[['leader','fa-crown','Team Leader','Sign in with your Gmail or mobile number. No password.']]);
  const logo=SITE_LOGO?'<img src="'+esc(SITE_LOGO)+'" alt="">':'<i class="fa-solid fa-graduation-cap"></i>';
  const feat=(ic,t,d)=>'<li><span class="af-i"><i class="fa-solid '+ic+'"></i></span><div><b>'+t+'</b><small>'+d+'</small></div></li>';
  const side='<aside class="auth-side"><div class="auth-brand"><span class="auth-logo">'+logo+'</span><span>'+esc(SITE_NAME||'Student Portal')+'</span></div>'
    +'<div class="auth-hero"><h1>'+(up?'Join the portal in a minute.':'Welcome back.')+'</h1><p>One place for presentations, assignments and lab reports, built for teachers, class representatives and team leaders.</p></div>'
    +'<ul class="auth-feat">'+feat('fa-chalkboard-user','Teachers','Build forms, set deadlines and manage every submission.')+feat('fa-crown','Team Leaders','Sign in with your Gmail or mobile to manage your team and upload your work.')+feat('fa-people-roof','Class Representatives','Open forms for your batch and keep everyone on time.')+'</ul>'
    +'<div class="auth-note"><i class="fa-solid fa-shield-halved"></i> Secure sign-in · Bangladesh Time (UTC+6)</div></aside>';
  const head='<div class="auth-head"><span class="auth-eye">'+(up?'Create account':'Account sign in')+'</span><h2>'+(up?'Create your account':'Sign in to your account')+'</h2><p class="msg">'+(up?'Teachers and class representatives can create an account. Team leaders can only sign in.':'Choose who you are, then sign in.')+'</p></div>';
  const tabs=TSIGNUP?'<div class="tabs2"><button type="button" data-m="in" class="'+(up?'':'on')+'"><i class="fa-solid fa-right-to-bracket"></i> Sign in</button><button type="button" data-m="up" class="'+(up?'on':'')+'"><i class="fa-solid fa-user-plus"></i> Create account</button></div>':'';
  const roles='<div class="roles-l">I am a…</div><div class="roles'+(up?' two':'')+'" role="radiogroup" aria-label="Account type">'+ROLES.map(r=>'<button type="button" class="role" role="radio" aria-checked="false" data-r="'+r[0]+'"><span class="role-i"><i class="fa-solid '+r[1]+'"></i></span><span class="role-t"><b>'+r[2]+'</b><small>'+r[3]+'</small></span></button>').join('')+'</div>';
  const stu='<form id="llf" class="auth-grid one" hidden><label class="f">Gmail or mobile number <small>The one you gave when your team registered. No password needed.</small><input type="text" id="llu" autocomplete="username" placeholder="leader@gmail.com or 01XXXXXXXXX" required></label><div id="llerr"></div><button class="btn auth-go" type="submit"><i class="fa-solid fa-right-to-bracket"></i> Sign in as team leader</button><p class="auth-hint"><i class="fa-solid fa-circle-info"></i> Team leader accounts are not created here. Your team gets access when it registers for a subject.</p></form>';
  const upForm='<form id="lf" class="auth-grid"><input type="hidden" id="tat" value="teacher">'
    +'<div class="pbox span2"><div id="tpv">'+tav('','lg')+'</div><label class="f">Profile photo <small>Optional · JPG, PNG or WEBP · max 2 MB</small><input type="file" id="tph" data-mb="2" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"></label></div>'
    +'<label class="f span2" id="tbw" style="display:none"><span class="req">Your batch</span><small>Your registration forms will be locked to this batch</small><input type="text" id="tb" data-num="1" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="e.g. 32"></label>'
    +'<label class="f"><span class="req">Full name</span><input type="text" id="tn" maxlength="80" placeholder="e.g. Dr. Md. Rahim" required></label>'
    +'<label class="f"><span class="req">Department</span><input type="text" id="td" maxlength="80" placeholder="e.g. CSE" required></label>'
    +'<label class="f"><span class="req">Mobile number</span><input type="tel" id="tp" maxlength="24" placeholder="01XXXXXXXXX" required></label>'
    +'<label class="f"><span class="req">Gmail</span><input type="email" id="lu" maxlength="100" autocomplete="username" placeholder="teacher@gmail.com" required></label>'
    +'<label class="f span2"><span class="req">Password</span><small>8+ characters, letters and numbers</small><input type="password" id="lp" autocomplete="new-password" required></label>'
    +'<button class="btn span2 auth-go" id="tsub" type="submit"><i class="fa-solid fa-user-plus"></i> Create my account</button></form>';
  const inForm='<form id="lf" class="auth-grid one"><label class="f">Gmail<input type="email" id="lu" autocomplete="username" placeholder="teacher@gmail.com" required></label>'
    +'<label class="f">Password<span class="pw-w"><input type="password" id="lp" autocomplete="current-password" required><button type="button" class="pw-eye" id="pwe" aria-label="Show password"><i class="fa-regular fa-eye"></i></button></span></label>'
    +'<button class="btn auth-go" type="submit"><i class="fa-solid fa-right-to-bracket"></i> Sign in</button></form>';
  $('#app').innerHTML='<div class="wrap"><div class="auth-shell">'+side+'<section class="auth-main">'+head+tabs+'<div id="lerr"></div>'+(up?roles+upForm:roles+stu+inForm)
    +'<p class="auth-foot"><a href="#"><i class="fa-solid fa-arrow-left"></i> Back to Home</a></p></section></div></div>';
  $$('.tabs2 button').forEach(b=>b.onclick=()=>teacherLogin(b.dataset.m));
  if(!up){
    $('#lf').insertAdjacentHTML('afterend','<p style="text-align:center;margin:12px 0 0"><a href="#teacher" id="fgl">Forgot password?</a></p>');$('#fgl').onclick=e=>{e.preventDefault();forgotView('teacher')};
    $('#pwe').onclick=()=>{const i=$('#lp'),s=i.type==='password';i.type=s?'text':'password';$('#pwe').innerHTML='<i class="fa-regular '+(s?'fa-eye-slash':'fa-eye')+'"></i>'};
  }
  if(up){bindPhoto($('#tph'),$('#tpv'),u=>tav(u,'lg'));pwSuggestBtn($('#lp'),()=>({name:$('#tn').value,phone:$('#tp').value,email:$('#lu').value}))}
  const setRole=r=>{
    $$('.role').forEach(b=>{const on=b.dataset.r===r;b.classList.toggle('on',on);b.setAttribute('aria-checked',on?'true':'false')});
    const lead=r==='leader',cr=r==='cr';
    $('#lf').hidden=lead;const llf=$('#llf');if(llf)llf.hidden=!lead;
    const fg=$('#fgl');if(fg)fg.parentNode.hidden=lead;
    $('#lu').placeholder=cr?'student@gmail.com':'teacher@gmail.com';
    if(up){
      $('#tat').value=cr?'cr':'teacher';$('#tbw').style.display=cr?'':'none';
      $('#tn').placeholder=cr?'e.g. Rahim Uddin':'e.g. Dr. Md. Rahim';
      $('#tsub').innerHTML='<i class="fa-solid fa-user-plus"></i> '+(cr?'Create my CR account':'Create my teacher account');
    }
  };
  $$('.role').forEach(b=>b.onclick=()=>setRole(b.dataset.r));setRole('teacher');
  if(!up)$('#llf').onsubmit=async e=>{e.preventDefault();
    try{const r=await api('leader_login',{json:{email:$('#llu').value.trim()}});CSRF=r.csrf;$('meta[name=csrf]').content=CSRF;A.role='leader';L.d=r.leader;L.page='over';L.rf=0;try{history.replaceState(null,'','#teams-leader')}catch(e2){}leaderShell();toast('Welcome, team '+(L.d.reg.team_name||'leader')+'.')}
    catch(x){$('#llerr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(x.message)+'</div>'}};
  $('#lf').onsubmit=async e=>{e.preventDefault();
    try{
      let r;
      if(up){
        const fd=new FormData();fd.append('name',$('#tn').value);fd.append('department',$('#td').value);fd.append('phone',$('#tp').value);fd.append('email',$('#lu').value);fd.append('password',$('#lp').value);fd.append('acct_type',$('#tat').value);fd.append('batch',$('#tat').value==='cr'?$('#tb').value:'');
        const f=$('#tph').files[0];if(f)fd.append('photo',f);
        r=await api('teacher_register',{form:fd});
      }else r=await api('teacher_login',{json:{email:$('#lu').value,password:$('#lp').value}});
      CSRF=r.csrf;$('meta[name=csrf]').content=CSRF;tStart(r.teacher.profile);toast(up?'Account created. Welcome, '+A.t.name+'!':'Welcome, '+A.t.name+'.');
    }catch(x){$('#lerr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(x.message)+'</div>'}};
}
function pgTDash(){
  const t=A.t;
  $('#pg').innerHTML='<h2>Welcome, '+esc(t.name)+'</h2><div class="card pad tprof"><div class="tp-in">'+tav(t.photo,'lg')+'<div><h3>'+esc(t.name)+'</h3><span class="msg">'+esc(t.department)+(t.acct_type==='cr'?' · CR · Batch '+esc(t.batch):'')+'</span><span class="msg"><i class="fa-solid fa-phone"></i> '+esc(t.phone)+' · <i class="fa-solid fa-envelope"></i> '+esc(t.email)+'</span></div></div><div class="acts" style="margin:0"><button class="btn" id="tnew"><i class="fa-solid fa-plus"></i> Create new subject</button><button class="btn sec" id="tprf"><i class="fa-solid fa-id-card"></i> Edit profile</button></div></div><div class="stats" id="tst" style="margin-top:18px"></div><div id="tsl"></div>';
  $('#tnew').onclick=()=>{A.page='subjects';shell();setTimeout(()=>{const b=$('#add');if(b)b.click()},350)};
  $('#tprf').onclick=()=>{A.page='tprofile';shell()};
  const tst0=$('#tst');if(tst0){tst0.insertAdjacentHTML('beforebegin','<button type="button" class="admrv" id="tdrv"><span class="hm-ic"><i class="fa-solid fa-star"></i></span><span class="hm-tx"><b>Reviews &amp; feedback</b><small>Write a review or share an idea</small></span><i class="fa-solid fa-chevron-right hm-go"></i></button>');$('#tdrv').onclick=()=>{A.page='reviews';shell()}}
  (async()=>{const r=await guard(()=>api('subjects_admin'));if(!r)return;A.subjects=r.subjects;SRV_OFF=r.server_now*1000-Date.now();
    const n=A.subjects,open=n.filter(x=>x.state==='open').length,regs=n.reduce((a,x)=>a+x.reg_count,0);
    $('#tst').innerHTML=[['My subjects',n.length,'n'],['Open now',open,'g'],['Presentation Registrations',regs,'']].map(x=>'<div class="card stat '+x[2]+'"><b>'+x[1]+'</b><span>'+x[0]+'</span></div>').join('');
    $('#tsl').innerHTML=n.length?'<div class="card pad"><h3 style="margin-bottom:12px">Your subjects</h3><div class="dlist">'+n.slice().sort((a,b)=>batchCmp(subjBatch(a),subjBatch(b))).map(x=>'<div class="dr"><div class="dn"><b>'+esc(x.name)+' <span class="scode">'+esc(subjBatch(x))+'</span>'+(x.code?' <span class="scode">'+esc(x.code)+'</span>':'')+'</b><span class="msg">'+x.reg_count+' registration'+(x.reg_count==1?'':'s')+' · '+esc(x.message)+(x.cr_pending?' · Waiting for admin approval':'')+'</span></div><span class="badge b-'+x.state+'" style="justify-self:start">'+(x.late?'Open · Late':({open:'Open',closed:'Closed',soon:'Not open yet',full:'Full'})[x.state])+'</span></div>').join('')+'</div></div>':'<div class="card empty"><i class="fa-solid fa-book-open" style="font-size:1.8rem;display:block;margin-bottom:8px"></i>You have not created a subject yet. Click “Create new subject” to open registrations for your course — you design the form, slots and deadline.</div>';
  })();
}
function pgTProfile(){
  const t=A.t;
  $('#pg').innerHTML='<h2>My profile</h2><div class="card pad form"><h3 style="margin-bottom:12px">Teacher details</h3><div id="serr"></div>'
  +'<div class="pbox" style="margin-bottom:14px"><div id="tpv">'+tav(t.photo,'lg')+'</div><label class="f">Profile photo <small>JPG, PNG or WEBP · max 2 MB</small><input type="file" id="tph" data-mb="2" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"></label>'+(t.photo?'<label><input type="checkbox" id="trm"> Remove photo</label>':'')+'</div><div class="fg">'
  +'<label class="f"><span class="req">Full name</span><input type="text" id="pn" maxlength="80" value="'+esc(t.name)+'"></label>'
  +'<label class="f"><span class="req">Department</span><input type="text" id="pd" maxlength="80" value="'+esc(t.department)+'"></label>'
  +'<label class="f"><span class="req">Mobile number</span><input type="tel" id="pp" maxlength="24" placeholder="01XXXXXXXXX" value="'+esc(t.phone)+'"></label>'
  +'<label class="f"><span class="req">Gmail (your login)</span><input type="email" id="pe" maxlength="100" value="'+esc(t.email)+'"></label>'
  +'<label class="f">New password <small>8+ characters, letters and numbers. Leave empty to keep.</small><input type="password" id="pnw" autocomplete="new-password"></label>'
  +'<label class="f">Current password <small>Needed only to change Gmail or password.</small><input type="password" id="pc" autocomplete="current-password"></label></div>'
  +'<div class="acts"><button class="btn" id="psv"><i class="fa-solid fa-floppy-disk"></i> Save details</button></div></div>';
  bindPhoto($('#tph'),$('#tpv'),u=>tav(u||t.photo,'lg'));
  $('#psv').onclick=async()=>{
    try{
      let r=await api('teacher_profile',{json:{name:$('#pn').value,department:$('#pd').value,phone:$('#pp').value,email:$('#pe').value,new_password:$('#pnw').value,current:$('#pc').value}});A.t=r.profile;
      const f=$('#tph').files[0],rm=!!($('#trm')&&$('#trm').checked);
      if(f||rm){const fd=new FormData();if(f)fd.append('photo',f);else fd.append('remove','1');r=await api('teacher_photo_save',{form:fd});A.t=r.profile}
      toast('Profile updated.');A.subjects=[];shell();
    }catch(e){if(e.status===401)authView();else{$('#serr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(e.message)+'</div>';$('#serr').scrollIntoView({behavior:'smooth',block:'center'})}}
  };
}
/* ----- admin: manage all teachers ----- */
async function pgTeachers(){
  const [r,sr0]=await Promise.all([guard(()=>api('teachers_admin')),guard(()=>api('subjects_admin'))]);if(!r)return;A.teachers=r.teachers;if(sr0)A.subjects=sr0.subjects;
  const V=getView(),on=t=>t.status==='active';
  const sb=t=>'<span class="badge b-'+(on(t)?'approved':'rejected')+'">'+(on(t)?'Active':'Blocked')+'</span>';
  const ac=(t,l)=>'<button class="btn sm sec" data-te="'+t.id+'" title="Edit" aria-label="Edit"><i class="fa-solid fa-pen"></i>'+(l?' Edit':'')+'</button><button class="btn sm sec" data-tb="'+t.id+'" title="'+(on(t)?'Block':'Unblock')+'" aria-label="'+(on(t)?'Block':'Unblock')+'"><i class="fa-solid fa-'+(on(t)?'ban':'lock-open')+'"></i>'+(l?' '+(on(t)?'Block':'Unblock'):'')+'</button><button class="btn sm dng" data-td="'+t.id+'" title="Delete" aria-label="Delete"><i class="fa-solid fa-trash"></i>'+(l?' Delete':'')+'</button>';
  const cardsH='<div class="grid sgrid">'+A.teachers.map(t=>'<div class="card scard"><div class="sc-h"><div class="who2">'+tav(t.photo,'sm')+'<h3>'+esc(t.name)+'</h3></div>'+sb(t)+'</div>'
    +'<dl class="kv"><div class="wide"><dt>Department</dt><dd>'+esc(t.department||'—')+'</dd></div><div class="wide"><dt>Batches</dt><dd>'+esc(teachBatches(t)||'—')+'</dd></div><div><dt>Mobile</dt><dd>'+esc(t.phone||'—')+'</dd></div><div><dt>Subjects</dt><dd>'+t.subject_count+'</dd></div><div class="wide"><dt>Gmail</dt><dd>'+esc(t.email)+'</dd></div><div class="wide"><dt>Password</dt><dd>'+pwCell(t.password)+'</dd></div></dl>'
    +'<div class="sc-a">'+ac(t,1)+'</div></div>').join('')+'</div>';
  const tblH='<div class="card"><div class="tw"><table class="tchtbl"><tr><th>Teacher</th><th>Department</th><th>Batches</th><th>Mobile</th><th>Gmail</th><th>Password</th><th>Subjects</th><th>Status</th><th></th></tr>'
    +A.teachers.map(t=>'<tr class="trw"><td><div class="who2">'+tav(t.photo,'sm')+'<b>'+esc(t.name)+'</b></div></td><td>'+esc(t.department||'—')+'</td><td>'+esc(teachBatches(t)||'—')+'</td><td>'+esc(t.phone||'—')+'</td><td>'+esc(t.email)+'</td><td>'+pwCell(t.password)+'</td><td>'+t.subject_count+'</td><td>'+sb(t)+'</td><td><div class="row">'+ac(t,0)+'</div></td></tr>').join('')+'</table></div></div>';
  $('#pg').innerHTML=warnHTML()+'<div class="tools"><h2 style="margin:0;margin-right:auto">Teachers</h2>'+vtogHTML()+'<button class="btn" id="tadd"><i class="fa-solid fa-user-plus"></i> Add teacher</button><label class="pe-s tsrch"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="tcq" placeholder="Search teacher…"></label></div>'
  +(A.teachers.length?(V==='excel'?teachExcel(A.teachers):V==='table'?tblH:cardsH):'<div class="card empty"><i class="fa-solid fa-chalkboard-user" style="font-size:1.8rem;display:block;margin-bottom:8px"></i>No teachers yet.</div>');
  wireView(pgTeachers);
  const tcq=$('#tcq');if(tcq)tcq.oninput=()=>{const q=nq(tcq.value).split(/\s+/).filter(Boolean);$$('#pg .scard,#pg .trw').forEach(c=>{const h=nq(c.textContent);c.style.display=q.every(w=>h.includes(w))?'':'none'})};
  wireWarn();
  const gt=id=>A.teachers.find(x=>x.id==id);
  $('#tadd').onclick=()=>teacherForm();
  $$('[data-te]').forEach(b=>b.onclick=()=>teacherForm(gt(b.dataset.te)));
  $$('[data-tb]').forEach(b=>b.onclick=async()=>{const t=gt(b.dataset.tb),nx=t.status==='active'?'blocked':'active';
    if(nx==='blocked'&&!confirm('Block '+t.name+'? They cannot sign in and their '+t.subject_count+' subject(s) will be closed for registration.'))return;
    if(await guard(()=>api('teacher_admin_save',{json:{id:t.id,name:t.name,department:t.department,phone:t.phone,email:t.email,status:nx}}))){toast(nx==='blocked'?'Teacher blocked.':'Teacher unblocked.');pgTeachers()}});
  $$('[data-td]').forEach(b=>b.onclick=async()=>{const t=gt(b.dataset.td);if(!confirm('Delete teacher '+t.name+'? Their '+t.subject_count+' subject(s) stay but become unassigned.'))return;
    if(await guard(()=>api('teacher_admin_delete',{json:{id:t.id}}))){toast('Teacher deleted.');pgTeachers()}});
}
function teacherForm(t){
  t=t||{id:0,name:'',department:'',phone:'',email:'',photo:'',status:'active'};
  openModal('<div class="mt"><h3>'+(t.id?'Edit teacher':'Add teacher')+'</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div id="merr"></div>'
  +'<div class="pbox" style="margin-bottom:14px"><div id="tpv">'+tav(t.photo,'lg')+'</div><label class="f">Photo <small>Optional · JPG, PNG or WEBP · max 2 MB</small><input type="file" id="tph" data-mb="2" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"></label>'+(t.photo?'<label><input type="checkbox" id="trm"> Remove photo</label>':'')+'</div><div class="fg">'
  +'<label class="f"><span class="req">Full name</span><input type="text" id="fn" maxlength="80" value="'+esc(t.name)+'"></label>'
  +'<label class="f"><span class="req">Department</span><input type="text" id="fd" maxlength="80" value="'+esc(t.department)+'"></label>'
  +'<label class="f"><span class="req">Mobile number</span><input type="tel" id="fp" maxlength="24" placeholder="01XXXXXXXXX" value="'+esc(t.phone)+'"></label>'
  +'<label class="f"><span class="req">Gmail (login)</span><input type="email" id="fe" maxlength="100" autocomplete="off" value="'+esc(t.email)+'"></label>'
  +'<label class="f">'+(t.id?'New password':'<span class="req">Password</span>')+' <small>'+(t.id?(t.password?'Current password is filled in. Edit it to change.':'Not known yet. Type one to set it.'):'8+ characters, letters and numbers.')+'</small><input type="password" id="fw" maxlength="60" autocomplete="new-password" value="'+esc(t.password||'')+'"></label>'
  +'<label class="f">Account status<select id="fst"><option value="active" '+(t.status==='active'?'selected':'')+'>Active</option><option value="blocked" '+(t.status==='blocked'?'selected':'')+'>Blocked</option></select></label></div>'
  +'<div class="acts" style="justify-content:flex-end"><button class="btn sec" onclick="closeModal()">Cancel</button><button class="btn" id="fsv"><i class="fa-solid fa-floppy-disk"></i> Save teacher</button></div>');
  bindPhoto($('#tph'),$('#tpv'),u=>tav(u||t.photo,'lg'));
  $('#fsv').onclick=async()=>{
    try{
      const r=await api('teacher_admin_save',{json:{id:t.id,name:$('#fn').value,department:$('#fd').value,phone:$('#fp').value,email:$('#fe').value,password:$('#fw').value,status:$('#fst').value}});
      const f=$('#tph').files[0],rm=!!($('#trm')&&$('#trm').checked);
      if(f||rm){const fd=new FormData();fd.append('id',r.id);if(f)fd.append('photo',f);else fd.append('remove','1');await api('teacher_admin_photo',{form:fd})}
      closeModal();toast('Teacher saved.');pgTeachers();
    }catch(e){if(e.status===401)authView();else $('#merr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(e.message)+'</div>'}
  };
}
/* ================= FORGOT PASSWORD (teacher + team leader) ================= */
function forgotView(role){
  const lead=role==='leader',back=()=>lead?leaderLogin():teacherLogin('in');
  let em='';
  $('#app').innerHTML='<div class="wrap"><div class="card pad login"><div style="text-align:center;margin-bottom:16px">'+lav('var(--teal)','fa-key')+'<h2>Forgot password</h2><p class="msg" id="fgm"></p></div><div id="fge"></div><form id="fgf" style="display:grid;gap:14px"></form><p style="text-align:center;margin:14px 0 0"><a href="#" id="fgb">← Back to sign in</a></p></div></div>';
  $('#fgb').onclick=e=>{e.preventDefault();back()};
  const err=m=>{$('#fge').innerHTML=m?'<div class="err" style="margin:0 0 12px">'+esc(m)+'</div>':''};
  const step1=()=>{
    err('');$('#fgm').textContent='Enter the Gmail you use to sign in as '+(lead?'a team leader':'a teacher')+'. We will email you a 6-digit code.';
    $('#fgf').innerHTML='<label class="f">Gmail<input type="email" id="fgem" autocomplete="username" placeholder="you@gmail.com" value="'+esc(em)+'" required></label><button class="btn" type="submit"><i class="fa-solid fa-paper-plane"></i> Send code</button>';
    $('#fgf').onsubmit=async e=>{e.preventDefault();em=$('#fgem').value.trim();
      try{const r=await api('forgot_request',{json:{role:lead?'leader':'teacher',email:em}});toast(r.message);step2()}
      catch(x){err(x.message)}};
  };
  const step2=()=>{
    err('');$('#fgm').textContent='If '+em+' is registered, a code is on its way (check Spam too). It works for 15 minutes. No email after 2 minutes? Check the Gmail spelling or ask your admin.';
    $('#fgf').innerHTML='<label class="f">6-digit code<input type="text" id="fgc" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" required></label><label class="f">New password <small>8+ characters, letters and numbers</small><input type="password" id="fgp" autocomplete="new-password" required></label><label class="f">Confirm new password<input type="password" id="fgp2" autocomplete="new-password" required></label><button class="btn" type="submit"><i class="fa-solid fa-lock"></i> Reset password</button><button class="btn sec" type="button" id="fgr">Send a new code</button>';
    $('#fgr').onclick=()=>step1();
    $('#fgf').onsubmit=async e=>{e.preventDefault();
      if($('#fgp').value!==$('#fgp2').value){err('The two passwords do not match.');return}
      try{await api('forgot_reset',{json:{role:lead?'leader':'teacher',email:em,code:$('#fgc').value,new_password:$('#fgp').value}});toast('Password changed. Please sign in.');back()}
      catch(x){err(x.message)}};
  };
  step1();
}
/* ================= TEAM LEADER ================= */
const L={d:null,page:'team',rf:0,go:''};
async function leaderRefresh(){if(L.rf===L.d.reg.id)return;L.rf=L.d.reg.id;try{const r=await api('me');if(r.leader){L.d=r.leader;leaderShell()}}catch(e){}}
const LNAV=[['over','fa-layer-group','My subjects'],['team','fa-people-group','Team'],['pres','fa-display','Presentation'],['lpass','fa-user-gear','Account'],['chat','fa-headset','Contact admin'],['reviews','fa-star','Reviews'],['all','fa-users','All teams']];
async function leaderInit(){
  A.role='leader';
  try{const r=await api('me');if(r.leader){L.d=r.leader;L.page=L.go||'over';L.go='';leaderShell()}else leaderLogin()}catch(e){leaderLogin()}
}
function leaderLogin(){
  A.role='leader';clearPnav();
  $('#app').innerHTML='<div class="wrap">'+teamsTabs('leader')+'<div class="card pad login"><div style="text-align:center;margin-bottom:16px">'+lav('var(--amber)','fa-crown')+''
  +'<h2>Team leader sign in</h2><p class="msg">Enter the Gmail or the mobile number you gave when your team registered. No password needed.</p></div><div id="lerr"></div>'
  +'<form id="lf" style="display:grid;gap:14px">'
  +'<label class="f">Gmail or mobile number<input type="text" id="lu" autocomplete="username" placeholder="leader@gmail.com or 01XXXXXXXXX" required></label>'
  +'<button class="btn" type="submit">Sign in</button></form></div></div>';
  $('#lf').onsubmit=async e=>{e.preventDefault();
    try{
      const r=await api('leader_login',{json:{email:$('#lu').value.trim()}});
      CSRF=r.csrf;$('meta[name=csrf]').content=CSRF;A.role='leader';L.d=r.leader;L.page='over';L.rf=0;leaderShell();toast('Welcome, team '+(L.d.reg.team_name||'leader')+'.');
    }catch(x){$('#lerr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(x.message)+'</div>'}};
}
/* v34: team leader -> chat with the admin (profile is made automatically from the leader's own details) */
async function leaderChat(){
  try{await api('leader_chat',{json:{}})}catch(e){}
  try{sessionStorage.setItem('ch_adm','1');sessionStorage.setItem('ch_from','leader')}catch(x){}
  location.hash='#chat';
}
function leaderShell(){
  setPnav(LNAV,L.page,p=>{if(p==='all'){location.hash='#teams';return}if(p==='chat'){leaderChat();return}L.page=p;leaderShell()},doLogout,L.d.email||'Team leader');
  $('#app').innerHTML='<main class="main"><div id="pg"></div></main>';
  ({over:pgLOver,team:pgLTeam,pres:pgLPres,lpass:pgLPass,reviews:pgPReviews})[L.page]();
}
/* Leader profile: every team this Gmail leads, grouped by subject, with search + filters */
function pgLOver(){
  const d=L.d,ts=(d.teams||[]).map(t=>Object.assign({},t,{name:t.subject_name})).sort((a,b)=>a.name.localeCompare(b.name)||a.id-b.id),FL=L.fl||(L.fl={q:'',sem:'',dept:'',prog:'',batch:''});
  const subs=new Set(ts.map(t=>t.subject_id)).size;
  $('#pg').innerHTML='<h2>My subjects &amp; teams</h2><div class="card pad lprof"><div class="av lg"><i class="fa-solid fa-crown"></i></div><div class="who2"><b>'+esc(d.email||'Team leader')+'</b><span class="msg">Leading '+ts.length+' team'+(ts.length===1?'':'s')+' in '+subs+' subject'+(subs===1?'':'s')+'</span></div></div>'
    +(ts.length>1?'<div id="lfb"></div>':'')+'<div class="grid" id="lov"></div>';
  const card=t=>'<div class="card sub lcard"><div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><h3>'+esc(t.subject_name)+(t.code?' <span class="scode">'+esc(t.code)+'</span>':'')+'</h3><span class="badge b-'+t.status+'">'+t.status+'</span></div>'
    +'<div class="chips">'+metaChips(t)+(t.batches||[]).slice(0,3).map(b=>'<span class="chip meta"><i class="fa-solid fa-users-line"></i> '+esc(b)+'</span>').join('')+'</div>'
    +'<div class="tn"><i class="fa-solid fa-people-group"></i> '+esc(t.team_name||'Team')+'</div>'
    +'<p class="msg" style="margin:0">'+t.members+' member'+(t.members===1?'':'s')+' · code <b>'+esc(t.ref_code)+'</b>'+(t.teacher_name?' · '+esc(t.teacher_name):'')+'</p>'
    +((t.slot_date||t.slot_label)?'<p class="msg" style="margin:6px 0 0"><i class="fa-regular fa-calendar"></i> '+esc(slotTxt({date:t.slot_date,label:t.slot_label}))+'</p>':'')
    +'<p class="msg" style="margin:6px 0 0"><i class="fa-solid '+(t.pres?'fa-file-circle-check':'fa-file-circle-exclamation')+'"></i> '+(t.pres?esc(t.pres):'No presentation uploaded yet')+'</p>'
    +'<p class="msg" style="margin:6px 0 0"><i class="fa-solid '+(t.locked?'fa-lock':'fa-pen')+'"></i> '+(t.locked?'Registration closed · details locked':(t.close_ts?'You can edit until '+esc(fmtBD(t.close_ts)):'You can edit this team'))+'</p>'
    +'<div class="acts"><button class="btn sm" data-m="'+t.id+'"><i class="fa-solid fa-people-group"></i> Manage team</button><button class="btn sm sec" data-pp="'+t.id+'"><i class="fa-solid fa-display"></i> Presentation</button></div></div>';
  const draw=()=>{
    const list=subjFilter(ts,FL);filterCount('#lfb',list.length,ts.length);
    $('#lov').innerHTML=list.length?list.map(card).join(''):'<div class="card empty" style="grid-column:1/-1"><i class="fa-regular fa-folder-open" style="font-size:2rem"></i><p>'+(ts.length?'No subject matches your search or filters.':'No teams found for this login.')+'</p></div>';
    $$('#lov button[data-m],#lov button[data-pp]').forEach(b=>b.onclick=async()=>{
      try{const r=await api('leader_switch',{json:{id:+(b.dataset.m||b.dataset.pp)}});L.d=r.leader;L.rf=0;L.page=b.dataset.m?'team':'pres';leaderShell()}catch(e){toast(e.message,'err')}});
  };
  if(ts.length>1)filterBar('#lfb',ts,FL,draw,'Search your subjects: name, course code, semester, batch…');
  draw();
}
function pgLTeam(){
  const d=L.d,g=d.reg,s=d.subject,ed=d.editable,fl=s.fields.filter(f=>f.type!=='photo'),ph=s.fields.find(f=>f.type==='photo');
  const indv=g.reg_type==='individual',canP=s.pres_open&&g.status!=='rejected',mxP=s.pres_max_mb||20;
  const fr=L.fresh&&L.fresh.ref===g.ref_code?L.fresh:null;
  $('#pg').innerHTML='<h2>'+(indv?'My registration':'My team')+'</h2>'
  +(fr?'<div class="card pad" style="margin-bottom:18px;border:1.5px solid var(--green,#16a34a)"><div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><div class="tick" style="margin:0"><i class="fa-solid fa-check"></i></div><div><h3 style="margin:0 0 4px">Registration successful!</h3><p class="msg" style="margin:0">Your code: <b>'+esc(fr.ref)+'</b> · Status: pending until approved. '+(fr.pres?'Your presentation file is uploaded.':(canP?'You can upload your presentation file below.':''))+'</p>'+(fr.warn?'<div class="err" style="margin:8px 0 0">'+esc(fr.warn)+'</div>':'')+'</div></div></div>':'')
  +(d.teams&&d.teams.length>1?'<label class="f" style="max-width:440px;margin-bottom:16px"><span>You lead '+d.teams.length+' teams — switch team</span><select id="lsw2">'+d.teams.map(t=>'<option value="'+t.id+'" '+(t.id===g.id?'selected':'')+'>'+esc(t.team_name||'Team')+' · '+esc(t.subject_name)+'</option>').join('')+'</select></label>':'')
  +'<div class="card pad" style="margin-bottom:18px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:start"><div><h3 style="margin-bottom:4px">'+esc(g.team_name||(indv?(g.members[0]?g.members[0].full_name:'Individual'):'Team'))+'</h3><p class="msg" style="margin:0">'+esc(s.name)+' · '+g.members.length+' member'+(g.members.length===1?'':'s')+'</p></div>'
  +'<div style="text-align:right"><span class="badge b-'+g.status+'">'+g.status+'</span> '+(+g.is_late?' <span class="badge b-rejected">Late</span>':'')+'<div class="ref" style="font-size:1.05rem;padding:4px 12px;margin:8px 0 0">'+esc(g.ref_code)+'</div></div></div>'
  +(s.teacher_name?'<div style="margin-top:10px">'+teacherLine(s)+'</div>':'')
  +((g.slot_date||g.slot_label)?'<p class="msg" style="margin:10px 0 0"><i class="fa-regular fa-calendar"></i> Presentation slot: <b>'+esc(slotTxt({date:g.slot_date,label:g.slot_label}))+'</b></p>':'')
  +'<div class="chips" style="margin-top:10px">'+metaChips(s)+'</div>'
  +'<p class="msg" style="margin:10px 0 0"><i class="fa-solid '+(g.pres?'fa-file-circle-check':'fa-file-circle-exclamation')+'"></i> Presentation file: <b>'+(g.pres?esc(g.pres.name):'not uploaded yet')+'</b> · <a href="#" id="gopres">'+(g.pres?'manage':'upload now')+'</a></p>'
  +'<p class="msg" style="margin:8px 0 0">Status and slot are managed by your admin or course teacher.</p></div>'
  +(canP?presPanelHTML({pres:g.pres,mx:mxP}):(g.pres?'<div class="card pad prp" style="margin-bottom:18px"><h4><i class="fa-solid fa-display"></i> Presentation file</h4>'+presFile(g.pres)+'<p class="msg" style="margin:8px 0 0">'+esc(g.status==='rejected'?'This registration was rejected, so the file cannot be changed.':s.pres_msg)+'</p></div>':''))
  +(ed?'':'<div class="warn"><i class="fa-solid fa-lock"></i><span>'+(d.locked?'Registration is closed, so your '+(indv?'':'team’s ')+'details are locked and nothing can be changed any more. ('+esc(d.lock_msg||'')+')':'This registration was rejected, so the details are read-only. Contact your admin if this looks wrong.')+'</span></div>')
  +(!d.locked&&s.close_ts?'<div class="cdb" style="margin:-6px 0 14px">'+cdHTML(s.close_ts)+'<span class="msg">You can make changes until '+esc(fmtBD(s.close_ts))+' · Bangladesh Time (UTC+6)</span></div>':'')
  +glHTML(s,false)+'<div class="card pad form" id="lt"><h3 style="margin-bottom:12px">'+(indv?'Edit your details':'Edit team details')+'</h3><div id="lerr2"></div>'
  +(indv?'':'<div class="fg"><label class="f"><span class="req">Team name</span><input type="text" id="ltn" maxlength="60" value="'+esc(g.team_name)+'"></label></div>')
  +'<div class="fg"><label class="f span2"><span>Presentation topic name <small>(optional) · shown on the public Teams page</small></span><input type="text" id="ltp" maxlength="200" value="'+esc(g.topic||'')+'"></label></div>'
  +g.members.map((m,i)=>'<div class="mcard" data-id="'+m.id+'"><div class="mhead"><h4>Member '+(i+1)+' · '+esc(m.full_name)+'</h4>'+(m.is_leader?'<span class="badge b-pending"><i class="fa-solid fa-crown"></i> Leader</span>':'')+'</div>'
    +'<div class="fg">'+fl.map(f=>'<label class="f">'+fieldLabel(Object.assign({},f,{req:f.req==='leader'?(m.is_leader?'yes':'no'):f.req}))+ctl(f,m.vals[f.key])+'</label>').join('')+'</div>'
    +(ph?'<div class="pbox"><div class="m-av">'+av(m.photo,'sm')+'</div><label class="f">'+esc(ph.label)+((ph.req==='yes'||(ph.req==='leader'&&m.is_leader))?' <span style="color:var(--red)">*</span>':'')+' <small>Choose a file to replace · JPG, PNG or WEBP · max '+(ph.mb||2)+' MB</small>'+ctl(ph)+'</label>'+(m.photo?'<label style="font-size:.88rem"><input type="checkbox" class="e-rp"> Remove photo</label>':'')+'</div>':'')+'</div>').join('')
  +(ed?'<div class="acts" style="justify-content:flex-end"><button class="btn" id="lsv"><i class="fa-solid fa-floppy-disk"></i> Save changes</button></div>':'')+'</div>';
  const gp=$('#gopres');if(gp)gp.onclick=e=>{e.preventDefault();L.page='pres';leaderShell()};
  if(canP)wirePres({rid:g.id,title:(g.team_name||'Team')+' · '+s.name,pres:g.pres,mx:mxP,
    onChange:p=>{L.d.reg.pres=p;if(L.fresh)L.fresh.pres=!!p;pgLTeam()},
    fail:(e,err)=>{if(e.status===401){leaderLogin();toast('Session expired. Sign in again.','err')}else if(e.status===403){toast(e.message,'err');leaderRefresh()}else err(e.message)}});
  const sw=$('#lsw2');if(sw)sw.onchange=async()=>{try{const r=await api('leader_switch',{json:{id:+sw.value}});L.d=r.leader;L.rf=0;leaderShell()}catch(e){toast(e.message,'err')}};
  $$('#lt .mcard').forEach((c,i)=>{const pi=c.querySelector('.m-photo');if(pi)bindPhoto(pi,c.querySelector('.m-av'),u=>av(u||g.members[i].photo,'sm'))});
  if(!ed){$$('#lt input,#lt select').forEach(x=>x.disabled=true);return}
  $('#lsv').onclick=async()=>{
    const fd=new FormData();if($('#ltn'))fd.append('team_name',$('#ltn').value);fd.append('topic',$('#ltp').value);
    const members=$$('#lt .mcard').map(c=>{const id=+c.dataset.id,pf=c.querySelector('.m-photo');if(pf&&pf.files[0])fd.append('photo_'+id,pf.files[0]);
      return{id,vals:readCard(c,fl),remove_photo:!!(c.querySelector('.e-rp')&&c.querySelector('.e-rp').checked)}});
    fd.append('members',JSON.stringify(members));
    $('#lsv').disabled=true;
    try{const r=await api('leader_update',{form:fd});L.d=r.leader;toast(indv?'Your details updated.':'Team details updated.');leaderShell()}
    catch(e){if(e.status===401){leaderLogin();toast('Session expired. Sign in again.','err')}else if(e.status===403){toast(e.message,'err');leaderRefresh()}else{$('#lerr2').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(e.message)+'</div>';$('#lerr2').scrollIntoView({behavior:'smooth',block:'center'});const b=$('#lsv');if(b)b.disabled=false}}
  };
}
function pgLPres(){
  const d=L.d,g=d.reg,s=d.subject,can=s.pres_open&&g.status!=='rejected',mx=s.pres_max_mb||20;
  $('#pg').innerHTML='<h2>Presentation</h2><div class="card pad" style="margin-bottom:18px"><h3 style="margin-bottom:4px">'+esc(g.team_name||'Team')+'</h3><p class="msg" style="margin:0 0 8px">'+esc(s.name)+'</p><div class="chips">'+metaChips(s)+'</div>'
    +(can&&s.pres_close_ts?'<div class="cdb" style="margin-top:12px">'+cdHTML(s.pres_close_ts)+'<span class="msg">Please upload your file by '+esc(fmtBD(s.pres_close_ts))+' · Bangladesh Time (UTC+6). You can replace it any time.</span></div>':'')+'</div>'
    +(can?'':'<div class="warn"><i class="fa-solid fa-lock"></i><span>'+esc(g.status==='rejected'?'This registration was rejected, so the presentation cannot be changed.':s.pres_msg)+(g.pres?' You can still present your uploaded file below.':'')+'</span></div>')
    +(can?presPanelHTML({pres:g.pres,mx}):'<div class="card pad prp"><h4><i class="fa-solid fa-display"></i> Presentation file</h4>'+(g.pres?presFile(g.pres)+'<div class="acts"><button class="btn sm" id="pp-v"><i class="fa-solid fa-display"></i> Present</button><button class="btn sm sec" id="pp-d"><i class="fa-solid fa-download"></i> Download</button></div>':'<p class="msg">No presentation file was uploaded.</p>')+'</div>')
    +'<div class="card pad" style="margin-top:18px"><h4 style="margin-bottom:6px"><i class="fa-solid fa-lightbulb" style="color:var(--amber)"></i> Tips</h4><ul class="msg" style="margin:0;padding-left:18px;line-height:1.7"><li>Any file type is accepted. Upload a <b>PDF</b> for the smoothest presentation: full-screen, arrow keys / swipe / click to change slides.</li><li>PowerPoint (.ppt/.pptx) is shown through Microsoft Office Online. Export to PDF if the animations or fonts matter.</li><li>You can replace the file any time while upload is open. Press <b>Present</b> on the day to open it directly from here.</li></ul></div>';
  wirePres({rid:g.id,title:(g.team_name||'Team')+' · '+s.name,pres:g.pres,mx,
    onChange:p=>{L.d.reg.pres=p;pgLPres()},
    fail:(e,err)=>{if(e.status===401){leaderLogin();toast('Session expired. Sign in again.','err')}else if(e.status===403){toast(e.message,'err');leaderRefresh()}else err(e.message)}});
}
function pgLPass(){
  const d=L.d,tl=d.teams||[],lk=tl.length?tl.every(t=>t.locked):d.locked;
  $('#pg').innerHTML='<h2>Account</h2>'+(lk?'<div class="warn"><i class="fa-solid fa-lock"></i><span>Registration is closed for all your subjects, so login details can no longer be changed.</span></div>':'')+(tl.length>1?'<p class="msg" style="margin:0 0 12px"><i class="fa-solid fa-link"></i> These login details are shared by all '+tl.length+' teams you lead. Changing them updates every team.</p>':'')
  +'<div class="card pad form"><h3 style="margin-bottom:12px">Login details</h3><div id="serr"></div><div class="fg">'
  +'<label class="f">Gmail <small>You sign in with this Gmail or your mobile number. No password.</small><input type="email" id="lem" maxlength="100" autocomplete="username" value="'+esc(d.reg.leader_email||'')+'"></label>'
  +'</div>'
  +'<div class="acts"><button class="btn" id="lpv"><i class="fa-solid fa-floppy-disk"></i> Save</button></div></div>';
  if(lk){$$('#pg input').forEach(x=>x.disabled=true);$('#lpv').disabled=true;return}
  $('#lpv').onclick=async()=>{
    try{const r=await api('leader_password',{json:{email:$('#lem').value}});L.d=r.leader;toast('Gmail updated.');leaderShell()}
    catch(e){if(e.status===401)leaderLogin();else if(e.status===403){toast(e.message,'err');leaderRefresh()}else $('#serr').innerHTML='<div class="err" style="margin:0 0 12px">'+esc(e.message)+'</div>'}
  };
}
/* ================= CHAT (v22): student chat page (#chat) + Chat tab in the teacher / CR / admin panels ================= */
const CH={who:'student',opt:null,all:false,rid:0,rooms:[],user:null,courses:[],staff:[],tab:'chats',q:'',timer:0,inst:0,last:0,idle:0,tick:0,msgs:[],more:false,sending:false};
function chStop(){CH.inst++;clearTimeout(CH.timer)}
/* quiet requests for polling: no full-screen spinner, never shared with api() */
async function chFetch(action,q,json){
  const url=API_URL+'?api='+action+'&'+new URLSearchParams(Object.assign({who:CH.who},q||{}));
  const opt={credentials:'same-origin',headers:{'X-CSRF-Token':CSRF}};
  if(json!==undefined){opt.method='POST';if(json instanceof FormData)opt.body=json;else{opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(json)}}
  let r;try{r=await fetch(url,opt)}catch(x){const e=new Error('Network problem. Check your internet and try again.');e.status=0;throw e}
  const d=await r.json().catch(()=>({ok:false,error:'Unexpected server response ('+r.status+'). Please refresh the page.'}));
  if(!d.ok){const e=new Error(d.error||'Request failed');e.status=r.status;throw e}
  return d;
}
const chHM=ts=>new Date(ts*1000).toLocaleTimeString('en-GB',{...BDZ,hour:'2-digit',minute:'2-digit',hour12:true}).toUpperCase();
const chDay=ts=>new Date(ts*1000).toLocaleDateString('en-GB',{...BDZ,day:'2-digit',month:'short',year:'numeric'});
const chAgo=ts=>chDay(ts)===chDay(Date.now()/1000)?chHM(ts):new Date(ts*1000).toLocaleDateString('en-GB',{...BDZ,day:'2-digit',month:'short'});
const chIcon=r=>'<div class="ch-ic">'+(r.kind==='group'?'<i class="fa-solid fa-people-group"></i>':r.kind==='support'&&CH.who!=='admin'?'<i class="fa-solid fa-headset"></i>':(r.photo?'<img src="'+esc(r.photo)+'" alt="">':'<i class="fa-solid '+(/^Student/.test(r.sub||'')?'fa-user-graduate':'fa-user-tie')+'"></i>'))+'</div>';
const chErr=(id,m)=>{const e=$('#'+id);if(e)e.innerHTML='<div class="err" style="margin:0 0 12px">'+esc(m)+'</div>'};
function chExpired(){
  chStop();
  if(CH.who==='student'){CH.user=null;chLogin('Your session ended. Please sign in again.')}
  else{authView();toast('Session expired. Sign in again.','err')}
}

/* ---------- student: page, sign-in, profile ---------- */
async function chatPage(){
  CH.who='student';CH.rid=0;CH.tab='chats';CH.rooms=[];chStop();
  $('#app').innerHTML='<div class="wrap"><div class="card empty">Loading chat…</div></div>';
  let b;
  try{b=await chFetch('chat_boot')}
  catch(e){if(location.hash!=='#chat')return;$('#app').innerHTML='<div class="wrap"><div class="err">'+esc(e.message)+'</div></div>';return}
  if(location.hash!=='#chat')return;
  if(!b.on){$('#app').innerHTML='<div class="wrap"><div class="card pad done" style="max-width:520px;margin:30px auto"><div style="font-size:2.2rem;color:var(--mut)"><i class="fa-solid fa-comment-slash"></i></div><h2 style="margin:10px 0 6px">Chat is switched off</h2><p class="msg">The admin has turned chat off for now. Please check again later.</p></div></div>';return}
  CH.opt=b.options||CH.opt;
  if(!b.user){chLogin();return}
  CH.user=b.user;CH.courses=b.courses||[];CH.staff=b.staff||[];
  chStudentHome();
}
const chProgL=p=>p==='Undergraduate'?'Undergraduate (UG)':p==='Diploma'?'Diploma (DH)':p;
/* the profile fields, shared by "create profile" and "My profile". p = id prefix */
function chFormHTML(p,u){
  u=u||{};const o=CH.opt||{},terms=(o.terms&&o.terms.length)?o.terms:(OPTS.terms||['Autumn','Spring','Summer']);
  let progs=(o.programs||[]).filter(x=>!/^both$/i.test(x));if(!progs.length)progs=['Undergraduate','Diploma'];
  const y=new Date().getFullYear(),ys=[];for(let i=y-3;i<=y+1;i++)ys.push(String(i));if(u.sem_year&&!ys.includes(u.sem_year))ys.push(u.sem_year);
  const sel=(id,arr,val,ph,lab)=>'<select id="'+id+'"><option value="">'+ph+'</option>'+arr.map(x=>'<option value="'+esc(x)+'"'+(x===val?' selected':'')+'>'+esc(lab?lab(x):x)+'</option>').join('')+'</select>';
  return '<label class="f"><span class="req">Your name</span><input type="text" id="'+p+'n" maxlength="80" autocomplete="name" placeholder="e.g. Rahim Uddin" value="'+esc(u.name||'')+'"></label>'
    +'<div class="fg"><label class="f"><span class="req">Batch</span><input type="text" id="'+p+'b" inputmode="numeric" maxlength="4" placeholder="e.g. 32" value="'+esc(u.batch||'')+'"></label>'
    +'<label class="f"><span class="req">Program</span>'+sel(p+'g',progs,u.program||'','Select program',chProgL)+'</label></div>'
    +'<label class="f"><span class="req">Gmail</span><input type="email" id="'+p+'e" maxlength="100" autocomplete="email" placeholder="you@gmail.com" value="'+esc(u.email||'')+'"></label>'
    +'<label class="f">Profile photo <small>(optional · JPG, PNG or WEBP, max 2 MB)</small><input type="file" id="'+p+'f" accept="image/jpeg,image/png,image/webp"></label>'
    +(u.photo?'<label style="display:flex;gap:8px;align-items:center;font-size:.9rem"><input type="checkbox" id="'+p+'rp"> Remove my current photo</label>':'');
}
function chFormData(p){
  const fd=new FormData(),v=id=>{const e=$('#'+p+id);return e?e.value:''};
  fd.append('name',v('n'));fd.append('batch',v('b'));fd.append('program',v('g'));fd.append('email',v('e'));
  const f=$('#'+p+'f');if(f&&f.files[0]){if(f.files[0].size>2*1024*1024)throw new Error('The photo must be 2 MB or smaller.');fd.append('photo',f.files[0])}
  const rp=$('#'+p+'rp');if(rp&&rp.checked)fd.append('remove_photo','1');
  return fd;
}
function chLogin(note,mode){
  document.body.classList.remove('chatfull');
  chStop();CH.rid=0;mode=mode||'new';
  const tab=(m,l)=>'<button type="button" class="btn sm '+(mode===m?'':'sec')+'" data-m="'+m+'" style="flex:1">'+l+'</button>';
  $('#app').innerHTML='<div class="wrap"><div class="card pad login ch-login"><div class="ch-lh"><div class="ch-lg"><i class="fa-solid fa-comments"></i></div><h2>Chat with your teachers</h2>'
    +'<p class="ch-lp">'+(mode==='new'?'Create your chat profile with your name, batch, program and Gmail (photo is optional). You will see only the courses of your own batch and program.':'Enter the Gmail of your chat profile to get your chats back.')+'</p><div class="ch-chips"><span><i class="fa-solid fa-book-open"></i> Course groups</span><span><i class="fa-solid fa-user-tie"></i> Message teachers</span><span><i class="fa-solid fa-users"></i> Your batch only</span></div></div><div class="ch-lb">'
    +'<div class="ch-seg">'+tab('new','Create profile')+tab('in','I already have a profile')+'</div>'
    +'<div id="lerr">'+(note?'<div class="err" style="margin:0 0 12px">'+esc(note)+'</div>':'')+'</div>'
    +(mode==='new'
      ?'<form id="chf" style="display:grid;gap:14px">'+chFormHTML('c',{})+'<button class="btn" type="submit" id="cgo"><i class="fa-solid fa-comments"></i> Create profile &amp; start chatting</button></form>'
      :'<form id="chf" style="display:grid;gap:14px"><label class="f">Gmail<input type="email" id="ce" maxlength="100" autocomplete="email" placeholder="you@gmail.com"></label>'
        +'<button class="btn" type="submit" id="cgo"><i class="fa-solid fa-right-to-bracket"></i> Sign in</button></form>')
    +'</div></div></div>';
  $$('.login [data-m]').forEach(b=>b.onclick=()=>chLogin('',b.dataset.m));
  $('#chf').onsubmit=async e=>{
    e.preventDefault();const b=$('#cgo');b.disabled=true;
    try{
      let body;
      if(mode==='new')body=chFormData('c');else{body=new FormData();body.append('signin','1');body.append('email',$('#ce').value)}
      const r=await chFetch('chat_start',null,body);
      CSRF=r.csrf;$('meta[name=csrf]').content=CSRF;CH.user=r.user;
      const bb=await chFetch('chat_boot');CH.courses=bb.courses||[];CH.staff=bb.staff||[];CH.user=bb.user||r.user;CH.opt=bb.options||CH.opt;CH.all=false;
      toast(r.created?'Chat profile created. Welcome, '+r.user.name+'!':'Welcome back, '+r.user.name+'.');
      chStudentHome();
    }catch(x){b.disabled=false;chErr('lerr',x.message)}
  };
}
function chStudentHome(){
  $('#app').innerHTML='<div class="wrap chwrap"><div id="chhost"></div></div>';
  chBuild($('#chhost'));
  if(CH.user&&!CH.user.complete)chProfile(true);
}
const chInfo=u=>[u.batch?'Batch '+u.batch:'',u.program?chProgL(u.program):''].filter(Boolean).join(' · ');
const chAvU=u=>u.photo?'<img src="'+esc(u.photo)+'" alt="">':esc(String(u.name||'?').trim().charAt(0).toUpperCase());
const chWho=()=>{const u=CH.user;if(!u)return;const b=$('#chmeb');if(b)b.innerHTML=chAvU(u)+'<i class="fa-solid fa-chevron-down"></i>';const a=$('#chma');if(a)a.innerHTML=chAvU(u);const n=$('#chmn');if(n)n.innerHTML='<b>'+esc(u.name)+'</b><span>'+esc(chInfo(u)||'Chat profile')+'</span>'};
function chProfile(first){
  const u=CH.user||{};
  openModal('<div class="mt"><h3><i class="fa-solid fa-user-pen"></i> My chat profile</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div id="merr"></div>'
    +(first?'<p class="msg" style="margin-bottom:10px">Please complete your profile (name, batch, program and Gmail) so you see the right courses.</p>':'')
    +'<div style="display:grid;gap:14px">'+chFormHTML('cp',u)+'</div>'
    +'<p class="msg" style="margin-top:10px">Only the courses of your batch and program are shown. Your teachers can see these details in your chat.</p>'
    +'<div class="acts"><button class="btn" id="cps"><i class="fa-solid fa-floppy-disk"></i> Save</button></div>');
  $('#cps').onclick=async()=>{
    try{
      const r=await chFetch('chat_profile',null,chFormData('cp'));CH.user=r.user;closeModal();chWho();
      const bb=await chFetch('chat_boot');CH.courses=bb.courses||[];CH.staff=bb.staff||CH.staff;CH.all=false;chTabs();chRenderList();
      toast('Profile updated.');
    }catch(e){if(e.status===401){closeModal();chExpired()}else chErr('merr',e.message)}
  };
}

/* ---------- panel (teacher / CR / admin) ---------- */
async function pgChat(){
  CH.who=A.role==='teacher'?'staff':'admin';CH.tab='chats';CH.rid=0;CH.rooms=[];chStop();
  const b=await guard(()=>chFetch('chat_boot'));if(!b)return;
  const adm=CH.who==='admin';
  $('#pg').innerHTML='<div class="tools"><h2 style="margin:0;margin-right:auto">Chat</h2>'
    +(!adm?'<button type="button" class="btn sm" id="chadm"><i class="fa-solid fa-headset"></i> Contact admin</button>':'')+(adm?'<button type="button" class="btn sm '+(b.on?'sec':'')+'" id="chtog"><i class="fa-solid '+(b.on?'fa-toggle-on':'fa-toggle-off')+'"></i> Student chat is '+(b.on?'ON · turn off':'OFF · turn on')+'</button>':'')+'</div>'
    +(adm&&!b.on?'<div class="warn"><i class="fa-solid fa-comment-slash"></i><span>Student chat is switched OFF. Students cannot open it until you turn it on.</span></div>':'')
    +'<p class="msg" style="margin:-6px 0 12px">'+(adm?'You can read and reply in every group and personal chat. Your messages are shown as “Admin”.':'Students join the group of each of your subjects, or message you directly. Everything appears here.')+'</p><div id="chhost"></div>';
  const t=$('#chtog');
  if(t)t.onclick=async()=>{if(await guard(()=>chFetch('chat_toggle',null,{on:!b.on}))){toast(b.on?'Student chat switched off.':'Student chat switched on.');pgChat()}};
  chBuild($('#chhost'));
  const ca=$('#chadm');if(ca)ca.onclick=chOpenSupport;
}

/* ---------- v28: messenger header (avatar menu with My profile + Sign out), phone full-screen sizing ---------- */
const chTopHTML=()=>'<div class="ch-top"><h2>Chats</h2><button type="button" class="ch-home" id="chhome" aria-label="Back to website" title="Back to website"><i class="fa-solid fa-house"></i></button><div class="ch-me"><button type="button" class="ch-meb" id="chmeb" aria-haspopup="true" aria-expanded="false" aria-label="My profile and sign out"></button>'
  +'<div class="ch-menu" id="chmenu" hidden><div class="ch-mi-h"><div class="ch-av" id="chma"></div><div class="ch-meta" id="chmn"></div></div>'
  +'<button type="button" id="chprof"><i class="fa-solid fa-user-pen"></i><span>My profile</span></button>'
  +'<button type="button" id="chrev"><i class="fa-solid fa-star"></i><span>Write a review</span></button>'
  +'<button type="button" id="chout" class="out"><i class="fa-solid fa-right-from-bracket"></i><span>Sign out</span></button></div></div></div>';
function chMenuClose(){const m=document.getElementById('chmenu');if(m&&!m.hidden){m.hidden=true;const b=document.getElementById('chmeb');if(b)b.setAttribute('aria-expanded','false')}}
function chMenuInit(){
  const hb=$('#chhome');if(hb)hb.onclick=()=>{chStop();let f='';try{f=sessionStorage.getItem('ch_from')||'';sessionStorage.removeItem('ch_from')}catch(x){}location.hash=f==='leader'?'#teams-leader':'#'};
  const b=$('#chmeb'),m=$('#chmenu');if(!b||!m)return;
  b.onclick=e=>{e.stopPropagation();const o=m.hidden;m.hidden=!o;b.setAttribute('aria-expanded',o?'true':'false')};
  m.onclick=e=>e.stopPropagation();
  $('#chprof').onclick=()=>{chMenuClose();chProfile()};
  $('#chrev').onclick=()=>{chMenuClose();FB.as='student';FB.panel='';fbForm()};
  $('#chout').onclick=async()=>{chMenuClose();try{await chFetch('chat_signout',null,{})}catch(e){}chStop();CH.user=null;CH.rid=0;chLogin()};
}
document.addEventListener('click',chMenuClose);
document.addEventListener('keydown',e=>{if(e.key==='Escape')chMenuClose()});
function chFit(){
  const r=document.getElementById('chroot');if(!r)return;
  const vv=window.visualViewport,h=Math.round(vv?vv.height:window.innerHeight),hd=document.querySelector('header.top');
  r.style.setProperty('--vvh',h+'px');r.style.setProperty('--vvt',Math.round(vv?vv.offsetTop:0)+'px');
  r.style.setProperty('--chtop',(hd?Math.round(hd.getBoundingClientRect().height):120)+'px');
}
if(window.visualViewport){visualViewport.addEventListener('resize',chFit);visualViewport.addEventListener('scroll',chFit)}
window.addEventListener('resize',chFit);window.addEventListener('orientationchange',chFit);

/* ---------- shared: layout, lists, polling ---------- */
function chBuild(host){
  CH.inst++;const inst=CH.inst;CH.rid=0;CH.tick=0;CH.idle=0;CH.q='';CH.msgs=[];
  const stu=CH.who==='student';
  document.body.classList.toggle('chatfull',stu);
  host.innerHTML='<div class="card ch'+(stu?'':' pan')+'" id="chroot"><aside class="ch-side">'+(stu?chTopHTML():'')+(stu?'<div class="ch-tabs" id="chtabs"></div>':'')
    +'<div class="ch-q"><input type="text" id="chq" placeholder="'+(stu?'Search courses, teachers, chats…':'Search chats…')+'" autocomplete="off" aria-label="Search"></div>'
    +'<div class="ch-list" id="chlist"><div class="empty ch-empty">Loading…</div></div></aside><section class="ch-main" id="chmain"></section></div>';
  chPlaceholder();if(stu){chTabs();chMenuInit();chWho()}chFit();
  $('#chq').oninput=()=>{CH.q=$('#chq').value.trim().toLowerCase();chRenderList()};
  const L=$('#chlist');L.onclick=chListClick;L.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.classList.contains('ch-item')){e.preventDefault();chListClick(e)}};
  chLoadRooms().then(()=>{if(inst!==CH.inst)return;if(stu&&!CH.rooms.length){CH.tab='courses';chTabs();chRenderList()}let w=0;try{if(sessionStorage.getItem('ch_adm')==='1'){sessionStorage.removeItem('ch_adm');w=1}}catch(e){}if(w&&CH.who!=='admin')chOpenSupport()}).catch(e=>{if(e.status===401)chExpired();else if(inst===CH.inst)toast(e.message,'err')});
  chLoop(inst,4000);
}
function chPlaceholder(){const m=$('#chmain');if(m)m.innerHTML='<div class="ch-ph"><i class="fa-solid fa-comments"></i><b>Select a chat</b><span>'+(CH.who==='student'?'Open a conversation, join a course group or message a teacher.':'Choose a conversation on the left.')+'</span></div>'}
function chTabs(){
  const t=$('#chtabs');if(!t)return;
  const un=CH.rooms.reduce((a,r)=>a+(r.id===CH.rid?0:(+r.unread||0)),0);
  t.innerHTML=[['chats','Chats'+(un?' <b class="ch-badge">'+(un>99?'99+':un)+'</b>':'')],['courses','Courses'],['teachers','Teachers']].map(x=>'<button type="button" data-t="'+x[0]+'" class="'+(CH.tab===x[0]?'on':'')+'">'+x[1]+'</button>').join('');
  $$('#chtabs button').forEach(b=>b.onclick=()=>{CH.tab=b.dataset.t;chTabs();chRenderList()});
}
function chRoomItem(r){
  const lm=r.last;
  const pv=lm?((lm.mine?'You: ':(r.kind==='group'&&lm.name?lm.name.split(' ')[0]+': ':''))+(lm.deleted?'Message deleted':lm.text)).replace(/\s+/g,' ').slice(0,70):'No messages yet';
  const un=r.id!==CH.rid&&r.unread>0;
  return '<div class="ch-item'+(r.id===CH.rid?' on':'')+(un?' unr':'')+'" data-r="'+r.id+'" role="button" tabindex="0">'+chIcon(r)+'<div class="ch-meta"><b>'+esc(r.title)+'</b><span>'+esc(pv)+'</span></div>'
    +'<div class="ch-side2">'+(r.last_ts?'<small>'+chAgo(r.last_ts)+'</small>':'')+(un?'<b class="ch-badge">'+(r.unread>99?'99+':r.unread)+'</b>':'')+'</div></div>';
}
function chRenderList(){
  const L=$('#chlist');if(!L)return;
  const q=CH.q,has=s=>!q||String(s||'').toLowerCase().includes(q),top=L.scrollTop;let h='';
  if(CH.who!=='student'||CH.tab==='chats'){
    const rs=CH.rooms.filter(r=>has(r.title)||has(r.sub));
    h=(CH.who!=='admin'?chSupPin(has):'')+(rs.length?rs.map(chRoomItem).join(''):'<div class="empty ch-empty">'+(CH.rooms.length?'No chat matches your search.':(CH.who==='student'?'You have no chats yet. Open the <b>Courses</b> tab to join a class group, or the <b>Teachers</b> tab to message a teacher.':'No chats yet. When students join your course groups or message you, they appear here.'))+'</div>');
  }else if(CH.tab==='courses'){
    const u=CH.user||{},mine=CH.courses.length;
    const cs=CH.courses.filter(c=>has(c.name)||has(c.code)||has(c.t_name)||has(c.department));
    h='<div class="msg" style="padding:8px 12px;border-bottom:1px solid var(--line,#e5e7eb);font-size:.82rem">'+(u.complete?'Courses for <b>'+esc(chInfo(u))+'</b> ('+mine+')':'Complete your profile (batch and program) to see your courses.')+'</div>';
    h+=cs.length?cs.map(c=>'<div class="ch-item" data-c="'+c.id+'" role="button" tabindex="0"><div class="ch-ic"><i class="fa-solid fa-book-open"></i></div><div class="ch-meta"><b>'+esc(c.name)+(c.code?' · '+esc(c.code):'')+'</b>'
      +'<span>'+esc(c.t_type+': '+c.t_name)+'</span><span>'+[semTxt(c),c.batch?'Batch '+c.batch:'',c.program,c.n+' student'+(c.n==1?'':'s')].filter(Boolean).map(esc).join(' · ')+'</span></div>'
      +(c.my==='active'?'<span class="badge b-approved">Joined</span>':c.my==='removed'?'<span class="badge b-closed">Removed</span>':'<span class="btn sm">Join</span>')+'</div>').join('')
      :'<div class="empty ch-empty">'+(CH.courses.length?'No course matches your search.':'No course found for your batch and program yet.')+'</div>';
  }else{
    const ps=CH.staff.filter(p=>has(p.name)||has(p.department));
    h=ps.length?ps.map(p=>'<div class="ch-item" data-p="'+p.id+'" role="button" tabindex="0"><div class="ch-ic">'+(p.photo?'<img src="'+esc(p.photo)+'" alt="">':'<i class="fa-solid fa-user-tie"></i>')+'</div><div class="ch-meta"><b>'+esc(p.name)+'</b>'
      +'<span>'+esc([p.type==='CR'?'CR'+(p.batch?' · Batch '+p.batch:''):'Teacher',p.department].filter(Boolean).join(' · '))+'</span></div><span class="btn sm sec"><i class="fa-solid fa-message"></i></span></div>').join('')
      :'<div class="empty ch-empty">'+(CH.staff.length?'No teacher matches your search.':'No teachers yet.')+'</div>';
  }
  if(CH.who==='student'&&CH.tab!=='chats')h=chSupPin(has)+h;
  L.innerHTML=h;L.scrollTop=top;
}
async function chLoadRooms(){
  const d=await chFetch('chat_rooms');CH.rooms=d.rooms;
  const r=CH.rooms.find(x=>x.id===CH.rid);if(r)r.unread=0;
  if(!$('#chroot'))return;
  chTabs();chRenderList();
}
async function chListClick(e){
  const it=e.target.closest('.ch-item');if(!it)return;
  if(it.dataset.adm){chOpenSupport();return}
  if(it.dataset.r){chOpen(+it.dataset.r);return}
  try{
    let d;
    if(it.dataset.c){
      const c=CH.courses.find(x=>x.id==it.dataset.c);
      if(c&&c.my==='removed'){toast('The teacher removed you from this group.','err');return}
      d=await chFetch('chat_join',null,{subject_id:+it.dataset.c});
      if(c&&c.my!=='active'){c.my='active';c.n++}
    }else if(it.dataset.p){d=await chFetch('chat_direct',null,{teacher_id:+it.dataset.p})}
    else return;
    await chLoadRooms();CH.tab='chats';CH.q='';const q=$('#chq');if(q)q.value='';chTabs();chRenderList();chOpen(d.room);
  }catch(x){if(x.status===401)chExpired();else toast(x.message,'err')}
}

/* ---------- conversation ---------- */
function chMsgHTML(m,grp,pos){
  pos=pos||{first:true,last:true};
  const canDel=!m.deleted&&(m.mine||CH.who!=='student'),named=!m.mine&&(grp||CH.who==='admin')&&pos.first;
  const tag=m.tag?'<span class="ch-tag t-'+esc(m.tag.toLowerCase())+'">'+esc(m.tag)+'</span>':'';
  return '<div class="ch-ln'+(m.mine?' me':'')+(pos.first?' f':'')+(pos.last?' l':'')+'">'
    +(m.mine?'':'<div class="ch-av'+(pos.last?'':' ph')+'">'+(pos.last?chAv(m):'')+'</div>')
    +'<div class="ch-col">'+(named?'<div class="who">'+esc(m.name)+tag+'</div>':'')
    +'<div class="ch-m'+(m.mine?' me':'')+(m.deleted?' del':'')+'" data-id="'+m.id+'">'+(m.deleted?'<i class="fa-solid fa-ban"></i> This message was deleted':esc(m.text))+'</div>'
    +'<div class="ch-t">'+chHM(m.ts)+(canDel?' <button type="button" class="ch-x" data-del="'+m.id+'" title="Delete" aria-label="Delete message"><i class="fa-regular fa-trash-can"></i></button>':'')+'</div></div></div>';
}
const chAv=m=>m.photo?'<img src="'+esc(m.photo)+'" alt="">':esc(String(m.name||'?').trim().charAt(0).toUpperCase());
/* mode: bottom = jump to the newest, auto = stay at the bottom only if you were already there, keep = do not move, older = keep position after loading older messages */
function chPaint(mode){
  const box=$('#chmsgs');if(!box)return;
  const r=CH.rooms.find(x=>x.id===CH.rid)||{},grp=r.kind==='group';
  const near=box.scrollHeight-box.scrollTop-box.clientHeight<90,top=box.scrollTop,hOld=box.scrollHeight;
  let h=CH.more?'<div style="text-align:center"><button type="button" class="btn sm sec" id="cholder">Load older messages</button></div>':'',day='';
  const sk=x=>x.mine?'me':(x.name||'')+'|'+(x.tag||'');
  CH.msgs.forEach((m,i)=>{
    const d=chDay(m.ts),p=CH.msgs[i-1],n=CH.msgs[i+1];
    if(d!==day){day=d;h+='<div class="ch-day"><span>'+esc(d)+'</span></div>'}
    const jp=p&&chDay(p.ts)===d&&sk(p)===sk(m)&&m.ts-p.ts<600,jn=n&&chDay(n.ts)===d&&sk(n)===sk(m)&&n.ts-m.ts<600;
    h+=chMsgHTML(m,grp,{first:!jp,last:!jn});
  });
  if(!CH.msgs.length)h+='<div class="empty ch-empty">No messages yet. Say hello.</div>';
  box.innerHTML=h;
  if(mode==='bottom'||(mode==='auto'&&near))box.scrollTop=box.scrollHeight;
  else if(mode==='older')box.scrollTop=box.scrollHeight-hOld+top;
  else box.scrollTop=top;
}
function chAdd(list,own){
  let fresh=false;
  list.forEach(m=>{if(!CH.msgs.some(x=>x.id===m.id)){CH.msgs.push(m);fresh=true}if(m.id>CH.last)CH.last=m.id});
  if(fresh){CH.msgs.sort((a,b)=>a.id-b.id);chPaint(own?'bottom':'auto')}
}
async function chOpen(rid){
  const r=CH.rooms.find(x=>x.id===rid),root=$('#chroot');if(!r||!root)return;
  CH.rid=rid;CH.msgs=[];CH.last=0;CH.idle=0;CH.more=false;r.unread=0;root.classList.add('open');chFit();
  const stu=CH.who==='student',grp=r.kind==='group';
  const sub=[r.sub,!stu&&r.phone?r.phone:'',!stu&&r.email?r.email:''].filter(Boolean).join(' · ');
  $('#chmain').innerHTML='<div class="ch-head"><button type="button" class="ch-ib ch-back" id="chback" aria-label="Back to chats"><i class="fa-solid fa-arrow-left"></i></button>'+chIcon(r)
    +'<div class="ch-meta"><b>'+esc(r.title)+'</b><span>'+esc(sub)+'</span></div>'
    +((grp||!stu)?'<button type="button" class="ch-ib" id="chmem" title="Members" aria-label="Members"><i class="fa-solid fa-users"></i>'+(grp?'<span class="ch-cnt">'+(+r.n_students||0)+'</span>':'')+'</button>':'')
    +(stu&&grp?'<button type="button" class="ch-ib dng" id="chlv" title="Leave this group" aria-label="Leave this group"><i class="fa-solid fa-door-open"></i></button>':'')+'</div>'
    +'<div class="ch-msgs" id="chmsgs"><div class="empty ch-empty">Loading…</div></div>'
    +'<div class="ch-send"><textarea id="chin" rows="1" maxlength="2000" placeholder="Write a message…" aria-label="Message"></textarea><button type="button" class="ch-sb" id="chsend" aria-label="Send message"><i class="fa-solid fa-paper-plane"></i></button></div>';
  $('#chback').onclick=()=>{CH.rid=0;root.classList.remove('open');chPlaceholder();chRenderList()};
  const ta=$('#chin');
  ta.oninput=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,120)+'px'};
  ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();chSend()}};
  $('#chsend').onclick=chSend;
  ta.onfocus=()=>setTimeout(()=>{const b=$('#chmsgs');if(b)b.scrollTop=b.scrollHeight},320);
  const mem=$('#chmem');if(mem)mem.onclick=chMembers;
  const lv0=$('#chlv');if(lv0)lv0.onclick=()=>chLeave(r);
  $('#chmsgs').onclick=e=>{const d=e.target.closest('[data-del]');if(d){chDelete(+d.dataset.del);return}if(e.target.closest('#cholder')){chOlder();return}const ln=e.target.closest('.ch-ln');if(ln)ln.classList.toggle('show')};
  chTabs();chRenderList();
  try{
    const d=await chFetch('chat_msgs',{room:rid});if(CH.rid!==rid)return;
    CH.msgs=d.msgs;CH.more=d.more;CH.last=d.msgs.reduce((a,m)=>Math.max(a,m.id),0);chPaint('bottom');
    if(window.matchMedia('(min-width:761px)').matches)ta.focus();
  }catch(e){if(e.status===401)chExpired();else{CH.rid=0;chPlaceholder();root.classList.remove('open');toast(e.message,'err')}}
}
async function chOlder(){
  const first=CH.msgs[0];if(!first)return;
  try{const d=await chFetch('chat_msgs',{room:CH.rid,before:first.id});CH.msgs=d.msgs.concat(CH.msgs);CH.more=d.more;chPaint('older')}
  catch(e){toast(e.message,'err')}
}
async function chSend(){
  const ta=$('#chin');if(!ta||CH.sending)return;
  const t=ta.value.trim();if(!t)return;
  CH.sending=true;const sb=$('#chsend');if(sb)sb.disabled=true;
  try{
    const d=await chFetch('chat_send',null,{room:CH.rid,text:t});
    ta.value='';ta.style.height='auto';CH.idle=0;chAdd([d.msg],true);
    const r=CH.rooms.find(x=>x.id===CH.rid);if(r){r.last={text:d.msg.text,deleted:0,ts:d.msg.ts,name:d.msg.name,mine:true};r.last_ts=d.msg.ts;chRenderList()}
  }catch(e){if(e.status===401)chExpired();else toast(e.message,'err')}
  finally{CH.sending=false;const b=$('#chsend');if(b)b.disabled=false;const x=$('#chin');if(x)x.focus()}
}
async function chDelete(id){
  if(!confirm('Delete this message for everyone?'))return;
  try{await chFetch('chat_delete',null,{id});const m=CH.msgs.find(x=>x.id===id);if(m){m.deleted=1;m.text='';chPaint('keep')}}
  catch(e){if(e.status===401)chExpired();else toast(e.message,'err')}
}
async function chMembers(){
  const rid=CH.rid,r=CH.rooms.find(x=>x.id===rid);if(!r)return;
  let d;try{d=await chFetch('chat_members',{room:rid})}catch(e){if(e.status===401)chExpired();else toast(e.message,'err');return}
  const mg=d.can_manage,stu=CH.who==='student';
  const rows=d.members.map(m=>'<div class="sumrow"><div class="ch-ic">'+(m.photo?'<img src="'+esc(m.photo)+'" alt="">':'<i class="fa-solid fa-user-graduate"></i>')+'</div><div class="ch-meta"><b>'+esc(m.name)+(m.status==='removed'?' <span class="badge b-closed">Removed</span>':'')+'</b>'
    +'<span>'+esc([m.info,m.status==='active'?(m.msgs+' message'+(m.msgs==1?'':'s')):'',m.joined?'joined '+m.joined.slice(0,10):''].filter(Boolean).join(' · '))+'</span>'+(mg&&(m.phone||m.email)?'<span>'+esc([m.phone,m.email].filter(Boolean).join(' · '))+'</span>':'')+'</div>'
    +(mg?'<button type="button" class="btn sm '+(m.status==='removed'?'sec':'dng')+'" data-k="'+m.id+'" data-u="'+(m.status==='removed'?1:0)+'">'+(m.status==='removed'?'Allow again':(r.kind==='group'?'Remove':'Block'))+'</button>':'')+'</div>').join('');
  openModal('<div class="mt"><h3><i class="fa-solid fa-users"></i> '+esc(r.title)+'</h3><button class="x" onclick="closeModal()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>'
    +'<p class="msg" style="margin-bottom:8px">'+esc(r.kind==='group'?d.members.filter(m=>m.status==='active').length+' student(s) joined this group · '+d.members.reduce((a,m)=>a+(m.status==='active'?m.msgs:0),0)+' message(s) sent':'Personal chat')+(mg&&r.kind==='group'?' · Removed students cannot join again until you allow them.':'')+'</p>'
    +'<div class="sumlist" style="margin-top:0">'+(rows||'<div class="empty">No students yet.</div>')+'</div>'
    +(stu&&r.kind==='group'?'<div class="acts"><button type="button" class="btn dng" id="chleave"><i class="fa-solid fa-door-open"></i> Leave this group</button></div>':''));
  $$('#mbox [data-k]').forEach(b=>b.onclick=async()=>{
    const undo=b.dataset.u==='1';
    if(!undo&&!confirm(r.kind==='group'?'Remove this student from the group?':'Block this student? They will not be able to send messages here.'))return;
    try{await chFetch('chat_kick',null,{room:rid,user:+b.dataset.k,undo});toast(undo?'Student allowed again.':'Student removed.');chMembers()}catch(e){toast(e.message,'err')}
  });
  const lv=$('#chleave');if(lv)lv.onclick=()=>chLeave(r);
}
async function chLeave(r){
  if(!confirm('Leave this group? You can join again any time from the Courses tab.'))return;
  try{
    await chFetch('chat_leave',null,{room:r.id});closeModal();
    const c=CH.courses.find(x=>x.id===r.subject_id);if(c){c.my='';c.n=Math.max(0,c.n-1)}
    CH.rid=0;chPlaceholder();const root=$('#chroot');if(root)root.classList.remove('open');await chLoadRooms();CH.tab='courses';chTabs();chRenderList();
    toast('You left the group. Join again from the Courses tab.');
  }catch(e){toast(e.message,'err')}
}

/* ---------- live updates (polling every 4 s; slower when nothing happens or the tab is hidden) ---------- */
async function chPoll(){
  CH.tick++;
  if(CH.rid){
    const rid=CH.rid;
    try{
      const d=await chFetch('chat_msgs',{room:rid,after:CH.last});if(rid!==CH.rid)return;
      if(d.msgs.length){CH.idle=0;chAdd(d.msgs)}else CH.idle++;
      if(d.del&&d.del.length){let c=false;d.del.forEach(id=>{const m=CH.msgs.find(x=>x.id===id);if(m&&!m.deleted){m.deleted=1;m.text='';c=true}});if(c)chPaint('keep')}
    }catch(e){
      if(e.status===404){CH.rid=0;chPlaceholder();const root=$('#chroot');if(root)root.classList.remove('open')}
      else if(e.status===401||e.status===403)throw e;
    }
  }
  if(CH.tick%3===0)await chLoadRooms();
}
function chLoop(inst,delay){
  clearTimeout(CH.timer);
  CH.timer=setTimeout(async()=>{
    if(inst!==CH.inst||!document.getElementById('chroot'))return;
    if(!document.hidden){try{await chPoll()}catch(e){
      if(inst===CH.inst&&e.status===401){chExpired();return}
      if(inst===CH.inst&&e.status===403){chStop();if(CH.who==='student')chatPage();else toast(e.message,'err');return}
    }}
    if(inst===CH.inst)chLoop(inst,document.hidden?10000:(CH.idle>15?8000:4000));
  },delay);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.getElementById('chroot'))chLoop(CH.inst,300)});
route();
