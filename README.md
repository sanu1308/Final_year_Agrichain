# 🌾 AgriChain: Blockchain Agricultural Supply Chain Transparency

> **Problem Statement ID**: 25045  
> **Title**: Blockchain-Based Supply Chain Transparency for Agricultural Produce  
> **Status**: Hackathon-Ready MVP  

---

## 📌 Executive Summary

**AgriChain** is a decentralized, hybrid supply chain tracking platform designed to eliminate middleman exploitation, prevent produce counterfeiting, and ensure fair price transparency for farmers and consumers.

### The Core Problem:
1. **Middleman Exploitation**: Farmers receive pennies on the dollar for premium produce while intermediaries mark up prices by 150-300% without transparency.
2. **Food Fraud & Counterfeit Organic Produce**: Consumers pay premium prices for "organic" or "GI-tagged" goods with zero verifiable proof of origin.
3. **Cold-Chain Spoilage Disputes**: No immutable log exists for transport temperatures and storage conditions during transit.

---

## 🏗️ System Architecture & Data Model

AgriChain utilizes a **Pragmatic Hybrid Architecture** to balance cryptographic immutability with high-speed web performance:

```
+-------------------------------------------------------------------------+
|                              AGRICHAIN HYBRID                           |
+------------------------------------+------------------------------------+
|        ON-CHAIN (BLOCKCHAIN)       |        OFF-CHAIN (POSTGRESQL)      |
|         Source of Truth            |         High-Velocity & Rich Data  |
+------------------------------------+------------------------------------+
| * Batch ID (Unique uint256)        | * User Authentication (JWT/Bcrypt) |
| * Cryptographic Ownership Address  | * Stakeholder KYC & Profiles       |
| * Crop Name & Origin City/State    | * High-resolution Produce Images   |
| * Quantity & Unit of Measure       | * Transit Temperatures & Humidity  |
| * Quality Grade (A, B, C, Premium) | * Consumer Scan Analytics & Logs   |
| * Stage Transitions & Timestamps   | * Geo-location Map Points          |
| * Cumulative Price Markup Ledger   | * Admin Aggregations & Reports     |
+------------------------------------+------------------------------------+
```

---

## 👥 Stakeholder Roles & Pre-Seeded Demo Accounts

The platform includes **1-Click Quick Demo Login** buttons on the `/login` page:

| Role | Name / Organization | Demo Email | Password | Primary Workflow |
|---|---|---|---|---|
| **🌾 Farmer** | Ramesh Patel (Sahyadri Orchards) | `farmer@agrichain.com` | `password123` | Creates produce batch, signs on-chain tx, generates crate QR |
| **🚚 Distributor** | Apex Cold-Chain Logistics | `distributor@agrichain.com` | `password123` | Scans inbound crate, logs cold storage (4.8°C), sets transit markup |
| **🏪 Retailer** | FreshBazaar Hypermarkets | `retailer@agrichain.com` | `password123` | Accepts shipment, logs shelf price ($3.80/kg), prints shelf display tag |
| **🛡️ Admin** | National Agri-Registry Authority | `admin@agrichain.com` | `password123` | Audits middleman markups, verifies stakeholders, system health |
| **🛒 Consumer** | Ananya Sharma | `consumer@agrichain.com` | `password123` | **Zero-login required**; scans QR code directly with camera |

---

## 🚀 Quickstart: Running AgriChain Locally

### Prerequisites
- Node.js `v18+` or `v22+`
- NPM `v9+` or `v10+`
- MetaMask browser extension (optional for live signing; pre-configured demo works out-of-the-box)

---

### Step 1: Start the Local Ethereum EVM Node
In your first terminal window:
```bash
cd contracts
npm run node
```
*This starts a local Hardhat Ethereum node on `http://127.0.0.1:8545` with 20 pre-funded test accounts.*

### Step 2: Deploy the Smart Contract & Export Artifacts
In your second terminal window:
```bash
cd contracts
npm run deploy:local
```
*This deploys `AgriChain.sol` to the local node and automatically synchronizes the contract address and ABI across `shared/`, `backend/`, and `frontend/`.*

