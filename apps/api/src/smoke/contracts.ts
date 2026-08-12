import { createPorts } from '../config';
import { handle } from '../router';
const { ports, lines } = createPorts();
lines.forEach((line) => console.log(`  ${line}`));
const call = (method: string, path: string, options: any = {}) => handle({
  method,
  path,
  query: new URLSearchParams(options.q ?? ''),
  body: options.body,
  bearer: options.bearer ?? null,
}, ports);

async function run(): Promise<void> {
  if (!ports.store || !ports.session) {
    const missing = [!ports.store && 'store', !ports.session && 'session'].filter(Boolean);
    console.error(`\nBLOCKED — contract smoke requires configured ${missing.join(' + ')} ports.`);
    console.error('No fallback or mock was substituted. Configure the missing environment values and retry.');
    process.exitCode = 1;
    return;
  }

  // seed an account row directly, then exercise settings/unlock/daily with a real session
  const store: any = ports.store;
  const sess: any = ports.session;
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
  console.log(JSON.stringify(out, null, 1));
}

run().catch((cause: unknown) => {
  console.error('\nFAILED — contract smoke encountered an unexpected error.');
  console.error(cause instanceof Error ? cause.stack ?? cause.message : String(cause));
  process.exitCode = 1;
});
