import { useState, useEffect, useCallback } from 'react';
import { useAppContext, type ApprovalRequest } from '../context/AppContext';

interface ApprovalDialogProps {
  approval: ApprovalRequest;
}

export function ApprovalDialog({ approval }: ApprovalDialogProps) {
  const { dispatch } = useAppContext();
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isResponding, setIsResponding] = useState(false);

  useEffect(() => {
    const expiresAt = new Date(approval.expiresAt).getTime();

    function updateCountdown() {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        // Auto-cancel on timeout
        dispatch({ type: 'RESOLVE_APPROVAL', payload: approval.approvalId });
      }
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [approval.approvalId, approval.expiresAt, dispatch]);

  const handleDecision = useCallback(
    async (decision: 'approved' | 'rejected') => {
      setIsResponding(true);
      try {
        // In a real implementation, this would send via WebSocket
        // For now, we resolve the approval locally
        dispatch({ type: 'RESOLVE_APPROVAL', payload: approval.approvalId });
      } finally {
        setIsResponding(false);
      }
    },
    [approval.approvalId, dispatch]
  );

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-title"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          padding: 24,
          maxWidth: 500,
          width: '90%',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        }}
      >
        <h2 id="approval-title" style={{ marginTop: 0 }}>
          Action Approval Required
        </h2>

        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Operation:</strong> {approval.operation}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Target Resource:</strong> {approval.targetResource.resourceId} ({approval.targetResource.resourceType})
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Region:</strong> {approval.targetResource.region}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Impact:</strong> {approval.impact}
          </div>
        </div>

        <div
          style={{
            textAlign: 'center',
            padding: 12,
            backgroundColor: remainingSeconds < 60 ? '#fff3cd' : '#f8f9fa',
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 14, color: '#666' }}>Time remaining: </span>
          <span style={{ fontSize: 20, fontWeight: 'bold', color: remainingSeconds < 60 ? '#dc3545' : '#333' }}>
            {minutes}:{seconds.toString().padStart(2, '0')}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={() => handleDecision('approved')}
            disabled={isResponding || remainingSeconds <= 0}
            style={{
              padding: '10px 24px',
              backgroundColor: '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Approve
          </button>
          <button
            onClick={() => handleDecision('rejected')}
            disabled={isResponding || remainingSeconds <= 0}
            style={{
              padding: '10px 24px',
              backgroundColor: '#dc3545',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
