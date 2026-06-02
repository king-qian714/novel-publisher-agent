const adapters = {};

function register(name, adapter) {
  adapters[name] = adapter;
}

function get(name) {
  const adapter = adapters[name];
  if (!adapter) throw new Error(`未知平台: ${name}`);
  return adapter;
}

function getDefault() {
  return get('fanqie');
}

function list() {
  return Object.values(adapters).map((a) => ({ name: a.name, displayName: a.displayName, defaultUrl: a.defaultUrl }));
}

register('fanqie', require('./fanqie'));
register('qimao', require('./qimao'));

module.exports = { register, get, getDefault, list };
