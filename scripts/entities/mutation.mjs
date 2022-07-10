import {MODULE} from '../module.js'
import {MutationStack, StackData} from '../mutation-stack.js'

function preloadImages(mutation) {
  console.warn('Not yet implemented');
  return false;
}

/* sizes, if this mutation exists already on the actor, etc */
function sanityCheckMutation(mutation) {
  console.warn('Not yet implemented');
  return false;
}

export class Mutation {

  static STAGE = {
    GEN_STACK_DATA: 0,
    PRE_MUTATE: 1,
    POST_MUTATE: 2,
    PRE_REVERT: 3,
    POST_REVERT: 4,
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

  /* @private */
  _document = null;

  get document() {
    return this._document;
  }

  /* @private */
  _id = null;

  get id() {
    return this._id;
  }

  get muid() {
    return {
      uuid: this.document?.uuid,
      mutation: this.id,
    }
  }

  /* @protected */
  compKey(collectionName) {
    return { ActiveEffect: 'label'}[collectionName] ?? 'name';
  }

  /* @private */
  _update = {};

  /* @private */
  _updateOptions = {}; 

  /* @private */
  _embeddedShorthand = {};

  /* @private */
  _callbacks = {};

  /* @public */
  callAll(stage, ...args) {

    const list = this._callbacks[stage] ?? [];

    const retlist = list.map( ({fn, context}) => {
      return fn.apply(this, context, ...args);
    });

    return retlist;
  }

  /* @private */
  _stack = null; 

  /* @private */
  _config = {
    permanent: false,
    name: null,
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

  /* @private */
  _links = [];

  get links() {
    return this._links.map( mut => mut.muid );
  }
  

  /**************
   * Configuration
   *************/

  permanent(bool) {
    if(bool == undefined) return this._config.permanent;

    this._config.permanent = bool;
    return this;
  }

  name(string) {
    if(string == undefined) return this._config.name;

    this._config.name = string;
    return this;
  }

  description(string) {
    if(string == undefined) return this._config.description;

    this._config.description = string;
    return this;
  }

  hidden(bool) {
    if(bool == undefined) return this._config.hidden;

    this._config.hidden = bool;
    return this;
  }


  _invertUpdate() {
    const docData = this._rootDocumentData();
    const reverseDelta = diffObject(this.getUpdate(), docData, {inner: true});

    let embeddedInvert = {};
    for (const [embeddedName, embeddedData] of Object.entries(this.getEmbedded()) ){

      /* do not process null or empty embedded data */
      if(isObjectEmpty(embeddedData.shorthand ?? {})) continue;

      const collection = this._document.getEmbeddedCollection(embeddedName);
      const invertedShorthand = this.constructor._invertShorthand(collection, embeddedData.shorthand, embeddedData.comparisonKey)
      embeddedInvert[embeddedName] = {
        ...embeddedData,
        shorthand: invertedShorthand,
      }
    }

    return {document: reverseDelta, embedded: embeddedInvert};
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
      stage = this._callbacks[curr] ?? false;
      if(!!stage) {
        
        /* create or add to running list */
        if(!acc) acc = {[curr]: [stage]};
        else acc[curr].push(stage);
      }

      return acc;
    }, null);

    return cb;

  }

  /************
   * Mutation commands
   * *********/

  add(data, updateOptions = null) {
    const expanded = expandObject(data); 
    mergeObject(this._update, expanded);

    if(updateOptions) {
      mergeObject(this._updateOptions, updateOptions);
    }

    return this;
  }

  callback(stage, fn, context) {

    /* allocate space for this callback */
    if (!this._callbacks[stage]) {
      this._callbacks[stage] = [];
    }

    /* store it */
    this._callbacks[stage].push({fn, context});

    return this;
  }

  addEmbedded(collectionName, shorthand, {comparisonKey = this._embeddedComparisonKey.default, options = {}} = {}) {
    
    /* valid embedded collection? */
    if (this._embeddedUpdate[collectionName]) {

      shorthand = expandObject(shorthand);

      let data = {
        collectionName,
        shorthand,
        options,
        comparisonKey,
      }

      /* merge into current embedded shorthand */
      mergeObject(this._embeddedShorthand[collectionName], data);

      return this;
    }

    logger.error(MODULE.format('error.badCollection',
      {name: collectionName, docType: this._document.documentName}
    ));

    return false;
  }

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

  getUpdate() {
    return {
      update: this._update,
      options: this._updateOptions
    }
  }

  getEmbedded(collectionName = null) {
    if(collectionName == undefined) return this._embeddedShorthand;
    return this._embeddedShorthand[collectionName];
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

    return warpgate.event.notify(warpgate.CONST.EVENT.MUTATE, eventData);
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

