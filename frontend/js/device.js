if((window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone)document.documentElement.classList.add('pwa');window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__dp=e})
/* device profile: tells the CSS what kind of device this is (phone / tablet / desktop, touch or mouse, portrait or landscape, OS) */
(function(){var d=document.documentElement,L=['dev-phone','dev-tablet','dev-desktop','dev-xl','is-touch','is-mouse','is-portrait','is-landscape','os-ios','os-android','os-win','os-mac','os-linux','phone-xs','phone-s'],t=0;
function mq(q){try{return matchMedia(q).matches}catch(e){return false}}
function set(){var W=innerWidth,H=innerHeight,ua=navigator.userAgent||'',mt=navigator.maxTouchPoints||0,touch=mq('(pointer:coarse)')||(mt>0&&mq('(hover:none)')),sh=Math.min(W,H),c=[];
var ios=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&mt>1),and=/Android/.test(ua);
var dev=(W<600||(touch&&sh<600))?'phone':(W<1024?'tablet':(W>=1920?'xl':'desktop'));
c.push('dev-'+dev,touch?'is-touch':'is-mouse',W>H?'is-landscape':'is-portrait');
c.push(ios?'os-ios':and?'os-android':/Windows/.test(ua)?'os-win':/Mac/.test(ua)?'os-mac':'os-linux');
if(dev==='phone'&&sh<=340)c.push('phone-xs');else if(dev==='phone'&&sh<=374)c.push('phone-s');
L.forEach(function(x){d.classList.remove(x)});c.forEach(function(x){d.classList.add(x)});
d.style.setProperty('--vh1',(H*0.01)+'px');window.__dev={type:dev,touch:touch,w:W,h:H}}
function tick(){cancelAnimationFrame(t);t=requestAnimationFrame(set)}
set();addEventListener('resize',tick);addEventListener('orientationchange',function(){setTimeout(set,150)})})();
