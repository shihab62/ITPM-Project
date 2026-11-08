/* v29: app mode - service worker, bottom tab bar, install prompt, offline notice */
(function(){
  const de=document.documentElement,B=document.body;
  const standalone=()=>de.classList.contains('pwa');
  /* splash (only when launched from the home screen) */
  const sp=document.getElementById('splash');
  if(sp){const hide=()=>{sp.classList.add('gone');setTimeout(()=>sp.remove(),500)};
    if(document.readyState==='complete')setTimeout(hide,350);else window.addEventListener('load',()=>setTimeout(hide,350));setTimeout(hide,3500)}
  /* service worker */
  if('serviceWorker' in navigator&&window.isSecureContext){
    window.addEventListener('load',()=>{navigator.serviceWorker.register(((window.__BOOT&&window.__BOOT.apiUrl)||'/api')+'?sw=1',{scope:'./'}).catch(()=>{})});
  }
  /* bottom tab bar mirrors the top menu (labels, icons, active tab) */
  const tb=document.getElementById('tabbar'),mn=document.getElementById('mainnav');
  function buildTabs(){
    if(!tb||!mn)return;
    tb.innerHTML=[...mn.querySelectorAll('a')].map(a=>{
      const ic=a.querySelector('i'),lb=a.textContent.trim();
      return '<a href="'+esc(a.getAttribute('href'))+'" class="'+(a.classList.contains('on')?'on ':'')+(a.classList.contains('adm')?'adm':'')+'"'+(a.classList.contains('on')?' aria-current="page"':'')+'>'+(ic?ic.outerHTML:'')+'<span>'+esc(lb)+'</span></a>';
    }).join('');
    B.classList.add('tabready');
  }
  buildTabs();
  if(mn)new MutationObserver(buildTabs).observe(mn,{subtree:true,childList:true,attributes:true,attributeFilter:['class','href'],characterData:true});
  if(tb)tb.addEventListener('click',e=>{if(e.target.closest('a')&&navigator.vibrate){try{navigator.vibrate(8)}catch(x){}}});
  /* hide the bars while the keyboard is open */
  const isField=t=>t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)&&!/^(checkbox|radio|button|submit|file)$/.test(t.type||'');
  document.addEventListener('focusin',e=>{if(isField(e.target))B.classList.add('kb')});
  document.addEventListener('focusout',()=>{setTimeout(()=>{if(!isField(document.activeElement))B.classList.remove('kb')},120)});
  /* install prompt */
  const ib=document.getElementById('instbar'),it=document.getElementById('insttxt'),go=document.getElementById('instgo'),xx=document.getElementById('instx');
  let dp=window.__dp||null;
  const KEY='pr_inst_dismiss',DONE='pr_installed';
  const markDone=()=>{try{localStorage.setItem(DONE,'1')}catch(e){}};
  const isDone=()=>{try{return localStorage.getItem(DONE)==='1'}catch(e){return false}};
  const nope=()=>{try{const t=+localStorage.getItem(KEY)||0;return isDone()||Date.now()-t<7*864e5}catch(e){return false}};
  if(/[?&]pwa_reset/.test(location.search)){try{localStorage.removeItem(DONE);localStorage.removeItem(KEY)}catch(e){}}
  if(standalone())markDone();
  /* already installed? (Android Chrome can tell us) */
  if(navigator.getInstalledRelatedApps)navigator.getInstalledRelatedApps().then(a=>{if(a&&a.length){markDone();de.classList.remove('instok');if(ib)ib.classList.remove('show')}}).catch(()=>{});
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  function showBar(html,btn){it.innerHTML=html;go.textContent=btn;go.style.display=btn?'':'none';ib.classList.add('show')}
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();dp=e;window.__dp=e;setTimeout(()=>showBar('<b>Install '+esc(SITE_NAME)+'</b>Get the app on your home screen for quick access.','Install'),1500)});
  if(dp)setTimeout(()=>showBar('<b>Install '+esc(SITE_NAME)+'</b>Get the app on your home screen for quick access.','Install'),1500);
  window.addEventListener('appinstalled',()=>{markDone();de.classList.remove('instok');dp=null;window.__dp=null;const f=document.getElementById('instfab');if(f)f.classList.remove('show');try{toast('App installed')}catch(e){}});
  if(ios&&!standalone()&&/safari/i.test(navigator.userAgent)&&!/crios|fxios/i.test(navigator.userAgent)){
    setTimeout(()=>showBar('<b>Install '+esc(SITE_NAME)+'</b>Tap <i class="fa-solid fa-arrow-up-from-bracket"></i> Share, then <b style="display:inline">Add to Home Screen</b>.',''),3000);
  }
  if(go)go.onclick=async()=>{const d=dp||window.__dp;ib.classList.remove('show');if(!d){help();return}dp=null;window.__dp=null;try{d.prompt();const r=await d.userChoice;if(r&&r.outcome==='accepted')markDone()}catch(e){help()}};
  /* browsers that never fire the install event (iPhone, in-app browsers, some Android): show the card with a 'How to' button */
  setTimeout(()=>{if(!dp&&!window.__dp&&!iosSafari)showBar('<b>Install '+esc(SITE_NAME)+'</b>','How to')},4500);
  if(xx)xx.onclick=()=>{ib.classList.remove('show');try{localStorage.setItem(KEY,String(Date.now()))}catch(e){}};
  /* always-visible Install button + help when the browser cannot show the install prompt */
  const fab=document.getElementById('instfab'),sh=document.getElementById('instsheet');
  const UA=navigator.userAgent,inapp=/FBAN|FBAV|FB_IAN|Messenger|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|; wv\)/i.test(UA);
  const andr=/android/i.test(UA),iosSafari=ios&&/safari/i.test(UA)&&!/crios|fxios|edgios|fban|fbav|instagram/i.test(UA);
  async function instDiag(box){
    const R=[],add=(ok,t)=>R.push('<div style="display:flex;gap:8px;padding:7px 0;border-top:1px solid #eef1f6"><b style="flex:none;color:'+(ok?'#1f9d57':'#d64550')+'">'+(ok?'&#10004;':'&#10008;')+'</b><span>'+t+'</span></div>');
    add(window.isSecureContext,'Secure connection (https)'+(window.isSecureContext?'':' &mdash; open the site with <b>https://</b>'));
    add(!inapp,inapp?'You are in an in-app browser (Facebook / Messenger...). Open the site in <b>Chrome</b> or <b>Safari</b>.':'Normal browser');
    const mu=document.querySelector('link[rel=manifest]');
    try{
      const r=await fetch(mu.href,{cache:'no-store'}),ct=(r.headers.get('content-type')||'').split(';')[0],j=await r.json();
      add(r.ok&&/json/.test(ct),'App manifest loads ('+r.status+', '+esc(ct||'?')+')'+(r.ok?'':' &mdash; upload <b>manifest.json</b> next to index.php'));
      for(const i of (j.icons||[]).slice(0,2)){const x=await fetch(new URL(i.src,mu.href),{cache:'no-store'}),t=(x.headers.get('content-type')||'').split(';')[0];add(x.ok&&t==='image/png','App icon '+esc(i.sizes)+' ('+x.status+', '+esc(t||'?')+')')}
    }catch(e){add(false,'App manifest problem: '+esc(e.message)+' &mdash; <b>manifest.json</b> is missing, blocked or returns an error. Open <b>manifest.json</b> in the browser to see.')}
    try{await navigator.serviceWorker.register(((window.__BOOT&&window.__BOOT.apiUrl)||'/api')+'?sw=1',{scope:'./'});await navigator.serviceWorker.ready;add(true,'Service worker is running')}catch(e){add(false,'Service worker failed: '+esc(e.message))}
    let inst=false;try{if(navigator.getInstalledRelatedApps)inst=(await navigator.getInstalledRelatedApps()).length>0}catch(e){}
    add(!inst,inst?'The app is <b>already installed</b> on this device. Open it from your app list / home screen. To install again, uninstall it first (Chrome: chrome://apps).':'Not installed on this device yet');
    if(isDone()&&!inst)R.push('<div style="padding:7px 0;border-top:1px solid #eef1f6">This browser remembers an old install. <a href="#" id="instreset" style="color:#0d9488;font-weight:700">Reset</a></div>');
    box.innerHTML='<b style="display:block;margin-bottom:2px">Why can&rsquo;t it install here?</b>'+R.join('');
    const rs=document.getElementById('instreset');if(rs)rs.onclick=e=>{e.preventDefault();try{localStorage.removeItem(DONE);localStorage.removeItem(KEY)}catch(x){}location.reload()};
  }
  function help(){
    let t='Install '+esc(SITE_NAME),h='';
    if(!window.isSecureContext)h+='<p class="warn">This site is opened with http://. Apps can only be installed from <b>https://</b>.</p>';
    if(inapp)h+='<p class="warn"><b>You are inside another app\'s browser</b> (Facebook / Messenger / Instagram...). Installing does not work here.</p><ol><li>Tap the <b>&#8942;</b> or <b>&hellip;</b> menu</li><li>Choose <b>Open in Chrome</b> (iPhone: <b>Open in Safari</b>)</li><li>Then tap <b>Install app</b> again</li></ol>';
    else if(ios)h+=iosSafari?'<ol><li>Tap the <b>Share</b> button <i class="fa-solid fa-arrow-up-from-bracket"></i> at the bottom</li><li>Scroll and tap <b>Add to Home Screen</b></li><li>Tap <b>Add</b></li></ol>':'<p class="warn">On iPhone, apps can only be installed from <b>Safari</b>. Open this page in Safari first.</p>';
    else if(andr)h+='<ol><li>Open this page in <b>Chrome</b></li><li>Tap the <b>&#8942;</b> menu (top right)</li><li>Tap <b>Install app</b> (or <b>Add to Home screen</b>, then <b>Install</b>)</li></ol><p style="font-size:.85rem;color:#5d6b7f">If the menu only shows a plain shortcut, wait a few seconds, reload once and try again.</p>';
    else h+='<p>To install on a PC, visit this site in <b>Microsoft Edge</b>, then click <b>Install</b>.</p>';
    const desk=!ios&&!andr&&!inapp;if(!desk)h+='<div id="instd" style="font-size:.86rem;margin:4px 0 14px">Checking&hellip;</div>';document.getElementById('instt').textContent=t;document.getElementById('instb').innerHTML=h;sh.classList.add('show');if(!desk)instDiag(document.getElementById('instd'));
  }
  if(fab&&!standalone()){fab.classList.add('show');
    fab.onclick=async()=>{const d=dp||window.__dp;if(d){dp=null;window.__dp=null;try{d.prompt();const r=await d.userChoice;if(r&&r.outcome==='accepted')fab.classList.remove('show')}catch(e){help()}return}help()}}
  if(sh){document.getElementById('instc').onclick=()=>sh.classList.remove('show');sh.onclick=e=>{if(e.target===sh)sh.classList.remove('show')}}
  /* small "Install App" button on the home page: same one-tap install */
  window.prInstall=async()=>{const d=dp||window.__dp;if(!d){help();return}dp=null;window.__dp=null;try{d.prompt();const r=await d.userChoice;if(r&&r.outcome==='accepted'){markDone();de.classList.remove('instok')}}catch(e){help()}};
  document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('.hinst'))window.prInstall()});
  if(!standalone())de.classList.add('instok');
  /* footer only on the home page */
  const upFoot=()=>{const h=location.hash;B.classList.toggle('ishome',h===''||h==='#')};
  upFoot();window.addEventListener('hashchange',upFoot);window.addEventListener('popstate',upFoot);
  const ap=document.getElementById('app');if(ap)new MutationObserver(upFoot).observe(ap,{childList:true});
  /* offline / online notice */
  window.addEventListener('offline',()=>{try{toast('You are offline. Some things may not work.','err')}catch(e){}});
  window.addEventListener('online',()=>{try{toast('Back online')}catch(e){}});
})();
