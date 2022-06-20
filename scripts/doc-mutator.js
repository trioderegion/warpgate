import { logger } from "./logger.js";
import { MODULE } from "./module.js";
import { Mutator } from "./mutator.js";
import { Mutation } from "./entities/mutation.mjs";

const NAME = "DocMutator";

export class DocMutator {
  static register() {
    Hooks.once("ready", () => {
      globalThis.DocMutator = DocMutator;
      globalThis.Mutation = Mutation;
    });
  }

  /**
   * @parm {Mutation} mutation
   */
  static async apply(mutation) {
    logger.debug("Mutate Info", mutation);

    /* premutate callback */
    const preRet = await Promise.all(
      mutation.callAll(Mutation.STAGE.PRE_MUTATE)
    );
    if (preRet.some((ret) => ret === false)) return false;

    const docRet = await Mutator._updateDocument(mutation);
    const embedRet = await Mutator._updateEmbedded(mutation);

    /* post mutate callback */
    const postRet = await Promise.all(
      mutation.callAll(Mutation.STAGE.POST_MUTATE)
    );

    return { pre: preRet, doc: docRet, embed: embedRet, post: postRet };
  }

  static async revertTest(document, mutationName = undefined) {
    const mutateData = await Mutator._popMutation(document, mutationName);
    await Mutator._updateDocument(document, mutateData.delta, {
      comparisonKeys: mutateData.comparisonKeys,
    });
  }

  static async mutate(mutation) {
    /* if not permanent, we need to create revert data */
    if (!mutation.permanent()) {
      mutation.updateMutationStack();
    }

    const binnedMutations = mutation.bin();

    const promises = binnedMutations.map((mut) => DocMutator.apply(mut));

    const results = await Promise.all(promises);

    return mutation.cleanup(results);
  }
}

/**
 * @type {{a: boolean, b: boolean, c: number}}
 */
var x = { a: true };
x.b = false;
