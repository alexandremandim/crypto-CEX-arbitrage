import axios from 'axios';
import _ from 'lodash';
import { ExchangeClient } from './exchange-client';
import { Service } from 'typedi';
import config from 'config';
import fs from 'fs';
const { Spot } = require('@binance/connector');
import { Asset } from '../../types/binance-types';
import BigNumber from 'bignumber.js';

type TradingPair = {
    isSpotTradingAllowed: boolean;
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
};

const API_KEY = config.get<string>('exchanges.binance.apiKey');

// https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md
@Service()
export class BinanceClient extends ExchangeClient {
    spotClient;

    constructor() {
        super('binance');

        const privateKey = fs.readFileSync('/Users/alexandresilva/.ssh/id_rsa_binance');
        this.spotClient = new Spot(API_KEY, '', { privateKey, privateKeyPassphrase: '' });
    }

    async getAllPairs() {
        this.log.info('Getting all Binance pairs.');

        const minimumVolume = new BigNumber(config.get<number>('collector.min24hVolume'));
        const response = await axios.get('https://api.binance.com/api/v3/exchangeInfo');

        if (response.status !== 200) {
            this.log.error('Fail to get Binance pairs');
            throw new Error('Fail to get Binance pairs');
        }

        const responseData = response.data.symbols as TradingPair[];

        const symbols = _.filter(responseData, (symbol) => symbol.isSpotTradingAllowed && symbol.status === 'TRADING');

        this.log.info(`Received ${symbols.length} active pairs`);

        let allSymbols = symbols.map((symbol: TradingPair) => `${symbol.baseAsset}-${symbol.quoteAsset}`);

        this.log.info(`Getting all Binance tickers (to get the volumes).`);

        let ticker24 = await this.spotClient.ticker24hr();

        if (ticker24.status !== 200) throw new Error('Fail to get Binance tickers');

        allSymbols = allSymbols.filter((s) => {
            const [baseAsset, quoteAsset] = s.split('-');
            const ticker = ticker24.data.find((t: any) => t.symbol === `${baseAsset}${quoteAsset}`);

            if (!ticker) throw new Error();

            const baseAssetVolume = new BigNumber(ticker.volume);
            const quoteAssetVolume = new BigNumber(ticker.lastPrice).multipliedBy(baseAssetVolume);

            const usdCurrencies = ['USDT', 'USDC', 'DAI', 'BUSD'];
            if (usdCurrencies.includes(baseAsset)) return baseAssetVolume.gte(minimumVolume);
            if (usdCurrencies.includes(quoteAsset)) return quoteAssetVolume.gte(minimumVolume);

            // Convert to USD
            let quoteToUsd = ticker24.data.find((t: any) => usdCurrencies.map((c) => `${quoteAsset}${c}`).includes(t.symbol));
            if (quoteToUsd && quoteToUsd.lastPrice)
                return quoteAssetVolume.multipliedBy(new BigNumber(quoteToUsd.lastPrice)).isGreaterThanOrEqualTo(minimumVolume);
            quoteToUsd = ticker24.data.find((t: any) => usdCurrencies.map((c) => `${c}${quoteAsset}`).includes(t.symbol));
            if (quoteToUsd && quoteToUsd.lastPrice)
                return quoteAssetVolume.dividedBy(new BigNumber(quoteToUsd.lastPrice)).isGreaterThanOrEqualTo(minimumVolume);

            throw new Error('Cannot convert to USD');
        });

        this.log.info(`Filtered pairs by volume to ${allSymbols.length} pairs`);

        return allSymbols;
    }

    async getAssets() {
        try {
            this.log.info('Getting all Binance assets.');
            const response = await this.spotClient.coinInfo();
            if (response.status !== 200) throw new Error('Fail to get Binance assets.');
            const assets = response.data as Asset[];

            const products = assets.filter((a) => a.trading && a.withdrawAllEnable && a.depositAllEnable);

            this.log.info(`Received ${products.length} active assets.`);

            return products;
        } catch (e) {
            this.log.error('Fail to get Binance assets.');
            throw e;
        }
    }

    getConfigFee = (pair: string) => {
        const c = config.get< { symbol: string; 'makerCommission': string; 'takerCommission': string; }[] >(`fees.${this.name}`);
        const binancePair = pairToBinanceFormat(pair);

        const fee = c.find(f => f.symbol === binancePair);

        if (!fee) throw new Error('Cannot find fee in config.');

        return {makerFee: parseFloat(fee.makerCommission), takerFee: parseFloat(fee.takerCommission)}
    };

    async getExchangeFees(pair: string): Promise<{ makerFee: number; takerFee: number }> {
        const fee = await this.spotClient.signRequest('GET', '/sapi/v1/asset/tradeFee', { symbol: pairToBinanceFormat(pair) });

        if (fee.status !== '200' || fee?.data?.length < 1) throw new Error('Unable to get binance fee.');

        return { makerFee: parseFloat(fee[0].makerCommission), takerFee: parseFloat(fee[0].takerCommision) };
    }
}

export function pairToBinanceFormat(pair: string) {
    return pair.replace('-', '').toUpperCase();
}

export function pairFromBinanceFormat(pair: string) {
    const allPairs = config.get<string[]>('collectors.binance');
    const equalPairs = allPairs.filter((p) => pair === pairToBinanceFormat(p));

    if (!equalPairs.length) throw new Error(`Pair not found ${pair}`);

    if (equalPairs.length > 1) throw new Error(`Ambiguous pair found ${pair}`);

    return equalPairs[0];
}
