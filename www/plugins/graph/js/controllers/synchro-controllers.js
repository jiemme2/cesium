
angular.module('cesium.graph.synchro.controllers', ['chart.js', 'cesium.graph.services', 'cesium.graph.common.controllers'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    $stateProvider
      .state('app.doc_synchro_lg', {
        url: "/data/synchro?stepUnit&t&hide&scale",
        views: {
          'menuContent': {
            templateUrl: "plugins/graph/templates/synchro/view_stats.html",
            controller: "GpSynchroCtrl"
          }
        }
      });

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // TODO: add buttons to link with doc stats
    }
  })


  .controller('GpSynchroCtrl', GpSynchroController)
;

function GpSynchroController($scope, $controller, $q, $translate, gpColor, gpData, $filter) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('GpCurrencyAbstractCtrl', {$scope: $scope}));

  $scope.hiddenDatasets = [];

  $scope.charts = [

    // User count
    {
      id: 'user',
      title: 'GRAPH.SYNCHRO.EXECUTION.TITLE',
      series: [
        {
          key: 'inserts',
          label: 'GRAPH.SYNCHRO.EXECUTION.INSERTS',
          color: gpColor.rgba.royal(1),
          pointHoverBackgroundColor: gpColor.rgba.royal(1)
        },
        {
          key: 'updates',
          label: 'GRAPH.SYNCHRO.EXECUTION.UPDATES',
          color: gpColor.rgba.calm(1),
          pointHoverBackgroundColor: gpColor.rgba.calm(1)
        },
        {
          key: 'deletes',
          label: 'GRAPH.SYNCHRO.EXECUTION.DELETES',
          color: gpColor.rgba.assertive(0.5),
          pointHoverBackgroundColor: gpColor.rgba.assertive(1)
        }
      ]
    }
  ];

  var formatInteger = $filter('formatInteger');

  $scope.defaultChartOptions = {
    responsive: true,
    maintainAspectRatio: $scope.maintainAspectRatio,
    title: {
      display: true
    },
    legend: {
      display: true,
      onClick: $scope.onLegendClick
    },
    scales: {
      yAxes: [
        {
          stacked: true,
          id: 'y-axis'
        }
      ]
    },
    tooltips: {
      enabled: true,
      mode: 'index',
      callbacks: {
        label: function(tooltipItems, data) {
          return data.datasets[tooltipItems.datasetIndex].label +
            ': ' + formatInteger(tooltipItems.yLabel);
        }
      }
    }
  };

  $scope.init = function(e, state) {
    if (state && state.stateParams) {
      // Manage URL parameters
    }
  };

  $scope.load = function(updateTimePct) {

    return $q.all([
      // Get i18n keys (chart title, series labels, date patterns)
      $translate($scope.charts.reduce(function(res, chart) {
        return res.concat(chart.series.reduce(function(res, serie) {
          return res.concat(serie.label);
        }, [chart.title]));
      }, [
        'COMMON.DATE_PATTERN',
        'COMMON.DATE_SHORT_PATTERN',
        'COMMON.DATE_MONTH_YEAR_PATTERN'
      ])),

      // get Data
      gpData.synchro.execution.get($scope.formData)
    ])
    .then(function(result) {
      var translations = result[0];
      var datePatterns = {
        hour: translations['COMMON.DATE_PATTERN'],
        day: translations['COMMON.DATE_SHORT_PATTERN'],
        month: translations['COMMON.DATE_MONTH_YEAR_PATTERN']
      };

      result = result[1];
      console.log("TODO", result);
      if (!result || !result.times) return; // no data
      $scope.times = result.times;

      // Labels
      var labelPattern = datePatterns[$scope.formData.rangeDuration];
      $scope.labels = result.times.reduce(function(res, time) {
        return res.concat(moment.unix(time).local().format(labelPattern));
      }, []);

      // Update range options with received values
      $scope.updateRange(result.times[0], result.times[result.times.length-1], updateTimePct);

      $scope.setScale($scope.scale);

      // For each chart
      _.forEach($scope.charts, function(chart){

        // Data
        chart.data = [];
        _.forEach(chart.series, function(serie){
          chart.data.push(result[serie.key]||[]);
        });

        // Options (with title)
        chart.options = angular.copy($scope.defaultChartOptions);
        chart.options.title.text = translations[chart.title];

        // Series datasets
        chart.datasetOverride = chart.series.reduce(function(res, serie) {
          return res.concat({
            yAxisID: 'y-axis',
            type: 'bar',
            label: translations[serie.label],
            fill: true,
            borderColor: serie.color,
            borderWidth: 2,
            backgroundColor: serie.color,
            pointBackgroundColor: serie.color,
            pointBorderColor: gpColor.rgba.white(),
            pointHoverBackgroundColor: serie.pointHoverBackgroundColor||serie.color,
            pointHoverBorderColor: gpColor.rgba.translucent(),
            pointRadius: 3
          });
        }, []);
      });
    });

  };

  $scope.onChartClick = function(data, e, item) {
    if (!item) return;
    console.log('Click on item index='+ item._index);
    var from = $scope.times[item._index];
    var to = moment.unix(from).utc().add(1, $scope.formData.rangeDuration).unix();
  };


}