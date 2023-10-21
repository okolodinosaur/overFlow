const { WebsocketStream, Spot } = require("@binance/connector");
import amqp from "amqplib";

import { couples, synthetic } from "../couples.json";
import { IData } from "./types/index";

(async () => {
    try {
        const connection = await amqp.connect("amqp://admin:admin@localhost");
        const channel = await connection.createChannel();
        await channel.assertQueue("testQueue");
        channel.sendToQueue("testQueue", Buffer.from("hello world!!!"));
        await channel.close();
        await connection.close();
    } catch (error) {
        console.log(error);
    }
})();

const couplesMap: Map<string, IData> = new Map<string, IData>();
const timeRate: number = 10000;
let counter = 0;
const callbacks = {
    open: () => console.debug("Connected with Websocket server"),
    close: () => console.debug("Disconnected with Websocket server"),
    message: async (data: string) => {
        const prepare = JSON.parse(data) as { c: string; s: string; P: string };
        const payload: IData = {
            couple: prepare.s,
            price: prepare.c,
            counter: 5,
        };
        if (!couplesMap.has(payload.couple)) couplesMap.set(payload.couple, payload);
        const coupleData = couplesMap.get(payload.couple);
        if (coupleData.counter <= 0) {
            coupleData.price = prepare.c;
            coupleData.counter = 5;
            const priceIn48 = await getPriceIn48(client, coupleData.couple);
            coupleData.deltaIn48h = ((+coupleData.price - priceIn48) / priceIn48) * 100;
        }
        coupleData.counter--;
    },
};
const client = new Spot("", "", {
    baseURL: process.env.BASE_URL_API,
});
async function getSynthetic(couples: [string, string]): Promise<IData> {
    const coupleData0 = couplesMap.get(couples[0]);
    const coupleData1 = couplesMap.get(couples[1]);
    if (!coupleData0 || !coupleData1) return;
    try {
        const priceIn48h0 = await getPriceIn48(client, couples[0]);
        const priceIn48h1 = await getPriceIn48(client, couples[1]);
        const data: IData = {
            couple: couples[0] + "/" + couples[1],
            price: String(+coupleData0.price / +coupleData1.price),
            deltaIn48h:
                ((+coupleData0.price / +coupleData1.price - priceIn48h0 / priceIn48h1) /
                    (priceIn48h0 / priceIn48h1)) *
                100,
        };
        return data;
    } catch (error) {
        console.log(error);
        return;
    }
}

function getPriceIn48(client: any, couple: string): Promise<number> {
    return new Promise<number>((res, rej) => {
        client
            .klines(couple, "1s", {
                limit: 2,
                startTime: Date.now() - 86400000 * 2,
            })
            .then((response: { data: string[] }) => {
                res(+response.data[0][1]);
            })
            .catch((error: Error) => {
                client.logger.error(error.message);
                rej("error");
            });
    });
}

const websocketStreamClient = new WebsocketStream({ console, callbacks });
for (const couple of couples) {
    websocketStreamClient.ticker(couple.toLocaleLowerCase());
}

setInterval(async () => {
    if (counter == synthetic.length) counter = 0;
    const couples = synthetic[counter++];
    const data = await getSynthetic([couples[0], couples[1]]);
    if (!data) return;
    couplesMap.set(data.couple, data);
}, timeRate / synthetic.length);

setInterval(async () => {
    console.table([...couplesMap.values()], ["couple", "price", "deltaIn48h"]);
}, 2000);
