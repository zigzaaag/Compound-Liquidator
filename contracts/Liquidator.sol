// SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.10;

import "./aave/FlashLoanReceiverBase.sol";
import "./aave/IPoolAddressesProvider.sol";
import "./aave/IPool.sol";

import "./compound/CErc20.sol";
import "./compound/CEther.sol";
import "./compound/CTokenInterfaces.sol";
import "./compound/Comptroller.sol";
import "./compound/PriceOracle.sol";

import "./uniswap/IUniswapV2Router02.sol";

import "./openzepplin/IERC20.sol";

contract Liquidator is FlashLoanReceiverBase {
    //--------------------------------------------------------------------
    // EVENTS

    //@notice 记录清算用户信息
    event NewLiquidationAccount(
        address borrower,
        uint256 repayAmount,
        address cTokenRepay,
        address cTokenCollateral
    );

    //@notice 记录借贷地址
    event LoanToken(address token);

    //@notice 记录盈利情况
    event Profit(uint256 balanceBefore, uint256 balanceAfter, uint256 profit);

    //@notice 记录更改comptroller的地址
    event NewComptroller(address newComptroller);

    //@notice 记录更改接收人的地址
    event NewRecipient(address newRecipient);

    //@notice 记录取款
    event Withdraw(address recipient, uint256 amount);

    //--------------------------------------------------------------------
    // VARIABLES

    uint256 private closeFactor;
    uint256 private liquidationIncentive;

    address public immutable owner;

    address public recipient;

    address internal constant UNISWAP_ROUTER_ADDRESS =
        0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address internal constant CETH_ADDRESS =
        0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5;
    address internal constant COMPTROLLER_ADDRESS =
        0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B;
    address internal constant ETH_RESERVE_ADDRESS =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address internal constant ADDRESS_PROVIDER =
        0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e;
    address internal immutable WETH_ADDRESS;

    IUniswapV2Router02 public swapRouter;
    Comptroller public comptroller;
    PriceOracle public priceOracle;

    //--------------------------------------------------------------------
    // CONSTRUCTOR

    constructor()
        FlashLoanReceiverBase(IPoolAddressesProvider(ADDRESS_PROVIDER))
    {
        owner = msg.sender;
        recipient = msg.sender;
        swapRouter = IUniswapV2Router02(UNISWAP_ROUTER_ADDRESS);
        comptroller = Comptroller(COMPTROLLER_ADDRESS);
        closeFactor = comptroller.closeFactorMantissa();
        liquidationIncentive = comptroller.liquidationIncentiveMantissa();
        priceOracle = PriceOracle(comptroller.oracle());
        WETH_ADDRESS = swapRouter.WETH();
    }

    //--------------------------------------------------------------------
    // MODIFIERS

    error notOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert notOwner();
        _;
    }

    modifier onlyProfitable() {
        uint256 balanceBefore = address(this).balance;
        _;
        uint256 balanceAfter = address(this).balance;
        uint256 profit = balanceAfter - balanceBefore;
        require(profit >= 0, "NO PROFIT");
        emit Profit(balanceBefore, balanceAfter, profit);
    }

    //--------------------------------------------------------------------
    // LOGIC FUNCTIONS

    function liquidateAccounts(
        address[] memory borrowers,
        address[] memory cTokenRepays,
        address[][] memory cTokenCollaterals
    ) public onlyOwner {
        require(
            borrowers.length == cTokenCollaterals.length,
            "Borrowers number doesn't match cTokenCollaterals number"
        );
        require(
            borrowers.length == cTokenRepays.length,
            "Borrowers number doesn't match cTokenRepays number"
        );
        for (uint256 i = 0; i < borrowers.length; i++) {
            liquidateAccount(
                borrowers[i],
                cTokenRepays[i],
                cTokenCollaterals[i]
            );
        }
    }

    function liquidateAccount(
        address borrower,
        address cTokenRepay,
        address[] memory cTokenCollaterals
    ) public onlyOwner {
        for (uint i = 0; i < cTokenCollaterals.length; i++) {
            (, , uint256 shortfall) = comptroller.getAccountLiquidity(borrower);
            if (shortfall == 0) break;
            _liquidateAccount(borrower, cTokenRepay, cTokenCollaterals[i]);
        }
    }

    function _liquidateAccount(
        address borrower,
        address cTokenRepay,
        address cTokenCollateral
    ) internal onlyOwner {
        uint256 repayAmount = calculateRepayAmount(
            borrower,
            cTokenRepay,
            cTokenCollateral
        );
        emit NewLiquidationAccount(
            borrower,
            repayAmount,
            cTokenRepay,
            cTokenCollateral
        );
        bytes memory params = abi.encode(
            borrower,
            repayAmount,
            cTokenRepay,
            cTokenCollateral
        );

        address lendingAsset;
        if (address(cTokenRepay) == CETH_ADDRESS) {
            lendingAsset = ETH_RESERVE_ADDRESS;
        } else {
            lendingAsset = CErc20Storage(address(cTokenRepay)).underlying();
        }
        emit LoanToken(lendingAsset);

        address[] memory assets = new address[](1);
        assets[0] = lendingAsset;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = repayAmount;

        address receiverAddress = address(this);
        address onBehalfOf = address(this);
        uint16 referralCode = 0;
        uint256[] memory modes = new uint256[](1);
        modes[0] = 1;

        POOL.flashLoan(
            receiverAddress,
            assets,
            amounts,
            modes,
            onBehalfOf,
            params,
            referralCode
        );
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external onlyProfitable returns (bool) {
        (
            address borrower,
            uint256 repayAmount,
            address cTokenRepay,
            address cTokenCollateral
        ) = abi.decode(params, (address, uint256, address, address));

        // 还ETH --> 获得ERC20
        // 还ETH --> 获得ETH
        // 还ERC20 --> 获得ERC20
        // 还ERC20 --> 获得ETH

        //用ETH还款
        if (cTokenRepay == CETH_ADDRESS) {
            //清算资产 获得借贷者的ctoken
            CEther(cTokenRepay).liquidateBorrow{value: repayAmount}(
                borrower,
                cTokenCollateral
            );
        }

        //用erc20还款
        if (cTokenRepay != CETH_ADDRESS) {
            // approveResponse = IERC20(repayUnderlyingAddress).approve(
            //     cTokenRepay,
            //     repayAmount
            // );
            // allowance = IERC20(repayUnderlyingAddress).allowance(
            //     address(this),
            //     cTokenRepay
            // );
            address repayUnderlyingAddress = CErc20Storage(cTokenRepay)
                .underlying();

            uint256 tokenBalance = IERC20(repayUnderlyingAddress).balanceOf(
                address(this)
            );
            uint256 liquidateBorrowError = CErc20Interface(cTokenRepay)
                .liquidateBorrow(
                    borrower,
                    repayAmount,
                    CTokenInterface(cTokenCollateral)
                );
            require(liquidateBorrowError == 0, "Call Liquidation Error !!! ");
        }

        //赎回资产
        uint256 cTokenBalance = CTokenInterface(cTokenCollateral).balanceOf(
            address(this)
        );
        uint256 redeemErrorCode = CErc20Interface(cTokenCollateral).redeem(
            cTokenBalance
        );
        require(redeemErrorCode == 0, "Redeem Token Error");

        //换成ETH
        //抵押品是ETH
        if (cTokenCollateral == CETH_ADDRESS) {
            return true;
        }
        //抵押品是ERC20
        if (cTokenCollateral != CETH_ADDRESS) {
            address collateralUnderlyingAddress = CErc20Storage(
                cTokenCollateral
            ).underlying();
            //换成WETH
            address[] memory ethPath = new address[](2);
            ethPath[0] = collateralUnderlyingAddress;
            ethPath[1] = WETH_ADDRESS;

            swapRouter.swapExactTokensForETH(
                cTokenBalance,
                0,
                ethPath,
                address(this),
                getNow()
            );
            return true;
        }

        return false;
    }

    function calculateRepayAmount(
        address borrower,
        address cTokenRepay,
        address cTokenCollateral
    ) internal returns (uint256) {
        // (, , uint256 shortfall) = comptroller.getAccountLiquidity(borrower);
        // require(shortfall != 0, "This Account can't be liquidate!");
        uint repayMax = (CErc20(cTokenRepay).borrowBalanceCurrent(borrower) *
            closeFactor) / uint(10 ** 18);
        uint seizeMax = (CErc20(cTokenCollateral).balanceOfUnderlying(
            borrower
        ) * uint(10 ** 18)) / liquidationIncentive;

        uint uPriceRepay = priceOracle.getUnderlyingPrice(cTokenRepay);
        repayMax *= uPriceRepay;
        seizeMax *= priceOracle.getUnderlyingPrice(cTokenCollateral);

        return (((repayMax < seizeMax) ? repayMax : seizeMax) / uPriceRepay);
    }

    //--------------------------------------------------------------------
    // FUNCTIONS
    receive() external payable {}

    function kill() external onlyOwner {
        selfdestruct(payable(recipient));
    }

    function changeComptroller(address _address) external onlyOwner {
        comptroller = Comptroller(_address);
        closeFactor = comptroller.closeFactorMantissa();
        liquidationIncentive = comptroller.liquidationIncentiveMantissa();
        emit NewComptroller(_address);
    }

    function setRecipient(address newRecipient) external onlyOwner {
        recipient = newRecipient;
        emit NewRecipient(newRecipient);
    }

    function withdraw() external onlyOwner {
        uint256 balance = getBalance();
        payable(recipient).transfer(balance);
        emit Withdraw(recipient, balance);
    }

    function getNow() internal view returns (uint256 _now) {
        _now = block.timestamp + 6000;
    }

    function getBalance() public view returns (uint256 balance) {
        balance = address(this).balance;
    }
}
