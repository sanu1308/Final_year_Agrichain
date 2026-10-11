import React, {
  createContext,
  useContext,
  useState,
  useEffect,
} from 'react';

import { apiRequest } from '../config/api';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(
    localStorage.getItem('agrichain_token')
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await apiRequest('/auth/me');
        setUser(data.user);
      } catch (err) {
        console.warn(
          'Session expired or invalid token:',
          err
        );

        logout();
      } finally {
        setIsLoading(false);
      }
    }

    loadUser();
  }, [token]);

  const login = async (email, password) => {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
      }),
    });

    localStorage.setItem(
      'agrichain_token',
      data.token
    );

    setToken(data.token);
    setUser(data.user);

    return data.user;
  };

  const register = async (userData) => {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    localStorage.setItem(
      'agrichain_token',
      data.token
    );

    setToken(data.token);
    setUser(data.user);

    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('agrichain_token');
    setToken(null);
    setUser(null);
  };

  /*
   * Link or change the MetaMask wallet associated
   * with the currently logged-in account.
   */
  const updateUserWallet = async (walletAddress) => {
    if (!walletAddress) {
      throw new Error('Wallet address is required.');
    }

    const data = await apiRequest('/auth/link-wallet', {
      method: 'POST',
      body: JSON.stringify({
        walletAddress,
      }),
    });

    /*
     * Backend issues a fresh JWT after wallet update.
     * Store the new token immediately.
     */
    if (data.token) {
      localStorage.setItem(
        'agrichain_token',
        data.token
      );

      setToken(data.token);
    }

    /*
     * Backend also returns the complete updated user.
     * Use it directly so walletAddress and any other
     * updated user fields stay synchronized.
     */
    if (data.user) {
      setUser(data.user);
    } else {
      /*
       * Fallback in case backend only returns walletAddress.
       */
      setUser((currentUser) => {
        if (!currentUser) {
          return currentUser;
        }

        return {
          ...currentUser,
          walletAddress: data.walletAddress,
        };
      });
    }

    return data.user || {
      ...user,
      walletAddress: data.walletAddress,
    };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        updateUserWallet,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used within an AuthProvider'
    );
  }

  return context;
};