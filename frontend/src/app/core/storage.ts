/** localStorage tolerante a fallos (modo incógnito, almacenamiento bloqueado, etc.). */
export const local = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* sin almacenamiento: la app sigue funcionando, solo no recuerda */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignorar */
    }
  },
};
