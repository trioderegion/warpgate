import ShorthandField from './ShorthandField.mjs';

export default class EmbeddedShorthandField extends ShorthandField {
  constructor(owner, type, typeOptions = {}, options = {}) {
    const keys = Reflect.ownKeys(owner.metadata.embedded);
    super(keys, () => (new type(typeOptions)), options);
  }

  static _idByQuery( list, key, comparisonPath ) {
    const id = this._findByQuery(list, key, comparisonPath)?.id ?? null;

    return id;
  }

  static _findByQuery( list, key, comparisonPath ) {
    return list.find( element => foundry.utils.getProperty(element, comparisonPath) === key )
  }

  static parseAddShorthand(collection, updates, comparisonKey){

    let parsedAdds = Object.keys(updates).reduce((acc, key) => {

      /* ignore deletes */
      if (updates[key] === warpgate.CONST.DELETE) return acc;

      /* ignore item updates for items that exist */
      if (this._idByQuery(collection, key, comparisonKey)) return acc;
      
      let data = updates[key];
      foundry.utils.setProperty(data, comparisonKey, key);
      acc.push(data);
      return acc;
    },[]);

    return parsedAdds;

  }

  //TODO change to reduce
  static parseUpdateShorthand(collection, updates, comparisonKey) {
    let parsedUpdates = Object.keys(updates).map((key) => {
      if (updates[key] === warpgate.CONST.DELETE) return { _id: null };
      const _id = this._idByQuery(collection, key, comparisonKey )
      return {
        ...updates[key],
        _id,
      }
    });
    parsedUpdates = parsedUpdates.filter( update => !!update._id);
    return parsedUpdates;
  }

  //TODO change to reduce
  static parseDeleteShorthand(collection, updates, comparisonKey) {
    let parsedUpdates = Object.keys(updates).map((key) => {
      if (updates[key] !== warpgate.CONST.DELETE) return null;
      return this._idByQuery(collection, key, comparisonKey);
    });

    parsedUpdates = parsedUpdates.filter( update => !!update);
    return parsedUpdates;
  }

  static submit(owner, shorthand, comparisonKeys, updateOpts){

    /* @TODO check for any recursive embeds*/
    //if (embeddedUpdates?.embedded) delete embeddedUpdates.embedded;
    const promises = [];
    for(const embeddedName of Object.keys(shorthand)) {
      promises.push(this.#performEmbeddedUpdates(owner, embeddedName, shorthand[embeddedName],
        comparisonKeys[embeddedName],
        updateOpts.embedded[embeddedName] ?? {}))
    }

    return promises;
  }

  static async #performEmbeddedUpdates(owner, embeddedName, updates, comparisonKey = 'name', updateOpts = {}){
    
    const collection = owner.getEmbeddedCollection(embeddedName);

    const parsedAdds = this.parseAddShorthand(collection, updates, comparisonKey);
    const parsedUpdates = this.parseUpdateShorthand(collection, updates, comparisonKey); 
    const parsedDeletes = this.parseDeleteShorthand(collection, updates, comparisonKey);

    logger.debug(`Modify embedded ${embeddedName} of ${owner.name} from`, {adds: parsedAdds, updates: parsedUpdates, deletes: parsedDeletes});

    const {error, message} = this.errorCheckEmbeddedUpdates( embeddedName, {add: parsedAdds, update: parsedUpdates, delete: parsedDeletes} );
    if(error) {
      logger.error(message);
      return false;
    }

    try {
      if (parsedAdds.length > 0) await owner.createEmbeddedDocuments(embeddedName, parsedAdds, updateOpts);
    } catch (e) {
      logger.error(e);
    } 

    try {
      if (parsedUpdates.length > 0) await owner.updateEmbeddedDocuments(embeddedName, parsedUpdates, updateOpts);
    } catch (e) {
      logger.error(e);
    }

    try {
      if (parsedDeletes.length > 0) await owner.deleteEmbeddedDocuments(embeddedName, parsedDeletes, updateOpts);
    } catch (e) {
      logger.error(e);
    }

    return true;
  }

  static errorCheckEmbeddedUpdates( embeddedName, updates ) {

    /* at the moment, the most pressing error is an Item creation without a 'type' field.
     * This typically indicates a failed lookup for an update operation
     */
    if( embeddedName == 'Item'){
      const badItemAdd = (updates.add ?? []).find( add => !add.type );

      if (badItemAdd) {
        logger.info(badItemAdd);
        const message = game.i18n.format('warpgate.error.badMutate.missing.type', {embeddedName});

        return {error: true, message}
      }
    }

    return {error:false};
  }
}
