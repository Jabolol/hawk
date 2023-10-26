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
  PASTEBIN_API_KEY: string;
};

export type CommandMap = {
  [cmd: string]: (
    message: Message,
    args: string[],
    env: WranglerEnv,
  ) => Promise<void> | void;
};

export type MaybePromise<T> = T | Promise<T>;

export type NFTResponse = {
  _id: string;
  token: string;
  tokenId: number;
  createdAt: string;
  holder: string;
  updatedAt: string;
  tokenData: {
    tokenData: string;
    TokenURIInfo: string;
    name: string;
    description: string;
    image: string;
  };
  tokenDescription: string;
  tokenImage: string;
  tokenName: string;
  tokenURI: string;
  id: string;
};

export type TokenResponse = {
  circulatingSupply: string;
  circulatingSupplyNumber: number;
  txCount: number;
  holderCount: number;
  coingeckoID: string;
  priceUSD: number;
  changePercent: number;
  volume24h: number;
  martketCap: number;
  status: boolean;
  hash: string;
  createdAt: string;
  updatedAt: string;
  decimals: number;
  isMintable: boolean;
  name: string;
  symbol: string;
  totalSupply: string;
  totalSupplyNumber: string;
  type: string;
  isPhising: boolean;
  isVerified: boolean;
  isWrappedToken: boolean;
  moreInfo: {
    symbol: string;
    name: string;
    description: string;
    website: string;
    communities: {
      email: string;
      telegram: string;
      reddit: string;
      medium: string;
      youtube: string;
      twitter: string;
      facebook: string;
      github: string;
      coinmarketcap: string;
      coingecko: string;
    };
  };
  transferCount: number;
};

export type AccountResponse = {
  minedBlock: number;
  rewardCount: number;
  logCount: number;
  transactionCount: number;
  transactionFromCount: number;
  transactionToCount: number;
  status: boolean;
  _id: string;
  hash: string;
  balance: string;
  balanceNumber: number;
  code: string;
  createdAt: string;
  isToken: boolean;
  updatedAt: string;
  fromTxn: unknown;
  token: unknown;
  contract: unknown;
  hasXrc20: boolean;
  hasNft1155: boolean;
  hasXrc721: boolean;
  accountName: unknown;
};

export type InfoResponse = {
  price: string;
  percent_change_24h: string;
  market_cap: number;
  volume_24h: string;
  cmc_rank: number;
  name: string;
  symbol: string;
  hidePrice: boolean;
  total_supply: number;
  circulating_supply: number;
  fully_diluted_market_cap: number;
  getTPS: number;
};

export type ChartData = {
  "High.1M": number;
  "Low.1M": number;
  "Perf.1M": number;
  "Perf.3M": number;
  "Perf.6M": number;
  "Perf.W": number;
  "Perf.Y": number;
  "Perf.YTD": number;
  "Recommend.All": number;
  average_volume_10d_calc: number;
  average_volume_30d_calc: number;
  country: unknown;
  market: string;
  nav_discount_premium: unknown;
  price_52_week_high: number;
  price_52_week_low: number;
  sector: unknown;
};

export type KucoinData = {
  code: string;
  data: Array<{
    sequence: string;
    price: string;
    size: string;
    side: string;
    time: number;
  }>;
};
