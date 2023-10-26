import "$std/dotenv/load.ts";
import { Some } from "monads";
import handler, { buildURL } from "~/main.ts";

export const env = {
  ENV_BOT_SECRET: Deno.env.get("ENV_BOT_SECRET")!,
  ENV_BOT_TOKEN: Deno.env.get("ENV_BOT_TOKEN")!,
  PASTEBIN_API_KEY: Deno.env.get("PASTEBIN_API_KEY")!,
};

export const getInfo = async () => {
  const url = buildURL("getWebHookInfo", Some({}), env);

  console.log(
    await (await fetch(url)).json(),
  );
};

export const deleteHook = async () => {
  const url = buildURL(
    "deleteWebHook",
    Some({ drop_pending_updates: true }),
    env,
  );

  console.log(
    await (await fetch(url)).json(),
  );
};

export const setHook = async (newUrl: string) => {
  const url = buildURL(
    "setWebHook",
    Some({
      url: newUrl,
      drop_pending_updates: true,
      secret_token: env.ENV_BOT_SECRET,
    }),
    env,
  );

  console.log(
    await (await fetch(url)).json(),
  );
};

await deleteHook();
await setHook("https://main.xdc-hawk.workers.dev/endpoint");
await getInfo();

await Deno.serve((req) => handler.fetch(req, env)).finished;
