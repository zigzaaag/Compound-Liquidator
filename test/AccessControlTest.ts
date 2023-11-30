import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { Liquidator } from '../typechain-types/contracts/Liquidator';
import { botFixture } from './fixture';

describe('Liquidator access control', () => {
  let liquidator: Liquidator;

  beforeEach(async () => {
    liquidator = await loadFixture(botFixture);
  });

  it('Should set owner to deployer', async () => {
    const [deployer] = await ethers.getSigners();
    const owner = await liquidator.owner();
    expect(owner).to.be.equal(deployer.address);
  });

  it('Should be receivable', async () => {
    const [owner] = await ethers.getSigners();

    const amount = ethers.utils.parseEther('5.1');
    await owner.sendTransaction({
      to: liquidator.address,
      value: amount,
    });

    const balance = await ethers.provider.getBalance(liquidator.address);
    expect(balance).to.be.eq(amount);
  });

  it('Should be withdrawable for recipient', async () => {
    const [owner, account0] = await ethers.getSigners();

    const amount = ethers.utils.parseEther('5.1');
    await owner.sendTransaction({
      to: liquidator.address,
      value: amount,
    });

    const balanceBefore = await ethers.provider.getBalance(account0.address);

    await liquidator.setRecipient(account0.address);
    await liquidator.withdraw();

    const balanceAfter = await ethers.provider.getBalance(account0.address);

    expect(balanceAfter).to.be.eq(balanceBefore + amount.toBigInt());

  });
});