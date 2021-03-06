const decache = require('decache');
const request = require('supertest');


xdescribe('Graph server', function () {
    let server;

    beforeEach(function () {
        server = require('../src');
    });

    afterEach(function () {
        server.close();
        decache('../src');
    });

    it('returns PNG at /monitoring-location/<site-id>/', function (done) {
        request(server)
            .get('/monitoring-location/05370000/?parameterCode=00060')
            .expect('Content-Type', 'image/png')
            .expect(200, done);
    });
});
