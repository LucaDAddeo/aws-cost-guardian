import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

interface ActionRecord {
  operationType: string;
  targetResourceId: string;
  targetResourceType: string;
  approvalDecision: 'approved' | 'rejected' | 'timed_out';
  outcome: 'success' | 'failure';
  actionTimestamp: string;
}

export function History() {
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      setIsLoading(true);
      try {
        const data = await apiClient.getHistory();
        // Sort newest first
        const sorted = [...data].sort(
          (a, b) => new Date(b.actionTimestamp).getTime() - new Date(a.actionTimestamp).getTime()
        );
        setActions(sorted);
      } catch {
        // Error handled by Notification component
      } finally {
        setIsLoading(false);
      }
    }
    void loadHistory();
  }, []);

  if (isLoading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p aria-live="polite">Loading action history...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>Action History</h1>
        <Link to="/dashboard" style={{ textDecoration: 'none', color: '#0088FE' }}>
          ← Back to Dashboard
        </Link>
      </div>

      {actions.length === 0 ? (
        <p>No actions recorded yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Timestamp</th>
              <th style={thStyle}>Operation</th>
              <th style={thStyle}>Resource</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Decision</th>
              <th style={thStyle}>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((action, index) => (
              <tr key={`${action.actionTimestamp}-${index}`}>
                <td style={tdStyle}>
                  {new Date(action.actionTimestamp).toLocaleString()}
                </td>
                <td style={tdStyle}>{action.operationType}</td>
                <td style={tdStyle}>{action.targetResourceId}</td>
                <td style={tdStyle}>{action.targetResourceType}</td>
                <td style={tdStyle}>
                  <DecisionBadge decision={action.approvalDecision} />
                </td>
                <td style={tdStyle}>
                  <OutcomeBadge outcome={action.outcome} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DecisionBadge({ decision }: { decision: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    approved: { bg: '#d4edda', text: '#155724' },
    rejected: { bg: '#f8d7da', text: '#721c24' },
    timed_out: { bg: '#fff3cd', text: '#856404' },
  };
  const style = colors[decision] ?? { bg: '#e2e3e5', text: '#383d41' };

  return (
    <span
      style={{
        backgroundColor: style.bg,
        color: style.text,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 'bold',
      }}
    >
      {decision}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const isSuccess = outcome === 'success';
  return (
    <span
      style={{
        backgroundColor: isSuccess ? '#d4edda' : '#f8d7da',
        color: isSuccess ? '#155724' : '#721c24',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 'bold',
      }}
    >
      {outcome}
    </span>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '2px solid #ddd',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #eee',
};
