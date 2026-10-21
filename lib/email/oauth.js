import { assert, generateToken, hashString, seal, unseal, encode, utf8, verifyGoogleJwt, validateMailboxIdentity } from './security.js';
import { gmailScopes, GmailAdapter } from './gmail.js';
import { parseCookies, isAllowedAdmin } from '../../functions/api/forms/utils.js';
export const oauthCookie=(value,age=600)=>`tfm_email_oauth=${value}; HttpOnly; Secure; SameSite=Lax; Path=/api/email/oauth/callback; Max-Age=${age}`;
export async function initiateOAuth(service,session,mailboxId,env) {
 const m=await service.mailbox(mailboxId,'can_manage');
 const state=generateToken(),browser=generateToken(),verifier=generateToken(),nonce=generateToken();
 const secret=await seal({verifier,nonce},env,`oauth:${state}`);
 await service.store.write('email_oauth_states',{state_hash:await hashString(state),workspace_id:service.workspace,mailbox_id:m.id,user_email:service.user,session_id:session.id,browser_hash:await hashString(browser),secret,expires_at:new Date(Date.now()+600000).toISOString()});
 const challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8(verifier))));
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search=new URLSearchParams({client_id:env.EMAIL_GOOGLE_CLIENT_ID,redirect_uri:`${env.EMAIL_APP_ORIGIN}/api/email/oauth/callback`,response_type:'code',scope:gmailScopes.join(' '),access_type:'offline',prompt:'consent select_account',state,nonce,code_challenge:challenge,code_challenge_method:'S256',login_hint:m.address,hd:env.EMAIL_GOOGLE_HOSTED_DOMAIN}).toString();
 return {url:url.href,cookie:oauthCookie(browser)};
}
export async function finishOAuth(request,store,env,{fetcher=fetch,verify=verifyGoogleJwt,serviceFactory}={}) {
 const url=new URL(request.url),state=url.searchParams.get('state'),code=url.searchParams.get('code');
 const browser=parseCookies(request.headers.get('cookie')).tfm_email_oauth;
 assert(state&&state.length<256&&browser&&code&&code.length<4096,400,'Authorization expired or canceled. Reconnect from the dashboard.');
 const [s]=await store.rpc('email_take_state',{p_hash:await hashString(state),p_browser:await hashString(browser)});
 assert(s&&s.workspace_id===env.EMAIL_WORKSPACE_ID&&isAllowedAdmin(s.user_email,env),403,'Authorization expired. Reconnect from the dashboard.');
 const service=serviceFactory(store,s.workspace_id,s.user_email),m=await service.mailbox(s.mailbox_id,'can_manage');
 const {verifier,nonce}=await unseal(s.secret,env,`oauth:${state}`);
 const r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({code,client_id:env.EMAIL_GOOGLE_CLIENT_ID,client_secret:env.EMAIL_GOOGLE_CLIENT_SECRET,redirect_uri:`${env.EMAIL_APP_ORIGIN}/api/email/oauth/callback`,grant_type:'authorization_code',code_verifier:verifier}),signal:AbortSignal.timeout(15000)});
 assert(r.ok,400,'Google authorization failed. Reconnect from the dashboard.');
 const token=await r.json(),claims=await verify(token.id_token,env.EMAIL_GOOGLE_CLIENT_ID);
 validateMailboxIdentity(claims,m,env,nonce);
 assert(gmailScopes.filter(s=>s.startsWith('https:')).every(s=>(token.scope||'').split(' ').includes(s)),403,'Both Gmail read and send permissions are required.');
 assert(token.refresh_token,400,'Google did not issue offline access. Reconnect and approve access.');
 // Gmail profile confirms this is an actual Gmail primary mailbox, rather than an alias or Google Group.
 const profileResponse=await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(15000)});
 assert(profileResponse.ok && (await profileResponse.json()).emailAddress?.toLowerCase()===m.address,403,'Authorize the assigned primary Gmail mailbox.');
 const credential=await seal({refreshToken:token.refresh_token},env,`${m.workspace_id}:${m.id}`);
 await store.rpc('email_connection',{p_workspace:s.workspace_id,p_mailbox:m.id,p_user:s.user_email,p_credential:credential,p_subject:claims.sub});
 return true;
}
