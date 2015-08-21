var exec = require('cordova/exec');

module.exports = (function() {
  var Installation = Parse.Object.extend("_Installation");
  var installation = new Installation();
  var pushToken;
  var onNotification;

  var subscriptions = window.localStorage.getItem('subscriptions') || '[]';
  subscriptions = JSON.parse(subscriptions);

  function getAppName() {
    var promise = new Parse.Promise();
    exec(promise.resolve.bind(promise), promise.reject.bind(promise), 'ParseInstallation', 'getAppName', []);
    return promise;
  }
  
  function getPackageName() {
    var promise = new Parse.Promise();
    exec(promise.resolve.bind(promise), promise.reject.bind(promise), 'ParseInstallation', 'getPackageName', []);
    return promise;
  }

  function getVersionNumber() {
    var promise = new Parse.Promise();
    exec(promise.resolve.bind(promise), promise.reject.bind(promise), 'ParseInstallation', 'getVersionNumber', []);
    return promise;
  }

  function getTimeZone() {
    var promise = new Parse.Promise();
    exec(promise.resolve.bind(promise), promise.reject.bind(promise), 'ParseInstallation', 'getTimeZone', []);
    return promise;
  }

  function getToken(config) {
    var promise = new Parse.Promise();
    if (pushToken) {
      setTimeout(function() {
        promise.resolve(pushToken);
      });
    } else {
      exec(function (token) {
        console.log(token);
        if (token != 'OK') {
          pushToken = token;
        }

        // watting listenNotification if android
        var timeout = new Date().getTime();
        var nextLoop = function() {
          setTimeout(function () {
            if (pushToken || new Date().getTime() > timeout + 5 * 1000) {
              promise.resolve(pushToken);
            } else {
              nextLoop();
            }
          });
        };
        nextLoop();
      }, function() {
        console.log('error: failed to get token');
        promise.resolve();
      }, "PushPlugin", "register", [config]);
    }
    return promise;
  }

  function saveInstallation(config) {
    return Parse.Promise.when([
        Parse._getInstallationId(),
        getAppName(),
        getPackageName(),
        getVersionNumber(),
        getTimeZone(),
        getToken(config)
      ])
      .then(function(
        iid,
        appName,
        packageName,
        versionNumber,
        timeZone,
        token
      ) {
        installation.set('installationId', iid);
        installation.set('appName', appName);
        installation.set('appIdentifier', packageName);
        installation.set('appVersion', versionNumber);
        installation.set('timeZone', timeZone);
        installation.set('deviceToken', token);

        var platform = device.platform.toLowerCase();
        installation.set('deviceType', platform);
        if (platform === 'android') {
          installation.set('pushType', 'gcm');
          if (config.senderID !== 1076345567071) {
            installation.set('GCMSenderId', config.senderID);
          }
        }
        
        installation.set('parseVersion', Parse.VERSION);
        installation.set('channels', subscriptions);

        return installation.save();
      })
      .then(function(reply) {
        installation.id = reply.id;
        console.log('save installation: ' + reply.id + ', ' + reply.get('installationId'));
        
        return installation;
      }, function(err) {
        console.log('error installation: ', err.message);

        return;
      });
  }

  return {
    listenNotification: function (notification) {
      setTimeout(function() {
        if (notification.event && notification.event == 'registered') {
          if (notification.regid.length > 0 ) {
            pushToken = notification.regid;
          }
        } else {
          if (onNotification) {
            onNotification(notification);
          } else if (window.onNotification) {
            window.onNotification(notification);
          }
        }
      });
    },
    getCurrentInstallation: function() {
      return Parse.Promise.as(installation);
    },
    initialize: function (appId, appKey, config) {
      var promise = new Parse.Promise();

      Parse.initialize(appId, appKey);

      if (config.onNotification) {
        onNotification = config.onNotification;
      }
      
      config.ecb = 'ParseInstallation.listenNotification';

      var platform = device.platform.toLowerCase();
      if (platform === 'android') {
        config = config.android;
        if (!config.senderID) {
          config.senderID = 1076345567071;
        }
      } else if (platform === 'ios') {
        config = config.ios;
      } else {
        return promise.reject('Not suppert platform');
      }

      saveInstallation(config).then(promise.resolve, promise.reject);

      return promise;
    },
    getSubscriptions: function() {
      return Parse.Promise.as(subscriptions);
    },
    subscribe: function(channels) {
      if (typeof channels === 'string') {
        channels = [channels];
      }
      
      channels.forEach(function(item) {
        installation.addUnique("channels", item);
      });
      
      subscriptions = installation.get('channels');

      window.localStorage.setItem('subscriptions', JSON.stringify(subscriptions));

      if (installation.id) {
        installation.save();
      }
    },
    unsubscribe: function(channels) {
      if (typeof channels === 'string') {
        channels = [channels];
      }

      if (channels instanceof RegExp) {
        subscriptions = subscriptions.filter(function(subscription) {
          return !channels.test(subscription);
        });
      } else {
        channels.forEach(function(item) {
          subscriptions = subscriptions.filter(function(subscription) {
            return subscription !== item;
          });
        });
      }

      installation.set("channels", subscriptions);

      window.localStorage.setItem('subscriptions', JSON.stringify(subscriptions));

      if (installation.id) {
        installation.save();
      }
    }
  };
}).call(this);