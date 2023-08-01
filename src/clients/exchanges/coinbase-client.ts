import axios from 'axios';
import _ from 'lodash';
import { ExchangeClient } from './exchange-client';
import { Service } from 'typedi';
import config from 'config';
import { HmacSHA256 } from 'crypto-js';
import BigNumber from 'bignumber.js';
import { ProductBookResponse } from '../../types/coinbase-types';
import CoinbasePro from 'coinbase-pro-node';

type CoinbaseCurrency = {
    id: 'ETH';
    name: 'Ether';
    min_size: number;
    status: 'online' | 'delisted';
    details: {
        min_withdrawal_amount: number;
        max_withdrawal_amount: number;
    };
    supported_networks: {
        id: string;
        name: string;
        min_withdrawal_amount: number;
        max_withdrawal_amount: number;
    }[];
};

interface Product {
    base_currency_id: string;
    is_disabled: boolean;
    price: string;
    product_id: string;
    product_type: string;
    quote_currency_id: string;
    status: string;
    trading_disabled: boolean;
    view_only: boolean;
    volume_24h: string;
}

//https://docs.cloud.coinbase.com/exchange/reference
// https://docs.cloud.coinbase.com/advanced-trade-api/docs/rest-api-pro-mapping
@Service()
export class CoinbaseClient extends ExchangeClient {
    static sign(timestamp: string, method: string, path: string, body: string) {
        const hash = HmacSHA256(timestamp + method + path + body, config.get('exchanges.coinbase.apiSecret'));
        return hash.toString();
    }

    baseUrl = 'https://api.coinbase.com';
    coinbaseProClient: CoinbasePro;

    constructor() {
        super('coinbase');
        this.coinbaseProClient = new CoinbasePro({
            apiKey: config.get('exchanges.coinbase.coinbase-pro.apiKey'),
            apiSecret: config.get('exchanges.coinbase.coinbase-pro.apiSecret'),
            passphrase: config.get('exchanges.coinbase.coinbase-pro.passphrase'),
            useSandbox: false
        });
    }

    private async get(relativePath: string, basePath?: string, signedRequest: boolean = false) {
        if (!basePath) basePath = this.baseUrl;

        const timestamp = Math.floor(new Date().getTime() / 1000).toString();

        try {
            let response;
            if (signedRequest)
                response = await axios.get<{ products: Product[] }>(this.baseUrl + relativePath, {
                    headers: {
                        'CB-ACCESS-KEY': config.get<string>('exchanges.coinbase.apiKey'),
                        'CB-ACCESS-SIGN': CoinbaseClient.sign(timestamp, 'GET', relativePath, ''),
                        'CB-ACCESS-TIMESTAMP': timestamp
                    }
                });
            else response = await axios.get(basePath + relativePath);

            if (response.status !== 200) throw new Error(`Fail in GET request.`);

            const data = response.data;

            return data;
        } catch (e) {
            console.log(e);

            throw e;
        }
    }

    async getAllCurrencies() {
        let data = (await this.get('/currencies', 'https://api.exchange.coinbase.com', false)) as CoinbaseCurrency[];

        return data.filter((currency) => currency.status === 'online');
    }

    async getAllOrders() {
        this.log.info(`Getting fees rates.`);

        const basepath = 'https://api.exchange.coinbase.com';
        const relativePath = '/orders';

        return await this.get(relativePath, basepath, true);
    }

    async getAllPairs(): Promise<string[]> {
        const allProducts = await this.getAllProducts({ filterVolume24: false });

        return _.map(allProducts, 'product_id');
    }

    async getAllProducts(options: { filterVolume24?: boolean } = {}): Promise<Product[]> {
        this.log.info('Getting all Coinbase pairs.');

        const data = await this.get('/api/v3/brokerage/products', undefined, true);

        let products = data.products.filter((p: any) => p.trading_disabled === false && p.status === 'online' && p.is_disabled === false);

        this.log.info(`Received ${products.length} active pairs`);

        if (options?.filterVolume24) {
            const minimumVolume = new BigNumber(config.get<number>('collector.min24hVolume'));

            products = products.filter((p: any) => {
                const baseAssetVolume24 = new BigNumber(p.volume_24h);
                const quoteAssetVolume24 = baseAssetVolume24.multipliedBy(p.price);

                if (['USDT', 'USD'].includes(p.quote_currency_id)) return baseAssetVolume24.multipliedBy(p.price).isGreaterThanOrEqualTo(minimumVolume);

                let quoteToUsd = products.find((p1: any) =>
                    [`${p.quote_currency_id}-USD`, `${p.quote_currency_id}-USDT`, `${p.quote_currency_id}-USDC`].includes(p1.product_id)
                );
                if (quoteToUsd && quoteToUsd.price)
                    return quoteAssetVolume24.multipliedBy(new BigNumber(quoteToUsd.price)).isGreaterThanOrEqualTo(minimumVolume);

                quoteToUsd = products.find((p1: any) =>
                    [`USD-${p.quote_currency_id}`, `USDT-${p.quote_currency_id}`, `USDC-${p.quote_currency_id}`].includes(p1.product_id)
                );
                if (quoteToUsd && quoteToUsd.price) return quoteAssetVolume24.dividedBy(new BigNumber(quoteToUsd.price)).isGreaterThanOrEqualTo(minimumVolume);

                throw new Error('Cannot convert to USD');
            });

            this.log.info(`Filtered pairs by volume to ${products.length} pairs`);
        }

        return products;
    }

    getConfigFee = (pair: string) => {
        const fees = config.get<{ maker: number; taker: number }>(`fees.${this.name}`);
        return { makerFee: fees.maker, takerFee: fees.taker };
    };

    async getFeeEstimateForCryptoWithdrawal(currency: string, crypto_address: string, network: string) {
        return this.coinbaseProClient.rest.withdraw.getFeeEstimate(currency, crypto_address);
    }

    async getExchangeFees(pair: string): Promise<{ makerFee: number; takerFee: number }> {
        const response = await this.coinbaseProClient.rest.fee.getCurrentFees();

        return { makerFee: parseFloat(response.maker_fee_rate), takerFee: parseFloat(response.taker_fee_rate) };
    }

    async getNetworks() {
        try {
            const response = await axios.post(this.baseUrl, { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
            console.log(response.data);
        } catch (e) {
            console.log(e);
            throw e;
        }
    }

    async getProduct(productId: string) {
        this.log.info(`Getting pair ${productId}.`);

        return await this.get(`/api/v3/brokerage/products/${productId}`, undefined, true);
    }

    async getProductBook(productId: string, level: '1' | '2' | '3' = '1'): Promise<ProductBookResponse> {
        this.log.info(`Getting product book ${productId}.`);

        const basepath = 'https://api.exchange.coinbase.com';
        const relativePath = `/products/${productId}/book?level=${level}`;

        return (await this.get(relativePath, basepath, false)) as ProductBookResponse;
    }
}