/* Run manually AFTER Caddy HTTPS is reachable:
 * docker compose exec -T telegram-bot node telegram/register-webhook.mjs
 */
const token=process.env.TELEGRAM_BOT_TOKEN;
const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
const domain=process.env.BOT_DOMAIN;
if(!token||!secret||!domain||
  !/^[A-Za-z0-9.-]+$/.test(domain)||domain.startsWith("-")||domain.endsWith(".")){
  throw Error("Missing Telegram bot credentials, webhook secret or valid BOT_DOMAIN");
}
const endpoint="https://"+domain+"/telegram/webhook";
const response=await fetch("https://api.telegram.org/bot"+token+"/setWebhook",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({
    url:endpoint,secret_token:secret,max_connections:1,
    allowed_updates:["message","callback_query"],
    drop_pending_updates:false
  }),
  signal:AbortSignal.timeout(15000)
});
if(!response.ok)throw Error("Telegram webhook registration HTTP "+response.status);
const result=await response.json();
if(result.ok!==true)throw Error("Telegram rejected webhook registration");
console.log("Telegram webhook registered:",endpoint);
