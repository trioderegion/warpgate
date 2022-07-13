import {MODULE} from '../module.js'
import {MutationStack, StackData} from '../mutation-stack.js'

/** 
 * Typedefs for warpgate specific data
 * @typedef {Object<string, object>} Shorthand
 * @typedef {{collectionName: string, 
 *            shorthand: Shorthand, 
 *            options: object, 
 *            comparisonKey: string}} EmbeddedUpdate
 * @typedef {{document: {update: object, options: object}, embedded: EmbeddedUpdate}} Delta
 */


function preloadImages(mutation) {
  console.warn('Not yet implemented');
  return false;
}

/* sizes, if this mutation exists already on the actor, etc
 * @param {Class<Mutation>} mutation
 */
function sanityCheckMutation(mutation) {
  console.warn('Not yet implemented');
  return false;
}

/*
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

  static _parseDeleteShorthand(collection, updates, comparisonKey) {
    let parsedUpdates = Object.keys(updates).map((key) => {
      if (updates[key] !== warpgate.CONST.DELETE) return null;
      return collection.find( element => getProperty(element.data, comparisonKey) === key )?.id ?? null;
    });

    parsedUpdates = parsedUpdates.filter( update => !!update);
    return parsedUpdates;
  }

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
   * @param {ClientDocument} document
   * @param {StackData} data
   */
  static fromStackData(document, data) {

    const revivedMut = new Mutation(document, {id: data.id});
    
    //add delta from entry as updates.
    revivedMut.add(data.delta.document.update, data.delta.document.options);

    //add in all embedded updates
    //TODO

    //add in all callbacks
    Object.entries( data.callbacks ).forEach( ([stage, callbacks]) => 
      callbacks.forEach( cbData => 
        revivedMut.callback(stage, cbData.fn, cbData.context)
      )
    );

  }

  constructor(document, {id = randomID(), config = {}} = {}){
    this._document = document;
    this._id = id;

    /* prefill valid embedded types */
    Object.keys(document.constructor.implementation.metadata.embedded).forEach(embeddedKey => this._embeddedShorthand[embeddedKey] = {})

    /* prefill remaining default config options */
    this._config.name = id;

    /* merge in any provided configs */
    mergeObject(this._config, config);

    /* add in the premutate callback to ensure images are preloaded
     * and stack gen sanity checks concerning the update itself (size, stack length, etc )*/
    this.callback(Mutation.STAGE.GEN_STACK_DATA, sanityCheckMutation);
    this.callback(Mutation.STAGE.PRE_MUTATE, preloadImages);
  }

  /**
   * 
   */

  /**
   * @private
   * @type {ClientDocument}
   */
  _document;

  /**
   * 
   */
  get document() {
    return this._document;
  }

  /**
   * @private
   * @type {string}
   */
  _id;

  get id() {
    return this._id;
  }

  /**
   * @type {{uuid: string, mutation: string}}
   */
  get muid() {
    return {
      uuid: this.document?.uuid,
      mutation: this.id,
    }
  }

  /**
   * @protected
   * @param {string} collectionName
   */
  compKey(collectionName) {
    return { ActiveEffect: 'label'}[collectionName] ?? 'name';
  }

  /* @private */
  _update = {};

  /* @private */
  _updateOptions = {}; 

    /**
   * @private
   * @type Object<string, EmbeddedUpdate>
   */
  _embeddedShorthand = {};

  /* @private */
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
   * @private
   * @type MutationStack 
   */
  _stack;

  /* @private */
  _config = {
    permanent: false,
    name: '',
    description: '',
    hidden: false,
  };

  getRevertData() {
    return this._invertUpdate();
  }

  get config() {
    return this._config;
  }

  get metadata() {

    const data = { 
      class: this.constructor.name,
      name: this.config.name,
      id: this._id,
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
    if(bool == undefined) return this._config.permanent;

    this._config.permanent = bool;
    return this;
  }

  /**
   * @param {string} [string]
   */
  name(string) {
    if(string == undefined) return this._config.name;

    this._config.name = string;
    return this;
  }

  /**
   * @param {string} [string]
   */
  description(string) {
    if(string == undefined) return this._config.description;

    this._config.description = string;
    return this;
  }

  /**
   * @param {boolean} [bool]
   */
  hidden(bool) {
    if(bool == undefined) return this._config.hidden;

    this._config.hidden = bool;
    return this;
  }


  /**
   * @return {{document: {update: object, options: object}, embedded: Shorthand}}
   */
  _invertUpdate() {
    const docData = this._rootDocumentData();

    const update = this.getUpdate();

    const reverseDelta = diffObject(update.update, docData, {inner: true});

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
    let docData = this._document.toObject();

    /* get the key NAME of the embedded document type.
     * ex. not 'ActiveEffect' (the class name), 'effect' the collection's field name
     */
    
    const embeddedFields = Object.values(this._document.constructor.metadata.embedded).map( thisClass => thisClass.metadata.collection );

    /* delete any embedded fields from the actor data */
    embeddedFields.forEach( field => { delete docData[field] } )

    return docData;
  }

  generateStackEntry() {
    const metadata = this.metadata;

    const data = {
      class: metadata.class,
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
        if(!acc) acc = {[curr]: [stage]};
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
   * @param {object} data
   */
  add(data, updateOptions = null) {
    const expanded = expandObject(data); 
    mergeObject(this._update, expanded);

    if(updateOptions) {
      mergeObject(this._updateOptions, updateOptions);
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
  addEmbedded(collectionName, shorthand, {comparisonKey = this.compKey(collectionName), options = {}} = {}) {

    const key = `${collectionName}.${shorthand}`
    
    /* valid embedded collection? */
    if (this._embeddedShorthand[key]) {

      shorthand = expandObject(shorthand);

      /** type EmbeddedUpdate */
      let data = {
        collectionName,
        shorthand,
        options,
        comparisonKey,
      }

      /* merge into current embedded shorthand */
      mergeObject(this._embeddedShorthand[key], data);

      return this;
    } 

    logger.error(MODULE.format('error.badCollection',
      {name: collectionName, docType: this._document.documentName}
    ));

    return this;
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
      update: this._update,
      options: this._updateOptions
    }
  }

  getEmbedded(shorthandKey = null) {
    if(shorthandKey == undefined) return this._embeddedShorthand;
    return this._embeddedShorthand[shorthandKey];
  }

  updateMutationStack() {

    if(!this._stack) this._stack = new MutationStack(this._document);

    const stackData = this.generateStackEntry();

    /* if we were cancelled or errored for any reason */
    if (!stackData) return this;

    /* Create a new mutation stack flag data and store it in the update object */
    this._stack.create(stackData);

    return this;
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

    return globalThis.warpgate.event.notify(globalThis.warpgate.CONST.EVENT.MUTATE, eventData);
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

function stage(stage) {
  throw new Error('Function not implemented.');
}

