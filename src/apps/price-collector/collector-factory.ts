import { ExchangeName } from '../../types/types';
import { BinanceCollector } from './binance-collector';
import { CoinbaseCollector } from './coinbase-collector';
import { ExchangeCollector } from './exchange-collector';

export class ExchangeCollectorFactory {
   static getExchangeCollector(exchangeName: string, pairs: string[]): ExchangeCollector {
      switch (exchangeName) {
         case 'coinbase':
            return new CoinbaseCollector(pairs);
         case 'binance':
            return new BinanceCollector(pairs);
         default:
            throw new Error(`Unsupported exchange: ${exchangeName}`);
      }
   }
}
