import 'reflect-metadata';

import { program } from 'commander';
import { ExchangeCollectorFactory } from './collector-factory';
import config from 'config';
import { ExchangeCollector } from './exchange-collector';
import _ from 'lodash';
import { createLogger } from 'bunyan';
import { ExchangeClientFactory } from '../../clients/exchanges/exchange-client-factory';

program.option('-e, --exchange <string>', 'exchange e.g: coinbase');
program.option('-p, --pair <string>', 'pair like BTC-USDT');
program.option('-d, --debug <string>', 'debug mode');

program.parse(process.argv);

const { exchange, pair } = program.opts();

(async () => {
    const log = createLogger({ ...config.get('bunyan'), name: 'price-collector' });
    const exchangesInstances: ExchangeCollector[] = [];
    const exchangesNames = exchange ? [exchange] : Object.keys(config.get<string[]>('exchanges'));

    log.info(`Getting pairs from ${exchangesNames.length} exchanges.`);

    const exchangePairs: { [key: string]: string[] } = {};
    await Promise.all(
        exchangesNames.map(async (exchange) => {
            const pairs = await ExchangeClientFactory.getExchangeClient(exchange).getAllPairs();

            log.info(`Saving pairs from ${exchange} to file`);
            await ExchangeClientFactory.getExchangeClient(exchange).updatePairsFile(pairs);

            exchangePairs[exchange] = pairs;
        })
    );

    const allPairs = Object.values(exchangePairs);

    let pairsToConsider: string[];

    if (pair && exchange) {
        // 1 pair from 1 exchange
        if (!allPairs[0].includes(pair)) throw Error(`Exchange ${exchange} does not have the pair ${pair}}`);
        pairsToConsider = [pair];
    } else if (!pair && exchange) {
        // All pairs from 1 exchange
        pairsToConsider = allPairs[0];
    } else if (pair && !exchange) {
        pairsToConsider = [pair];
    } else {
        // Consider pairs mutual to exchanges at least 2 exchanges AND
        // Consider pairs with 24h volume greater than config value
        const count = _(allPairs).flattenDeep().countBy().value();
        pairsToConsider = Object.keys(count).filter((pair) => count[pair] > 1);
    }

    log.info(`Pairs ${pairsToConsider}.`);

    for (const exchangeName of exchangesNames) {
        for (const pairsChunk of _.chunk(pairsToConsider, config.get<number>('collector.pairChunkSize'))) {
            const instance = ExchangeCollectorFactory.getExchangeCollector(exchangeName, _.intersection(pairsChunk, exchangePairs[exchangeName]));

            await instance.run();

            exchangesInstances.push(instance);
        }
    }

    for (const signal of ['SIGINT', 'SIGQUIT', 'SIGTERM']) {
        process.on(signal, async () => {
            for (const exchangeIns of exchangesInstances) {
                await exchangeIns.close();
            }

            clearInterval(undefined);

            log.info('Bye.');
            process.exit(0);
        });
    }
})();
