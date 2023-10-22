import { Spot, Interval } from "@binance/connector-typescript";
import amqp from "amqplib";

import { couples, synthetic } from "../couples.json";
import { IData, IDelta } from "./types/index";

// (async () => {
//     try {
//         const connection = await amqp.connect("amqp://admin:admin@localhost");
//         const channel = await connection.createChannel();
//         await channel.assertQueue("testQueue");
//         channel.sendToQueue("testQueue", Buffer.from("hello world!!!"));
//         await channel.close();
//         await connection.close();
//     } catch (error) {
//         console.log(error);
//     }
// })();

export class Core {
    couplesMap: Map<string, IData> = new Map<string, IData>();
    timeRate: number = 15000;
    periodOfDay: number = 10;
    spotClient: Spot = new Spot("", "", {
        baseURL: process.env.BASE_URL_API,
    });
    priceFetcher: NodeJS.Timeout;
    priceViewer: NodeJS.Timeout;

    constructor() {}

    getDelta(currentPrice: number, laterPrice: number): number {
        return ((currentPrice - laterPrice) / laterPrice) * 100;
    }

    async getLaterPrase(couple: string, amountOfDay: number): Promise<number> {
        return +(
            await this.spotClient.klineCandlestickData(couple, Interval["1s"], {
                limit: 2,
                startTime: Date.now() - 86400000 * amountOfDay,
            })
        )[0][1];
    }

    async getCurrentPrice(couple: string): Promise<number> {
        const priceTicker = await this.spotClient.symbolPriceTicker({ symbol: couple });
        return priceTicker instanceof Array ? +priceTicker[0].price : +priceTicker.price;
    }

    async init(): Promise<Core> {
        for (const couple of couples)
            this.couplesMap.set(couple, { couple, price: null, delta: [] });

        for (const couple of synthetic) {
            const coupleName = couple[0] + "/" + couple[1];
            this.couplesMap.set(coupleName, { couple: coupleName, price: null, delta: [] });
        }

        this.priceFetcher = setInterval(async () => {
            // set map
            for (const couple of this.couplesMap.keys()) {
                try {
                    if (couple.includes("/")) {
                        const [couple1, couple2] = couple.split("/");
                        const data: IData = {
                            couple,
                            price:
                                Math.round(
                                    ((await this.getCurrentPrice(couple1)) /
                                        (await this.getCurrentPrice(couple2))) *
                                        10000,
                                ) / 10000,
                        };
                        const delta: IDelta[] = [];
                        for (let i = 1; i < this.periodOfDay + 1; i++) {
                            delta.push({
                                amountOfDay: i,
                                value:
                                    Math.round(
                                        this.getDelta(
                                            data.price,
                                            (await this.getLaterPrase(couple1, i)) /
                                                (await this.getLaterPrase(couple2, i)),
                                        ) * 10000,
                                    ) / 10000,
                            });
                        }
                        data.delta = delta;
                        this.couplesMap.set(couple, data);
                        continue;
                    }

                    const data: IData = {
                        couple,
                        price: await this.getCurrentPrice(couple),
                    };
                    const delta: IDelta[] = [];
                    for (let i = 1; i < this.periodOfDay + 1; i++) {
                        delta.push({
                            amountOfDay: i,
                            value:
                                Math.round(
                                    this.getDelta(data.price, await this.getLaterPrase(couple, i)) *
                                        10000,
                                ) / 10000,
                        });
                    }
                    data.delta = delta;
                    this.couplesMap.set(couple, data);
                } catch (error) {
                    console.log(error);
                }
            }
        }, this.timeRate);

        return this;
    }

    initViewer() {
        this.priceViewer = setInterval(async () => {
            const printData: object[] = [];
            for (const data of this.couplesMap.values()) {
                const printItem: any = { couple: data.couple, price: data.price };
                for (const delta of data.delta) {
                    printItem[`dIn_${delta.amountOfDay}_d`] = delta.value;
                }
                printData.push(printItem);
            }
            console.table([...printData]);
        }, 2000);
    }
}
