/* eslint-env mocha */
/* eslint-disable capitalized-comments */

'use strict';

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line node/no-unpublished-require

const stubDb = require('../stub-db');
const stubLogger = require('../stub-logger');
const Service = require('../../src/service');
const Config = require('../../config');


describe('Service', function () {
  let service, options;
  let req, res, ctx;

  beforeEach(function () {
    options = new Config('test');
    service = new Service(stubLogger, stubDb, options);
    sinon.stub(service.manager);
    sinon.stub(service.sessionManager);
    sinon.stub(service.authenticator);
    sinon.stub(service, 'setResponseType');
    sinon.stub(service, 'serveFile');
    sinon.stub(service, 'ingestBody').resolves();
    req = {
      getHeader: sinon.stub(),
    };
    res = {
      setHeader: sinon.stub(),
      write: sinon.stub(),
      end: sinon.stub(),
    };
    ctx = {
      params: {},
    };
  });

  afterEach(function () {
    sinon.restore();
  });

  it('instantiates', function () {
    assert(service);
  });

  describe('maybeIngestBody', function () {
    beforeEach(function () {
      sinon.stub(service, 'bodyData');
      sinon.stub(service, 'parseBody').returns();
    });
    it('covers no body', async function() {
      service.bodyData.resolves();
      await service.maybeIngestBody(req, res, ctx);
    });
    it('covers body', async function() {
      service.bodyData.resolves('data');
      await service.maybeIngestBody(req, res, ctx);
    });
  }); // maybeIngestBody

  describe('handlerPostRoot', function () {
    it('covers public mode', async function () {
      await service.handlerPostRoot(req, res, ctx);
      assert(service.manager.postRoot.called);
    });
  }); // handlerPostRoot

  describe('handlerGetRoot', function () {
    it('covers', async function () {
      await service.handlerGetRoot(req, res, ctx);
      assert(service.manager.getRoot.called);
    });
  }); // handlerGetRoot

  describe('handlerGetHealthcheck', function () {
    it('covers', async function () {
      await service.handlerGetHealthcheck(req, res, ctx);
      assert(service.manager.getHealthcheck.called);
    });
    it('cover errors', async function () {
      const expectedException = 'blah';
      service.manager.getHealthcheck.rejects(expectedException);
      try {
        await service.handlerGetHealthcheck(req, res, ctx);
        assert.fail('did not get expected exception');
      } catch (e) {
        assert.strictEqual(e.name, expectedException, 'did not get expected exception');
      }
      assert(service.manager.getHealthcheck.called);
    });
  }); // handlerGetHealthcheck

  describe('handlerGetInfo', function () {
    it('covers', async function() {
      await service.handlerGetInfo(req, res, ctx);
      assert(service.manager.getInfo.called);
    });
  }); // handlerGetInfo

  describe('handlerGetAdminOverview', function () {
    it('covers', async function () {
      await service.handlerGetAdminOverview(req, res, ctx);
      assert(service.authenticator.sessionRequired.called);
      assert(service.manager.getAdminOverview.called);
    })
  }); // handlerGetAdminOverview

  describe('handlerGetAdminTopicDetails', function () {
    it('covers', async function () {
      await service.handlerGetAdminTopicDetails(req, res, ctx);
      assert(service.authenticator.sessionRequired.called);
      assert(service.manager.getTopicDetails.called);
    })
  }); // handlerGetAdminTopicDetails

  describe('handlerPostAdminProcess', function () {
    it('covers', async function () {
      service.serveFile.resolves();
      await service.handlerPostAdminProcess(req, res, ctx);
      assert(service.authenticator.apiRequiredLocal.called);
      assert(service.manager.processTasks.called);
    });
  }); // handlerPostAdminProcess

  describe('handlerUpdateTopic', function () {
    it('covers', async function () {
      sinon.stub(service, 'bodyData').resolves();
      await service.handlerUpdateTopic(req, res, ctx);
      assert(service.authenticator.apiRequiredLocal.called);
      assert(service.manager.updateTopic.called);
    });
  }); // handlerUpdateTopic

  describe('handlerUpdateSubscription', function () {
    it('covers', async function () {
      sinon.stub(service, 'bodyData').resolves();
      await service.handlerUpdateSubscription(req, res, ctx);
      assert(service.authenticator.apiRequiredLocal.called);
      assert(service.manager.updateSubscription.called);
    });
  }); // handlerUpdateSubscription

  describe('handlerGetAdminLogin', function () {
    it('covers', async function () {
      await service.handlerGetAdminLogin(req, res, ctx);
      assert(service.sessionManager.getAdminLogin.called);
    });
  }); // handlerGetAdminLogin

  describe('handlerPostAdminLogin', function () {
    it('covers', async function () {
      sinon.stub(service, 'bodyData').resolves();
      await service.handlerPostAdminLogin(req, res, ctx);
      assert(service.sessionManager.postAdminLogin.called);
    });
  }); // handlerPostAdminLogin

  describe('handlerGetAdminLogout', function () {
    it('covers', async function () {
      await service.handlerGetAdminLogout(req, res, ctx);
      assert(service.sessionManager.getAdminLogout.called);
    });
}); // handlerGetAdminLogout

  describe('handlerGetAdminIA', function () {
    it('covers', async function () {
      await service.handlerGetAdminIA(req, res, ctx);
      assert(service.sessionManager.getAdminIA.called);
    });
  }); // handlerGetAdminIA

});