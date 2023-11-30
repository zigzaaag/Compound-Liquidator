import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import { privateKey, mainnetRPC, goerliRPC } from "./.secret";



const MAINNET_RPC = mainnetRPC;
const PRIVATE_KEY = privateKey;
const GOERLI_RPC = goerliRPC;

const config: HardhatUserConfig = {
  solidity: "0.8.10",
  networks: {
    hardhat: {
      // loggingEnabled: true,
      forking: {
        url: MAINNET_RPC,
        enabled: true,
        blockNumber: 17684595,
        //If connecting to an archival node (e.g. Alchemy), we strongly recommend setting,blockNumber to a fixed value to increase performance with a local cache.
      },
      accounts: {
        accountsBalance: '1000000000000000000000000', // 1 mil ether
      },
    },
    mainnet: {
      url: MAINNET_RPC,
      chainId: 0x1,
      accounts: [PRIVATE_KEY],
    },
    goerli: {
      url: GOERLI_RPC,
      chainId: 0x5,
      accounts: [PRIVATE_KEY]
    },
  },
};

export default config;
