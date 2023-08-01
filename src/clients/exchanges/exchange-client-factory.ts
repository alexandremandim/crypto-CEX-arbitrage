import Container from "typedi";
import { CoinbaseClient } from "./coinbase-client";
import { BinanceClient } from "./binance-client";

export class ExchangeClientFactory {
    static getExchangeClient(exchangeName: string) {
        switch (exchangeName) {
            case 'coinbase':
                return Container.get(CoinbaseClient);
            case 'binance':
                return Container.get(BinanceClient);
            default:
                throw new Error(`Unsupported exchange: ${exchangeName}`);
        }
    }
}
