import axios from "axios";
import config from "./config";

var startBlockNumber = config.startBlockNumer;

export async function subgraphQuery(query:string):Promise<any> {
  try {
    const SUBGRAPH_URL:string = config.queryURL;
    const response = await axios.post(SUBGRAPH_URL, { query });
    if (response.data.errors) {
      console.error(response.data.errors);
      throw new Error(`Error making subgraph query ${response.data.errors}`);
    }
    return response.data.data;
  } catch (error:any) {
    console.error(error);
    throw new Error(`Could not query the subgraph ${error.message}`);
  }
}

export async function getAccounts(lastQueryBlockNumber: number): Promise<{ accounts: string[], cTokenRepays:string[],nextQueryBlockNumber: number }> {
  let length:number;

  const accounts = await subgraphQuery(FETCH_ACCOUNTS(lastQueryBlockNumber));
  if (accounts != undefined) {
    length = accounts.accountCTokens.length;
    lastQueryBlockNumber =
      accounts.accountCTokens[length - 1].accrualBlockNumber;
    console.log(accounts.accountCTokens);
  } else {
    console.log("NO MORE NEW TX");
  }

    var accountAddresses: string[] = [];
    var cTokenRepays: string[] = [];
    

  accounts.accountCTokens.forEach(async (data:any) => {
      accountAddresses.push(data.market.id);
      cTokenRepays.push(data.symbol);
  });

    return { accounts: accountAddresses, cTokenRepays:cTokenRepays,nextQueryBlockNumber: accounts[accounts.length - 1].accrualBlockNumber };
};

export async function getCollateralCToken(account:string):Promise<UnderlyingToken[]> {
  const cTokens = await subgraphQuery(FETCH_COLLATERAL(account));
  return cTokens.account.tokens;
};




function FETCH_ACCOUNTS(lastQueryBlockNumber: number): string {
  return `{
  accountCTokens(first: 100, orderBy: accrualBlockNumber,where:{accrualBlockNumber_gt:${lastQueryBlockNumber},storedBorrowBalance_gt: 0})
 {
    id
    symbol
    accrualBlockNumber
    storedBorrowBalance
    market {
      id
      underlyingAddress
      underlyingSymbol
    }
    account {
    	id
    }
  }
}`;
}

function FETCH_COLLATERAL(account:string):string {
  {
    return `{
      account(id: "${account}") {
        tokens(first: 19) {
          symbol
          supplyBalanceUnderlying
        } 
      }
    }`;
  }
}


// const result = await getAccounts(startBlockNumber);

