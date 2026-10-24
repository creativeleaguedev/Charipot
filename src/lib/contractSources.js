// Verbatim Solidity source for the platform's two reference smart contracts,
// surfaced on the in-app /contracts page so users can audit the logic that
// governs ticket purchases, draws, prize payouts, and GOV marketplace escrow.
// Kept in a data module so the page component stays lean.

export const LOTTERY_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/vrf/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Chari is VRFConsumerBaseV2, Ownable {
    using SafeERC20 for IERC20;

    VRFCoordinatorV2Interface internal immutable COORDINATOR;
    IERC20 public immutable paymentToken;

    bytes32 public immutable gasLane;
    uint64 public immutable subscriptionId;
    uint32 public immutable callbackGasLimit;
    uint16 public immutable requestConfirmations;

    uint256 public ticketPrice;
    uint256 public platformFeeBps;
    uint256 public charityBps;
    uint256 public prizeBps;
    address public platformWallet;
    address public charityWallet;

    uint16 public constant POOL_SIZE = 39;
    uint16 public constant PICK_COUNT = 5;

    enum DrawState { BUILDING, LOCKED, REQUESTED, SETTLED }
    struct Draw {
        DrawState state;
        uint256 ticketCount;
        uint256 prizePool;
        uint256 jackpotReserve;
        uint16[5] winningNumbers;
        uint256 requestId;
        uint256 winners5;
        uint256 winners4;
        uint256 winners3;
    }

    struct Ticket {
        address buyer;
        uint16[5] numbers;
        bool claimed;
    }

    uint256 public currentDrawId;
    mapping(uint256 => Draw) public draws;
    mapping(uint256 => Ticket[]) public drawTickets;
    mapping(uint256 => mapping(uint16 => uint256[])) public matchIndex;

    event TicketPurchased(uint256 indexed drawId, uint256 indexed ticketIndex, address buyer, uint16[5] numbers);
    event DrawLocked(uint256 indexed drawId);
    event RandomnessRequested(uint256 indexed drawId, uint256 requestId);
    event DrawSettled(uint256 indexed drawId, uint16[5] winningNumbers, uint256 winners5, uint256 winners4, uint256 winners3);
    event PrizeClaimed(uint256 indexed drawId, uint256 indexed ticketIndex, uint256 amount);

    constructor(
        address _paymentToken,
        address _coordinator,
        bytes32 _gasLane,
        uint64 _subscriptionId,
        uint32 _callbackGasLimit,
        uint16 _requestConfirmations,
        uint256 _ticketPrice,
        address _platformWallet,
        address _charityWallet
    ) VRFConsumerBaseV2(_coordinator) Ownable(msg.sender) {
        require(_paymentToken != address(0), "bad token");
        COORDINATOR = VRFCoordinatorV2Interface(_coordinator);
        paymentToken = IERC20(_paymentToken);
        gasLane = _gasLane;
        subscriptionId = _subscriptionId;
        callbackGasLimit = _callbackGasLimit;
        requestConfirmations = _requestConfirmations;
        ticketPrice = _ticketPrice;
        platformWallet = _platformWallet;
        charityWallet = _charityWallet;
        platformFeeBps = 500;
        charityBps = 4000;
        prizeBps = 5500;
        _startNewDraw();
    }

    function _startNewDraw() internal {
        currentDrawId++;
        draws[currentDrawId] = Draw({
            state: DrawState.BUILDING,
            ticketCount: 0,
            prizePool: 0,
            jackpotReserve: 0,
            winningNumbers: [0, 0, 0, 0, 0],
            requestId: 0,
            winners5: 0,
            winners4: 0,
            winners3: 0
        });
    }

    function buyTicket(uint16[5] calldata numbers) external returns (uint256 ticketIndex) {
        Draw storage d = draws[currentDrawId];
        require(d.state == DrawState.BUILDING, "draw not open");
        require(_validNumbers(numbers), "invalid numbers");

        paymentToken.safeTransferFrom(msg.sender, address(this), ticketPrice);

        uint256 fee = (ticketPrice * platformFeeBps) / 10000;
        uint256 charity = (ticketPrice * charityBps) / 10000;
        uint256 toPool = ticketPrice - fee - charity;
        if (fee > 0) paymentToken.safeTransfer(platformWallet, fee);
        if (charity > 0) paymentToken.safeTransfer(charityWallet, charity);
        d.prizePool += toPool;

        ticketIndex = drawTickets[currentDrawId].length;
        drawTickets[currentDrawId].push(Ticket({buyer: msg.sender, numbers: numbers, claimed: false}));
        d.ticketCount = drawTickets[currentDrawId].length;

        emit TicketPurchased(currentDrawId, ticketIndex, msg.sender, numbers);
    }

    function _validNumbers(uint16[5] calldata n) internal pure returns (bool) {
        for (uint256 i = 0; i < 5; i++) {
            if (n[i] < 1 || n[i] > POOL_SIZE) return false;
            for (uint256 j = i + 1; j < 5; j++) {
                if (n[i] == n[j]) return false;
            }
        }
        return true;
    }

    function lockAndRequestDraw() external onlyOwner returns (uint256 requestId) {
        Draw storage d = draws[currentDrawId];
        require(d.state == DrawState.BUILDING, "not building");
        require(d.ticketCount > 0, "no tickets");
        d.state = DrawState.LOCKED;
        emit DrawLocked(currentDrawId);

        requestId = COORDINATOR.requestRandomWords(
            gasLane, subscriptionId, requestConfirmations, callbackGasLimit, 1);
        d.requestId = requestId;
        d.state = DrawState.REQUESTED;
        emit RandomnessRequested(currentDrawId, requestId);
    }

    function fulfillRandomWords(uint256, uint256[] memory randomWords) internal override {
        Draw storage d = draws[currentDrawId];
        require(d.state == DrawState.REQUESTED, "not requested");

        uint256 seed = randomWords[0];
        uint16[5] memory drawn;
        bool[40] memory used;
        for (uint256 i = 0; i < PICK_COUNT; i++) {
            uint256 attempt = uint256(keccak256(abi.encodePacked(seed, i)));
            uint16 pick;
            while (true) {
                pick = uint16((attempt % POOL_SIZE) + 1);
                if (!used[pick]) { used[pick] = true; drawn[i] = pick; break; }
                attempt = uint256(keccak256(abi.encodePacked(attempt, pick)));
            }
        }
        d.winningNumbers = drawn;

        uint256 count = drawTickets[currentDrawId].length;
        for (uint256 t = 0; t < count; t++) {
            uint8 matches = _countMatches(drawTickets[currentDrawId][t].numbers, drawn);
            if (matches >= 3) {
                matchIndex[currentDrawId][matches].push(t);
                if (matches == 5) d.winners5++;
                else if (matches == 4) d.winners4++;
                else d.winners3++;
            }
        }
        d.state = DrawState.SETTLED;

        uint256 jackpotShare = (d.prizePool * prizeBps) / 10000;
        uint256 carryReserve;
        if (d.winners5 == 0) { d.jackpotReserve += jackpotShare; carryReserve = d.jackpotReserve; }
        else { carryReserve = 0; }
        emit DrawSettled(currentDrawId, drawn, d.winners5, d.winners4, d.winners3);

        _startNewDraw();
        draws[currentDrawId].jackpotReserve = carryReserve;
    }

    function _countMatches(uint16[5] memory ticket, uint16[5] memory winning) internal pure returns (uint8) {
        uint8 matches = 0;
        for (uint256 i = 0; i < 5; i++) {
            for (uint256 j = 0; j < 5; j++) {
                if (ticket[i] == winning[j]) { matches++; break; }
            }
        }
        return matches;
    }

    function claimPrize(uint256 drawId, uint256 ticketIndex) external {
        Draw storage d = draws[drawId];
        require(d.state == DrawState.SETTLED, "not settled");
        Ticket storage t = drawTickets[drawId][ticketIndex];
        require(t.buyer == msg.sender, "not owner");
        require(!t.claimed, "claimed");
        t.claimed = true;

        uint8 matches = _countMatches(t.numbers, d.winningNumbers);
        require(matches >= 3, "no prize");

        uint256 payout = _payoutFor(matches, drawId);
        require(payout > 0, "zero payout");
        paymentToken.safeTransfer(msg.sender, payout);
        emit PrizeClaimed(drawId, ticketIndex, payout);
    }

    function _payoutFor(uint8 matches, uint256 drawId) internal view returns (uint256) {
        Draw storage d = draws[drawId];
        uint256 pool = d.prizePool;
        if (matches == 5) {
            uint256 share = (pool * prizeBps) / 10000;
            if (d.winners5 == 0) return 0;
            return (share + d.jackpotReserve) / d.winners5;
        } else if (matches == 4) {
            uint256 share = (pool * 3000) / 10000;
            if (d.winners4 == 0) return 0;
            return share / d.winners4;
        } else if (matches == 3) {
            uint256 share = (pool * 1500) / 10000;
            if (d.winners3 == 0) return 0;
            return share / d.winners3;
        }
        return 0;
    }

    function setRevenueSplit(uint256 _platformFeeBps, uint256 _charityBps, uint256 _prizeBps) external onlyOwner {
        require(_platformFeeBps + _charityBps + _prizeBps <= 10000, "split exceeds 100%");
        platformFeeBps = _platformFeeBps;
        charityBps = _charityBps;
        prizeBps = _prizeBps;
    }

    function setTicketPrice(uint256 _price) external onlyOwner { ticketPrice = _price; }
    function setWallets(address _platform, address _charity) external onlyOwner {
        platformWallet = _platform;
        charityWallet = _charity;
    }
    function getDrawTickets(uint256 drawId) external view returns (Ticket[] memory) { return drawTickets[drawId]; }
}`;

export const ESCROW_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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
        uint256 govAmount;
        uint256 pricePerGov;
        address paymentToken;
        bool active;
    }

    IERC20 public immutable govToken;
    address public immutable platformTreasury;
    uint16 public platformFeeBps;
    address public owner;

    IVRFCoordinator public vrfCoordinator;
    bytes32 public vrfKeyHash;
    uint64 public vrfSubId;
    uint32 public vrfCallbackGasLimit;

    uint256 public nextListingId = 1;
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => uint256) public batchRandomness;

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

    function setFee(uint16 _bps) external onlyOwner { require(_bps <= 1000, "fee too high"); platformFeeBps = _bps; emit FeeUpdated(_bps); }
    function setVRF(address _coord, bytes32 _keyHash, uint64 _subId, uint32 _gasLimit) external onlyOwner {
        vrfCoordinator = IVRFCoordinator(_coord);
        vrfKeyHash = _keyHash;
        vrfSubId = _subId;
        vrfCallbackGasLimit = _gasLimit;
    }

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

    function buy(uint256 listingId) external {
        Listing storage l = listings[listingId];
        require(l.active, "not active");
        uint256 total = (uint256(l.govAmount) * l.pricePerGov) / 1e18;
        require(total > 0, "zero total");
        uint256 fee = (total * platformFeeBps) / 10000;
        uint256 toSeller = total - fee;
        l.active = false;
        IERC20 pay = IERC20(l.paymentToken);
        require(pay.transferFrom(msg.sender, l.seller, toSeller), "seller pay failed");
        if (fee > 0) require(pay.transferFrom(msg.sender, platformTreasury, fee), "fee pay failed");
        require(govToken.transfer(msg.sender, l.govAmount), "gov transfer failed");
        emit Purchased(listingId, msg.sender, l.govAmount, total, fee);
    }

    function requestBatchRandomness() external onlyOwner returns (uint256 reqId) {
        require(address(vrfCoordinator) != address(0), "vrf not set");
        reqId = vrfCoordinator.requestRandomWords(vrfKeyHash, vrfSubId, 3, vrfCallbackGasLimit, 1);
        return reqId;
    }

    function rawFulfillRandomWords(uint256, uint256[] memory randomWords) external {
        require(msg.sender == address(vrfCoordinator), "only vrf");
        uint256 batchId = nextListingId;
        batchRandomness[batchId] = randomWords[0];
        emit BatchSettled(batchId, randomWords[0]);
    }
}`;