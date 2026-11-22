import test from "node:test";
import assert from "node:assert/strict";
import { reconcileTelegramNotifications } from "./notify-telegram-publish.mjs";
import { parseSignedEvent } from "../telegram/notifications.mjs";

const endpoint="https://bot.example.com/telegram/notify";
const secret="0123456789abcdef0123456789abcdef0123456789abcdef";
const sha="a".repeat(40);
const noop=async()=>{};
const logger={warn:()=>{},info:()=>{}};
const settings={endpoint,secret,sha,sleep:noop,logger};

test("HTTP 503 retries keep a valid signature and the same cursor",async()=>{
  const seen=[];
  const fetchImpl=async(url,options)=>{
    assert.equal(url.toString(),endpoint);
    const event=await parseSignedEvent(new Request(endpoint,{
      method:options.method,headers:options.headers,body:options.body
    }),secret);
    assert.deepEqual(event,{sha,cursor:undefined});
    seen.push(JSON.parse(options.body));
    return seen.length<3
      ? new Response("retry",{status:503})
      : Response.json({complete:true});
  };
  const result=await reconcileTelegramNotifications({...settings,fetchImpl});
  assert.deepEqual(result,{complete:true,pages:1});
  assert.equal(seen.length,3);
  assert.deepEqual(seen.map(item=>item.cursor),[null,null,null]);
});

test("pagination retries only the failing page without skipping subscribers",async()=>{
  const seen=[];
  const fetchImpl=async(_url,options)=>{
    seen.push(JSON.parse(options.body).cursor);
    if(seen.length===1)return Response.json({complete:false,nextCursor:"opaque-page-2"});
    if(seen.length===2)return new Response("retry",{status:503});
    return Response.json({complete:true});
  };
  const result=await reconcileTelegramNotifications({...settings,fetchImpl});
  assert.deepEqual(result,{complete:true,pages:2});
  assert.deepEqual(seen,[null,"opaque-page-2","opaque-page-2"]);
});

test("persistent 503 reports failure after bounded retry attempts",async()=>{
  let attempts=0;
  await assert.rejects(()=>reconcileTelegramNotifications({
    ...settings,fetchImpl:async()=>{attempts++;return new Response("retry",{status:503});}
  }),/Bot notification API HTTP 503 \(page 1, attempt 4\/4\)/);
  assert.equal(attempts,4);
});

test("HTTP 403 is a configuration problem and never retries",async()=>{
  let attempts=0;
  await assert.rejects(()=>reconcileTelegramNotifications({
    ...settings,fetchImpl:async()=>{attempts++;return new Response("forbidden",{status:403});}
  }),/Bot notification API HTTP 403/);
  assert.equal(attempts,1);
});

test("transient fetch timeouts retry the same signed event",async()=>{
  let attempts=0;
  const result=await reconcileTelegramNotifications({...settings,fetchImpl:async()=>{
    attempts++;
    if(attempts===1)throw new DOMException("timeout","TimeoutError");
    return Response.json({complete:true});
  }});
  assert.equal(attempts,2);
  assert.equal(result.complete,true);
});

test("missing credentials and invalid continuation cursor fail closed",async()=>{
  await assert.rejects(()=>reconcileTelegramNotifications({
    ...settings,secret:""
  }),/secret and deployed SHA are required/);
  await assert.rejects(()=>reconcileTelegramNotifications({
    ...settings,fetchImpl:async()=>Response.json({complete:false,nextCursor:""})
  }),/Invalid notification continuation cursor/);
});
