/* Vision extras: small scripts that run after app.js (same order as before) */
try{

(function(){var sp=document.getElementById('splash');if(!sp)return;var done=false;
function hide(){if(done)return;done=true;sp.classList.add('out');setTimeout(function(){sp.remove()},700)}
sp.addEventListener('pointerdown',hide);setTimeout(hide,3950)})();

}catch(e){console.error(e)}
try{

(function(){var T='.chip,.btn,.seg button,.round,.x,.dpnav,.dpbtn,.dpday,.datebtn,.cell.has,.srow,.trade,.thcard,.acrow';
document.addEventListener('pointerdown',function(e){var el=e.target.closest&&e.target.closest(T);if(!el||el.closest('nav'))return;
var r=el.getBoundingClientRect();el.style.setProperty('--x',(e.clientX-r.left).toFixed(0)+'px');el.style.setProperty('--y',(e.clientY-r.top).toFixed(0)+'px')},{passive:true})})();

}catch(e){console.error(e)}
try{

(function(){try{
var $=function(i){return document.getElementById(i)};
var SES=[
 {n:'Asia',tz:'Asia/Tokyo',o:[9,0],c:[18,0]},
 {n:'London',tz:'Europe/London',o:[8,0],c:[17,0]},
 {n:'New York',tz:'America/New_York',o:[8,0],c:[17,0]}
];
var cache={};
function parts(tz,ms){
  var f=cache[tz]||(cache[tz]=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric'}));
  var o={};f.formatToParts(new Date(ms)).forEach(function(p){if(p.type!=='literal')o[p.type]=+p.value});
  o.hour=o.hour%24;return o;
}
function off(tz,ms){var p=parts(tz,ms);return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-Math.floor(ms/1000)*1000}
function inst(tz,y,m,d,h,mi){var g=Date.UTC(y,m-1,d,h,mi),o=off(tz,g),t=g-o,o2=off(tz,t);if(o2!==o)t=g-o2;return t}
function state(s,now){
  var p=parts(s.tz,now);
  for(var k=-1;k<=2;k++){
    var dt=new Date(Date.UTC(p.year,p.month-1,p.day+k));
    var y=dt.getUTCFullYear(),m=dt.getUTCMonth()+1,d=dt.getUTCDate();
    var a=inst(s.tz,y,m,d,s.o[0],s.o[1]),b=inst(s.tz,y,m,d,s.c[0],s.c[1]);
    if(now>=a&&now<b)return{on:true,at:b,a:a,b:b};
    if(a>now)return{on:false,at:a,a:a,b:b};
  }
  return{on:false,at:now,a:now,b:now};
}
function t12(ms){return new Date(ms).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})}
function u12(ms,sec){var o={hour:'numeric',minute:'2-digit',hour12:true,timeZone:'UTC'};if(sec)o.second='2-digit';return new Date(ms).toLocaleTimeString('en-US',o)}
function dur(ms){var m=Math.max(0,Math.floor(ms/60000)),d=Math.floor(m/1440),h=Math.floor(m%1440/60),mi=m%60;return d?d+'d '+h+'h':h?h+'h '+('0'+mi).slice(-2)+'m':mi+'m'}
function tick(){
  try{
    var box=$('s-dash');
    if(!box||box.hidden||document.hidden||box.getAttribute('data-dt')!=='sessions')return;
    var now=Date.now(),d=new Date(now),html='',open=[];
    $('sessTime').textContent=d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});
    $('sessDate').textContent=d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
    $('sessUtc').textContent='UTC '+u12(now,true)+' · '+d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
    SES.forEach(function(s){
      var st=state(s,now);if(st.on)open.push(s.n);
      html+='<div class="srw"><i class="sdot'+(st.on?' on':'')+'"></i>'
        +'<span class="snm">'+s.n
        +'<span class="shr">'+t12(st.a)+' – '+t12(st.b)+'</span>'
        +'<span class="shr u">UTC '+u12(st.a)+' – '+u12(st.b)+'</span></span>'
        +'<span class="sst'+(st.on?' on':'')+'">'+(st.on?'Open':'Closed')
        +'<small>'+(st.on?'Closes in ':'Opens in ')+dur(st.at-now)+'</small></span></div>';
    });
    $('sessRows').innerHTML=html;
    var tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}
    $('sessNote').textContent=(open.indexOf('London')>-1&&open.indexOf('New York')>-1)
      ?'London and New York overlap: peak liquidity.'
      :'Your local time'+(tz?' ('+tz.replace(/_/g,' ')+')':'')+' with UTC beneath. Shown every day.';
  }catch(e){}
}
tick();setInterval(tick,1000);
document.addEventListener('click',function(){setTimeout(tick,0)},true);
document.addEventListener('visibilitychange',tick);
}catch(e){}})();

}catch(e){console.error(e)}
try{

(function(){try{
var KEY='pnl-dtab',TABS=['overview','charts','breakdown','trades','sessions'];
var box=document.getElementById('s-dash'),strip=document.getElementById('dtabs');
if(!box||!strip)return;
function center(){var b=strip.querySelector('[aria-selected="true"]');if(b&&strip.clientWidth)strip.scrollLeft=b.offsetLeft-(strip.clientWidth-b.offsetWidth)/2}
function show(t,top){
  if(TABS.indexOf(t)<0)t='overview';
  box.setAttribute('data-dt',t);
  strip.querySelectorAll('[data-dtab]').forEach(function(b){
    var on=b.getAttribute('data-dtab')===t;
    b.setAttribute('aria-selected',on?'true':'false');b.tabIndex=on?0:-1;
  });
  center();
  try{localStorage.setItem(KEY,t)}catch(e){}
  if(top){document.body.scrollTop=0;window.scrollTo(0,0)}
}
function idx(){return TABS.indexOf(box.getAttribute('data-dt'))}
function flip(d){
  if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  box.style.setProperty('--dx',(d*28)+'px');
  box.classList.remove('dflip');void box.offsetWidth;box.classList.add('dflip');
  setTimeout(function(){box.classList.remove('dflip')},260);
}
strip.addEventListener('click',function(e){
  var b=e.target.closest('[data-dtab]');if(!b)return;
  var t=b.getAttribute('data-dtab');if(t===box.getAttribute('data-dt'))return;
  flip(TABS.indexOf(t)>idx()?1:-1);show(t,true);
});
var sx=0,sy=0,st=0,ok=false;
document.addEventListener('touchstart',function(e){
  ok=false;
  if(box.hidden||e.touches.length!==1||document.documentElement.classList.contains('modal'))return;
  var t=e.target;
  if(!t.closest||t.closest('.dtabs,nav,input,textarea,select,.fab'))return;
  sx=e.touches[0].clientX;sy=e.touches[0].clientY;st=Date.now();ok=true;
},{passive:true});
document.addEventListener('touchend',function(e){
  if(!ok)return;ok=false;
  var c=e.changedTouches[0],dx=c.clientX-sx,dy=c.clientY-sy;
  if(Date.now()-st>700||Math.abs(dx)<56||Math.abs(dx)<Math.abs(dy)*1.8)return;
  var d=dx<0?1:-1,i=idx()+d;
  if(i<0||i>=TABS.length)return;
  flip(d);show(TABS[i],true);
},{passive:true});
document.addEventListener('touchcancel',function(){ok=false},{passive:true});
document.addEventListener('click',function(e){if(e.target.closest('[data-act="tab"]'))setTimeout(center,80)},true);
window.addEventListener('resize',center);
var s='overview';try{s=localStorage.getItem(KEY)||s}catch(e){}
show(s,false);
}catch(e){}})();

}catch(e){console.error(e)}
try{

(function(){
try{
var K='pnl-lock',KF='pnl-lock-fail',KA='pnl-lock-auto';
var $=function(i){return document.getElementById(i)};
var H=document.documentElement;
var SPH=($('splash')||{}).outerHTML||'';
function splash(){
  if(!SPH)return;
  var o=$('splash');if(o)o.remove();
  var t=document.createElement('div');t.innerHTML=SPH;var sp=t.firstChild;sp.classList.remove('out');
  document.body.insertBefore(sp,document.body.firstChild);
  var d=false;function hide(){if(d)return;d=true;sp.classList.add('out');setTimeout(function(){sp.remove()},700)}
  sp.addEventListener('pointerdown',hide);setTimeout(hide,3950);
}
function rd(k){try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}}
function wr(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
function rm(k){try{localStorage.removeItem(k)}catch(e){}}
function say(m){try{if(typeof toast==='function')toast(m)}catch(e){}}
function b64(buf){var a=new Uint8Array(buf),s='';for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s)}
function unb64(s){var b=atob(s),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}

/* ---------- PIN hashing: PBKDF2 when available, slow fallback otherwise ---------- */
var SUB=!!(window.crypto&&crypto.subtle&&window.isSecureContext);
function fh(s){var h1=0xdeadbeef,h2=0x41c6ce57;for(var r=0;r<30000;r++){for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677)}h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909)}return(h2>>>0).toString(16)+(h1>>>0).toString(16)}
async function hash(pin,salt,m){
  if(m==='p'&&SUB){
    var key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
    return b64(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unb64(salt),iterations:150000},key,256));
  }
  return fh(salt+':'+pin);
}
async function mk(pin){var salt=b64(crypto.getRandomValues(new Uint8Array(16))),m=SUB?'p':'f';return{v:1,m:m,salt:salt,h:await hash(pin,salt,m),len:pin.length}}
async function check(pin,rec){return(await hash(pin,rec.salt,rec.m))===rec.h}

