import fs from 'fs';
import Logger, { createLogger } from 'bunyan';
import config from 'config';

export abstract class ExchangeClient {
    log: Logger;
    name: string;

    constructor(name: string) {
        this.log = createLogger({ ...config.get('bunyan'), name: `${name}Client` });
        this.name = name;
    }

    abstract getAllPairs(): Promise<string[]>;

    async getFees(forceRequest: boolean, pair: string): Promise<{ makerFee: number; takerFee: number }> {
        if (forceRequest || !config.has(`fees.${this.name}`)) {
            return await this.getExchangeFees(pair);
        }

        return this.getConfigFee(pair);
    }

    abstract getExchangeFees(pair: string): Promise<{ makerFee: number; takerFee: number }>;

    abstract getConfigFee(pair: string): { makerFee: number; takerFee: number };

    async updatePairsFile(pairs?: string[]) {
        if (!pairs) pairs = await this.getAllPairs();

        const filePath = `./data/pairs/${this.name}.json`;
        fs.writeFile(filePath, JSON.stringify(pairs), 'utf-8', (err) => { if (err) console.log(err); });

        this.log.debug(`Written file ${filePath}`);
    }
}
