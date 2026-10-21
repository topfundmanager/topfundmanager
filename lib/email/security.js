import { hashString, generateToken } from '../../functions/api/forms/utils.js';
export { hashString, generateToken };
export class MailError extends Error {
 constructor(status, message) { super(message); this.status = status; }
}
export const assert = (condition, status = 400, message = 'Invalid request.') => { if (!condition) throw new MailError(status, message); };
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const encode = bytes => {
 let s = ''; for (const b of bytes) s += String.fromCharCode(b);
 return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
export const decode = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
export const utf8 = s => new TextEncoder().encode(s);
export const text = bytes => new TextDecoder().decode(bytes);
export async function seal(value, env, context) {
 const key = await crypto.subtle.importKey('raw',decode(env.EMAIL_TOKEN_KEY || ''),'AES-GCM',false,['encrypt']);
 const iv = crypto.getRandomValues(new Uint8Array(12));
 const data = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8(context)},key,utf8(JSON.stringify(value)));
 return `v1.${encode(iv)}.${encode(new Uint8Array(data))}`;
}
export async function unseal(value, env, context) {
 const [version,iv,data] = value.split('.'); assert(version==='v1');
 const key = await crypto.subtle.importKey('raw',decode(env.EMAIL_TOKEN_KEY || ''),'AES-GCM',false,['decrypt']);
 return JSON.parse(text(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:utf8(context)},key,decode(data))));
}
let jwks;
export async function verifyGoogleJwt(token, audience, { fetcher = fetch, now = Date.now() } = {}) {
 assert(typeof token==='string' && token.length<16000,401,'Invalid Google identity.');
 const parts=token.split('.'); assert(parts.length===3,401,'Invalid Google identity.');
 const h=JSON.parse(text(decode(parts[0]))), c=JSON.parse(text(decode(parts[1])));
 assert(h.alg==='RS256' && typeof h.kid==='string',401,'Invalid Google identity.');
 if (!jwks || jwks.expires<now || !jwks.keys.some(k=>k.kid===h.kid)) {
  const r=await fetcher('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(15000)});
  assert(r.ok,503,'Google identity verification unavailable.');
  jwks={keys:(await r.json()).keys,expires:now+3600000};
 }
 const jwk=jwks.keys.find(k=>k.kid===h.kid); assert(jwk,401,'Invalid Google identity.');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 assert(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),utf8(`${parts[0]}.${parts[1]}`)),401,'Invalid Google identity.');
 assert(['https://accounts.google.com','accounts.google.com'].includes(c.iss) && c.aud===audience && c.exp>now/1000 && c.iat<=now/1000+60 && typeof c.sub==='string',401,'Invalid Google identity.');
 return c;
}
export function validateMailboxIdentity(claims, mailbox, env, nonce) {
 assert(claims.email_verified===true && claims.hd===env.EMAIL_GOOGLE_HOSTED_DOMAIN && !!env.EMAIL_GOOGLE_HOSTED_DOMAIN && claims.nonce===nonce && claims.email?.toLowerCase()===mailbox.address && (!mailbox.google_subject || claims.sub===mailbox.google_subject),403,'Authorize the assigned primary Workspace mailbox.');
}
export function mutationGuard(request, env) {
 assert(new URL(request.url).origin===env.EMAIL_APP_ORIGIN && request.headers.get('origin')===env.EMAIL_APP_ORIGIN && request.headers.get('x-email-csrf')==='1' && request.headers.get('content-type')?.startsWith('application/json'),403,'Request origin could not be verified.');
}
export async function limitedJson(request, max=100000) {
 assert(Number(request.headers.get('content-length')||0)<=max,413,'Request too large.');
 const reader=request.body?.getReader(); assert(reader,400);
 let size=0; const chunks=[];
 try { while(true) { const {value,done}=await reader.read(); if(done) break; size+=value.length; assert(size<=max,413,'Request too large.'); chunks.push(value); } }
 finally { await reader.cancel(); }
 const bytes=new Uint8Array(size); let offset=0; for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 return JSON.parse(text(bytes));
}
