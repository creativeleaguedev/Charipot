// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Chari
 * @notice 5/39 community lottery with cryptographic randomness via Chainlink VRF v2.
 *         Accepts USDC or USDT ticket purchases, accumulates a prize pool, and draws
 *         5 winning numbers from 1..39 using Chainlink VRF. Prize tiers: 5/5 (jackpot),
 *         4/5, 3/5. The platform fee and charity contribution are routed on settlement.
 *
 *         DEPLOYMENT (Hardhat/Foundry):
 *           1. npm i @chainlink/contracts @openzeppelin/contracts
 *           2. Set the VRF Coordinator address + gas lane + subscription id for your
 *              target chain (see contracts/README.md).
 *           3. Create & fund a Chainlink VRF v2 subscription at vrf.chain.link, add this
 *              contract as a consumer.
 *           4. Deploy with constructor(paymentToken, coordinator, gasLane, subscriptionId,
 *              callbackGasLimit, ticketPrice, requestConfirmations).
 *
 *         The winning numbers are derived from Chainlink VRF random words and are
 *         cryptographically unpredictable — no operator can influence the draw.
 */

import "@chainlink/contracts/src/v0.8/vrf/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Chari is VRFConsumerBaseV2, Ownable {
    using SafeERC20 for IERC20;

    VRFCoordinatorV2Interface internal immutable COORDINATOR;
    IERC20 public immutable paymentToken;

    // ---- Chainlink VRF config ----
    bytes32 public immutable gasLane;
    uint64 public immutable subscriptionId;
    uint32 public immutable callbackGasLimit;
    uint16 public immutable requestConfirmations;

    // ---- Lottery config ----
    uint256 public ticketPrice;          // in paymentToken base units
    uint256 public platformFeeBps;      // e.g. 500 = 5%
    uint256 public charityBps;           // e.g. 4000 = 40%
    uint256 public prizeBps;             // e.g. 5500 = 55% (remainder to jackpot reserve)
    address public platformWallet;
    address public charityWallet;

    uint16 public constant POOL_SIZE = 39;
    uint16 public constant PICK_COUNT = 5;

    enum DrawState { BUILDING, LOCKED, REQUESTED, SETTLED }
    struct Draw {
        DrawState state;
        uint256 ticketCount;
        uint256 prizePool;        // accumulated 4/5 + 3/5 pool
        uint256 jackpotReserve;    // rolled-over 5/5 pool
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
    mapping(uint256 => Ticket[]) public drawTickets;   // drawId -> tickets
    mapping(uint256 => mapping(uint16 => uint256[])) public matchIndex; // drawId -> matchCount -> ticket indices

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

    // ---- Buy a ticket (5 distinct numbers 1..39) ----
    function buyTicket(uint16[5] calldata numbers) external returns (uint256 ticketIndex) {
        Draw storage d = draws[currentDrawId];
        require(d.state == DrawState.BUILDING, "draw not open");
        require(_validNumbers(numbers), "invalid numbers");

        paymentToken.safeTransferFrom(msg.sender, address(this), ticketPrice);

        // revenue split
        uint256 fee = (ticketPrice * platformFeeBps) / 10000;
        uint256 charity = (ticketPrice * charityBps) / 10000;
        uint256 toPool = ticketPrice - fee - charity; // remainder feeds prize + jackpot
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

    // ---- Lock and request randomness (owner/operator only) ----
    function lockAndRequestDraw() external onlyOwner returns (uint256 requestId) {
        Draw storage d = draws[currentDrawId];
        require(d.state == DrawState.BUILDING, "not building");
        require(d.ticketCount > 0, "no tickets");
        d.state = DrawState.LOCKED;
        emit DrawLocked(currentDrawId);

        requestId = COORDINATOR.requestRandomWords(
            gasLane,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            1 // single random word; expanded cryptographically below
        );
        d.requestId = requestId;
        d.state = DrawState.REQUESTED;
        emit RandomnessRequested(currentDrawId, requestId);
    }

    // ---- Chainlink VRF callback ----
    function fulfillRandomWords(uint256 /* requestId */, uint256[] memory randomWords) internal override {
        Draw storage d = draws[currentDrawId];
        require(d.state == DrawState.REQUESTED, "not requested");

        // Cryptographically derive 5 distinct winning numbers in 1..39 from one random word.
        uint256 seed = randomWords[0];
        uint16[5] memory drawn;
        bool[40] memory used; // index 1..39
        for (uint256 i = 0; i < PICK_COUNT; i++) {
            uint256 attempt = uint256(keccak256(abi.encodePacked(seed, i)));
            uint16 pick;
            // rejection sampling for uniform distinct picks
            while (true) {
                pick = uint16((attempt % POOL_SIZE) + 1);
                if (!used[pick]) {
                    used[pick] = true;
                    drawn[i] = pick;
                    break;
                }
                attempt = uint256(keccak256(abi.encodePacked(attempt, pick)));
            }
        }
        d.winningNumbers = drawn;

        // Tally matches
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

        // Rollover: the jackpot available this draw = carried reserve + this
        // draw's share. If a 5/5 winner exists they claim the full amount via
        // _payoutFor (which adds d.jackpotReserve to the share), so nothing
        // carries. If there is no 5/5 winner, the carried reserve + this draw's
        // share roll over together to the next draw.
        uint256 jackpotShare = (d.prizePool * prizeBps) / 10000;
        uint256 carryReserve;
        if (d.winners5 == 0) {
            d.jackpotReserve += jackpotShare;
            carryReserve = d.jackpotReserve;
        } else {
            // 5/5 winners claim (jackpotShare + carried reserve); nothing rolls over.
            carryReserve = 0;
        }
        emit DrawSettled(currentDrawId, drawn, d.winners5, d.winners4, d.winners3);

        // Begin next draw, carrying any rolled-over jackpot reserve.
        _startNewDraw();
        draws[currentDrawId].jackpotReserve = carryReserve;
    }

    function _countMatches(uint16[5] memory ticket, uint16[5] memory winning) internal pure returns (uint8) {
        uint8 matches = 0;
        for (uint256 i = 0; i < 5; i++) {
            for (uint256 j = 0; j < 5; j++) {
                if (ticket[i] == winning[j]) {
                    matches++;
                    break;
                }
            }
        }
        return matches;
    }

    // ---- Claim prizes (per ticket) ----
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
            uint256 share = (pool * 3000) / 10000; // 30% to 4/5
            if (d.winners4 == 0) return 0;
            return share / d.winners4;
        } else if (matches == 3) {
            uint256 share = (pool * 1500) / 10000; // 15% to 3/5
            if (d.winners3 == 0) return 0;
            return share / d.winners3;
        }
        return 0;
    }

    // ---- Admin setters (mirror the off-chain Configuration Registry) ----
    function setRevenueSplit(uint256 _platformFeeBps, uint256 _charityBps, uint256 _prizeBps) external onlyOwner {
        require(_platformFeeBps + _charityBps + _prizeBps <= 10000, "split exceeds 100%");
        platformFeeBps = _platformFeeBps;
        charityBps = _charityBps;
        prizeBps = _prizeBps;
    }

    function setTicketPrice(uint256 _price) external onlyOwner {
        ticketPrice = _price;
    }

    function setWallets(address _platform, address _charity) external onlyOwner {
        platformWallet = _platform;
        charityWallet = _charity;
    }

    function getDrawTickets(uint256 drawId) external view returns (Ticket[] memory) {
        return drawTickets[drawId];
    }
}
