import _ from 'lodash';
import { ExchangeCollector, checkIfOrderBooksAreEqual } from './exchange-collector';
import config from 'config';
import BigNumber from 'bignumber.js';
import { pairFromBinanceFormat, pairToBinanceFormat } from '../../clients/exchanges/binance-client';

const WS_API_URL = config.get<string>('exchanges.binance.wsApiUrl');

type BookStream = {
    u: number; // order book updateId
    s: string; // symbol
    b: string; // best bid price
    B: string; // best bid qty
    a: string; // best ask price
    A: string; // best ask qty
};

export class BinanceCollector extends ExchangeCollector {

    binancePairs: { [key: string]: string } = {};
    streams: string[];

    constructor(pairs: string[]) {
        const streams = pairs.map((pair) => `${pairToBinanceFormat(pair).toLowerCase()}@bookTicker`);

        super('binance', pairs, `${WS_API_URL}/stream?streams=${streams.join('/')}`);

        this.streams = streams;

        for (const pair of pairs) {
            this.binancePairs[pairToBinanceFormat(pair)] = pair;
        }
    }

    async run() {
        super.run();

        this.socket.on('close', async () => await this.close());
        this.socket.on('error', (error) => this.log.error(`WebSocket error: ${error}`));
        this.socket.on('message', (data: string) => {
            const parsedData = JSON.parse(data);

            if (!parsedData?.data || !this.streams.includes(parsedData?.stream)) return;

            const bookTicker = parsedData.data as BookStream;

            // Update order book
            const pair = pairFromBinanceFormat(bookTicker.s);

            const initialOrderBook = _.cloneDeep(this.orderBook);

            if (!this.orderBook[pair]) {
                this.orderBook[pair] = { pair, book: { bid: {}, offer: {} } };
            }

            this.orderBook[pair].book = {
                bid: { [bookTicker.b]: { price: new BigNumber(bookTicker.b), quantity: new BigNumber(bookTicker.B) } },
                offer: { [bookTicker.b]: { price: new BigNumber(bookTicker.a), quantity: new BigNumber(bookTicker.A) } }
            };

            if (!checkIfOrderBooksAreEqual(initialOrderBook, this.orderBook)) this.orderBookChanged = true;
        });
        this.socket.on('open', () => {
            this.log.debug('WebSocket connected');
            this.subscribeToProducts();
        });
    }

    subscribeToProducts = () =>
        this.socket.send(
            JSON.stringify({
                method: 'SUBSCRIBE',
                params: this.streams.map((stream) => `${stream}@bookTicker`),
                id: 1
            })
        );
}
