# AgriChain — Autonomous Engineering & Deployment Progress

**Project:** AgriChain — Blockchain-Based Supply Chain Transparency for Agricultural Produce  
**Status:** All 7 Fix Batches Complete & Verified | 100% Test Pass Rate | Prepared for Public Deployment & Ethereum Sepolia  
**Checkpoint Commit:** `db238d2` (Git master)  

---

## 1. Summary of Completed Batches & Root Causes Fixed

### Batch 1: Registration, Login, Wallet Binding & Role Authorization
* **Root Causes:**
  1. Frontend registration failed on wallet address collisions without explaining to users that their connected MetaMask account was already registered to another email.
  2. Mongoose unique indexing on `walletAddress` clashed with `null` values for Consumer/Admin roles.
  3. Case sensitivity in raw address strings caused lookup mismatches between checksummed EIP-55 addresses and lowercase strings.
  4. Users could silently attempt to link conflicting wallets without MetaMask account-switching guidance.
* **Fixes Applied:**
  * [`backend/src/controllers/auth.controller.js`](backend/src/controllers/auth.controller.js):
    * Standardized all wallet addresses using `ethers.getAddress(addr)` (EIP-55 checksumming).
    * Enforced role restrictions: only `FARMER`, `DISTRIBUTOR`, and `RETAILER` bind wallets; `CONSUMER` and `ADMIN` remain strictly zero-wallet (`null`).
    * Blocked silent re-linking of already bound accounts with clear 400 error: `"Wallet binding cannot be changed. Please switch MetaMask to your registered wallet."`
    * Added HTTP 409 Conflict handling for duplicate wallet binding attempts across different accounts.
  * [`frontend/src/pages/RegisterPage.jsx`](frontend/src/pages/RegisterPage.jsx):
    * Added clear, friendly error messages explaining wallet collisions and offering the option to register with email/password first and bind wallet later.
  * [`backend/src/models/User.js`](backend/src/models/User.js):
    * Verified sparse partial index for `walletAddress` so `null` values never collide.

### Batch 2: Farmer Batch Creation, Receipt Verification & Draft Reconciliation
* **Root Causes:**
  1. Ethers v6 log parsing failed to extract `batchId` if log structures differed between named args and positional arrays.
  2. If on-chain transaction mining failed or was rejected in MetaMask, unconfirmed `#Draft` records remained permanently in MongoDB, cluttering the farmer's dashboard.
* **Fixes Applied:**
  * [`frontend/src/pages/FarmerDashboard.jsx`](frontend/src/pages/FarmerDashboard.jsx):
    * Enhanced log parsing to extract `args.batchId ?? args[0]`.
    * Implemented on-chain fallback: if log receipt filtering fails, queries `contract.getTotalBatches()` and verifies ownership via `contract.getBatch()`.
    * Added automatic cleanup: if the user cancels in MetaMask or transaction fails, the draft MongoDB batch is automatically purged.
    * Added a manual "Discard Draft" action (`handleDeleteDraft`) for farmers to prune any older draft records.

### Batch 3: Development Faucet Nonce Errors & Decoupled Production Flow
* **Root Causes:**
  1. `devFaucet.service.js` used a cached, persistent `NonceManager` that became desynchronized (`NONCE_EXPIRED` / replacement fee errors) whenever multiple transactions were submitted quickly or when the node was restarted.
  2. Production / Sepolia environments must never run local development faucets with fixed Hardhat accounts.
* **Fixes Applied:**
  * [`backend/src/services/devFaucet.service.js`](backend/src/services/devFaucet.service.js):
    * Switched from static nonce caching to dynamic on-chain pending nonce resolution: `provider.getTransactionCount(faucetWallet.address, 'pending')`.
    * Added production and live-network guards: refuses execution if `NODE_ENV === 'production'` or if network chain ID is Sepolia (`11155111`).
  * [`frontend/src/context/Web3Context.jsx`](frontend/src/context/Web3Context.jsx):
    * Fixed duplicate API path concatenation (`/api/v1/api/v1`) in faucet requests by using centralized `apiRequest()`.

