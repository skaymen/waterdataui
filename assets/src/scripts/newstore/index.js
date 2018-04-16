
const findKey = require('lodash/findKey');
const last = require('lodash/last');
const { applyMiddleware, createStore, combineReducers, compose } = require('redux');
const { default: thunk } = require('redux-thunk');

const { getMedianStatistics, getPreviousYearTimeseries, getTimeseries,
    parseMedianData, sortedParameters } = require('../models');
const { normalize } = require('../schema');
const { fetchFloodFeatures, fetchFloodExtent } = require('../floodData');

const { floodDataReducer: floodData } = require('./floodDataReducer');
const { floodStateReducer: floodState } = require('./floodStateReducer');
const { seriesReducer: series } = require('./seriesReducer');
const { timeseriesStateReducer: timeseriesState } = require('./timeseriesStateReducer');
const { uiReducer: ui } = require('./uiReducer');

const GAGE_HEIGHT_CD = '00065';
/*
 * Helper functions
 */
const getLatestValue = function(collection, parmCd) {
    let parmVar = findKey(collection.variables, (varValue) => {
        return varValue.variableCode.value === parmCd;
    });
    let parmTimeSeries = findKey(collection.timeSeries, (ts) => {
        return ts.variable === parmVar;
    });
    let points = parmTimeSeries ? collection.timeSeries[parmTimeSeries].points : [];
    return points.length ? last(points).value : null;
};


/*
 * @param {Object} timeseries - keys are timeseries id
 * @param {Object} variables  - keys are the variable id
 */
const getCurrentVariableId = function(timeSeries, variables) {
    const tsVariables = Object.values(timeSeries)
        .filter((ts) => ts.points.length)
        .map((ts) => variables[ts.variable]);
    const sortedVars = sortedParameters(tsVariables);
    return sortedVars.length ? sortedVars[0].oid : '';
};


