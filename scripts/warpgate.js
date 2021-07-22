import { MODULE } from './module.js';
import { logger } from './logger.js';
import { api } from './api.js'
import { Gateway } from './gateway.js'

const SUB_MODULES = {
  MODULE,
  logger,
  api,
  Gateway
}

/*
  Initialize Module
*/
MODULE.build();

/*
  Initialize all Sub Modules
*/
Hooks.on(`setup`, () => {
  Object.values(SUB_MODULES).forEach(cl => cl.register());

  //GlobalTesting
  //Object.entries(SUB_MODULES).forEach(([key, cl])=> window[key] = cl);
});
