const { WebsocketStream, Spot } = require("@binance/connector");

import { IData } from "./types";
import { couples, synthetic } from "../couples.json";

export class TradeCore {
    timeRate: number;
    couplesMap: Map<string, IData> = new Map<string, IData>();
    spotClient = new Spot("", "", {
        baseURL: process.env.BASE_URL_API,
    });
    websocketStreamClient: any;

    constructor() {
        const wsCallbacks = {
            open: () => console.debug("Connected with Websocket server"),
            close: () => console.debug("Disconnected with Websocket server"),
            message: async (data: string) => {
                console.log(11111111);
                const prepare = JSON.parse(data) as { c: string; s: string; P: string };
                const payload: IData = {
                    couple: prepare.s,
                    price: prepare.c,
                    counter: 5,
                };
                if (!this.couplesMap.has(payload.couple))
                    this.couplesMap.set(payload.couple, payload);
                const coupleData = this.couplesMap.get(payload.couple);

                if (coupleData.counter <= 0) {
                    coupleData.price = prepare.c;
                    coupleData.counter = 5;
                    const priceIn48 = await this.getPriceIn48(coupleData.couple);
                    coupleData.deltaIn48h = ((+coupleData.price - priceIn48) / priceIn48) * 100;
                }
                coupleData.counter--;
            },
        };
        this.websocketStreamClient = new WebsocketStream({ console, wsCallbacks });
    }

    async getPriceIn48(couple: string) {
        return new Promise<number>((res, rej) => {
            this.spotClient
                .klines(couple, "1s", {
                    limit: 2,
                    startTime: Date.now() - 86400000 * 2,
                })
                .then((response: { data: string[] }) => {
                    res(+response.data[0][1]);
                })
                .catch((error: Error) => {
                    this.spotClient.logger.error(error.message);
                    rej("error");
                });
        });
    }
    async getSynthetic(couples: [string, string]): Promise<IData> {
        const coupleData0 = this.couplesMap.get(couples[0]);
        const coupleData1 = this.couplesMap.get(couples[1]);
        if (!coupleData0 || !coupleData1) return;
        try {
            const priceIn48h0 = await this.getPriceIn48(couples[0]);
            const priceIn48h1 = await this.getPriceIn48(couples[1]);

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
    init() {
        for (const couple of couples) {
            this.websocketStreamClient.ticker(couple.toLocaleLowerCase());
        }

        setInterval(async () => {
            for (const couples of synthetic) {
                const data = await this.getSynthetic([couples[0], couples[1]]);
                if (!data) continue;
                this.couplesMap.set(data.couple, data);
            }
            console.table([...this.couplesMap.values()], ["couple", "price", "deltaIn48h"]);
        }, 2000);
    }
}
