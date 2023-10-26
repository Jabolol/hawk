import chart from "charts";
import { KucoinData } from "~/types.ts";
import { xdc } from "viem/chains?exports=xdc";
import { BlockNumber, BlockTag, createPublicClient, http } from "viem";

export const client = createPublicClient({
  chain: {
    ...xdc,
    rpcUrls: {
      default: { http: ["https://erpc.xinfin.network"] },
      public: { http: ["https://erpc.xinfin.network"] },
    },
  },
  transport: http(),
});

export const getBlockData = async (
  { from, to }: {
    from: BlockNumber | BlockTag;
    to: BlockNumber | BlockTag;
  },
) => {
  const logs = await client.getLogs({
    toBlock: to,
    fromBlock: from,
  });

  return JSON.stringify(
    logs,
    (_k, v) => typeof v === "bigint" ? v.toString() : v,
  );
};

export const createChart = (input: KucoinData) => {
  const myChart = new chart();

  const parsed = input.data.slice(0, 30).sort((a, b) => +a.price - +b.price);

  myChart.setConfig({
    type: "line",
    data: {
      labels: parsed.map(({ price }) => `${price}`),
      datasets: [
        {
          label: `XDC Spot tendency at ${
            new Date().toISOString().split("T")[1].split(".")[0]
          }`,
          data: parsed.map(({ size }) => `${size}`),
          fill: false,
          borderColor: "rgba(46, 76, 126, 1)",
          borderWidth: 1,
          tension: 0.4,
        },
      ],
    },
  });

  return myChart.getUrl();
};