/* ---------- failed-attempt delay ---------- */
function fs(){var f=rd(KF);return f&&typeof f==='object'?f:{n:0,until:0}}
function fail(){var f=fs();f.n=(f.n||0)+1;if(f.n%5===0)f.until=Date.now()+Math.min(30*Math.pow(2,f.n/5-1),900)*1000;wr(KF,f);return f}
function fmt(s){return s>=60?Math.floor(s/60)+'m '+(s%60)+'s':s+'s'}

/* ---------- keypad overlay ---------- */
var pd=null,busy=false,locking=false,dlg=false,hiddenAt=0;
var pad='';['1','2','3','4','5','6','7','8','9','bio','0','b'].forEach(function(k){
  pad+=k==='bio'?'<button type="button" class="ghost" disabled aria-hidden="true"></button>':
       k==='b'?'<button type="button" class="ghost" data-k="b" aria-label="Delete">&#9003;</button>':
       '<button type="button" data-k="'+k+'">'+k+'</button>';
});
$('lkPad').innerHTML=pad;
function setBusy(v){busy=v;$('lkPad').classList.toggle('off',v)}
function dots(){
  var n=pd.auto?pd.len:Math.max(4,pd.buf.length),h='';
  for(var i=0;i<n;i++)h+='<i'+(i<pd.buf.length?' class="on"':'')+'></i>';
  $('lkDots').innerHTML=h;
  $('lkOk').hidden=pd.auto;$('lkOk').disabled=pd.buf.length<4;
}
function shake(){var d=$('lkDots');d.classList.remove('shake');void d.offsetWidth;d.classList.add('shake');try{navigator.vibrate&&navigator.vibrate(60)}catch(e){}}
function open(o){
  return new Promise(function(res){
    pd={buf:'',auto:!!o.auto,len:o.len||6,res:res};
    $('lkT').textContent=o.t;$('lkS').textContent=o.s||'';$('lkE').textContent=o.e||'';
    $('lkX').hidden=!o.cancel;
    $('lkOk').textContent=o.ok||'Next';
    $('lockscr').hidden=false;setBusy(false);dots();
  });
}
function done(v){var r=pd.res;pd=null;r(v)}
function key(k){
  if(!pd||busy)return;
  if(k==='b')pd.buf=pd.buf.slice(0,-1);
  else if(pd.buf.length<(pd.auto?pd.len:6))pd.buf+=k;
  $('lkE').textContent='';dots();
  if(pd.auto&&pd.buf.length===pd.len){var b=pd.buf;setTimeout(function(){if(pd)done(b)},80)}
}
$('lkPad').addEventListener('click',function(e){var b=e.target.closest('[data-k]');if(b)key(b.dataset.k)});
$('lkOk').addEventListener('click',function(){if(pd&&!pd.auto&&pd.buf.length>=4)done(pd.buf)});
$('lkX').addEventListener('click',function(){if(pd)done(null)});
document.addEventListener('keydown',function(e){
  if(!pd||$('lockscr').hidden)return;
  if(/^[0-9]$/.test(e.key))key(e.key);
  else if(e.key==='Backspace')key('b');
  else if(e.key==='Enter'&&!pd.auto&&pd.buf.length>=4)done(pd.buf);
  else if(e.key==='Escape'&&!$('lkX').hidden)done(null);
});
function close(){$('lockscr').hidden=true;H.classList.remove('locked')}
function wait(){
  return new Promise(function(res){
    (function tick(){
      var left=Math.ceil((fs().until-Date.now())/1000);
      if(left<=0){setBusy(false);$('lkE').textContent='';res();return}
      pd=null;$('lkDots').innerHTML='';setBusy(true);$('lkE').textContent='Too many tries. Wait '+fmt(left);
      setTimeout(tick,500);
    })();
  });
}

