/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="es2015" />
/// <reference lib="webworker" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />

import TelegramBot, { Update } from "telegram-types";
import { Err, None, Ok, Option, Result, Some } from "monads";
import {
  CommandMap,
  Entries,
  EventMap,
  EventMapFunctions,
  MaybePromise,
  RouteMap,
  WranglerEnv,
} from "~/types.ts";

const WEBHOOK = "/endpoint";

export const buildURL = <T extends keyof TelegramBot>(
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

const safeFetch = async (
  ...[input, init]: Parameters<typeof fetch>
): Promise<Result<Response, number>> => {
  const response = await fetch(input, init);

  return response.ok ? Ok(response) : Err(response.status);
};

const send = async (url: string) => {
  const result = await safeFetch(url);

  result.match({
    ok: () => console.log(`Fetched ${url} successfully`),
    err: (status) => console.log(`Error fetching ${url}: ${status}`),
  });
};

const sendMessage = async (
  { chat_id, text }: Record<string, unknown>,
  env: WranglerEnv,
) => await send(buildURL("sendMessage", Some({ chat_id, text }), env));

const commands: CommandMap = {
  nft: async (msg, args, env) => {
    const conditions:
      ((args: string[]) => MaybePromise<Result<boolean, string>>)[] = [
        ([add]) =>
          add.length === 43 ? Ok(true) : Err("Address must be 43 chars!"),
        ([add]) =>
          add.startsWith("xdc")
            ? Ok(true)
            : Err("Address must start with `xdc`"),
        ([, id]) => +id > 0 ? Ok(true) : Err("ID must be a positive number!"),
        async ([add, id]) =>
          (await safeFetch(
            `https://xdc.blocksscan.io/api/tokens/${add}/tokenID/${id}`,
          )).match<Result<boolean, string>>({
            ok: () => Ok(true),
            err: () => Err("Token does not exist!"),
          }),
      ];

    const errors = (await Promise.all(conditions.map((fn) => fn(args))))
      .filter((
        result,
      ) => result.isErr()).map((r) => `⚠️ ${r.err().unwrap()}`);

    if (errors.length) {
      return await sendMessage(
        { chat_id: msg.chat.id, text: errors[0] },
        env,
      );
    }

    return await sendMessage(
      { chat_id: msg.chat.id, text: "Not implemented" },
      env,
    );
  },
};

const events: EventMap = {
  update_id: () => void 0,
  message: async (msg, env) => {
    if (!msg.text) {
      return await sendMessage({
        chat_id: msg.chat.id,
        text: "How did you even do this?",
      }, env);
    }

    const split = msg.text.split(" ");

    const conditions: ((args: string[]) => Result<boolean, string>)[] = [
      (
        [cmd],
      ) => (cmd.slice(1) in commands
        ? Ok(true)
        : Err("The specified command does not exist")),
      ([cmd]) =>
        cmd.startsWith("/") ? Ok(true) : Err("The command must start with /"),
      (args) =>
        args.length > 1
          ? Ok(true)
          : Err("The command must have at least one argument"),
    ];

    const errors = conditions.map((fn) => fn(split)).filter((result) =>
      result.isErr()
    ).map(
      (r) => `⚠️ ${r.err().unwrap()}`,
    );

    if (errors.length) {
      return await sendMessage(
        { chat_id: msg.chat.id, text: errors[0] },
        env,
      );
    }

    const name = split[0].slice(1);

    await (commands[name])(msg, split.slice(1), env);
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
