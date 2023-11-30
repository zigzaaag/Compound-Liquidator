import { ethers, run } from 'hardhat';

// import deployer from '../.secret';

// WBNB address on BSC, WETH address on ETH
// const WethAddr = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

async function main() {
  await run('compile');
  const Liquidator = await ethers.getContractFactory('Liquidator');
  const liquidator = await Liquidator.deploy();
  await liquidator.deployed();

  console.log(`Liquidator deployed to ${liquidator.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });