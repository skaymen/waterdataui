
// Initialize the 18F Web design standards
require('uswds');

const { configureStore } = require('./store');



const COMPONENTS = {
    embed: require('./components/embed').attachToNode,
    hydrograph: require('./components/hydrograph').attachToNode,
    map: require('./components/map').attachToNode,
    floodSlider: require('./components/floodSlider').attachToNode
};


function main() {
    let nodes = document.getElementsByClassName('wdfn-component');
    let store = configureStore({
        windowWidth: window.innerWidth
    });
    for (let node of nodes) {
        COMPONENTS[node.dataset.component](store, node, node.dataset);
    }
}

if (document.readyState !== 'loading') {
    main();
} else {
    document.addEventListener('DOMContentLoaded', main, false);
}
