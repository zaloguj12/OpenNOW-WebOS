/**
 * Micro ES5 Promise Polyfill for older webOS TV browser engines
 */
if (typeof Promise === 'undefined') {
  (function(exports) {
    function Promise(fn) {
      if (!(this instanceof Promise)) return new Promise(fn);
      this._state = 0; // 0: pending, 1: resolved, 2: rejected
      this._value = undefined;
      this._deferreds = [];
      
      var self = this;
      try {
        fn(function(val) { self._resolve(val); }, function(err) { self._reject(err); });
      } catch (e) {
        self._reject(e);
      }
    }
    
    Promise.prototype._resolve = function(val) {
      if (this._state !== 0) return;
      if (val && (typeof val === 'object' || typeof val === 'function') && typeof val.then === 'function') {
        var self = this;
        try {
          val.then(function(v) { self._resolve(v); }, function(e) { self._reject(e); });
          return;
        } catch (e) {
          this._reject(e);
          return;
        }
      }
      this._state = 1;
      this._value = val;
      this._handle();
    };
    
    Promise.prototype._reject = function(err) {
      if (this._state !== 0) return;
      this._state = 2;
      this._value = err;
      this._handle();
    };
    
    Promise.prototype._handle = function() {
      if (this._state === 0) return;
      var self = this;
      setTimeout(function() {
        while (self._deferreds.length) {
          var deferred = self._deferreds.shift();
          var cb = self._state === 1 ? deferred.onFulfilled : deferred.onRejected;
          if (!cb) {
            if (self._state === 1) {
              deferred.promise._resolve(self._value);
            } else {
              deferred.promise._reject(self._value);
            }
            continue;
          }
          try {
            var ret = cb(self._value);
            deferred.promise._resolve(ret);
          } catch (e) {
            deferred.promise._reject(e);
          }
        }
      }, 0);
    };
    
    Promise.prototype.then = function(onFulfilled, onRejected) {
      var deferred = {
        onFulfilled: typeof onFulfilled === 'function' ? onFulfilled : null,
        onRejected: typeof onRejected === 'function' ? onRejected : null,
        promise: new Promise(function() {})
      };
      this._deferreds.push(deferred);
      this._handle();
      return deferred.promise;
    };
    
    Promise.prototype['catch'] = function(onRejected) {
      return this.then(null, onRejected);
    };
    
    Promise.resolve = function(val) {
      return new Promise(function(resolve) { resolve(val); });
    };
    
    Promise.reject = function(err) {
      return new Promise(function(resolve, reject) { reject(err); });
    };
    
    Promise.all = function(arr) {
      return new Promise(function(resolve, reject) {
        if (!arr || arr.length === 0) return resolve([]);
        var remaining = arr.length;
        var results = new Array(remaining);
        
        function resolver(index) {
          return function(value) {
            results[index] = value;
            if (--remaining === 0) {
              resolve(results);
            }
          };
        }
        
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] && typeof arr[i].then === 'function') {
            arr[i].then(resolver(i), reject);
          } else {
            results[i] = arr[i];
            if (--remaining === 0) {
              resolve(results);
            }
          }
        }
      });
    };

    exports.Promise = Promise;
  })(window);
}
