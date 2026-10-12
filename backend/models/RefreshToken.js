const mongoose = require('mongoose');
const crypto = require('crypto');

const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    family: {
      type: String,
      required: true,
      index: true,
    },
    deviceInfo: {
      type: String,
      default: 'Unknown Device',
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    replacedByToken: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

/** Generate a cryptographically secure random token string */
refreshTokenSchema.statics.generateTokenString = function () {
  return crypto.randomBytes(40).toString('hex');
};

/** Create a new refresh token document in a new or existing family */
refreshTokenSchema.statics.createToken = async function ({
  user,
  family,
  deviceInfo,
  ipAddress,
  userAgent,
  expiresInDays = 7,
}) {
  const tokenString = this.generateTokenString();
  const tokenFamily = family || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const tokenDoc = await this.create({
    token: tokenString,
    user,
    family: tokenFamily,
    deviceInfo: deviceInfo || 'Unknown Device',
    ipAddress: ipAddress || '',
    userAgent: userAgent || '',
    expiresAt,
  });

  return tokenDoc;
};

/** Mark token as revoked, optionally linking to the replacement token */
refreshTokenSchema.methods.revoke = async function (replacedBy = null) {
  this.isRevoked = true;
  this.revokedAt = new Date();
  if (replacedBy) {
    this.replacedByToken = replacedBy;
  }
  return this.save();
};

/** Check if token is active and unexpired */
refreshTokenSchema.methods.isActive = function () {
  return !this.isRevoked && this.expiresAt > new Date();
};

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