/* ---------- lock flow ---------- */
async function lockNow(){
  var rec=rd(K);if(!rec||locking||dlg)return;
  locking=true;H.classList.add('locked');$('lockscr').hidden=false;
  var err='';
  try{
    for(;;){
      await wait();
      var p=await open({t:'Vision is locked',s:'Enter your PIN',auto:true,len:rec.len,e:err});
      if(p==null)continue;
      if(await check(p,rec)){rm(KF);break}
      var f=fail();shake();
      err=f.n%5===0?'':'Wrong PIN. '+(5-f.n%5)+' tries left';
    }
  }finally{locking=false;splash();close()}
}
/* ---------- settings panel ---------- */
function getDelay(){var v=parseInt(rd(KA),10);return isNaN(v)?60:v}
function paint(){
  var on=!!rd(K);
  $('pinSet').hidden=on;$('pinChg').hidden=!on;$('pinOff').hidden=!on;$('secOpts').hidden=!on;
  var d=String(getDelay());
  $('autoSeg').querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.v===d)});
}
async function verifyCurrent(t){
  var rec=rd(K),err='';
  for(;;){
    await wait();
    var p=await open({t:t,s:'Enter your current PIN',auto:true,len:rec.len,cancel:true,e:err});
    if(p==null)return false;
    if(await check(p,rec)){rm(KF);return true}
    var f=fail();shake();err=f.n%5===0?'':'Wrong PIN. '+(5-f.n%5)+' tries left';
  }
}
async function newPin(){
  var e='';
  for(;;){
    var a=await open({t:'New PIN',s:'Choose 4 to 6 digits',cancel:true,ok:'Next',e:e});if(a==null)return null;
    var b=await open({t:'Confirm PIN',s:'Enter it once more',cancel:true,ok:'Save'});if(b==null)return null;
    if(a===b)return a;
    e='PINs did not match. Try again.';
  }
}
function flow(fn){return async function(){if(dlg||locking)return;dlg=true;try{await fn()}catch(e){say('Something went wrong')}finally{dlg=false;pd=null;$('lockscr').hidden=true;paint()}}}
$('pinSet').addEventListener('click',flow(async function(){var p=await newPin();if(p){wr(K,await mk(p));rm(KF);say('PIN set')}}));
$('pinChg').addEventListener('click',flow(async function(){if(!await verifyCurrent('Change PIN'))return;var p=await newPin();if(p){wr(K,await mk(p));rm(KF);say('PIN changed')}}));
$('pinOff').addEventListener('click',flow(async function(){if(!await verifyCurrent('Remove PIN'))return;rm(K);rm(KF);say('PIN removed')}));
$('lockNowBtn').addEventListener('click',function(){lockNow()});
$('autoSeg').addEventListener('click',function(e){var b=e.target.closest('button[data-v]');if(!b)return;wr(KA,parseInt(b.dataset.v,10));paint()});
paint();

