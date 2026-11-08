/* v34: visitor analytics beacon - page views + a light heartbeat (no cookies other than one random visitor id, no GPS) */
(function(){
  if(window.__an)return;window.__an=1;
  var hint={model:'',platv:''},first=true,lastSend=0,tm=0,lastHash=null;
  try{if(navigator.userAgentData&&navigator.userAgentData.getHighEntropyValues)navigator.userAgentData.getHighEntropyValues(['model','platformVersion']).then(function(h){hint.model=h.model||'';hint.platv=h.platformVersion||''}).catch(function(){})}catch(e){}
  function tok(){var m=document.querySelector('meta[name=csrf]');return m?m.content:''}
  function send(kind){
    var p=location.hash||'#home';
    if(p.indexOf('#admin')===0)return;
    var d={kind:kind,page:p,screen:(screen.width||0)+'x'+(screen.height||0),lang:navigator.language||'',tz:'',pwa:0,conn:'',model:hint.model,platv:hint.platv,ref:''};
    try{d.tz=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}
    try{d.pwa=(matchMedia('(display-mode: standalone)').matches||navigator.standalone)?1:0}catch(e){}
    try{d.conn=(navigator.connection&&navigator.connection.effectiveType)||''}catch(e){}
    try{d.vp=(innerWidth||0)+'x'+(innerHeight||0);d.dpr=Math.round((devicePixelRatio||1)*100)/100;d.dark=matchMedia('(prefers-color-scheme: dark)').matches?1:0;d.cores=navigator.hardwareConcurrency||0;d.mem=navigator.deviceMemory||0;d.touch=navigator.maxTouchPoints||0;d.tzo=-new Date().getTimezoneOffset();d.ck=navigator.cookieEnabled?1:0;
      var cn=navigator.connection;if(cn){d.down=cn.downlink||0;d.save=cn.saveData?1:0}}catch(e){}
    if(kind==='view'&&first){d.ref=document.referrer||'';first=false;try{var nv=performance.getEntriesByType('navigation')[0];if(nv&&nv.loadEventEnd>0)d.load=Math.round(nv.loadEventEnd)}catch(e){}}
    lastSend=Date.now();if(kind==='view')lastHash=p;
    try{fetch(((window.__BOOT&&window.__BOOT.apiUrl)||'/api')+'?api=track',{method:'POST',keepalive:true,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':tok()},body:JSON.stringify(d)}).catch(function(){})}catch(e){}
  }
  setTimeout(function(){send('view')},1500);
  window.addEventListener('hashchange',function(){clearTimeout(tm);tm=setTimeout(function(){if((location.hash||'#home')!==lastHash)send('view')},700)});
  setInterval(function(){if(!document.hidden)send('ping')},60000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&Date.now()-lastSend>90000)send('ping')});
})();
