/*
 * MIT License
 * 
 * Copyright (c) 2020-2021 DnD5e Helpers Team and Contributors
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { MODULE, logger } from './module.js';
import { api } from './api.js';
import { register as rGateway } from './gateway.js';
import { register as rMutator } from './mutator.js';
import { register as rRemoteMutator } from './remote-mutator.js'
import { UserInterface } from './user-interface.js';
import { register as rComms } from './comms.js';

const SUB_MODULES = {
  MODULE,
  logger,
  api,
  Gateway: {register: rGateway},
  Mutator: {register: rMutator},
  RemoteMutator: {register: rRemoteMutator},
  UserInterface,
  Comms: {register: rComms}
}

/*
  Initialize all Sub Modules
*/
Hooks.on(`setup`, () => {
  Object.values(SUB_MODULES).forEach(cl => cl.register());
});
