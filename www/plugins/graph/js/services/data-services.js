angular.module('cesium.graph.data.services', ['cesium.wot.services', 'cesium.es.http.services'])

  .factory('gpData', function($rootScope, $q, $timeout, esHttp, BMA, csWot, csCache) {
    'ngInject';

    var
      currencyCache = csCache.get('gpData-icurrency-', csCache.constants.SHORT),
      exports = {
        blockchain: {},
        util: {
          colors: {
          }
        },
        raw: {
          block: {
            search: esHttp.post('/:currency/block/_search')
          }
        },
        regex: {
        }
      };

    /**
     * Compute colors scale
     * @param count
     * @param opacity
     * @param startColor
     * @param startState
     * @returns {Array}
     */
    exports.util.colors.custom = function(count, opacity, startColor, startState) {

      function _state2side(state) {
        switch(state) {
          case 0:
            return 0;
          case 1:
            return -1;
          case 2:
            return 0;
          case 3:
            return 1;
        }
      }

      // From [0,1]
      opacity = opacity || '0.55';

      var defaultStateSize = Math.round(count / 4/*=4 states max*/);

      // Start color [r,v,b]
      var color = startColor ? angular.copy(startColor) : [255,0,0]; // Red

      // Colors state: 0=keep, 1=decrease, 2=keep, 3=increase
      var states = startState ? angular.copy(startState) : [0,2,3]; // R=keep, V=keep, B=increase

      var steps = startColor ? [
        Math.round(255 / defaultStateSize),
        Math.round(255 / defaultStateSize),
        Math.round(255 / defaultStateSize)
      ] : [
        Math.round((color[0]-50) / defaultStateSize),
        Math.round((255-color[1]) / defaultStateSize),
        Math.round((255-color[2]) / defaultStateSize)
      ];


      // Compute start sides (1=increase, 0=flat, -1=decrease)
      var sides = [
        _state2side(states[0]),
        _state2side(states[1]),
        _state2side(states[2])];

      // Use to detect when need to change a 'flat' state (when state = 0 or 2)
      var stateCounters  = [0,0,0];

      var result = [];
      for (var i = 0; i<count; i++) {
        for (var j=0; j<3;j++) {
          color[j] +=  sides[j] * steps[j];
          stateCounters[j]++;
          // color has reach a limit
          if (((color[j] <= 0 || color[j] >= 255) && sides[j] !== 0) ||
            (sides[j] === 0 && stateCounters[j] == defaultStateSize)) {
            // Max sure not overflow limit
            if (color[j] <= 0) {
              color[j] = 0;
            }
            else if (color[j] >= 255) {
              color[j] = 255;
            }
            // Go to the next state, in [0..3]
            states[j] = (states[j] + 1) % 4;

            // Update side from this new state
            sides[j] = _state2side(states[j]);

            // Reset state counter
            stateCounters[j] = 0;
          }
        }

        // Add the color to result
        result.push('rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ',' + opacity+')');

      }
      return result;
    };

    exports.util.colors.default = function() {
      return exports.util.colors.custom(25);
    };

    /**
     * Graph: "blocks count by issuer"
     * @param currency
     * @returns {*}
     */
    exports.blockchain.countByIssuer = function(currency) {

      var request = {
        size: 0,
        aggs: {
          blocksByIssuer: {
            terms: {
              field: 'issuer',
              size: 0
            }
          }
        }
      };

      return exports.raw.block.search(request, {currency: currency})
        .then(function(res) {
          var aggs = res.aggregations;
          if (!aggs.blocksByIssuer || !aggs.blocksByIssuer.buckets || !aggs.blocksByIssuer.buckets.length) return;

          var result = {
            blockCount: res.hits.total
          };
          result.data = (aggs.blocksByIssuer.buckets || []).reduce(function(res, agg) {
              return res.concat(agg.doc_count);
            }, []);
          result.issuers = (aggs.blocksByIssuer.buckets || []).reduce(function(res, agg) {
            return res.concat({pubkey: agg.key});
          }, []);

          return csWot.extendAll(result.issuers)
            .then(function() {
              // Set labels, using name, uid or pubkey
              result.labels = result.issuers.reduce(function(res, issuer) {
                return res.concat(issuer.name || issuer.uid || issuer.pubkey.substr(0,8));
              }, []);
              return result;
            });
        });
      };

    /**
     * All block with dividend
     * @param currency
     * @returns {*}
     */
    exports.blockchain.withDividend = function(currency, options) {
      options = options || {};
      var withCache = angular.isDefined(options.withCache) ? options.withCache : true; // enable by default

      var cachekKey = [currency, JSON.stringify(options)].join('-');
      if (withCache) {
        var result = currencyCache.get(cachekKey);
        if (result) {
          // should be already a promise (previous call still running)
          if (!result.blocks) {
            var deferred = $q.defer();
            result.then(function(res) {
              console.debug("[graph] monetaryMass for [" + currency + "] waiting previous call", res);
              deferred.resolve(res);
              return res;
            });
            return deferred.promise;
          }
          console.debug("[graph] monetaryMass for [" + currency + "] found in cache");
          return $q.when(result);
        }
      }

      var request = {
        query: {
          filtered: {
            filter: {
              bool: {
                must: [
                  {
                    exists: {
                      field: 'dividend'
                    }
                  }
                ]
              }
            }
          }
        },
        size: options.size || 10000,
        from: options.from || 0,
        _source: ["medianTime", "number", "dividend", "monetaryMass", "membersCount"],
        sort: {
          "medianTime" : "asc"
        }
      };

      var promise = exports.raw.block.search(request, {currency: currency})
        .then(function(res) {
          if (!res.hits.total || !res.hits.hits.length) return;

          var result = {};
          result.blocks = res.hits.hits.reduce(function(res, hit){
            return res.concat(hit._source);
          }, []);
          result.labels = res.hits.hits.reduce(function(res, hit){
            return res.concat(hit._source.medianTime);
          }, []);

          // replace promise in cache, with data
          currencyCache.put(cachekKey, result);
          return result;
        });
      currencyCache.put(cachekKey, promise);

      return promise;
    };

    /**
     * Graph: "tx count"
     * @param currency
     * @returns {*}
     */
    exports.blockchain.txCount = function(currency, options) {
      var ranges = [];
      var sliceSize = 24*60*60*2;
      var now = esHttp.date.now();
      var start = now - (30.4375 * sliceSize);
      for (var i = start; i <= now; i=i+sliceSize) {
        ranges.push({
          from: i,
          to: i + sliceSize
        });
      }

      var request = {
        size: 0,
        aggs: {
          txCount: {
            range: {
              field: "medianTime",
              ranges: ranges
            },
            aggs: {
              tx_stats : {
                stats: {
                  script : {
                    inline: "txcount",
                    lang: "native"
                  }
                }
              }
            }

          }
        }
      };


      return exports.raw.block.search(request, {currency: currency})
        .then(function(res) {
          var aggs = res.aggregations;
          if (!aggs.txCount || !aggs.txCount.buckets || !aggs.txCount.buckets.length) return;

          var result = {};
          var started = false;
          result.data = (aggs.txCount.buckets || []).reduce(function(res, agg) {
            if (!started) {
              started = agg.tx_stats.count > 0;
            }
            return started ? res.concat(agg.tx_stats.sum) : res;
          }, []);
          result.labels = (aggs.txCount.buckets || []).reduce(function(res, agg) {
            return res.concat(agg.to);
          }, []);
          return result;
        });
    };


    return exports;
  })
;