export const Actions = {
    retrieveTimeseries(siteno, params=null) {
        return function (dispatch) {
            const timeSeries = getTimeseries({sites: [siteno], params}).then(
                series => {
                    const collection = normalize(series, 'current');

                    // Get the start/end times of this request's range.
                    const notes = collection.queryInfo['current'].notes;
                    const endTime = notes.requestDT;
                    const startTime = new Date(endTime);
                    startTime.setDate(endTime.getDate() - notes['filter:timeRange'].periodDays);

                    // Trigger a call to get last year's data
                    dispatch(Actions.retrieveCompareTimeseries(siteno, startTime, endTime));

                    // Update the series data for the 'current' series
                    dispatch(Actions.addSeriesCollection('current', collection));

                    // Update the application state
                    dispatch(Actions.toggleTimeseries('current', true));
                    dispatch(Actions.setCurrentVariable(
                        getCurrentVariableId(series.timeseries || {}, series.variables || {})
                    ));
                    dispatch(Actions.setGageHeight(getLatestValue(collection, GAGE_HEIGHT_CD)));

                    return {collection, startTime, endTime};
                },
                () => {
                    dispatch(Actions.resetTimeseries('current'));
                    dispatch(Actions.toggleTimeseries('current', false));
                    return {
                        collection: null,
                        startTime: null,
                        endTime: null
                    };
                }
            );
            const medianStatistics = getMedianStatistics({sites: [siteno]});
            return Promise.all([timeSeries, medianStatistics]).then(([{collection, startTime, endTime}, stats]) => {
                let medianCollection = parseMedianData(stats, startTime, endTime, collection && collection.variables ? collection.variables : {});
                dispatch(Actions.addSeriesCollection('median', medianCollection));
                dispatch(Actions.toggleTimeseries('median', true));
            });
        };
    },
    retrieveCompareTimeseries(site, startTime, endTime) {
        return function (dispatch) {
            return getPreviousYearTimeseries({site, startTime, endTime}).then(
                series => {
                    const collection = normalize(series, 'compare');
                    dispatch(Actions.addSeriesCollection('compare', collection));
                    dispatch(Actions.toggleTimeseries('compare', false));
                },
                () => dispatch(Actions.resetTimeseries('compare'))
            );
        };
    },
    retrieveFloodData(siteno) {
        return function (dispatch) {
            const floodFeatures = fetchFloodFeatures(siteno);
            const floodExtent = fetchFloodExtent(siteno);
            return Promise.all([floodFeatures, floodExtent]).then((data) => {
                const [features, extent] = data;
                const stages = features.map((feature) => feature.attributes.STAGE).sort(function (a, b) {
                    return a - b;
                });
                dispatch(Actions.setFloodFeatures(stages, stages.length ? extent.extent : {}));
            });
        };
    },
    startTimeseriesPlay(maxCursorOffset) {
        return function (dispatch, getState) {
            let state = getState();
            if (state.cursorOffset == null || state.cursorOffset >= maxCursorOffset) {
                dispatch(Actions.setCursorOffset(0));
            }
            if (!state.playId) {
                let play = function () {
                    let newOffset = getState().cursorOffset + 15 * 60 * 1000;
                    if (newOffset > maxCursorOffset) {
                        dispatch(Actions.stopTimeseriesPlay());
                    } else {
                        dispatch(Actions.setCursorOffset(newOffset));
                    }
                };
                let playId = window.setInterval(play, 10);
                dispatch(Actions.timeseriesPlayOn(playId));
            }
        };
    },
    stopTimeseriesPlay() {
        return function(dispatch, getState) {
            window.clearInterval(getState().playId);
            dispatch(Actions.timeseriesPlayStop());
        };
    },
    timeseriesPlayOn(playId) {
        return {
            type: 'TIMESERIES_PLAY_ON',
            playId
        };
    },
    timeseriesPlayStop() {
        return {
            type: 'TIMESERIES_PLAY_STOP'
        };
    },
    setFloodFeatures(stages, extent) {
        return {
            type: 'SET_FLOOD_FEATURES',
            stages,
            extent
        };
    },
    toggleTimeseries(key, show) {
        return {
            type: 'TOGGLE_TIMESERIES',
            key,
            show
        };
    },
    addSeriesCollection(key, data) {
        return {
            type: 'ADD_TIMESERIES_COLLECTION',
            key,
            data
        };
    },
    resetTimeseries(key) {
        return {
            type: 'RESET_TIMESERIES',
            key
        };
    },
    showMedianStatsLabel(show) {
        return {
            type: 'SHOW_MEDIAN_STATS_LABEL',
            show
        };
    },
    setCursorOffset(cursorOffset) {
        return {
            type: 'SET_CURSOR_OFFSET',
            cursorOffset
        };
    },
    resizeUI(windowWidth, width) {
        return {
            type: 'RESIZE_UI',
            windowWidth,
            width
        };
    },
    setCurrentVariable(variableID) {
        return {
            type: 'SET_CURRENT_VARIABLE',
            variableID
        };
    },
    setGageHeight(gageHeight) {
        return {
            type: 'SET_GAGE_HEIGHT',
            gageHeight
        };
    }
};

const appReducer = combineReducers({
    series,
    floodData,
    timeseriesState,
    floodState,
    ui
});

const MIDDLEWARES = [thunk];


export const configureStore = function (initialState) {
    initialState = {
        series: {},
        floodData: {
            stages: [],
            extent: {}
        },

        timeseriesState: {
            showSeries: {
                current: true,
                compare: false,
                median: false
            },
            currentVariableID: null,
            showMedianStatsLabel: false,
            cursorOffset: null,
            audiblePlayId: null
        },
        floodState: {
            gageHeight: null
        },
        ui : {
            windowWidth: 1024,
            width: 800
        },
        ...initialState
    };

    let enhancers;
    if (window.__REDUX_DEVTOOLS_EXTENSION__) {
        enhancers = compose(
            applyMiddleware(...MIDDLEWARES),
            window.__REDUX_DEVTOOLS_EXTENSION__({serialize: true})
        );
    } else {
        enhancers = applyMiddleware(...MIDDLEWARES);
    }

    return createStore(
        appReducer,
        initialState,
        enhancers
    );
};