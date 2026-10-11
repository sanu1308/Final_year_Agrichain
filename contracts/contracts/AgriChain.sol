// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgriChain
 * @notice Supply chain tracking and transparency contract for agricultural produce.
 * Enforces verified provenance, immutable ownership handovers, partial-quantity lot splits, and price transparency.
 */
contract AgriChain is Ownable, Pausable, ReentrancyGuard {

    enum QualityGrade {
        GradeA,
        GradeB,
        GradeC,
        Premium,
        ExportQuality
    }

    enum BatchStatus {
        Harvested,
        InTransit,
        WithDistributor,
        WithRetailer,
        Sold,
        Recalled
    }

    struct Batch {
        uint256 id;
        string productName;
        string origin;
        address farmer;
        address currentOwner;
        uint256 quantity;      // in whole units (e.g. kg) - remaining available quantity
        string unit;           // e.g. "kg", "tons", "crates"
        QualityGrade grade;
        uint256 currentPrice;  // In integer cents (e.g., 150 = $1.50, 200 = ₹2.00)
        BatchStatus status;
        string metadataHash;   // Hash/ID anchoring off-chain record
        uint256 createdAt;
        bool exists;
        uint256 parentBatchId; // 0 for original batches; references parent lot if derived
    }

    struct CustodyRecord {
        address from;
        address to;
        uint256 price;
        BatchStatus status;
        string location;
        uint256 timestamp;
        string notes;
        uint256 quantity;      // transferred or active quantity for this event
    }

    uint256 private _batchIdCounter;

    // Configurable minimum purchase quantity (default 10 units/kg)
    uint256 public minPurchaseQuantity = 10;

    // batchId => Batch
    mapping(uint256 => Batch) private _batches;

    // batchId => CustodyRecord[]
    mapping(uint256 => CustodyRecord[]) private _batchHistory;

    // Events
    event BatchCreated(
        uint256 indexed batchId,
        string productName,
        address indexed farmer,
        uint256 quantity,
        QualityGrade grade,
        uint256 price,
        uint256 timestamp
    );

    event BatchTransferred(
        uint256 indexed batchId,
        address indexed from,
        address indexed to,
        uint256 newPrice,
        BatchStatus newStatus,
        string location,
        uint256 timestamp
    );

    event PurchaseAccepted(
        uint256 indexed batchId,
        address indexed seller,
        address indexed buyer,
        uint256 acceptedPrice,
        BatchStatus newStatus,
        uint256 timestamp
    );

    event LotPurchased(
        uint256 indexed parentBatchId,
        uint256 indexed newBatchId,
        address indexed seller,
        address buyer,
        uint256 quantity,
        uint256 price,
        BatchStatus newStatus,
        uint256 timestamp
    );

    event BatchStatusUpdated(
        uint256 indexed batchId,
        BatchStatus newStatus,
        uint256 newPrice,
        string notes,
        uint256 timestamp
    );

    event BatchRecalled(
        uint256 indexed batchId,
        address indexed caller,
        string reason,
        uint256 timestamp
    );

    event MinPurchaseQuantityUpdated(
        uint256 oldMin,
        uint256 newMin,
        uint256 timestamp
    );

    modifier batchExists(uint256 batchId) {
        require(_batches[batchId].exists, "AgriChain: Batch does not exist");
        _;
    }

    modifier onlyBatchOwner(uint256 batchId) {
        require(
            _batches[batchId].currentOwner == msg.sender,
            "AgriChain: Caller is not current batch owner"
        );
        _;
    }

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Allows contract owner to adjust minimum purchase quantity rule
     */
    function setMinPurchaseQuantity(uint256 newMin) external onlyOwner {
        require(newMin > 0, "AgriChain: Minimum purchase must be greater than zero");
        uint256 old = minPurchaseQuantity;
        minPurchaseQuantity = newMin;
        emit MinPurchaseQuantityUpdated(old, newMin, block.timestamp);
    }

    /**
     * @notice Creates a new produce batch on the blockchain
     */
    function createBatch(
        string calldata productName,
        string calldata origin,
        uint256 quantity,
        string calldata unit,
        QualityGrade grade,
        uint256 initialPrice,
        string calldata metadataHash
    ) external whenNotPaused nonReentrant returns (uint256) {
        require(bytes(productName).length > 0, "Product name cannot be empty");
        require(quantity > 0, "Quantity must be greater than 0");
        require(bytes(origin).length > 0, "Origin cannot be empty");

        _batchIdCounter++;
        uint256 newBatchId = _batchIdCounter;

        _batches[newBatchId] = Batch({
            id: newBatchId,
            productName: productName,
            origin: origin,
            farmer: msg.sender,
            currentOwner: msg.sender,
            quantity: quantity,
            unit: unit,
            grade: grade,
            currentPrice: initialPrice,
            status: BatchStatus.Harvested,
            metadataHash: metadataHash,
            createdAt: block.timestamp,
            exists: true,
            parentBatchId: 0
        });

        _batchHistory[newBatchId].push(CustodyRecord({
            from: address(0),
            to: msg.sender,
            price: initialPrice,
            status: BatchStatus.Harvested,
            location: origin,
            timestamp: block.timestamp,
            notes: "Harvested & Batch Registered by Farmer",
            quantity: quantity
        }));

        emit BatchCreated(
            newBatchId,
            productName,
            msg.sender,
            quantity,
            grade,
            initialPrice,
            block.timestamp
        );

        return newBatchId;
    }

    /**
     * @notice Allows a buyer (Distributor or Retailer) to purchase a partial or full quantity from an available batch.
     * Decrements the parent batch quantity (which remains owned by the seller) and creates a new child lot
     * owned by the buyer with preserved origin, quality, and lineage referencing the parent batch.
     */
    function purchaseLot(
        uint256 parentBatchId,
        uint256 purchaseQuantity,
        uint256 expectedPrice,
        BatchStatus newStatus,
        string calldata location,
        string calldata notes
    ) external whenNotPaused nonReentrant batchExists(parentBatchId) returns (uint256) {
        Batch storage parent = _batches[parentBatchId];
        require(
            parent.status != BatchStatus.Sold && parent.status != BatchStatus.Recalled,
            "AgriChain: Batch is already terminal (Sold or Recalled)"
        );
        require(msg.sender != parent.currentOwner, "AgriChain: Current owner cannot purchase their own batch");
        require(msg.sender != address(0), "AgriChain: Invalid buyer address");
        require(parent.currentPrice == expectedPrice, "AgriChain: Price mismatch: offered price has changed");

        // Validate state transitions
        if (parent.status == BatchStatus.Harvested) {
            require(
                newStatus == BatchStatus.InTransit || newStatus == BatchStatus.WithDistributor,
                "AgriChain: Invalid status transition for distributor purchase"
            );
        } else if (parent.status == BatchStatus.InTransit || parent.status == BatchStatus.WithDistributor) {
            require(
                newStatus == BatchStatus.WithRetailer,
                "AgriChain: Invalid status transition for retailer purchase"
            );
        } else {
            revert("AgriChain: Batch is not currently available for purchase");
        }

        // Rule A: Quantity must be > 0
        require(purchaseQuantity > 0, "AgriChain: Purchase quantity must be greater than zero");

        // Rule B: Cannot exceed available quantity
        require(purchaseQuantity <= parent.quantity, "AgriChain: Purchase quantity exceeds available batch quantity");

        // Rules C & D: If not purchasing the entire remaining quantity, enforce minimum and prevent unsellable remainder
        if (purchaseQuantity < parent.quantity) {
            require(
                purchaseQuantity >= minPurchaseQuantity,
                "AgriChain: Purchase quantity is below minimum allowed purchase"
            );
            uint256 remainingQuantity = parent.quantity - purchaseQuantity;
            require(
                remainingQuantity >= minPurchaseQuantity,
                "AgriChain: Remainder quantity would be below minimum purchase quantity"
            );
        }

        address seller = parent.currentOwner;
        address buyer = msg.sender;
        uint256 acceptedPrice = parent.currentPrice;

        // Deduct quantity from parent batch
        parent.quantity -= purchaseQuantity;
        if (parent.quantity == 0) {
            parent.status = BatchStatus.Sold;
        }

        // Record custody event on parent batch
        _batchHistory[parentBatchId].push(CustodyRecord({
            from: seller,
            to: buyer,
            price: acceptedPrice,
            status: parent.status,
            location: location,
            timestamp: block.timestamp,
            notes: notes,
            quantity: purchaseQuantity
        }));

        // Mint child lot for buyer referencing parentBatchId and original farmer
        _batchIdCounter++;
        uint256 newBatchId = _batchIdCounter;

        _batches[newBatchId] = Batch({
            id: newBatchId,
            productName: parent.productName,
            origin: parent.origin,
            farmer: parent.farmer, // Preserves original farmer
            currentOwner: buyer,   // Buyer is current owner of this lot
            quantity: purchaseQuantity,
            unit: parent.unit,
            grade: parent.grade,
            currentPrice: acceptedPrice,
            status: newStatus,
            metadataHash: parent.metadataHash,
            createdAt: block.timestamp,
            exists: true,
            parentBatchId: parentBatchId
        });

        // Initialize history on new child lot
        _batchHistory[newBatchId].push(CustodyRecord({
            from: seller,
            to: buyer,
            price: acceptedPrice,
            status: newStatus,
            location: location,
            timestamp: block.timestamp,
            notes: notes,
            quantity: purchaseQuantity
        }));

        emit LotPurchased(
            parentBatchId,
            newBatchId,
            seller,
            buyer,
            purchaseQuantity,
            acceptedPrice,
            newStatus,
            block.timestamp
        );

        emit BatchTransferred(
            newBatchId,
            seller,
            buyer,
            acceptedPrice,
            newStatus,
            location,
            block.timestamp
        );

        emit PurchaseAccepted(
            newBatchId,
            seller,
            buyer,
            acceptedPrice,
            newStatus,
            block.timestamp
        );

        return newBatchId;
    }

    /**
     * @notice Backward-compatible full batch purchase (accept entire batch).
     */
    function acceptPurchase(
        uint256 batchId,
        uint256 expectedPrice,
        BatchStatus newStatus,
        string calldata location,
        string calldata notes
    ) external whenNotPaused nonReentrant batchExists(batchId) {
        Batch storage batch = _batches[batchId];
        require(
            batch.status != BatchStatus.Sold && batch.status != BatchStatus.Recalled,
            "AgriChain: Batch is already terminal (Sold or Recalled)"
        );
        require(msg.sender != batch.currentOwner, "AgriChain: Current owner cannot purchase their own batch");
        require(msg.sender != address(0), "AgriChain: Invalid buyer address");
        require(batch.currentPrice == expectedPrice, "AgriChain: Price mismatch: offered price has changed");

        // Validate state transitions
        if (batch.status == BatchStatus.Harvested) {
            require(
                newStatus == BatchStatus.InTransit || newStatus == BatchStatus.WithDistributor,
                "AgriChain: Invalid status transition for distributor purchase"
            );
        } else if (batch.status == BatchStatus.InTransit || batch.status == BatchStatus.WithDistributor) {
            require(
                newStatus == BatchStatus.WithRetailer,
                "AgriChain: Invalid status transition for retailer purchase"
            );
        } else {
            revert("AgriChain: Batch is not currently available for purchase");
        }

        address seller = batch.currentOwner;
        address buyer = msg.sender;
        uint256 acceptedPrice = batch.currentPrice;
        uint256 transferredQuantity = batch.quantity;

        batch.currentOwner = buyer;
        batch.status = newStatus;

        _batchHistory[batchId].push(CustodyRecord({
            from: seller,
            to: buyer,
            price: acceptedPrice,
            status: newStatus,
            location: location,
            timestamp: block.timestamp,
            notes: notes,
            quantity: transferredQuantity
        }));

        emit BatchTransferred(
            batchId,
            seller,
            buyer,
            acceptedPrice,
            newStatus,
            location,
            block.timestamp
        );

        emit PurchaseAccepted(
            batchId,
            seller,
            buyer,
            acceptedPrice,
            newStatus,
            block.timestamp
        );
    }

    /**
     * @notice Allows current batch/lot owner (Distributor or Retailer) to update offered selling price.
     */
    function updateSellingPrice(
        uint256 batchId,
        uint256 newPrice,
        string calldata notes
    ) external whenNotPaused nonReentrant batchExists(batchId) onlyBatchOwner(batchId) {
        require(newPrice > 0, "AgriChain: Price must be greater than zero");
        Batch storage batch = _batches[batchId];
        require(
            batch.status != BatchStatus.Sold && batch.status != BatchStatus.Recalled,
            "AgriChain: Batch is already terminal (Sold or Recalled)"
        );

        batch.currentPrice = newPrice;

        _batchHistory[batchId].push(CustodyRecord({
            from: msg.sender,
            to: msg.sender,
            price: newPrice,
            status: batch.status,
            location: batch.origin,
            timestamp: block.timestamp,
            notes: notes,
            quantity: batch.quantity
        }));

        emit BatchStatusUpdated(
            batchId,
            batch.status,
            newPrice,
            notes,
            block.timestamp
        );
    }

    /**
     * @notice Deprecated / Disabled: Unilateral custody transfers are prohibited.
     */
    function transferCustody(
        uint256 /* batchId */,
        address /* newOwner */,
        uint256 /* newPrice */,
        BatchStatus /* newStatus */,
        string calldata /* location */,
        string calldata /* notes */
    ) external pure {
        revert("AgriChain: Unilateral transfer disabled. Buyer must call acceptPurchase or purchaseLot");
    }

    /**
     * @notice Updates status or pricing without changing ownership
     */
    function updateStatusAndPrice(
        uint256 batchId,
        BatchStatus newStatus,
        uint256 newPrice,
        string calldata notes
    ) external whenNotPaused nonReentrant batchExists(batchId) onlyBatchOwner(batchId) {
        Batch storage batch = _batches[batchId];
        batch.status = newStatus;
        batch.currentPrice = newPrice;

        _batchHistory[batchId].push(CustodyRecord({
            from: msg.sender,
            to: msg.sender,
            price: newPrice,
            status: newStatus,
            location: batch.origin,
            timestamp: block.timestamp,
            notes: notes,
            quantity: batch.quantity
        }));

        emit BatchStatusUpdated(
            batchId,
            newStatus,
            newPrice,
            notes,
            block.timestamp
        );
    }

    /**
     * @notice Emergency recall mechanism callable by current owner, contract owner, or original farmer
     */
    function recallBatch(
        uint256 batchId,
        string calldata reason
    ) external whenNotPaused batchExists(batchId) {
        Batch storage batch = _batches[batchId];
        require(
            msg.sender == batch.currentOwner || msg.sender == owner() || msg.sender == batch.farmer,
            "AgriChain: Unauthorized to recall batch"
        );

        batch.status = BatchStatus.Recalled;

        _batchHistory[batchId].push(CustodyRecord({
            from: msg.sender,
            to: address(0),
            price: batch.currentPrice,
            status: BatchStatus.Recalled,
            location: "RECALLED",
            timestamp: block.timestamp,
            notes: reason,
            quantity: batch.quantity
        }));

        emit BatchRecalled(batchId, msg.sender, reason, block.timestamp);
    }

    // View Functions for Consumers and DApps (Gas Free)

    function getBatch(uint256 batchId) external view batchExists(batchId) returns (Batch memory) {
        return _batches[batchId];
    }

    function getBatchHistory(uint256 batchId) external view batchExists(batchId) returns (CustodyRecord[] memory) {
        return _batchHistory[batchId];
    }

    function getTotalBatches() external view returns (uint256) {
        return _batchIdCounter;
    }

    function getBatchParent(uint256 batchId) external view batchExists(batchId) returns (uint256) {
        return _batches[batchId].parentBatchId;
    }

    // Circuit Breakers
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
