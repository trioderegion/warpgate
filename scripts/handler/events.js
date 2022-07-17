import {
  logger
} from './logger.js'
import {
  queueUpdate
} from './update-queue.js'

const NAME = 'Events';

let watches = {};
let triggers = {};
let id = 0;

Array.prototype.removeIf = function (callback) {
  let i = this.length;
  while (i--) {
    if (callback(this[i], i)) {
      this.splice(i, 1);
      return true;
    }
  }

  return false;
};

export class Events {

  static watch(name, fn, condition = () => {
    return true;
  }) {
    if (!watches[name]) watches[name] = [];
    id++;
    watches[name].push({
      fn,
      condition,
      id
    });
    return id;
  }

  static trigger(name, fn, condition = () => {
    return true;
  }) {
    if (!triggers[name]) triggers[name] = [];
    id++;
    triggers[name].push({
      fn,
      condition,
      id
    });
    return id;
  }

  static async run(name, data) {
    for (const {
        fn,
        condition,
        id
      } of watches[name] ?? []) {
      try {
        if (condition(data)) {
          logger.debug(`${name} | ${id} passes watch condition`);
          await fn(data);
        } else {
          logger.debug(`${name} | ${id} fails watch condition`);
        }
      } catch (e) {
        logger.error(`${NAME} | error`, e, `\n \nIn watch function (${name})\n`, fn);
      }
    }

    let {
      run,
      keep
    } = (triggers[name] ?? []).reduce((acum, elem) => {
      try {
        const passed = elem.condition(data);
        if (passed) {
          logger.debug(`${name} | ${elem.id} passes trigger condition`);
          acum.run.push(elem);
        } else {
          logger.debug(`${name} | ${elem.id} fails trigger condition`);
          acum.keep.push(elem);
        }
      } catch (e) {
        logger.error(`${NAME} | error`, e, `\n \nIn trigger condition function (${name})\n`, fn);
        return acum;
      } finally {
        return acum;
      }
    }, {
      run: [],
      keep: []
    });

    for (const {
        fn,
        id
      } of run) {
      logger.debug(`${name} | calling trigger ${id}`);
      try {
        await fn(data);
      } catch (e) {
        logger.error(`${NAME} | error`, e, `\n \nIn trigger function (${name})\n`, fn);
      }
    }

    triggers[name] = keep;
  }

  static remove(id) {
    const searchFn = (elem) => {
      return elem.id === id
    };

    const tryRemove = (page) => page.removeIf(searchFn);

    const hookRemove = Object.values(watches).map(tryRemove).reduce((sum, current) => {
      return sum || current
    }, false);

    const triggerRemove = Object.values(triggers).map(tryRemove).reduce((sum, current) => {
      return sum || current
    }, false);

    return hookRemove || triggerRemove;
  }
}