export class LiveReloadConnections {
  #clients = new Set();
  #connectionSeq = 0;

  add(client) {
    this.#clients.add(client);
    this.#connectionSeq += 1;
  }

  delete(client) {
    return this.#clients.delete(client);
  }

  get size() {
    return this.#clients.size;
  }

  get connectionSeq() {
    return this.#connectionSeq;
  }

  [Symbol.iterator]() {
    return this.#clients[Symbol.iterator]();
  }
}
