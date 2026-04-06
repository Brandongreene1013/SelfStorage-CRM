import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'selfstorage_crm_clients';

const SAMPLE_DATA = [
  {
    id: uuidv4(),
    name: 'Robert Harmon',
    type: 'Seller',
    propertyType: 'Self-Storage',
    facilityName: 'Harmon Self Storage',
    address: '1420 Commerce Blvd, Atlanta, GA 30301',
    units: 350,
    sqft: 42000,
    notes: 'Motivated seller, looking to retire.',
    stageId: 5,
    documents: [],
    createdAt: new Date('2025-11-01').toISOString(),
    updatedAt: new Date('2026-01-15').toISOString(),
  },
  {
    id: uuidv4(),
    name: 'Sandra Liu',
    type: 'Buyer',
    propertyType: 'Self-Storage',
    facilityName: '',
    address: 'Dallas, TX',
    units: null,
    sqft: null,
    notes: 'Looking for value-add deals in TX or OK.',
    stageId: 3,
    documents: [],
    createdAt: new Date('2025-12-10').toISOString(),
    updatedAt: new Date('2026-02-20').toISOString(),
  },
  {
    id: uuidv4(),
    name: 'Mike Torres',
    type: 'Seller',
    propertyType: 'Boat/RV Storage',
    facilityName: 'Mesa Storage Center',
    address: '887 Industrial Dr, Phoenix, AZ 85001',
    units: 210,
    sqft: 26000,
    notes: 'Wants to close before end of Q2.',
    stageId: 8,
    documents: [],
    createdAt: new Date('2025-09-01').toISOString(),
    updatedAt: new Date('2026-03-01').toISOString(),
  },
  {
    id: uuidv4(),
    name: 'Patricia Webb',
    type: 'Seller',
    propertyType: 'Land',
    facilityName: 'Webb Family Storage',
    address: '54 Oak St, Nashville, TN 37201',
    units: 180,
    sqft: 20500,
    notes: 'Estate sale. Heirs want to liquidate.',
    stageId: 2,
    documents: [],
    createdAt: new Date('2026-01-05').toISOString(),
    updatedAt: new Date('2026-02-10').toISOString(),
  },
  {
    id: uuidv4(),
    name: 'James Okafor',
    type: 'Buyer',
    propertyType: 'Self-Storage',
    facilityName: '',
    address: 'Houston, TX',
    units: null,
    sqft: null,
    notes: 'Looking for 300+ unit properties.',
    stageId: 1,
    documents: [],
    createdAt: new Date('2026-02-01').toISOString(),
    updatedAt: new Date('2026-02-01').toISOString(),
  },
  {
    id: uuidv4(),
    name: 'Karen Nichols',
    type: 'Seller',
    propertyType: 'Self-Storage',
    facilityName: 'Sunbelt Storage LLC',
    address: '2200 Highway 90, Baton Rouge, LA 70801',
    units: 480,
    sqft: 58000,
    notes: 'Signed exclusive. Ready to market.',
    stageId: 6,
    documents: [],
    createdAt: new Date('2025-08-15').toISOString(),
    updatedAt: new Date('2026-03-10').toISOString(),
  },
];

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* ignore */ }
  return null;
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) { /* ignore */ }
}

export function useCRM() {
  const [clients, setClients] = useState(() => {
    const stored = loadFromStorage();
    return stored ?? [];
  });

  useEffect(() => {
    saveToStorage(clients);
  }, [clients]);

  const addClient = useCallback((data) => {
    const now = new Date().toISOString();
    setClients(prev => [...prev, { ...data, id: uuidv4(), createdAt: now, updatedAt: now }]);
  }, []);

  const updateClient = useCallback((id, data) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c));
  }, []);

  const deleteClient = useCallback((id) => {
    setClients(prev => prev.filter(c => c.id !== id));
  }, []);

  const moveClientToStage = useCallback((id, stageId) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, stageId, updatedAt: new Date().toISOString() } : c));
  }, []);

  return { clients, addClient, updateClient, deleteClient, moveClientToStage };
}
