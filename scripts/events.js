import { logger } from './logger.js'
import { queueUpdate } from './update-queue.js'

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

  static watch(name, fn, condition = () => {return true;}) {
    if (!watches[name]) watches[name] = [];
    id++;
    watches[name].push({fn, condition, id});
    return id;
  }

  static trigger(name, fn, condition = () => {return true;}) {
    if (!triggers[name]) triggers[name] = [];
    id++;
    triggers[name].push({fn, condition, id});
    return id;
  }

  static async run(name, data) {
    for (const {fn, condition, id} of watches[name] ?? []) {
      if (condition(data)) {
        logger.debug(`${name} | ${id} passes watch condition`);
        await fn(data);
      } else {
        logger.debug(`${name} | ${id} fails watch condition`);
      }
    }

    let {run, keep} = (triggers[name] ?? []).reduce((acum, elem) => {
      if (elem.condition(data)) {
        logger.debug(`${name} | ${elem.id} passes trigger condition`);
        acum.run.push(elem);
      } else {
        logger.debug(`${name} | ${elem.id} fails trigger condition`);
        acum.keep.push(elem);
      }
      return acum;
    }, {run: [], keep: []});

    for (const {fn, id} of run) {
      logger.debug(`${name} | calling trigger ${id}`);
      await fn(data);
    }

    triggers[name] = keep;
  }

  static remove(id) {
    const searchFn = (elem) => {return elem.id === id};

    const tryRemove = (page) => page.removeIf(searchFn);

    const hookRemove = Object.values(watches).map( tryRemove ).reduce( (sum, current) => { return sum || current }, false);

    const triggerRemove = Object.values(triggers).map( tryRemove ).reduce( (sum, current) => { return sum || current }, false);

    return hookRemove || triggerRemove;
  }
}



