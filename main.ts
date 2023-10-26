/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="es2015" />
/// <reference lib="webworker" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />

import TelegramBot, { Update } from "telegram-types";
import { Err, None, Ok, Option, Result, Some } from "monads";
import {
  AccountResponse,
  ChartData,
  CommandMap,
  Entries,
  EventMap,
  EventMapFunctions,
  InfoResponse,
  KucoinData,
  MaybePromise,
  NFTResponse,
  RouteMap,
  TokenResponse,
  WranglerEnv,
} from "~/types.ts";
import { createChart, getBlockData } from "~/utils.ts";

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
          Object.entries(obj).map((
            [k, v],
          ) => [k, typeof v === "object" ? JSON.stringify(v) : `${v}`]),
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

const dispatch = async (
  key: keyof TelegramBot,
  params: Record<string, unknown>,
  env: WranglerEnv,
) => await send(buildURL(key, Some(params), env));

const commands: CommandMap = {
  start: async (msg, _args, env) => {
    return await dispatch("sendMessage", {
      chat_id: msg.chat.id,
      text: `Hello, *${
        msg.from!.first_name
      }*! I am *hawk*, a bot that can help you with XinFin Network. Start typing \`/\` to check all my commands!\n\nBuilt with *Deno* and *Cloudflare Workers*. Open source at [github](https://github.com/Jabolol/hawk)\n`,
      parse_mode: "markdown",
    }, env);
  },
  help: async (msg, _args, env) => {
    const descriptions: { [k: string]: string } = {
      start: "*::* show the welcome message",
      help: " *::* show the full list of commands",
      nft: "`address` `id` *::* get NFT info",
      dump: "`from` `to` *::* save block data to pastebin",
      token: "`address` *::* get token info",
      balance: " *::* get XDC balance of an address",
      info: " *::* get XinFin Network info",
      graph: " *::* get XDC historical price data",
    };

    return await dispatch("sendMessage", {
      chat_id: msg.chat.id,
      text:
        `*Commands:*\nHere's a list with all of my commands and a short explanation.\n\n` +
        Object.keys(commands).map((cmd) => `- \`/${cmd}\` ${descriptions[cmd]}`)
          .join("\n"),
      parse_mode: "markdown",
    }, env);
  },
  nft: async (msg, args, env) => {
    if (args.length !== 2) {
      return await dispatch("sendMessage", {
        chat_id: msg.chat.id,
        text: "⚠️ Invalid arguments!",
        parse_mode: "markdown",
      }, env);
    }

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
      return await dispatch("sendMessage", {
        chat_id: msg.chat.id,
        text: errors[0],
        parse_mode: "markdown",
      }, env);
    }

    const [address, id] = args;

    const nft = await (await safeFetch(
      `https://xdc.blocksscan.io/api/tokens/${address}/tokenID/${id}`,
    )).unwrap().json() as NFTResponse;

    return await dispatch("sendPhoto", {
      chat_id: msg.chat.id,
      parse_mode: "markdown",
      photo: nft.tokenImage,
      caption:
        `*[${nft.tokenName}](${nft.tokenImage})*\n\`\`\`\n${nft.tokenDescription}\n\`\`\``,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "View on Blockscan",
              url:
                `https://xdc.blocksscan.io/api/tokens/${address}/tokenID/${id}`,
            },
          ],
        ],
      },
    }, env);
  },
  dump: async (msg, args, env) => {
    if (args.length !== 2) {
      return await dispatch("sendMessage", {
        chat_id: msg.chat.id,
        text: "⚠️ Invalid arguments!",
        parse_mode: "markdown",
      }, env);
    }

    const conditions:
      ((args: string[]) => MaybePromise<Result<boolean, string>>)[] = [
        ([, id]) => +id > 0 ? Ok(true) : Err("ID must be a positive number!"),
        ([from, to]) =>
          !isNaN(+from) && !isNaN(+to)
            ? Ok(true)
            : Err("Invalid block number!"),
        ([from, to]) =>
          +from <= +to ? Ok(true) : Err("From must be less than to!"),
        ([from, to]) =>
          +to - +from <= 1000 ? Ok(true) : Err("Difference must be <= 1000!"),
        ([from, to]) =>
          !(from === "latest" && to === "earliest")
            ? Ok(true)
            : Err("You do not want to query the whole blockchain, do you?"),
      ];

    const errors = (await Promise.all(conditions.map((fn) => fn(args))))
      .filter((
        result,
      ) => result.isErr()).map((r) => `⚠️ ${r.err().unwrap()}`);

    if (errors.length) {
      return await dispatch("sendMessage", {
        chat_id: msg.chat.id,
        text: errors[0],
        parse_mode: "markdown",
      }, env);
    }

    const [from, to] = args;

    const str = await getBlockData({
      from: from === "latest" ? "latest" : BigInt(+from),
      to: to === "earliest" ? "earliest" : BigInt(+to),
    });

    const result = await safeFetch("https://pastebin.com/api/api_post.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        api_option: "paste",
        api_paste_code: str,
        api_dev_key: env.PASTEBIN_API_KEY,
      }),
    });

    const fn = result.match<Promise<string>>({
      ok: async (res) => await res.text(),
      err: (status) => new Promise((r) => r(`⚠️ Error fetching: ${status}`)),
    });

    return await dispatch("sendMessage", {
      chat_id: msg.chat.id,
      text: await fn,
      parse_mode: "markdown",
    }, env);
  },
  token: async (msg, args, env) => {
    if (args.length !== 1) {
      return await dispatch("sendMessage", {
        chat_id: msg.chat.id,
        text: "⚠️ Invalid arguments!",
        parse_mode: "markdown",
      }, env);
    }

    const conditions:
      ((args: string[]) => MaybePromise<Result<boolean, string>>)[] = [
        ([add]) =>
          add.length === 43 ? Ok(true) : Err("Address must be 43 chars!"),
        ([add]) =>
          add.startsWith("xdc")
            ? Ok(true)
            : Err("Address must start with `xdc`"),
        async ([add]) =>
          (await safeFetch(
            `https://xdc.blocksscan.io/api/tokens/${add}`,
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
      return await dispatch("sendMessage", {
        chat_id: msg.chat.id,
        text: errors[0],
        parse_mode: "markdown",
      }, env);
    }

    const [address] = args;

    const token = await (await safeFetch(
      `https://xdc.blocksscan.io/api/tokens/${address}`,
    )).unwrap().json() as TokenResponse;

    return await dispatch("sendPhoto", {
      chat_id: msg.chat.id,
      parse_mode: "markdown",
      photo:
        `https://cdn.xinfinscan.com/tokens/${token.moreInfo.symbol.toLowerCase()}.png`,
      caption:
        `\`\`\`\n${`Token ${token.name} :: ${token.symbol}`}\n\`\`\`\n\`\`\`\n${`${
          token.moreInfo.description.length
            ? token.moreInfo.description.trim()
            : "No provided description"
        }`}\n\`\`\`\n\`\`\`md\n# Hash\n${token.hash}\n\`\`\`\n\`\`\`md\n# Website\n${token.moreInfo.website}\n\`\`\`\n\`\`\`md\n${
          [
            "# Socials",
            ...(Object.keys(token.moreInfo.communities) as Array<
              keyof typeof token.moreInfo.communities
            >).filter((h) => token.moreInfo.communities[h].includes("http"))
              .map((c) =>
                `- ${c}: ${token.moreInfo.communities[c].replaceAll("_", ":")}`
              ),
            "\n^ note: replace : with _ to get the correct link",
          ].join("\n")
        }\n\`\`\`\n\`\`\`md\n# Data:\n- ${token.priceUSD} USD\n- ${token.holderCount} holders\n- ${token.totalSupplyNumber} ${token.name}\n- ${token.transferCount} transfers\n- ${token.volume24h} ${token.moreInfo.symbol} vol 24h\n- created: ${token.createdAt}\n- updated: ${token.updatedAt}\n- type: ${token.type}\`\`\`\n\`\`\`md\n# Fluctuation\n- ${token.changePercent}% ${
          token.changePercent >= 0 ? "▲" : "▼"
        }\n\`\`\``,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "View on Blockscan",
              url: `https://xdc.blocksscan.io/api/tokens/${address}`,
            },
          ],
        ],
      },
    }, env);
  },
  balance: async (msg, args, env) => {
    if (args.length !== 1) {
      return await dispatch("sendMessage", {
        chat_id: msg.chat.id,
        text: "⚠️ Invalid arguments!",
        parse_mode: "markdown",
      }, env);
    }

    const conditions:
      ((args: string[]) => MaybePromise<Result<boolean, string>>)[] = [
        ([add]) =>
          add.length === 43 ? Ok(true) : Err("Address must be 43 chars!"),
        ([add]) =>
          add.startsWith("xdc")
            ? Ok(true)
            : Err("Address must start with `xdc`"),
        async ([add]) =>
          (await safeFetch(
            `https://xdc.blocksscan.io/api/tokens/${add}`,
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
      return await dispatch("sendMessage", {
        chat_id: msg.chat.id,
        text: errors[0],
        parse_mode: "markdown",
      }, env);
    }

    const [address] = args;

    const result = await (await safeFetch(
      `https://xdc.blocksscan.io/api/accounts/${address}`,
    )).unwrap().json() as AccountResponse;

    return await dispatch("sendMessage", {
      chat_id: msg.chat.id,
      text: `\`\`\`\n${result._id} :: ${
        (+result.balance).toFixed(6)
      } XDC\n\`\`\`\n\`\`\`md\n# Info\n- ${result.minedBlock} mined blocks\n- ${result.rewardCount} rewards\n- ${result.transactionCount} transactions\n- ${result.transactionToCount} trxs to\n- ${result.transactionFromCount} from\n\`\`\``,
      parse_mode: "markdown",
    }, env);
  },
  info: async (msg, _args, env) => {
    const result = await (await safeFetch(
      `https://xdc.blocksscan.io/api/setting/usd`,
    )).unwrap().json() as InfoResponse;

    return await dispatch("sendPhoto", {
      chat_id: msg.chat.id,
      caption:
        `\`\`\`\n${result.price} ${result.symbol} ≈ 1 USD\n\`\`\`\n\`\`\`md\n# Info\n- total supply: ${result.total_supply} ${result.symbol}\n- circulating supply: ${result.circulating_supply} ${result.symbol}\n- market cap: ${result.market_cap} USD\n- 24hr volume: ${result.volume_24h} ${result.symbol}\n\`\`\`\n\`\`\`md\n# Fluctuation\n- ${result.percent_change_24h}% ${
          +result.percent_change_24h >= 0 ? "▲" : "▼"
        }\n\`\`\``,
      photo:
        `https://www.cryptopolitan.com/wp-content/uploads/2022/09/XDC_FeatureImage_1661944505NiAvsuEsaX.jpg`,
      parse_mode: "markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "View on Blockscan",
              url: `https://xdc.blocksscan.io/`,
            },
          ],
        ],
      },
    }, env);
  },
  graph: async (msg, _args, env) => {
    const result = await (await safeFetch(
      `https://scanner.tradingview.com/symbol?symbol=KUCOIN:XDCUSDT&fields=price_52_week_high,price_52_week_low,sector,country,market,Low.1M,High.1M,Perf.W,Perf.1M,Perf.3M,Perf.6M,Perf.Y,Perf.YTD,Recommend.All,average_volume_10d_calc,average_volume_30d_calc,nav_discount_premium&no_404=true`,
    )).unwrap().json() as ChartData;

    const extra = await (await safeFetch(
      `https://api.kucoin.com/api/v1/market/histories?symbol=XDC-USDT`,
    )).unwrap().json() as KucoinData;

    return await dispatch("sendPhoto", {
      chat_id: msg.chat.id,
      caption: `\`\`\`md\n# Statistics\n- High 1M: ${
        result["High.1M"]
      }\n- Low 1M: ${result["Low.1M"]}\n- 1Y: ${result["Perf.Y"]} USD\n- 6M: ${
        result["Perf.6M"]
      } USD\n- 3M: ${result["Perf.3M"]}\n- 1M: ${result["Perf.1M"]}\n- 1W: ${
        result["Perf.W"]
      }\n\`\`\`\n\`\`\`md\n^ Real-time data provided by TradingView & KuCoin\n\`\`\``,
      photo: createChart(extra),
      parse_mode: "markdown",
    }, env);
  },
};

const events: EventMap = {
  message: async (msg, env) => {
    if (!msg.text) {
      return await dispatch("sendMessage", {
        chat_id: msg.chat.id,
        text: "How did you even do this?",
      }, env);
    }

    if (!msg.text.startsWith("/")) return;

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
        args.length > 0
          ? Ok(true)
          : Err("The command must have at least one argument"),
    ];

    const errors = conditions.map((fn) => fn(split)).filter((result) =>
      result.isErr()
    ).map(
      (r) => `⚠️ ${r.err().unwrap()}`,
    );

    if (errors.length) {
      return await dispatch("sendMessage", {
        chat_id: msg.chat.id,
        text: errors[0],
      }, env);
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

  // @ts-ignore Trust me, it's fine
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
