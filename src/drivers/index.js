import mutators from './mutators';
import spawners from './spawners';

export default {
  LocalMutator: mutators.LocalMutator,
  LocalSpawner: spawners.LocalSpawner,
  abstract: {
    ...mutators.abstract,
    ...spawners.abstract,
  },
};
