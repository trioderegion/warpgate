import {
  logger
} from '../../scripts/module.js';

export default class Events {
  name = 'Events';
  watches = {};
  triggers = {};
  id = 0;
  
  /**
   * Similar in operation to `Hooks.on`, with two exceptions. First, the provided function 
   * can be asynchronous and will be awaited. Second, an optional `conditionFn` parameter 
   * is added to help compartmentalize logic between detecting the desired event and responding to said event.
   *
   * @param {String} name Event name to watch for; It is recommended to use the enums found in {@link warpgate.EVENT}
   * @param {function(object):Promise|void} fn Function to execute when this event has passed the condition function. Will be awaited
   * @param {function(object):boolean} [condition = ()=>true] Optional. Function to determine if the event function should 
   *  be executed. While not strictly required, as the `fn` function could simply return as a NOOP, providing this 
   *  parameter may help compartmentalize "detection" vs "action" processing.
   *
   * @returns {number} Function id assigned to this event, for use with {@link warpgate.event.remove}
   */
  watch(name, fn, condition = () => {
    return true;
  }) {
    if (!this.watches[name]) this.watches[name] = [];
    this.id++;
    this.watches[name].push({
      fn,
      condition,
      id: this.id
    });
    return this.id;
  }

  /**
   * Identical to {@link warpgate.event.watch}, except that this function will only be called once, after the condition is met.
   *
   * @see {@link warpgate.event.watch}
   */
  trigger(name, fn, condition = () => {
    return true;
  }) {
    if (!this.triggers[name]) this.triggers[name] = [];
    this.id++;
    this.triggers[name].push({
      fn,
      condition,
      id: this.id
    });
    return this.id;
  }


  async run(name, data) {
    for (const {
        fn,
        condition,
        id
      } of this.watches[name] ?? []) {
      try {
        if (condition(data)) {
          logger.debug(`${name} | ${id} passes watch condition`);
          await fn(data);
        } else {
          logger.debug(`${name} | ${id} fails watch condition`);
        }
      } catch (e) {
        logger.error(`${this.name} | error`, e, `\n \nIn watch function (${name})\n`, fn);
      }
    }

    let {
      run,
      keep
    } = (this.triggers[name] ?? []).reduce((acum, elem) => {
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
        logger.error(`${this.name} | error`, e, `\n \nIn trigger condition function (${name})\n`, elem.condition);
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
        logger.error(`${this.name} | error`, e, `\n \nIn trigger function (${name})\n`, fn);
      }
    }

    this.triggers[name] = keep;
  }

  /**
   * Removes a `watch` or `trigger` by its provided id -- obtained by the return value of `watch` and `trigger`.
   *
   * @param {number} id Numerical ID of the event function to remove.
   *
   * @see warpgate.event.watch
   * @see warpgate.event.trigger
   */
  remove(id) {

    const tryRemove = (page) => {
      let i = page.length;
      while (i--) {
        if (page[i].id == id) {
          page.splice(i, 1);
          return true;
        }
      }

      return false;
    }

    const hookRemove = Object.values(this.watches).map(tryRemove).reduce((sum, current) => {
      return sum || current
    }, false);

    const triggerRemove = Object.values(this.triggers).map(tryRemove).reduce((sum, current) => {
      return sum || current
    }, false);

    return hookRemove || triggerRemove;
  }
}