### Step 3: Start the Backend API Server & Database
In your third terminal window:
```bash
cd backend
npm run prisma:push    # Initializes database schema
npm run prisma:seed    # Populates demo users and Batch #1
npm run dev            # Starts Express API on http://localhost:5000
```

### Step 4: Start the Frontend Application
In your fourth terminal window:
```bash
cd frontend
npm run dev
```
Open **`http://localhost:5173`** in your browser!

---

## 🎯 The 4-Minute Winning Hackathon Demo Flow

1. **Minute 1: The Consumer Experience (Zero Barrier)**
   - Navigate to `http://localhost:5173/verify/1` (or click "Demo Batch #1" on the navbar).
   - Show judges the **Cryptographic Verification Badge** ("Verified against EVM contract 0x5Fb...").
   - Highlight the **Fair Value & Margin Stack**:
     - Farmer received: **$1.50/kg** (39%)
     - Logistics added: **+$0.75/kg** (20%)
     - Retail shelf price: **$3.80/kg** (41%)
   - Walk through the interactive timeline showing temperatures (4.8°C) and mined Ethereum transaction hashes.

2. **Minute 2: The Farmer's Action**
   - Click **"Sign In"** -> click **"🌾 Farmer"** (1-Click Demo Login).
   - Click **"Register New Harvest"**.
   - Enter `Organic Basmati Rice`, `Dehradun, Uttarakhand`, `1000 kg`, Price `$2.00/kg`.
   - Click **"Sign & Register Harvest"**.
   - Show the instant on-chain mining and the generated **Crate QR Code**. Click **"Download QR"** or **"Print Tag"**.

3. **Minute 3: Distributor & Retailer Custody Handover**
   - Switch persona to **"🚚 Distributor"** via the 1-click button.
   - Click **"Scan Inbound Crate"** or select the newly registered batch.
   - Enter cold chain temperature (`4.5°C`), markup price (`$2.70/kg`), and click **"Commit Custody Handover"**.
   - Switch to **"🏪 Retailer"**, accept the shipment, set shelf price (`$3.90/kg`), and click **"Print Shelf Display Tag"**.

4. **Minute 4: Governance & Integrity Audit**
   - Switch to **"🛡️ Admin"** -> view the **Middleman Price Inflation & Fair Value Auditor**.
   - Show the cumulative markup percentages across all active produce batches.

---

## 🔐 Security & Tamper Detection Model

- **Double Verification**: When a consumer views `/verify/:batchId`, the backend compares the off-chain PostgreSQL data against the immutable Ethereum smart contract. If an attacker tampers with the database, a bold **"DATA INTEGRITY WARNING: Tamper Discrepancy Detected"** alert is triggered.
- **Smart Contract Access Control**: Only the current cryptographic owner of a batch can transfer custody or alter pricing. Unauthorized third parties attempting to claim produce will revert on the EVM.
- **No Hardcoded Private Keys**: Uses environment variables and client-side MetaMask signing (`personal_sign` and contract method invocations).

---

## 📁 Repository Structure

```
agrichain/
├── contracts/             # Solidity smart contracts & Hardhat environment
│   ├── contracts/
│   │   └── AgriChain.sol  # OpenZeppelin-secured supply chain contract
│   ├── scripts/deploy.js  # Automated contract deployment & address exporter
│   └── test/              # Comprehensive test suite (100% pass)
│
├── backend/               # Express.js REST API & Prisma ORM
│   ├── prisma/            # SQLite (local zero-config) & PostgreSQL schema
│   └── src/
│       ├── controllers/   # Auth, Batch, Public Traceability, Admin
│       ├── middlewares/   # JWT verification & Role-Based Access Control
│       ├── services/      # QR code generation & Web3 blockchain verification
│       └── server.ts      # Express application entrypoint
│
├── frontend/              # React + Vite + Tailwind CSS
│   └── src/
│       ├── components/    # Navbar, StatusBadge, QRScannerModal (HTML5 camera)
│       ├── context/       # AuthContext (JWT/Roles) & Web3Context (MetaMask)
│       └── pages/         # Landing, Farmer, Distributor, Retailer, Admin, Verify
│
└── shared/                # Deployed contract ABI and address configurations
```

---

*Built with ❤️ for Problem Statement #25045.*
