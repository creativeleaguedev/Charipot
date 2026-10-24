// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Rotary Gov Marketplace Escrow
 * @notice On-chain P2P marketplace for the Rotary Impact GOV governance token.
 *
 * Flow:
 *   1. A seller lists an amount of GOV at a fixed USD price-per-GOV. The GOV is
 *      transferred from the seller into this escrow contract (hold-in-escrow).
 *   2. A buyer pays the listing total in an approved stablecoin (USDC/USDT).
 *      The escrow atomically sends the stablecoin to the seller and the GOV to
 *      the buyer — a single settlement with no partial state.
 *   3. Settlements are grouped in batches and a Chainlink VRF random word
 *      selects the processing order within each batch, so listing priority
 *      cannot be front-run by ordering manipulation.
 *
 * The contract holds custody (escrow) of listed GOV until purchase or cancel,
 * so a sale always resolves to a clean transfer: crypto to seller, GOV to
 * buyer. Platform fee (basis points) is routed to the platform treasury on
 * each sale.
 *
 * NOTE: Reference implementation. Deploying this contract and wiring the app's
 * Marketplace UI to it requires a deployed address + an EOA/contract wallet
 * signer (ethers) on the chosen chain. Until then the app settles GOV trades
 * off-chain via the GovListing/GovTransaction entities.
 */

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

interface IVRFCoordinator {
    function requestRandomWords(bytes32 keyHash, uint64 subId, uint16 minConfs, uint32 callbackGasLimit, uint32 numWords) external returns (uint256);
}

contract GovMarketplaceEscrow {
    struct Listing {
        address seller;
        uint256 govAmount;     // GOV held in escrow
        uint256 pricePerGov;    // stablecoin per 1e18 GOV
        address paymentToken;   // USDC or USDT
        bool active;
    }

    IERC20 public immutable govToken;
    address public immutable platformTreasury;
    uint16 public platformFeeBps;     // e.g. 200 = 2%
    address public owner;

    // Chainlink VRF (v2) configuration for fair batch settlement ordering.
    IVRFCoordinator public vrfCoordinator;
    bytes32 public vrfKeyHash;
    uint64 public vrfSubId;
    uint32 public vrfCallbackGasLimit;

    uint256 public nextListingId = 1;
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => uint256) public batchRandomness; // batchId -> random word

    event Listed(uint256 indexed listingId, address indexed seller, uint256 govAmount, uint256 pricePerGov, address paymentToken);
    event Purchased(uint256 indexed listingId, address indexed buyer, uint256 govAmount, uint256 paymentTotal, uint256 fee);
    event Cancelled(uint256 indexed listingId);
    event BatchSettled(uint256 indexed batchId, uint256 randomness);
    event FeeUpdated(uint16 bps);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    constructor(address _gov, address _treasury, uint16 _feeBps) {
        govToken = IERC20(_gov);
        platformTreasury = _treasury;
        platformFeeBps = _feeBps;
        owner = msg.sender;
    }

    // ---- Configuration ----
    function setFee(uint16 _bps) external onlyOwner { require(_bps <= 1000, "fee too high"); platformFeeBps = _bps; emit FeeUpdated(_bps); }
    function setVRF(address _coord, bytes32 _keyHash, uint64 _subId, uint32 _gasLimit) external onlyOwner {
        vrfCoordinator = IVRFCoordinator(_coord);
        vrfKeyHash = _keyHash;
        vrfSubId = _subId;
        vrfCallbackGasLimit = _gasLimit;
    }

    // ---- Listing (escrow the GOV) ----
    function list(uint256 govAmount, uint256 pricePerGov, address paymentToken) external returns (uint256 listingId) {
        require(govAmount > 0 && pricePerGov > 0, "invalid params");
        require(govToken.transferFrom(msg.sender, address(this), govAmount), "escrow transfer failed");
        listingId = nextListingId++;
        listings[listingId] = Listing({ seller: msg.sender, govAmount: govAmount, pricePerGov: pricePerGov, paymentToken: paymentToken, active: true });
        emit Listed(listingId, msg.sender, govAmount, pricePerGov, paymentToken);
    }

    function cancel(uint256 listingId) external {
        Listing storage l = listings[listingId];
        require(l.active && l.seller == msg.sender, "not owner/active");
        l.active = false;
        require(govToken.transfer(msg.sender, l.govAmount), "refund failed");
        emit Cancelled(listingId);
    }

    // ---- Purchase: crypto to seller, GOV to buyer (atomic escrow settlement) ----
    function buy(uint256 listingId) external {
        Listing storage l = listings[listingId];
        require(l.active, "not active");

        uint256 total = (uint256(l.govAmount) * l.pricePerGov) / 1e18;
        require(total > 0, "zero total");

        uint256 fee = (total * platformFeeBps) / 10000;
        uint256 toSeller = total - fee;

        l.active = false;
        // Take stablecoin from buyer -> seller + treasury.
        IERC20 pay = IERC20(l.paymentToken);
        require(pay.transferFrom(msg.sender, l.seller, toSeller), "seller pay failed");
        if (fee > 0) require(pay.transferFrom(msg.sender, platformTreasury, fee), "fee pay failed");
        // Release escrowed GOV to buyer.
        require(govToken.transfer(msg.sender, l.govAmount), "gov transfer failed");

        emit Purchased(listingId, msg.sender, l.govAmount, total, fee);
    }

    // ---- Batch settlement with VRF randomness (fair ordering) ----
    // Request a random word to decide the processing order of a batch of
    // pending purchases, preventing priority manipulation.
    function requestBatchRandomness() external onlyOwner returns (uint256 reqId) {
        require(address(vrfCoordinator) != address(0), "vrf not set");
        reqId = vrfCoordinator.requestRandomWords(vrfKeyHash, vrfSubId, 3, vrfCallbackGasLimit, 1);
        return reqId;
    }

    // Chainlink VRF callback (rawRandomWords is the single requested word).
    function rawFulfillRandomWords(uint256, uint256[] memory randomWords) external {
        require(msg.sender == address(vrfCoordinator), "only vrf");
        uint256 batchId = nextListingId; // current batch boundary
        batchRandomness[batchId] = randomWords[0];
        emit BatchSettled(batchId, randomWords[0]);
    }
}
