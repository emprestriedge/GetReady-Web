import { configStore } from './configStore';

/**
 * ContentIdStore - Proxy for show IDs. 
 * In the new unified config, these are stored in a simple key-value store 
 * or alongside the podcast objects. For backward compatibility, we use 
 * a dedicated namespace in localStorage that we migrate if needed, 
 * but now we prefer writing to the unified store's 'metadata' bucket 
 * or just keeping the existing keys but ensuring they are logged.
 */
export const ContentIdStore = {
  get: (key: string): string => {
    return localStorage.getItem(`spotify_buddy_id_${key}`) || "";
  },
  set: (key: string, value: string): void => {
    localStorage.setItem(`spotify_buddy_id_${key}`, value);
    // Since this is a critical link, we trigger a dummy update to ensure 
    // components depending on readiness refresh.
    configStore.updateConfig({}); 
  },
  clear: (key: string): void => {
    localStorage.removeItem(`spotify_buddy_id_${key}`);
    configStore.updateConfig({});
  }
};