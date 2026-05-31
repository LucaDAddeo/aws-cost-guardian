import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  amplifySignIn,
  amplifySignOut,
  amplifyFetchSession,
  amplifyGetCurrentUser,
} from './amplify-adapter';

interface User {
  userId: string;
  email: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
    isLoading: true,
  });

  const refreshSession = useCallback(async () => {
    try {
      const session = await amplifyFetchSession();
      if (session.accessToken) {
        const currentUser = await amplifyGetCurrentUser();
        setState({
          isAuthenticated: true,
          user: { userId: currentUser.userId, email: currentUser.email },
          token: session.accessToken,
          isLoading: false,
        });
      } else {
        setState({ isAuthenticated: false, user: null, token: null, isLoading: false });
      }
    } catch {
      setState({ isAuthenticated: false, user: null, token: null, isLoading: false });
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await amplifySignIn(email, password);
    if (result.isSignedIn) {
      await refreshSession();
    } else {
      throw new Error('Sign-in was not completed');
    }
  }, [refreshSession]);

  const logout = useCallback(async () => {
    await amplifySignOut();
    setState({ isAuthenticated: false, user: null, token: null, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div aria-label="Loading authentication">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
