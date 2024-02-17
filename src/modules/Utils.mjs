class UserUtils {
  /**
   * Helper function for checking user permissions and indicating
   * which ones are missing.
   * @param user
   * @param requiredPermissions
   * @returns {Array<string>} missing permissions for this operation
   */
  static canUser(user, requiredPermissions) {
    if (MODULE.setting('disablePermCheck')) return [];
    const { role } = user;
    const permissions = game.settings.get('core', 'permissions');
    return requiredPermissions
      .filter(req => !permissions[req].includes(role))
      .map(missing =>
        game.i18n.localize(CONST.USER_PERMISSIONS[missing].label)
      );
  }

  /**
   * A helper functions that returns the first active GM level user.
   * @returns {User|undefined} First active GM User
   */
  static firstGM() {
    return game.users?.find(u => u.isGM && u.active);
  }

  /**
   * Checks whether the user calling this function is the user returned
   * by {@link warpgate.util.firstGM}. Returns true if they are, false if they are not.
   * @returns {boolean} Is the current user the first active GM user?
   */
  static isFirstGM() {
    return game.user?.id === this.firstGM()?.id;
  }

  static ownerSublist(docList) {
    /* Break token list into sublists by first owner */
    return docList.reduce((lists, doc) => {
      if (!doc) return lists;
      const owner = this.firstOwner(doc)?.id ?? 'none';
      lists[owner] ??= [];
      lists[owner].push(doc);
      return lists;
    }, {});
  }

  /**
   * Returns the first active user with owner permissions for the given document,
   * falling back to the firstGM should there not be any. Returns false if the
   * document is falsey. In the case of token documents it checks the permissions
   * for the token's actor as tokens themselves do not have a permission object.
   *
   * @param {{ actor: Actor } | { document: { actor: Actor } } | Actor} doc
   *
   * @returns {User|undefined}
   */
  static firstOwner(doc) {
    /* Null docs could mean an empty lookup, null docs are not owned by anyone */
    if (!doc) return undefined;

    /* While conceptually correct, tokens derive permissions from their
     * (synthetic) actor data.
     */
    const actorDoc = ('actor' in doc) ? doc.actor : doc;

    const permissionObject = getProperty(actorDoc ?? {}, 'ownership') ?? {};

    const playerOwners = Object.entries(permissionObject)
      .filter(
        ([id, level]) =>
          !game.users.get(id)?.isGM && game.users.get(id)?.active && level === 3
      )
      .map(([id]) => id);

    if (playerOwners.length > 0) {
      return game.users.get(playerOwners[0]);
    }

    /* If no online player owns this actor, fall back to first GM */
    return this.firstGM();
  }

  /**
   * Checks whether the user calling this function is the user returned by
   * {@link warpgate.util.firstOwner} when the function is passed the
   * given document. Returns true if they are the same, false if they are not.
   *
   * As `firstOwner`, biases towards players first.
   *
   * @param doc
   * @returns {boolean} the current user is the first player owner. If no owning player, first GM.
   */
  static isFirstOwner(doc) {
    return game.user.id === this.firstOwner(doc).id;
  }
}

class ConfigUtils {
  static get(key) {
    return game.settings.get('%config.id%', key);
  }

  static register(settingsData) {
    Object.entries(settingsData).forEach(([key, data]) => {
      game.settings.register('%config.id%', key, {
        name: LangUtils.localize(`setting.${key}.name`),
        hint: LangUtils.localize(`setting.${key}.hint`),
        config: true,
        ...data,
      });
    });
  }
}

class LangUtils {
  static localize(key) {
    return game.i18n.localize(`%config.id%.${key}`);
  }

  static format(key, data) {
    return game.i18n.format(`%config.id%.${key}`, data);
  }
}

class DataUtils {

  static removeEmptyObjects(obj) {
    let result = foundry.utils.flattenObject(obj);
    Object.keys(result).forEach(key => {
      if (typeof result[key] == 'object' && foundry.utils.isEmpty(result[key])) {
        delete result[key];
      }
    });

    return foundry.utils.expandObject(result);
  }


  /**
   * Removes top level empty objects from the provided object.
   *
   * @static
   * @param {object} obj
   */
  static stripEmpty(obj) {
    Object.keys(obj).forEach(key => {
      if (foundry.utils.isEmpty(obj)) {
        delete obj[key];
      } else if (foundry.utils.getType(obj[key]) === 'Object') {
        this.stripEmpty(obj[key]);
      }
    });

    return foundry.utils.isEmpty(obj);
  }
}

export default {
  data: DataUtils,
  lang: LangUtils,
  config: ConfigUtils,
  user: UserUtils,
};
