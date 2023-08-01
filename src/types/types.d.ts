import BigNumber from "bignumber.js";

export const ExchangeNames = ['coinbase', 'binance'] as const; 

export type ExchangeName = typeof ExchangeNames[number];

export type RedisPairValue = {
    price: BigNumber;
    time: Date
}