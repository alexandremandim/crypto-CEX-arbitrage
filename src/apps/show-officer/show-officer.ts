import config from 'config';
import Logger, { createLogger } from 'bunyan';
import BigNumber from 'bignumber.js';
import { DataFrame } from 'danfojs-node';
import _ from 'lodash';
import { redisClient } from '../../clients/redis-client';
import { Book } from '../price-collector/exchange-collector';

type OrderBook = {
   exchange: string;
   bestBid: BigNumber;
   bestOffer: BigNumber;
};


/**
 * Export PairHandler Reader.
 */
export class ShowOfficer {
   log: Logger;
   pair: string;

   constructor(pair: string) {
      this.log = createLogger({...config.get('bunyan'), name: `pair-handler-${pair}` });
      this.pair = pair;
   }

   async close() {
      this.log.info('Closing PairHandler.');
      
      if (redisClient?.isOpen) {
         await redisClient.disconnect();

         this.log.info(`Closed redis client for show-officer`);
      }
   }

   async execute() {
      const orderBooks: OrderBook[] = await this.getRedisData();

      this.drawTable(orderBooks);
   }

   /**
    * Draw in the screen the best bid/offer for all exchanges
    * @param data Order book data from a given pair and multiple exchanges.
    * @returns 
    */
   drawTable(data: OrderBook[]) {
      console.clear();
      
      if (!data.length) return console.log(`no data - ${this.pair}`);

      const df = new DataFrame(data);
      
      console.log(`${this.pair}\t${new Date().toLocaleString().split(', ')[1]}`);
      df.print();
   }

   /**
    * Gets from REDIS the best bid/ask for a given pair.
    * @returns Orderbooks from all exchanges with that pair.
    */
   async getRedisData(): Promise<OrderBook[]> {
      const redisData: OrderBook[] = [];

      for (const key of await redisClient.KEYS(`*_${this.pair}_orderBook`)) {
         const pair = await redisClient.GET(key);
         
         if (!pair) continue;
         
         const parsedPair: Book = JSON.parse(pair);

         Object.values(parsedPair.bid).sort((a, b) => a.price.comparedTo(b.price))
         
         redisData.push({ 
            bestBid: Object.values(parsedPair.bid).sort((a, b) => a.price.comparedTo(b.price)).slice(0, 1)[0].price, 
            bestOffer: Object.values(parsedPair.offer).sort((a, b) => a.price.comparedTo(b.price)).slice(-1)[0].price, 
            exchange: key.split('_')[0]
         });
      }

      return redisData;
   }

   async run() {
      if (!redisClient.isOpen) {
         await redisClient.connect();
      }

      await this.execute();

      setInterval(() => this.execute(), config.get('showOfficer.tableRefreshRate'));
   }
}
