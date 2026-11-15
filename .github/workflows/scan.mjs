const SY=["BTC","ETH","SOL","BNB","XRP","ADA","DOGE","AVAX","LINK","LTC"];
const TOPIC=process.env.NTFY_TOPIC,MINEXP=+(process.env.MIN_EXP||0.1),WIN=330000;
const HOSTS=["https://data-api.binance.vision","https://api.binance.com"];
async function kl(s){let e;for(const h of HOSTS){try{const r=await fetch(`${h}/api/v3/klines?symbol=${s}USDT&interval=1m&limit=1000`);if(!r.ok)throw new Error(r.status);return(await r.json()).map(k=>({h:+k[2],l:+k[3],c:+k[4],t:+k[6]}))}catch(x){e=x}}throw e}
function ema(a,n){const k=2/(n+1),o=[a[0]];for(let i=1;i<a.length;i++)o.push(a[i]*k+o[i-1]*(1-k));return o}
function ind(c){const cl=c.map(x=>x.c),n=c.length,e9=ema(cl,9),e21=ema(cl,21),e50=ema(cl,50);
 const tr=c.map((x,i)=>i?Math.max(x.h-x.l,Math.abs(x.h-c[i-1].c),Math.abs(x.l-c[i-1].c)):x.h-x.l),atr=ema(tr,14);
 const rsi=[],bu=[],bl=[];let ag=0,al=0;
 for(let i=0;i<n;i++){if(i){const d=cl[i]-cl[i-1];ag=(ag*13+Math.max(d,0))/14;al=(al*13+Math.max(-d,0))/14}
  rsi.push(al?100-100/(1+ag/al):100);
  if(i>=19){const w=cl.slice(i-19,i+1),mu=w.reduce((a,b)=>a+b)/20,sd=Math.sqrt(w.reduce((a,b)=>a+(b-mu)**2,0)/20);bu.push(mu+2*sd);bl.push(mu-2*sd)}else{bu.push(NaN);bl.push(NaN)}}
 return{e9,e21,e50,atr,rsi,bu,bl}}
const S=[["Trend EMA 9/21",(c,x,i)=>x.e9[i-1]<=x.e21[i-1]&&x.e9[i]>x.e21[i]&&c[i].c>x.e50[i]?1:x.e9[i-1]>=x.e21[i-1]&&x.e9[i]<x.e21[i]&&c[i].c<x.e50[i]?-1:0],
["Reversione RSI+Bollinger",(c,x,i)=>c[i].c<x.bl[i]&&x.rsi[i]<30?1:c[i].c>x.bu[i]&&x.rsi[i]>70?-1:0],
["Breakout range 20",(c,x,i)=>{let h=-1e99,l=1e99;for(let k=i-20;k<i;k++){h=Math.max(h,c[k].h);l=Math.min(l,c[k].l)}return c[i].c>h?1:c[i].c<l?-1:0}]];
function trade(c,x,i,d){const e=c[i].c,a=x.atr[i],sl=e-d*a,tp=e+d*1.5*a;
 for(let k=i+1;k<=i+60&&k<c.length;k++){const hs=d>0?c[k].l<=sl:c[k].h>=sl,ht=d>0?c[k].h>=tp:c[k].l<=tp;if(hs)return[-1,k,e,a];if(ht)return[1.5,k,e,a]}
 const k=Math.min(i+60,c.length-1);return[d*(c[k].c-e)/a,k,e,a]}
function backtest(c,x,f){const R=[],end=c.length-61;let i=55;
 while(i<end){const d=f(c,x,i);if(d){const[r,k,e,a]=trade(c,x,i,d);R.push(r-.0008*e/a);i=k+1}else i++}
 const n=R.length,mu=n?R.reduce((a,b)=>a+b)/n:0,sd=n>1?Math.sqrt(R.reduce((a,b)=>a+(b-mu)**2,0)/(n-1)):1,w=R.filter(r=>r>0).length;
 return{n,mu,p:n?w/n:0,score:n>=8?mu-sd/Math.sqrt(n):-9}}
function analyze(sym,raw){const price=raw[raw.length-1].c,c=raw.slice(0,-1),x=ind(c),last=c.length-1,bx=ind(c.slice(0,last-1));let best=null;
 S.forEach(s=>{const bt=backtest(c.slice(0,last-1),bx,s[1]);if(!best||bt.score>best.bt.score)best={name:s[0],bt,f:s[1]}});
 let d=0;for(let i=last;i>last-5&&!d;i--)if(Date.now()-c[i].t<=WIN)d=best.f(c,x,i);
 const a=x.atr[last];return{sym,price,name:best.name,bt:best.bt,d,sl:price-d*a,tp:price+d*1.5*a,ok:d&&best.bt.mu>=MINEXP&&best.bt.n>=8}}
async function push(title,body,pr){if(!TOPIC){console.log("NTFY_TOPIC mancante");return}
 await fetch("https://ntfy.sh/"+TOPIC,{method:"POST",body,headers:{Title:title,Priority:String(pr||4),Tags:"chart_with_upwards_trend"}})}
const out=[];for(const s of SY){try{out.push(analyze(s,await kl(s)))}catch(e){console.log(s,"errore",e.message)}}
const hits=out.filter(r=>r.ok);
for(const r of out)console.log(r.sym,r.d?(r.d>0?"BUY":"SELL"):"-",r.bt.n,(r.bt.p*100).toFixed(0)+"%",r.bt.mu.toFixed(2)+"R",r.ok?"<< ALERT":"");
for(const r of hits){const dec=r.price<1?4:r.price<100?3:2,f=v=>v.toFixed(dec);
 await push(`${r.sym} ${r.d>0?"ACQUISTA":"VENDI"} - prob ${(r.bt.p*100).toFixed(0)}%`,`${r.name}\nEntrata ${f(r.price)}\nStop loss ${f(r.sl)}\nTake profit ${f(r.tp)}\nAttesa ${r.bt.mu.toFixed(2)}R netto costi (${r.bt.n} op. backtest)\nChiudi entro 60 minuti. Stima statistica, non certezza.`)}
if(process.env.GITHUB_EVENT_NAME==="workflow_dispatch")await push("Test scanner",`Notifiche attive. Mercati analizzati: ${out.length}. Segnali ora: ${hits.length}.`,3);
