import {sql} from "./neon";
import {broadcastInput,broadcastProvider,BROADCAST_PROVIDERS,type BroadcastConfig} from "./broadcast-rules";
import {seal,open,encryptionConfigured} from "./crypto/secretbox.server";
import {assertPublicHost} from "./safe-fetch.server";
import {registerBackgroundTask} from "./background-task.server";
import {signWebhook,SIGNATURE_HEADER} from "./webhooks/signature";
export async function saveBroadcast(owner:string,raw:BroadcastConfig){
 const data=broadcastInput.parse(raw);
 if(data.url){const u=new URL(data.url);if(u.protocol!=="https:"||u.username||u.password||u.port||!await assertPublicHost(u.hostname))throw new Error("unsafe_destination");}
 const provider=broadcastProvider(data.provider);const sealed=await seal(JSON.stringify(data),`omnicast:${owner}:${provider}`);
 await sql`insert into public.user_integrations(user_id,provider,handle,audience,visible,access_token_enc,access_token_iv,connection_status)
 values(${owner},${provider},${data.handle??data.provider},'both',false,${sealed.ciphertext},${sealed.iv},'connected')
 on conflict(user_id,provider) do update set access_token_enc=excluded.access_token_enc,access_token_iv=excluded.access_token_iv,connection_status='connected',visible=false`;
}
export async function myBroadcasts(owner:string){
 const rows=await sql`select provider,connection_status from public.user_integrations where user_id=${owner} and provider like 'omnicast_%'` as Record<string,unknown>[];
 return {ready:encryptionConfigured(),providers:rows.map(r=>({provider:String(r["provider"]).replace("omnicast_",""),connected:r["connection_status"]==="connected"}))};
}
export async function disconnectBroadcast(owner:string,provider:string){await sql`delete from public.user_integrations where user_id=${owner} and provider=${broadcastProvider(provider)}`;}
export async function enqueueBroadcast(owner:string,eventId:string,space:string,text:string){
 await sql`insert into public.presence_broadcast_jobs(user_id,event_id,space,provider,payload)
 select user_id,${eventId},${space},provider,${JSON.stringify({text:text.slice(0,4000)})}::jsonb from public.user_integrations
 where user_id=${owner} and provider like 'omnicast_%' and connection_status='connected'
 on conflict(user_id,event_id,provider) do nothing`;
 const task=deliverBroadcasts(owner).catch(e=>console.error("[omnicast] delivery failed",e instanceof Error?e.message:"error"));
 if(!registerBackgroundTask(task))await task;
}
async function send(config:BroadcastConfig,text:string,id:string):Promise<number>{
 let url="",body:unknown={},headers:Record<string,string>={"content-type":"application/json"};
 if(config.provider==="mastodon") {url=new URL("/api/v1/statuses",config.url).href;body={status:text};headers["authorization"]=`Bearer ${config.token}`;headers["Idempotency-Key"]=id;}
 else if(config.provider==="telegram"){url=`https://api.telegram.org/bot${encodeURIComponent(config.token)}/sendMessage`;body={chat_id:config.chatId,text};}
 else if(config.provider==="webhook"){url=config.url??"";const json=JSON.stringify({id,type:"status.published",data:{text}});headers[SIGNATURE_HEADER]=await signWebhook(config.token,json,Math.floor(Date.now()/1000));body=JSON.parse(json);}
 else {
  const login=await fetch("https://bsky.social/xrpc/com.atproto.server.createSession",{method:"POST",headers,body:JSON.stringify({identifier:config.handle,password:config.token}),signal:AbortSignal.timeout(10000)});
  if(!login.ok)return login.status;const session=await login.json() as {accessJwt:string;did:string};
  url="https://bsky.social/xrpc/com.atproto.repo.createRecord";headers["authorization"]=`Bearer ${session.accessJwt}`;body={repo:session.did,collection:"app.bsky.feed.post",record:{$type:"app.bsky.feed.post",text:[...text].slice(0,300).join(""),createdAt:new Date().toISOString()}};
 }
 const parsed=new URL(url);if(parsed.protocol!=="https:"||!await assertPublicHost(parsed.hostname))throw new Error("unsafe_destination");
 const res=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),redirect:"manual",signal:AbortSignal.timeout(10000)});
 return res.status;
}
export async function deliverBroadcasts(owner:string){
 const rows=await sql`update public.presence_broadcast_jobs set claimed_until=now()+interval '2 minutes',attempts=attempts+1
 where id in(select id from public.presence_broadcast_jobs where user_id=${owner} and delivered_at is null
 and attempts<5 and next_attempt_at<=now() and (claimed_until is null or claimed_until<now()) order by created_at limit 10 for update skip locked)
 returning *` as Record<string,unknown>[];
 for(const row of rows){
  const creds=await sql`select access_token_enc,access_token_iv from public.user_integrations where user_id=${owner} and provider=${String(row["provider"])} and connection_status='connected' limit 1` as Record<string,unknown>[];
  const cred=creds[0];if(!cred)continue;let status=0;
  try{const config=broadcastInput.parse(JSON.parse(await open(String(cred["access_token_enc"]),String(cred["access_token_iv"]),`omnicast:${owner}:${String(row["provider"])}`)));
   const payload=row["payload"] as {text:string};status=await send(config,payload.text,String(row["id"]));
  }catch{status=0;}
  // Ambiguous timeouts and providers without idempotency are not retried automatically.
  const retry=String(row["provider"])==="omnicast_mastodon" && status>=500;
  await sql`update public.presence_broadcast_jobs set last_status=${status},delivered_at=case when ${status} between 200 and 299 then now() else null end,
   claimed_until=null,next_attempt_at=now()+interval '5 minutes',attempts=case when ${retry} then attempts else 5 end where id=${String(row["id"])}`;
 }
 return {processed:rows.length};
}