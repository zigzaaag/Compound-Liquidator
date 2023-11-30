import { ethers } from 'hardhat';

import { Liquidator } from '../typechain-types/contracts/Liquidator';

export const botFixture = async (): Promise<Liquidator> => {
  const liquidatorFactory = await ethers.getContractFactory('Liquidator');
  const liquidator = (await liquidatorFactory.deploy()) as Liquidator;
  await liquidator.deployed();
  return liquidator;
};