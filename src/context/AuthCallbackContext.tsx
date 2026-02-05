import { createContext, useContext } from 'react';

interface AuthCallbacks {
  onRecoveryComplete: () => void;
  onProfileCreated: () => void;
}

const AuthCallbackContext = createContext<AuthCallbacks>({
  onRecoveryComplete: () => {},
  onProfileCreated: () => {},
});

export const AuthCallbackProvider = AuthCallbackContext.Provider;
export const useAuthCallbacks = () => useContext(AuthCallbackContext);
