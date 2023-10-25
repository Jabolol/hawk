import { Update } from "telegram-types";

export type Entries<T> = [keyof T, NonNullable<T[keyof T]>][];

export type EventMap = {
  [k in keyof NonNullable<Update>]?: (
    payload: NonNullable<Update[k]>,
  ) => Promise<void> | void;
};

export type RouteMap = Record<
  string,
  (r: Request) => Promise<Response> | Response
>;
