import _drivers from '../drivers';
import _models from '../models';
import _crosshairs from './Crosshairs';
import _apps from '../apps';
import Events from './Events/index.mjs';
import Utils from './Utils.mjs';
import Comms from './Comms.mjs';

/**
 * @global
 * @name nexus
 */
export default class Nexus {

  static announce() {
    globalThis.nexus = new this();
    Hooks.once('setup', () => globalThis.nexus._setup());
  }

  _setup() {
    this.comms.init();
    Hooks.callAll('%config.id%.init', globalThis.nexus);
  }

  #events;

  #comms;

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
    this.#comms = new Comms();
  }

  get events() {
    return this.#events;
  }

  get comms() {
    return this.#comms;
  }
}
