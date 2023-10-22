export interface IData {
    couple: string;
    price: number;
    delta?: IDelta[];
}

export interface IDelta {
    amountOfDay: number;
    value: number;
}
