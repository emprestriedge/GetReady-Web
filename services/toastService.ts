
type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

type Listener = (toasts: Toast[]) => void;

class ToastService {
  private toasts: Toast[] = [];
  private listeners: Listener[] = [];

  show(message: string, type: ToastType = 'info', action?: ToastAction) {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { id, message, type, action };
    
    this.toasts = [...this.toasts, newToast];
    this.notify();

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      this.dismiss(id);
    }, 5000);
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.notify();
  }

  subscribe(l: Listener) {
    this.listeners.push(l);
    l(this.toasts);
    return () => {
      this.listeners = this.listeners.filter(x => x !== l);
    };
  }

  private notify() {
    this.listeners.forEach(l => l(this.toasts));
  }
}

export const toastService = new ToastService();
