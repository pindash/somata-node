// Generated by CoffeeScript 1.12.4
var CONNECTION_LINGER_MS, CONNECTION_RETRY_MS, Client, Connection, EventEmitter, REGISTRY_HOST, REGISTRY_PORT, REGISTRY_PROTO, VERBOSE, emitters, helpers, log,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty,
  slice = [].slice;

Connection = require('./connection');

EventEmitter = require('events').EventEmitter;

helpers = require('./helpers');

log = helpers.log;

emitters = require('./events');

VERBOSE = parseInt(process.env.SOMATA_VERBOSE || 0);

REGISTRY_PROTO = process.env.SOMATA_REGISTRY_PROTO || 'tcp';

REGISTRY_HOST = process.env.SOMATA_REGISTRY_HOST || '127.0.0.1';

REGISTRY_PORT = process.env.SOMATA_REGISTRY_PORT || 8420;

CONNECTION_LINGER_MS = 1500;

CONNECTION_RETRY_MS = 2500;

Client = (function(superClass) {
  extend(Client, superClass);

  Client.prototype.subscriptions = {};

  Client.prototype.service_subscriptions = {};

  Client.prototype.service_connections = {};

  function Client(options) {
    if (options == null) {
      options = {};
    }
    Object.assign(this, options);
    this.connectToRegistry();
  }

  Client.prototype.connectToRegistry = function() {
    this.registry_connection = new Connection({
      proto: this.registry_proto || REGISTRY_PROTO,
      host: this.registry_host || REGISTRY_HOST,
      port: this.registry_port || REGISTRY_PORT,
      service: {
        id: 'registry~0',
        name: 'registry'
      }
    });
    return this.registry_connection.on('connect', this.registryConnected.bind(this));
  };

  Client.prototype.registryConnected = function() {
    this.connected_to_registry = true;
    this.registry_connection.subscribe('register', this.registeredService.bind(this));
    this.registry_connection.subscribe('deregister', this.deregisteredService.bind(this));
    return this.emit('registry_connected', true);
  };

  Client.prototype.registeredService = function(new_service) {
    if (VERBOSE > 1) {
      return log.d('[Client.registry_connection.register]', new_service);
    }
  };

  Client.prototype.deregisteredService = function(old_service) {
    if (VERBOSE > 1) {
      log.d('[Client.registry_connection.deregister]', old_service);
    }
    return delete this.service_connections[old_service.name];
  };

  Client.prototype.remote = function() {
    var args, cb, i, method, service;
    service = arguments[0], method = arguments[1], args = 4 <= arguments.length ? slice.call(arguments, 2, i = arguments.length - 1) : (i = 2, []), cb = arguments[i++];
    if (VERBOSE > 1) {
      log.d("[Client.remote] " + service + "." + method + "(" + args + ")");
    }
    return this.getConnection(service, (function(_this) {
      return function(err, connection) {
        if (connection != null) {
          return connection.method.apply(connection, [method].concat(slice.call(args), [cb]));
        } else {
          log.e("[Client.remote] No connection for " + service);
          return cb('No connection');
        }
      };
    })(this));
  };

  Client.prototype.subscribe = function() {
    var args, cb, i, id, service, service_name, subscription, type;
    service = arguments[0], type = arguments[1], args = 4 <= arguments.length ? slice.call(arguments, 2, i = arguments.length - 1) : (i = 2, []), cb = arguments[i++];
    if (arguments.length === 1) {
      subscription = arguments[0];
      id = subscription.id, service = subscription.service, type = subscription.type, args = subscription.args, cb = subscription.cb;
    }
    id || (id = helpers.randomString());
    if (!this.connected_to_registry) {
      setTimeout(((function(_this) {
        return function() {
          return _this.subscribe({
            id: id,
            service: service,
            type: type,
            args: args,
            cb: cb
          });
        };
      })(this)), 500);
      return;
    }
    if (typeof service === 'object') {
      service_name = service.name;
    } else {
      service_name = service.split('~')[0];
    }
    return this.getConnection(service_name, (function(_this) {
      return function(err, connection) {
        var _subscribe;
        if (connection != null) {
          if (VERBOSE) {
            log.i('[Client.subscribe]', {
              service: service,
              type: type,
              args: args
            });
          }
          subscription = {
            id: id,
            service: connection.service.id,
            kind: 'subscribe',
            type: type,
            args: args
          };
          if (connection.connected) {
            _this.sendSubscription(connection, subscription, cb);
          } else {
            connection.on('connect', function() {
              return _this.sendSubscription(connection, subscription, cb);
            });
          }
          return connection.on('timeout', function() {
            if (VERBOSE) {
              log.e("[Client.subscribe.connection.on timeout] " + (helpers.summarizeConnection(connection)));
            }
            delete _this.service_subscriptions[connection.service.id];
            return setTimeout(function() {
              return _this.subscribe.apply(_this, [service, type].concat(slice.call(args), [cb]));
            }, 500);
          });
        } else {
          log.e('[Client.subscribe] No connection');
          _subscribe = function() {
            return _this.subscribe.apply(_this, [service, type].concat(slice.call(args), [cb]));
          };
          return setTimeout(_subscribe, 1500);
        }
      };
    })(this));
  };

  Client.prototype.unsubscribe = function(subscription_id) {
    var subscription;
    if (subscription = this.subscriptions[subscription_id]) {
      return this.getConnection(subscription.service, function(err, connection) {
        if (connection != null) {
          if (VERBOSE) {
            log.w('[Client.unsubscribe]', subscription_id);
          }
          return connection.unsubscribe(subscription.type, subscription.id);
        }
      });
    }
  };

  Client.prototype.sendSubscription = function(connection, subscription, cb) {
    var base, eventCb, name;
    eventCb = function(message) {
      return cb(message.error || message.event, message);
    };
    delete subscription.cb;
    connection.send(subscription, eventCb);
    subscription.cb = cb;
    (base = this.service_subscriptions)[name = subscription.service.id] || (base[name] = []);
    this.service_subscriptions[subscription.service.id].push(subscription);
    return this.subscriptions[subscription.id] = subscription;
  };

  Client.prototype.getService = function(service_name, cb) {
    return this.registry_connection.method('getService', service_name, cb);
  };

  Client.prototype.getConnection = function(service_id, cb) {
    var connection, service_name;
    service_name = service_id.split('~')[0];
    if (service_name === 'registry') {
      return cb(null, this.registry_connection);
    } else if (connection = this.service_connections[service_name]) {
      return cb(null, connection);
    } else {
      return this.getService(service_name, (function(_this) {
        return function(err, service) {
          if (err || (service == null)) {
            return cb(err);
          }
          connection = new Connection({
            host: service.host,
            port: service.port,
            service: service
          });
          _this.service_connections[service_name] = connection;
          connection.on('timeout', function() {
            delete _this.service_connections[service_name];
            return connection.close();
          });
          return cb(null, connection);
        };
      })(this));
    }
  };

  Client.prototype.closeConnections = function() {
    var connection, ref, service_name;
    ref = this.service_connections;
    for (service_name in ref) {
      connection = ref[service_name];
      connection.close();
    }
    return this.registry_connection.close();
  };

  return Client;

})(EventEmitter);

module.exports = Client;