### Batch 4: Distributor & Retailer Purchase Flows & Quantity Accounting
* **Root Causes:**
  1. Marketplace dashboards did not filter out sold batches or lots with `remainingQuantity <= 0`.
  2. Transaction sender verification in `batch.controller.js` checked event names before verifying the transaction sender's identity, causing 400 errors instead of proper 403 authorization rejections.
  3. When batches progressed on-chain, historical custody transfer endpoints rejected the transaction signer if `confirmedOwner` was read solely as the *latest* on-chain owner.
* **Fixes Applied:**
  * [`frontend/src/pages/DistributorDashboard.jsx`](frontend/src/pages/DistributorDashboard.jsx) & [`frontend/src/pages/RetailerDashboard.jsx`](frontend/src/pages/RetailerDashboard.jsx):
    * Updated `isAvailableToPurchase` predicate to strictly exclude batches with status `SOLD`, `RECALLED`, or `remainingQuantity <= 0`.
  * [`backend/src/controllers/batch.controller.js`](backend/src/controllers/batch.controller.js):
    * Reordered checks: transaction sender identity (`txVerification.from === actorWallet`) is checked before event type to ensure immediate 403 rejection for wallet mismatches.
    * In custody transfers, verified transaction signer (`txVerification.from === actorWallet`) is recognized as the authorized buyer even if the batch subsequently progressed on-chain.
    * Added proactive stale batch detection: if a batch ID does not exist on the current active contract (`!onChainData`), returns HTTP 400 with `isStaleBatch: true` before executing further operations.
  * [`backend/src/services/blockchain.service.js`](backend/src/services/blockchain.service.js):
    * Included `receipt.from` in unverified receipt returns to allow upstream controller identity guards.

### Batch 5: Consumer QR Generation & Public Verification
* **Root Causes:**
  1. Base QR verification URLs exposed private LAN addresses (e.g. `10.x.x.x` or `192.168.x.x`) that are inaccessible to public consumer mobile phones when deployed.
  2. Consumer verification UI badges were hardcoded to localhost / local hardhat node.
* **Fixes Applied:**
  * [`backend/src/services/qr.service.js`](backend/src/services/qr.service.js):
    * In production (`NODE_ENV === 'production'`), strictly enforces `PUBLIC_CLIENT_URL` (HTTPS or public HTTP domain) and explicitly rejects localhost or private RFC-1918 IPs.
  * [`frontend/src/pages/ConsumerVerifyPage.jsx`](frontend/src/pages/ConsumerVerifyPage.jsx):
    * Updated network badge and blockchain proof panel to display `Ethereum Sepolia Testnet (Chain ID 11155111)` cleanly without hardcoded localhost assumptions.
    * Public verification works seamlessly with zero authentication and zero wallet connection required.

### Batch 6: Sepolia Network Configuration, Deployment Scripts & Network Guards
* **Fixes Applied:**
  * [`contracts/hardhat.config.cjs`](contracts/hardhat.config.cjs):
    * Added `sepolia` network configuration with chain ID `11155111`, configurable RPC URL via `process.env.SEPOLIA_RPC_URL`, and accounts configured safely via `process.env.SEPOLIA_PRIVATE_KEY` / `DEPLOYER_PRIVATE_KEY`.
    * Added `deploy:sepolia` script in `contracts/package.json`.
  * [`contracts/scripts/verify-deployment.js`](contracts/scripts/verify-deployment.js):
    * Created automated deployment verification script that reads bytecode, owner, minimum purchase quantity, total batches, and paused state directly on-chain.
  * [`frontend/src/context/Web3Context.jsx`](frontend/src/context/Web3Context.jsx) & [`frontend/src/components/Navbar.jsx`](frontend/src/components/Navbar.jsx):
    * Added automated network switcher supporting both Hardhat Localhost (31337) and Ethereum Sepolia (11155111).
    * Displays prominent "Switch to Sepolia Network" button in Navbar whenever MetaMask is connected to an unsupported chain.
  * Canonical Configuration Synchronization:
    * Deployment script [`contracts/scripts/deploy.js`](contracts/scripts/deploy.js) automatically writes contract address and ABI to all 3 paths: `shared/contractData.json`, `backend/src/config/contractData.json`, and `frontend/src/contractData.json`.

