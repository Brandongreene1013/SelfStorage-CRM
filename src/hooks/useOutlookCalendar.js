import { useState, useEffect, useCallback } from 'react';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';

const CLIENT_ID = '16d921c2-2a04-4a95-8a96-5c84a1d3e9b3';

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: 'https://login.microsoftonline.com/organizations',
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
};

const scopes = ['Calendars.Read', 'User.Read'];

let msalInstance = null;
let msalInitialized = false;

async function getMsal() {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig);
  }
  if (!msalInitialized) {
    await msalInstance.initialize();
    await msalInstance.handleRedirectPromise();
    msalInitialized = true;
  }
  return msalInstance;
}

// Convert Graph API event to our internal meeting shape
function graphEventToMeeting(event) {
  const start = event.start?.dateTime ?? event.start?.date ?? '';
  const end   = event.end?.dateTime   ?? event.end?.date   ?? '';
  const date  = start.slice(0, 10);
  const startTime = start.length > 10 ? start.slice(11, 16) : '';
  const endTime   = end.length   > 10 ? end.slice(11, 16)   : '';

  return {
    id:        `outlook_${event.id}`,
    title:     event.subject ?? '(No title)',
    date,
    startTime,
    endTime,
    location:  event.location?.displayName ?? '',
    notes:     event.bodyPreview ?? '',
    isOutlook: true,
    outlookUrl: event.webLink ?? '',
    organizer: event.organizer?.emailAddress?.name ?? '',
    isOnline:  !!event.isOnlineMeeting,
    onlineMeetingUrl: event.onlineMeeting?.joinUrl ?? '',
  };
}

export function useOutlookCalendar() {
  const [connected, setConnected]     = useState(false);
  const [account, setAccount]         = useState(null);
  const [events, setEvents]           = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [syncing, setSyncing]         = useState(false);

  // Check if already signed in on mount
  useEffect(() => {
    getMsal().then(msal => {
      const accounts = msal.getAllAccounts();
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        setConnected(true);
      }
    }).catch(() => {});
  }, []);

  // Fetch events whenever connected
  useEffect(() => {
    if (connected && account) fetchEvents();
  }, [connected, account]);

  async function getToken() {
    const msal = await getMsal();
    const acc  = msal.getAllAccounts()[0];
    if (!acc) throw new Error('Not signed in');
    try {
      const result = await msal.acquireTokenSilent({ scopes, account: acc });
      return result.accessToken;
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        const result = await msal.acquireTokenPopup({ scopes });
        return result.accessToken;
      }
      throw e;
    }
  }

  const fetchEvents = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const token = await getToken();

      // Fetch 3 months back + 3 months forward
      const start = new Date();
      start.setMonth(start.getMonth() - 3);
      const end = new Date();
      end.setMonth(end.getMonth() + 3);

      const params = new URLSearchParams({
        startDateTime: start.toISOString(),
        endDateTime:   end.toISOString(),
        $select: 'subject,start,end,location,bodyPreview,isOnlineMeeting,onlineMeeting,webLink,organizer',
        $top: '200',
        $orderby: 'start/dateTime asc',
      });

      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/calendarView?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) throw new Error(`Graph API error: ${res.status}`);
      const data = await res.json();
      setEvents((data.value ?? []).map(graphEventToMeeting));
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }, []);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const msal  = await getMsal();
      const result = await msal.loginPopup({ scopes });
      setAccount(result.account);
      setConnected(true);
    } catch (e) {
      if (e.errorCode !== 'user_cancelled') setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      const msal = await getMsal();
      const acc  = msal.getAllAccounts()[0];
      if (acc) await msal.logoutPopup({ account: acc });
    } catch {}
    setConnected(false);
    setAccount(null);
    setEvents([]);
  }, []);

  return { connected, account, events, loading, syncing, error, connect, disconnect, fetchEvents };
}
