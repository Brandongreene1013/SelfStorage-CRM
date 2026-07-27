import { supabase } from './supabase.js';

const API = '/api/salesforce-import';
const STORAGE_KEY = 'storage-hunters:salesforce-import-session';

async function request(action, payload = {}) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Salesforce import request failed.');
    error.validationErrors = data.validationErrors || [];
    throw error;
  }
  return data;
}

export async function getSalesforceImportConfig() {
  const response = await fetch(`${API}?action=config`, { cache: 'no-store' });
  return response.ok ? response.json() : { enabled: false };
}

export function loadStoredImportCredentials() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}

export function storeImportCredentials(credentials) {
  if (credentials) localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
  else localStorage.removeItem(STORAGE_KEY);
}

export function clipboardImageFiles(clipboardData) {
  return Array.from(clipboardData?.items || [])
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item, index) => {
      const file = item.getAsFile();
      if (!file) return null;
      return new File([file], file.name || `salesforce-paste-${Date.now()}-${index + 1}.png`, {
        type: file.type,
      });
    })
    .filter(Boolean);
}

export async function createSalesforceImport(method = 'clipboard_screenshot') {
  const result = await request('create', { method });
  storeImportCredentials({ importId: result.session.id, capabilityToken: result.capabilityToken });
  return result;
}

export async function loadSalesforceImport(credentials) {
  return request('load', credentials);
}

export async function uploadSalesforceImage(credentials, file) {
  const signed = await request('upload-url', {
    ...credentials,
    mimeType: file.type,
    fileSize: file.size,
  });
  const { error } = await supabase.storage
    .from('salesforce-imports')
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
  if (error) throw new Error('The screenshot upload failed. Please try again.');
  return request('confirm-image', { ...credentials, ...signed });
}

export const salesforceImportAction = request;
