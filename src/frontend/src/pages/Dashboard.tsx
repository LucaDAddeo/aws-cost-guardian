import { useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useAppContext } from '../context/AppContext';
import { apiClient } from '../api/client';
import { Filters } from '../components/Filters';
import { ChatPanel } from '../components/ChatPanel';
import { ApprovalDialog } from '../components/ApprovalDialog';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658'];

export function Dashboard() {
  const { state, dispatch } = useAppContext();
  const { costData, isLoading, approvalQueue } = state;

  useEffect(() => {
    async function loadData() {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const costs = await apiClient.getCosts();
        dispatch({ type: 'SET_COST_DATA', payload: costs });
      } catch {
        // Error handled by Notification component via API client
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
    void loadData();
  }, [dispatch]);

  const serviceChartData = costData
    ? Object.entries(costData.byService).map(([name, value]) => ({ name, value }))
    : [];

  const regionChartData = costData
    ? Object.entries(costData.byRegion).map(([name, value]) => ({ name, value }))
    : [];

  const topService = serviceChartData.length > 0
    ? serviceChartData.reduce((a, b) => (a.value > b.value ? a : b)).name
    : 'N/A';

  const currentApproval = approvalQueue[0] ?? null;

  if (isLoading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p aria-live="polite">Loading cost data...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>AWS Cost Guardian Dashboard</h1>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <SummaryCard
          title="Total Monthly Spend"
          value={costData ? `$${costData.totalCostUsd.toFixed(2)}` : '$0.00'}
        />
        <SummaryCard
          title="Month-over-Month Change"
          value={costData ? `${costData.monthOverMonthChange >= 0 ? '+' : ''}${costData.monthOverMonthChange.toFixed(1)}%` : '0%'}
        />
        <SummaryCard title="Top Service" value={topService} />
      </div>

      {/* Filters */}
      <Filters />

      {/* Charts */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
        {/* Cost by Service - Bar Chart */}
        <div style={{ flex: 1, minWidth: 400 }}>
          <h2>Cost by Service</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={serviceChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
              <Bar dataKey="value" fill="#0088FE" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cost by Region - Pie Chart */}
        <div style={{ flex: 1, minWidth: 400 }}>
          <h2>Cost by Region</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={regionChartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              >
                {regionChartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Resource List */}
      <h2>Resources by Cost</h2>
      {costData && costData.byResource.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Resource ID</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Region</th>
              <th style={thStyle}>Cost (USD)</th>
              <th style={thStyle}>% of Total</th>
            </tr>
          </thead>
          <tbody>
            {costData.byResource.map((resource) => (
              <tr key={resource.resourceId}>
                <td style={tdStyle}>{resource.resourceId}</td>
                <td style={tdStyle}>{resource.resourceType}</td>
                <td style={tdStyle}>{resource.region}</td>
                <td style={tdStyle}>${resource.costUsd.toFixed(2)}</td>
                <td style={tdStyle}>{resource.percentage.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No resource cost data available.</p>
      )}

      {/* Chat Panel */}
      <ChatPanel />

      {/* Approval Dialog */}
      {currentApproval && <ApprovalDialog approval={currentApproval} />}
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: 16,
        minWidth: 200,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 14, color: '#666' }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>{value}</div>
    </div>
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
