import "$std/dotenv/load.ts";
import TelegramBot, { Update } from "telegram-types";
import { Err, None, Ok, Option, Some } from "monads";
import { Entries, EventMap, RouteMap } from "~/types.ts";

const WEBHOOK = "/endpoint";

const TOKEN = Deno.env.get("ENV_BOT_TOKEN");
const SECRET = Deno.env.get("ENV_BOT_SECRET");

const buildURL = <T extends keyof TelegramBot>(
  name: T,
  params: Option<Record<string, unknown>> = None,
) => {
  const result = params.match({
    some: (obj) =>
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(obj).map(([k, v]) => [k, `${v}`]),
        ),
      ).toString(),
    none: () => "",
  });
  return `https://api.telegram.org/bot${TOKEN}/${name}${result}`;
};

const send = async (url: string) => {
  const response = await fetch(url);
  const result = response.ok ? Ok(response) : Err(response.status);

  result.match({
    ok: () => void 0,
    err: (status) => console.error(`Error fetching ${url}: ${status}`),
  });
};

const events: EventMap = {
  update_id: () => void 0,
  message: async (msg) => {
    const url = buildURL(
      "sendMessage",
      Some({
        chat_id: msg.chat.id,
        text: `echo: ${msg.text}`,
      }),
    );

    await send(url);
  },
};

const entries = <T extends object>(obj: T) => Object.entries(obj) as Entries<T>;

const routes: RouteMap = {
  [WEBHOOK]: (r) => handleWebhook(r),
};

const getAuth = (headers: Headers): Option<string> => {
  const auth = headers.get("X-Telegram-Bot-Api-Secret-Token");
  return auth ? Some(auth) : None;
};

const execute = <T extends keyof EventMap>(
  { event, payload }: {
    event: T;
    payload: Parameters<NonNullable<EventMap[T]>>[0];
  },
) => {
  const result = events[event] ? Some(events[event]) : None;

  result.match({
    some: (fn) => fn(payload),
    none: () => console.error(`Handler for ${event} not found!`),
  });
};

const handleWebhook = async (request: Request): Promise<Response> => {
  const auth = getAuth(request.headers).unwrapOr("[NONE]");

  if (auth !== SECRET) {
    return new Response("Unauthorized", { status: 403 });
  }

  const update: Update = await request.json();

  const processable = entries(update).flatMap(([event, payload]) =>
    events[event]
      ? Ok({ event, payload })
      : Err(`Handler for ${event} not found!`)
  ).filter((entity) => entity.isOk()).flatMap((entity) => entity.unwrap());

  const result = await Promise.allSettled(processable.flatMap(execute));

  const errors = result.filter(({ status }) => status === "rejected");

  if (errors) {
    return new Response(JSON.stringify(errors), { status: 500 });
  }

  return new Response("OK", { status: 200 });
};

const getHandler = (path: string): Option<typeof routes[number]> => {
  const route = routes[path];
  return route ? Some(route) : None;
};

const handler: Deno.ServeHandler = async (request) => {
  const url = new URL(request.url);
  const result = getHandler(url.pathname);
  const fn = result.match({
    some: (func) => func,
    none: () => () => new Response("Not found", { status: 404 }),
  });

  return await fn(request);
};

Deno.serve(handler);
