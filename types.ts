import { Message, Update } from "telegram-types";

export type Entries<T> = [keyof T, NonNullable<T[keyof T]>][];

export type EventMap = {
  [k in keyof NonNullable<Update>]?: (
    payload: NonNullable<Update[k]>,
    env: WranglerEnv,
  ) => Promise<void> | void;
};

export type EventMapFunctions = EventMap[keyof EventMap];

export type RouteMap = Record<
  string,
  (r: Request, e: WranglerEnv) => Promise<Response> | Response
>;

export type WranglerEnv = {
  ENV_BOT_SECRET: string;
  ENV_BOT_TOKEN: string;
};

export type CommandMap = {
  [cmd: string]: (
    message: Message,
    args: string[],
    env: WranglerEnv,
  ) => Promise<void> | void;
};

export type MaybePromise<T> = T | Promise<T>;
