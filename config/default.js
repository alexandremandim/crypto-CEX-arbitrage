module.exports = {
    exchanges: {
        binance: {
            apiKey: '"*****',
            wsApiUrl: 'wss://stream.binance.com:9443'
        },
        coinbase: {
            apiKey: '"*****',
            apiSecret: '"*****',
            wsApiUrl: 'wss://advanced-trade-ws.coinbase.com',
            'coinbase-pro': {
                passphrase: '"*****',
                apiSecret: '"*****',
                apiKey: '"*****'
            }
        }
    },
    fees: {
        binance: require('../data/fees/binanceFees.json'),
        coinbase: {
            maker: 0.004,
            taker: 0.006
        }
    },
    horn: {
        minROI: 0.001
    },
    redis: {
        bookExpiration: 300,
        url: 'redis://127.0.0.1:6379'
    },
    showOfficer: {
        tableRefreshRate: 1000
    },
    collector: {
        min24hVolume: 100000,
        orderBookDepth: 5,
        pairChunkSize: 20,
        saveOrderBookInterval: 1000
    },
    collectors: {
        binance: require('../data/pairs/binance.json'),
        coinbase: require('../data/pairs/coinbase.json')
    },
    bunyan: {
        level: 'info'
    }
};
