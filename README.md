**合约和框架**

合约部分: uniswapV2,aaveV3,compoundV2

框架: hardhat



**工作流**

最终决定做一个Compound清算机器人,清算步骤如下:

1. 从subgraph查找没有还清债务的账户地址
2. 调用comptroller合约中的`getAccountLiquidity()`,通过返回值中的`shortfall`来判断是否可清算(非0可清算),如果是,将账户和相关的token信息加入清算队列

3. 将清算账户信息传递给liquidator合约
4. liquidate合约会从aave中闪电贷需要偿清的债务,获得相关账户抵押的cToken,然后通过该cToken换回抵押品
5. liquidator将换回的抵押品通过uniswap换成eth



**用户债务和代币的数据结构**

清算机器人向外部提供了两个函数

~~~solidity
function liquidateAccount(
        address borrower,
        address cTokenRepay,
        address[] memory cTokenCollaterals
        )
function liquidateAccounts(
        address[] memory borrowers,
        address[] memory cTokenRepays,
        address[][] memory cTokenCollaterals
    ) public onlyOwner {
~~~

因此查询脚本需要传递的参数是 **用户地址**,**用户债务的cToken地址**, **用户抵押的cToken地址**

一个用户的信息可能是这样的

| 代币名称 | borrow                  | supply                       |
| -------- | ----------------------- | ---------------------------- |
| cTUSD    | 1120.436390015567200611 | 0                            |
| cUNI     | 0.014100928583817268    | 0                            |
| cETH     | 0                       | 4.20137158921717348236296997 |
| cCOMP    | 0                       | 6.7257977154781805672015327  |

对于一个可清算的用户,脚本完成需要完成以下工作:

1. 通过subgraph查询有债务的用户,调用comptroller审计合约来判断是否可清算
2. 如果可以清算, 加入队列,查询用户的抵押代币
3. 静态设定抵押代币的优先级来决定清算哪种资产
4. 传递给清算合约,然后判断该用户是否还能清算