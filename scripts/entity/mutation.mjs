import {MODULE} from '../utility/module.js'
import {MutationStack, StackData} from '../entity/mutation-stack.js'

function preloadImages(mutation) {
  console.warn('Image preload helper not yet implemented');
  return 'preload ret';
}

/* sizes, if this mutation exists already on the actor, etc
 * @param {Mutation} mutation
 */
function sanityCheckMutation(mutation) {
  console.warn('Mutation Sanity Check not yet implemented');
  return 'sanity check ret';
}

/**
 * @class
 */
export class Mutation {

  static STAGE = {
    GEN_STACK_DATA: "0",
    PRE_MUTATE: "1",
    POST_MUTATE: "2",
    PRE_REVERT: "3",
    POST_REVERT: "4",
  }

  /** @protected */
  static _parseUpdateShorthand(collection, updates, comparisonKey) {
    let parsedUpdates = Object.keys(updates).map((key) => {
      if (updates[key] === warpgate.CONST.DELETE) return { _id: null };
      const _id = collection.find( element => getProperty(element.data,comparisonKey) === key )?.id ?? null;
      return {
        ...updates[key],
        _id,
      }
    });
    parsedUpdates = parsedUpdates.filter( update => !!update._id);
    return parsedUpdates;
  }

  /** @protected */
  static _parseDeleteShorthand(collection, updates, comparisonKey) {
    let parsedUpdates = Object.keys(updates).map((key) => {
      if (updates[key] !== warpgate.CONST.DELETE) return null;
      return collection.find( element => getProperty(element.data, comparisonKey) === key )?.id ?? null;
    });

    parsedUpdates = parsedUpdates.filter( update => !!update);
    return parsedUpdates;
  }

  /** @protected */
  static _parseAddShorthand(collection, updates, comparisonKey){
    let parsedAdds = Object.keys(updates).map((key) => {

      /* ignore deletes */
      if (updates[key] === warpgate.CONST.DELETE) return false;

      /* ignore item updates for items that exist */
      if (collection.find( element => getProperty(element.data, comparisonKey) === key)) return false;
      
      let data = updates[key];
      setProperty(data, comparisonKey, key);
      return data;
    });
    parsedAdds = parsedAdds.filter( update => !!update);
    return parsedAdds;

  }

  /** @protected */
  static _invertShorthand(collection, updates, comparisonKey){
    let inverted = {};
    Object.keys(updates).forEach( (key) => {
      /* this is a delete */
      if (updates[key] === warpgate.CONST.DELETE) {
        /* find this item currently and copy off its data */ 
        const currentData = collection.find( element => getProperty(element.data, comparisonKey) === key );
        /* hopefully we found something */
        if(currentData)
          setProperty(inverted, key, currentData.toObject());
        return;
      }

      /* this is an update */
      const foundItem = collection.find( element => getProperty(element.data, comparisonKey) === key)
      if (foundItem){
        /* grab the current value of any updated fields and store */
        const expandedUpdate = expandObject(updates[key]);
        const sourceData = foundItem.toObject();
        const updatedData = mergeObject(sourceData, expandedUpdate, {inplace: false});
        const diff = diffObject(updatedData, sourceData)

        setProperty(inverted, updatedData[comparisonKey], diff);
        return;
      }

      /* must be an add, so we delete */
      setProperty(inverted, key, warpgate.CONST.DELETE);

    });

    return inverted;
  }

  /**
   * @param {MutationStack} stack
   * @param {string} entryId
   */
  static fromStack(stack, entryId) {

    const data = stack.get(entryId);

    const revivedMut = new Mutation(stack.document, {id: entryId});

    //add delta from entry as updates.
    revivedMut.add(data.delta.document.update, data.delta.document.options);

    //add in all embedded updates
    revivedMut.#embeddedUpdates = data.delta.embedded; 

    //add in all callbacks
    Object.entries( data.callbacks ).forEach( ([stage, callbacks]) => 
      callbacks.forEach( cbData => 
        revivedMut.callback(stage, cbData.fn, cbData.context)
      )
    );

    return revivedMut;
  }

