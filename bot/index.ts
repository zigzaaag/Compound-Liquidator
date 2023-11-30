import config from "./config";
import { Contract, ethers } from "ethers";
import { getAccounts, getCollateralCToken } from "./query";
import { Network, getcTokens } from "./token";
import { privateKey } from "../.secret";
import { Liquidator } from "../typechain-types";




var startBlockNumber = config.startBlockNumer;
const provider = new ethers.providers.JsonRpcProvider(config.mainnetRPC);
const PRIVATE_KEY = privateKey;

async function liquidate(liquidator: Contract): Promise<void> {
    //1.查询用户
    const result = await getAccounts(config.startBlockNumer);
    if (result.accounts.length == 0) return;
    const accounts = result.accounts;
    const cTokenRepays = result.cTokenRepays;
    startBlockNumber = result.nextQueryBlockNumber;

    //2. 筛选可清算用户
    var liquidableAccounts: string[] = [];
    accounts.forEach(async (account) => {
        if (await isLiquidable(account))
            liquidableAccounts.push(account);
    });

    for (var i = 0; i < liquidableAccounts.length; i++) {
        var account = liquidableAccounts[i];
        //3. 筛出用户不为0的抵押token名称
        var collateralTokenSymbols: string[] = [];
        (await getCollateralCToken(account)).forEach((underlyingToken) => {
            if (underlyingToken.supplyBalanceUnderlying != "0")
                collateralTokenSymbols.push(underlyingToken.symbol);
        });
        collateralTokenSymbols = sortTokenBySymbol(collateralTokenSymbols);
        //4. 映射到地址
        const addresses = getcTokens(Network.MAINNET);
        var collaterlTokenAddress: string[] = symbolsToAddresses(collateralTokenSymbols, addresses);


        //5. 清算
        liquidator.liquidateAccount(account, cTokenRepays[i], collaterlTokenAddress);
    }


}

function sortTokenBySymbol(tokens: string[]): string[] {
    return tokens;
}

function symbolsToAddresses(keys: string[], value: CTokenToAddress): string[] {
    var addresses: string[] = [];
    keys.forEach(key => {
        addresses.push(value[key]);
    });
    return addresses;
}



async function isLiquidable(accountAddress: string): Promise<boolean> {
    const abi = [
        "function getAccountLiquidity(address account) view returns (uint, uint, uint)",
    ];
    const comptrollerAddress = config.comptrollerAddress;
    const contract = new ethers.Contract(comptrollerAddress, abi, provider);
    const result = await contract.getAccountLiquidity(accountAddress);
    return result[2] != 0;
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const abi = [
        "function liquidateAccount(address borrower,address cTokenRepay,address cTokenCollateral) public onlyOwner"
    ]
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const liquidator = new ethers.Contract(config.liquidatorAddress, abi, wallet);

    const maxConcurrency = config.maxConcurrency;
    const concurrent = new Concurrent(maxConcurrency);
    const liquidators: Function[] = [];

    for (let i = 0; i < maxConcurrency * 100; i++) {
        liquidators.push(liquidate);
    }

    while (true) {
        await concurrent.useRace(liquidators)
        await sleep(1000);
    }
}

class Concurrent {
    private maxConcurrent: number;

    constructor(count: number) {
        this.maxConcurrent = count;
    }
    public async useRace(fns: Function[]) {
        const runing: any[] = [];
        // 按并发数，把 Promise 加进去
        // Promise 会回调一个索引，方便我们知道哪个 Promise 已经 resolve 了
        for (let i = 0; i < this.maxConcurrent; i++) {
            if (fns.length) {
                const fn = fns.shift()!;
                runing.push(fn(i));
            }
        }
        const handle = async () => {
            if (fns.length) {
                const idx = await Promise.race<number>(runing);
                const nextFn = fns.shift()!;
                // 移除已经完成的 Promise，把新的进去
                runing.splice(idx, 1, nextFn(idx));
                handle();
            } else {
                // 如果数组已经被清空了，表面已经没有需要执行的 Promise 了，可以改成 Promise.all
                await Promise.all(runing);
            }
        };
        handle();
    }
}
