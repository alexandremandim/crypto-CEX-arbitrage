import BigNumber from 'bignumber.js';
import { ExchangeCollector, OrderBook, checkIfOrderBooksAreEqual } from './exchange-collector';
import config from 'config';
import { WebSocket } from 'ws';
import { HmacSHA256 } from 'crypto-js';
import _ from 'lodash';

const WS_API_URL = config.get<string>('exchanges.coinbase.wsApiUrl');
const SIGNING_KEY = config.get<string>('exchanges.coinbase.apiSecret');
const API_KEY = config.get<string>('exchanges.coinbase.apiKey');

const CHANNEL_NAMES = { level2: 'level2', user: 'user', tickers: 'ticker', ticker_batch: 'ticker_batch', status: 'status', market_trades: 'market_trades' };

type Level2Update = { side: 'bid' | 'offer'; price_level: string; new_quantity: string };
type Level2EventType = 'snapshot' | 'update';

export class CoinbaseCollector extends ExchangeCollector {
    channelName: string = CHANNEL_NAMES.level2;
    restart = false;
    orderBookDepth: number;

    constructor(pairs: string[]) {
        super('coinbase', pairs, WS_API_URL);
        this.orderBookDepth = config.get<number>('collector.orderBookDepth');
    }

    async run() {
        super.run();

        this.socket.on('open', () => {
            this.log.debug('WebSocket connected');
            this.subscribeToProducts();
        });

        this.socket.on('message', (data: string) => {
            const parsedData = JSON.parse(data);

            if (parsedData.channel === 'l2_data' && parsedData.events?.length) {
                parsedData.events.map((e: { updates: Level2Update[]; type: Level2EventType; product_id: string }) =>
                    this.updateOrderBook(e.updates, e.type, e.product_id)
                );
            } else {
                this.log.debug(parsedData, 'Received message');
                this.log.debug(parsedData);
            }
        });

        this.socket.on('close', async () => {
            if (this.restart) {
                this.socket = new WebSocket(WS_API_URL);

                return;
            }

            await this.close();
        });

        this.socket.on('error', (err: Error) => {
            this.restart = true;
            this.log.error(err, 'Some error ocurred. Restarting...');
        });
    }

    updateOrderBook(updates: Level2Update[], eventType: Level2EventType, pair: string) {
        const initialOrderBook = _.cloneDeep(this.orderBook);

        if (eventType === 'snapshot') {
            this.orderBook = _.reduce(
                updates,
                (acc: OrderBook, update: Level2Update) => {
                    const result = { ...acc };

                    if (!result[pair]) result[pair] = { pair, book: { bid: {}, offer: {} } };

                    result[pair].book[update.side][update.price_level] = {
                        price: new BigNumber(update.price_level),
                        quantity: new BigNumber(update.new_quantity)
                    };

                    return result;
                },
                {}
            );
        }

        if (eventType === 'update') {
            for (const update of updates) {
                
                if (update.new_quantity === '0') {
                    if (!!this.orderBook[pair]?.book[update.side][update.price_level]) {
                        delete this.orderBook[pair].book[update.side][update.price_level];
                    }
                    continue;
                }

                if(!this.orderBook[pair]) this.orderBook[pair] = {pair, book: {bid: {}, offer: {}}};

                this.orderBook[pair].book[update.side][update.price_level] = {
                    price: new BigNumber(update.price_level),
                    quantity: new BigNumber(update.new_quantity)
                };
            }
        }

        // Let's trim the order book
        for (const pair of Object.values(this.orderBook)) {
            const offers = Object.values(pair.book.offer).sort((a, b) => a.price.comparedTo(b.price)).slice(0, this.orderBookDepth);
            const bids = Object.values(pair.book.bid).sort((a, b) => a.price.comparedTo(b.price)).slice(-this.orderBookDepth);
            
            pair.book.bid = bids.reduce((acc, bid) => ({ ...acc, [bid.price.toString()]: { ...bid } }), {});
            pair.book.offer = offers.reduce((acc, bid) => ({ ...acc, [bid.price.toString()]: { ...bid } }), {});
        }

        const equal = checkIfOrderBooksAreEqual(initialOrderBook, this.orderBook);

        if(!equal) this.orderBookChanged = true;
    }

    timestampAndSign(message: object) {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const sig = HmacSHA256(`${timestamp}${this.channelName}${this.pairs.join(',')}`, SIGNING_KEY).toString();

        return { ...message, signature: sig, timestamp: timestamp };
    }

    subscribeToProducts = () =>
        this.socket.send(JSON.stringify(this.timestampAndSign({ type: 'subscribe', channel: this.channelName, api_key: API_KEY, product_ids: this.pairs })));
}