### Batch 7: Free-Tier Public Hosting Configuration
* **Fixes Applied:**
  * **Frontend (Vercel / Cloudflare Pages):**
    * Configured [`frontend/vercel.json`](frontend/vercel.json) with single-page app rewrites (`/(.*) -> /index.html`).
    * Verified production build: `dist/index.html` and assets built with 0 errors.
  * **Backend (Render / Railway / Fly.io):**
    * Production-aware CORS in [`backend/src/server.js`](backend/src/server.js) parses comma-separated `ALLOWED_ORIGINS` or `CLIENT_URL`.
    * Health check endpoint at `/api/v1/health`.
  * **Environment Templates:**
    * Clean templates without secrets created in `contracts/.env.example`, `backend/.env.example`, and `frontend/.env.example`.

---

## 2. Actual Test Results Run & Verified

| Test Suite | Command | Result | Notes |
| :--- | :--- | :--- | :--- |
| **Solidity Smart Contracts** | `npm test` in `contracts/` | **11/11 Passing (3s)** | All core supply chain, custody, and lot purchase tests verified |
| **Database System** | `npm run db:verify` in `backend/` | **4/4 Passing** | MongoDB Atlas schema, indexes, and connections verified |
| **Backend REST API** | `npm run test:api` in `backend/` | **100% Passing (200 OK)** | Auth, batches, admin stats, and health checks verified |
| **Retailer Shelf Tag Pricing** | `npm run test:shelf-tag` in `backend/` | **5/5 Passing** | Chronological price resolution, formatting, and live API verified |
| **Role-Based MetaMask Binding** | `npm run test:wallet-binding` in `backend/` | **18/18 Passing (100%)** | Farmer/Dist/Retailer binding, unique isolation, and account guards |
| **Multi-Role Parallel Lifecycle** | `npm run test:multi-role` in `backend/` | **100% Passing** | 6 independent accounts across 2 parallel batches from farm to retail |
| **Strict Blockchain Security Flow** | `npm run test:security` in `backend/` | **100% Passing** | Unilateral push prevention, price guards, fake tx rejection, stale checks |
| **On-Chain Contract Verification** | `npx hardhat run scripts/verify-deployment.js` | **PASSED** | Bytecode length (24,888 bytes), owner, counters verified on-chain |
| **Frontend Production Bundle** | `npm run build` in `frontend/` | **0 Errors (Vite v5.4.21)** | Production bundle ready for static CDN deployment |

---

## 3. Four-Account Testing Strategy (Zero Account Waste)

To test the entire decentralized supply chain using your 4 available MetaMask accounts:

| Account | Assigned Role | Application Email | Purpose & Workflow |
| :---: | :---: | :---: | :--- |
| **Account #1** | **Farmer** | `farmer@agrichain.com` | Creates batches, pays gas for `createBatch`, generates QR codes, verifies draft cleanup. |
| **Account #2** | **Distributor** | `distributor@agrichain.com` | Accepts farm produce, pays gas for `acceptPurchase`, applies wholesale markup via `updateSellingPrice`. |
| **Account #3** | **Retailer** | `retailer@agrichain.com` | Accepts distributor shipment, pays gas for `acceptPurchase`, sets final shelf price via `updateSellingPrice`. |
| **Account #4** | **Consumer / Admin** | `consumer@agrichain.com` or Unauthenticated | Scans QR codes, views public provenance, price history, and on-chain verification proof (**0 gas, 0 wallet needed**). Also logs into Admin (`admin@agrichain.com`) to audit price spreads. |

*Why 4 accounts are sufficient:*
The Consumer and Admin roles **never require or bind a blockchain wallet**. They read verified data from public endpoints and the blockchain provider directly. Thus, exactly 3 funded Web3 wallets (Farmer, Distributor, Retailer) execute transactions, and the 4th account verifies the entire consumer and admin journey.

