import React, {
  createContext,
  useContext,
  useState,
  useEffect,
} from 'react';

import { ethers } from 'ethers';
import contractData from '../contractData.json';

const Web3Context = createContext(undefined);

export const Web3Provider = ({ children }) => {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const contractAddress =
    import.meta.env.VITE_CONTRACT_ADDRESS ||
    contractData.address ||
    '';

  /*
   * Initialize Web3 whenever MetaMask account changes.
   */
  async function reinitialize(activeAccount) {
    try {
      if (!window.ethereum || !activeAccount) {
        setProvider(null);
        setSigner(null);
        setContract(null);
        setChainId(null);
        return;
      }

      const browserProvider = new ethers.BrowserProvider(
        window.ethereum
      );

      const network = await browserProvider.getNetwork();

      /*
       * Make sure the signer belongs to the currently selected
       * MetaMask account.
       */
      const userSigner =
        await browserProvider.getSigner(activeAccount);

      setProvider(browserProvider);
      setChainId(Number(network.chainId));
      setSigner(userSigner);

      /*
       * Automatically fund low-balance wallets during local
       * Hardhat development.
       */
      if (Number(network.chainId) === 31337) {
        await fundDevelopmentWallet(activeAccount);
      }

      /*
       * Create contract instance using the currently selected
       * MetaMask account as signer.
       */
      if (contractAddress && contractData.abi) {
        const agrichainContract = new ethers.Contract(
          contractAddress,
          contractData.abi,
          userSigner
        );

        setContract(agrichainContract);
      } else {
        setContract(null);
      }
    } catch (err) {
      console.error(
        'Error reinitializing Web3:',
        err
      );

      setProvider(null);
      setSigner(null);
      setContract(null);
    }
  }

  /*
   * Development faucet.
   *
   * This is only useful on Hardhat Localhost (chain 31337).
   */
  async function fundDevelopmentWallet(walletAddress) {
    try {
      const apiBaseUrl =
        import.meta.env.VITE_API_URL ||
        `http://${window.location.hostname}:5000`;

      const response = await fetch(
        `${apiBaseUrl}/api/v1/dev/faucet`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.warn(
          'Development faucet:',
          data.error || 'Funding failed'
        );

        return null;
      }

      console.log(
        'Development faucet:',
        data.message
      );

      if (data.funded) {
        console.log(
          `Wallet funded with ${data.amountSent} ETH. Tx: ${data.transactionHash}`
        );
      }

      return data;
    } catch (err) {
      console.warn(
        'Development faucet request failed:',
        err
      );

      return null;
    }
  }

  /*
   * On initial page load:
   * silently check whether MetaMask is already connected.
   */
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !window.ethereum
    ) {
      return;
    }

    const eth = window.ethereum;

    const initializeExistingAccount = async () => {
      try {
        const accounts = await eth.request({
          method: 'eth_accounts',
        });

        if (accounts && accounts.length > 0) {
          const activeAccount =
            accounts[0].toLowerCase();

          setAccount(activeAccount);

          await reinitialize(accounts[0]);
        }
      } catch (err) {
        console.warn(
          'Silent account check error:',
          err
        );
      }
    };

    initializeExistingAccount();

    /*
     * MetaMask account changed.
     */
    const handleAccountsChanged = async (
      accounts
    ) => {
      if (accounts && accounts.length > 0) {
        const activeAccount =
          accounts[0].toLowerCase();

        /*
         * Clear old Web3 objects immediately so the UI
         * cannot temporarily use the previous wallet.
         */
        setAccount(activeAccount);
        setSigner(null);
        setContract(null);

        await reinitialize(accounts[0]);
      } else {
        /*
         * User disconnected all MetaMask accounts.
         */
        setAccount(null);
        setProvider(null);
        setSigner(null);
        setContract(null);
        setChainId(null);
      }
    };

    /*
     * MetaMask network changed.
     *
     * Reloading keeps provider, signer and contract state
     * synchronized with the new network.
     */
    const handleChainChanged = () => {
      window.location.reload();
    };

    eth.on(
      'accountsChanged',
      handleAccountsChanged
    );

    eth.on(
      'chainChanged',
      handleChainChanged
    );

    return () => {
      if (eth.removeListener) {
        eth.removeListener(
          'accountsChanged',
          handleAccountsChanged
        );

        eth.removeListener(
          'chainChanged',
          handleChainChanged
        );
      }
    };
  }, []);

  /*
   * Manually connect MetaMask.
   */
  const connectWallet = async () => {
    if (
      typeof window === 'undefined' ||
      !window.ethereum
    ) {
      setError(
        'MetaMask is not installed. Please install MetaMask to interact with the blockchain.'
      );

      return null;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const browserProvider =
        new ethers.BrowserProvider(
          window.ethereum
        );

      const accounts =
        await browserProvider.send(
          'eth_requestAccounts',
          []
        );

      if (!accounts || accounts.length === 0) {
        throw new Error(
          'No MetaMask account was selected.'
        );
      }

      const activeAccount =
        accounts[0].toLowerCase();

      const network =
        await browserProvider.getNetwork();

      /*
       * Get signer for the currently selected
       * MetaMask account.
       */
      const userSigner =
        await browserProvider.getSigner(
          accounts[0]
        );

      setAccount(activeAccount);
      setProvider(browserProvider);
      setChainId(Number(network.chainId));
      setSigner(userSigner);

      /*
       * Automatically fund low-balance wallets
       * on Hardhat Localhost.
       */
      if (Number(network.chainId) === 31337) {
        await fundDevelopmentWallet(
          accounts[0]
        );
      }

      /*
       * Create contract instance.
       */
      if (contractAddress && contractData.abi) {
        const agrichainContract =
          new ethers.Contract(
            contractAddress,
            contractData.abi,
            userSigner
          );

        setContract(agrichainContract);
      } else {
        setContract(null);
      }

      return activeAccount;
    } catch (err) {
      console.error(
        'Connect wallet failed:',
        err
      );

      setError(
        err.message ||
          'Failed to connect wallet'
      );

      return null;
    } finally {
      setIsConnecting(false);
    }
  };

  /*
   * Switch MetaMask to the AgriChain Hardhat network.
   */
  const switchNetwork = async () => {
    if (
      typeof window === 'undefined' ||
      !window.ethereum
    ) {
      return;
    }

    const targetChainId =
      import.meta.env.VITE_CHAIN_ID
        ? parseInt(
            import.meta.env.VITE_CHAIN_ID,
            10
          )
        : contractData.chainId || 31337;

    const targetChainIdHex =
      `0x${targetChainId.toString(16)}`;

    const targetRpcUrl =
      import.meta.env.VITE_RPC_URL ||
      'http://127.0.0.1:8545';

    const networkName =
      targetChainId === 31337
        ? 'Hardhat Localhost (AgriChain)'
        : `AgriChain Network (${targetChainId})`;

    try {
      await window.ethereum.request({
        method:
          'wallet_switchEthereumChain',
        params: [
          {
            chainId: targetChainIdHex,
          },
        ],
      });
    } catch (switchError) {
      /*
       * Network does not exist in MetaMask yet.
       */
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method:
              'wallet_addEthereumChain',
            params: [
              {
                chainId: targetChainIdHex,
                chainName: networkName,
                rpcUrls: [targetRpcUrl],
                nativeCurrency: {
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                },
              },
            ],
          });
        } catch (addError) {
          console.error(
            'Failed to add network:',
            addError
          );
        }
      } else {
        console.error(
          'Failed to switch network:',
          switchError
        );
      }
    }
  };

  return (
    <Web3Context.Provider
      value={{
        account,
        chainId,
        provider,
        signer,
        contract,
        isConnecting,
        error,
        connectWallet,
        switchNetwork,
        contractAddress,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => {
  const context = useContext(Web3Context);

  if (!context) {
    throw new Error(
      'useWeb3 must be used within a Web3Provider'
    );
  }

  return context;
};