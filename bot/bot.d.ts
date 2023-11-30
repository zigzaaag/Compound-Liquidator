

interface AccountInfo {
  account: string,
  cTokenRepay: string,
  cTokenCollateral: string[]
}

interface UnderlyingToken {
  symbol: string,
  supplyBalanceUnderlying: string
}

interface CTokenToAddress {
  readonly [key: string]: string;
}
