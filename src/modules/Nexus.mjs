import drivers from '../drivers';
import models from '../models';
import crosshairs from './Crosshairs';
import Events from './Events/index.mjs';

export default class Nexus {

  static init() {
    globalThis.nexus = new this();
    Hooks.callAll('%config.id%.init', globalThis.nexus);
  }

  #events;

  constructor() {
    this.#events = new Events();
  }

  get drivers() {
    return drivers;
  }

  get models() {
    return models;
  }

  get crosshairs() {
    return crosshairs.Crosshairs;
  }

  get events() {
    return this.#events;
  }

}
