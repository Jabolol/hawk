/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="es2015" />
/// <reference lib="webworker" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />

import TelegramBot, { Update } from "telegram-types";
import { Err, None, Ok, Option, Some } from "monads";
import {
  Entries,
  EventMap,
  EventMapFunctions,
  RouteMap,
  WranglerEnv,
} from "~/types.ts";

const WEBHOOK = "/endpoint";

const buildURL = <T extends keyof TelegramBot>(
  name: T,
  params: Option<Record<string, unknown>> = None,
  env: WranglerEnv,
) => {
  const result = params.match({
    some: (obj) =>
      `?` +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(obj).map(([k, v]) => [k, `${v}`]),
        ),
      ).toString(),
    none: () => "",
  });
  return `https://api.telegram.org/bot${env.ENV_BOT_TOKEN}/${name}${result}`;
};

const send = async (url: string) => {
  const response = await fetch(url);
  const result = response.ok ? Ok(response) : Err(response.status);

  result.match({
    ok: () => console.log(`Fetched ${url} successfully`),
    err: (status) => console.log(`Error fetching ${url}: ${status}`),
  });
};

const events: EventMap = {
  update_id: () => void 0,
  message: async (msg, env) => {
    const url = buildURL(
      "sendMessage",
      Some({ chat_id: msg.chat.id, text: `echo: ${msg.text}` }),
      env,
    );

    await send(url);
  },
};

const entries = <T extends object>(obj: T) => Object.entries(obj) as Entries<T>;

const routes: RouteMap = {
  [WEBHOOK]: (r, e) => handleWebhook(r, e),
};

const getAuth = (headers: Headers): Option<string> => {
  const auth = headers.get("X-Telegram-Bot-Api-Secret-Token");
  return auth ? Some(auth) : None;
};

const getEvent = (
  event: keyof EventMap,
): Option<NonNullable<EventMapFunctions>> => {
  const fn = events[event];
  return fn ? Some(fn) : None;
};

const execute = async <T extends keyof EventMap>(
  { event, payload }: {
    event: T;
    payload: Parameters<NonNullable<EventMapFunctions>>[0];
  },
  env: WranglerEnv,
) => {
  const result = getEvent(event);

  const fn = result.match({
    some: (fn) => fn,
    none: () => () => console.log(`Handler for ${event} not found!`),
  });

  // @ts-ignore This is a 2 days project, I don't have time to fix this
  await fn(payload, env);
};

const handleWebhook = async (
  request: Request,
  env: WranglerEnv,
): Promise<Response> => {
  const auth = getAuth(request.headers).unwrapOr("[NONE]");

  if (auth !== env.ENV_BOT_SECRET) {
    return new Response("Unauthorized", { status: 403 });
  }

  const update: Update = await request.json();

  const processable = entries(update).flatMap(([event, payload]) =>
    events[event]
      ? Ok({ event, payload })
      : Err(`Handler for ${event} not found!`)
  ).filter((entity) => entity.isOk()).flatMap((entity) => entity.unwrap());

  const result = await Promise.allSettled(
    processable.flatMap((data) => execute(data, env)),
  );

  const errors = result.filter(({ status }) => status === "rejected");

  if (errors.length) {
    return new Response(JSON.stringify(errors), { status: 500 });
  }

  return new Response("OK", { status: 200 });
};

const getHandler = (path: string): Option<typeof routes[number]> => {
  const route = routes[path];
  return route ? Some(route) : None;
};

export default {
  async fetch(request: Request, env: WranglerEnv) {
    const url = new URL(request.url);
    const result = getHandler(url.pathname);
    const fn = result.match({
      some: (func) => func,
      none: () => () => new Response("Not found", { status: 404 }),
    });

    return await fn(request, env);
  },
};
