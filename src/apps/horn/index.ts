import "reflect-metadata";

import BigNumber from 'bignumber.js';
import { redisClient } from '../../clients/redis-client';
import _ from 'lodash';
import { calculateROI } from '../../utils/utils';
import config from 'config';
import { Book } from '../price-collector/exchange-collector';
import Table from 'cli-table';
import { ExchangeClientFactory } from '../../clients/exchanges/exchange-client-factory';

type pair = string;
type exchange = string;

class Horn {
    async executeEnhanced() {
        const allPairsPrices: {
            [key: pair]: {
                // pair
                [key: exchange]: {
                    // exchange
                    bidPrice: BigNumber;
                    bidQuantity: BigNumber;
                    offerPrice: BigNumber;
                    offerQuantity: BigNumber;
                    exchange: string;
                    pair: string;
                };
            };
        } = {};
        const allKeys = await redisClient.KEYS('*');
        const pairs = _.uniq(_.map(allKeys, (key) => key.split('_')[1]));

        // Get order books data
        for (const pair of pairs) {
            const allOrderBooks = await redisClient.KEYS(`*_${pair}_orderBook`);

            if (!(allOrderBooks.length > 1)) continue;

            const orderBooksBuffer = await redisClient.MGET(allOrderBooks);

            for (let i = 0; i < allOrderBooks.length; i++) {
                const orderBookBuffer = orderBooksBuffer[i];

                if (orderBookBuffer === null) continue;

                const exchange = allOrderBooks[i].split('_')[0];
                const parsedOrderBuffer: Book = JSON.parse(orderBookBuffer);

                for (const [k, v] of Object.entries(parsedOrderBuffer.bid))
                    parsedOrderBuffer.bid[k] = { price: new BigNumber(v.price), quantity: new BigNumber(v.quantity) };

                for (const [k, v] of Object.entries(parsedOrderBuffer.offer))
                    parsedOrderBuffer.offer[k] = { price: new BigNumber(v.price), quantity: new BigNumber(v.quantity) };

                const bestBid = Object.values(parsedOrderBuffer.bid)
                    .sort((a, b) => a.price.comparedTo(b.price))
                    .slice(-1);
                const bestOffer = Object.values(parsedOrderBuffer.offer)
                    .sort((a, b) => a.price.comparedTo(b.price))
                    .slice(0, 1);

                if (!bestBid.length || !bestOffer.length) continue;

                if (!allPairsPrices[pair]) allPairsPrices[pair] = {};

                allPairsPrices[pair][exchange] = {
                    bidPrice: bestBid[0].price,
                    bidQuantity: bestBid[0].quantity,
                    offerPrice: bestOffer[0].price,
                    offerQuantity: bestOffer[0].quantity,
                    exchange,
                    pair
                };
            }
        }

        // Check if there are opportunities
        type TableRow = [string, string, string, string, string, string, string, string, string, string];
        type FullTable = TableRow[];

        let fullTable: FullTable = [];
        for (const pair of Object.values(allPairsPrices)) {
            const pairValues = Object.values(pair);
            const bestBid = pairValues.sort((a, b) => a.bidPrice.comparedTo(b.bidPrice)).slice(-1);
            const bestOffer = pairValues.sort((a, b) => a.offerPrice.comparedTo(b.offerPrice)).slice(0, 1);

            const roi = calculateROI(bestOffer[0].offerPrice, bestBid[0].bidPrice).multipliedBy(100);

            if (roi.gt(0)) {
                const buyFee: BigNumber = new BigNumber((await ExchangeClientFactory.getExchangeClient(bestBid[0].exchange).getFees(false, bestBid[0].pair)).makerFee).multipliedBy(100);
                const sellFee: BigNumber = new BigNumber((await ExchangeClientFactory.getExchangeClient(bestOffer[0].exchange).getFees(false, bestBid[0].pair)).makerFee).multipliedBy(100);
                const moveFee: BigNumber = new BigNumber(0).multipliedBy(100);
                const totalFees = buyFee.plus(sellFee).plus(moveFee);
                
                if (roi.gt(totalFees)){
                    fullTable.push([
                        bestBid[0].pair,
                        bestOffer[0].exchange,
                        bestOffer[0].offerPrice.toFixed(4),
                        bestBid[0].exchange,
                        bestBid[0].bidPrice.toFixed(4),
                        roi.toFixed(2),
                        buyFee.toString(),
                        sellFee.toString(),
                        moveFee.toString(),
                        roi.minus(totalFees).toString()
                    ]);
                }
            }
        }

        fullTable.sort((r1, r2) => new BigNumber(r2[5]).minus(new BigNumber(r1[5])).toNumber());
        const table = new Table({ head: ['PAIR', 'BUY', 'BPRICE', 'SELL', 'SPRICE', 'DIFF', 'BFEE', 'SFEE', 'MFEE', 'ROI'], rows: [...fullTable] });

        console.clear();
        console.log(new Date().toTimeString());
        console.log(`Found ${table.length} potential pairs.\n`);
        console.log(table.toString());
    }

    async run() {
        await this.executeEnhanced();

        setInterval(async () => this.executeEnhanced(), 1000);
    }
}

(async () => await new Horn().run())();
