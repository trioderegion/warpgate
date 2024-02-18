/*
 * This file is part of the warpgate module (https://github.com/trioderegion/warpgate)
 * Copyright (c) 2021 Matthew Haentschke.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
export default class Comms {

  #handlers = new Map();

  init() {
    logger.info('Registering sockets');
    game.socket.on('module.%config.id%', this._receiveSocket.bind(this));
  }

  async _receiveSocket({event, data}) {
    const queue = this.#handlers.get(event) ?? [];
    const newHandlers = await queue.reduce( async (remaining, curr) => {
      await curr.handler(...data);
      if (!curr.once) remaining.push(curr);
      return remaining;
    }, []);

    if (newHandlers.length > 0) this.#handlers.set(event, newHandlers);
    else this.#handlers.delete(event);
  }

  #addHandler(moduleEvent, handler, once) {
    const cb ={once, handler};
    if (this.#handlers.has(moduleEvent)) this.#handlers.get(moduleEvent).push(cb);
    else this.#handlers.set(moduleEvent, [cb]);
  }

  on(moduleEvent, handler) {
    this.#addHandler(moduleEvent, handler, false);
  }

  once(moduleEvent, handler) {
    this.#addHandler(moduleEvent, handler, true);
  }

  emit(moduleEvent, ...data) {
    game.socket.emit('module.%config.id%', {
      event: moduleEvent,
      data
    });
  }

}

