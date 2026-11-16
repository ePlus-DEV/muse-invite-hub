/* Trusted Pages workflow dispatches after verifying live production.
 * No user data or bot token is read by GitHub Actions.
 */
import { hmacSignature, NOTIFY_PATH } from "../telegram/notifications.mjs";
const endpoint=process.env.TELEGRAM_NOTIFY_URL;
const secret=process.env.TELEGRAM_NOTIFY_SECRET;
const sha=process.env.DEPLOYED_SHA;
if(!endpoint||!secret||!sha)throw Error("Notification URL, secret and deployed SHA are required");
const url=new URL(endpoint);
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||
  url.pathname!==NOTIFY_PATH)throw Error("TELEGRAM_NOTIFY_URL must be a private HTTPS /telegram/notify endpoint");
let cursor=null;
for(let pass=0;pass<500;pass++){
  const body=JSON.stringify({event:"pages-published",sha,cursor});
  const timestamp=Date.now().toString();
  const signature=await hmacSignature(secret,timestamp,body);
  const response=await fetch(url,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "X-Muse-Notify-Timestamp":timestamp,
      "X-Muse-Notify-Signature":"sha256="+signature
    },
    body,signal:AbortSignal.timeout(30000)
  });
  if(!response.ok)throw Error("Bot notification API HTTP "+response.status);
  const result=await response.json();
  if(result.complete===true) {
    console.log("Telegram publication notifications reconciled.");
    process.exit(0);
  }
  if(typeof result.nextCursor!=="string"||!result.nextCursor||
    result.nextCursor===cursor)throw Error("Invalid notification continuation cursor");
  cursor=result.nextCursor;
}
throw Error("Telegram notification pagination exceeded safety limit");
