import { createPorts } from '../config';
import { handle } from '../router';
const { ports, lines } = createPorts();
lines.forEach(l=>console.log('  '+l));
const call=(m:string,p:string,o:any={})=>handle({method:m,path:p,query:new URLSearchParams(o.q??''),body:o.body,bearer:o.bearer??null},ports);
(async()=>{
  // seed an account row directly, then exercise settings/unlock/daily with a real session
  const store:any=ports.store!, sess:any=ports.session!;
  const a=await store.createAccount('apple-sub-'+Date.now());
  const {token}=await sess.issue(a.accountId);
  const out:any={};
  out['4 GET settings']=(await call('GET','/api/settings',{bearer:token})).envelope.state;
  const patched=await call('PATCH','/api/settings',{bearer:token,body:{fontScale:1.45,theme:'high-contrast'}});
  out['4 PATCH settings']=`${patched.envelope.state} rev=${(patched.envelope.data as any)?.revision}`;
  const reread=await call('GET','/api/settings',{bearer:token});
  out['4 persisted']=(reread.envelope.data as any)?.settings?.fontScale;
  out['9 unlock-status']=`${(await call('GET','/api/unlock-status',{bearer:token})).envelope.state}`;
  const d1=await call('POST','/api/retention/daily',{bearer:token,body:{localDate:'2026-08-11'}});
  out['12 claim day1']=`${d1.envelope.state} granted=${JSON.stringify((d1.envelope.data as any)?.granted)}`;
  const d1b=await call('POST','/api/retention/daily',{bearer:token,body:{localDate:'2026-08-11'}});
  out['12 double-claim']=`granted=${(d1b.envelope.data as any)?.granted}`;
  const d2=await call('POST','/api/retention/daily',{bearer:token,body:{localDate:'2026-08-12'}});
  out['12 day2 streak']=(d2.envelope.data as any)?.streakDays;
  out['10 analytics']=`${(await call('POST','/api/analytics/session',{body:{consent:true,boardsStarted:1,boardsCompleted:1,hintsUsed:0,totalSeconds:60,appVersion:'0.1.0',anonymousSessionId:'rotating-abcdef12'}})).envelope.state}`;
  out['8 receipts (must fail closed)']=`${(await call('POST','/api/receipts/validate',{body:{signedTransaction:'a.b.c'}})).envelope.error?.code}`;
  console.log(JSON.stringify(out,null,1));
})();
