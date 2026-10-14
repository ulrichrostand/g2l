/** Valeur observable minimale : l'interface s'abonne et se redessine quand elle change. */
export class Observable<T> {
  private readonly listeners = new Set<(value: T) => void>();

  constructor(private value: T) {}

  get current(): T {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    for (const listener of this.listeners) listener(value);
  }

  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
