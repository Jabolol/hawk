/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="es2015" />
/// <reference lib="webworker" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />

import { Message, Update } from "telegram-types";

const WEBHOOK = "/endpoint";

// @ts-expect-error cloudflare workers env vars
const TOKEN = ENV_BOT_TOKEN;
// @ts-expect-error cloudflare workers env vars
const SECRET = ENV_BOT_SECRET;

addEventListener("fetch", (event) => {
  if (!(event instanceof FetchEvent)) {
    return;
  }

  const url = new URL(event.request.url);

  const routes = {
    [WEBHOOK]: () => handleWebhook(event),
  } as { [k: string]: () => Promise<Response> | Response };

  let handler = routes[url.pathname];
  handler ??= () => new Response("Not found", { status: 404 });

  return event.respondWith(handler());
});

// https://core.telegram.org/bots/api#update
async function handleWebhook(event: FetchEvent) {
  if (event.request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== SECRET) {
    return new Response("Unauthorized", { status: 403 });
  }

  event.waitUntil(onUpdate(await event.request.json()));

  return new Response("Ok");
}

// https://core.telegram.org/bots/api#update
async function onUpdate(update: Update) {
  if (update.message) {
    await onMessage(update.message);
  }
}

// https://core.telegram.org/bots/api#message
function onMessage(message: Message) {
  return sendPlainText(message.chat.id, "echo: " + message.text);
}

// https://core.telegram.org/bots/api#sendmessage
async function sendPlainText(chatId: number, text: string) {
  return (await fetch(
    apiUrl("sendMessage", { text, chat_id: chatId.toString() }),
  )).json();
}

function apiUrl(methodName: string, params?: { [k: string]: string }): string {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return `https://api.telegram.org/bot${TOKEN}/${methodName}${query}`;
}
