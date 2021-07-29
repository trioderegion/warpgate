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
import { MODULE } from './module.js'

export class logger {
  static info(...args) {
    console.log(`${MODULE?.data?.title || "" }  | `, ...args);
  }
  static debug(...args) {
    if (MODULE.setting('debug'))
      this.info("DEBUG | ", ...args);
  }
  static error(...args) {
    console.error(`${MODULE?.data?.title || "" } | ERROR | `, ...args);
    ui.notifications.error(`${MODULE?.data?.title || "" } | ERROR | ${args[0]}`);
  }

  static register(){
    this.settings()
  }

  static settings(){
    const config = true;
    const settingsData = {
      debug : {
        scope: "world", config, default: false, type: Boolean,
      },
    };

    
    MODULE.applySettings(settingsData);
  }
}
