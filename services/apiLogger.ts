type LogEntry = {
  timestamp: string;
  method: string;
  url: string;
  status?: number;
  type: 'request' | 'response' | 'error' | 'click';
  message?: string;
};

type Listener = (logs: LogEntry[]) => void;

class ApiLogger {
  private logs: LogEntry[] = [];
  private listeners: Listener[] = [];

  private addLog(entry: Omit<LogEntry, 'timestamp'>) {
    const newEntry = { ...entry, timestamp: new Date().toLocaleTimeString() };
    // Increased buffer to 500 for better diagnostic depth
    this.logs = [newEntry, ...this.logs].slice(0, 500); 
    this.listeners.forEach(l => l(this.logs));
  }

  logRequest(method: string, url: string) {
    this.addLog({ method, url, type: 'request' });
  }

  logResponse(method: string, url: string, status: number) {
    this.addLog({ method, url, status, type: 'response' });
  }

  logError(message: string) {
    this.addLog({ method: 'ERROR', url: '', type: 'error', message });
  }

  logClick(label: string) {
    this.addLog({ method: 'CLICK', url: label, type: 'click' });
  }

  clear() {
    this.logs = [];
    this.listeners.forEach(l => l(this.logs));
  }

  subscribe(l: Listener) {
    this.listeners.push(l);
    l(this.logs);
    return () => {
      this.listeners = this.listeners.filter(x => x !== l);
    };
  }

  getLogs() {
    return this.logs;
  }
}

export const apiLogger = new ApiLogger();