---

## 4. Exact Next Task & Items Requiring User Approval / Secrets

The application is completely repaired, tested, and ready. Before deploying to public infrastructure, the following external items are needed:

1. **Sepolia Deployer Wallet Private Key & Testnet RPC:**
   * Enter your Sepolia RPC URL (Alchemy / Infura / QuickNode) in `contracts/.env`:
     ```env
     SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY"
     SEPOLIA_PRIVATE_KEY="0xYOUR_TESTNET_PRIVATE_KEY"
     ```
   * *Safety Note:* Ensure the wallet has at least ~0.05 Sepolia test ETH (obtainable from [sepoliafaucet.com](https://sepoliafaucet.com) or [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)).

 2. **Sepolia Contract Live Status:**
    * Contract deployed at: `0x885F3caB2121FC22C99a7e70a206b758619542B9`
    * Network: Ethereum Sepolia (Chain ID: `11155111`)
    * Contract verified on-chain: 24,888 bytes bytecode, 0 errors.

### Batch 8: Resolution of MetaMask `redeemDelegations` & Network Synchronization
* **Root Cause:**
  * MetaMask v12+ on Chromium/Edge enables an experimental "Smart Transactions" / Smart Account delegation feature (ERC-7710 / EIP-7702). When active, MetaMask wraps normal `eth_sendTransaction` calls inside a relayer/delegation manager invoking `redeemDelegations(delegations, modes, executions)` with bloated gas estimates.
* **Fixes Implemented:**
  1. **Frontend (`FarmerDashboard.jsx`, `DistributorDashboard.jsx`, `RetailerDashboard.jsx`):**
     * Implemented pre-flight gas estimation with explicit bounded gasLimit overrides (`gasLimit: 700000n` max).
     * Added detection and error guidance for delegation wrappers.
  2. **Backend Web3 Provider (`backend/src/lib/web3.js` & `backend/.env`):**
     * Pointed `RPC_URL` to Sepolia Alchemy endpoint (`https://eth-sepolia.g.alchemy.com/v2/alch_ufs43TVrKpgmCnvLwEITE`).
     * Added automatic dynamic fallback to ensure transaction receipt verification on Sepolia succeeds.
  3. **Frontend Configuration (`frontend/.env`):**
     * Created production-ready `.env` targeting Sepolia Chain ID `11155111` and contract `0x885F3caB2121FC22C99a7e70a206b758619542B9`.
* **Testing & Build Verification:**
  * Frontend build: `vite build` completed in 21s with 0 errors.
  * Smart Contract tests: 11/11 passing.
  * On-chain contract verification: Passed.
  * Git commit: `5ab2516`.

3. **Deploy Backend (Render / Railway / Fly.io):**
   * Push repository to GitHub.
   * Create a Web Service on Render / Railway pointing to root directory with build command `cd backend && npm install` and start command `cd backend && npm start`.
   * Provide Environment Variables:
     * `MONGODB_URI`: Your MongoDB Atlas URI.
     * `JWT_SECRET`: Random 32+ character string.
     * `NODE_ENV`: `production`
     * `RPC_URL`: `https://eth-sepolia.g.alchemy.com/v2/alch_ufs43TVrKpgmCnvLwEITE`
     * `PUBLIC_CLIENT_URL`: Your Vercel frontend URL (e.g. `https://agrichain.vercel.app`).
     * `ALLOWED_ORIGINS`: Your Vercel frontend URL.

4. **Deploy Frontend (Vercel):**
   * Import repository into Vercel. Set Root Directory to `frontend`.
   * Set Environment Variables:
     * `VITE_API_URL`: `https://your-backend.onrender.com/api/v1`
     * `VITE_CONTRACT_ADDRESS`: `0x885F3caB2121FC22C99a7e70a206b758619542B9`
     * `VITE_CHAIN_ID`: `11155111`
     * `VITE_RPC_URL`: `https://eth-sepolia.g.alchemy.com/v2/alch_ufs43TVrKpgmCnvLwEITE`
   * Deploy!

