interface Network {
    network: string;
    coin: string;
    withdrawIntegerMultiple: string;
    isDefault: boolean;
    depositEnable: boolean;
    withdrawEnable: boolean;
    depositDesc: string;
    withdrawDesc: string;
    specialTips: string;
    specialWithdrawTips: string;
    name: string;
    resetAddressStatus: boolean;
    addressRegex: string;
    addressRule: string;
    memoRegex: string;
    withdrawFee: string;
    withdrawMin: string;
    withdrawMax: string;
    minConfirm: number;
    unLockConfirm: number;
    sameAddress: boolean;
    estimatedArrivalTime: number;
    busy: boolean;
    country: string;
    contractAddressUrl: string;
    contractAddress: string;
}

export interface Asset {
    coin: string;
    depositAllEnable: boolean;
    withdrawAllEnable: boolean;
    name: string;
    free: string;
    locked: string;
    freeze: string;
    withdrawing: string;
    ipoing: string;
    ipoable: string;
    storage: string;
    isLegalMoney: boolean;
    trading: boolean;
    networkList: Network[];
}
