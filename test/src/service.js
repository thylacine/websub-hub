'use strict';

const assert = require('node:assert');
const sinon = require('sinon');

const stubDb = require('../stub-db');
const stubLogger = require('../stub-logger');
const Service = require('../../src/service');
const Config = require('../../config');
const { AsyncLocalStorage } = require('node:async_hooks');


describe('Service', function () {
  let service, options, asyncLocalStorage;
  let req, res, ctx;

  beforeEach(function () {
    asyncLocalStorage = new AsyncLocalStorage();
    options = new Config('test');
    service = new Service(stubLogger, stubDb, options, asyncLocalStorage);
    stubLogger._reset();
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

  describe('preHandler', function () {
    it('logs requestId', async function () {
      sinon.stub(service.__proto__.__proto__, 'preHandler').resolves();
      await service.asyncLocalStorage.run({}, async () => {
        await service.preHandler(req, res, ctx);
        const logObject = service.asyncLocalStorage.getStore();
        assert('requestId' in logObject);
      });
    });
    it('covers weird async context failure', async function () {
      sinon.stub(service.__proto__.__proto__, 'preHandler').resolves();
      sinon.stub(service.asyncLocalStorage, 'getStore').returns();
      await service.preHandler(req, res, ctx);
      assert(service.logger.debug.called);
    });
  }); // preHandler

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
    it('covers', async function () {
      await service.handlerGetInfo(req, res, ctx);
      assert(service.manager.getInfo.called);
    });
  }); // handlerGetInfo

  describe('handlerGetHistorySVG', function () {
    it('covers', async function () {
      await service.handlerGetHistorySVG(req, res, ctx);
      assert(service.manager.getHistorySVG.called);
    });
  }); // handlerGetHistorySVG

  describe('handlerGetAdminOverview', function () {
    it('covers authenticated', async function () {
      service.authenticator.sessionRequired.resolves(false);
      await service.handlerGetAdminOverview(req, res, ctx);
      assert(service.authenticator.sessionRequired.called);
      assert(service.manager.getAdminOverview.notCalled);
    });
    it('covers unauthenticated', async function () {
      service.authenticator.sessionRequired.resolves(true);
      await service.handlerGetAdminOverview(req, res, ctx);
      assert(service.authenticator.sessionRequired.called);
      assert(service.manager.getAdminOverview.called);
    });
  }); // handlerGetAdminOverview

  describe('handlerGetAdminTopicDetails', function () {
    it('covers unauthenticated', async function () {
      service.authenticator.sessionRequired.resolves(false);
      await service.handlerGetAdminTopicDetails(req, res, ctx);
      assert(service.authenticator.sessionRequired.called);
      assert(service.manager.getTopicDetails.notCalled);
    });
    it('covers authenticated', async function () {
      service.authenticator.sessionRequired.resolves(true);
      await service.handlerGetAdminTopicDetails(req, res, ctx);
      assert(service.authenticator.sessionRequired.called);
      assert(service.manager.getTopicDetails.called);
    });
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

  describe('handlerGetAdminSettings', function () {
    it('covers logged in', async function () {
      service.authenticator.sessionRequiredLocal.resolves(true);
      await service.handlerGetAdminSettings(req, res, ctx);
      assert(service.sessionManager.getAdminSettings.called);
    });
    it('covers not logged in', async function () {
      service.authenticator.sessionRequiredLocal.resolves(false);
      await service.handlerGetAdminSettings(req, res, ctx);
      assert(service.sessionManager.getAdminSettings.notCalled);
    });
  }); // handlerGetAdminSettings

  describe('handlerPostAdminSettings', function () {
    it('covers logged in', async function () {
      service.authenticator.sessionRequiredLocal.resolves(true);
      sinon.stub(service, 'bodyData').resolves();
      await service.handlerPostAdminSettings(req, res, ctx);
      assert(service.sessionManager.postAdminSettings.called);
    });
    it('covers logged outo', async function () {
      service.authenticator.sessionRequiredLocal.resolves(false);
      sinon.stub(service, 'bodyData').resolves();
      await service.handlerPostAdminSettings(req, res, ctx);
      assert(service.sessionManager.postAdminSettings.notCalled);
    });
  }); // handlerPostAdminSettings

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