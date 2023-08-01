import Logger, { createLogger } from 'bunyan';
import config from 'config';
import WebSocket from 'ws';
import { ExchangeName } from '../../types/types';
import { redisClient } from '../../clients/redis-client';
import _ from 'lodash';
import BigNumber from 'bignumber.js';

export type OrderBook = {
    [key: string]: {
        // same as pair e.g BTC-USD
        pair: string;
        book: Book;
    };
};

export type Book = {
    bid: { [key: string]: { price: BigNumber; quantity: BigNumber } }; // price : {price; quantity}
    offer: { [key: string]: { price: BigNumber; quantity: BigNumber } };
};

export function checkIfOrderBooksAreEqual(orderBook1: OrderBook, orderBook2: OrderBook) {
    // Check if both OrderBooks have the same pairs
    const samePairs = _.isEqual(Object.keys(orderBook1).sort(), Object.keys(orderBook2).sort());

    // Check Books
    return samePairs && _.reduce(Object.entries(orderBook1), (acc, [key, pair1]) => acc && checkIfBooksAreEqual(pair1.book, orderBook2[key].book), true);
}

export function checkIfBooksAreEqual(book1: Book, book2: Book): boolean {
    return (
        _.isEqual(_.sortBy(Object.keys(book1.bid)), _.sortBy(Object.keys(book2.bid))) &&
        _.isEqual(_.sortBy(Object.keys(book1.offer)), _.sortBy(Object.keys(book2.offer))) &&
        _.reduce(
            Object.entries(book1.offer),
            (acc, [key, offer1]) => acc && offer1.price === book2.offer[key].price && offer1.quantity === book2.offer[key].quantity,
            true
        ) &&
        _.reduce(
            Object.entries(book1.bid),
            (acc, [key, bid1]) => acc && bid1.price === book2.bid[key].price && bid1.quantity === book2.bid[key].quantity,
            true
        )
    );
}

export abstract class ExchangeCollector {
    exchangeName: ExchangeName;
    log: Logger;
    pairs: string[];
    socket: WebSocket;
    orderBook: OrderBook = {};
    orderBookChanged = true;

    constructor(exchangeName: ExchangeName, pairs: string[], webSocketAddress: string) {
        this.exchangeName = exchangeName;
        this.log = createLogger({ ...config.get('bunyan'), name: exchangeName });
        this.pairs = pairs;
        this.socket = new WebSocket(webSocketAddress);

        this.log.info(`Created price collector for ${exchangeName}`);
    }

    async close() {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
            this.log.info(`Closed web socket for ${this.exchangeName}`);
        }
    }

    printOrderBook() {
        console.clear();

        const red = '\x1b[31m';
        const green = '\x1b[32m';

        if (!this.orderBook || !Object.values(this.orderBook).length) return console.log('No order books data.');

        for (const pairBook of Object.values(this.orderBook)) {
            const lowerOffers = Object.values(this.orderBook[pairBook.pair].book.offer).sort((a,b) => a.price.comparedTo(b.price)).slice(0,5).reverse();
            const higherBids = Object.values(this.orderBook[pairBook.pair].book.bid).sort((a,b) => a.price.comparedTo(b.price)).slice(-5).reverse();

            console.log(pairBook.pair);
            lowerOffers.map((o) => console.log(red, o.price + '\t\t' + o.quantity));
            console.log('-----------------');
            higherBids.map((o) => console.log(green, o.price + '\t\t' + o.quantity));
        }
    }

    run() {
        this.log.info(`Running price collector for ${this.exchangeName}`);
        
        setInterval(async () => this.saveAllOrderBooksToRedis(), config.get<number>('collector.saveOrderBookInterval'));
    }

    async saveAllOrderBooksToRedis() {
        if (!Object.values(this.orderBook).length || !this.orderBookChanged) return;

        await Promise.all(
            Object.values(this.orderBook).map((pair) =>
                redisClient.set(`${this.exchangeName.toLowerCase()}_${pair.pair}_orderBook`, JSON.stringify(pair.book), {
                    EX: config.get('redis.bookExpiration')
                })
            )
        );

        this.orderBookChanged = false;

        this.log.debug('Saved orderbook to redis');
    }
}
