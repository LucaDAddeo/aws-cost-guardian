import { useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { apiClient } from '../api/client';

const REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
];

const SERVICES = [
  'EC2',
  'RDS',
  'S3',
  'Lambda',
  'ECS',
  'EBS',
  'NAT Gateway',
  'Elastic Load Balancing',
];

export function Filters() {
  const { dispatch } = useAppContext();
  const [region, setRegion] = useState('');
  const [service, setService] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const applyFilters = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const costs = await apiClient.getCosts({
        region: region || undefined,
        service: service || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      dispatch({ type: 'SET_COST_DATA', payload: costs });
    } catch {
      // Error handled by Notification component
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [dispatch, region, service, startDate, endDate]);

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div>
        <label htmlFor="filter-region" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
          Region
        </label>
        <select
          id="filter-region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          style={{ padding: '6px 12px' }}
        >
          <option value="">All Regions</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-service" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
          Service
        </label>
        <select
          id="filter-service"
          value={service}
          onChange={(e) => setService(e.target.value)}
          style={{ padding: '6px 12px' }}
        >
          <option value="">All Services</option>
          {SERVICES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-start-date" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
          Start Date
        </label>
        <input
          id="filter-start-date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{ padding: '6px 12px' }}
        />
      </div>

      <div>
        <label htmlFor="filter-end-date" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
          End Date
        </label>
        <input
          id="filter-end-date"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={{ padding: '6px 12px' }}
        />
      </div>

      <button onClick={applyFilters} style={{ padding: '6px 16px', height: 'fit-content' }}>
        Apply Filters
      </button>
    </div>
  );
}
