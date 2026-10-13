// "Who am I?" for the demo. There is no real login; you pick a client in the top bar and
// every screen that needs a client (Fund Gig, Audit Trail) uses that one.
// The choice is remembered in the browser (localStorage) so a page refresh keeps it.
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const ActorContext = createContext(null);
const KEY = 'gigtask.actor';

export function ActorProvider({ children }) {
  const [actor, setActorState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  });

  const setActor = a => {
    setActorState(a);
    try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage blocked: still works for this tab */ }
  };

  // First visit: pick the first client so screens have someone to act as.
  useEffect(() => {
    if (!actor) api('/clients', { query: { limit: 1 } }).then(r => r.data[0] && setActor(r.data[0])).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <ActorContext.Provider value={{ actor, setActor }}>{children}</ActorContext.Provider>;
}

export const useActor = () => useContext(ActorContext);