/* ---------- auto-lock ---------- */
document.addEventListener('visibilitychange',function(){
  if(document.hidden){hiddenAt=Date.now();return}
  if(rd(K)&&hiddenAt&&(Date.now()-hiddenAt)/1000>=getDelay())lockNow();
  hiddenAt=0;
});
window.addEventListener('pageshow',function(e){if(e.persisted&&rd(K))lockNow()});
if(rd(K))lockNow();else H.classList.remove('locked');
}catch(err){
  /* if the lock itself breaks, never leave the app invisible */
  try{document.documentElement.classList.remove('locked');var l=document.getElementById('lockscr');if(l)l.hidden=true}catch(e){}
}
})();

}catch(e){console.error(e)}
try{

(function(){var sw=document.getElementById('spaceSw');if(!sw)return;
function on(){try{return localStorage.getItem('pnl-space')==='1'}catch(e){return false}}
function paint(){var v=on();document.documentElement.classList.toggle('space',v);sw.setAttribute('aria-checked',v)}
sw.addEventListener('click',function(){try{if(on())localStorage.removeItem('pnl-space');else localStorage.setItem('pnl-space','1')}catch(e){}paint()});
paint()})();

}catch(e){console.error(e)}
try{

(function(){
  var root=document.documentElement, vv=window.visualViewport;
  var curH=function(){return vv?vv.height:window.innerHeight};
  var base=curH();
  var isText=function(el){
    if(!el)return false;
    if(el.tagName==='TEXTAREA'||el.isContentEditable)return true;
    return el.tagName==='INPUT'&&!/^(checkbox|radio|range|file|button|submit|reset|image|color)$/i.test(el.type||'text');
  };
  function upd(){
    var h=curH(), f=isText(document.activeElement);
    if(h>base)base=h;
    var kb=f&&h<base-120;
    root.classList.toggle('kb',kb);
    var kbh=kb&&vv?Math.max(0,window.innerHeight-vv.height-vv.offsetTop):0;
    root.style.setProperty('--kbh',kbh+'px');
  }
  document.addEventListener('focusin',function(e){
    upd();
    var t=e.target;
    if(isText(t)&&t.closest&&t.closest('.panelSheet'))setTimeout(function(){try{t.scrollIntoView({block:'center',behavior:'smooth'})}catch(x){}},320);
  });
  document.addEventListener('focusout',function(){setTimeout(upd,60)});
  if(vv){vv.addEventListener('resize',upd);}
  window.addEventListener('resize',upd);
  window.addEventListener('orientationchange',function(){setTimeout(function(){base=curH();upd()},400)});
  /* search: Enter closes the keyboard; scrolling the list does too (like iOS) */
  document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target&&e.target.id==='dsearch')e.target.blur()});
  document.addEventListener('touchmove',function(e){var a=document.activeElement;if(a&&a.id==='dsearch'&&e.target!==a)a.blur()},{passive:true});

  /* scroll indicator */
  var ind=document.createElement('div');ind.id='sbar';ind.setAttribute('aria-hidden','true');root.appendChild(ind);
  var probe=document.createElement('div');probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';root.appendChild(probe);
  var hideT=0;
  document.addEventListener('scroll',function(e){
    var el=e.target===document?document.scrollingElement:e.target;
    if(!el||el.nodeType!==1)return;
    var range=el.scrollHeight-el.clientHeight;
    if(range<4)return;
    var oy=getComputedStyle(el).overflowY;
    if(oy!=='auto'&&oy!=='scroll')return;
    var isBody=el===document.body||el===document.documentElement;
    var vw=window.innerWidth,vh=window.innerHeight;
    var r=isBody?{top:0,bottom:vh,right:vw}:el.getBoundingClientRect();
    var cs=getComputedStyle(probe),sat=parseFloat(cs.paddingTop)||0,sab=parseFloat(cs.paddingBottom)||0;
    var top=Math.max(r.top,0)+(r.top<=0?sat:0)+6, bottom=Math.min(r.bottom,vh)-(sab&&r.bottom>=vh?sab:0)-6;
    if(isBody){
      var nv=document.querySelector('nav');
      if(nv&&!root.classList.contains('kb')){var nr=nv.getBoundingClientRect();if(nr.height)bottom=Math.min(bottom,nr.top-6)}
    }
    var track=bottom-top;if(track<60)return;
    var th=Math.min(150,track);   /* fixed short thumb, length no longer follows page height */
    var p=Math.max(0,Math.min(1,el.scrollTop/range));
    ind.style.height=th+'px';
    ind.style.transform='translate3d('+Math.round(Math.min(r.right,vw)-6)+'px,'+Math.round(top+(track-th)*p)+'px,0)';
    ind.style.opacity='1';
    clearTimeout(hideT);hideT=setTimeout(function(){ind.style.opacity='0'},850);
  },true);
})();

}catch(e){console.error(e)}
try{
(function(){var r=document.documentElement,b=document.getElementById('menuBtn'),n=document.querySelector('nav');if(!b||!n)return;
function nm(){var h=document.querySelector('main section:not([hidden]) .top h1'),c=n.querySelector('[aria-current=page]'),e=document.getElementById('pgName');if(e)e.textContent=h?h.textContent:(c?c.textContent.trim():'')}
new MutationObserver(nm).observe(n,{attributes:true,subtree:true,attributeFilter:['aria-current']});setTimeout(nm,300);
function set(v){r.classList.toggle('menu',v);b.setAttribute('aria-expanded',v)}
n.addEventListener('pointerdown',function(e){e.stopImmediatePropagation()},true);
b.addEventListener('click',function(e){e.stopPropagation();set(!r.classList.contains('menu'))});
document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('nav button'))setTimeout(function(){set(false)},50)},true);
document.addEventListener('click',function(e){if(r.classList.contains('menu')&&!e.target.closest('nav'))set(false)})})();
}catch(e){console.error(e)}
try{
(function(){var sg=document.getElementById('themeSeg');if(!sg||!window.PnlTheme)return;function mk(){var g=PnlTheme.get();sg.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.v===g))})}mk();sg.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;PnlTheme.set(b.dataset.v);mk()})})();
}catch(e){console.error(e)}