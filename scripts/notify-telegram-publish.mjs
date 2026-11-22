/* Trusted Pages workflow dispatches after verifying live production.
 * No user data or bot token is read by GitHub Actions.
 * Transient failures are retried with the SAME cursor; notification markers
 * in private bot storage keep successful deliveries idempotent.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { hmacSignature, NOTIFY_PATH } from "../telegram/notifications.mjs";

const RETRYABLE_HTTP=new Set([408,429,500,502,503,504]);
const MAX_ATTEMPTS=4;
const MAX_PAGES=500;
const DEFAULT_DELAY_MS=2000;
const delay=ms=>new Promise(done=>setTimeout(done,ms));

export async function reconcileTelegramNotifications({
  endpoint,secret,sha,fetchImpl=fetch,sleep=delay,logger=console
}) {
  if(!endpoint||!secret||!sha)
    throw Error("Notification URL, secret and deployed SHA are required");
  const url=new URL(endpoint);
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||
     url.pathname!==NOTIFY_PATH)
    throw Error("TELEGRAM_NOTIFY_URL must be a private HTTPS /telegram/notify endpoint");
  if(!/^[a-f0-9]{40}$/.test(sha))
    throw Error("DEPLOYED_SHA must be a 40-character Git commit SHA");

  let cursor=null;
  for(let pass=0;pass<MAX_PAGES;pass++){
    const body=JSON.stringify({event:"pages-published",sha,cursor});
    let response;
    for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
      // Regenerate the timestamp and HMAC on each attempt: the Worker rejects
      // signatures more than five minutes old.
      const timestamp=Date.now().toString();
      const signature=await hmacSignature(secret,timestamp,body);
      try {
        response=await fetchImpl(url,{
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "X-Muse-Notify-Timestamp":timestamp,
            "X-Muse-Notify-Signature":"sha256="+signature
          },
          body,signal:AbortSignal.timeout(30000)
        });
      }catch(error){
        const transient=error instanceof TypeError||
          error?.name==="AbortError"||error?.name==="TimeoutError";
        if(!transient||attempt===MAX_ATTEMPTS)
          throw new Error("Telegram notification request failed after attempt "+
            attempt+"/"+MAX_ATTEMPTS,{cause:error});
        logger.warn("Telegram notification network error; retrying page "+
          (pass+1)+" (attempt "+attempt+"/"+MAX_ATTEMPTS+").");
        await sleep(DEFAULT_DELAY_MS*2**(attempt-1));
        continue;
      }
      if(response.ok)break;
      const status=response.status;
      if(!RETRYABLE_HTTP.has(status)||attempt===MAX_ATTEMPTS)
        throw Error("Bot notification API HTTP "+status+
          " (page "+(pass+1)+", attempt "+attempt+"/"+MAX_ATTEMPTS+")");
      // Close the failed response before retrying to avoid unnecessary sockets.
      await response.body?.cancel().catch(()=>{});
      logger.warn("Bot notification API HTTP "+status+"; retrying page "+
        (pass+1)+" (attempt "+attempt+"/"+MAX_ATTEMPTS+").");
      await sleep(DEFAULT_DELAY_MS*2**(attempt-1));
    }

    const result=await response.json();
    if(result?.complete===true) {
      logger.info("Telegram publication notifications reconciled.");
      return {complete:true,pages:pass+1};
    }
    if(typeof result?.nextCursor!=="string"||!result.nextCursor||
       result.nextCursor===cursor)
      throw Error("Invalid notification continuation cursor");
    cursor=result.nextCursor;
  }
  throw Error("Telegram notification pagination exceeded safety limit");
}

// Importable for deterministic tests; only execute on direct CLI invocation.
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  await reconcileTelegramNotifications({
    endpoint:process.env.TELEGRAM_NOTIFY_URL,
    secret:process.env.TELEGRAM_NOTIFY_SECRET,
    sha:process.env.DEPLOYED_SHA
  });
}
