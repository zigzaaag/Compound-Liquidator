import { mainnetRPC } from "../.secret";

const liquidatorAddress = "YOUR_BOT_ADDRESS";

interface Config {
    mainnetRPC: string,
    queryURL: string,
    liquidatorAddress: string,
    comptrollerAddress: string,
    startBlockNumer: number,
    maxConcurrency: number,
}

const config: Config = {
    mainnetRPC: mainnetRPC,
    queryURL: "https://api.thegraph.com/subgraphs/name/graphprotocol/compound-v2",
    liquidatorAddress: liquidatorAddress,
    comptrollerAddress: "0xBafE01ff935C7305907c33BF824352eE5979B526",
    startBlockNumer: 17711251,
    maxConcurrency: 5
}

export default config;