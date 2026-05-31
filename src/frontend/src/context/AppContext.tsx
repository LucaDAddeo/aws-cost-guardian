import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from 'react';
import type { AWSResource, CostBreakdown } from '../types/resource';

/** Approval request pushed from the server via WebSocket. */
export interface ApprovalRequest {
  approvalId: string;
  operation: string;
  targetResource: AWSResource;
  impact: string;
  expiresAt: string;
}

/** Global application state. */
export interface AppState {
  scanResults: AWSResource[];
  costData: CostBreakdown | null;
  approvalQueue: ApprovalRequest[];
  isLoading: boolean;
}

/** Actions that can be dispatched to update state. */
export type AppAction =
  | { type: 'SET_SCAN_RESULTS'; payload: AWSResource[] }
  | { type: 'SET_COST_DATA'; payload: CostBreakdown }
  | { type: 'ADD_APPROVAL'; payload: ApprovalRequest }
  | { type: 'RESOLVE_APPROVAL'; payload: string } // approvalId
  | { type: 'SET_LOADING'; payload: boolean };

const initialState: AppState = {
  scanResults: [],
  costData: null,
  approvalQueue: [],
  isLoading: false,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_SCAN_RESULTS':
      return { ...state, scanResults: action.payload };
    case 'SET_COST_DATA':
      return { ...state, costData: action.payload };
    case 'ADD_APPROVAL':
      return { ...state, approvalQueue: [...state.approvalQueue, action.payload] };
    case 'RESOLVE_APPROVAL':
      return {
        ...state,
        approvalQueue: state.approvalQueue.filter((a) => a.approvalId !== action.payload),
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}
