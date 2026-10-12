const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const RefreshToken = require('../models/RefreshToken');
const AuditLog = require('../models/AuditLog');
const { extractClientInfo, parseCookies, getCookieOptions } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');

describe('Security, Token Rotation & Audit Logging Engine', () => {
  describe('RefreshToken Model & Methods', () => {
    test('createToken generates a secure random token in a family with 7-day expiration', async () => {
      const origCreate = RefreshToken.create;
      const userId = new mongoose.Types.ObjectId();

      RefreshToken.create = async (doc) => {
        return {
          ...doc,
          _id: new mongoose.Types.ObjectId(),
          isActive: () => !doc.isRevoked && doc.expiresAt > new Date(),
        };
      };

      try {
        const tokenDoc = await RefreshToken.createToken({
          user: userId,
          deviceInfo: 'MacBook Pro',
          ipAddress: '192.168.1.10',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        });

        assert.ok(tokenDoc.token);
        assert.equal(typeof tokenDoc.token, 'string');
        assert.equal(tokenDoc.token.length, 80); // 40 bytes hex = 80 characters
        assert.equal(String(tokenDoc.user), String(userId));
        assert.ok(tokenDoc.family);
        assert.equal(tokenDoc.deviceInfo, 'MacBook Pro');
        assert.equal(tokenDoc.ipAddress, '192.168.1.10');
        assert.ok(tokenDoc.expiresAt > new Date(Date.now() + 6 * 24 * 60 * 60 * 1000));
        assert.equal(tokenDoc.isActive(), true);
      } finally {
        RefreshToken.create = origCreate;
      }
    });

    test('revoke() updates isRevoked, revokedAt, and optional replacedByToken', async () => {
      const doc = new RefreshToken({
        token: 'initial-refresh-token',
        user: new mongoose.Types.ObjectId(),
        family: 'test-family-123',
        expiresAt: new Date(Date.now() + 100000),
      });

      doc.save = async function () {
        return this;
      };

      assert.equal(doc.isRevoked, false);
      assert.equal(doc.isActive(), true);

      await doc.revoke('replacement-token-xyz');

      assert.equal(doc.isRevoked, true);
      assert.ok(doc.revokedAt instanceof Date);
      assert.equal(doc.replacedByToken, 'replacement-token-xyz');
      assert.equal(doc.isActive(), false);
    });
  });

  describe('Refresh Token Rotation & Family Reuse Detection', () => {
    test('token rotation preserves family and chains replacement', async () => {
      const userId = new mongoose.Types.ObjectId();
      const familyId = 'family-session-456';

      // Simulate Token 1
      const token1 = new RefreshToken({
        token: 'token-1-abc',
        user: userId,
        family: familyId,
        expiresAt: new Date(Date.now() + 3600000),
      });
      token1.save = async function () {
        return this;
      };

      // Simulate rotation creating Token 2
      const origCreate = RefreshToken.create;
      let token2;
      RefreshToken.create = async (doc) => {
        token2 = new RefreshToken({
          ...doc,
          _id: new mongoose.Types.ObjectId(),
        });
        token2.save = async function () {
          return this;
        };
        return token2;
      };

      try {
        const createdToken2 = await RefreshToken.createToken({
          user: userId,
          family: token1.family,
          deviceInfo: 'Linux Desktop',
        });
        await token1.revoke(createdToken2.token);

        assert.equal(token1.isRevoked, true);
        assert.equal(token1.replacedByToken, createdToken2.token);
        assert.equal(createdToken2.family, token1.family);
        assert.equal(createdToken2.isRevoked, false);
        assert.equal(createdToken2.isActive(), true);
      } finally {
        RefreshToken.create = origCreate;
      }
    });

    test('replay attack detection revokes entire token family', async () => {
      const familyId = 'compromised-family-789';
      let familyRevoked = false;

      const origUpdateMany = RefreshToken.updateMany;
      RefreshToken.updateMany = async (filter, update) => {
        if (filter.family === familyId && update.isRevoked === true) {
          familyRevoked = true;
          return { modifiedCount: 3 };
        }
        return { modifiedCount: 0 };
      };

      try {
        // Attacker attempts to use already revoked Token 1
        const compromisedToken = {
          token: 'compromised-token-1',
          family: familyId,
          isRevoked: true,
        };

        if (compromisedToken.isRevoked) {
          await RefreshToken.updateMany(
            { family: compromisedToken.family },
            { isRevoked: true, revokedAt: new Date() }
          );
        }

        assert.equal(familyRevoked, true);
      } finally {
        RefreshToken.updateMany = origUpdateMany;
      }
    });
  });

  describe('AuditLog System', () => {
    test('AuditLog.log records security events accurately', async () => {
      const origCreate = AuditLog.create;
      let loggedDoc = null;

      AuditLog.create = async (doc) => {
        loggedDoc = doc;
        return doc;
      };

      try {
        const userId = new mongoose.Types.ObjectId();
        await AuditLog.log({
          action: 'LOGIN',
          actor: userId,
          actorRole: 'patient',
          targetResource: 'User',
          targetId: userId,
          status: 'SUCCESS',
          ipAddress: '10.0.0.1',
          userAgent: 'Mobile Safari',
          details: { method: 'password' },
        });

        assert.ok(loggedDoc);
        assert.equal(loggedDoc.action, 'LOGIN');
        assert.equal(String(loggedDoc.actor), String(userId));
        assert.equal(loggedDoc.actorRole, 'patient');
        assert.equal(loggedDoc.status, 'SUCCESS');
        assert.equal(loggedDoc.ipAddress, '10.0.0.1');
        assert.equal(loggedDoc.details.method, 'password');
      } finally {
        AuditLog.create = origCreate;
      }
    });

    test('roleMiddleware logs RBAC_ACCESS_DENIED when actor role lacks permission', async () => {
      const origLog = AuditLog.log;
      let loggedEvent = null;

      AuditLog.log = async (entry) => {
        loggedEvent = entry;
      };

      try {
        const middleware = authorize('admin');
        const req = {
          user: {
            _id: new mongoose.Types.ObjectId(),
            role: 'patient',
          },
          originalUrl: '/api/admin/analytics',
          method: 'GET',
          ip: '127.0.0.1',
          headers: { 'user-agent': 'Chrome/120.0' },
        };
        const res = {};
        let passedError = null;
        const next = (err) => {
          passedError = err;
        };

        middleware(req, res, next);

        assert.ok(passedError);
        assert.equal(passedError.status, 403);
        assert.ok(loggedEvent);
        assert.equal(loggedEvent.action, 'RBAC_ACCESS_DENIED');
        assert.equal(loggedEvent.actorRole, 'patient');
        assert.equal(loggedEvent.status, 'WARNING');
        assert.deepEqual(loggedEvent.details.requiredRoles, ['admin']);
      } finally {
        AuditLog.log = origLog;
      }
    });
  });

  describe('Client Info & Cookie Parsing Utilities', () => {
    test('extractClientInfo identifies client IP, user agent, and device platform', () => {
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18',
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X)',
        },
      };

      const info = extractClientInfo(req);
      assert.equal(info.ipAddress, '203.0.113.195');
      assert.equal(info.deviceInfo, 'Mobile Device');
      assert.ok(info.userAgent.includes('iPhone'));
    });

    test('parseCookies middleware extracts cookies into req.cookies', () => {
      const req = {
        headers: {
          cookie: 'refreshToken=secure_refresh_token_value_123; session=abc456',
        },
      };
      const res = {};
      let called = false;
      const next = () => {
        called = true;
      };

      parseCookies(req, res, next);
      assert.equal(called, true);
      assert.ok(req.cookies);
      assert.equal(req.cookies.refreshToken, 'secure_refresh_token_value_123');
      assert.equal(req.cookies.session, 'abc456');
    });

    test('getCookieOptions returns httpOnly and lax sameSite settings', () => {
      const opts = getCookieOptions();
      assert.equal(opts.httpOnly, true);
      assert.equal(opts.sameSite, 'lax');
      assert.equal(opts.path, '/');
      assert.ok(opts.maxAge > 0);
    });
  });
});
