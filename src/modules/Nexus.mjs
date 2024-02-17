import _drivers from '../drivers';
import _models from '../models';
import _crosshairs from './Crosshairs';
import _apps from '../apps';
import Events from './Events/index.mjs';
import Utils from './Utils.mjs';

/**
 * @global
 * @name nexus
 */
export default class Nexus {

  static announce() {
    globalThis.nexus = new this();
    Hooks.once('setup', () => Hooks.callAll('%config.id%.init', globalThis.nexus));
  }

  #events;

  /* Default drivers */
  drivers = _drivers;

  /* Default models */
  models = _models;

  /* Default canvas tools */
  canvas = {
    Crosshairs: _crosshairs.Crosshairs,
  };

  /* Core applications */
  apps = _apps;

  get utils() {
    return Utils;
  }

  constructor() {
    /* Event handler instance */
    this.#events = new Events();
  }

  get events() {
    return this.#events;
  }

}
