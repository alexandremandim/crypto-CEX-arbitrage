export interface Details {
    type: string;
    symbol: null;
    network_confirmations: number;
    sort_order: number;
    crypto_address_link: string;
    crypto_transaction_link: string;
    push_payment_methods: string[];
    group_types: any[];
    display_name: null;
    processing_time_seconds: null;
    min_withdrawal_amount: number;
    max_withdrawal_amount: number;
}

export interface SupportedNetworks {
    id: string;
    name: string;
    status: string;
    contract_address: string;
    crypto_address_link: string;
    crypto_transaction_link: string;
    min_withdrawal_amount: number;
    max_withdrawal_amount: number;
    network_confirmations: number;
    processing_time_seconds: null;
}

export interface CryptoCurrency {
    id: string;
    name: string;
    min_size: string;
    status: 'online' | 'delisted';
    message: string;
    max_precision: string;
    convertible_to: any[];
    details: Details;
    default_network: string;
    supported_networks: SupportedNetworks[];
}


// https://docs.cloud.coinbase.com/exchange/reference/exchangerestapi_getproductbook
export type ProductBookResponse = {
    bids: [string, string, number][]; // price, volume base asset, num_orders
    asks: [string, string, number][];
    sequence: number;
    auction_mode: boolean; 
    auction: null;
    time: string;
  };