  /*** PUBLIC FIELDS ***/

  /**
   * @type {ClientDocument}
   */
  #document;

  /**
   * @type {string}
   */
  #id;

  /**
   * @type {object}
   */
  #update = {};

  /**
   * @type {object}
   */
  #updateOptions = {}; 

  /**
   * @type {Object<string, string>}
   */
  #defaultComparisonKeys = {default: 'name', ActiveEffect: 'label'};


  /**
   * @param {ClientDocument} document
   * @param {Object} [metadata]
   * @param {string} [metadata.id=randomID()]
   * @param {Object} [metadata.config]
   * @param {string} [metadata.config.name=metadata.id]
   * @param {string} [metadata.config.description='']
   * @param {boolean} [metadata.config.permanent=false]
   * @param {boolean} [metadata.config.hidden=false]
   * @param {Object} [metadata.config.permissions={default: CONST.DOCUMENT_PERMISSION_LEVELS.OWNER}]
   */
  constructor(document, {id = randomID(), config = {}} = {}){

    this.#document = document;
    this.#id = id;

    /* Prepopulate valid embedded collection names */
    this.#embeddedUpdates = Object.keys(this.#document.constructor.implementation.metadata.embedded).reduce( (acc, curr) => {
      const defaultData = {
        collectionName: curr,
        shorthand: {},
        options: {},
        comparisonKey: this.defaultComparisonKeys[curr],
      }
      acc[curr] = defaultData;
      return acc;
    },{});

    /* prefill remaining default config options */
    this.#config.name = id;

    /* construct mutation stack */
    this.#stack = new MutationStack(document, {module: MODULE.data.name});

    /* merge in any provided configs */
    mergeObject(this.#config, config);

    /* add in the premutate callback to ensure images are preloaded
     * and stack gen sanity checks concerning the update itself (size, stack length, etc )*/
    this.callback(Mutation.STAGE.GEN_STACK_DATA, sanityCheckMutation);
    this.callback(Mutation.STAGE.PRE_MUTATE, preloadImages);
  }

  get document() {
    return this.#document;
  }

  get id() {
    return this.#id;
  }

  /**
   * @type {{uuid: string|undefined, mutation: string}}
   */
  get muid() {
    return {
      uuid: this.document?.uuid,
      mutation: this.id,
    }
  }

  get defaultComparisonKeys() {
    return new Proxy(this.#defaultComparisonKeys, {
      get: function (target, name, receiver) {
        if(!Reflect.has(target, name)) name = 'default';
        return Reflect.get(target, name, receiver)
      },
      set: function (target, name, _, receiver) {
        logger.debug('Refusing to override default comparison keys at run-time');
        return Reflect.get(target, name, receiver);
      }
    })
  }

  /**
   * @type EmbeddedUpdate
   */
  #embeddedUpdates;

  /** @protected */
  _callbacks = {};

  /**
   * @public
   * @param {any} stage
   * @param {any[]} args
   * @return {Array<any, boolean>}
   */
  callAll(stage, ...args) {

    const list = this._callbacks[stage] ?? [];

    const retlist = list.map( ({fn, context}) => {
      return fn.apply(this, context, ...args);
    });

    return retlist;
  }

  /**
   * @type {MutationStack}
   */
  #stack;

  get stack() {
    return this.#stack;
  }

  /**
   * @member {Object}
   */
  #config = {
    name: '',
    description: '',
    permanent: false,
    hidden: false,
    permissions: {default: CONST.DOCUMENT_PERMISSION_LEVELS.OWNER}
  };

  getRevertData() {
    return this._invertUpdate();
  }

  get config() {
    return this.#config;
  }

  get metadata() {
    
    const data = { 
      cls: this.constructor.name,
      name: this.config.name,
      id: this.#id,
      description: this.config.description,
      hidden: this.config.hidden
    };

    return data;

  }

  /**
   * @private
   * @type {Mutation[]}
   */
  _links = [];

  get links() {
    return this._links.map( mut => mut.muid );
  }
  


  /**
   * ************
   * Configuration
   * ***********
   */

  /**
   * @param {boolean} [bool]
   */
  permanent(bool) {
    if(bool == undefined) return this.#config.permanent;

    this.#config.permanent = bool;
    return this;
  }

  /**
   * @param {string} [string]
   */
  name(string) {
    if(string == undefined) return this.#config.name;

    this.#config.name = string;
    return this;
  }

  /**
   * @param {string} [string]
   */
  description(string) {
    if(string == undefined) return this.#config.description;

    this.#config.description = string;
    return this;
  }

  /**
   * @param {boolean} [bool]
   */
  hidden(bool) {
    if(bool == undefined) return this.#config.hidden;

    this.#config.hidden = bool;
    return this;
  }


  /**
   * @return {{document: {update: object, options: object}, embedded: EmbeddedUpdate}}
   */
  _invertUpdate() {
    const docData = this._rootDocumentData();

    const update = this.getUpdate();

    const reverseDelta = diffObject(update.update, docData, {inner: true});

    /** @type EmbeddedUpdate */
    let embeddedInvert = {};
    for (const [shorthandKey, embeddedData] of Object.entries(this.getEmbedded()) ){

      const embeddedName = shorthandKey.split('.')[0];

      /* do not process null or empty embedded data */
      if(isObjectEmpty(embeddedData.shorthand ?? {})) continue;

      const collection = this.document.getEmbeddedCollection(embeddedName);
      const invertedShorthand = Mutation._invertShorthand(collection, embeddedData.shorthand, embeddedData.comparisonKey)
      embeddedInvert[shorthandKey] = {
        ...embeddedData,
        shorthand: invertedShorthand,
      }
    }

    return {document: {update: reverseDelta, options: update.options}, embedded: embeddedInvert};
  }

  _rootDocumentData() {
    let docData = this.#document.toObject();

    /* get the key NAME of the embedded document type.
     * ex. not 'ActiveEffect' (the class name), 'effect' the collection's field name
     */
    
    const embeddedFields = Object.values(this.#document.constructor.metadata.embedded).map( thisClass => thisClass.metadata.collection );

    /* delete any embedded fields from the actor data */
    embeddedFields.forEach( field => { delete docData[field] } )

    return docData;
  }

  generateStackEntry() {
    const metadata = this.metadata;

    const data = {
      cls: metadata.class,
      id: metadata.id,
      name: metadata.name,
      //user: default,
      //permission: default,
      links: this.links,
      //hidden: default,
      callbacks: this.getStackCallbacks(),
      delta: this.getRevertData(),
    }

    const stackData = new StackData(data);

    const retList = this.callAll(Mutation.STAGE.GEN_STACK_DATA, stackData)
    if(retList.some( ret => ret === false )) return false;
    
    return stackData;
  }

  getStackCallbacks() {

    const stages = [Mutation.STAGE.PRE_REVERT, Mutation.STAGE.POST_REVERT];

    const cb = stages.reduce( (acc, curr) => {
      const stage = this._callbacks[curr] ?? false;
      if(!!stage) {
        
        /* create or add to running list */
        if(!acc[curr]) acc[curr] = [stage];
        else acc[curr].push(stage);
      }

      return acc;
    }, {});

    return cb;

  }


  /**
   * **********
   * Mutation commands
   * ********
   */

  /**
   * Merge an update object for _this_ document into the
   * running update.
   *
   * @param {object} data
   * @param {object} [updateOptions=null]
   */
  add(data, updateOptions = null) {
    const expanded = expandObject(data); 
    mergeObject(this.#update, expanded);

    if(updateOptions) {
      mergeObject(this.#updateOptions, updateOptions);
    }

    return this;
  }

  /**
   * @param {string} stage
   * @param {Function} fn
   * @param {object} [context]
   */
  callback(stage, fn, context) {

    /* allocate space for this callback */
    if (!this._callbacks[stage]) {
      this._callbacks[stage] = [];
    }

    /* store it */
    this._callbacks[stage].push({fn, context});

    return this;
  }

  /**
   * @param {string} collectionName
   * @param {Shorthand} shorthand
   */
  addEmbedded(collectionName, shorthand, {comparisonKey = this.defaultComparisonKeys.collectionName, options = {}} = {}) {

    /* valid embedded collection? */
    const collection = this.#embeddedUpdates[collectionName];
    if (!!collection) {

      shorthand = expandObject(shorthand);

      /** @type EmbeddedUpdateEntry */
      const data = {
        collectionName,
        shorthand,
        options,
        comparisonKey,
      }

      /* merge into current embedded shorthand */
      this._mergeEmbeddedUpdate(data);

      return this;
    } 

    logger.error(MODULE.format('error.badCollection',
      {name: collectionName, docType: this.#document.documentName}
    ));

    return this;
  }

  /**
   * @protected
   * @param {EmbeddedUpdateEntry} update
   */
  _mergeEmbeddedUpdate(update) {
    const index = this.#embeddedUpdates[update.collectionName].findIndex((/** @type EmbeddedUpdateEntry */ entry) => entry.comparisonKey === update.comparisonKey);
    if (index < 0)
      this.#embeddedUpdates[update.collectionName].push(update.shorthand);
    else
      mergeObject(this.#embeddedUpdates[update.collectionName], {shorthand: update.shorthand, options: update.options});
  }

  /**
   * @param {Mutation} otherMutator
   * @param {boolean} [biDirectional=false]
   */
  link(otherMutator, biDirectional = false) {

    if(biDirectional) {
      /* two way, they know about us */
      otherMutator.link(this);
    } else {
      /* one way, we are managing them */ 
      otherMutator.hidden( true );
    }

    this._links.push(otherMutator);
    return this;
  }

  /**
   * @return {{update: object, options: object}}
   */
  getUpdate() {
    return {
      update: this.#update,
      options: this.#updateOptions
    }
  }

  getEmbedded(shorthandKey = null) {
    if(shorthandKey == undefined) return this.#embeddedUpdates;
    return this.#embeddedUpdates[shorthandKey];
  }

  updateMutationStack() {

    if (this.permanent()) return this;

    if(!this.#stack) this.#stack = new MutationStack(this.#document);

    const stackData = this.generateStackEntry();

    /* if we were cancelled or errored for any reason */
    if (!stackData) return false;

    /* Create a new mutation stack flag data and store it in the update object */
    this.#stack.create(stackData);
    
    this.add(this.#stack.toObject(true));

    return this;
  }

  unrollStackEntry(id) {
    return this.#stack.unroll(id);
  }

  bin() {
    return [this, ...this._links]; 
  }

  cleanup(results) {
    logger.debug('Mutation cleanup results', results);

    const eventData = {
      muid: this.muid,
      docName: this.document.name,
      mutName: this.config.name,
    }

    return globalThis.warpgate.event.notify(globalThis.warpgate.EVENT.MUTATE, eventData);
  }

}

export class EmbeddedMutation extends Mutation {

  static _collectionChangeToArray(collectionChanges) {
    return {};
  }

  getUpdate() {
    let update = super.getUpdate()

    const collectionChanges = super.getEmbedded();
    const directCollectionUpdate = EmbeddedMutation._collectionChangeToArray(collectionChanges);
    mergeUpdate(update, directCollectionUpdate);
    return update;
  }

  getEmbedded() {
    return {};
  }
}

