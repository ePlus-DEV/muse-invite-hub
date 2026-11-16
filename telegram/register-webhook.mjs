import { commandsFor } from "./commands.mjs";
import { LOCALES } from "./i18n.mjs";

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
// Telegram chooses the BotFather slash-command menu by its own interface
// language; the in-chat /language preference is saved separately per chat.
for(const language of LOCALES) {
  const payload={
    commands:commandsFor(language),
    scope:{type:"all_private_chats"},
    ...(language==="en"?{}:{language_code:language})
  };
  const commandsResponse=await fetch("https://api.telegram.org/bot"+token+"/setMyCommands",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(15000)
  });
  if(!commandsResponse.ok)throw Error("Telegram command registration HTTP "+commandsResponse.status);
  const commandsResult=await commandsResponse.json();
  if(commandsResult.ok!==true)throw Error("Telegram rejected "+language+" bot commands");
}
console.log("Telegram webhook and localized private-chat commands registered:",endpoint);
